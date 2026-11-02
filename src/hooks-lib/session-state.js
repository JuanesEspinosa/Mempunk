// Estado por sesión de los hooks (Fase 3): un JSON por sesión en
// .mempunk/sessions/<session_id>.json que alimentan on-prompt y on-tool y del
// que on-stop y on-compact leen sus checkpoints y snapshots. Sustituye a leer
// el transcript de Claude Code, cuyo formato interno cambia entre versiones.
//
// Escritura atómica (temporal + rename): un lector nunca ve un JSON a medias.
// No hay bloqueo entre procesos: dos hooks simultáneos de la misma sesión
// (p. ej. PostToolUse de herramientas en paralelo) pueden perder una entrada
// del otro. Es un registro de mejor esfuerzo, no datos del vault.

import fs from 'node:fs';
import path from 'node:path';
import { MEMPUNK_DIR } from './common.js';

export const SESSIONS_DIR = path.join(MEMPUNK_DIR, 'sessions');

export const MAX_FILES_TOUCHED = 200;
export const MAX_COMMANDS_RUN  = 50;
export const MAX_COMMAND_CHARS = 200;
export const MAX_MESSAGES      = 10;
export const MAX_MESSAGE_CHARS = 2000;

// Los estados de sesiones que no se tocan en este tiempo se borran en SessionStart
export const STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// session_id llega por stdin y acaba en una ruta: solo caracteres de palabra y guiones
const SESSION_ID_RE = /^[\w-]+$/;

export function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && SESSION_ID_RE.test(sessionId);
}

function statePath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function emptyState(now) {
  return {
    project_id: null,
    started_at: now,
    turns: 0,
    first_prompt: null,
    files_touched: [],
    commands_run: [],
    recent_messages: [],
    last_checkpoint_turn: 0,
    updated_at: now,
  };
}

const LIST_FIELDS    = ['files_touched', 'commands_run', 'recent_messages'];
const COUNTER_FIELDS = ['turns', 'last_checkpoint_turn'];

/** Estado leído del disco con los tipos garantizados: un campo con un tipo
 *  inesperado (edición a mano, formato futuro) vuelve a su valor por defecto
 *  en vez de hacer fallar cada evento. */
function normalizeState(parsed, now) {
  const base = emptyState(typeof parsed.started_at === 'string' ? parsed.started_at : now);
  const state = { ...base, ...parsed };
  for (const field of LIST_FIELDS) if (!Array.isArray(state[field])) state[field] = base[field];
  for (const field of COUNTER_FIELDS) if (!Number.isFinite(state[field])) state[field] = base[field];
  if (typeof state.first_prompt !== 'string' || !state.first_prompt) state.first_prompt = null;
  if (typeof state.project_id !== 'string') state.project_id = null;
  return state;
}

/** Estado de la sesión, o uno vacío si no existe o está corrupto.
 *  Lanza si el id no es válido o si la lectura falla por otra causa (p. ej. un
 *  EBUSY del antivirus en Windows): empezar de cero ahí sobrescribiría el estado bueno. */
export function readSessionState(sessionId) {
  if (!isValidSessionId(sessionId)) throw new Error(`session_id inválido: ${JSON.stringify(sessionId)}`);
  const now = new Date().toISOString();
  let raw;
  try {
    raw = fs.readFileSync(statePath(sessionId), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return emptyState(now);
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return normalizeState(parsed, now);
  } catch (_) { /* JSON corrupto: se reemplaza por un estado vacío */ }
  return emptyState(now);
}

/** True si la sesión ya tiene un estado guardado. */
export function hasSessionState(sessionId) {
  return isValidSessionId(sessionId) && fs.existsSync(statePath(sessionId));
}

// En Windows el rename falla con EPERM/EBUSY si otro proceso tiene abierto el
// destino en ese instante (otro hook leyendo, antivirus): se reintenta un poco
const RENAME_RETRIES  = 3;
const RENAME_DELAY_MS = 15;
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (attempt >= RENAME_RETRIES || !RETRYABLE_RENAME_CODES.has(err.code)) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_DELAY_MS);
    }
  }
}

/** Aplica `update(state) → nuevoEstado` y lo guarda de forma atómica. Devuelve el estado guardado. */
export function updateSessionState(sessionId, update) {
  const next = { ...update(readSessionState(sessionId)), updated_at: new Date().toISOString() };
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const target = statePath(sessionId);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(next), 'utf8');
    renameWithRetry(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* puede no existir */ }
    throw err;
  }
  return next;
}

/** Corta `text` a `max` caracteres; no-strings → ''. */
export function truncate(text, max) {
  return typeof text === 'string' ? text.slice(0, max) : '';
}

/** Añade `item` al final sin duplicados (lo mueve al final si ya estaba), quedándose con los últimos `max`. */
export function appendUnique(list, item, max) {
  return [...list.filter((x) => x !== item), item].slice(-max);
}

/** Añade `item` al final, quedándose con los últimos `max`. */
export function appendBounded(list, item, max) {
  return [...list, item].slice(-max);
}

/** Mensajes recientes con la forma de raw_turns que ya entienden context.js,
 *  `session recover` y el respaldo de on-start. */
export function toRawTurns(recentMessages) {
  return recentMessages.map(({ role, text }) => ({
    type: role === 'user' ? 'user' : 'assistant',
    message: { role, content: text },
  }));
}

/** Borra los estados no actualizados en `maxAgeMs` y los temporales huérfanos. Devuelve cuántos borró. */
export function pruneSessionStates(maxAgeMs = STATE_MAX_AGE_MS, now = Date.now()) {
  let removed = 0;
  let entries;
  try {
    entries = fs.readdirSync(SESSIONS_DIR);
  } catch (_) {
    return 0;
  }
  for (const name of entries) {
    if (!name.endsWith('.json') && !name.endsWith('.tmp')) continue;
    const file = path.join(SESSIONS_DIR, name);
    try {
      if (now - fs.statSync(file).mtimeMs > maxAgeMs) {
        fs.unlinkSync(file);
        removed++;
      }
    } catch (_) { /* otro proceso pudo borrarlo */ }
  }
  return removed;
}
