import fs from 'node:fs';
import path from 'node:path';
import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { VAULT_PATH, requireVault, openStore } from '../lib/vault.js';
import {
  BOM_RE, createAsset, listScopeAssets, parseFrontmatter, resolveProjectAssets, resolveGlobalAssets, scopeRoot,
} from '../lib/assets.js';

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

// ── Handlers genéricos de skills y agentes por scope ─────────────────────────
//
// Scope por flags: --global | --profile <p> | --project <id>.
// Forma heredada de skill: `skill add <project_id> <name>` = --project.

/** Scope pedido por flags, o null si no se indicó ninguno */
function scopeFromOpts() {
  const chosen = [
    opts.global ? { scope: 'global', owner: null } : null,
    opts.profile ? { scope: 'profile', owner: opts.profile } : null,
    opts.project ? { scope: 'project', owner: opts.project } : null,
  ].filter(Boolean);
  if (chosen.length > 1) fail(t('asset.scopeConflict'));
  return chosen[0] ?? null;
}

/** Id estable que acepta `update`: <scope>:<owner>:<name> */
function assetId(asset) {
  return `${asset.scope}:${asset.owner ?? ''}:${asset.name}`;
}

function toRow(asset) {
  return {
    id: assetId(asset),
    kind: asset.kind,
    name: asset.name,
    scope: asset.scope,
    owner: asset.owner,
    description: asset.description,
    file_path: asset.entry,
  };
}

/**
 * mempunk skill|agent add <name> --global|--profile <p>|--project <id> --description "..."
 * (skill: también `skill add <project_id> <name>`)
 */
export function cmdAssetAdd(kind, args) {
  requireVault();
  let target = scopeFromOpts();
  let name = args[0];
  if (!target && kind === 'skill' && args[1]) {
    target = { scope: 'project', owner: args[0] };
    name = args[1];
  }
  if (!name || !target) {
    fail(t('usage', { syntax: `mempunk ${kind} add <name> --global | --profile <p> | --project <id> --description "..."` }));
  }
  if (target.scope === 'project') requireProject(target.owner);

  let file;
  try {
    file = createAsset(VAULT_PATH, { kind, ...target, name, description: opts.description });
  } catch (err) {
    fail(err.message);
  }
  console.log(t('asset.created', { kind, name, path: file }));
  console.log(t('asset.hintMaterialize'));
}

/**
 * mempunk skill|agent list <project_id> | --global | --profile <p>
 * Con proyecto: globales + resueltos del proyecto (perfiles → proyecto).
 */
export function cmdAssetList(kind, args) {
  requireVault();
  const target = scopeFromOpts();
  const projectId = args[0] ?? (target?.scope === 'project' ? target.owner : null);

  let assets = [];
  let legacy = [];
  if (projectId) {
    requireProject(projectId);
    const resolved = resolveProjectAssets(VAULT_PATH, projectId);
    assets = [...resolveGlobalAssets(VAULT_PATH).assets, ...resolved.assets];
    legacy = kind === 'skill' ? legacyRows(projectId) : [];
  } else if (target) {
    try {
      assets = listScopeAssets(VAULT_PATH, target.scope, target.owner).assets;
    } catch (err) {
      fail(err.message);
    }
  } else {
    fail(t('usage', { syntax: `mempunk ${kind} list <project_id> | --global | --profile <p>` }));
  }

  const rows = [...assets.filter((a) => a.kind === kind).map(toRow), ...legacy];
  if (opts.json) return printJson(rows);
  printTable(
    ['id', 'scope', 'description', 'file_path'],
    rows.map((r) => [r.id, r.scope, truncate(r.description ?? '', 60), r.file_path])
  );
  if (legacy.length > 0) console.log(t('asset.legacyHint', { count: legacy.length, id: projectId }));
}

/** Skills v1 (tabla project_skills): siguen listándose para el loader y el saver */
function legacyRows(projectId) {
  return openStore().getSkills(projectId).map((r) => ({
    id: r.id,
    kind: 'skill',
    name: r.name,
    scope: 'legacy',
    owner: projectId,
    description: null,
    file_path: r.file_path,
    updated_at: r.updated_at,
  }));
}

/**
 * mempunk skill|agent update <id> --file <markdown>
 * <id> = id de `list` (<scope>:<owner>:<name>) o id heredado de project_skills.
 */
export function cmdAssetUpdate(kind, id) {
  if (!id || !opts.file) fail(t('usage', { syntax: `mempunk ${kind} update <id> --file <markdown_path>` }));
  requireVault();

  const sourcePath = path.resolve(opts.file);
  if (!fs.existsSync(sourcePath)) fail(t('skill.fileNotFound', { path: sourcePath }));
  const content = fs.readFileSync(sourcePath, 'utf8');

  const parts = id.split(':');
  if (parts.length !== 3) {
    if (kind !== 'skill') fail(t('asset.notFound', { kind, id }));
    openStore().updateSkill(id, content);
    console.log(t('skill.updated', { id }));
    return;
  }

  const [scope, owner, name] = parts;
  let asset;
  try {
    asset = listScopeAssets(VAULT_PATH, scope, owner || null).assets.find((a) => a.kind === kind && a.name === name);
  } catch (err) {
    fail(err.message);
  }
  if (!asset) fail(t('asset.notFound', { kind, id }));
  fs.writeFileSync(asset.entry, keepFrontmatter(fs.readFileSync(asset.entry, 'utf8'), content), 'utf8');
  console.log(t('skill.updated', { id }));
}

/**
 * Si el contenido nuevo no trae description (p. ej. el saver manda solo el
 * cuerpo), se conserva el frontmatter actual: sin él Claude no activa el asset.
 */
function keepFrontmatter(current, next) {
  if (parseFrontmatter(next).description) return next;
  const header = current.replace(BOM_RE, '').match(FRONTMATTER_RE);
  const body = next.replace(BOM_RE, '').replace(FRONTMATTER_RE, '');
  return header ? `${header[0].replace(/\r?\n?$/, '\n')}\n${body.replace(/^\s+/, '')}` : next;
}

function requireProject(projectId) {
  try {
    scopeRoot(VAULT_PATH, 'project', projectId);
  } catch (err) {
    fail(err.message);
  }
  if (!openStore().listProjects().some((p) => p.id === projectId)) {
    fail(t('project.notFound', { id: projectId }));
  }
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
