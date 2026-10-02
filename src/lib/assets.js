import fs from 'node:fs';
import path from 'node:path';

// ── Skills y agentes por scope ────────────────────────────────────────────────
//
// El vault es la fuente de verdad y el filesystem el único registro (sin tabla
// en mempunk.db): los .md hacen merge por git sin pasar por el conflicto
// binario de la BD.
//
//   global/{skills/<name>/SKILL.md, agents/<name>.md}
//   profiles/<p>/{skills,agents}/…
//   projects/<id>/{skills,agents}/…   + projects/<id>/mempunk.json {"profiles": [...]}

// BOM UTF-8 inicial (archivos editados en Windows/PowerShell)
export const BOM_RE = new RegExp(`^${String.fromCharCode(0xfeff)}`);

export const SCOPES = ['global', 'profile', 'project'];
export const KINDS  = ['skill', 'agent'];

// Regla de nombres de Claude Code para skills/agentes. Además impide path
// traversal: el nombre se usa como segmento de ruta en el vault y en .claude/
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

// Nombres de dispositivo de Windows: no se pueden crear como archivo/carpeta
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

// Ids de proyecto: mismo criterio que remote.js para --project
const PROJECT_ID_RE = /^[\w.-]+$/;

/** @param {string} name */
export function isValidAssetName(name) {
  return typeof name === 'string' && NAME_RE.test(name) && !WINDOWS_RESERVED_RE.test(name);
}

/**
 * Carpeta raíz de un scope dentro del vault. Lanza si scope/owner no son válidos.
 * @param {string} vaultPath
 * @param {'global'|'profile'|'project'} scope
 * @param {string} [owner] - nombre del perfil o id del proyecto
 * @returns {string}
 */
export function scopeRoot(vaultPath, scope, owner) {
  if (scope === 'global') return path.join(vaultPath, 'global');
  if (scope === 'profile') {
    if (!isValidAssetName(owner)) throw new Error(`Nombre de perfil inválido: "${owner}" (usa minúsculas, dígitos y guiones)`);
    return path.join(vaultPath, 'profiles', owner);
  }
  if (scope === 'project') {
    if (!owner || !PROJECT_ID_RE.test(owner) || owner === '.' || owner === '..') {
      throw new Error(`Id de proyecto inválido: "${owner}"`);
    }
    return path.join(vaultPath, 'projects', owner);
  }
  throw new Error(`Scope desconocido: ${scope}`);
}

/**
 * Frontmatter YAML mínimo: `key: value`, valores entre comillas y bloques
 * `>`/`|` con líneas indentadas. Suficiente para name/description.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseFrontmatter(text) {
  const match = text.replace(BOM_RE, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  const data  = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const block = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i].trim());
      value = block.join(value.startsWith('>') ? ' ' : '\n');
    } else if (/^".*"$/.test(value)) {
      try { value = JSON.parse(value); } catch (_) { value = value.slice(1, -1); }
    } else if (/^'.*'$/.test(value)) {
      value = value.slice(1, -1).replaceAll("''", "'");
    }
    data[kv[1]] = value;
  }
  return data;
}

function readFrontmatter(file) {
  try {
    return parseFrontmatter(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function subdirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * Valida un asset y devuelve el motivo si no se puede materializar.
 * @returns {string|null}
 */
function invalidReason(name, data, kind) {
  if (!isValidAssetName(name)) return 'nombre inválido (minúsculas, dígitos y guiones)';
  if (data === null) return 'no se pudo leer';
  if (!data.description) return 'falta description en el frontmatter';
  // Claude Code identifica agentes por `name`: si no coincide con el archivo,
  // la resolución por nombre entre capas dejaría de ser fiable
  if (kind === 'agent' && data.name !== name) return `name del frontmatter debe ser "${name}"`;
  if (kind === 'skill' && data.name && data.name !== name) return `name del frontmatter debe ser "${name}"`;
  return null;
}

/**
 * Lista los assets de un scope.
 * @returns {{
 *   assets:   { kind: string, name: string, scope: string, owner: string|null, description: string, source: string, entry: string }[],
 *   warnings: { path: string, reason: string }[],
 *   legacy:   { name: string, path: string }[]
 * }}
 */
export function listScopeAssets(vaultPath, scope, owner = null) {
  const root     = scopeRoot(vaultPath, scope, owner);
  const assets   = [];
  const warnings = [];
  const legacy   = [];
  const base     = { scope, owner: scope === 'global' ? null : owner };

  const skillsDir = path.join(root, 'skills');
  for (const name of subdirs(skillsDir)) {
    const entry = path.join(skillsDir, name, 'SKILL.md');
    if (!fs.existsSync(entry)) continue;
    const data = readFrontmatter(entry);
    const reason = invalidReason(name, data, 'skill');
    if (reason) { warnings.push({ path: entry, reason, kind: 'skill', name }); continue; }
    assets.push({ ...base, kind: 'skill', name, description: data.description, source: path.join(skillsDir, name), entry });
  }

  // Skills v1: .md planos en skills/ — se listan pero no se materializan
  if (fs.existsSync(skillsDir)) {
    for (const f of fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md'))) {
      legacy.push({ name: f.slice(0, -3), path: path.join(skillsDir, f) });
    }
  }

  const agentsDir = path.join(root, 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const f of fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'))) {
      const name  = f.slice(0, -3);
      const entry = path.join(agentsDir, f);
      const data  = readFrontmatter(entry);
      const reason = invalidReason(name, data, 'agent');
      if (reason) { warnings.push({ path: entry, reason, kind: 'agent', name }); continue; }
      assets.push({ ...base, kind: 'agent', name, description: data.description, source: entry, entry });
    }
  }

  return { assets, warnings, legacy };
}

