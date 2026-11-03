import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { VAULT_PATH } from '../lib/vault.js';
import { gitEnv } from '../lib/git.js';

// ── push --background ────────────────────────────────────────────────────────
//
// Supervisor del push que lanza el hook SessionEnd desacoplado: nadie lee su
// salida, así que ejecuta el push normal como proceso hijo y deja el resultado
// en last-push.json (lo lee on-start para avisar) y en hooks.log. El push
// normal termina con process.exit() al fallar; por eso va en otro proceso.

export const LAST_PUSH_PATH = path.join(VAULT_PATH, '.mempunk', 'last-push.json');
const HOOKS_LOG_PATH        = path.join(VAULT_PATH, '.mempunk', 'hooks.log');

// Tope del push hijo: fetch + push de red, más holgado que el del hook
const CHILD_TIMEOUT_MS = 5 * 60_000;
const MAX_STORED_STDERR = 500;

function logLine(message) {
  try {
    fs.appendFileSync(HOOKS_LOG_PATH, `${new Date().toISOString()} [push-bg] ${message}\n`);
  } catch (_) { /* sin log no se pierde el resultado: queda en last-push.json */ }
}

/** Escritura atómica: on-start puede leerlo mientras se escribe */
function writeLastPush(result) {
  const tmp = `${LAST_PUSH_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(result, null, 2));
  fs.renameSync(tmp, LAST_PUSH_PATH);
}

/**
 * Ejecuta `push` en un proceso hijo y registra el resultado. El mensaje va por
 * stdin (--message-stdin) para no depender del quoting de ningún shell. Todo se
 * valida en el hijo, así cualquier error queda en last-push.json.
 * Al empezar deja un resultado provisional `ok: null` con su PID: si el proceso
 * muere sin terminar (p. ej. al cerrarse Claude Code), on-start lo detecta.
 * @param {{ message: string, messageFile: string|null, project: string|null }} params
 * @returns {number} código de salida del hijo (1 si no terminó)
 */
export function runBackgroundPush({ message, messageFile, project }) {
  try {
    writeLastPush({ at: new Date().toISOString(), ok: null, pid: process.pid, notified: false });
  } catch (err) {
    logLine(`No se pudo escribir last-push.json provisional: ${err.message}`);
  }
  const args = [
    process.argv[1], 'push',
    ...(messageFile ? ['--message-file', messageFile] : message ? ['--message-stdin'] : []),
    ...(project ? ['--project', project] : []),
  ];
  const child = spawnSync(process.execPath, args, {
    input: message ?? '',
    encoding: 'utf8',
    env: { ...gitEnv(), MEMPUNK_VAULT: VAULT_PATH },
    timeout: CHILD_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    windowsHide: true,
  });

  const ok     = child.status === 0;
  const stderr = (child.stderr || child.error?.message || '').trim().slice(0, MAX_STORED_STDERR);
  const result = {
    at:         new Date().toISOString(),
    ok,
    status:     child.status,
    signal:     child.signal,
    error_code: child.error?.code ?? null,
    stderr:     ok ? '' : stderr,
    notified:   false,
  };

  try {
    writeLastPush(result);
  } catch (err) {
    logLine(`No se pudo escribir last-push.json: ${err.message}`);
  }
  logLine(ok
    ? `Push OK: ${(child.stdout ?? '').trim().split('\n').pop()}`
    : `Push falló (status=${child.status ?? 'null'}, signal=${child.signal ?? '-'}): ${stderr || 'sin detalle'}`);

  return child.status ?? 1;
}
