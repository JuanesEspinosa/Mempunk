#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
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
    global:   { type: 'boolean' },  // hooks install/uninstall
    check:    { type: 'boolean' },  // hooks install --check
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

  // INDEX.md con frontmatter básico para que el vault lo pueda identificar
  const now = new Date().toISOString();
  const indexContent = [
    '---',
    `name: ${name}`,
    `created_at: ${now}`,
    'status: active',
    '---',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(projectPath, 'INDEX.md'), indexContent, 'utf8');

  // Registrar en SQLite
  const store = openStore();
  store.addProject(id, name, projectPath);

  console.log(`Proyecto ${name} creado en ${projectPath}`);
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

  if (missing_files.length === 0 && unregistered_files.length === 0) {
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
const HOOK_FILES = ['on-start.js', 'on-compact.js', 'on-stop.js'];

// Identificador único en el contenido de cada hook para distinguirlos de otros hooks
const HOOK_MARKER = '# mempunk-hook';

/** Devuelve el directorio destino según --global */
function hooksTargetDir() {
  return opts.global
    ? path.join(os.homedir(), '.claude', 'hooks')
    : path.join(process.cwd(), '.claude', 'hooks');
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
    const installed = HOOK_FILES.filter((f) => fs.existsSync(path.join(targetDir, f)));
    if (installed.length === HOOK_FILES.length) {
      console.log(`Hooks instalados en ${targetDir}`);
    } else if (installed.length === 0) {
      console.log(`Hooks no instalados en ${targetDir}`);
    } else {
      console.log(`Hooks parcialmente instalados en ${targetDir}:`);
      HOOK_FILES.forEach((f) => {
        const status = installed.includes(f) ? '✓' : '✗';
        console.log(`  ${status} ${f}`);
      });
    }
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  for (const file of HOOK_FILES) {
    const dest = path.join(targetDir, file);
    fs.copyFileSync(path.join(sourceDir, file), dest);
    // Hacer ejecutable el script en sistemas Unix — en Windows no tiene efecto pero no falla
    try { fs.chmodSync(dest, 0o755); } catch (_) {}
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
}

// ── Router principal ──────────────────────────────────────────────────────────

try {
  switch (command) {
    case 'init':
      cmdInit();
      break;

    case 'project':
      switch (subcommand) {
        case 'add':  cmdProjectAdd(args[0], args[1]); break;
        case 'list': cmdProjectList(); break;
        default: fail(`Subcomando desconocido: project ${subcommand ?? ''}. Usa: add | list`);
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
        case 'log':  cmdSessionLog(args[0], args[1]); break;
        case 'last': cmdSessionLast(args[0]); break;
        default: fail(`Subcomando desconocido: session ${subcommand ?? ''}. Usa: log | last`);
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

    case undefined:
      console.log('Uso: mempunk <comando> [opciones]');
      console.log('');
      console.log('Comandos:');
      console.log('  init                              Inicializa el vault en ~/Dev-Brain');
      console.log('  project  add <id> <name>          Crea un proyecto');
      console.log('  project  list                     Lista proyectos activos');
      console.log('  backlog  add <proj> "<title>"     Agrega tarea al backlog');
      console.log('  backlog  list <proj>              Lista tareas del backlog');
      console.log('  backlog  update <id>              Actualiza una tarea');
      console.log('  decision add <proj> "<title>"     Crea una decisión (ADR)');
      console.log('  decision list <proj>              Lista decisiones del proyecto');
      console.log('  skill    add <proj> <name>        Crea un skill de proyecto');
      console.log('  skill    list <proj>              Lista skills del proyecto');
      console.log('  skill    update <id>              Actualiza contenido de un skill');
      console.log('  resource add <proj> "<title>"     Captura un resource externo con url y contenido');
      console.log('  resource list <proj>              Lista resources del proyecto');
      console.log('  daily    log <proj> "<content>"   Agrega una entrada al log diario');
      console.log('  daily    list <proj>              Lista los logs diarios del proyecto');
      console.log('  session  log <proj> "<summary>"   Registra sesión de trabajo');
      console.log('  session  last <proj>              Muestra la última sesión');
      console.log('  search   "<query>"                Búsqueda full-text en el vault');
      console.log('  sync                              Verifica consistencia vault ↔ BD');
      console.log('  vault    version                  Muestra la versión del vault y del CLI');
      console.log('  vault    upgrade                  Actualiza el vault a la versión más reciente');
      console.log('  hooks    install                  Instala hooks en .claude/hooks/');
      console.log('  hooks    install --global         Instala hooks globalmente');
      console.log('  hooks    install --check          Verifica si los hooks están activos');
      console.log('  hooks    uninstall                Elimina hooks de Mempunk');
      break;

    default:
      fail(`Comando desconocido: "${command}". Ejecuta "mempunk" sin argumentos para ver ayuda.`);
  }
} catch (err) {
  // Capturar errores inesperados de VaultStore o del sistema de archivos
  fail(err.message);
}
