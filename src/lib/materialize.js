import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runGit } from './git.js';
import { BOM_RE } from './assets.js';

// ── Materialización: copia los assets del vault a carpetas .claude/ ───────────
//
// Las copias son desechables y la fuente vive en el vault. El manifiesto
// (.claude/.mempunk-managed.json) registra el hash de cada archivo escrito por
// Mempunk; con él se distingue "copia sin tocar" (se actualiza o borra) de
// "editada a mano" o "archivo del usuario" (conflicto: nunca se pisa).
//
// El .claude/ de un repo clonado lo controla quien controla el repo: el
// manifiesto solo puede nombrar rutas skills/<n>/… o agents/<n>.md y nunca se
// escribe a través de symlinks.

export const MANIFEST_FILE = '.mempunk-managed.json';

const EXCLUDE_TAG = '# >>> mempunk (managed — do not edit)';
const EXCLUDE_END = '# <<< mempunk <<<';

const GIT_TIMEOUT_MS = 10_000;

// Únicas rutas que Mempunk gestiona dentro de .claude/
const MANAGED_REL_RE = /^(?:skills\/[a-z0-9][a-z0-9-]*\/[^\\]+|agents\/[a-z0-9][a-z0-9-]*\.md)$/;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hashFile(file) {
  try { return sha256(fs.readFileSync(file)); } catch (_) { return null; }
}

/** Archivos de un directorio (recursivo), relativos con '/' */
function listFilesRecursive(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFilesRecursive(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/** Archivos que produce un asset: [{ rel (bajo .claude/), src }] */
function assetFiles(asset) {
  if (asset.kind === 'agent') return [{ rel: `agents/${asset.name}.md`, src: asset.source }];
  return listFilesRecursive(asset.source).map((f) => ({
    rel: `skills/${asset.name}/${f}`,
    src: path.join(asset.source, ...f.split('/')),
  }));
}

/** Prefijo de rutas (bajo .claude/) que ocupa un asset */
function assetPrefix(kind, name) {
  return kind === 'agent' ? `agents/${name}.md` : `skills/${name}/`;
}

/**
 * Lee el manifiesto. Corrupto → vacío + aviso: tratar todo como no gestionado
 * es lo seguro (genera conflictos en vez de borrar archivos ajenos). Entradas
 * fuera de skills/ y agents/ se descartan.
 */
function readManifest(claudeDir, warnings) {
  const file = path.join(claudeDir, MANIFEST_FILE);
  if (!fs.existsSync(file)) return { exists: false, files: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(BOM_RE, ''));
    const raw = parsed && typeof parsed.files === 'object' && parsed.files ? parsed.files : {};
    const files = {};
    for (const [rel, hash] of Object.entries(raw)) {
      if (MANAGED_REL_RE.test(rel) && !rel.split('/').includes('..') && typeof hash === 'string') files[rel] = hash;
      else warnings.push({ path: file, reason: `entrada de manifiesto ignorada: ${rel}` });
    }
    return { exists: true, files };
  } catch (_) {
    warnings.push({ path: file, reason: 'manifiesto corrupto — se ignora' });
    return { exists: true, files: {} };
  }
}

/** Ruta destino bajo claudeDir; rechaza rels no gestionables o que escapen */
function targetPath(claudeDir, rel) {
  if (!MANAGED_REL_RE.test(rel)) throw new Error(`Ruta no gestionable: ${rel}`);
  const target = path.resolve(claudeDir, ...rel.split('/'));
  const relToRoot = path.relative(claudeDir, target);
  if (!relToRoot || relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    throw new Error(`Ruta fuera de .claude/: ${rel}`);
  }
  return target;
}

/**
 * Lanza si `target` o algún directorio entre claudeDir y él es un symlink:
 * escribir/borrar a través de él podría salir de .claude/.
 */
function assertNoSymlink(claudeDir, target) {
  const parts = path.relative(claudeDir, target).split(path.sep);
  let current = claudeDir;
  if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
    throw new Error(`${current} es un symlink`);
  }
  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (_) { return; }
    if (stat.isSymbolicLink()) throw new Error(`${current} es un symlink`);
  }
}

