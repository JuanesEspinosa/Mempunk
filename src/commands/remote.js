import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail, printJson } from '../lib/output.js';
import { VAULT_PATH, requireVault, openStore } from '../lib/vault.js';
import {
  runGit, gitVersionAvailable, isGitRepo, conflictedFiles,
  mergeInProgress, hasIndexLock, isValidBranchName, NETWORK_TIMEOUT,
} from '../lib/git.js';
import { resolveDbConflict } from '../lib/db-conflict.js';
import {
  REMOTE_CONFIG_PATH, DEFAULT_BRANCH, DB_REL_PATH, REQUIRED_IGNORES,
  readRemoteConfig, requireRemoteConfig, writeRemoteConfig,
  readRemoteState, updateRemoteState, ensureGitignore, maskUrl, validateRemoteUrl,
} from '../lib/remote-config.js';
import { createVerifiedBackup } from './vault.js';
import { _writeProjectPathsFile } from './project.js';

const MAX_MESSAGE_LENGTH   = 2000;
const PROJECT_ID_RE        = /^[\w.-]+$/;
const PULL_COMMIT_MESSAGE  = 'vault: local changes before pull';
// git merge falla sin conflicto cuando el vault se creó con `init` en vez de clonar
const BOOTSTRAP_MERGE_ERRORS = /unrelated histories|untracked working tree files would be overwritten/i;

// ── Helpers git sobre el vault ────────────────────────────────────────────────

const git = (args, options = {}) => runGit(args, { cwd: VAULT_PATH, ...options });

function gitOrFail(args, options) {
  const r = git(args, options);
  if (r.timedOut) fail(t('git.timeout', { command: args[0] }));
  if (r.status !== 0) {
    fail(t('git.failed', { args: args.join(' '), stderr: (r.stderr || r.error?.message || '').trim() }));
  }
  return r;
}

function requireGitRepo() {
  requireVault();
  if (!gitVersionAvailable()) fail(t('git.notAvailable'));
  const config = requireRemoteConfig();
  if (!isGitRepo(VAULT_PATH)) fail(t('remote.notConfigured'));
  return config;
}

const headExists = () => git(['rev-parse', '--verify', '--quiet', 'HEAD']).status === 0;
const headHash   = () => (headExists() ? git(['rev-parse', 'HEAD']).stdout.trim() : null);
const remoteRef  = (branch) => `refs/remotes/origin/${branch}`;
const remoteBranchExists = (branch) => git(['rev-parse', '--verify', '--quiet', remoteRef(branch)]).status === 0;

function countCommits(range) {
  const r = git(['rev-list', '--count', range]);
  return r.status === 0 ? Number.parseInt(r.stdout.trim(), 10) || 0 : 0;
}

/** Commit que aborta con instrucciones claras si git no tiene identidad configurada */
function commitOrFail(args) {
  const r = git(args);
  if (r.status === 0) return r;
  if (/Please tell me who you are|user\.name/i.test(r.stderr + r.stdout)) fail(t('push.noIdentity'));
  fail(t('git.failed', { args: args.join(' '), stderr: r.stderr.trim() }));
}

function exitIfStrict(conflict) {
  if (conflict && opts.strict) fail(t('conflict.strict'));
}

// ── remote set / show / unset ─────────────────────────────────────────────────