// ── Perfiles ──────────────────────────────────────────────────────────────────

function projectConfigPath(vaultPath, projectId) {
  return path.join(scopeRoot(vaultPath, 'project', projectId), 'mempunk.json');
}

/** Perfiles asignados a un proyecto, en orden de aplicación. Archivo ausente → [] */
export function readProjectProfiles(vaultPath, projectId) {
  try {
    const raw = fs.readFileSync(projectConfigPath(vaultPath, projectId), 'utf8').replace(BOM_RE, '');
    const profiles = JSON.parse(raw).profiles;
    return Array.isArray(profiles) ? profiles.filter((p) => typeof p === 'string') : [];
  } catch (_) {
    return [];
  }
}

/** Escribe la lista de perfiles conservando el resto de claves de mempunk.json */
export function writeProjectProfiles(vaultPath, projectId, profiles) {
  for (const p of profiles) scopeRoot(vaultPath, 'profile', p); // valida nombres
  const file = projectConfigPath(vaultPath, projectId);
  let config = {};
  try { config = JSON.parse(fs.readFileSync(file, 'utf8').replace(BOM_RE, '')); } catch (_) { /* nuevo */ }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...config, profiles: [...new Set(profiles)] }, null, 2) + '\n', 'utf8');
}

/** Perfiles existentes en el vault (carpetas de profiles/) */
export function listProfiles(vaultPath) {
  return subdirs(path.join(vaultPath, 'profiles')).filter(isValidAssetName).sort();
}

// ── Resolución por capas ──────────────────────────────────────────────────────

/** Une capas: mismo kind+name → gana la capa posterior (queda en overrides) */
function mergeLayers(layers) {
  const byKey = new Map();
  const overrides = [];
  for (const asset of layers) {
    const key = `${asset.kind}:${asset.name}`;
    if (byKey.has(key)) overrides.push({ ...byKey.get(key), overriddenBy: `${asset.scope}${asset.owner ? `:${asset.owner}` : ''}` });
    byKey.set(key, asset);
  }
  return { assets: [...byKey.values()], overrides };
}

/**
 * Assets que existen en el vault pero no son válidos (sin description, name
 * distinto…): su copia ya instalada se conserva en vez de borrarse.
 */
function invalidAssets(warnings) {
  return warnings.filter((w) => w.kind && isValidAssetName(w.name)).map(({ kind, name }) => ({ kind, name }));
}

/** Assets globales (van a ~/.claude/) */
export function resolveGlobalAssets(vaultPath) {
  const res = listScopeAssets(vaultPath, 'global');
  return { ...res, invalid: invalidAssets(res.warnings) };
}

/**
 * Assets de un proyecto: perfiles en orden → proyecto. Los globales NO se
 * incluyen: se materializan aparte en ~/.claude/.
 */
export function resolveProjectAssets(vaultPath, projectId) {
  const warnings = [];
  const layers   = [];
  for (const profile of readProjectProfiles(vaultPath, projectId)) {
    if (!isValidAssetName(profile)) {
      warnings.push({ path: projectConfigPath(vaultPath, projectId), reason: `perfil inválido: "${profile}"` });
      continue;
    }
    if (!fs.existsSync(scopeRoot(vaultPath, 'profile', profile))) {
      warnings.push({ path: projectConfigPath(vaultPath, projectId), reason: `el perfil "${profile}" no existe en profiles/` });
      continue;
    }
    const res = listScopeAssets(vaultPath, 'profile', profile);
    layers.push(...res.assets);
    warnings.push(...res.warnings);
  }
  const own = listScopeAssets(vaultPath, 'project', projectId);
  layers.push(...own.assets);
  warnings.push(...own.warnings);
  return { ...mergeLayers(layers), warnings, legacy: own.legacy, invalid: invalidAssets(warnings) };
}

// ── Creación ──────────────────────────────────────────────────────────────────

/**
 * Crea un skill o agente con su plantilla. Falla si ya existe (nunca pisa).
 * @param {string} vaultPath
 * @param {{ kind: 'skill'|'agent', scope: string, owner?: string, name: string, description: string }} spec
 * @returns {string} ruta absoluta del archivo creado
 */
export function createAsset(vaultPath, { kind, scope, owner, name, description }) {
  if (!KINDS.includes(kind)) throw new Error(`Tipo desconocido: ${kind}`);
  if (!isValidAssetName(name)) throw new Error(`Nombre inválido: "${name}" (usa minúsculas, dígitos y guiones, máx. 64)`);
  const desc = (description ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (!desc) throw new Error('Falta --description: es lo que Claude usa para decidir cuándo activarlo');

  const root = scopeRoot(vaultPath, scope, owner);
  const file = kind === 'skill'
    ? path.join(root, 'skills', name, 'SKILL.md')
    : path.join(root, 'agents', `${name}.md`);
  if (fs.existsSync(file)) throw new Error(`Ya existe: ${file}`);

  // JSON.stringify produce un string YAML válido (comillas dobles escapadas)
  const header = ['---', `name: ${name}`, `description: ${JSON.stringify(desc)}`, '---', ''];
  const body = kind === 'skill'
    ? [`# ${name}`, '', '<!-- Instrucciones: qué hacer, cuándo y con qué comandos/archivos de referencia. -->', '']
    : ['<!-- Prompt del agente: rol, alcance (qué NO hace), y formato/longitud de su respuesta. -->', ''];

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [...header, ...body].join('\n'), { encoding: 'utf8', flag: 'wx' });
  return file;
}
