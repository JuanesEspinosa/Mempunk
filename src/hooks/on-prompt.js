#!/usr/bin/env node
// # mempunk-hook

// Evento: UserPromptSubmit — antes de cada mensaje del usuario
// Lee el transcript JSONL para calcular el % de contexto usado y avisa
// al usuario cuando se acerca al umbral de auto-compactación (83.5%).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const VAULT_PATH  = process.env.MEMPUNK_VAULT ?? path.join(os.homedir(), 'Dev-Brain');
const MEMPUNK_DIR = path.join(VAULT_PATH, '.mempunk');
const LOG_FILE    = path.join(MEMPUNK_DIR, 'hooks.log');
const WARN_FILE   = path.join(MEMPUNK_DIR, 'context-warn-state.json');

// Umbral de auto-compact de Claude Code — hardcodeado en 83.5%
// Con 30% de free space before auto-compact cuando override está en 70%
const CONTEXT_WINDOW = parseInt(process.env.MEMPUNK_CONTEXT_WINDOW ?? '200000', 10);
const THRESHOLD_WARN  = 70;
const THRESHOLD_ALERT = 80;

function log(message) {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [on-prompt] ${message}\n`);
  } catch (_) {}
}

function exit(output = {}) {
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

// Lee el estado de advertencias previas para evitar repetir el mismo umbral
function readWarnState(sessionId) {
  try {
    const data = JSON.parse(fs.readFileSync(WARN_FILE, 'utf8'));
    // Si cambió la sesión, resetear
    if (data.session_id !== sessionId) return { session_id: sessionId, last_warned_pct: 0 };
    return data;
  } catch (_) {
    return { session_id: sessionId, last_warned_pct: 0 };
  }
}

function writeWarnState(state) {
  try {
    fs.mkdirSync(MEMPUNK_DIR, { recursive: true });
    fs.writeFileSync(WARN_FILE, JSON.stringify(state), 'utf8');
  } catch (_) {}
}

// Extrae el usage del último mensaje assistant del transcript JSONL
async function getContextPct(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;

  let lastUsage = null;

  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(transcriptPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        // Buscar mensajes assistant con usage
        if (entry.type === 'assistant' && entry.message?.usage) {
          lastUsage = entry.message.usage;
        }
      } catch (_) {}
    }
  } catch (_) {
    return null;
  }

  if (!lastUsage) return null;

  const used =
    (lastUsage.input_tokens ?? 0) +
    (lastUsage.cache_creation_input_tokens ?? 0) +
    (lastUsage.cache_read_input_tokens ?? 0);

  return Math.round((used / CONTEXT_WINDOW) * 100);
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
    exit();
  }

  const pct = await getContextPct(transcriptPath);

  if (pct === null) {
    log('No se pudo calcular el porcentaje de contexto');
    exit();
  }

  log(`Contexto: ${pct}%`);

  const warnState = readWarnState(sessionId);

  // Aviso rojo — 80%+
  if (pct >= THRESHOLD_ALERT && warnState.last_warned_pct < THRESHOLD_ALERT) {
    log(`Aviso rojo disparado: ${pct}%`);
    writeWarnState({ session_id: sessionId, last_warned_pct: pct });
    exit({
      systemMessage:
        `🚨 Contexto al ${pct}% — compactación inminente (auto-compact ocurre al ~83.5%). ` +
        `Mempunk guardará un snapshot automáticamente cuando ocurra. ` +
        `Puedes ejecutar /compact ahora para controlarlo.`,
    });
  }

  // Aviso amarillo — 70%+
  if (pct >= THRESHOLD_WARN && warnState.last_warned_pct < THRESHOLD_WARN) {
    log(`Aviso amarillo disparado: ${pct}%`);
    writeWarnState({ session_id: sessionId, last_warned_pct: pct });
    exit({
      systemMessage:
        `⚠️  Contexto al ${pct}% — la compactación automática ocurre al ~83.5%. ` +
        `Considera ejecutar /compact manualmente para controlar cuándo ocurre.`,
    });
  }

  // Sin umbral alcanzado — salida silenciosa
  exit();
} catch (err) {
  log(`Error inesperado: ${err.message}`);
  exit();
}
