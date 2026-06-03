#!/usr/bin/env node
// # mempunk-hook

// Evento: SessionStart — al inicio de cada sesión de Claude Code.
// - Inicializa session-touched.json y persiste el proyecto activo (siempre).
// - Si source === "compact": restaura contexto del último compact_snapshot e inyecta additionalContext.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const VAULT_PATH   = process.env.MEMPUNK_VAULT ?? path.join(os.homedir(), 'Dev-Brain');
const MEMPUNK_DIR  = path.join(VAULT_PATH, '.mempunk');
const ACTIVE_FILE  = path.join(MEMPUNK_DIR, 'active-project.json');
const TOUCHED_FILE = path.join(MEMPUNK_DIR, 'session-touched.json');
const LOG_FILE     = path.join(MEMPUNK_DIR, 'hooks.log');

// MEMPUNK_CLI permite sobrescribir "mempunk" por "node /path/to/cli.js" en tests
const [CLI_BIN, ...CLI_ARGS_PREFIX] = (process.env.MEMPUNK_CLI ?? 'mempunk').split(' ');

// Límite de additionalContext que Claude Code acepta en SessionStart
const MAX_CONTEXT_CHARS = 8000;

function log(message) {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [on-start] ${message}\n`);
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

/** Llama al CLI para obtener el último compact_snapshot como objeto */
function fetchLastCompactSnapshot(projectId) {
  const result = spawnSync(CLI_BIN, [...CLI_ARGS_PREFIX, 'session', 'get-compact', projectId], {
    encoding: 'utf8',
    env: { ...process.env, MEMPUNK_VAULT: VAULT_PATH },
  });
  if (result.status !== 0 || !result.stdout?.trim()) return null;
  try {
    return JSON.parse(result.stdout);
  } catch (_) {
    return null;
  }
}

/** Construye el string de additionalContext a partir del snapshot */
function buildAdditionalContext(snapshot, projectId) {
  const lines = [];

  const fecha = snapshot.created_at ?? 'fecha desconocida';
  lines.push(`⚠️ CONTEXTO RESTAURADO TRAS COMPACTACION (${fecha})`);
  lines.push('');

  // Archivos encontrados
  const filesFound = tryParseJson(snapshot.files_found, []);
  if (filesFound.length > 0) {
    lines.push('Archivos que estabas editando:');
    for (const f of filesFound.slice(0, 20)) lines.push(`  - ${f}`);
    lines.push('');
  }

  // Comandos corridos
  const commandsRun = tryParseJson(snapshot.commands_run, []);
  if (commandsRun.length > 0) {
    lines.push('Comandos corridos antes de compactar:');
    for (const c of commandsRun.slice(0, 10)) lines.push(`  - ${c}`);
    lines.push('');
  }

  // Últimos mensajes del transcript
  const rawTurns = tryParseJson(snapshot.raw_turns, []);
  if (rawTurns.length > 0) {
    lines.push('Últimos mensajes de la sesión:');
    for (const turn of rawTurns.slice(-6)) {
      const role    = turn.type === 'human' ? 'user' : 'assistant';
      const content = extractFirstText(turn.message?.content ?? '');
      if (content) lines.push(`  [${role}] ${content.slice(0, 200)}`);
    }
    lines.push('');
  }

  lines.push(`Para ver el historial completo ejecuta: mempunk session recover ${projectId}`);
  lines.push('Continúa desde donde estabas.');

  const full = lines.join('\n');
  return full.length > MAX_CONTEXT_CHARS ? full.slice(0, MAX_CONTEXT_CHARS) + '\n…(truncado)' : full;
}

function tryParseJson(value, fallback) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value ?? '[]'); } catch (_) { return fallback; }
}

function extractFirstText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b) => b.type === 'text');
    return textBlock?.text ?? '';
  }
  return '';
}

// ── Main ──────────────────────────────────────────────────────────────────────

try {
  fs.mkdirSync(MEMPUNK_DIR, { recursive: true });

  // Leer stdin JSON de Claude Code (puede estar vacío en versiones antiguas)
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;

  const data = JSON.parse(input || '{}');
  const { source, session_id: sessionId } = data;

  // ── Lógica siempre activa (startup, resume y compact) ──────────────────────

  // Reiniciar el registro de archivos tocados al arrancar cada sesión
  fs.writeFileSync(TOUCHED_FILE, '[]', 'utf8');
  log('session-touched.json inicializado');

  // Persistir el proyecto activo si viene declarado en el entorno
  if (process.env.CLAUDE_PROJECT_ID) {
    fs.writeFileSync(
      ACTIVE_FILE,
      JSON.stringify({ project_id: process.env.CLAUDE_PROJECT_ID }),
      'utf8'
    );
    log(`Proyecto activo registrado: ${process.env.CLAUDE_PROJECT_ID}`);
  }

  // ── CompactRestore: solo cuando Claude Code indica source="compact" ─────────

  if (source !== 'compact') {
    log(`SessionStart source=${source ?? 'startup'} — sin restauración`);
    process.exit(0);
  }

  const projectId = getProjectId();
  if (!projectId) {
    log('source=compact pero sin proyecto activo — sin restauración');
    process.exit(0);
  }

  const snapshot = fetchLastCompactSnapshot(projectId);
  if (!snapshot) {
    log(`source=compact pero sin snapshot para ${projectId} — sin restauración`);
    process.exit(0);
  }

  const additionalContext = buildAdditionalContext(snapshot, projectId);
  log(`CompactRestore: inyectando ${additionalContext.length} chars de contexto para ${projectId}`);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  }));
} catch (err) {
  log(`Error inesperado: ${err.message}`);
}

process.exit(0);
