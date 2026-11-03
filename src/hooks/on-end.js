// # mempunk-hook

// Evento: SessionEnd — al cerrar la sesión de Claude Code.
// 1. Registro de sesión automático desde el estado de la sesión (Fase 3B): si
//    el agente ya guardó la sesión, el CLI solo le añade los archivos que falten.
//    `mempunk auto-session` elige el modo: full (con extractos), minimal (sin
//    extractos de la conversación) u off (sin registro).
// 2. Si .mempunk/remote.json tiene auto.push_on_end: lanza `mempunk push
//    --background` desacoplado (Fase 3C) con mensaje genérico como red de
//    seguridad, y sale sin esperarlo. El resultado queda en last-push.json y el
//    siguiente SessionStart avisa si falló. El commit "bueno" con resumen lo hace
//    el agente mempunk-syncer.
// SessionEnd ignora stdout — no se escribe nada.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  MEMPUNK_DIR,
  runCli,
  spawnCliDetached,
  createLogger,
  readStdinJson,
  getProjectId,
  readRemoteConfig,
  readAutoSessionMode,
  hookTimeoutMs,
  hookT,
} from '../hooks-lib/common.js';
import { isValidSessionId, hasSessionState, readSessionState, truncate } from '../hooks-lib/session-state.js';

const AUTO_PUSH_MESSAGE = 'auto-push on session end';

// Mismo contrato que `mempunk push --project`: solo identificadores simples
const PROJECT_ID_RE = /^[\w.-]+$/;

const MAX_LOGGED_STDERR = 500;

// Tope del registro automático: es una escritura local en SQLite
const AUTO_LOG_TIMEOUT_MS = 10_000;

// Largo de cada parte del resumen automático
const SUMMARY_PROMPT_CHARS = 300;
const SUMMARY_REPLY_CHARS  = 700;

const log = createLogger('on-end');

/** Argumentos --project para el push; vacío (y log) si el id mapeado no es válido */
function projectArgs(projectId) {
  if (!projectId) return [];
  if (PROJECT_ID_RE.test(projectId)) return ['--project', projectId];
  log(`Proyecto ignorado: id inválido para --project: ${JSON.stringify(projectId)}`);
  return [];
}

/** Resumen del registro automático: cabecera y, en modo full, primer prompt +
 *  última respuesta truncados. */
function buildSummary(state, mode) {
  const header = hookT('autosession.header', { turns: state.turns });
  if (mode !== 'full') return header;
  const lastReply = [...state.recent_messages].reverse().find((m) => m.role === 'assistant')?.text;
  const lines = [header];
  if (state.first_prompt) lines.push(hookT('autosession.prompt', { text: truncate(state.first_prompt, SUMMARY_PROMPT_CHARS) }));
  if (lastReply) lines.push(hookT('autosession.reply', { text: truncate(lastReply, SUMMARY_REPLY_CHARS) }));
  return lines.join('\n');
}

/** Escribe el registro de sesión automático vía CLI. Nunca lanza. */
function recordAutoSession(sessionId, cwd) {
  if (!isValidSessionId(sessionId)) {
    log(`Registro automático omitido: session_id inválido ${JSON.stringify(sessionId)}`);
    return;
  }
  if (!hasSessionState(sessionId)) return; // sesión sin prompts: nada que registrar

  const mode = readAutoSessionMode(log);
  if (mode === 'off') return;

  const state = readSessionState(sessionId);
  if (state.turns === 0 && state.files_touched.length === 0) return;
  const projectId = getProjectId(cwd) ?? state.project_id;
  if (!projectId) {
    log('Registro automático omitido: sin proyecto activo');
    return;
  }

  const tmpFile = path.join(os.tmpdir(), `mempunk-autosession-${process.pid}-${Date.now()}.json`);
  // Lleva el texto de la conversación: solo legible por el usuario, y sin pisar
  // un archivo existente
  fs.writeFileSync(tmpFile, JSON.stringify({
    project_id:    projectId,
    summary:       buildSummary(state, mode),
    files_touched: state.files_touched,
    since:         state.started_at,
  }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });

  try {
    const result = runCli(['session', 'save-auto', tmpFile], { timeout: hookTimeoutMs(AUTO_LOG_TIMEOUT_MS) });
    if (result.status === 0) {
      log(`Registro automático: ${result.stdout?.trim() || 'ok'} (proyecto=${projectId}, archivos=${state.files_touched.length})`);
    } else {
      const err = (result.stderr?.trim() || result.error?.message || 'sin detalle').slice(0, MAX_LOGGED_STDERR);
      log(`Registro automático falló (status=${result.status ?? 'null'}): ${err}`);
    }
  } finally {
    // El CLI lo borra al leerlo; si no llegó a leerlo (vault desactualizado, timeout) se borra aquí
    try { fs.unlinkSync(tmpFile); } catch (_) { /* ya no existe */ }
  }
}

try {
  fs.mkdirSync(MEMPUNK_DIR, { recursive: true });

  const { session_id: sessionId, cwd, reason } = await readStdinJson();

  // Antes del push, para que el registro viaje en él
  try {
    recordAutoSession(sessionId, cwd);
  } catch (err) {
    log(`Registro automático: error inesperado: ${err.message}`);
  }

  const remote = readRemoteConfig();
  if (remote?.auto?.push_on_end) {
    const projectId = getProjectId(cwd);
    const args = ['push', '--background', '-m', AUTO_PUSH_MESSAGE, ...projectArgs(projectId)];
    try {
      const pid = spawnCliDetached(args);
      log(`Push en segundo plano lanzado (pid=${pid ?? '?'}, reason=${reason ?? 'desconocido'}, proyecto=${projectId ?? 'ninguno'})`);
    } catch (err) {
      log(`Push en segundo plano: no se pudo lanzar: ${err.message}`);
    }
  }
} catch (err) {
  log(`Error inesperado: ${err.message}`);
}

process.exit(0);
