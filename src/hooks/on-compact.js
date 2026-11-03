// # mempunk-hook

// Evento: PreCompact — justo antes de que Claude Code compacte el contexto.
// Persiste el estado de la sesión (mensajes recientes, archivos editados y
// comandos corridos) como compact_snapshot en SQLite. No lee el transcript.
// Fuera del modo `full` de `mempunk auto-session` el snapshot no lleva los
// mensajes (raw_turns vacío): la BD viaja al remote del vault.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MEMPUNK_DIR, runCli, createLogger, readHookInput, getProjectId, readAutoSessionMode } from '../hooks-lib/common.js';
import {
  isValidSessionId,
  hasSessionState,
  readSessionState,
  toRawTurns,
} from '../hooks-lib/session-state.js';

const log = createLogger('on-compact');

function exit() {
  process.stdout.write('{}');
  process.exit(0);
}

try {
  const data = await readHookInput(['session_id', 'trigger'], log);
  if (!data) exit();

  const { session_id: sessionId, trigger, cwd } = data;
  if (!isValidSessionId(sessionId)) {
    log(`session_id inválido: ${JSON.stringify(sessionId)} — sin acción`);
    exit();
  }

  // Sin estado (p. ej. hooks instalados a mitad de sesión) un snapshot vacío
  // taparía al anterior del proyecto en la restauración: mejor no escribirlo
  if (!hasSessionState(sessionId)) {
    log(`Sin estado para la sesión ${sessionId} — sin snapshot`);
    exit();
  }

  const state = readSessionState(sessionId);
  const projectId = getProjectId(cwd) ?? state.project_id;
  if (!projectId) {
    log('Sin proyecto activo — sin acción');
    exit();
  }

  fs.mkdirSync(MEMPUNK_DIR, { recursive: true });
  const rawTurns = readAutoSessionMode(log) === 'full' ? toRawTurns(state.recent_messages) : [];
  const tmpFile = path.join(os.tmpdir(), `mempunk-compact-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify({
    project_id:    projectId,
    session_id:    sessionId,
    compact_type:  trigger,
    message_count: rawTurns.length,
    raw_turns:     JSON.stringify(rawTurns),
    files_found:   JSON.stringify(state.files_touched),
    commands_run:  JSON.stringify(state.commands_run),
  }), 'utf8');

  const result = runCli(['session', 'save-compact', tmpFile]);
  if (result.status === 0) {
    log(`CompactSnapshot guardado: proyecto=${projectId} tipo=${trigger} turnos=${rawTurns.length} archivos=${state.files_touched.length}`);
  } else {
    try { fs.unlinkSync(tmpFile); } catch (_) { /* el CLI pudo borrarlo */ }
    log(`Error al guardar CompactSnapshot: ${result.stderr?.trim() || result.error?.message || 'sin detalle'}`);
  }
} catch (err) {
  log(`Error inesperado: ${err.message}`);
}

exit();
