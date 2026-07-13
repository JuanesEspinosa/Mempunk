// # mempunk-hook

// Evento: Stop — al final de cada respuesta de Claude Code.
// Guarda un checkpoint incremental en SQLite cada INTERVAL turnos de usuario.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import {
  MEMPUNK_DIR,
  FILE_RE,
  runCli,
  createLogger,
  readStdinJson,
  getProjectId,
  isRealUserTurn,
  extractText,
} from '../hooks-lib/common.js';

const CHECKPOINT_STATE = path.join(MEMPUNK_DIR, 'checkpoint-state.json');

// Número de turnos entre checkpoints
const INTERVAL = parseInt(process.env.MEMPUNK_CHECKPOINT_INTERVAL ?? '5', 10);

// Número de mensajes recientes a guardar en el checkpoint
const MAX_TURNS = 10;

const log = createLogger('on-stop');

// Sesiones a retener en checkpoint-state.json — el estado es por sesión para
// que dos sesiones concurrentes no se reseteen el contador mutuamente
const MAX_TRACKED_SESSIONS = 20;

/** Estado { [session_id]: last_saved_turn }. Convierte el formato legacy. */
function readCheckpointState() {
  try {
    const data = JSON.parse(fs.readFileSync(CHECKPOINT_STATE, 'utf8'));
    if (typeof data?.session_id === 'string') {
      return { [data.session_id]: data.last_saved_turn ?? 0 };
    }
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

function writeCheckpointState(state) {
  const entries = Object.entries(state);
  const pruned = entries.length > MAX_TRACKED_SESSIONS
    ? Object.fromEntries(entries.slice(-MAX_TRACKED_SESSIONS))
    : state;
  try {
    fs.writeFileSync(CHECKPOINT_STATE, JSON.stringify(pruned), 'utf8');
  } catch (_) {}
}

/** Parsea el transcript JSONL: cuenta turnos de usuario y extrae últimos MAX_TURNS mensajes */
async function parseTranscript(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return { turnCount: 0, turns: [], filesFound: [] };
  }

  const turns = [];
  const filesSet = new Set();
  let turnCount = 0;

  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(transcriptPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);

        if (isRealUserTurn(entry)) turnCount++;

        // Extraer texto para detectar archivos
        const textContent = extractText(entry);
        if (textContent) {
          let m;
          while ((m = FILE_RE.exec(textContent)) !== null) {
            filesSet.add(m[1].replace(/\\/g, '/'));
          }
        }

        // raw_turns: solo conversación real (sin tool_results ni subagentes)
        if (isRealUserTurn(entry) ||
            (entry.message?.role === 'assistant' && !entry.isSidechain)) {
          turns.push(entry);
        }
      } catch (_) {}
    }
  } catch (_) {}

  return {
    turnCount,
    turns: turns.slice(-MAX_TURNS),
    filesFound: [...filesSet],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

try {
  fs.mkdirSync(MEMPUNK_DIR, { recursive: true });

  const data = await readStdinJson();
  const { session_id: sessionId, transcript_path: transcriptPath, cwd } = data;

  if (!sessionId || !transcriptPath) {
    log('Sin session_id o transcript_path — sin acción');
    process.exit(0);
  }

  const projectId = getProjectId(cwd);
  if (!projectId) {
    log('Sin proyecto activo — sin acción');
    process.exit(0);
  }

  const checkpointState = readCheckpointState();
  const { turnCount, turns, filesFound } = await parseTranscript(transcriptPath);

  const turnsSinceLast = turnCount - (checkpointState[sessionId] ?? 0);

  if (turnsSinceLast < INTERVAL) {
    // Aún no es momento de guardar un checkpoint
    process.exit(0);
  }

  // Guardar checkpoint
  const tmpFile = path.join(os.tmpdir(), `mempunk-checkpoint-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify({
    project_id: projectId,
    session_id: sessionId,
    turn_count: turnCount,
    raw_turns:  JSON.stringify(turns),
    files_found: JSON.stringify(filesFound),
  }), 'utf8');

  const result = runCli(['session', 'save-checkpoint', tmpFile]);

  if (result.status === 0) {
    writeCheckpointState({ ...checkpointState, [sessionId]: turnCount });
    log(`Checkpoint guardado: proyecto=${projectId} turno=${turnCount} archivos=${filesFound.length}`);
  } else {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    const err = result.stderr?.trim() || result.error?.message || 'sin detalle';
    log(`Error al guardar checkpoint: ${err}`);
  }
} catch (err) {
  log(`Error inesperado: ${err.message}`);
}

process.exit(0);
