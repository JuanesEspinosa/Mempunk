#!/usr/bin/env node
// # mempunk-hook

// Evento: PreCompact — justo antes de que Claude Code compacte el contexto.
// Captura el transcript completo y lo persiste como compact_snapshot en SQLite.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const VAULT_PATH  = process.env.MEMPUNK_VAULT?.trim() || path.join(os.homedir(), 'Dev-Brain');
const MEMPUNK_DIR = path.join(VAULT_PATH, '.mempunk');
const ACTIVE_FILE = path.join(MEMPUNK_DIR, 'active-project.json');
const PATHS_FILE  = path.join(MEMPUNK_DIR, 'project-paths.json');
const LOG_FILE    = path.join(MEMPUNK_DIR, 'hooks.log');

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

// Últimos N mensajes a guardar como raw_turns
const MAX_TURNS = 20;

// Regex para detectar rutas de archivo en el contenido de los mensajes.
// Acepta separadores / y \ (Windows); los matches se normalizan a /.
const FILE_RE = /(?:^|[\s"'`(])((?:[\w.-]+[\\/])*[\w.-]+\.(?:js|ts|py|json|md|sh|sql|css|html|jsx|tsx|go|rs))/gm;

function log(message) {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [on-compact] ${message}\n`);
  } catch (_) {}
}

function exit() {
  process.stdout.write('{}');
  process.exit(0);
}

/** Normaliza rutas igual que el CLI al escribir project-paths.json */
function normalizePathForMatch(p) {
  let normalized = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') normalized = normalized.toLowerCase();
  return normalized;
}

/** Resuelve el proyecto: env → mapa de rutas por cwd (prefijo más largo) → activo global.
 *  El mapa por cwd evita que sesiones concurrentes en proyectos distintos
 *  crucen sus snapshots a través del único active-project.json global. */
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

        // Ignorar subagentes: comparten el JSONL pero no son la conversación principal
        if (entry.isSidechain) continue;

        // Recopilar tool calls Bash para commands_run
        if (entry.message?.role === 'assistant' && Array.isArray(entry.message?.content)) {
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
            filesSet.add(m[1].replace(/\\/g, '/'));
          }
        }

        // raw_turns: solo conversación real (sin tool_results)
        if (isRealUserTurn(entry) || entry.message?.role === 'assistant') {
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

/** Un turno REAL del usuario: type "user" con texto — cada tool_result
 *  también llega como línea type:"user" y no es conversación */
function isRealUserTurn(entry) {
  if (entry.type !== 'user') return false;
  const content = entry.message?.content;
  if (typeof content === 'string') return content.trim().length > 0;
  if (Array.isArray(content)) return content.some((b) => b.type === 'text');
  return false;
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
  // El stdin de PreCompact trae `trigger` ("manual"/"auto") en snake_case —
  // los campos compactType/messageCount no existen en el evento real
  const {
    session_id: sessionId,
    transcript_path: transcriptPath,
    trigger,
    cwd,
  } = data;

  if (!sessionId) {
    log('Sin session_id — sin acción');
    exit();
  }

  const projectId = getProjectId(cwd);
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
    compact_type:  trigger ?? null,
    message_count: turns.length,
    raw_turns:     JSON.stringify(turns),
    files_found:   JSON.stringify(filesFound),
    commands_run:  JSON.stringify(commandsRun),
  }), 'utf8');

  const result = runCli(['session', 'save-compact', tmpFile]);

  if (result.status === 0) {
    log(`CompactSnapshot guardado: proyecto=${projectId} tipo=${trigger ?? 'auto'} turnos=${turns.length} archivos=${filesFound.length}`);
  } else {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    const err = result.stderr?.trim() || result.error?.message || 'sin detalle';
    log(`Error al guardar CompactSnapshot: ${err}`);
  }
} catch (err) {
  log(`Error inesperado: ${err.message}`);
}

exit();