/** --branch explícito → rama activa del repo existente → remote.json previo → main */
function resolveBranchForSet(existing) {
  const explicit = opts.branch?.trim();
  if (explicit) return explicit;
  if (isGitRepo(VAULT_PATH)) {
    const r = git(['symbolic-ref', '--short', 'HEAD']);
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return existing?.branch || DEFAULT_BRANCH;
}

/** .gitignore completo + deja de versionar lo que ya estaba trackeado por error */
function untrackIgnored() {
  ensureGitignore(VAULT_PATH);
  // -f: solo afecta a las rutas fijas de REQUIRED_IGNORES (estado por máquina),
  // nunca a contenido del usuario; sin él git rechaza un archivo con cambios staged
  gitOrFail(['rm', '-r', '-f', '--cached', '--ignore-unmatch', '--quiet', '--', ...REQUIRED_IGNORES]);
}

export function cmdRemoteSet(rawUrl) {
  const url = rawUrl?.trim();
  if (!url) fail(t('remote.urlRequired'));
  requireVault();
  if (!gitVersionAvailable()) fail(t('git.notAvailable'));
  validateRemoteUrl(url);

  const existing = readRemoteConfig();
  const branch   = resolveBranchForSet(existing);
  if (!isValidBranchName(branch)) fail(t('remote.invalidBranch', { branch }));

  if (!isGitRepo(VAULT_PATH)) {
    gitOrFail(['init']);
    gitOrFail(['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
  }
  // Primero el .gitignore y el untrack: si fallara, .git/config y remote.json
  // seguirían coherentes entre sí (ninguno apunta todavía a la URL nueva)
  untrackIgnored();
  const hasOrigin = git(['remote', 'get-url', 'origin']).status === 0;
  gitOrFail(hasOrigin ? ['remote', 'set-url', 'origin', url] : ['remote', 'add', 'origin', url]);

  const auto = opts.auto
    ? { pull_on_start: true, push_on_end: true }
    : (existing?.auto ?? { pull_on_start: false, push_on_end: false });
  writeRemoteConfig({ url, branch, auto, created_at: existing?.created_at ?? new Date().toISOString() });

  console.log(t('remote.set', { url: maskUrl(url), branch, auto: auto.pull_on_start || auto.push_on_end ? 'on' : 'off' }));
  console.log(t('remote.privateWarning'));
}

export function cmdRemoteShow() {
  requireVault();
  const config = requireRemoteConfig();
  const state  = readRemoteState();
  const masked = { ...config, url: maskUrl(config.url) };

  if (opts.json) {
    printJson({ ...masked, ...state });
    return;
  }
  console.log(t('remote.showUrl',      { url: masked.url }));
  console.log(t('remote.showBranch',   { branch: config.branch ?? DEFAULT_BRANCH }));
  console.log(t('remote.showAuto',     { pull: Boolean(config.auto?.pull_on_start), push: Boolean(config.auto?.push_on_end) }));
  console.log(t('remote.showLastPush', { at: state.last_push_at ?? t('remote.never') }));
  console.log(t('remote.showLastPull', { at: state.last_pull_at ?? t('remote.never') }));
}

export function cmdRemoteUnset() {
  requireVault();
  if (!fs.existsSync(REMOTE_CONFIG_PATH)) {
    console.log(t('remote.nothingToUnset'));
    return;
  }
  fs.rmSync(REMOTE_CONFIG_PATH, { force: true });
  console.log(t('remote.unset', { path: REMOTE_CONFIG_PATH }));
}

// ── Flujo compartido por push y pull ─────────────────────────────────────────

/** Se niega a operar con un merge a medias o con .git/index.lock presente */
function guardRepoIdle() {
  if (mergeInProgress(VAULT_PATH)) {
    const files = conflictedFiles(VAULT_PATH).map((f) => `  ${f}`).join('\n') || '  -';
    fail(t('remote.mergeInProgress', { path: VAULT_PATH, files }));
  }
  if (hasIndexLock(VAULT_PATH)) fail(t('remote.indexLock', { path: VAULT_PATH }));
}

function fetchOrFail() {
  gitOrFail(['fetch', '--prune', 'origin'], { timeout: NETWORK_TIMEOUT });
}

/** Backup verificado de la BD propia, WAL volcado y conexión cerrada antes de tocar git */
function snapshotAndClose() {
  const store = openStore();
  try {
    return createVerifiedBackup(store);
  } finally {
    store.db.pragma('wal_checkpoint(TRUNCATE)');
    store.db.close();
  }
}

/** .gitignore + git add -A; devuelve las rutas staged */
function stageAll() {
  ensureGitignore(VAULT_PATH);
  gitOrFail(['add', '-A']);
  const r = git(['diff', '--cached', '--name-only']);
  return r.status === 0 ? r.stdout.split('\n').map((l) => l.trim()).filter(Boolean) : [];
}

function failMerge(r) {
  const stderr = (r.stderr || r.stdout || '').trim();
  if (BOOTSTRAP_MERGE_ERRORS.test(r.stderr + r.stdout)) fail(t('pull.bootstrapHint', { path: VAULT_PATH, stderr }));
  fail(t('pull.failed', { stderr }));
}

/** Regla §3.5 sobre mempunk.db; deja la ganadora staged. Aborta con la salida si falla. */
function resolveDbOrFail() {
  let result;
  try {
    result = resolveDbConflict(VAULT_PATH, DB_REL_PATH);
  } catch (err) {
    fail(t('conflict.resolveFailed', { message: err.message, path: VAULT_PATH }));
  }
  console.log(t('conflict.resolved', {
    winner:   result.winner,
    oursAt:   result.oursAt || '-',
    theirsAt: result.theirsAt || '-',
    backup:   result.loserBackup,
  }));
  if (result.invalid) console.log(t('conflict.invalidSide', { side: result.invalid }));
  return result;
}

/**
 * `git merge` de la rama remota (nunca `git pull`). Conflicto en mempunk.db →
 * regla binaria; cualquier otro conflicto aborta dejando el merge en curso.
 * @returns {ReturnType<typeof resolveDbConflict>|null} Resultado del conflicto resuelto, si hubo
 */
function mergeRemote(branch) {
  const r = git(['merge', '--no-edit', remoteRef(branch)]);
  if (r.status === 0) return null;

  const conflicts = conflictedFiles(VAULT_PATH);
  if (conflicts.length === 0) failMerge(r);

  const conflict  = conflicts.includes(DB_REL_PATH) ? resolveDbOrFail() : null;
  const remaining = conflicts.filter((f) => f !== DB_REL_PATH);
  if (remaining.length > 0) {
    fail(t('push.conflict', { files: remaining.map((f) => `  ${f}`).join('\n'), path: VAULT_PATH }));
  }
  commitOrFail(['commit', '--no-edit']);
  return conflict;
}

function dbChangedSince(before) {
  if (!before) return true;
  return git(['diff', '--quiet', before, 'HEAD', '--', DB_REL_PATH]).status !== 0;
}

/** integrity_check de la BD tras el merge; si falla, restaura el backup y aborta */
function verifyMergedDb(backupPath) {
  const dbPath = path.join(VAULT_PATH, DB_REL_PATH);
  let result;
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    result = db.pragma('integrity_check');
    db.close();
  } catch (err) {
    result = [{ integrity_check: err.message }];
  }
  if (result?.[0]?.integrity_check === 'ok') return;

  fs.copyFileSync(backupPath, dbPath);
  fail(t('pull.integrityFailed', { result: JSON.stringify(result), backup: backupPath }));
}

/** Merge de origin/<branch> + integrity check si la BD cambió */
function integrateRemote({ branch, backupPath }) {
  const before   = headHash();
  const conflict = mergeRemote(branch);
  if (dbChangedSince(before)) verifyMergedDb(backupPath);
  return conflict;
}

// ── push ──────────────────────────────────────────────────────────────────────

/**
 * Deja solo texto imprimible: sin BOM ni caracteres de control (salvo \n),
 * CRLF → LF, recortado y con tope de longitud.
 */
export function sanitizeMessage(raw) {
  return String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    // Controles C0/C1 y overrides bidi/separadores Unicode: un mensaje con
    // U+202E puede mostrarse invertido al usuario o a un agente que lo lea
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028\u2029\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH)
    .trim();
}

function readMessageFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    fail(t('push.messageFileUnreadable', { path: file, message: err.message }));
  }
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

