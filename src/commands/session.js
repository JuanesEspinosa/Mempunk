import fs from 'node:fs';
import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Sesiones ───────────────────────────────────────────────────────

export function cmdSessionLog(projectId, summary) {
  if (!projectId || !summary) {
    fail(t('usage', { syntax: 'mempunk session log <project_id> "<summary>" [--files "path1,path2"]' }));
  }
  requireVault();

  // Parsear lista de archivos separados por coma
  const filesTouched = opts.files
    ? opts.files.split(',').map((f) => f.trim()).filter(Boolean)
    : [];

  const store = openStore();
  store.logSession(projectId, summary, filesTouched);
  console.log(t('session.logged', { id: projectId }));
}

export function cmdSessionLast(projectId) {
  if (!projectId) fail(t('usage', { syntax: 'mempunk session last <project_id>' }));
  requireVault();

  const store   = openStore();
  const session = store.getLastSession(projectId);
  if (opts.json) return printJson(session ?? null);

  if (!session) {
    console.log(t('session.none', { id: projectId }));
    return;
  }

  // Mostrar cada campo en su propia línea para fácil lectura
  const fields = [
    ['id',            session.id],
    ['project_id',    session.project_id],
    ['started_at',    session.started_at],
    ['ended_at',      session.ended_at],
    ['summary',       session.summary],
    ['files_touched', session.files_touched],
  ];
  const labelWidth = Math.max(...fields.map(([k]) => k.length));
  for (const [label, value] of fields) {
    console.log(`${label.padEnd(labelWidth)}  ${value ?? ''}`);
  }
}

/** Muestra el último snapshot disponible (checkpoint o compact_snapshot) de un proyecto */
export function cmdSessionRecover(projectId) {
  if (!projectId) fail(t('usage', { syntax: 'mempunk session recover <project_id>' }));
  requireVault();

  const store    = openStore();
  const snapshot = store.getLastCompactSnapshot(projectId);

  if (!snapshot) {
    console.log(t('session.noSnapshots', { id: projectId }));
    console.log(t('session.checkpointHint'));
    console.log(t('session.compactHint'));
    return;
  }

  const fecha   = snapshot.created_at ?? t('session.unknownDate');
  const tipo    = snapshot.source === 'compact' ? `compact_snapshot (${snapshot.compact_type ?? 'auto'})` : 'checkpoint';
  const mensajes = snapshot.message_count ?? snapshot.turn_count ?? '?';

  console.log(t('session.lastSnapshot', { date: fecha, type: tipo }));
  console.log(t('session.snapshotMeta', { sessionId: snapshot.session_id, count: mensajes }));

  const filesFound = tryParseJsonArray(snapshot.files_found);
  if (filesFound.length > 0) {
    console.log('\n' + t('session.filesTouched'));
    for (const f of filesFound) console.log(`  - ${f}`);
  }

  const commandsRun = tryParseJsonArray(snapshot.commands_run);
  if (commandsRun && commandsRun.length > 0) {
    console.log('\n' + t('session.commandsRun'));
    for (const c of commandsRun) console.log(`  - ${c}`);
  }

  const rawTurns = tryParseJsonArray(snapshot.raw_turns);
  if (rawTurns.length > 0) {
    console.log('\n' + t('session.lastMessages'));
    for (const turn of rawTurns.slice(-4)) {
      const role    = turn.type === 'human' ? 'user' : 'assistant';
      const content = extractFirstTextContent(turn.message?.content ?? '');
      if (content) console.log(`  [${role}] ${content.slice(0, 120)}`);
    }
  }

  console.log('\n' + t('session.seeCheckpoints', { id: projectId }));
}

