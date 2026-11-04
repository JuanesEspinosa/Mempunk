// # mempunk-hook

// Evento: PostToolUse — después de cada herramienta que matchee el registro de
// `hooks install` (Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell).
// Registra en el estado de la sesión los archivos editados de verdad y los
// comandos corridos, en vez de adivinarlos con una regex sobre el transcript.

import fs from 'node:fs';
import path from 'node:path';
import { MEMPUNK_DIR, createLogger, readHookInput, exitIfPluginOwnsHooks } from '../hooks-lib/common.js';
import {
  isValidSessionId,
  updateSessionState,
  appendUnique,
  appendBounded,
  truncate,
  MAX_FILES_TOUCHED,
  MAX_COMMANDS_RUN,
  MAX_COMMAND_CHARS,
} from '../hooks-lib/session-state.js';
import { redactSecrets } from '../hooks-lib/redact.js';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const COMMAND_TOOLS = new Set(['Bash', 'PowerShell']);

const log = createLogger('on-tool');
exitIfPluginOwnsHooks(log);

/** Ruta relativa al cwd si está dentro de él (más legible al restaurar), con separadores /. */
function displayPath(filePath, cwd) {
  let shown = filePath;
  if (cwd && path.isAbsolute(filePath)) {
    const rel = path.relative(cwd, filePath);
    const outside = rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
    if (rel && !outside) shown = rel;
  }
  return shown.replace(/\\/g, '/');
}

/** Cambio a aplicar al estado según la herramienta, o null si no hay nada que registrar. */
function stateChange(toolName, toolInput, cwd) {
  if (FILE_TOOLS.has(toolName)) {
    // Solo Write.file_path está en la doc de hooks: se aceptan ambos nombres
    const filePath = toolInput.file_path ?? toolInput.notebook_path;
    if (typeof filePath !== 'string' || !filePath) {
      log(`Contrato: ${toolName} sin file_path ni notebook_path en tool_input — sin acción`);
      return null;
    }
    const shown = displayPath(filePath, cwd);
    return (state) => ({ ...state, files_touched: appendUnique(state.files_touched, shown, MAX_FILES_TOUCHED) });
  }
  if (COMMAND_TOOLS.has(toolName)) {
    const command = truncate(redactSecrets(toolInput.command), MAX_COMMAND_CHARS).trim();
    if (!command) return null;
    return (state) => ({ ...state, commands_run: appendBounded(state.commands_run, command, MAX_COMMANDS_RUN) });
  }
  return null;
}

try {
  const data = await readHookInput(['session_id', 'tool_name', 'tool_input'], log);
  if (data) {
    const { session_id: sessionId, tool_name: toolName, tool_input: toolInput, cwd } = data;
    if (!isValidSessionId(sessionId)) {
      log(`session_id inválido: ${JSON.stringify(sessionId)} — sin acción`);
    } else if (typeof toolInput === 'object') {
      const change = stateChange(toolName, toolInput, cwd);
      if (change) {
        fs.mkdirSync(MEMPUNK_DIR, { recursive: true });
        updateSessionState(sessionId, change);
      }
    }
  }
} catch (err) {
  log(`Error inesperado: ${err.message}`);
}

process.exit(0);
