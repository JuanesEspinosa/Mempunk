// # mempunk-hook

// Evento: SessionStart — al inicio de cada sesión de Claude Code.
// - Inicializa session-touched.json y persiste el proyecto activo (siempre).
// - Si auto-start.flag existe y source !== "compact": inyecta instrucción @mempunk-loader.
// - Si source === "compact": restaura contexto del último compact_snapshot e inyecta additionalContext.

import fs from 'node:fs';
import path from 'node:path';
import {
  MEMPUNK_DIR,
  ACTIVE_FILE,
  runCli,
  createLogger,
  readStdinJson,
  getProjectId,
} from '../hooks-lib/common.js';

const TOUCHED_FILE = path.join(MEMPUNK_DIR, 'session-touched.json');

// Límite de additionalContext que Claude Code acepta en SessionStart
const MAX_CONTEXT_CHARS = 8000;

// Flag file que indica si auto-start está activo (vive dentro del vault para ser aislable en tests)
const AUTO_START_FLAG = path.join(MEMPUNK_DIR, 'auto-start.flag');

const log = createLogger('on-start');

/** Llama al CLI para obtener el último compact_snapshot como objeto */
function fetchLastCompactSnapshot(projectId) {
  const result = runCli(['session', 'get-compact', projectId]);
  if (result.status !== 0) {
    // Distinguir "el CLI falló" de "no hay snapshot" — sin esto el log diría
    // "sin snapshot" aunque existan snapshots que no se pudieron leer
    const err = result.stderr?.trim() || result.error?.message || 'sin detalle';
    log(`get-compact falló (status=${result.status ?? 'null'}): ${err}`);
    return null;
  }
  if (!result.stdout?.trim()) return null;
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
      const role    = turn.type === 'user' ? 'user' : 'assistant';
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

  const data = await readStdinJson();
  const { source, cwd } = data;

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

  // ── Auto-start: inyectar instrucción @mempunk-loader en sesiones normales ────

  if (source !== 'compact') {
    if (fs.existsSync(AUTO_START_FLAG)) {
      log(`SessionStart source=${source ?? 'startup'} — auto-start activo, inyectando @mempunk-loader`);
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: 'mempunk-auto-start: El usuario tiene auto-start activado. Invoca @mempunk-loader para cargar el contexto del vault del proyecto actual antes de responder.',
        },
      }));
    } else {
      log(`SessionStart source=${source ?? 'startup'} — sin restauración ni auto-start`);
      process.stdout.write('{}');
    }
    process.exit(0);
  }

  // ── CompactRestore: solo cuando Claude Code indica source="compact" ─────────

  const projectId = getProjectId(cwd);
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