/** Muestra la lista de checkpoints de un proyecto */
export function cmdSessionCheckpoints(projectId) {
  if (!projectId) fail(t('usage', { syntax: 'mempunk session checkpoints <project_id>' }));
  requireVault();

  const store       = openStore();
  const checkpoints = store.listCheckpoints(projectId);
  if (opts.json) return printJson(checkpoints);

  if (checkpoints.length === 0) {
    console.log(t('session.noCheckpoints', { id: projectId }));
    return;
  }

  console.log(t('session.checkpointsHeader', { id: projectId }) + '\n');
  const COL = { n: 3, fecha: 20, tipo: 20, extra: 12, archivos: 8 };
  const header = `  ${'#'.padEnd(COL.n)}  ${t('session.colDate').padEnd(COL.fecha)}  ${t('session.colType').padEnd(COL.tipo)}  ${t('session.colDetail').padEnd(COL.extra)}  ${t('session.colFiles')}`;
  console.log(header);
  console.log('  ' + '─'.repeat(header.length - 2));

  checkpoints.forEach((row, i) => {
    const n       = String(i + 1).padEnd(COL.n);
    const fecha   = (row.created_at ?? '').slice(0, 19).padEnd(COL.fecha);
    const tipo    = (row.source === 'compact' ? `compact (${row.compact_type ?? 'auto'})` : 'checkpoint').padEnd(COL.tipo);
    const extra   = (row.source === 'compact' ? `${row.message_count ?? '?'} msgs` : t('session.turnLabel', { n: row.turn_count ?? '?' })).padEnd(COL.extra);
    const nFiles  = tryParseJsonArray(row.files_found).length;
    console.log(`  ${n}  ${fecha}  ${tipo}  ${extra}  ${nFiles}`);
  });
  console.log('');
}

function tryParseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value ?? '[]'); } catch (_) { return []; }
}

function extractFirstTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b) => b.type === 'text');
    return textBlock?.text ?? '';
  }
  return '';
}

/** Persiste un checkpoint incremental desde un temp JSON file (usado por on-stop.js hook) */
export function cmdSessionSaveCheckpoint(tmpFilePath) {
  if (!tmpFilePath) fail(t('usage.internal', { syntax: 'mempunk session save-checkpoint <tmp_json_path>' }));
  requireVault();

  let data;
  try {
    data = JSON.parse(fs.readFileSync(tmpFilePath, 'utf8'));
  } catch (err) {
    fail(t('session.tmpReadError', { message: err.message }));
  } finally {
    try { fs.unlinkSync(tmpFilePath); } catch (_) {}
  }

  const { project_id, session_id, turn_count, raw_turns, files_found } = data;
  if (!project_id || !session_id || turn_count == null) fail(t('session.tmpIncomplete'));

  const store = openStore();
  store.addCheckpoint(
    project_id,
    session_id,
    turn_count,
    JSON.parse(raw_turns ?? '[]'),
    files_found ? JSON.parse(files_found) : [],
  );
  // Salida silenciosa — es un hook interno
}

/** Retorna el último compact_snapshot de un proyecto como JSON (usado por on-start.js hook) */
export function cmdSessionGetCompact(projectId) {
  if (!projectId) fail(t('usage.internal', { syntax: 'mempunk session get-compact <project_id>' }));
  requireVault();

  const store    = openStore();
  const snapshot = store.getLastCompactSnapshot(projectId);
  // Salida JSON limpia — el hook parsea este stdout
  process.stdout.write(JSON.stringify(snapshot ?? null));
}

/** Persiste un compact_snapshot desde un temp JSON file (usado por on-compact.js hook) */
export function cmdSessionSaveCompact(tmpFilePath) {
  if (!tmpFilePath) fail(t('usage.internal', { syntax: 'mempunk session save-compact <tmp_json_path>' }));
  requireVault();

  let data;
  try {
    data = JSON.parse(fs.readFileSync(tmpFilePath, 'utf8'));
  } catch (err) {
    fail(t('session.tmpReadError', { message: err.message }));
  } finally {
    try { fs.unlinkSync(tmpFilePath); } catch (_) {}
  }

  const { project_id, session_id, compact_type, message_count, raw_turns, files_found, commands_run } = data;
  if (!project_id || !session_id) fail(t('session.tmpIncomplete'));

  const store = openStore();
  store.addCompactSnapshot(
    project_id,
    session_id,
    compact_type ?? null,
    message_count ?? null,
    JSON.parse(raw_turns ?? '[]'),
    files_found ? JSON.parse(files_found) : [],
    commands_run ? JSON.parse(commands_run) : [],
  );
  // Salida silenciosa — es un hook interno
}
