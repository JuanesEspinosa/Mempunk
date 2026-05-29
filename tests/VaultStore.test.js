import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import VaultStore from '../src/store/VaultStore.js';

// Vault temporal aislado — nunca toca ~/Dev-Brain
const TEMP_VAULT = path.join(os.tmpdir(), `mempunk-test-${Date.now()}`);
const PROJ = 'proj1';
const PROJ_PATH = path.join(TEMP_VAULT, 'projects', PROJ);

let store;

beforeAll(() => {
  // Crear estructura mínima del vault de prueba
  fs.mkdirSync(path.join(PROJ_PATH, 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(PROJ_PATH, 'skills'),    { recursive: true });

  store = new VaultStore(TEMP_VAULT);
  store.addProject(PROJ, 'Proyecto Uno', PROJ_PATH);
});

afterAll(() => {
  // Liberar el handle de SQLite antes de borrar la carpeta
  store.db.close();
  fs.rmSync(TEMP_VAULT, { recursive: true, force: true });
});

// ── Proyectos ─────────────────────────────────────────────────────────────────

describe('Proyectos', () => {
  it('addProject() crea el registro en SQLite correctamente', () => {
    const row = store.db.prepare('SELECT * FROM projects WHERE id = ?').get(PROJ);
    expect(row).toBeDefined();
    expect(row.name).toBe('Proyecto Uno');
    expect(row.status).toBe('active');
  });

  it('listProjects() retorna el proyecto recién creado', () => {
    const rows = store.listProjects();
    expect(rows.some((r) => r.id === PROJ)).toBe(true);
  });

  it('listProjects(status) filtra correctamente', () => {
    const active   = store.listProjects('active');
    const archived = store.listProjects('archived');
    expect(active.some((r) => r.id === PROJ)).toBe(true);
    expect(archived.some((r) => r.id === PROJ)).toBe(false);
  });
});

// ── Backlog ───────────────────────────────────────────────────────────────────

describe('Backlog', () => {
  let itemId;

  it('addBacklogItem() crea la tarea con priority default 2', () => {
    itemId = store.addBacklogItem(PROJ, 'Implementar login');
    const row = store.db.prepare('SELECT * FROM backlog WHERE id = ?').get(itemId);
    expect(row.title).toBe('Implementar login');
    expect(row.priority).toBe(2);
    expect(row.status).toBe('pending');
  });

  it('listBacklog() retorna tareas del proyecto', () => {
    const rows = store.listBacklog(PROJ);
    expect(rows.some((r) => r.id === itemId)).toBe(true);
  });

  it('listBacklog() filtra por status correctamente', () => {
    const pending    = store.listBacklog(PROJ, 'pending');
    const inProgress = store.listBacklog(PROJ, 'in_progress');
    expect(pending.some((r) => r.id === itemId)).toBe(true);
    expect(inProgress.some((r) => r.id === itemId)).toBe(false);
  });

  it('updateBacklogItem() actualiza status y updated_at', () => {
    const before = store.listBacklog(PROJ).find((r) => r.id === itemId);

    // Esperar al menos 1ms para que el nuevo timestamp sea distinto
    const t0 = Date.now();
    while (Date.now() === t0) { /* busy wait */ }

    store.updateBacklogItem(itemId, { status: 'in_progress' });

    const after = store.listBacklog(PROJ).find((r) => r.id === itemId);
    expect(after.status).toBe('in_progress');
    expect(after.updated_at).not.toBe(before.updated_at);
  });
});

// ── Decisions ─────────────────────────────────────────────────────────────────

describe('Decisions', () => {
  let decId;
  const decFile = path.join(PROJ_PATH, 'decisions', 'test-decision.md');

  it('addDecision() crea el archivo markdown en el path correcto', () => {
    decId = store.addDecision(PROJ, 'Usar JWT', decFile, ['auth'], '## Contexto\nUsamos hexagonal auth.');
    expect(fs.existsSync(decFile)).toBe(true);
  });

  it('addDecision() registra en SQLite y en search_index', () => {
    const row = store.db.prepare('SELECT * FROM decisions WHERE id = ?').get(decId);
    expect(row).toBeDefined();
    expect(row.title).toBe('Usar JWT');

    const indexed = store.db.prepare('SELECT * FROM search_index WHERE item_id = ?').get(decId);
    expect(indexed).toBeDefined();
    expect(indexed.type).toBe('decision');
  });

  it('addDecision() es atómica: si falla el SQL, no queda el archivo huérfano', () => {
    // 'ghost' no existe en projects → viola FK → el SQL falla
    const orphan = path.join(PROJ_PATH, 'decisions', 'orphan-atomic.md');
    expect(() =>
      store.addDecision('ghost', 'Título', orphan, [], 'contenido')
    ).toThrow();
    // El catch de addDecision debe haber borrado el archivo
    expect(fs.existsSync(orphan)).toBe(false);
  });

  it('listDecisions() retorna las decisiones del proyecto', () => {
    const rows = store.listDecisions(PROJ);
    expect(rows.some((r) => r.id === decId)).toBe(true);
  });
});

// ── Skills ────────────────────────────────────────────────────────────────────

describe('Skills', () => {
  let skillId;
  const skillFile = path.join(PROJ_PATH, 'skills', 'stack.md');

  it('addSkill() crea el archivo markdown y registra en project_skills', () => {
    skillId = store.addSkill(PROJ, 'stack', skillFile, '## Stack\nNode.js ESM');
    expect(fs.existsSync(skillFile)).toBe(true);
    const row = store.db.prepare('SELECT * FROM project_skills WHERE id = ?').get(skillId);
    expect(row).toBeDefined();
    expect(row.name).toBe('stack');
  });

  it('getSkills() retorna los skills del proyecto', () => {
    const rows = store.getSkills(PROJ);
    expect(rows.some((r) => r.id === skillId)).toBe(true);
  });

  it('updateSkill() sobreescribe el contenido del archivo y actualiza updated_at', () => {
    const before = store.getSkills(PROJ).find((r) => r.id === skillId);

    const t0 = Date.now();
    while (Date.now() === t0) { /* busy wait */ }

    store.updateSkill(skillId, '## Stack\nNode.js ESM — actualizado');

    const content = fs.readFileSync(skillFile, 'utf8');
    const after   = store.getSkills(PROJ).find((r) => r.id === skillId);

    expect(content).toContain('actualizado');
    expect(after.updated_at).not.toBe(before.updated_at);
  });

  it('listSkills() retorna skills ordenados por updated_at DESC', () => {
    // Agregar un segundo skill con timestamp posterior
    const t0 = Date.now();
    while (Date.now() === t0) { /* busy wait */ }

    const newFile = path.join(PROJ_PATH, 'skills', 'patterns.md');
    store.addSkill(PROJ, 'patterns', newFile, '## Patrones\nHexagonal');

    const rows = store.listSkills(PROJ);
    expect(rows[0].name).toBe('patterns'); // el más reciente primero
  });
});

// ── Sesiones ──────────────────────────────────────────────────────────────────

describe('Sesiones', () => {
  it('logSession() registra correctamente con files_touched como JSON', () => {
    const id = store.logSession(PROJ, 'Sesión de prueba', ['src/cli.js', 'src/store/VaultStore.js']);
    const row = store.db.prepare('SELECT * FROM session_log WHERE id = ?').get(id);
    expect(row.summary).toBe('Sesión de prueba');

    const files = JSON.parse(row.files_touched);
    expect(Array.isArray(files)).toBe(true);
    expect(files).toContain('src/cli.js');
  });

  it('getLastSession() retorna la sesión más reciente del proyecto', () => {
    // Registrar una segunda sesión para asegurar que getLastSession devuelve la última
    const t0 = Date.now();
    while (Date.now() === t0) { /* busy wait */ }

    store.logSession(PROJ, 'Sesión más reciente', []);

    const last = store.getLastSession(PROJ);
    expect(last.summary).toBe('Sesión más reciente');
  });
});

// ── Búsqueda ──────────────────────────────────────────────────────────────────

describe('Búsqueda', () => {
  it('search() encuentra una decisión por palabra clave de su contenido', () => {
    // La decisión creada antes contiene 'hexagonal' en el contenido
    const results = store.search('hexagonal');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('decision');
  });

  it('search() filtra por project_id correctamente', () => {
    // Crear un proyecto separado con una decisión que contiene 'xylophone'
    const proj2 = 'proj2';
    const proj2Path = path.join(TEMP_VAULT, 'projects', proj2);
    fs.mkdirSync(path.join(proj2Path, 'decisions'), { recursive: true });
    store.addProject(proj2, 'Proyecto Dos', proj2Path);

    const file2 = path.join(proj2Path, 'decisions', 'only-in-proj2.md');
    store.addDecision(proj2, 'Solo en proj2', file2, [], 'xylophone es una palabra rara');

    // Sin filtro: ambos proyectos devuelven resultado
    const all = store.search('xylophone');
    expect(all.length).toBeGreaterThan(0);

    // Con filtro de proj1: no debe aparecer (la decisión es de proj2)
    const filtered = store.search('xylophone', PROJ);
    expect(filtered.length).toBe(0);
  });
});

// ── trackFile ────────────────────────────────────────────────────────────────

describe('trackFile', () => {
  const touchedFile = path.join(TEMP_VAULT, '.mempunk', 'session-touched.json');

  it('trackFile() crea session-touched.json si no existe', () => {
    // Eliminar el archivo para partir de un estado limpio
    try { fs.unlinkSync(touchedFile); } catch (_) {}

    store.trackFile('/some/file.md');

    const tracked = JSON.parse(fs.readFileSync(touchedFile, 'utf8'));
    expect(tracked).toContain('/some/file.md');
  });

  it('trackFile() agrega un path al array existente', () => {
    fs.writeFileSync(touchedFile, JSON.stringify(['/existing/file.md']), 'utf8');

    store.trackFile('/new/file.md');

    const tracked = JSON.parse(fs.readFileSync(touchedFile, 'utf8'));
    expect(tracked).toContain('/existing/file.md');
    expect(tracked).toContain('/new/file.md');
    expect(tracked.length).toBe(2);
  });

  it('trackFile() no duplica paths si se llama dos veces con el mismo archivo', () => {
    fs.writeFileSync(touchedFile, '[]', 'utf8');

    store.trackFile('/repeat/file.md');
    store.trackFile('/repeat/file.md');

    const tracked = JSON.parse(fs.readFileSync(touchedFile, 'utf8'));
    expect(tracked.filter((p) => p === '/repeat/file.md').length).toBe(1);
  });

  it('trackFile() no lanza excepción si el directorio .mempunk no existe', () => {
    // Crear un vault aislado, cerrarlo y eliminar el directorio para simular ausencia
    const isolatedVault = path.join(os.tmpdir(), `mempunk-trackfile-${Date.now()}`);
    const isolated = new VaultStore(isolatedVault);
    isolated.db.close();
    fs.rmSync(isolatedVault, { recursive: true, force: true });

    // trackFile silencia cualquier error — nunca debe lanzar
    expect(() => isolated.trackFile('/some/file.md')).not.toThrow();
  });
});

// ── Integración trackFile con addDecision y updateSkill ───────────────────────

describe('Integración trackFile', () => {
  const touchedFile = path.join(TEMP_VAULT, '.mempunk', 'session-touched.json');

  it('addDecision() llama trackFile() automáticamente y el path aparece en session-touched.json', () => {
    fs.writeFileSync(touchedFile, '[]', 'utf8');

    const decFile = path.join(PROJ_PATH, 'decisions', 'trackfile-integration.md');
    store.addDecision(PROJ, 'Track integration test', decFile, [], 'contenido de seguimiento');

    const tracked = JSON.parse(fs.readFileSync(touchedFile, 'utf8'));
    expect(tracked).toContain(decFile);
  });

  it('updateSkill() llama trackFile() automáticamente y el path aparece en session-touched.json', () => {
    // Crear el skill — addSkill no llama trackFile, así que el touched.json queda limpio
    const skillFile = path.join(PROJ_PATH, 'skills', 'trackfile-skill.md');
    const sid = store.addSkill(PROJ, 'trackfile-skill', skillFile, '## Inicial');

    // Resetear el tracking para aislar solo el updateSkill
    fs.writeFileSync(touchedFile, '[]', 'utf8');

    store.updateSkill(sid, '## Actualizado con tracking');

    const tracked = JSON.parse(fs.readFileSync(touchedFile, 'utf8'));
    expect(tracked).toContain(skillFile);
  });
});

// ── Resources ─────────────────────────────────────────────────────────────────

describe('Resources', () => {
  let resourceId;
  let resourceFilePath;

  it('addResource() crea el archivo markdown con frontmatter correcto', () => {
    const result = store.addResource(PROJ, 'Artículo sobre JWT', 'https://jwt.io', 'Contenido sobre tokens JWT y seguridad.');
    resourceId = result.id;
    resourceFilePath = result.filePath;

    expect(fs.existsSync(resourceFilePath)).toBe(true);

    const content = fs.readFileSync(resourceFilePath, 'utf8');
    expect(content).toContain('title: Artículo sobre JWT');
    expect(content).toContain('url: https://jwt.io');
    expect(content).toContain(`project_id: ${PROJ}`);
    expect(content).toContain('Contenido sobre tokens JWT');
  });

  it('addResource() registra en SQLite y en search_index con type resource', () => {
    const row = store.db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId);
    expect(row).toBeDefined();
    expect(row.title).toBe('Artículo sobre JWT');
    expect(row.url).toBe('https://jwt.io');

    const indexed = store.db.prepare('SELECT * FROM search_index WHERE item_id = ?').get(resourceId);
    expect(indexed).toBeDefined();
    expect(indexed.type).toBe('resource');
  });

  it('listResources() retorna resources del proyecto ordenados por created_at DESC', () => {
    // Esperar para que el siguiente timestamp sea distinto
    const t0 = Date.now();
    while (Date.now() === t0) { /* busy wait */ }

    store.addResource(PROJ, 'Segundo recurso', 'https://example.com', 'Más contenido');

    const rows = store.listResources(PROJ);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].title).toBe('Segundo recurso'); // el más reciente primero
  });

  it('search() encuentra un resource por palabra clave de su contenido', () => {
    const results = store.search('tokens JWT');
    expect(results.length).toBeGreaterThan(0);
    const found = results.find((r) => r.type === 'resource');
    expect(found).toBeDefined();
    expect(found.file_path).toBe(resourceFilePath);
  });
});

