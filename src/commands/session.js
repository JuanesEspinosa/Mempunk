import fs from 'node:fs';
import { opts } from '../lib/args.js';
import { fail, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Sesiones ───────────────────────────────────────────────────────

export function cmdSessionLog(projectId, summary) {
  if (!projectId || !summary) {
    fail('Uso: mempunk session log <project_id> "<summary>" [--files "path1,path2"]');
  }
  requireVault();

  // Parsear lista de archivos separados por coma
  const filesTouched = opts.files
    ? opts.files.split(',').map((f) => f.trim()).filter(Boolean)
    : [];

  const store = openStore();
  store.logSession(projectId, summary, filesTouched);
  console.log(`Sesión registrada para ${projectId}`);
}

export function cmdSessionLast(projectId) {
  if (!projectId) fail('Uso: mempunk session last <project_id>');
  requireVault();

  const store   = openStore();
  const session = store.getLastSession(projectId);
  if (opts.json) return printJson(session ?? null);

  if (!session) {
    console.log(`No hay sesiones registradas para el proyecto "${projectId}"`);
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
  if (!projectId) fail('Uso: mempunk session recover <project_id>');
  requireVault();

  const store    = openStore();
  const snapshot = store.getLastCompactSnapshot(projectId);

  if (!snapshot) {
    console.log(`No hay snapshots guardados para el proyecto "${projectId}"`);
    console.log('Los checkpoints se guardan automáticamente cada 5 turnos (hook on-stop).');
    console.log('Los compact_snapshots se guardan antes de cada compactación (hook on-compact).');
    return;
  }

  const fecha   = snapshot.created_at ?? 'desconocida';
  const tipo    = snapshot.source === 'compact' ? `compact_snapshot (${snapshot.compact_type ?? 'auto'})` : 'checkpoint';
  const mensajes = snapshot.message_count ?? snapshot.turn_count ?? '?';

  console.log(`Último snapshot disponible: ${fecha} (${tipo})`);
  console.log(`Session ID: ${snapshot.session_id} | Mensajes: ${mensajes}`);

  const filesFound = tryParseJsonArray(snapshot.files_found);
  if (filesFound.length > 0) {
    console.log('\nArchivos tocados:');
    for (const f of filesFound) console.log(`  - ${f}`);
  }

  const commandsRun = tryParseJsonArray(snapshot.commands_run);
  if (commandsRun && commandsRun.length > 0) {
    console.log('\nComandos corridos:');
    for (const c of commandsRun) console.log(`  - ${c}`);
  }

  const rawTurns = tryParseJsonArray(snapshot.raw_turns);
  if (rawTurns.length > 0) {
    console.log('\nÚltimos mensajes:');
    for (const turn of rawTurns.slice(-4)) {
      const role    = turn.type === 'human' ? 'user' : 'assistant';
      const content = extractFirstTextContent(turn.message?.content ?? '');
      if (content) console.log(`  [${role}] ${content.slice(0, 120)}`);
    }
  }

  console.log(`\nPara ver checkpoints completos: mempunk session checkpoints ${projectId}`);
}

/** Muestra la lista de checkpoints de un proyecto */
export function cmdSessionCheckpoints(projectId) {
  if (!projectId) fail('Uso: mempunk session checkpoints <project_id>');
  requireVault();

  const store       = openStore();
  const checkpoints = store.listCheckpoints(projectId);
  if (opts.json) return printJson(checkpoints);

  if (checkpoints.length === 0) {
    console.log(`No hay checkpoints para el proyecto "${projectId}"`);
    return;
  }

  console.log(`Checkpoints de ${projectId} (más reciente primero):\n`);
  const COL = { n: 3, fecha: 20, tipo: 20, extra: 12, archivos: 8 };
  const header = `  ${'#'.padEnd(COL.n)}  ${'Fecha'.padEnd(COL.fecha)}  ${'Tipo'.padEnd(COL.tipo)}  ${'Detalle'.padEnd(COL.extra)}  Archivos`;
  console.log(header);
  console.log('  ' + '─'.repeat(header.length - 2));

  checkpoints.forEach((row, i) => {
    const n       = String(i + 1).padEnd(COL.n);
    const fecha   = (row.created_at ?? '').slice(0, 19).padEnd(COL.fecha);
    const tipo    = (row.source === 'compact' ? `compact (${row.compact_type ?? 'auto'})` : 'checkpoint').padEnd(COL.tipo);
    const extra   = (row.source === 'compact' ? `${row.message_count ?? '?'} msgs` : `turno ${row.turn_count ?? '?'}`).padEnd(COL.extra);
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
  if (!tmpFilePath) fail('Uso interno: mempunk session save-checkpoint <tmp_json_path>');
  requireVault();

  let data;
  try {
    data = JSON.parse(fs.readFileSync(tmpFilePath, 'utf8'));
  } catch (err) {
    fail(`No se pudo leer el archivo temporal: ${err.message}`);
  } finally {
    try { fs.unlinkSync(tmpFilePath); } catch (_) {}
  }

  const { project_id, session_id, turn_count, raw_turns, files_found } = data;
  if (!project_id || !session_id || turn_count == null) fail('Datos incompletos en el archivo temporal');

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
  if (!projectId) fail('Uso interno: mempunk session get-compact <project_id>');
  requireVault();

  const store    = openStore();
  const snapshot = store.getLastCompactSnapshot(projectId);
  // Salida JSON limpia — el hook parsea este stdout
  process.stdout.write(JSON.stringify(snapshot ?? null));
}

/** Persiste un compact_snapshot desde un temp JSON file (usado por on-compact.js hook) */
export function cmdSessionSaveCompact(tmpFilePath) {
  if (!tmpFilePath) fail('Uso interno: mempunk session save-compact <tmp_json_path>');
  requireVault();

  let data;
  try {
    data = JSON.parse(fs.readFileSync(tmpFilePath, 'utf8'));
  } catch (err) {
    fail(`No se pudo leer el archivo temporal: ${err.message}`);
  } finally {
    try { fs.unlinkSync(tmpFilePath); } catch (_) {}
  }

  const { project_id, session_id, compact_type, message_count, raw_turns, files_found, commands_run } = data;
  if (!project_id || !session_id) fail('Datos incompletos en el archivo temporal');

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
