// # mempunk-hook

// Evento: SessionStart — al inicio de cada sesión de Claude Code.
// - Inicializa session-touched.json y persiste el proyecto activo (siempre).
// - Si source !== "compact": auto-pull (si remote.json lo pide) y materialize de
//   skills/agentes del vault a ~/.claude y a los repos de esta máquina.
// - Si auto-start.flag existe y source !== "compact": inyecta `mempunk context <id>` del
//   proyecto vinculado al cwd (o CLAUDE_PROJECT_ID); sin vínculo, un aviso de una línea;
//   si el CLI falla, la instrucción anterior de invocar @mempunk-loader.
// - Si source === "compact": inyecta el bloque de `mempunk context <id> --with-snapshot`
//   (estado compilado + sesión + backlog + decisiones + snapshot); si el CLI falla,
//   cae al formato anterior basado solo en el último compact_snapshot.

import fs from 'node:fs';
import path from 'node:path';
import {
  MEMPUNK_DIR,
  ACTIVE_FILE,
  runCli,
  createLogger,
  readStdinJson,
  getProjectId,
  readRemoteConfig,
  hookTimeoutMs,
  classifyCliFailure,
  getMappedProjectId,
  hookT,
} from '../hooks-lib/common.js';

const TOUCHED_FILE = path.join(MEMPUNK_DIR, 'session-touched.json');

// Tope del pull automático: un remote colgado no debe bloquear el arranque de la sesión
const PULL_TIMEOUT_MS = 45_000;

// Tope de la instalación de skills/agentes: solo copia archivos locales
const MATERIALIZE_TIMEOUT_MS = 20_000;

// Solo se registra este prefijo del stderr en hooks.log (nunca va al contexto de Claude)
const MAX_LOGGED_STDERR = 500;

// Margen bajo el límite de 10.000 caracteres de additionalContext en SessionStart
const MAX_CONTEXT_CHARS = 9500;

// Espacio para el título y la línea final que envuelven el bloque de contexto
const CONTEXT_FRAME_CHARS = 300;

// `mempunk context` solo lee SQLite y un markdown: un tope corto basta
const CONTEXT_TIMEOUT_MS = 15_000;

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

/** Bloque compilado de `mempunk context`, o null si el CLI falla o no devuelve nada */
function fetchContextBlock(projectId, { withSnapshot }) {
  const maxChars = String(MAX_CONTEXT_CHARS - CONTEXT_FRAME_CHARS);
  const args     = ['context', projectId, ...(withSnapshot ? ['--with-snapshot'] : []), '--max-chars', maxChars];
  const result   = runCli(args, {
    timeout: hookTimeoutMs(CONTEXT_TIMEOUT_MS),
  });
  if (result.status !== 0) {
    const err = (result.stderr?.trim() || result.error?.message || 'sin detalle').slice(0, MAX_LOGGED_STDERR);
    log(`context falló (status=${result.status ?? 'null'}): ${err}`);
    return null;
  }
  return result.stdout?.trim() || null;
}

/** Envuelve el bloque compilado con el aviso de restauración */
function buildRestoredContext(block) {
  const title = hookT('restore.title', { date: new Date().toISOString().slice(0, 16).replace('T', ' ') });
  return [title, block, hookT('restore.continue')].join('\n\n').slice(0, MAX_CONTEXT_CHARS);
}

/** Formato anterior (solo snapshot): respaldo si `mempunk context` falla */
function buildAdditionalContext(snapshot, projectId) {
  const lines = [];

  const fecha = snapshot.created_at ?? hookT('restore.unknownDate');
  lines.push(hookT('restore.title', { date: fecha }));
  lines.push('');

  // Archivos encontrados
  const filesFound = tryParseJson(snapshot.files_found, []);
  if (filesFound.length > 0) {
    lines.push(hookT('restore.files'));
    for (const f of filesFound.slice(0, 20)) lines.push(`  - ${f}`);
    lines.push('');
  }

  // Comandos corridos
  const commandsRun = tryParseJson(snapshot.commands_run, []);
  if (commandsRun.length > 0) {
    lines.push(hookT('restore.commands'));
    for (const c of commandsRun.slice(0, 10)) lines.push(`  - ${c}`);
    lines.push('');
  }

  // Últimos mensajes del transcript
  const rawTurns = tryParseJson(snapshot.raw_turns, []);
  if (rawTurns.length > 0) {
    lines.push(hookT('restore.messages'));
    for (const turn of rawTurns.slice(-6)) {
      const role    = turn.type === 'user' ? 'user' : 'assistant';
      const content = extractFirstText(turn.message?.content ?? '');
      if (content) lines.push(`  [${role}] ${content.slice(0, 200)}`);
    }
    lines.push('');
  }

  lines.push(hookT('restore.recoverHint', { id: projectId }));
  lines.push(hookT('restore.continue'));

  const full = lines.join('\n');
  return full.length > MAX_CONTEXT_CHARS
    ? full.slice(0, MAX_CONTEXT_CHARS) + '\n' + hookT('restore.truncated')
    : full;
}

