#!/usr/bin/env node
// # mempunk-hook

// Evento: PreCompact — justo antes de que Claude Code compacte el contexto.
// Captura el transcript completo y lo persiste como compact_snapshot en SQLite.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const VAULT_PATH  = process.env.MEMPUNK_VAULT ?? path.join(os.homedir(), 'Dev-Brain');
const MEMPUNK_DIR = path.join(VAULT_PATH, '.mempunk');
const ACTIVE_FILE = path.join(MEMPUNK_DIR, 'active-project.json');
const LOG_FILE    = path.join(MEMPUNK_DIR, 'hooks.log');

// MEMPUNK_CLI permite sobrescribir "mempunk" por "node /path/to/cli.js" en tests
const [CLI_BIN, ...CLI_ARGS_PREFIX] = (process.env.MEMPUNK_CLI ?? 'mempunk').split(' ');

// Últimos N mensajes a guardar como raw_turns
const MAX_TURNS = 20;

// Regex para detectar rutas de archivo en el contenido de los mensajes
const FILE_RE = /(?:^|\s)((?:[\w.-]+\/)*[\w.-]+\.(?:js|ts|py|json|md|sh|sql|css|html|jsx|tsx|go|rs))/gm;

function log(message) {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [on-compact] ${message}\n`);
  } catch (_) {}
}

function exit() {
  process.stdout.write('{}');
  process.exit(0);
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

/** Parsea el transcript JSONL y extrae los últimos MAX_TURNS mensajes */
async function parseTranscript(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return { turns: [], filesFound: [], commandsRun: [] };
  }

  const turns = [];
  const filesSet = new Set();
  const cmdsArr = [];

  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(transcriptPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);

        // Recopilar tool calls Bash para commands_run
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use' && block.name === 'Bash' && block.input?.command) {
              cmdsArr.push(block.input.command.slice(0, 200));
            }
          }
        }

        // Extraer texto para detectar archivos
        const textContent = extractText(entry);
        if (textContent) {
          let m;
          while ((m = FILE_RE.exec(textContent)) !== null) {
            filesSet.add(m[1]);
          }
        }

        // Guardar turno completo para raw_turns
        if (entry.type === 'human' || entry.type === 'assistant') {
          turns.push(entry);
        }
      } catch (_) {}
    }
  } catch (_) {}

  return {
    turns: turns.slice(-MAX_TURNS),
    filesFound: [...filesSet],
    commandsRun: cmdsArr,
  };
}

/** Extrae texto plano de una entrada del transcript */
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
  const {
    session_id: sessionId,
    transcript_path: transcriptPath,
    compactType,
    messageCount,
  } = data;

  if (!sessionId) {
    log('Sin session_id — sin acción');
    exit();
  }

  const projectId = getProjectId();
  if (!projectId) {
    log('Sin proyecto activo — sin acción');
    exit();
  }

  const { turns, filesFound, commandsRun } = await parseTranscript(transcriptPath);

  // Escribir datos a un temp JSON y pasar la ruta al CLI para que persista en SQLite
  const tmpFile = path.join(os.tmpdir(), `mempunk-compact-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify({
    project_id:    projectId,
    session_id:    sessionId,
    compact_type:  compactType ?? null,
    message_count: messageCount ?? turns.length,
    raw_turns:     JSON.stringify(turns),
    files_found:   JSON.stringify(filesFound),
    commands_run:  JSON.stringify(commandsRun),
  }), 'utf8');

  const result = spawnSync(CLI_BIN, [...CLI_ARGS_PREFIX, 'session', 'save-compact', tmpFile], {
    encoding: 'utf8',
    env: { ...process.env, MEMPUNK_VAULT: VAULT_PATH },
  });

  if (result.status === 0) {
    log(`CompactSnapshot guardado: proyecto=${projectId} tipo=${compactType ?? 'auto'} turnos=${turns.length} archivos=${filesFound.length}`);
  } else {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    const err = result.stderr?.trim() || result.error?.message || 'sin detalle';
    log(`Error al guardar CompactSnapshot: ${err}`);
  }
} catch (err) {
  log(`Error inesperado: ${err.message}`);
}

exit();
