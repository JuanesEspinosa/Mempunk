#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import VaultStore, { VAULT_VERSION } from './store/VaultStore.js';

// Versión semántica del paquete — leída desde package.json en tiempo de ejecución
const _require = createRequire(import.meta.url);
const CLI_VERSION = _require('../package.json').version;

// Directorio donde reside el propio cli.js — necesario para localizar los hooks fuente
const __cliDir = path.dirname(fileURLToPath(import.meta.url));

// Ruta del vault — MEMPUNK_VAULT permite apuntar a un vault alternativo (usado en tests)
const VAULT_PATH = process.env.MEMPUNK_VAULT ?? path.join(os.homedir(), 'Dev-Brain');

// ── Utilidades de salida ──────────────────────────────────────────────────────

/** Escribe el error en stderr y termina con código 1 */
function fail(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

/**
 * Imprime una tabla de texto plano alineada por columnas.
 * @param {string[]}   headers - Nombres de columna
 * @param {unknown[][]} rows   - Filas de datos
 */
function printTable(headers, rows) {
  if (rows.length === 0) {
    console.log('(sin resultados)');
    return;
  }

  // Calcular el ancho máximo de cada columna entre header y datos
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length))
  );

  const formatRow = (row) =>
    row.map((cell, i) => String(cell ?? '').padEnd(widths[i])).join('  ');

  console.log(formatRow(headers));
  console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  rows.forEach((row) => console.log(formatRow(row)));
}

// ── Guard de vault ────────────────────────────────────────────────────────────

/** Aborta si el vault no está inicializado */
function requireVault() {
  if (!fs.existsSync(VAULT_PATH)) {
    fail(`El vault no existe en ${VAULT_PATH}. Ejecuta "mempunk init" primero.`);
  }
}

/**
 * Abre una instancia de VaultStore apuntando al vault.
 * Por defecto advierte en stderr si el vault está desactualizado.
 * @param {boolean} skipVersionCheck - true en vault version/upgrade para evitar warning circular
 */
function openStore(skipVersionCheck = false) {
  const store = new VaultStore(VAULT_PATH);
  if (!skipVersionCheck) {
    const vaultVersion = store.getVaultVersion();
    if (vaultVersion < VAULT_VERSION) {
      process.stderr.write('⚠ Vault desactualizado. Ejecuta mempunk vault upgrade.\n');
    }
  }
  return store;
}

// ── Parseo de argumentos ─────────────────────────────────────────────────────

const { values: opts, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    priority: { type: 'string' },   // backlog add, backlog update
    status:   { type: 'string' },   // backlog list, backlog update
    tags:     { type: 'string' },   // decision add
    file:     { type: 'string' },   // skill update
    project:  { type: 'string' },   // search, sync
    files:    { type: 'string' },   // session log
    url:      { type: 'string' },    // resource add
    content:  { type: 'string' },   // resource add, daily log
    global:       { type: 'boolean' },  // hooks install/uninstall (deprecated alias — global es el default)
    local:        { type: 'boolean' },  // hooks install/uninstall --local → instala en .claude/ del proyecto actual
    check:        { type: 'boolean' },  // hooks install --check
    yes:          { type: 'boolean' },  // remove --yes
    v:            { type: 'boolean' },  // -v
    version:      { type: 'boolean' },  // --version
    cli:          { type: 'string'  },  // link/unlink --cli <name>
    'setup-mode': { type: 'string'  },  // setup --setup-mode auto|manual|vault-skills
  },
  allowPositionals: true,
  strict: false, // ignorar opciones no declaradas sin lanzar error
});

// Estructura del comando: mempunk <command> <subcommand> <arg0> <arg1> …
const [command, subcommand, ...args] = positionals;

// ── Handlers — Init ───────────────────────────────────────────────────────────

