import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { normalizeRootPath } from '../store/VaultStore.js';
import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { VAULT_PATH, __cliDir, requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Proyectos ──────────────────────────────────────────────────────

export function cmdProjectAdd(id, name) {
  if (!id || !name) fail(t('usage', { syntax: 'mempunk project add <id> <name> [--path <dir>]' }));
  requireVault();

  const projectPath = path.join(VAULT_PATH, 'projects', id);

  // Crear subcarpetas estándar del proyecto
  fs.mkdirSync(path.join(projectPath, 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'skills'),    { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'wiki'),      { recursive: true });

  // Copiar templates reemplazando {PROJECT_NAME} — no copiar backlog.md ni session-log.md
  // (en v2 ambos viven en SQLite, no en disco)
  const templateDir = path.join(__cliDir, '..', 'templates', 'project');
  const templateFiles = [
    ['INDEX.md',           'INDEX.md'],
    ['overview.md',        'overview.md'],
    ['architecture.md',    'architecture.md'],
    ['conventions.md',     'conventions.md'],
    ['wiki/state.md',      'wiki/state.md'],
    ['wiki/log.md',        'wiki/log.md'],
    ['wiki/index.md',      'wiki/index.md'],
  ];

  for (const [src, dest] of templateFiles) {
    const srcPath  = path.join(templateDir, src);
    const destPath = path.join(projectPath, dest);
    if (!fs.existsSync(srcPath)) continue;
    const content = fs.readFileSync(srcPath, 'utf8').replaceAll('{PROJECT_NAME}', name);
    fs.writeFileSync(destPath, content, 'utf8');
  }

  // Registrar en SQLite con la ruta del repo real (si hay una segura)
  const store    = openStore();
  const rootPath = _resolveRootPathForRegistration();
  store.addProject(id, name, projectPath, rootPath);
  _writeProjectPathsFile(store);

  // Auto-activar el proyecto recién creado
  _writeActiveProject(id);

  console.log(t('project.created', { name, path: projectPath }));
  if (rootPath) console.log(t('project.dirMapped', { root: rootPath, id }));
  console.log(t('project.active', { id }));
}

export function cmdProjectList() {
  requireVault();
  const store = openStore();
  const rows = store.listProjects();
  if (opts.json) return printJson(rows);
  printTable(
    ['id', 'name', 'status', 'updated_at'],
    rows.map((r) => [r.id, r.name, r.status, r.updated_at])
  );
}

/** Escribe active-project.json — compartido por cmdProjectActivate y cmdProjectAdd */
export function _writeActiveProject(projectId) {
  const mempunkDir  = path.join(VAULT_PATH, '.mempunk');
  const activeFile  = path.join(mempunkDir, 'active-project.json');
  fs.mkdirSync(mempunkDir, { recursive: true });
  fs.writeFileSync(activeFile, JSON.stringify({ project_id: projectId }), 'utf8');
}

/**
 * Regenera .mempunk/project-paths.json desde la BD (fuente de verdad).
 * Los hooks resuelven el proyecto por el cwd de la sesión leyendo este archivo,
 * sin acceso a SQLite (se copian solos a ~/.claude/hooks/ sin node_modules).
 */
export function _writeProjectPathsFile(store) {
  const mempunkDir = path.join(VAULT_PATH, '.mempunk');
  const pathsFile  = path.join(mempunkDir, 'project-paths.json');
  fs.mkdirSync(mempunkDir, { recursive: true });
  fs.writeFileSync(pathsFile, JSON.stringify(store.getProjectPathMap(), null, 2), 'utf8');
}

/**
 * Resuelve la ruta del repo a registrar para un proyecto.
 * Con --path la valida; sin --path usa el cwd salvo que sea el home o esté
 * dentro del vault (mapearlos capturaría los checkpoints de todo lo demás).
 * @returns {string|null} Ruta normalizada, o null si no hay una segura
 */
export function _resolveRootPathForRegistration() {
  if (opts.path) {
    const resolved = path.resolve(opts.path);
    if (!fs.existsSync(resolved)) fail(t('project.pathNotFound', { path: resolved }));
    return normalizeRootPath(resolved);
  }

  const cwd       = normalizeRootPath(process.cwd());
  const home      = normalizeRootPath(os.homedir());
  const vaultRoot = normalizeRootPath(VAULT_PATH);
  if (cwd === home || cwd === vaultRoot || cwd.startsWith(vaultRoot + '/')) return null;
  return cwd;
}

export function cmdProjectActivate(id) {
  if (!id) fail(t('usage', { syntax: 'mempunk project activate <project_id> [--here]' }));
  requireVault();

  const store = openStore();
  if (!store.listProjects().find((p) => p.id === id)) {
    fail(t('project.notFoundHint', { id }));
  }

  // --here mapea el directorio actual al proyecto: las sesiones de Claude Code
  // que corran en él guardarán checkpoints aquí sin depender del activo global
  if (opts.here) {
    const rootPath = normalizeRootPath(process.cwd());
    store.setProjectRootPath(id, rootPath);
    _writeProjectPathsFile(store);
    console.log(t('project.dirMapped', { root: rootPath, id }));
  }

  _writeActiveProject(id);
  console.log(t('project.active', { id }));
}
