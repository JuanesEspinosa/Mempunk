#!/usr/bin/env node
// # mempunk-hook

// Evento: Stop — al final de cada respuesta de Claude Code.
// Guarda un checkpoint incremental en SQLite cada INTERVAL turnos de usuario.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const VAULT_PATH       = process.env.MEMPUNK_VAULT ?? path.join(os.homedir(), 'Dev-Brain');
const MEMPUNK_DIR      = path.join(VAULT_PATH, '.mempunk');
const ACTIVE_FILE      = path.join(MEMPUNK_DIR, 'active-project.json');
const LOG_FILE         = path.join(MEMPUNK_DIR, 'hooks.log');
const CHECKPOINT_STATE = path.join(MEMPUNK_DIR, 'checkpoint-state.json');

// MEMPUNK_CLI permite sobrescribir "mempunk" por "node /path/to/cli.js" en tests
const [CLI_BIN, ...CLI_ARGS_PREFIX] = (process.env.MEMPUNK_CLI ?? 'mempunk').split(' ');

// Número de turnos entre checkpoints
const INTERVAL = parseInt(process.env.MEMPUNK_CHECKPOINT_INTERVAL ?? '5', 10);

// Número de mensajes recientes a guardar en el checkpoint
const MAX_TURNS = 10;

// Regex para detectar rutas de archivo en el contenido de los mensajes
const FILE_RE = /(?:^|\s)((?:[\w.-]+\/)*[\w.-]+\.(?:js|ts|py|json|md|sh|sql|css|html|jsx|tsx|go|rs))/gm;

function log(message) {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [on-stop] ${message}\n`);
  } catch (_) {}
}

function getProjectId() {
  if (process.env.CLAUDE_PROJECT_ID) return process.env.CLAUDE_PROJECT_ID;
  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
    return data.project_id ?? null;
  } catch (_) {
    return null;
  }
}

function readCheckpointState(sessionId) {
  try {
    const data = JSON.parse(fs.readFileSync(CHECKPOINT_STATE, 'utf8'));
    // Si cambió la sesión, resetear
    if (data.session_id !== sessionId) return { session_id: sessionId, last_saved_turn: 0 };
    return data;
  } catch (_) {
    return { session_id: sessionId, last_saved_turn: 0 };
  }
}

function writeCheckpointState(state) {
  try {
    fs.writeFileSync(CHECKPOINT_STATE, JSON.stringify(state), 'utf8');
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

        // Contar mensajes de usuario como "turnos"
        if (entry.type === 'human') turnCount++;

        // Extraer texto para detectar archivos
        const textContent = extractText(entry);
        if (textContent) {
          let m;
          while ((m = FILE_RE.exec(textContent)) !== null) {
            filesSet.add(m[1]);
          }
        }

        if (entry.type === 'human' || entry.type === 'assistant') {
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

  const data = JSON.parse(input || '{}');
  const { session_id: sessionId, transcript_path: transcriptPath } = data;

  if (!sessionId || !transcriptPath) {
    log('Sin session_id o transcript_path — sin acción');
    process.exit(0);
  }

  const projectId = getProjectId();
  if (!projectId) {
    log('Sin proyecto activo — sin acción');
    process.exit(0);
  }

  const checkpointState = readCheckpointState(sessionId);
  const { turnCount, turns, filesFound } = await parseTranscript(transcriptPath);

  const turnsSinceLast = turnCount - checkpointState.last_saved_turn;

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

  const result = spawnSync(CLI_BIN, [...CLI_ARGS_PREFIX, 'session', 'save-checkpoint', tmpFile], {
    encoding: 'utf8',
    env: { ...process.env, MEMPUNK_VAULT: VAULT_PATH },
  });

  if (result.status === 0) {
    writeCheckpointState({ session_id: sessionId, last_saved_turn: turnCount });
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