/** Contexto de auto-start: el bloque del proyecto vinculado, sin preguntar nada.
 *  El snapshot se omite: es de una compactación de otra sesión. */
function buildAutoStartContext(cwd) {
  const projectId = getMappedProjectId(cwd);
  if (!projectId) {
    log('auto-start: cwd sin proyecto vinculado — aviso de /mempunk');
    return hookT('autostart.unmapped');
  }
  const block = fetchContextBlock(projectId, { withSnapshot: false });
  if (!block) {
    log(`auto-start: context falló para ${projectId} — se delega en @mempunk-loader`);
    return hookT('autostart.context');
  }
  log(`auto-start: inyectando ${block.length} chars de contexto para ${projectId}`);
  return block;
}

/** Pull automático del vault si remote.json lo pide. Nunca aborta la sesión.
 *  Devuelve el aviso FIJO (clasificado) para Claude si el pull falló, o null:
 *  el stderr crudo solo va a hooks.log — un remote malicioso puede inyectar
 *  texto en el contexto via las líneas `remote:` de git. */
function autoPullVault() {
  const remote = readRemoteConfig();
  if (!remote?.auto?.pull_on_start) return null;

  const result = runCli(['pull'], { timeout: hookTimeoutMs(PULL_TIMEOUT_MS) });
  if (result.status === 0) {
    log('Pull automático del vault OK');
    return null;
  }
  const kind = classifyCliFailure(result);
  const err  = (result.stderr?.trim() || result.error?.message || 'sin detalle').slice(0, MAX_LOGGED_STDERR);
  log(`Pull automático del vault falló (${kind}, status=${result.status ?? 'null'}): ${err}`);
  return hookT(`remote.pull.${kind}`);
}

/** Copia skills/agentes del vault a sus carpetas .claude/. Nunca aborta la sesión.
 *  Devuelve un aviso fijo para Claude si hubo conflictos, o null. */
function materializeAssets() {
  const result = runCli(['materialize', '--json'], { timeout: hookTimeoutMs(MATERIALIZE_TIMEOUT_MS) });
  if (result.status !== 0) {
    const err = (result.stderr?.trim() || result.error?.message || 'sin detalle').slice(0, MAX_LOGGED_STDERR);
    log(`materialize falló (status=${result.status ?? 'null'}): ${err}`);
    return null;
  }
  try {
    const { targets } = JSON.parse(result.stdout);
    const sum = (key) => targets.reduce((n, t) => n + (Array.isArray(t[key]) ? t[key].length : 0), 0);
    log(`materialize OK: ${sum('created')} creados, ${sum('updated')} actualizados, ${sum('removed')} eliminados, ${sum('conflicts')} conflictos`);
    const conflicts = sum('conflicts');
    return conflicts > 0 ? hookT('materialize.conflicts', { count: conflicts }) : null;
  } catch (_) {
    log('materialize devolvió JSON inválido');
    return null;
  }
}

/** Emite la respuesta JSON de SessionStart. Contexto vacío → {}. */
function writeSessionStartOutput(contextLines) {
  const additionalContext = contextLines.filter(Boolean).join('\n').slice(0, MAX_CONTEXT_CHARS);
  if (!additionalContext) {
    process.stdout.write('{}');
    return;
  }
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
  }));
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

  // ── Auto-start: inyectar el contexto del proyecto en sesiones normales ──────

  if (source !== 'compact') {
    // Pull del vault antes de cargar contexto (solo si remote.json lo pide)
    const pullWarning = autoPullVault();

    // Después del pull: así llegan las skills/agentes creados en la otra máquina
    const materializeWarning = materializeAssets();

    let autoStartContext = null;
    if (fs.existsSync(AUTO_START_FLAG)) {
      log(`SessionStart source=${source ?? 'startup'} — auto-start activo`);
      autoStartContext = buildAutoStartContext(cwd);
    } else {
      log(`SessionStart source=${source ?? 'startup'} — sin restauración ni auto-start`);
    }
    writeSessionStartOutput([autoStartContext, pullWarning, materializeWarning]);
    process.exit(0);
  }

  // ── CompactRestore: solo cuando Claude Code indica source="compact" ─────────

  const projectId = getProjectId(cwd);
  if (!projectId) {
    log('source=compact pero sin proyecto activo — sin restauración');
    process.exit(0);
  }

  let additionalContext;
  const block = fetchContextBlock(projectId, { withSnapshot: true });
  if (block) {
    additionalContext = buildRestoredContext(block);
  } else {
    const snapshot = fetchLastCompactSnapshot(projectId);
    if (!snapshot) {
      log(`source=compact pero sin contexto ni snapshot para ${projectId} — sin restauración`);
      process.exit(0);
    }
    additionalContext = buildAdditionalContext(snapshot, projectId);
  }
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
