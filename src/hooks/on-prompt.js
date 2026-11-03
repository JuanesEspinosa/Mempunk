// # mempunk-hook

// Evento: UserPromptSubmit — antes de cada mensaje del usuario.
// Cuenta el turno y guarda el prompt en el estado de la sesión
// (.mempunk/sessions/<session_id>.json). Es la única fuente de turnos reales:
// on-stop ya no cuenta turnos leyendo el transcript.

import fs from 'node:fs';
import { MEMPUNK_DIR, createLogger, readHookInput, getProjectId, exitIfPluginOwnsHooks } from '../hooks-lib/common.js';
import {
  isValidSessionId,
  updateSessionState,
  appendBounded,
  truncate,
  MAX_MESSAGES,
  MAX_MESSAGE_CHARS,
} from '../hooks-lib/session-state.js';

const log = createLogger('on-prompt');
exitIfPluginOwnsHooks(log);

try {
  const data = await readHookInput(['session_id', 'prompt'], log);
  if (data) {
    const { session_id: sessionId, prompt, cwd } = data;
    if (!isValidSessionId(sessionId)) {
      log(`session_id inválido: ${JSON.stringify(sessionId)} — sin acción`);
    } else {
      fs.mkdirSync(MEMPUNK_DIR, { recursive: true });
      const text = truncate(prompt, MAX_MESSAGE_CHARS);
      updateSessionState(sessionId, (state) => ({
        ...state,
        project_id: state.project_id ?? getProjectId(cwd),
        turns: state.turns + 1,
        first_prompt: state.first_prompt || text || null,
        recent_messages: text
          ? appendBounded(state.recent_messages, { role: 'user', text }, MAX_MESSAGES)
          : state.recent_messages,
      }));
    }
  }
} catch (err) {
  log(`Error inesperado: ${err.message}`);
}

process.stdout.write('{}');
process.exit(0);
