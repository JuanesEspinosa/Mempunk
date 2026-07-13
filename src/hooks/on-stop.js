#!/usr/bin/env node
// # mempunk-hook

// Evento: Stop — al final de cada respuesta de Claude Code.
// Guarda un checkpoint incremental en SQLite cada INTERVAL turnos de usuario.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const VAULT_PATH       = process.env.MEMPUNK_VAULT?.trim() || path.join(os.homedir(), 'Dev-Brain');
const MEMPUNK_DIR      = path.join(VAULT_PATH, '.mempunk');
const ACTIVE_FILE      = path.join(MEMPUNK_DIR, 'active-project.json');
const PATHS_FILE       = path.join(MEMPUNK_DIR, 'project-paths.json');
const LOG_FILE         = path.join(MEMPUNK_DIR, 'hooks.log');
const CHECKPOINT_STATE = path.join(MEMPUNK_DIR, 'checkpoint-state.json');

// MEMPUNK_CLI permite sobrescribir "mempunk" por "node /path/to/cli.js" en tests
const [CLI_BIN, ...CLI_ARGS_PREFIX] = (process.env.MEMPUNK_CLI ?? 'mempunk').split(' ');

/** Ejecuta el CLI de mempunk. En Windows el binario global de npm es un shim
 *  .cmd que spawnSync no puede ejecutar sin shell (ENOENT); con shell hay que
 *  citar manualmente los argumentos que contengan espacios. */
function runCli(args) {
  const opts = { encoding: 'utf8', env: { ...process.env, MEMPUNK_VAULT: VAULT_PATH } };
  if (process.env.MEMPUNK_CLI || process.platform !== 'win32') {
    return spawnSync(CLI_BIN, [...CLI_ARGS_PREFIX, ...args], opts);
  }
  const quoted = args.map((a) => (/[\s"^&|<>]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a));
  return spawnSync(CLI_BIN, quoted, { ...opts, shell: true });
}

// Número de turnos entre checkpoints
const INTERVAL = parseInt(process.env.MEMPUNK_CHECKPOINT_INTERVAL ?? '5', 10);

// Número de mensajes recientes a guardar en el checkpoint
const MAX_TURNS = 10;

// Regex para detectar rutas de archivo en el contenido de los mensajes.
// Acepta separadores / y \ (Windows); los matches se normalizan a /.
const FILE_RE = /(?:^|[\s"'`(])((?:[\w.-]+[\\/])*[\w.-]+\.(?:js|ts|py|json|md|sh|sql|css|html|jsx|tsx|go|rs))/gm;

function log(message) {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [on-stop] ${message}\n`);
  } catch (_) {}
}

/** Normaliza rutas igual que el CLI al escribir project-paths.json */
function normalizePathForMatch(p) {
  let normalized = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') normalized = normalized.toLowerCase();
  return normalized;
}

/** Resuelve el proyecto: env → mapa de rutas por cwd (prefijo más largo) → activo global.
 *  El mapa por cwd evita que sesiones concurrentes en proyectos distintos
 *  crucen sus checkpoints a través del único active-project.json global. */
function getProjectId(cwd) {
  if (process.env.CLAUDE_PROJECT_ID) return process.env.CLAUDE_PROJECT_ID;

  if (cwd) {
    try {
      const map = JSON.parse(fs.readFileSync(PATHS_FILE, 'utf8'));
      const target = normalizePathForMatch(cwd);
      let best = null;
      for (const [root, projectId] of Object.entries(map)) {
        if (target === root || target.startsWith(root + '/')) {
          if (!best || root.length > best.root.length) best = { root, projectId };
        }
      }
      if (best) return best.projectId;
    } catch (_) {}
  }

  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
    return data.project_id ?? null;
  } catch (_) {
    return null;
  }
}

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

/** Un turno REAL del usuario: type "user", con texto, fuera de subagentes.
 *  En el transcript de Claude Code cada tool_result también llega como una
 *  línea type:"user" (content: [{type:"tool_result"}]) — contarlos haría que
 *  "cada N turnos" dispare en casi cada Stop y llenaría los checkpoints de
 *  resultados de herramientas en vez de conversación. */
function isRealUserTurn(entry) {
  if (entry.type !== 'user' || entry.isSidechain) return false;
  const content = entry.message?.content;
  if (typeof content === 'string') return content.trim().length > 0;
  if (Array.isArray(content)) return content.some((b) => b.type === 'text');
  return false;
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

function extractText(entry) {
  const content = entry.message?.content;
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join(' ');
  }
  return '';
}

// ── Main ──────────────────────────────────────────────────────────────────────

try {
  fs.mkdirSync(MEMPUNK_DIR, { recursive: true });

  // Leer stdin JSON de Claude Code
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;

  const data = JSON.parse(input.replace(/^\uFEFF/, '') || '{}');
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