/** Borra directorios vacíos desde `dir` hacia arriba sin pasar de `stopAt` */
function pruneEmptyDirs(dir, stopAt) {
  let current = dir;
  while (current.startsWith(stopAt) && current !== stopAt) {
    try {
      if (fs.readdirSync(current).length > 0) return;
      fs.rmdirSync(current);
    } catch (_) {
      return;
    }
    current = path.dirname(current);
  }
}

/** Planifica las operaciones de un asset. Cualquier conflicto → asset entero omitido */
function planAsset(asset, claudeDir, manifest) {
  const ops = [];
  const conflicts = [];
  for (const { rel, src } of assetFiles(asset)) {
    const target  = targetPath(claudeDir, rel);
    assertNoSymlink(claudeDir, target);
    const content = fs.readFileSync(src);
    const srcHash = sha256(content);
    const curHash = hashFile(target);
    const managed = manifest.files[rel];
    if (curHash === null) ops.push({ op: 'create', rel, target, content, srcHash });
    else if (curHash === srcHash) ops.push({ op: managed ? 'same' : 'foreign-same', rel, target, srcHash });
    else if (managed === curHash) ops.push({ op: 'update', rel, target, content, srcHash });
    else conflicts.push({ path: target, reason: managed ? 'modificado localmente' : 'archivo no gestionado por mempunk' });
  }
  return { ops, conflicts };
}

/** Conserva en el manifiesto lo ya gestionado de un asset que no se pudo procesar */
function keepManaged(manifest, nextFiles, prefix) {
  for (const [rel, hash] of Object.entries(manifest.files)) {
    if (rel === prefix || rel.startsWith(prefix)) nextFiles[rel] = hash;
  }
}

/**
 * Sincroniza `claudeDir` con la lista de assets resuelta.
 * @param {{
 *   claudeDir: string, assets: object[], dryRun?: boolean,
 *   keep?: { kind: string, name: string }[]  - assets presentes en el vault pero inválidos:
 *                                              su copia instalada se conserva tal cual
 * }} options
 * @returns {{
 *   created: string[], updated: string[], removed: string[], unchanged: number,
 *   conflicts: { asset?: string, path: string, reason: string }[],
 *   warnings: { path: string, reason: string }[],
 *   managed: string[]
 * }}
 */
export function materialize({ claudeDir, assets, dryRun = false, keep = [] }) {
  const report = { created: [], updated: [], removed: [], unchanged: 0, conflicts: [], warnings: [], managed: [] };
  const manifest = readManifest(claudeDir, report.warnings);
  const nextFiles = {};

  for (const { kind, name } of keep) keepManaged(manifest, nextFiles, assetPrefix(kind, name));

  for (const asset of assets) {
    const label = `${asset.kind}:${asset.name}`;
    try {
      const { ops, conflicts } = planAsset(asset, claudeDir, manifest);
      if (conflicts.length > 0) {
        report.conflicts.push(...conflicts.map((c) => ({ asset: label, ...c })));
        keepManaged(manifest, nextFiles, assetPrefix(asset.kind, asset.name));
        continue;
      }
      for (const op of ops) {
        if (op.op === 'foreign-same') { report.unchanged++; continue; } // idéntico pero ajeno: no se adopta
        nextFiles[op.rel] = op.srcHash;
        if (op.op === 'same') { report.unchanged++; continue; }
        if (!dryRun) {
          fs.mkdirSync(path.dirname(op.target), { recursive: true });
          fs.writeFileSync(op.target, op.content);
        }
        (op.op === 'create' ? report.created : report.updated).push(op.target);
      }
    } catch (err) {
      // Un asset problemático (permisos, nombre reservado, symlink…) no
      // aborta los demás ni deja el manifiesto sin escribir
      report.conflicts.push({ asset: label, path: asset.entry, reason: `error: ${err.message}` });
      keepManaged(manifest, nextFiles, assetPrefix(asset.kind, asset.name));
    }
  }

  // Archivos que Mempunk escribió antes y ya no corresponden a ningún asset
  for (const [rel, hash] of Object.entries(manifest.files)) {
    if (rel in nextFiles) continue;
    let target;
    try {
      target = targetPath(claudeDir, rel);
      assertNoSymlink(claudeDir, target);
    } catch (err) {
      report.warnings.push({ path: rel, reason: err.message });
      continue;
    }
    const curHash = hashFile(target);
    if (curHash === null) continue;
    if (curHash !== hash) {
      // Editado a mano: se conserva y deja de estar gestionado
      report.conflicts.push({ path: target, reason: 'eliminado del vault pero modificado localmente — se conserva' });
      continue;
    }
    if (!dryRun) {
      try {
        fs.rmSync(target, { force: true });
        pruneEmptyDirs(path.dirname(target), claudeDir);
      } catch (err) {
        report.conflicts.push({ path: target, reason: `error: ${err.message}` });
        nextFiles[rel] = hash;
        continue;
      }
    }
    report.removed.push(target);
  }

  report.managed = Object.keys(nextFiles).sort();
  if (!dryRun) writeManifest(claudeDir, manifest.exists, nextFiles);
  return report;
}

