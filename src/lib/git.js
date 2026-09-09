import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// ── Wrapper de git — siempre spawnSync con args en array, nunca shell ─────────

const MAX_BUFFER = 16 * 1024 * 1024;

/** Timeout por defecto de cualquier comando git (ms) */
export const DEFAULT_TIMEOUT = 120_000;
/** Timeout de los comandos que tocan la red — fetch / push (ms) */
export const NETWORK_TIMEOUT = 60_000;

/**
 * Variables que desactivan TODO prompt de git: terminal, askpass (Git Bash y
 * VS Code exportan GIT_ASKPASS/SSH_ASKPASS y git los usa antes que la terminal)
 * y Git Credential Manager. Con ellas, sin credenciales git falla en ~1 s con
 * "terminal prompts disabled" en vez de colgar al hook 60 s esperando un GUI.
 */
export const NON_INTERACTIVE_GIT_ENV = Object.freeze({
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
  SSH_ASKPASS_REQUIRE: 'never',
  GCM_INTERACTIVE: 'never',
});

/** Entorno para git sin prompts interactivos (ver NON_INTERACTIVE_GIT_ENV). */
export function gitEnv() {
  return { ...process.env, ...NON_INTERACTIVE_GIT_ENV };
}

/**
 * Ejecuta git y devuelve la salida como texto.
 * @param {string[]} args
 * @param {{ cwd?: string, timeout?: number }} [options]
 * @returns {{ status: number|null, stdout: string, stderr: string, error?: Error, timedOut: boolean }}
 */
export function runGit(args, { cwd, timeout = DEFAULT_TIMEOUT } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER, timeout, env: gitEnv() });
  return {
    status:   r.status,
    stdout:   r.stdout ?? '',
    stderr:   r.stderr ?? '',
    error:    r.error,
    timedOut: r.status === null && (r.error?.code === 'ETIMEDOUT' || Boolean(r.signal)),
  };
}

/** true si git está en el PATH y responde */
export function gitVersionAvailable() {
  return runGit(['--version']).status === 0;
}

/** true si `dir` es la raíz de un repositorio git (tiene su propio .git) */
export function isGitRepo(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

/** Rutas con conflicto de merge pendiente, relativas a la raíz del repo */
export function conflictedFiles(dir) {
  const { stdout } = runGit(['diff', '--name-only', '--diff-filter=U'], { cwd: dir });
  return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** true si hay un merge a medias (MERGE_HEAD existe) */
export function mergeInProgress(dir) {
  return runGit(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: dir }).status === 0;
}

/** true si .git/index.lock existe — otro git corriendo o uno que murió a medias */
export function hasIndexLock(dir) {
  return fs.existsSync(path.join(dir, '.git', 'index.lock'));
}

/**
 * Nombre de rama seguro para pasar a git: sin guion inicial (sería una opción),
 * sin espacios, y aceptado por `git check-ref-format`.
 */
export function isValidBranchName(branch) {
  if (typeof branch !== 'string' || branch === '') return false;
  if (/^-/.test(branch) || /\s/.test(branch)) return false;
  return runGit(['check-ref-format', `refs/heads/${branch}`]).status === 0;
}
