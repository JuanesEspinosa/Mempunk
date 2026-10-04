import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail, printJson, printTable } from '../lib/output.js';
import { VAULT_PATH, requireVault, openStore } from '../lib/vault.js';
import { normalizeRootPath } from '../store/VaultStore.js';
import {
  listProfiles, listScopeAssets, readProjectProfiles, resolveGlobalAssets, resolveProjectAssets,
  writeProjectProfiles,
} from '../lib/assets.js';
import { materialize, updateGitExclude } from '../lib/materialize.js';

// ── materialize ───────────────────────────────────────────────────────────────

/**
 * mempunk materialize [--global | --project <id>] [--dry-run] [--json]
 * Global → ~/.claude/; perfiles + proyecto → <repo de esta máquina>/.claude/
 * (privado: listado en .git/info/exclude).
 */
export function cmdMaterialize() {
  requireVault();
  const dryRun = Boolean(opts['dry-run']);
  const planned = planTargets(openStore());

  // Dos sesiones que arrancan a la vez no deben escribir el mismo manifiesto
  const release = dryRun ? () => {} : acquireLock();
  if (!release) {
    if (opts.json) return printJson({ dryRun, targets: [], locked: true });
    return console.log(t('materialize.locked'));
  }

  const targets = [];
  try {
    for (const plan of planned) {
      if (plan.skipped) { targets.push({ target: plan.label, skipped: plan.skipped }); continue; }
      const report = materialize({ claudeDir: plan.claudeDir, assets: plan.assets, keep: plan.invalid, dryRun });
      if (plan.root) updateGitExclude(plan.root, report.managed, { dryRun });
      targets.push({ target: plan.label, ...report, warnings: [...report.warnings, ...plan.warnings] });
    }
  } finally {
    release();
  }

  if (opts.json) return printJson({ dryRun, targets });
  printMaterializeReport(targets, dryRun);
}

/**
 * Destinos a materializar, agrupados por carpeta .claude/ real: varios
 * proyectos en el mismo repo (o un repo en $HOME) comparten manifiesto, y
 * procesarlos por separado haría que cada pasada borrara los del otro.
 */
function planTargets(store) {
  const byDir = new Map();
  const add = (claudeDir, root, label, resolved) => {
    const key = normalizeRootPath(claudeDir);
    const entry = byDir.get(key) ?? { claudeDir, root, labels: [], layers: [], invalid: [], warnings: [] };
    entry.labels.push(label);
    entry.layers.push(...resolved.assets);
    entry.invalid.push(...resolved.invalid);
    entry.warnings.push(...resolved.warnings);
    if (root) entry.root = root;
    byDir.set(key, entry);
  };

  let projects = opts.global
    ? []
    : store.getLocalProjectPaths().map((row) => ({ root: row.root_path, id: row.project_id }));
  if (opts.project) {
    const own = projects.filter(({ id }) => id === opts.project);
    if (own.length === 0) fail(t('materialize.noLocalPath', { id: opts.project }));
    // Incluir a los vecinos del mismo repo: comparten manifiesto
    const roots = new Set(own.map(({ root }) => normalizeRootPath(root)));
    projects = projects.filter(({ root }) => roots.has(normalizeRootPath(root)));
  }

  const homeClaude = path.join(os.homedir(), '.claude');
  const touchesHome = projects.some(({ root }) => normalizeRootPath(path.join(root, '.claude')) === normalizeRootPath(homeClaude));
  if (!opts.project || touchesHome) add(homeClaude, null, 'global', resolveGlobalAssets(VAULT_PATH));

  const skipped = [];
  for (const { root, id } of projects) {
    if (!fs.existsSync(root)) {
      skipped.push({ label: id, skipped: t('materialize.missingRoot', { id, root }) });
      continue;
    }
    add(path.join(root, '.claude'), root, id, resolveProjectAssets(VAULT_PATH, id));
  }

  const plans = [...byDir.values()].map((entry) => {
    const assets = new Map();
    for (const asset of entry.layers) {
      const key = `${asset.kind}:${asset.name}`;
      const prev = assets.get(key);
      if (prev && (prev.scope !== asset.scope || prev.owner !== asset.owner) && entry.labels.length > 1) {
        entry.warnings.push({ path: asset.entry, reason: `${key} definido por varios proyectos de este repo — gana ${asset.owner ?? asset.scope}` });
      }
      assets.set(key, asset);
    }
    return { ...entry, label: entry.labels.join('+'), assets: [...assets.values()] };
  });
  return [...plans, ...skipped];
}