function writeManifest(claudeDir, existed, files) {
  const file = path.join(claudeDir, MANIFEST_FILE);
  if (Object.keys(files).length === 0) {
    if (existed) fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, files }, null, 2) + '\n', 'utf8');
}

// ── .git/info/exclude ─────────────────────────────────────────────────────────

/**
 * Patrones de exclusión para los archivos gestionados.
 * @param {string[]} managedRels
 * @param {string} [prefix] - ruta del root dentro del worktree ('apps/api/'), '' si es la raíz
 */
export function excludePatterns(managedRels, prefix = '') {
  const base = `/${prefix}.claude`;
  const patterns = new Set();
  for (const rel of managedRels) {
    const skill = rel.match(/^skills\/([^/]+)\//);
    patterns.add(skill ? `${base}/skills/${skill[1]}/` : `${base}/${rel}`);
  }
  if (patterns.size > 0) patterns.add(`${base}/${MANIFEST_FILE}`);
  return [...patterns].sort();
}

function blockStart(prefix) {
  return `${EXCLUDE_TAG} [/${prefix}] >>>`;
}

/**
 * Reemplaza (o quita) el bloque de Mempunk de un root dentro del texto de un
 * exclude. Un bloque sin cierre (editado a mano) → null: no se toca el archivo.
 * @returns {string|null}
 */
export function replaceExcludeBlock(text, patterns, prefix = '') {
  const start = blockStart(prefix);
  const lines = text.split(/\r?\n/);
  const kept = [];
  let inBlock = false;
  for (const line of lines) {
    if (line === start) { inBlock = true; continue; }
    if (inBlock && line === EXCLUDE_END) { inBlock = false; continue; }
    if (!inBlock) kept.push(line);
  }
  if (inBlock) return null;
  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();
  if (patterns.length > 0) kept.push(start, ...patterns, EXCLUDE_END);
  return kept.length > 0 ? kept.join('\n') + '\n' : '';
}

/**
 * Mantiene los archivos gestionados fuera de git en el repo del proyecto
 * (copias privadas). Root sin git → no hace nada. Root en un subdirectorio
 * del repo (monorepo) → patrones con su prefijo y bloque propio.
 * @returns {boolean} true si el exclude cambió
 */
export function updateGitExclude(repoRoot, managedRels, { dryRun = false } = {}) {
  const res = runGit(['rev-parse', '--show-prefix', '--git-path', 'info/exclude'], { cwd: repoRoot, timeout: GIT_TIMEOUT_MS });
  if (res.status !== 0) return false;
  const [prefix = '', excludeRel = ''] = res.stdout.split(/\r?\n/);
  if (!excludeRel.trim()) return false;
  const excludeFile = path.resolve(repoRoot, excludeRel.trim());
  const current = fs.existsSync(excludeFile) ? fs.readFileSync(excludeFile, 'utf8') : '';
  const patterns = excludePatterns(managedRels, prefix.trim());
  // Nada gestionado y sin bloque previo: el exclude del usuario no se toca
  if (patterns.length === 0 && !current.includes(blockStart(prefix.trim()))) return false;
  const next = replaceExcludeBlock(current, patterns, prefix.trim());
  if (next === null || next === current) return false;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(excludeFile), { recursive: true });
    fs.writeFileSync(excludeFile, next, 'utf8');
  }
  return true;
}
