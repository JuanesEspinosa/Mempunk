// # mempunk-hook

// Evento: PreCompact — justo antes de que Claude Code compacte el contexto.
// Captura el transcript completo y lo persiste como compact_snapshot en SQLite.

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

// Últimos N mensajes a guardar como raw_turns
const MAX_TURNS = 20;

const log = createLogger('on-compact');

function exit() {
  process.stdout.write('{}');
  process.exit(0);
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

// ── Main ──────────────────────────────────────────────────────────────────────

try {
  fs.mkdirSync(MEMPUNK_DIR, { recursive: true });

  const data = await readStdinJson();
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