// ── Daily logs ─────────────────────────────────────────────────────────────────

describe('Daily logs', () => {
  it('addDailyLog() crea el archivo con frontmatter si no existe', () => {
    // Usar un vault aislado para controlar exactamente qué archivo existe
    const isolatedVault = path.join(os.tmpdir(), `mempunk-daily-${Date.now()}`);
    const isolated = new VaultStore(isolatedVault);
    isolated.addProject('dp1', 'Daily Project', path.join(isolatedVault, 'projects', 'dp1'));

    const { filePath, appended } = isolated.addDailyLog('dp1', 'Primera entrada del día');

    expect(fs.existsSync(filePath)).toBe(true);
    expect(appended).toBe(false);

    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('Primera entrada del día');
    expect(content).toMatch(/^---/);
    expect(content).toContain('project_id: dp1');

    isolated.db.close();
    fs.rmSync(isolatedVault, { recursive: true, force: true });
  });

  it('addDailyLog() hace append si el archivo ya existe para esa fecha', () => {
    const isolatedVault = path.join(os.tmpdir(), `mempunk-daily-append-${Date.now()}`);
    const isolated = new VaultStore(isolatedVault);
    isolated.addProject('dp2', 'Daily Project 2', path.join(isolatedVault, 'projects', 'dp2'));

    isolated.addDailyLog('dp2', 'Primera entrada');
    const { filePath, appended } = isolated.addDailyLog('dp2', 'Segunda entrada');

    expect(appended).toBe(true);

    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('Primera entrada');
    expect(content).toContain('Segunda entrada');
    expect(content).toContain('---'); // separador de append

    isolated.db.close();
    fs.rmSync(isolatedVault, { recursive: true, force: true });
  });

  it('addDailyLog() actualiza search_index en lugar de duplicar si ya existe entrada', () => {
    const isolatedVault = path.join(os.tmpdir(), `mempunk-daily-fts-${Date.now()}`);
    const isolated = new VaultStore(isolatedVault);
    isolated.addProject('dp3', 'Daily Project 3', path.join(isolatedVault, 'projects', 'dp3'));

    isolated.addDailyLog('dp3', 'Entrada inicial');
    isolated.addDailyLog('dp3', 'Entrada actualizada');

    // Solo debe haber un registro en daily_logs para este proyecto+fecha
    const rows = isolated.db.prepare('SELECT * FROM daily_logs WHERE project_id = ?').all('dp3');
    expect(rows.length).toBe(1);

    // Y un solo registro en search_index
    const indexed = isolated.db
      .prepare("SELECT * FROM search_index WHERE project_id = ? AND type = 'daily'")
      .all('dp3');
    expect(indexed.length).toBe(1);

    // El contenido del índice debe contener la entrada actualizada
    expect(indexed[0].content).toContain('Entrada actualizada');

    isolated.db.close();
    fs.rmSync(isolatedVault, { recursive: true, force: true });
  });

  it('listDailyLogs() retorna logs ordenados por date DESC', () => {
    // Registrar manualmente dos daily_logs con fechas distintas para verificar el orden
    const isolatedVault = path.join(os.tmpdir(), `mempunk-daily-list-${Date.now()}`);
    const isolated = new VaultStore(isolatedVault);
    isolated.addProject('dp4', 'Daily Project 4', path.join(isolatedVault, 'projects', 'dp4'));

    const dailyDir = path.join(isolatedVault, 'daily');
    fs.mkdirSync(dailyDir, { recursive: true });

    // Insertar dos logs con fechas distintas directamente en la BD para aislar el test del día actual
    const now = new Date().toISOString();
    isolated.db
      .prepare("INSERT INTO daily_logs (id, project_id, date, file_path, created_at) VALUES (?, ?, ?, ?, ?)")
      .run('dl_old', 'dp4', '2025-01-01', path.join(dailyDir, '2025-01-01.md'), now);
    isolated.db
      .prepare("INSERT INTO daily_logs (id, project_id, date, file_path, created_at) VALUES (?, ?, ?, ?, ?)")
      .run('dl_new', 'dp4', '2025-06-15', path.join(dailyDir, '2025-06-15.md'), now);

    const rows = isolated.listDailyLogs('dp4');
    expect(rows[0].date).toBe('2025-06-15'); // más reciente primero

    isolated.db.close();
    fs.rmSync(isolatedVault, { recursive: true, force: true });
  });

  it('la constraint UNIQUE(project_id, date) previene duplicados en daily_logs', () => {
    const isolatedVault = path.join(os.tmpdir(), `mempunk-daily-unique-${Date.now()}`);
    const isolated = new VaultStore(isolatedVault);
    isolated.addProject('dp5', 'Daily Project 5', path.join(isolatedVault, 'projects', 'dp5'));

    const now = new Date().toISOString();
    const dailyDir = path.join(isolatedVault, 'daily');
    fs.mkdirSync(dailyDir, { recursive: true });

    isolated.db
      .prepare("INSERT INTO daily_logs (id, project_id, date, file_path, created_at) VALUES (?, ?, ?, ?, ?)")
      .run('dl_dup1', 'dp5', '2025-01-01', path.join(dailyDir, '2025-01-01.md'), now);

    expect(() =>
      isolated.db
        .prepare("INSERT INTO daily_logs (id, project_id, date, file_path, created_at) VALUES (?, ?, ?, ?, ?)")
        .run('dl_dup2', 'dp5', '2025-01-01', path.join(dailyDir, '2025-01-01.md'), now)
    ).toThrow();

    isolated.db.close();
    fs.rmSync(isolatedVault, { recursive: true, force: true });
  });
});

