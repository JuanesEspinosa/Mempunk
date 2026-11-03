// # mempunk-hook

// Evento: Stop — al final de cada respuesta de Claude Code.
// Guarda `last_assistant_message` en el estado de la sesión y, cada INTERVAL
// turnos (contados por on-prompt), escribe un checkpoint en SQLite desde ese
// estado. No lee el transcript: el coste no depende del largo de la sesión.
// Fuera del modo `full` de `mempunk auto-session` el checkpoint no lleva los
// mensajes (raw_turns vacío): la BD viaja al remote del vault.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MEMPUNK_DIR, runCli, createLogger, readHookInput, getProjectId, readAutoSessionMode } from '../hooks-lib/common.js';
import {
  isValidSessionId,
  updateSessionState,
  appendBounded,
  truncate,
  toRawTurns,
  MAX_MESSAGES,
  MAX_MESSAGE_CHARS,
} from '../hooks-lib/session-state.js';

// Número de turnos entre checkpoints
const INTERVAL = parseInt(process.env.MEMPUNK_CHECKPOINT_INTERVAL ?? '5', 10);

const log = createLogger('on-stop');

/** Persiste el checkpoint vía CLI. Devuelve true si se guardó. */
function saveCheckpoint(projectId, sessionId, state) {
  const tmpFile = path.join(os.tmpdir(), `mempunk-checkpoint-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify({
    project_id:  projectId,
    session_id:  sessionId,
    turn_count:  state.turns,
    raw_turns:   JSON.stringify(readAutoSessionMode(log) === 'full' ? toRawTurns(state.recent_messages) : []),
    files_found: JSON.stringify(state.files_touched),
  }), 'utf8');

  const result = runCli(['session', 'save-checkpoint', tmpFile]);
  if (result.status === 0) return true;

  try { fs.unlinkSync(tmpFile); } catch (_) { /* el CLI pudo borrarlo */ }
  log(`Error al guardar checkpoint: ${result.stderr?.trim() || result.error?.message || 'sin detalle'}`);
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────

try {
  const data = await readHookInput(['session_id'], log);
  if (data) {
    const { session_id: sessionId, last_assistant_message: message, cwd } = data;
    // Sin el mensaje se sigue: el checkpoint depende de los turnos, no de él
    if (message === undefined) log('Contrato: falta last_assistant_message en Stop — se sigue sin él');
    if (!isValidSessionId(sessionId)) {
      log(`session_id inválido: ${JSON.stringify(sessionId)} — sin acción`);
    } else {
      fs.mkdirSync(MEMPUNK_DIR, { recursive: true });
      const text = truncate(message, MAX_MESSAGE_CHARS);
      const state = updateSessionState(sessionId, (current) => ({
        ...current,
        recent_messages: text
          ? appendBounded(current.recent_messages, { role: 'assistant', text }, MAX_MESSAGES)
          : current.recent_messages,
      }));

      if (state.turns - state.last_checkpoint_turn >= INTERVAL) {
        const projectId = getProjectId(cwd) ?? state.project_id;
        if (!projectId) {
          log('Sin proyecto activo — sin checkpoint');
        } else if (saveCheckpoint(projectId, sessionId, state)) {
          updateSessionState(sessionId, (current) => ({ ...current, last_checkpoint_turn: state.turns }));
          log(`Checkpoint guardado: proyecto=${projectId} turno=${state.turns} archivos=${state.files_touched.length}`);
        }
      }
    }
  }
} catch (err) {
  log(`Error inesperado: ${err.message}`);
}

process.exit(0);