function cmdInit() {
  // Crear la estructura base del vault con todas las carpetas estándar
  const dirs = [
    VAULT_PATH,
    path.join(VAULT_PATH, 'projects'),
    path.join(VAULT_PATH, 'areas'),
    path.join(VAULT_PATH, 'resources'),
    path.join(VAULT_PATH, 'daily'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // VaultStore se encarga de crear .mempunk/ y mempunk.db
  new VaultStore(VAULT_PATH);
  console.log(`Vault inicializado en ${VAULT_PATH}`);
}

// ── Handlers — Proyectos ──────────────────────────────────────────────────────

function cmdProjectAdd(id, name) {
  if (!id || !name) fail('Uso: mempunk project add <id> <name>');
  requireVault();

  const projectPath = path.join(VAULT_PATH, 'projects', id);

  // Crear subcarpetas estándar del proyecto
  fs.mkdirSync(path.join(projectPath, 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'skills'),    { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'wiki'),      { recursive: true });

  // Copiar templates reemplazando {PROJECT_NAME} — no copiar backlog.md ni session-log.md
  // (en v2 ambos viven en SQLite, no en disco)
  const templateDir = path.join(__cliDir, '..', 'templates', 'project');
  const templateFiles = [
    ['INDEX.md',           'INDEX.md'],
    ['overview.md',        'overview.md'],
    ['architecture.md',    'architecture.md'],
    ['conventions.md',     'conventions.md'],
    ['wiki/state.md',      'wiki/state.md'],
    ['wiki/log.md',        'wiki/log.md'],
    ['wiki/index.md',      'wiki/index.md'],
  ];

  for (const [src, dest] of templateFiles) {
    const srcPath  = path.join(templateDir, src);
    const destPath = path.join(projectPath, dest);
    if (!fs.existsSync(srcPath)) continue;
    const content = fs.readFileSync(srcPath, 'utf8').replaceAll('{PROJECT_NAME}', name);
    fs.writeFileSync(destPath, content, 'utf8');
  }

  // Registrar en SQLite
  const store = openStore();
  store.addProject(id, name, projectPath);

  // Auto-activar el proyecto recién creado
  _writeActiveProject(id);

  console.log(`Proyecto "${name}" creado en ${projectPath}`);
  console.log(`Proyecto activo: ${id}`);
}

function cmdProjectList() {
  requireVault();
  const store = openStore();
  const rows = store.listProjects();
  printTable(
    ['id', 'name', 'status', 'updated_at'],
    rows.map((r) => [r.id, r.name, r.status, r.updated_at])
  );
}

/** Escribe active-project.json — compartido por cmdProjectActivate y cmdProjectAdd */
function _writeActiveProject(projectId) {
  const mempunkDir  = path.join(VAULT_PATH, '.mempunk');
  const activeFile  = path.join(mempunkDir, 'active-project.json');
  fs.mkdirSync(mempunkDir, { recursive: true });
  fs.writeFileSync(activeFile, JSON.stringify({ project_id: projectId }), 'utf8');
}

function cmdProjectActivate(id) {
  if (!id) fail('Uso: mempunk project activate <project_id>');
  requireVault();

  const store = openStore();
  if (!store.listProjects().find((p) => p.id === id)) {
    fail(`Proyecto no encontrado: "${id}". Usa mempunk project list para ver los disponibles.`);
  }

  _writeActiveProject(id);
  console.log(`Proyecto activo: ${id}`);
}

// ── Handlers — Backlog ────────────────────────────────────────────────────────

function cmdBacklogAdd(projectId, title) {
  if (!projectId || !title) fail('Uso: mempunk backlog add <project_id> "<title>" [--priority 1|2|3]');
  requireVault();

  const priority = opts.priority !== undefined ? parseInt(opts.priority, 10) : 2;
  const store = openStore();
  const id = store.addBacklogItem(projectId, title, priority);
  console.log(`Tarea agregada con id ${id}`);
}

function cmdBacklogList(projectId) {
  if (!projectId) fail('Uso: mempunk backlog list <project_id> [--status pending|in_progress|done]');
  requireVault();

  const store = openStore();
  const rows = store.listBacklog(projectId, opts.status ?? null);
  printTable(
    ['id', 'title', 'status', 'priority', 'updated_at'],
    rows.map((r) => [r.id, r.title, r.status, r.priority, r.updated_at])
  );
}

function cmdBacklogUpdate(id) {
  if (!id) fail('Uso: mempunk backlog update <id> --status <valor> | --priority <valor>');
  requireVault();

  const fields = {};
  if (opts.status   !== undefined) fields.status   = opts.status;
  if (opts.priority !== undefined) fields.priority = parseInt(opts.priority, 10);

  if (Object.keys(fields).length === 0) {
    fail('Especifica al menos --status o --priority para actualizar');
  }

  const store = openStore();
  store.updateBacklogItem(id, fields);
  console.log(`Tarea ${id} actualizada`);
}

// ── Handlers — Decisions ──────────────────────────────────────────────────────

function cmdDecisionAdd(projectId, title) {
  if (!projectId || !title) fail('Uso: mempunk decision add <project_id> "<title>" [--tags "tag1,tag2"]');
  requireVault();

  const tags = opts.tags ? opts.tags.split(',').map((t) => t.trim()) : [];
  const id   = `${projectId}-decision-${Date.now()}`;
  const now  = new Date().toISOString();
  const filePath = path.join(VAULT_PATH, 'projects', projectId, 'decisions', `${id}.md`);

  // Plantilla markdown del ADR con frontmatter y secciones estándar
  const content = [
    '---',
    `title: ${title}`,
    `tags: [${tags.join(', ')}]`,
    `created_at: ${now}`,
    '---',
    '',
    `# ${title}`,
    '',
    '## Contexto',
    '',
    '## Decisión',
    '',
    '## Consecuencias',
    '',
  ].join('\n');

  const store = openStore();
  store.addDecision(projectId, title, filePath, tags, content);
  console.log(`Decisión guardada en ${filePath}`);
}

function cmdDecisionList(projectId) {
  if (!projectId) fail('Uso: mempunk decision list <project_id>');
  requireVault();

  const store = openStore();
  const rows = store.listDecisions(projectId);

  printTable(
    ['id', 'title', 'tags', 'created_at', 'file_path'],
    rows.map((r) => [r.id, r.title, r.tags, r.created_at, r.file_path])
  );
}

// ── Handlers — Skills ─────────────────────────────────────────────────────────

function cmdSkillAdd(projectId, name) {
  if (!projectId || !name) fail('Uso: mempunk skill add <project_id> <name>');
  requireVault();

  const now      = new Date().toISOString();
  const filePath = path.join(VAULT_PATH, 'projects', projectId, 'skills', `${name}.md`);

  // Plantilla inicial del skill con frontmatter y sección vacía
  const content = [
    '---',
    `project_id: ${projectId}`,
    `name: ${name}`,
    `updated_at: ${now}`,
    '---',
    '',
    '## Contexto',
    '',
  ].join('\n');

  const store = openStore();
  store.addSkill(projectId, name, filePath, content);
  console.log(`Skill ${name} creado en ${filePath}`);
}

function cmdSkillList(projectId) {
  if (!projectId) fail('Uso: mempunk skill list <project_id>');
  requireVault();

  const store = openStore();
  const rows  = store.getSkills(projectId);
  printTable(
    ['id', 'name', 'file_path', 'updated_at'],
    rows.map((r) => [r.id, r.name, r.file_path, r.updated_at])
  );
}

function cmdSkillUpdate(id) {
  if (!id || !opts.file) fail('Uso: mempunk skill update <id> --file <path_al_markdown>');
  requireVault();

  // Resolver ruta relativa o absoluta del archivo fuente
  const sourcePath = path.resolve(opts.file);
  if (!fs.existsSync(sourcePath)) fail(`Archivo no encontrado: ${sourcePath}`);

  const content = fs.readFileSync(sourcePath, 'utf8');
  const store   = openStore();
  store.updateSkill(id, content);
  console.log(`Skill ${id} actualizado`);
}

// ── Handlers — Resources ──────────────────────────────────────────────────────

function cmdResourceAdd(projectId, title) {
  if (!projectId || !title) {
    fail('Uso: mempunk resource add <project_id> "<title>" [--url <url>] [--content "<texto>"]');
  }
  requireVault();

  const store = openStore();
  const { filePath } = store.addResource(projectId, title, opts.url ?? null, opts.content ?? '');
  console.log(`Resource guardado en ${filePath}`);
}

function cmdResourceList(projectId) {
  if (!projectId) fail('Uso: mempunk resource list <project_id>');
  requireVault();

  const store = openStore();
  const rows  = store.listResources(projectId);
  printTable(
    ['id', 'title', 'url', 'created_at'],
    rows.map((r) => [r.id, r.title, r.url ?? '', r.created_at])
  );
}

// ── Handlers — Daily logs ─────────────────────────────────────────────────────

function cmdDailyLog(projectId, content) {
  if (!projectId || !content) fail('Uso: mempunk daily log <project_id> "<content>"');
  requireVault();

  const store = openStore();
  const { filePath, appended } = store.addDailyLog(projectId, content);
  if (appended) {
    console.log(`Log agregado a ${filePath}`);
  } else {
    console.log(`Log creado en ${filePath}`);
  }
}

function cmdDailyList(projectId) {
  if (!projectId) fail('Uso: mempunk daily list <project_id>');
  requireVault();

  const store = openStore();
  const rows  = store.listDailyLogs(projectId);
  printTable(
    ['date', 'file_path'],
    rows.map((r) => [r.date, r.file_path])
  );
}

// ── Handlers — Sesiones ───────────────────────────────────────────────────────

function cmdSessionLog(projectId, summary) {
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

function cmdSessionLast(projectId) {
  if (!projectId) fail('Uso: mempunk session last <project_id>');
  requireVault();

  const store   = openStore();
  const session = store.getLastSession(projectId);

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
function cmdSessionRecover(projectId) {
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
function cmdSessionCheckpoints(projectId) {
  if (!projectId) fail('Uso: mempunk session checkpoints <project_id>');
  requireVault();

  const store       = openStore();
  const checkpoints = store.listCheckpoints(projectId);

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
function cmdSessionSaveCheckpoint(tmpFilePath) {
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
function cmdSessionGetCompact(projectId) {
  if (!projectId) fail('Uso interno: mempunk session get-compact <project_id>');
  requireVault();

  const store    = openStore();
  const snapshot = store.getLastCompactSnapshot(projectId);
  // Salida JSON limpia — el hook parsea este stdout
  process.stdout.write(JSON.stringify(snapshot ?? null));
}

/** Persiste un compact_snapshot desde un temp JSON file (usado por on-compact.js hook) */
function cmdSessionSaveCompact(tmpFilePath) {
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

// ── Handlers — Búsqueda ───────────────────────────────────────────────────────

function cmdSearch(query) {
  if (!query) fail('Uso: mempunk search "<query>" [--project <project_id>]');
  requireVault();

  const store   = openStore();
  const results = store.search(query, opts.project ?? null);

  if (results.length === 0) {
    console.log('Sin resultados');
    return;
  }

  printTable(
    ['type', 'item_id', 'project_id', 'file_path'],
    results.map((r) => [r.type, r.item_id, r.project_id, r.file_path ?? ''])
  );
}

// ── Handlers — Sync ───────────────────────────────────────────────────────────

// Archivos de scaffold que deben existir en cada proyecto
const SCAFFOLD_FILES = ['INDEX.md', 'wiki/state.md', 'wiki/log.md', 'wiki/index.md'];

function cmdSync() {
  requireVault();

  const store = openStore();
  let { missing_files, unregistered_files } = store.sync();

  // Filtrar por proyecto si se especificó --project
  if (opts.project) {
    const pid = opts.project;
    missing_files      = missing_files.filter((f) => f.project_id === pid);
    unregistered_files = unregistered_files.filter((f) =>
      f.file_path.includes(path.join('projects', pid) + path.sep) ||
      f.file_path.includes(path.join('projects', pid) + '/')
    );
  }

  // Verificar archivos de scaffold para cada proyecto registrado
  const projects = opts.project
    ? store.listProjects().filter((p) => p.id === opts.project)
    : store.listProjects();

  const missingScaffold = [];
  for (const proj of projects) {
    for (const file of SCAFFOLD_FILES) {
      const fullPath = path.join(VAULT_PATH, 'projects', proj.id, file);
      if (!fs.existsSync(fullPath)) {
        missingScaffold.push({ project_id: proj.id, file });
      }
    }
  }

  if (missing_files.length === 0 && unregistered_files.length === 0 && missingScaffold.length === 0) {
    console.log('Vault sincronizado correctamente');
    return;
  }

  if (missing_files.length > 0) {
    console.log('\nRegistros sin archivo en disco:');
    printTable(
      ['type', 'id', 'project_id', 'file_path'],
      missing_files.map((f) => [f.type, f.id, f.project_id, f.file_path])
    );
  }

  if (unregistered_files.length > 0) {
    console.log('\nArchivos sin registro en BD:');
    printTable(
      ['type', 'file_path'],
      unregistered_files.map((f) => [f.type, f.file_path])
    );
  }

  if (missingScaffold.length > 0) {
    console.log('\nArchivos de scaffold faltantes:');
    printTable(
      ['project_id', 'archivo'],
      missingScaffold.map((f) => [f.project_id, f.file])
    );
  }
}

// ── Handlers — Vault ──────────────────────────────────────────────────────────

function cmdVaultVersion() {
  requireVault();
  const store = openStore(true); // sin warning — este comando es el que verifica la versión

  const vaultVersion = store.getVaultVersion();
  console.log(`CLI   v${CLI_VERSION}`);

  if (vaultVersion < VAULT_VERSION) {
    console.log(`Vault v${vaultVersion}`);
    console.log(`⚠ Tu vault está en v${vaultVersion}. Ejecuta mempunk vault upgrade para actualizarlo.`);
  } else {
    console.log(`Vault v${vaultVersion} — OK`);
  }
}

function cmdVaultUpgrade() {
  requireVault();
  // El constructor de VaultStore ya ejecuta las migraciones pendientes
  const store = openStore(true);
  const currentVersion = store.getVaultVersion();

  if (currentVersion >= VAULT_VERSION) {
    console.log(`El vault ya está en la versión más reciente (v${VAULT_VERSION})`);
    return;
  }

  // Si vault_meta estaba desincronizado pero las tablas ya existían (_migrationsRan === 0),
  // actualizarlo explícitamente para reflejar el estado real del schema
  store.db
    .prepare('INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)')
    .run('vault_version', String(VAULT_VERSION));

  console.log(`Vault actualizado a v${VAULT_VERSION}`);
}

// ── Handlers — Hooks ──────────────────────────────────────────────────────────

// Archivos que Mempunk instala — el mismo orden se usa en install y uninstall
const HOOK_FILES  = ['on-start.js', 'on-compact.js', 'on-stop.js', 'on-prompt.js'];
const AGENT_FILES = ['mempunk-saver.md', 'mempunk-loader.md', 'mempunk-recover.md'];

// Identificadores únicos para distinguir archivos de Mempunk de otros del usuario
const HOOK_MARKER  = '# mempunk-hook';
const AGENT_MARKER = '# mempunk-agent';

// Mapeo hook file → evento de Claude Code
const HOOK_EVENT_MAP = {
  'on-start.js':   'SessionStart',
  'on-stop.js':    'Stop',
  'on-compact.js': 'PreCompact',
  'on-prompt.js':  'UserPromptSubmit',
};

// Flag file para auto-start — vive dentro del vault para ser aislable en tests
const AUTO_START_FLAG = path.join(VAULT_PATH, '.mempunk', 'auto-start.flag');

/** Devuelve el directorio destino de hooks. Global por defecto; --local para scope de proyecto. */
function hooksTargetDir() {
  return opts.local
    ? path.join(process.cwd(), '.claude', 'hooks')
    : path.join(os.homedir(), '.claude', 'hooks');
}

/** Devuelve el directorio destino de agentes. Global por defecto; --local para scope de proyecto. */
function agentsTargetDir() {
  return opts.local
    ? path.join(process.cwd(), '.claude', 'agents')
    : path.join(os.homedir(), '.claude', 'agents');
}

/** Registra hooks de Mempunk en settings.json como command hooks.
 *  Usa formato command+args separados para compatibilidad con Windows. */
function _registerHooksInSettings(hooksDir) {
  const settings = readJsonFile(CLAUDE_SETTINGS_PATH);
  if (!settings.hooks) settings.hooks = {};

  // Limpiar entradas legacy (type:prompt o command-string-unico) de Mempunk
  for (const event of Object.values(HOOK_EVENT_MAP)) {
    if (!Array.isArray(settings.hooks[event])) continue;
    settings.hooks[event] = settings.hooks[event].filter((g) => {
      if (!g.hooks) return true;
      const isMempunkLegacy = g.hooks.some(
        (h) => h.prompt?.includes('mempunk-auto-start') ||
               (h.type === 'command' && typeof h.command === 'string' &&
                h.command.includes('mempunk') && !h.args)
      );
      return !isMempunkLegacy;
    });
  }

  for (const [file, event] of Object.entries(HOOK_EVENT_MAP)) {
    const scriptPath = path.join(hooksDir, file);
    if (!settings.hooks[event]) settings.hooks[event] = [];

    // No duplicar si ya existe entrada con node + este script en args
    const alreadyRegistered = settings.hooks[event].some((g) =>
      g.hooks?.some((h) =>
        h.type === 'command' && h.command === 'node' &&
        Array.isArray(h.args) && h.args[0] === scriptPath
      )
    );
    if (!alreadyRegistered) {
      settings.hooks[event].push({
        matcher: '',
        hooks: [{ type: 'command', command: 'node', args: [scriptPath] }],
      });
    }

    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }

  writeJsonFile(CLAUDE_SETTINGS_PATH, settings);
}

/** Elimina hooks de Mempunk de settings.json. */
function _unregisterHooksFromSettings(hooksDir) {
  const settings = readJsonFile(CLAUDE_SETTINGS_PATH);
  if (!settings.hooks) return;

  for (const [file, event] of Object.entries(HOOK_EVENT_MAP)) {
    if (!Array.isArray(settings.hooks[event])) continue;
    const scriptPath = path.join(hooksDir, file);
    settings.hooks[event] = settings.hooks[event].filter(
      (g) => !g.hooks?.some(
        (h) => h.type === 'command' && h.command === 'node' &&
               Array.isArray(h.args) && h.args[0] === scriptPath
      )
    );
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }

  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  writeJsonFile(CLAUDE_SETTINGS_PATH, settings);
}

function cmdHooksInstall() {
  const sourceDir = path.join(__cliDir, 'hooks');
  const targetDir = hooksTargetDir();

  // Verificar que los hooks fuente existen antes de proceder
  for (const file of HOOK_FILES) {
    if (!fs.existsSync(path.join(sourceDir, file))) {
      fail(`Hook fuente no encontrado: ${path.join(sourceDir, file)}`);
    }
  }

  // Modo --check: solo informar si están instalados, sin modificar nada
  if (opts.check) {
    const agentsDir    = agentsTargetDir();
    const hooksOk      = HOOK_FILES.filter((f) => fs.existsSync(path.join(targetDir, f)));
    const agentsOk     = AGENT_FILES.filter((f) => fs.existsSync(path.join(agentsDir, f)));

    console.log(`Hooks (${targetDir}):`);
    HOOK_FILES.forEach((f) => console.log(`  ${hooksOk.includes(f) ? '✓' : '✗'} ${f}`));
    console.log(`Agentes (${agentsDir}):`);
    AGENT_FILES.forEach((f) => console.log(`  ${agentsOk.includes(f) ? '✓' : '✗'} ${f}`));

    const statuslineOk = fs.existsSync(path.join(os.homedir(), '.mempunk', 'statusline.js'));
    console.log(`Statusline: ${statuslineOk ? '✓' : '✗'}`);
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  // package.json ESM necesario para que Node.js trate los hooks como módulos ESM
  fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');

  for (const file of HOOK_FILES) {
    const dest = path.join(targetDir, file);
    fs.copyFileSync(path.join(sourceDir, file), dest);
    // Hacer ejecutable el script en sistemas Unix — en Windows no tiene efecto pero no falla
    try { fs.chmodSync(dest, 0o755); } catch (_) {}
  }

  // Registrar hooks en settings.json como command hooks
  _registerHooksInSettings(targetDir);

  // Instalar statusline: copiar src/statusline.js a ~/.mempunk/statusline.js
  const statuslineSrc  = path.join(__cliDir, 'statusline.js');
  const statuslineDest = path.join(os.homedir(), '.mempunk', 'statusline.js');
  if (fs.existsSync(statuslineSrc)) {
    fs.mkdirSync(path.dirname(statuslineDest), { recursive: true });
    fs.copyFileSync(statuslineSrc, statuslineDest);
    try { fs.chmodSync(statuslineDest, 0o755); } catch (_) {}

    // Registrar statusline en ~/.claude/settings.json si no está configurado ya
    const settings = readJsonFile(CLAUDE_SETTINGS_PATH);
    if (!settings.statusLine) {
      settings.statusLine = {
        type:    'command',
        command: `node ${statuslineDest}`,
      };
      writeJsonFile(CLAUDE_SETTINGS_PATH, settings);
      console.log(`Statusline configurado en ${CLAUDE_SETTINGS_PATH}`);
    } else {
      console.log('Statusline ya configurado — no se modificó settings.json');
    }
  }

  // Instalar agentes: copiar src/agents/*.md a .claude/agents/ (local o global)
  const agentSrcDir  = path.join(__cliDir, 'agents');
  const agentDestDir = agentsTargetDir();

  if (fs.existsSync(agentSrcDir)) {
    fs.mkdirSync(agentDestDir, { recursive: true });
    for (const file of AGENT_FILES) {
      const src = path.join(agentSrcDir, file);
      if (!fs.existsSync(src)) continue;
      fs.copyFileSync(src, path.join(agentDestDir, file));
    }
    console.log(`Agentes instalados en ${agentDestDir}`);
  }

  console.log(`Hooks instalados en ${targetDir}`);
}

function cmdHooksUninstall() {
  const targetDir = hooksTargetDir();

  if (!fs.existsSync(targetDir)) {
    console.log(`No hay hooks instalados en ${targetDir}`);
    return;
  }

  let removed = 0;
  for (const file of HOOK_FILES) {
    const filePath = path.join(targetDir, file);
    if (!fs.existsSync(filePath)) continue;

    // Solo eliminar hooks que contengan el marcador — no tocar otros hooks del usuario
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes(HOOK_MARKER)) {
        fs.unlinkSync(filePath);
        removed++;
      }
    } catch (_) {}
  }

  if (removed > 0) {
    console.log(`Hooks eliminados de ${targetDir}`);
  } else {
    console.log(`No se encontraron hooks de Mempunk en ${targetDir}`);
  }

  // Eliminar agentes de Mempunk (solo los marcados con # mempunk-agent)
  const agentDir = agentsTargetDir();
  let agentsRemoved = 0;
  for (const file of AGENT_FILES) {
    const filePath = path.join(agentDir, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes(AGENT_MARKER)) {
        fs.unlinkSync(filePath);
        agentsRemoved++;
      }
    } catch (_) {}
  }
  if (agentsRemoved > 0) console.log(`Agentes eliminados de ${agentDir}`);

  // Eliminar registros de settings.json
  _unregisterHooksFromSettings(targetDir);
}

// ── Helpers — archivos de config ─────────────────────────────────────────────

const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const MEMPUNK_HOOK_MARKER  = 'mempunk-auto-start';
const MEMPUNK_HOOK_PROMPT  =
  'mempunk-auto-start: The user has mempunk auto-start enabled. Use @mempunk-loader to load the vault context for the current project.';

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// ── Definiciones de CLI ───────────────────────────────────────────────────────

const CLAUDE_CONFIG_PATH   = path.join(os.homedir(), '.claude.json');
const GEMINI_CONFIG_PATH   = path.join(os.homedir(), '.gemini', 'settings.json');
const OPENCODE_AGENTS_PATH = path.join(os.homedir(), '.config', 'opencode', 'AGENTS.md');

// Markers para el bloque de opencode en AGENTS.md
const OC_VAULT_START = '<!-- MEMPUNK:VAULTS:START -->';
const OC_VAULT_END   = '<!-- MEMPUNK:VAULTS:END -->';
const OC_PATHS_END   = '<!-- MEMPUNK:PATHS:END -->';

function parseOpencodeVaults(content) {
  const si = content.indexOf(OC_VAULT_START);
  const ei = content.indexOf(OC_VAULT_END);
  if (si === -1 || ei === -1 || ei < si) return [];
  const pi = content.indexOf(OC_PATHS_END);
  const boundary = pi !== -1 && pi < ei ? pi : ei;
  return content.substring(si + OC_VAULT_START.length, boundary)
    .split('\n').map(l => l.trim()).filter(l => l.startsWith('- '))
    .map(l => l.slice(2).trim()).filter(Boolean);
}

function renderOpencodeBlock(vaults) {
  const lines = vaults.map(v => `- ${v}`).join('\n');
  return `${OC_VAULT_START}
## Mempunk — persistent dev brain

Vaults:

${lines}
${OC_PATHS_END}

### /mempunk — Session start protocol

When the user types "/mempunk" or asks to load vault context:

1. For each vault path above, check if it contains a CLAUDE.md file.
2. If only ONE vault: use it. If MULTIPLE: ask the user which one.
3. Read the vault's CLAUDE.md and list the projects in "Proyectos activos".
4. Ask the user which project to work on — never assume.
5. Read the project's INDEX.md, then overview.md.
6. Check if wiki/state.md exists: if yes read it; if no read last 3 entries of session-log.md. Then read backlog.md.
7. Confirm context with the user before proceeding.

Never read project files before the user confirms which project.

### /session-end — Session close protocol

When the user types "/session-end" or says they're done:

1. Write a structured entry to session-log.md (most recent first).
2. Update backlog.md: mark completed [x], add new tasks.
3. Update INDEX.md: latest session summary and top 3 backlog.
4. Update wiki/state.md if it exists, append to wiki/log.md.
5. Write or update daily/YYYY-MM-DD.md.
6. Confirm what was logged.
${OC_VAULT_END}`;
}

function upsertOpencodeBlock(vaults) {
  const content = fs.existsSync(OPENCODE_AGENTS_PATH)
    ? fs.readFileSync(OPENCODE_AGENTS_PATH, 'utf8') : '';
  const block = renderOpencodeBlock(vaults);
  let next;
  if (content.includes(OC_VAULT_START) && content.includes(OC_VAULT_END)) {
    const si = content.indexOf(OC_VAULT_START);
    const ei = content.indexOf(OC_VAULT_END) + OC_VAULT_END.length;
    next = content.slice(0, si) + block + content.slice(ei);
  } else {
    const sep = content && !content.endsWith('\n') ? '\n\n' : content ? '\n' : '';
    next = content + sep + block + '\n';
  }
  fs.mkdirSync(path.dirname(OPENCODE_AGENTS_PATH), { recursive: true });
  fs.writeFileSync(OPENCODE_AGENTS_PATH, next);
}

function removeOpencodeBlock() {
  if (!fs.existsSync(OPENCODE_AGENTS_PATH)) return;
  const content = fs.readFileSync(OPENCODE_AGENTS_PATH, 'utf8');
  if (!content.includes(OC_VAULT_START)) return;
  const si = content.indexOf(OC_VAULT_START);
  const ei = content.indexOf(OC_VAULT_END) + OC_VAULT_END.length;
  let next = content.slice(0, si) + content.slice(ei);
  next = next.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n');
  if (next.trim() === '') { fs.unlinkSync(OPENCODE_AGENTS_PATH); }
  else { fs.writeFileSync(OPENCODE_AGENTS_PATH, next); }
}

const CLI_DEFS = {
  'claude-code': {
    displayName: 'Claude Code',
    isInstalled() {
      return fs.existsSync(CLAUDE_CONFIG_PATH) || fs.existsSync(path.join(os.homedir(), '.claude'));
    },
    getRegisteredDirs() {
      const cfg = readJsonFile(CLAUDE_CONFIG_PATH);
      return Array.isArray(cfg.additionalDirectories) ? cfg.additionalDirectories : [];
    },
    addDir(vaultPath) {
      const cfg = readJsonFile(CLAUDE_CONFIG_PATH);
      if (!Array.isArray(cfg.additionalDirectories)) cfg.additionalDirectories = [];
      if (cfg.additionalDirectories.includes(vaultPath)) return false;
      cfg.additionalDirectories.push(vaultPath);
      writeJsonFile(CLAUDE_CONFIG_PATH, cfg);
      return true;
    },
    removeDir(vaultPath) {
      const cfg = readJsonFile(CLAUDE_CONFIG_PATH);
      if (!Array.isArray(cfg.additionalDirectories)) return false;
      const before = cfg.additionalDirectories.length;
      cfg.additionalDirectories = cfg.additionalDirectories.filter(d => d !== vaultPath);
      if (cfg.additionalDirectories.length === before) return false;
      writeJsonFile(CLAUDE_CONFIG_PATH, cfg);
      return true;
    },
  },
  'gemini-cli': {
    displayName: 'Gemini CLI',
    isInstalled() {
      if (fs.existsSync(path.join(os.homedir(), '.gemini'))) return true;
      return spawnSync('which', ['gemini'], { stdio: 'ignore' }).status === 0;
    },
    getRegisteredDirs() {
      const cfg = readJsonFile(GEMINI_CONFIG_PATH);
      return Array.isArray(cfg.context?.includeDirectories) ? cfg.context.includeDirectories : [];
    },
    addDir(vaultPath) {
      const cfg = readJsonFile(GEMINI_CONFIG_PATH);
      if (!cfg.context) cfg.context = {};
      if (!Array.isArray(cfg.context.includeDirectories)) cfg.context.includeDirectories = [];
      if (cfg.context.includeDirectories.includes(vaultPath)) return false;
      cfg.context.includeDirectories.push(vaultPath);
      cfg.context.loadMemoryFromIncludeDirectories = true;
      writeJsonFile(GEMINI_CONFIG_PATH, cfg);
      return true;
    },
    removeDir(vaultPath) {
      const cfg = readJsonFile(GEMINI_CONFIG_PATH);
      if (!Array.isArray(cfg.context?.includeDirectories)) return false;
      const before = cfg.context.includeDirectories.length;
      cfg.context.includeDirectories = cfg.context.includeDirectories.filter(d => d !== vaultPath);
      if (cfg.context.includeDirectories.length === before) return false;
      if (cfg.context.includeDirectories.length === 0) {
        delete cfg.context.includeDirectories;
        delete cfg.context.loadMemoryFromIncludeDirectories;
        if (Object.keys(cfg.context).length === 0) delete cfg.context;
      }
      writeJsonFile(GEMINI_CONFIG_PATH, cfg);
      return true;
    },
  },
  'opencode': {
    displayName: 'opencode',
    isInstalled() {
      if (fs.existsSync(path.dirname(OPENCODE_AGENTS_PATH))) return true;
      return spawnSync('which', ['opencode'], { stdio: 'ignore' }).status === 0;
    },
    getRegisteredDirs() {
      if (!fs.existsSync(OPENCODE_AGENTS_PATH)) return [];
      return parseOpencodeVaults(fs.readFileSync(OPENCODE_AGENTS_PATH, 'utf8'));
    },
    addDir(vaultPath) {
      const current = this.getRegisteredDirs();
      if (current.includes(vaultPath)) return false;
      upsertOpencodeBlock([...current, vaultPath]);
      return true;
    },
    removeDir(vaultPath) {
      const current = this.getRegisteredDirs();
      if (!current.includes(vaultPath)) return false;
      const next = current.filter(v => v !== vaultPath);
      if (next.length === 0) { removeOpencodeBlock(); }
      else { upsertOpencodeBlock(next); }
      return true;
    },
  },
};

const CLI_ALIASES = {
  'claude': 'claude-code', 'claude-code': 'claude-code',
  'gemini': 'gemini-cli',  'gemini-cli':  'gemini-cli',
  'opencode': 'opencode',
};

/** Devuelve los CLI keys a operar según --cli flag (default: todos los instalados) */
function resolveCLIs() {
  const flag = opts.cli;
  if (!flag || flag === 'all') return Object.keys(CLI_DEFS);
  const key = CLI_ALIASES[flag];
  if (!key) fail(`CLI desconocido: "${flag}". Opciones: claude, gemini, opencode`);
  return [key];
}

/** Alias legible para el flag: claude-code→claude, gemini-cli→gemini */
function cliFlag(key) {
  return key === 'claude-code' ? 'claude' : key === 'gemini-cli' ? 'gemini' : key;
}

// ── Handlers — Link / Unlink ──────────────────────────────────────────────────

function cmdLink() {
  const normalized = VAULT_PATH.replace(/\\/g, '/');
  const clis = resolveCLIs();
  let anyLinked = false;

  for (const key of clis) {
    const def = CLI_DEFS[key];
    const added = def.addDir(normalized);
    if (added) {
      console.log(`Vault vinculado a ${def.displayName}: ${normalized}`);
      anyLinked = true;
    } else {
      console.log(`Vault ya vinculado a ${def.displayName}`);
    }
  }
  if (anyLinked) console.log('Reinicia los CLIs para aplicar el cambio.');
}

function cmdUnlink() {
  const normalized = VAULT_PATH.replace(/\\/g, '/');
  const clis = resolveCLIs();

  for (const key of clis) {
    const def = CLI_DEFS[key];
    const removed = def.removeDir(normalized);
    if (removed) {
      console.log(`Vault desvinculado de ${def.displayName}`);
    } else {
      console.log(`Vault no estaba vinculado a ${def.displayName}`);
    }
  }
}

// ── Handlers — Status ─────────────────────────────────────────────────────────

function cmdStatus() {
  requireVault();
  const store = openStore();
  const projects = store.listProjects();
  const normalized = VAULT_PATH.replace(/\\/g, '/');

  console.log(`\nVault:     ${VAULT_PATH}`);
  console.log(`CLI:       v${CLI_VERSION}  |  Vault schema: v${store.getVaultVersion()}`);

  for (const [key, def] of Object.entries(CLI_DEFS)) {
    if (!def.isInstalled()) continue;
    const linked = def.getRegisteredDirs().includes(normalized);
    const hint   = linked ? 'vinculado' : `no vinculado (mempunk link --cli ${cliFlag(key)})`;
    console.log(`${def.displayName.padEnd(12)}: ${hint}`);
  }
  console.log(`Proyectos: ${projects.length}`);

  if (projects.length === 0) {
    console.log('\n(sin proyectos registrados)\n');
    return;
  }

  console.log('');
  for (const proj of projects) {
    const pending    = store.listBacklog(proj.id, 'pending').length;
    const inProgress = store.listBacklog(proj.id, 'in_progress').length;
    const lastSess   = store.getLastSession(proj.id);
    const lastDate   = lastSess ? lastSess.ended_at.slice(0, 10) : '—';
    console.log(`  ${proj.id}  (${proj.name})`);
    console.log(`    backlog: ${pending} pendiente(s) / ${inProgress} en curso  |  última sesión: ${lastDate}`);
  }
  console.log('');
}

// ── Handlers — Remove ─────────────────────────────────────────────────────────

function cmdRemove(projectId) {
  if (!projectId) fail('Uso: mempunk remove <project_id> --yes');
  requireVault();

  if (!opts.yes) {
    fail(`Operación destructiva. Confirma con: mempunk remove ${projectId} --yes`);
  }

  const store = openStore();
  if (!store.listProjects().find(p => p.id === projectId)) {
    fail(`Proyecto no encontrado: ${projectId}`);
  }

  store.db.prepare('DELETE FROM backlog       WHERE project_id = ?').run(projectId);
  store.db.prepare('DELETE FROM decisions     WHERE project_id = ?').run(projectId);
  store.db.prepare('DELETE FROM project_skills WHERE project_id = ?').run(projectId);
  store.db.prepare('DELETE FROM session_log   WHERE project_id = ?').run(projectId);
  store.db.prepare('DELETE FROM resources     WHERE project_id = ?').run(projectId);
  store.db.prepare('DELETE FROM daily_logs    WHERE project_id = ?').run(projectId);
  store.db.prepare('DELETE FROM search_index  WHERE project_id = ?').run(projectId);
  store.db.prepare('DELETE FROM projects      WHERE id = ?').run(projectId);

  const projectDir = path.join(VAULT_PATH, 'projects', projectId);
  if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });

  console.log(`Proyecto "${projectId}" eliminado`);
}

// ── Handlers — Doctor ─────────────────────────────────────────────────────────

function cmdDoctor() {
  requireVault();

  let issues   = 0;
  let warnings = 0;
  const ok   = (msg) => console.log(`  ✓ ${msg}`);
  const warn = (msg) => { console.log(`  ! ${msg}`); warnings++; };
  const err  = (msg) => { console.log(`  ✗ ${msg}`); issues++; };

  console.log(`\nVault: ${VAULT_PATH}\n`);

  const dbPath = path.join(VAULT_PATH, '.mempunk', 'mempunk.db');
  if (fs.existsSync(dbPath)) { ok('Base de datos encontrada'); }
  else { err('Base de datos no encontrada — ejecuta mempunk init'); }

  const store = openStore(true);
  const vaultVer = store.getVaultVersion();
  if (vaultVer < VAULT_VERSION) {
    warn(`Vault desactualizado (v${vaultVer} → v${VAULT_VERSION}) — ejecuta mempunk vault upgrade`);
  } else {
    ok(`Vault v${vaultVer} — actualizado`);
  }

  const projects = store.listProjects();
  ok(`${projects.length} proyecto(s) en BD`);

  for (const proj of projects) {
    const dir = path.join(VAULT_PATH, 'projects', proj.id);
    if (!fs.existsSync(dir)) {
      warn(`Proyecto "${proj.id}": directorio no encontrado en disco`);
    } else {
      if (!fs.existsSync(path.join(dir, 'decisions'))) warn(`Proyecto "${proj.id}": falta decisions/`);
      if (!fs.existsSync(path.join(dir, 'skills')))    warn(`Proyecto "${proj.id}": falta skills/`);
    }
  }

  const normalized = VAULT_PATH.replace(/\\/g, '/');
  for (const [key, def] of Object.entries(CLI_DEFS)) {
    if (!def.isInstalled()) continue;
    const linked = def.getRegisteredDirs().includes(normalized);
    if (linked) { ok(`Vault vinculado a ${def.displayName}`); }
    else { warn(`Vault no vinculado a ${def.displayName} — ejecuta mempunk link --cli ${cliFlag(key)}`); }
  }

  const HOOK_FILES_DOC  = ['on-start.js', 'on-compact.js', 'on-stop.js', 'on-prompt.js'];
  const AGENT_FILES_DOC = ['mempunk-saver.md', 'mempunk-loader.md', 'mempunk-recover.md'];
  const globalHooksDir  = path.join(os.homedir(), '.claude', 'hooks');
  const localHooksDir   = path.join(process.cwd(), '.claude', 'hooks');
  const globalAgentsDir = path.join(os.homedir(), '.claude', 'agents');
  const localAgentsDir  = path.join(process.cwd(), '.claude', 'agents');

  const globalHooksOk  = HOOK_FILES_DOC.every(f => fs.existsSync(path.join(globalHooksDir, f)));
  const localHooksOk   = HOOK_FILES_DOC.every(f => fs.existsSync(path.join(localHooksDir, f)));
  const globalAgentsOk = AGENT_FILES_DOC.every(f => fs.existsSync(path.join(globalAgentsDir, f)));
  const localAgentsOk  = AGENT_FILES_DOC.every(f => fs.existsSync(path.join(localAgentsDir, f)));

  if (globalHooksOk)     { ok('Hooks instalados (global)'); }
  else if (localHooksOk) { ok('Hooks instalados (local)'); }
  else { warn('Hooks no instalados — ejecuta mempunk hooks install'); }

  if (globalAgentsOk || localAgentsOk) { ok(`Agentes instalados (${globalAgentsOk ? 'global' : 'local'})`); }
  else { warn('Agentes no instalados — ejecuta mempunk hooks install'); }

  // Revisar hooks.log por errores recientes (últimas 50 líneas)
  const hooksLogPath = path.join(VAULT_PATH, '.mempunk', 'hooks.log');
  if (fs.existsSync(hooksLogPath)) {
    const logLines = fs.readFileSync(hooksLogPath, 'utf8').split('\n').filter(Boolean);
    const recentErrors = logLines.slice(-50).filter(l => l.includes(' Error'));
    if (recentErrors.length > 0) {
      warn(`hooks.log contiene ${recentErrors.length} error(es) reciente(s) — revisa: ${hooksLogPath}`);
      recentErrors.slice(-3).forEach(l => console.log(`    ${l}`));
    } else {
      ok('hooks.log sin errores recientes');
    }
  }

  // Verificar proyecto activo (.mempunk/active-project.json)
  const activeFile = path.join(VAULT_PATH, '.mempunk', 'active-project.json');
  if (fs.existsSync(activeFile)) {
    try {
      const { project_id } = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
      ok(`Proyecto activo: ${project_id}`);
    } catch (_) {
      warn('active-project.json existe pero no es JSON válido — ejecuta mempunk project activate <id>');
    }
  } else {
    // Tomar un proyecto real de la BD para el ejemplo; si no hay ninguno, usar uno inventado
    const exampleId = store.listProjects()[0]?.id ?? 'cuidado-gatos';
    warn(
      'Sin proyecto activo — los hooks no pueden guardar checkpoints\n' +
      `    Solución: mempunk project activate <id>\n` +
      `    Ejemplo:  mempunk project activate ${exampleId}`
    );
  }

  console.log('');
  if (issues === 0 && warnings === 0) {
    console.log('  ✓ Todo en orden\n');
  } else {
    if (issues   > 0) console.log(`  ✗ ${issues} error(s)`);
    if (warnings > 0) console.log(`  ! ${warnings} advertencia(s)`);
    console.log('');
  }
}

// ── Handlers — Auto-start ─────────────────────────────────────────────────────

// Auto-start se controla via flag file leído por on-start.js en cada SessionStart.
// No escribe en settings.json — los hooks ya están registrados por cmdHooksInstall.

function cmdAutoStart(action) {
  const enabled = fs.existsSync(AUTO_START_FLAG);

  if (!action) {
    console.log(`Auto-start: ${enabled ? 'on' : 'off'}`);
    return;
  }

  if (action === 'on') {
    if (enabled) { console.log('Auto-start ya estaba activo'); return; }

    // Advertir si los hooks no están instalados — on-start.js los necesita
    const globalHooksDir = path.join(os.homedir(), '.claude', 'hooks');
    if (!fs.existsSync(path.join(globalHooksDir, 'on-start.js'))) {
      process.stderr.write(
        '! Auto-start requiere que los hooks estén instalados.\n' +
        '  Ejecuta primero: mempunk hooks install\n'
      );
    }

    fs.mkdirSync(path.dirname(AUTO_START_FLAG), { recursive: true });
    fs.writeFileSync(AUTO_START_FLAG, '');
    console.log('Auto-start activado');
  } else if (action === 'off') {
    if (!enabled) { console.log('Auto-start ya estaba inactivo'); return; }
    fs.unlinkSync(AUTO_START_FLAG);
    console.log('Auto-start desactivado');
  } else {
    fail(`Acción desconocida: "${action}". Usa: on | off`);
  }
}

// ── Handlers — Setup ──────────────────────────────────────────────────────────

/** Copia vault-skills al directorio del vault */
function _installVaultSkills() {
  const srcDir  = path.join(__cliDir, '..', 'vault-skills');
  const destDir = path.join(VAULT_PATH, 'vault-skills');
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    if (file.endsWith('.md')) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }
  }
}

/**
 * Setup interactivo.
 * Modos válidos: 'auto' | 'manual' | 'vault-skills'
 *   auto         → Claude Code + hooks + agentes
 *   manual       → Claude Code + vault-skills (sin hooks)
 *   vault-skills → Gemini / opencode + vault-skills (sin hooks)
 *
 * Pasa --setup-mode <modo> para saltear las preguntas (CI / tests).
 */
async function cmdSetup() {
  // ── Step 1: Vault ────────────────────────────────────────────────────────
  if (!fs.existsSync(VAULT_PATH)) {
    cmdInit();
    console.log(`✓ Vault creado en ${VAULT_PATH}`);
  } else {
    console.log(`✓ Vault existente en ${VAULT_PATH}`);
  }

  // ── Step 2: Determinar modo ──────────────────────────────────────────────
  let mode = opts['setup-mode'] ?? null;

  if (!mode) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    console.log('\n¿Qué AI CLI usas principalmente?');
    console.log('  1. Claude Code');
    console.log('  2. Gemini CLI / opencode / otra\n');
    const cliAnswer = (await rl.question('Elige (1 o 2): ')).trim();
    const isClaudeCode = cliAnswer !== '2';

    if (isClaudeCode) {
      console.log('\n¿Cómo quieres que funcione Mempunk?');
      console.log('  1. Automático — hooks + agentes  (recomendado)');
      console.log('     Los hooks guardan checkpoints solos y @mempunk-loader');
      console.log('     carga el contexto al inicio de cada sesión.');
      console.log('  2. Manual — solo vault-skills');
      console.log('     Corres los protocolos tú mismo al inicio/fin de sesión.\n');
      const modeAnswer = (await rl.question('Elige (1 o 2): ')).trim();
      mode = modeAnswer === '2' ? 'manual' : 'auto';
    } else {
      mode = 'vault-skills';
    }

    rl.close();
  }

  // Validar modo si vino por flag
  if (!['auto', 'manual', 'vault-skills'].includes(mode)) {
    fail(`--setup-mode inválido: "${mode}". Usa: auto | manual | vault-skills`);
  }

  // ── Step 3: Vincular vault a los CLIs correspondientes ───────────────────
  const normalized = VAULT_PATH.replace(/\\/g, '/');

  if (mode === 'auto' || mode === 'manual') {
    const added = CLI_DEFS['claude-code'].addDir(normalized);
    console.log(`✓ Vault ${added ? 'vinculado' : 'ya vinculado'} a Claude Code`);
  } else {
    let anyLinked = false;
    for (const key of ['gemini-cli', 'opencode']) {
      const def = CLI_DEFS[key];
      if (def.isInstalled()) {
        const added = def.addDir(normalized);
        console.log(`✓ Vault ${added ? 'vinculado' : 'ya vinculado'} a ${def.displayName}`);
        anyLinked = true;
      }
    }
    if (!anyLinked) {
      console.log('! No se detectó Gemini CLI ni opencode instalados. Vincula manualmente con:');
      console.log('    mempunk link --cli gemini   (o opencode)');
    }
  }

  // ── Step 4: Instalar hooks+agentes o vault-skills ────────────────────────
  if (mode === 'auto') {
    cmdHooksInstall();
    cmdAutoStart('on');
  } else {
    _installVaultSkills();
    console.log(`✓ vault-skills instalados en ${path.join(VAULT_PATH, 'vault-skills')}`);
  }

  // ── Step 5: Guardar configuración de setup ───────────────────────────────
  const mempunkDir  = path.join(VAULT_PATH, '.mempunk');
  const setupConfig = {
    mode,
    cli: mode === 'vault-skills' ? 'other' : 'claude-code',
    created_at: new Date().toISOString(),
  };
  fs.mkdirSync(mempunkDir, { recursive: true });
  fs.writeFileSync(
    path.join(mempunkDir, 'setup.json'),
    JSON.stringify(setupConfig, null, 2) + '\n',
  );

  // ── Step 6: Resumen final ────────────────────────────────────────────────
  const line = '─'.repeat(52);
  console.log(`\n${line}`);
  console.log('Próximo paso:');
  console.log('  mempunk project add <id> "<nombre del proyecto>"');
  if (mode === 'auto') {
    console.log('\nAl iniciar Claude Code: @mempunk-loader se ejecuta automáticamente.');
  } else {
    const skillPath = path.join(VAULT_PATH, 'vault-skills', 'session-start.md');
    console.log('\nPara cargar contexto al inicio de sesión:');
    console.log(`  Lee ${skillPath}`);
  }
  if (mode !== 'auto') {
    console.log('\nSi migras a Claude Code en el futuro:');
    console.log('  mempunk setup --setup-mode auto');
  }
  console.log(`${line}\n`);
}

// ── Handlers — Log (abrir proyecto en editor) ─────────────────────────────────

function cmdOpenLog(projectId) {
  if (!projectId) fail('Uso: mempunk log <project_id>');
  requireVault();

  const store = openStore();
  if (!store.listProjects().find(p => p.id === projectId)) {
    fail(`Proyecto no encontrado: ${projectId}`);
  }

  const projectDir = path.join(VAULT_PATH, 'projects', projectId);
  if (!fs.existsSync(projectDir)) fail(`Directorio no encontrado: ${projectDir}`);

  const indexFile = path.join(projectDir, 'INDEX.md');
  const target    = fs.existsSync(indexFile) ? indexFile : projectDir;

  const editor = process.env.VISUAL || process.env.EDITOR;
  if (editor) {
    spawnSync(editor, [target], { stdio: 'inherit' });
  } else {
    const opener = process.platform === 'win32' ? 'explorer'
      : process.platform === 'darwin' ? 'open'
      : 'xdg-open';
    spawnSync(opener, [target], { stdio: 'ignore', detached: true });
  }
  console.log(`Abierto: ${target}`);
}

// ── Handlers — CLI list ───────────────────────────────────────────────────────

function cmdCliList() {
  const normalized = VAULT_PATH.replace(/\\/g, '/');
  console.log('\nCLIs compatibles con Mempunk:\n');

  for (const [key, def] of Object.entries(CLI_DEFS)) {
    const installed = def.isInstalled();
    const linked    = installed && def.getRegisteredDirs().includes(normalized);
    const bullet    = !installed ? '○' : linked ? '●' : '◐';
    const status    = !installed
      ? '(no instalado)'
      : linked
        ? '(vinculado)'
        : `(no vinculado — mempunk link --cli ${cliFlag(key)})`;
    console.log(`  ${bullet} ${def.displayName}  ${status}`);
  }
  console.log('');
}

// ── Router principal ──────────────────────────────────────────────────────────

(async () => {
try {
  if (opts.v || opts.version) {
    console.log(`mempunk v${CLI_VERSION}`);
    process.exit(0);
  }

  switch (command) {
    case 'init':
      cmdInit();
      break;

    case 'project':
      switch (subcommand) {
        case 'add':      cmdProjectAdd(args[0], args[1]); break;
        case 'list':     cmdProjectList(); break;
        case 'activate': cmdProjectActivate(args[0]); break;
        default: fail(`Subcomando desconocido: project ${subcommand ?? ''}. Usa: add | list | activate`);
      }
      break;

    case 'backlog':
      switch (subcommand) {
        case 'add':    cmdBacklogAdd(args[0], args[1]); break;
        case 'list':   cmdBacklogList(args[0]); break;
        case 'update': cmdBacklogUpdate(args[0]); break;
        default: fail(`Subcomando desconocido: backlog ${subcommand ?? ''}. Usa: add | list | update`);
      }
      break;

    case 'decision':
      switch (subcommand) {
        case 'add':  cmdDecisionAdd(args[0], args[1]); break;
        case 'list': cmdDecisionList(args[0]); break;
        default: fail(`Subcomando desconocido: decision ${subcommand ?? ''}. Usa: add | list`);
      }
      break;

    case 'skill':
      switch (subcommand) {
        case 'add':    cmdSkillAdd(args[0], args[1]); break;
        case 'list':   cmdSkillList(args[0]); break;
        case 'update': cmdSkillUpdate(args[0]); break;
        default: fail(`Subcomando desconocido: skill ${subcommand ?? ''}. Usa: add | list | update`);
      }
      break;

    case 'resource':
      switch (subcommand) {
        case 'add':  cmdResourceAdd(args[0], args[1]); break;
        case 'list': cmdResourceList(args[0]); break;
        default: fail(`Subcomando desconocido: resource ${subcommand ?? ''}. Usa: add | list`);
      }
      break;

    case 'daily':
      switch (subcommand) {
        case 'log':  cmdDailyLog(args[0], args[1]); break;
        case 'list': cmdDailyList(args[0]); break;
        default: fail(`Subcomando desconocido: daily ${subcommand ?? ''}. Usa: log | list`);
      }
      break;

    case 'session':
      switch (subcommand) {
        case 'log':             cmdSessionLog(args[0], args[1]); break;
        case 'last':            cmdSessionLast(args[0]); break;
        case 'recover':         cmdSessionRecover(args[0]); break;
        case 'checkpoints':     cmdSessionCheckpoints(args[0]); break;
        case 'save-compact':    cmdSessionSaveCompact(args[0]); break;
        case 'get-compact':     cmdSessionGetCompact(args[0]); break;
        case 'save-checkpoint': cmdSessionSaveCheckpoint(args[0]); break;
        default: fail(`Subcomando desconocido: session ${subcommand ?? ''}. Usa: log | last | recover | checkpoints | save-compact | get-compact | save-checkpoint`);
      }
      break;

    // search no tiene subcomando — la query ocupa positionals[1]
    case 'search':
      cmdSearch(subcommand);
      break;

    case 'sync':
      cmdSync();
      break;

    case 'vault':
      switch (subcommand) {
        case 'version': cmdVaultVersion(); break;
        case 'upgrade': cmdVaultUpgrade(); break;
        default: fail(`Subcomando desconocido: vault ${subcommand ?? ''}. Usa: version | upgrade`);
      }
      break;

    case 'hooks':
      switch (subcommand) {
        case 'install':   cmdHooksInstall(); break;
        case 'uninstall': cmdHooksUninstall(); break;
        default: fail(`Subcomando desconocido: hooks ${subcommand ?? ''}. Usa: install | uninstall`);
      }
      break;

    case 'setup':
      await cmdSetup();
      break;

    case 'link':
      cmdLink();
      break;

    case 'unlink':
      cmdUnlink();
      break;

    case 'status':
      cmdStatus();
      break;

    case 'remove':
      cmdRemove(subcommand);
      break;

    case 'doctor':
      cmdDoctor();
      break;

    case 'auto-start':
      cmdAutoStart(subcommand);
      break;

    case 'log':
      cmdOpenLog(subcommand);
      break;

    case 'cli':
      switch (subcommand) {
        case 'list': cmdCliList(); break;
        default: fail(`Subcomando desconocido: cli ${subcommand ?? ''}. Usa: list`);
      }
      break;

    case undefined:
      console.log('Uso: mempunk <comando> [opciones]');
      console.log('');
      console.log('Setup:');
      console.log('  setup                             Inicializa, vincula y configura hooks (todo en uno)');
      console.log('  init                              Inicializa el vault en ~/Dev-Brain');
      console.log('  link       [--cli claude|gemini|opencode]  Vincula el vault (default: todos los instalados)');
      console.log('  unlink     [--cli claude|gemini|opencode]  Desvincula el vault');
      console.log('  status                            Dashboard: vault, proyectos y sesiones');
      console.log('  doctor                            Verifica integridad del vault');
      console.log('  auto-start on|off                 Activa/desactiva auto-start al iniciar sesión');
      console.log('  cli      list                     Muestra CLIs vinculados al vault');
      console.log('  -v                                Muestra la versión del CLI');
      console.log('');
      console.log('Proyectos:');
      console.log('  project  add <id> <name>          Crea un proyecto');
      console.log('  project  list                     Lista proyectos activos');
      console.log('  remove   <id> --yes               Elimina un proyecto (irreversible)');
      console.log('  log      <id>                     Abre el INDEX.md del proyecto en el editor');
      console.log('');
      console.log('Backlog:');
      console.log('  backlog  add <proj> "<title>"     Agrega tarea al backlog');
      console.log('  backlog  list <proj>              Lista tareas del backlog');
      console.log('  backlog  update <id>              Actualiza una tarea');
      console.log('');
      console.log('Conocimiento:');
      console.log('  decision add <proj> "<title>"     Crea una decisión (ADR)');
      console.log('  decision list <proj>              Lista decisiones del proyecto');
      console.log('  skill    add <proj> <name>        Crea un skill de proyecto');
      console.log('  skill    list <proj>              Lista skills del proyecto');
      console.log('  skill    update <id>              Actualiza contenido de un skill');
      console.log('  resource add <proj> "<title>"     Captura un resource externo');
      console.log('  resource list <proj>              Lista resources del proyecto');
      console.log('');
      console.log('Sesiones y logs:');
      console.log('  session  log <proj> "<summary>"   Registra sesión de trabajo');
      console.log('  session  last <proj>              Muestra la última sesión');
      console.log('  daily    log <proj> "<content>"   Agrega una entrada al log diario');
      console.log('  daily    list <proj>              Lista los logs diarios del proyecto');
      console.log('  search   "<query>"                Búsqueda full-text en el vault');
      console.log('');
      console.log('Mantenimiento:');
      console.log('  sync                              Verifica consistencia vault ↔ BD');
      console.log('  vault    version                  Muestra la versión del vault y del CLI');
      console.log('  vault    upgrade                  Actualiza el vault a la versión más reciente');
      console.log('  hooks    install                  Instala hooks globalmente en ~/.claude/hooks/');
      console.log('  hooks    install --local          Instala hooks en .claude/hooks/ del proyecto actual');
      console.log('  hooks    install --check          Verifica si los hooks están activos');
      console.log('  hooks    uninstall                Elimina hooks de Mempunk (global por defecto)');
      break;

    default:
      fail(`Comando desconocido: "${command}". Ejecuta "mempunk" sin argumentos para ver ayuda.`);
  }
} catch (err) {
  // Capturar errores inesperados de VaultStore o del sistema de archivos
  fail(err.message);
}
})();