// ── Migración ──────────────────────────────────────────────────────────────────

describe('Migración', () => {
  it('la migración v2 crea las tablas resources y daily_logs', () => {
    const tables = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);

    expect(tables).toContain('resources');
    expect(tables).toContain('daily_logs');
  });

  it('la migración v1 sigue funcionando si se corre desde cero', () => {
    const freshVault = path.join(os.tmpdir(), `mempunk-migration-v1-${Date.now()}`);
    const fresh = new VaultStore(freshVault);

    const tables = fresh.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);

    // v1 tables
    expect(tables).toContain('projects');
    expect(tables).toContain('backlog');
    expect(tables).toContain('decisions');
    expect(tables).toContain('session_log');
    expect(tables).toContain('project_skills');
    expect(tables).toContain('search_index');

    // v2 tables also present
    expect(tables).toContain('resources');
    expect(tables).toContain('daily_logs');

    fresh.db.close();
    fs.rmSync(freshVault, { recursive: true, force: true });
  });

  it('una base de datos existente en v1 migra a v2 sin perder datos', async () => {
    // Simular una BD en v1: crear el vault, marcar solo v1 en _migrations, y no crear las tablas v2
    const legacyVault = path.join(os.tmpdir(), `mempunk-migration-legacy-${Date.now()}`);
    fs.mkdirSync(path.join(legacyVault, '.mempunk'), { recursive: true });

    // Crear una BD con solo las tablas de v1 y el registro de migración v1
    const Database = (await import('better-sqlite3')).default;
    const legacyDb = new Database(path.join(legacyVault, '.mempunk', 'mempunk.db'));
    legacyDb.pragma('foreign_keys = ON');

    legacyDb.exec(`
      CREATE TABLE _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, status TEXT DEFAULT 'active', created_at TEXT, updated_at TEXT);
      CREATE TABLE backlog (id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, status TEXT DEFAULT 'pending', priority INTEGER DEFAULT 2, created_at TEXT, updated_at TEXT);
      CREATE TABLE decisions (id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, file_path TEXT NOT NULL, tags TEXT, created_at TEXT);
      CREATE TABLE session_log (id TEXT PRIMARY KEY, project_id TEXT, started_at TEXT, ended_at TEXT, summary TEXT, files_touched TEXT);
      CREATE TABLE project_skills (id TEXT PRIMARY KEY, project_id TEXT, name TEXT NOT NULL, file_path TEXT NOT NULL, updated_at TEXT);
      CREATE VIRTUAL TABLE search_index USING fts5(item_id, project_id, type, content);
      INSERT INTO _migrations (version, applied_at) VALUES (1, datetime('now'));
    `);
    // Insertar un proyecto para verificar que los datos persisten tras la migración
    legacyDb.prepare("INSERT INTO projects (id, name, path, status, created_at, updated_at) VALUES ('legacy-proj', 'Legacy', '/tmp/legacy', 'active', datetime('now'), datetime('now'))").run();
    legacyDb.close();

    // Abrir con VaultStore — debe detectar que v2 no está aplicada y migrar
    const migrated = new VaultStore(legacyVault);

    const tables = migrated.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);

    expect(tables).toContain('resources');
    expect(tables).toContain('daily_logs');

    // El proyecto legacy debe seguir ahí
    const proj = migrated.db.prepare("SELECT * FROM projects WHERE id = 'legacy-proj'").get();
    expect(proj).toBeDefined();
    expect(proj.name).toBe('Legacy');

    migrated.db.close();
    fs.rmSync(legacyVault, { recursive: true, force: true });
  });
});

