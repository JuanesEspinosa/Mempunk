import fs from 'node:fs';
import path from 'node:path';
import { VAULT_PATH } from './vault.js';
import { readJsonFile, writeJsonFile } from './config-files.js';
import { fail } from './output.js';
import { t } from './i18n.js';
import { isValidBranchName } from './git.js';

// ── Configuración del remote del vault ───────────────────────────────────────
//
// remote.json viaja en git (url, rama, automatización). remote-state.json es
// por máquina (últimos push/pull) y está en el .gitignore del vault.

export const REMOTE_CONFIG_PATH = path.join(VAULT_PATH, '.mempunk', 'remote.json');
export const REMOTE_STATE_PATH  = path.join(VAULT_PATH, '.mempunk', 'remote-state.json');
export const DEFAULT_BRANCH     = 'main';

// Ruta relativa (con "/" — así la reporta git) de la BD dentro del vault
export const DB_REL_PATH = '.mempunk/mempunk.db';

// Líneas que el .gitignore del vault debe tener: estado por máquina, WAL de
// SQLite, backups y caché de Obsidian. Se agregan solo las que falten.
export const REQUIRED_IGNORES = [
  '.mempunk/mempunk.db-wal',
  '.mempunk/mempunk.db-shm',
  '.mempunk/hooks.log',
  '.mempunk/backups/',
  '.mempunk/active-project.json',
  '.mempunk/project-paths.json',
  '.mempunk/checkpoint-state.json',
  '.mempunk/context-warn-state.json',
  '.mempunk/session-touched.json',
  '.mempunk/remote-state.json',
  '.mempunk/auto-start.flag',
  '.obsidian/workspace.json',
  '.obsidian/workspace-mobile.json',
  '.obsidian/cache',
];

/** Lee remote.json o null si no existe */
export function readRemoteConfig() {
  if (!fs.existsSync(REMOTE_CONFIG_PATH)) return null;
  return readJsonFile(REMOTE_CONFIG_PATH);
}

/**
 * Lee remote.json o aborta con la instrucción para configurarlo.
 * La rama viene de un archivo versionado (cualquiera con push puede editarlo):
 * se valida antes de que llegue a un comando git.
 */
export function requireRemoteConfig() {
  const config = readRemoteConfig();
  if (!config?.url) fail(t('remote.notConfigured'));
  if (config.branch !== undefined && !isValidBranchName(config.branch)) {
    fail(t('remote.invalidBranch', { branch: String(config.branch) }));
  }
  return config;
}

export function writeRemoteConfig(config) {
  writeJsonFile(REMOTE_CONFIG_PATH, config);
}

/** Estado por máquina — siempre devuelve las tres claves */
export function readRemoteState() {
  const state = readJsonFile(REMOTE_STATE_PATH);
  return {
    last_push_at:      state.last_push_at ?? null,
    last_pull_at:      state.last_pull_at ?? null,
    last_pull_commits: state.last_pull_commits ?? null,
  };
}

/** Mezcla `patch` sobre el estado actual y lo persiste (no muta el objeto leído) */
export function updateRemoteState(patch) {
  writeJsonFile(REMOTE_STATE_PATH, { ...readRemoteState(), ...patch });
}

/**
 * Garantiza que el .gitignore del vault contenga REQUIRED_IGNORES.
 * Idempotente: solo agrega las líneas faltantes al final.
 * @returns {string[]} Líneas agregadas
 */
export function ensureGitignore(dir) {
  const file     = path.join(dir, '.gitignore');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const present  = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const missing  = REQUIRED_IGNORES.filter((line) => !present.has(line));
  if (missing.length === 0) return [];

  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(file, existing + separator + missing.join('\n') + '\n', 'utf8');
  return missing;
}

// ── URL del remote ───────────────────────────────────────────────────────────

const URL_WITH_SCHEME = /^(https?|ssh|git|file):\/\//i;
const SCP_FORM        = /^[\w.-]+@[\w.-]+:.+/;           // user@host:path
const LOCAL_PATH      = /^(\/|[A-Za-z]:[\\/]|\\\\)/;    // POSIX, C:\ o C:/, UNC

/** Oculta el userinfo de una URL (user:token@) — para cualquier salida */
export function maskUrl(url) {
  return String(url ?? '').replace(/\/\/[^@/]+@/, '//***@');
}

/**
 * Acepta URLs con esquema (https/http/ssh/git/file), la forma scp
 * (user@host:path) y rutas locales absolutas. Rechaza valores que git
 * interpretaría como opción y URLs con credenciales embebidas.
 */
export function validateRemoteUrl(url) {
  if (/^-/.test(url)) fail(t('remote.invalidUrl', { url: maskUrl(url) }));
  if (URL_WITH_SCHEME.test(url)) {
    rejectEmbeddedCredentials(url);
    return;
  }
  if (SCP_FORM.test(url) || LOCAL_PATH.test(url)) return;
  fail(t('remote.invalidUrl', { url: maskUrl(url) }));
}

function rejectEmbeddedCredentials(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(t('remote.invalidUrl', { url: maskUrl(url) }));
  }
  // ssh://git@host/... lleva usuario por protocolo, no credenciales
  const usernameIsCredential = parsed.protocol !== 'ssh:';
  if (parsed.password || (usernameIsCredential && parsed.username)) {
    fail(t('remote.urlHasCredentials'));
  }
}