// Un lock más viejo que esto es de un proceso que murió
const LOCK_STALE_MS = 60_000;

/** Toma .mempunk/materialize.lock. Devuelve la función que lo libera, o null si está tomado */
function acquireLock() {
  const lockFile = path.join(VAULT_PATH, '.mempunk', 'materialize.lock');
  const take = () => {
    fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
    return () => { try { fs.rmSync(lockFile, { force: true }); } catch (_) { /* ya liberado */ } };
  };
  try {
    return take();
  } catch (_) {
    try {
      if (Date.now() - fs.statSync(lockFile).mtimeMs < LOCK_STALE_MS) return null;
      fs.rmSync(lockFile, { force: true });
      return take();
    } catch (__) {
      return null;
    }
  }
}

function printMaterializeReport(targets, dryRun) {
  for (const r of targets) {
    if (r.skipped) { console.log(r.skipped); continue; }
    const touched = r.created.length + r.updated.length + r.removed.length + r.unchanged + r.conflicts.length;
    if (touched === 0 && r.warnings.length === 0) continue;
    console.log(t('materialize.target', {
      target: r.target, created: r.created.length, updated: r.updated.length,
      removed: r.removed.length, unchanged: r.unchanged,
    }));
    for (const c of r.conflicts) console.log(t('materialize.conflict', { asset: c.asset ?? '', path: c.path, reason: c.reason }));
    for (const w of r.warnings) console.log(t('materialize.warning', { path: w.path, reason: w.reason }));
  }
  if (dryRun) console.log(t('materialize.dryRun'));
}

// ── Perfiles ──────────────────────────────────────────────────────────────────

/** mempunk profile list */
export function cmdProfileList() {
  requireVault();
  const rows = listProfiles(VAULT_PATH).map((name) => {
    const { assets } = listScopeAssets(VAULT_PATH, 'profile', name);
    return {
      name,
      skills: assets.filter((a) => a.kind === 'skill').length,
      agents: assets.filter((a) => a.kind === 'agent').length,
    };
  });
  if (opts.json) return printJson(rows);
  if (rows.length === 0) return console.log(t('profile.none'));
  printTable(['name', 'skills', 'agents'], rows.map((r) => [r.name, r.skills, r.agents]));
}

/** mempunk project profile <id> [--add <p>] [--remove <p>] */
export function cmdProjectProfile(projectId) {
  if (!projectId) fail(t('usage', { syntax: 'mempunk project profile <id> [--add <profile>] [--remove <profile>]' }));
  requireVault();
  if (!openStore().listProjects().some((p) => p.id === projectId)) fail(t('project.notFound', { id: projectId }));

  let profiles = readProjectProfiles(VAULT_PATH, projectId);
  if (opts.add || opts.remove) {
    if (opts.add) profiles = [...profiles.filter((p) => p !== opts.add), opts.add];
    if (opts.remove) profiles = profiles.filter((p) => p !== opts.remove);
    try {
      writeProjectProfiles(VAULT_PATH, projectId, profiles);
    } catch (err) {
      fail(err.message);
    }
    if (opts.add && !listProfiles(VAULT_PATH).includes(opts.add)) console.log(t('profile.notCreatedYet', { profile: opts.add }));
  }
  if (opts.json) return printJson({ project_id: projectId, profiles });
  console.log(t('profile.ofProject', { id: projectId, profiles: profiles.join(', ') || t('profile.empty') }));
}