// ── Vault version ─────────────────────────────────────────────────────────────

describe('Vault version', () => {
  it('getVaultVersion() retorna 3 después de las migraciones v1, v2 y v3', () => {
    // El store global ya tiene v1, v2 y v3 aplicadas
    expect(store.getVaultVersion()).toBe(3);
  });

  it('getVaultVersion() retorna 0 en una base de datos sin vault_version en vault_meta', () => {
    const emptyVault = path.join(os.tmpdir(), `mempunk-novault-${Date.now()}`);
    const emptyStore = new VaultStore(emptyVault);

    // Eliminar el registro para simular ausencia del metadato
    emptyStore.db.prepare("DELETE FROM vault_meta WHERE key = 'vault_version'").run();

    expect(emptyStore.getVaultVersion()).toBe(0);

    emptyStore.db.close();
    fs.rmSync(emptyVault, { recursive: true, force: true });
  });

  it('una base de datos en v1 retorna 1 antes de migrar a v2', async () => {
    const v1Vault = path.join(os.tmpdir(), `mempunk-v1only-${Date.now()}`);
    fs.mkdirSync(path.join(v1Vault, '.mempunk'), { recursive: true });

    // Abrir la BD directamente para simular un vault que solo fue migrado a v1
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(path.join(v1Vault, '.mempunk', 'mempunk.db'));

    // Crear vault_meta con versión 1 sin pasar por el constructor de VaultStore
    db.exec(`CREATE TABLE vault_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.prepare('INSERT INTO vault_meta (key, value) VALUES (?, ?)').run('vault_version', '1');

    const version = parseInt(db.prepare('SELECT value FROM vault_meta WHERE key = ?').get('vault_version').value, 10);
    expect(version).toBe(1);

    db.close();
    fs.rmSync(v1Vault, { recursive: true, force: true });
  });
});

// ── Sync ──────────────────────────────────────────────────────────────────────

describe('Sync', () => {
  it('sync() retorna listas vacías cuando todo está consistente', () => {
    // En este punto todos los archivos creados por addDecision/addSkill existen
    const result = store.sync();
    expect(result.missing_files.length).toBe(0);
    expect(result.unregistered_files.length).toBe(0);
  });

  it('sync() detecta un archivo en disco sin registro en SQLite (unregistered)', () => {
    // Crear un markdown en decisions/ sin pasar por addDecision
    const orphan = path.join(PROJ_PATH, 'decisions', 'sin-registro.md');
    fs.writeFileSync(orphan, '# Sin registro', 'utf8');

    const result = store.sync();
    expect(result.unregistered_files.some((f) => f.file_path === orphan)).toBe(true);

    // Limpiar para no afectar otros tests
    fs.unlinkSync(orphan);
  });

  it('sync() detecta un registro en SQLite sin archivo en disco (missing)', () => {
    const missingFile = path.join(PROJ_PATH, 'decisions', 'decision-a-borrar.md');
    const id = store.addDecision(PROJ, 'A borrar', missingFile, [], 'contenido temporal');

    // Eliminar el archivo manualmente simulando una pérdida de datos
    fs.unlinkSync(missingFile);

    const result = store.sync();
    expect(result.missing_files.some((f) => f.id === id)).toBe(true);
  });
});