/** Precedencia: --message-file → --message-stdin → -m/--message */
function readRawMessage() {
  if (opts['message-file']) return readMessageFile(opts['message-file']);
  if (opts['message-stdin']) return readStdin();
  return opts.message ?? '';
}

function validatedProject() {
  const project = opts.project?.trim();
  if (!project) return null;
  if (!PROJECT_ID_RE.test(project)) fail(t('remote.invalidProject', { project }));
  return project;
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildCommitMessage(raw, project, fileCount) {
  const message = sanitizeMessage(raw);
  if (!message) return `vault: session ${todayLocal()} — ${fileCount} files`;
  return project ? `vault(${project}): ${message}` : `vault: ${message}`;
}

function isAhead(branch, remoteExists) {
  if (!headExists()) return false;
  if (!remoteExists) return true;
  return countCommits(`${remoteRef(branch)}..HEAD`) > 0;
}

function pushOrFail(branch) {
  const refspec = `refs/heads/${branch}:refs/heads/${branch}`;
  const r = git(['push', '-u', 'origin', refspec], { timeout: NETWORK_TIMEOUT });
  if (r.timedOut) fail(t('git.timeout', { command: 'push' }));
  if (r.status !== 0) fail(t('push.failed', { stderr: r.stderr.trim() }));
}

export function cmdPush() {
  const branch     = requireGitRepo().branch ?? DEFAULT_BRANCH;
  const rawMessage = readRawMessage();
  const project    = validatedProject();
  guardRepoIdle();

  fetchOrFail();
  const remoteExists = remoteBranchExists(branch);
  const backupPath   = snapshotAndClose();
  const staged       = stageAll();
  if (staged.length === 0 && !isAhead(branch, remoteExists)) {
    console.log(t('push.nothing', { branch }));
    return;
  }

  const message = staged.length > 0 ? buildCommitMessage(rawMessage, project, staged.length) : null;
  if (message) commitOrFail(['commit', '-m', message]);

  const conflict = remoteExists ? integrateRemote({ branch, backupPath }) : null;
  pushOrFail(branch);

  updateRemoteState({ last_push_at: new Date().toISOString() });
  console.log(t('push.done', {
    message: message ?? git(['log', '-1', '--format=%s']).stdout.trim(),
    hash:    git(['rev-parse', '--short', 'HEAD']).stdout.trim(),
    files:   staged.length,
    branch,
  }));
  exitIfStrict(conflict);
}

// ── pull ──────────────────────────────────────────────────────────────────────

/** Regenera project-paths.json y devuelve los proyectos sin ruta en esta máquina */
function remapProjectPaths() {
  const store = openStore();
  try {
    _writeProjectPathsFile(store);
    return typeof store.getProjectsMissingLocalPath === 'function'
      ? store.getProjectsMissingLocalPath()
      : [];
  } finally {
    store.db.close();
  }
}

function printMissingPaths(missing) {
  if (missing.length === 0) return;
  console.log(t('pull.missingPaths', { count: missing.length }));
  for (const project of missing) console.log(t('pull.missingPathHint', { id: project.id }));
}

function countReceived(before) {
  const after = headHash();
  if (!after) return 0;
  return before ? countCommits(`${before}..${after}`) : countCommits(after);
}

export function cmdPull() {
  const branch = requireGitRepo().branch ?? DEFAULT_BRANCH;
  guardRepoIdle();

  fetchOrFail();
  if (!remoteBranchExists(branch)) {
    console.log(t('pull.noRemoteBranch', { branch }));
    return;
  }

  const backupPath = snapshotAndClose();
  if (stageAll().length > 0) commitOrFail(['commit', '-m', PULL_COMMIT_MESSAGE]);

  const before   = headHash();
  const conflict = integrateRemote({ branch, backupPath });
  const commits  = countReceived(before);
  const missing  = remapProjectPaths();

  updateRemoteState({ last_pull_at: new Date().toISOString(), last_pull_commits: commits });
  console.log(t('pull.done', { commits, backup: backupPath }));
  printMissingPaths(missing);
  exitIfStrict(conflict);
}
