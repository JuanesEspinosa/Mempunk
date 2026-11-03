import fs from 'node:fs';
import path from 'node:path';
import { VAULT_PATH } from './vault.js';
import { fail } from './output.js';
import { t } from './i18n.js';

// ── Lock de sincronización del vault ─────────────────────────────────────────
//
// push y pull lo toman para no operar a la vez sobre el mismo repo (p. ej. el
// pull de SessionStart contra el push en segundo plano de la sesión anterior).
// El nombre `push.lock` aparece en el mensaje de error: los hooks lo usan para
// clasificar el fallo como `locked` sin depender del idioma.
//
// El lock se publica completo y de forma atómica (temporal + link), así que un
// lock ilegible solo puede ser basura de otra versión o del disco: se trata como
// vivo hasta que su mtime caduca, nunca como huérfano al instante.

export const SYNC_LOCK_PATH = path.join(VAULT_PATH, '.mempunk', 'push.lock');

// Un lock más viejo que esto es de un proceso muerto o colgado
const STALE_LOCK_MS = 10 * 60_000;

/** { raw, lock, mtimeMs } del lock actual, o null si no existe */
function readLock() {
  let raw;
  let mtimeMs;
  try {
    raw = fs.readFileSync(SYNC_LOCK_PATH, 'utf8');
    mtimeMs = fs.statSync(SYNC_LOCK_PATH).mtimeMs;
  } catch (_) {
    return null;
  }
  let lock = null;
  try { lock = JSON.parse(raw); } catch (_) { /* ilegible: se juzga por mtime */ }
  return { raw, lock, mtimeMs };
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: existe pero es de otro usuario
    return err.code === 'EPERM';
  }
}

/** Huérfano: más viejo que STALE_LOCK_MS, o legible y de un PID que ya no existe */
function isStale({ lock, mtimeMs }) {
  const at  = Date.parse(lock?.at);
  const age = Date.now() - (Number.isFinite(at) ? at : mtimeMs);
  if (age > STALE_LOCK_MS) return true;
  return lock !== null && !processAlive(lock.pid);
}

/** Publica el lock completo: temporal + link (falla con EEXIST si ya existe) */
function tryCreate(command) {
  const tmp = `${SYNC_LOCK_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ pid: process.pid, command, at: new Date().toISOString() }));
  try {
    fs.linkSync(tmp, SYNC_LOCK_PATH);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) { /* ya no existe */ }
  }
}

/**
 * Retira un lock huérfano sin borrar uno nuevo de otro proceso: lo aparta con
 * rename (atómico; solo un proceso lo consigue) y comprueba que lo apartado es
 * lo mismo que se juzgó huérfano. Si no lo es, lo devuelve a su sitio.
 */
function reapStale(judged) {
  const aside = `${SYNC_LOCK_PATH}.stale.${process.pid}`;
  try {
    fs.renameSync(SYNC_LOCK_PATH, aside);
  } catch (_) {
    return; // otro proceso lo retiró antes
  }
  let raw = null;
  try { raw = fs.readFileSync(aside, 'utf8'); } catch (_) { /* se trata como distinto */ }
  if (raw !== judged.raw) {
    // Era el lock recién creado por otro: se restaura (si ya hay otro, el link falla y gana ese)
    try { fs.linkSync(aside, SYNC_LOCK_PATH); } catch (_) { /* ya hay un lock vigente */ }
  }
  try { fs.unlinkSync(aside); } catch (_) { /* ya no existe */ }
}

function failLocked(held) {
  fail(t('sync.locked', {
    command: held?.lock?.command ?? '?',
    pid:     held?.lock?.pid ?? '?',
    at:      held?.lock?.at ?? '?',
    path:    SYNC_LOCK_PATH,
  }));
}

function releaseIfOwned() {
  if (readLock()?.lock?.pid !== process.pid) return;
  try { fs.unlinkSync(SYNC_LOCK_PATH); } catch (_) { /* ya no existe */ }
}

/**
 * Toma el lock de sincronización o aborta con un error claro si otro proceso lo
 * tiene. Se libera solo al salir del proceso (incluido `fail()`).
 * @param {'push'|'pull'} command
 */
export function acquireSyncLock(command) {
  fs.mkdirSync(path.dirname(SYNC_LOCK_PATH), { recursive: true });
  if (!tryCreate(command)) {
    const held = readLock();
    if (held && !isStale(held)) failLocked(held);
    if (held) reapStale(held);
    // Un solo reintento: si otro proceso ganó la carrera, se aborta
    if (!tryCreate(command)) failLocked(readLock());
  }
  process.on('exit', releaseIfOwned);
}
