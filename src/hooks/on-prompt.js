// # mempunk-hook

// Evento: UserPromptSubmit — antes de cada mensaje del usuario.
// Hoy no hace nada: el % de contexto se muestra solo en la statusline, que usa
// el dato real de Claude Code (plan v3, 0.2). El hook sigue registrado porque
// la Fase 3 lo usa para contar turnos reales.

import { createLogger, readStdinJson } from '../hooks-lib/common.js';

const log = createLogger('on-prompt');

try {
  // Consumir stdin para no dejar el pipe de Claude Code a medio escribir
  await readStdinJson();
} catch (err) {
  log(`stdin inválido: ${err.message}`);
}

process.stdout.write('{}');
process.exit(0);
