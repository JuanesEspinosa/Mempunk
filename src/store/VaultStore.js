import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Migraciones versionadas — cada entrada tiene un número de versión y su función de upgrade
const MIGRATIONS = [
  {
    version: 1,
    up(db) {
      // Proyectos registrados en el vault
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          path       TEXT NOT NULL,
          status     TEXT DEFAULT 'active',
          created_at TEXT,
          updated_at TEXT
        )
      `);

      // Ítems del backlog por proyecto
      db.exec(`
        CREATE TABLE IF NOT EXISTS backlog (
          id         TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id),
          title      TEXT NOT NULL,
          status     TEXT DEFAULT 'pending',
          priority   INTEGER DEFAULT 2,
          created_at TEXT,
          updated_at TEXT
        )
      `);

      // Decisiones arquitectónicas (ADRs) — apuntan al archivo markdown en disco
      db.exec(`
        CREATE TABLE IF NOT EXISTS decisions (
          id         TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id),
          title      TEXT NOT NULL,
          file_path  TEXT NOT NULL,
          tags       TEXT,
          created_at TEXT
        )
      `);

      // Historial de sesiones de trabajo por proyecto
      db.exec(`
        CREATE TABLE IF NOT EXISTS session_log (
          id            TEXT PRIMARY KEY,
          project_id    TEXT REFERENCES projects(id),
          started_at    TEXT,
          ended_at      TEXT,
          summary       TEXT,
          files_touched TEXT
        )
      `);

      // Skills del proyecto — archivos markdown con conocimiento reutilizable (stack, patrones, convenciones…)
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_skills (
          id         TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id),
          name       TEXT NOT NULL,
          file_path  TEXT NOT NULL,
          updated_at TEXT
        )
      `);

      // Índice de búsqueda full-text — cubre decisiones, backlog y recursos
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
          item_id,
          project_id,
          type,
          content
        )
      `);
    },
  },
  {
    version: 2,
    up(db) {
      // Links y referencias externas capturadas desde proyectos
      db.exec(`
        CREATE TABLE IF NOT EXISTS resources (
          id         TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id),
          title      TEXT NOT NULL,
          url        TEXT,
          file_path  TEXT NOT NULL,
          created_at TEXT
        )
      `);

      // Entradas del log diario — una por proyecto por día
      db.exec(`
        CREATE TABLE IF NOT EXISTS daily_logs (
          id         TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id),
          date       TEXT NOT NULL,
          file_path  TEXT NOT NULL,
          created_at TEXT,
          UNIQUE(project_id, date)
        )
      `);
    },
  },
  {
    version: 3,
    up(db) {
      // Checkpoints incrementales — guardados automáticamente cada N turnos via Stop hook
      db.exec(`
        CREATE TABLE IF NOT EXISTS session_checkpoints (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id   TEXT NOT NULL,
          session_id   TEXT NOT NULL,
          turn_count   INTEGER NOT NULL,
          raw_turns    TEXT NOT NULL,
          files_found  TEXT,
          created_at   TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
          UNIQUE(project_id, session_id, turn_count)
        )
      `);

      // Snapshots completos capturados justo antes de una compactación via PreCompact hook
      db.exec(`
        CREATE TABLE IF NOT EXISTS compact_snapshots (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id    TEXT NOT NULL,
          session_id    TEXT NOT NULL,
          compact_type  TEXT,
          message_count INTEGER,
          raw_turns     TEXT NOT NULL,
          files_found   TEXT,
          commands_run  TEXT,
          created_at    TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
        )
      `);
    },
  },
];

// Versión más alta que este código conoce — se actualiza al agregar migraciones
export const VAULT_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

// Genera un ID único con prefijo legible
function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

class VaultStore {
  /**
   * @param {string} vaultPath - Ruta raíz del vault. Por defecto ~/Dev-Brain.
   */
  constructor(vaultPath = path.join(os.homedir(), 'Dev-Brain')) {
    this.vaultPath = vaultPath;
    this.mempunkDir = path.join(vaultPath, '.mempunk');
    this.dbPath = path.join(this.mempunkDir, 'mempunk.db');

    // Crear carpeta .mempunk/ si no existe
    fs.mkdirSync(this.mempunkDir, { recursive: true });

    // Abrir o crear la base de datos
    this.db = new Database(this.dbPath);

    // Mejor rendimiento en escrituras concurrentes y consistencia referencial
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this._runMigrations();
  }

  // ---------------------------------------------------------------------------
  // Migraciones
  // ---------------------------------------------------------------------------

  _runMigrations() {
    // Tabla de control de versiones del schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        version    INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);

    // vault_meta se crea siempre en bootstrap para garantizar su existencia
    // incluso en vaults legacy creados antes de esta feature
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vault_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    const applied = new Set(
      this.db.prepare('SELECT version FROM _migrations').all().map((r) => r.version)
    );

    // Contador accesible desde el CLI para saber si se aplicaron migraciones nuevas
    this._migrationsRan = 0;

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;

      // Cada migración corre en su propia transacción para poder hacer rollback si falla
      this.db.transaction(() => {
        migration.up(this.db);
        this.db.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)').run(
          migration.version,
          new Date().toISOString()
        );
        // Actualizar la versión del vault al final de cada migración exitosa
        this.db.prepare('INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)').run(
          'vault_version',
          String(migration.version)
        );
      })();

      this._migrationsRan++;
    }

    // Reparar vault_meta en vaults legacy: si no tiene vault_version, inferirla
    // desde _migrations para no mostrar falsos warnings de "desactualizado"
    const existingVersion = this.db
      .prepare('SELECT value FROM vault_meta WHERE key = ?')
      .get('vault_version');

    if (!existingVersion) {
      const maxApplied = this.db
        .prepare('SELECT MAX(version) AS v FROM _migrations')
        .get();
      if (maxApplied?.v) {
        this.db
          .prepare('INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)')
          .run('vault_version', String(maxApplied.v));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Metadatos del vault
  // ---------------------------------------------------------------------------

  /**
   * Retorna la versión del vault almacenada en vault_meta.
   * @returns {number} Versión como entero. 0 si vault_meta no tiene el registro.
   */
  getVaultVersion() {
    const row = this.db
      .prepare('SELECT value FROM vault_meta WHERE key = ?')
      .get('vault_version');
    return row ? parseInt(row.value, 10) : 0;
  }

  // ---------------------------------------------------------------------------
  // Proyectos
  // ---------------------------------------------------------------------------

  /**
   * Registra o reemplaza un proyecto en la base de datos.
   */
  addProject(id, name, projectPath) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO projects (id, name, path, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      )
      .run(id, name, projectPath, now, now);
  }

  // ---------------------------------------------------------------------------
  // Decisiones (ADRs)
  // ---------------------------------------------------------------------------

  /**
   * Crea una decisión de forma atómica: escribe el archivo markdown en disco
   * y registra la decisión + entrada en el índice FTS dentro de una sola
   * transacción SQLite. Si cualquier parte falla, se revierte todo.
   *
   * @param {string}   projectId - ID del proyecto dueño
   * @param {string}   title     - Título del ADR
   * @param {string}   filePath  - Ruta absoluta donde se escribirá el markdown
   * @param {string[]} tags      - Etiquetas (se serializa como JSON)
   * @param {string}   content   - Contenido del archivo markdown
   * @returns {string} ID generado para la decisión
   */
  addDecision(projectId, title, filePath, tags, content) {
    const id = makeId('dec');
    const now = new Date().toISOString();
    const tagsJson = JSON.stringify(tags || []);

    // Escribir el archivo primero — si falla aquí, nada llega a la BD
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    this.trackFile(filePath);

    // Transacción SQLite — si falla, revertimos también el archivo ya escrito
    try {
      this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO decisions (id, project_id, title, file_path, tags, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(id, projectId, title, filePath, tagsJson, now);

        this.db
          .prepare(
            `INSERT INTO search_index (item_id, project_id, type, content)
             VALUES (?, ?, 'decision', ?)`
          )
          .run(id, projectId, `${title} ${content}`);
      })();
    } catch (err) {
      // Revertir la escritura del archivo para mantener consistencia
      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        // Ignorar error de borrado — ya estamos en un estado de fallo
      }
      throw err;
    }

    return id;
  }

  // ---------------------------------------------------------------------------
  // Resources
  // ---------------------------------------------------------------------------

  /**
   * Crea un resource de forma atómica: escribe el markdown en
   * ~/Dev-Brain/resources/<id>.md y registra en resources + search_index.
   * Si la transacción SQLite falla, el archivo escrito se revierte.
   *
   * @param {string}      projectId - ID del proyecto dueño
   * @param {string}      title     - Título del resource
   * @param {string|null} url       - URL del recurso externo
   * @param {string}      content   - Cuerpo del markdown
   * @returns {{ id: string, filePath: string }}
   */
  addResource(projectId, title, url, content) {
    const id = `${projectId}-resource-${Date.now()}`;
    const now = new Date().toISOString();
    const resourcesDir = path.join(this.vaultPath, 'resources');
    const filePath = path.join(resourcesDir, `${id}.md`);

    // Frontmatter + cuerpo del archivo
    const fileContent = [
      '---',
      `title: ${title}`,
      `url: ${url ?? ''}`,
      `project_id: ${projectId}`,
      `created_at: ${now}`,
      '---',
      '',
      content ?? '',
    ].join('\n');

    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.writeFileSync(filePath, fileContent, 'utf8');
    this.trackFile(filePath);

    try {
      this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO resources (id, project_id, title, url, file_path, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(id, projectId, title, url ?? null, filePath, now);

        this.db
          .prepare(
            `INSERT INTO search_index (item_id, project_id, type, content)
             VALUES (?, ?, 'resource', ?)`
          )
          .run(id, projectId, `${title} ${url ?? ''} ${content ?? ''}`);
      })();
    } catch (err) {
      // Revertir la escritura del archivo para mantener consistencia
      try { fs.unlinkSync(filePath); } catch (_) {}
      throw err;
    }

    return { id, filePath };
  }

  // ---------------------------------------------------------------------------
  // Daily logs
  // ---------------------------------------------------------------------------

  /**
   * Agrega una entrada al log diario de forma atómica.
   * Si ya existe un archivo para hoy, hace append con separador ---
   * Si no existe, lo crea con frontmatter.
   * El search_index se actualiza con el contenido completo del archivo.
   *
   * @param {string} projectId - ID del proyecto dueño
   * @param {string} content   - Contenido de la entrada
   * @returns {{ filePath: string, appended: boolean }}
   */
  addDailyLog(projectId, content) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dailyDir = path.join(this.vaultPath, 'daily');
    const filePath = path.join(dailyDir, `${today}.md`);

    fs.mkdirSync(dailyDir, { recursive: true });

    const fileExists = fs.existsSync(filePath);
    const now = new Date().toISOString();

    if (fileExists) {
      // Separador estándar entre entradas del mismo día
      fs.appendFileSync(filePath, `\n---\n\n${content}\n`, 'utf8');
    } else {
      const header = [
        '---',
        `date: ${today}`,
        `project_id: ${projectId}`,
        '---',
        '',
        content,
        '',
      ].join('\n');
      fs.writeFileSync(filePath, header, 'utf8');
    }
    this.trackFile(filePath);

    // Leer contenido completo para indexar la versión actualizada
    const fullContent = fs.readFileSync(filePath, 'utf8');

    try {
      this.db.transaction(() => {
        const existing = this.db
          .prepare('SELECT id FROM daily_logs WHERE project_id = ? AND date = ?')
          .get(projectId, today);

        if (existing) {
          // Solo actualizar el índice FTS — el registro de la tabla no cambia
          this.db
            .prepare(
              `UPDATE search_index SET content = ?
               WHERE item_id = ? AND type = 'daily'`
            )
            .run(fullContent, existing.id);
        } else {
          const id = makeId('daily');
          this.db
            .prepare(
              `INSERT INTO daily_logs (id, project_id, date, file_path, created_at)
               VALUES (?, ?, ?, ?, ?)`
            )
            .run(id, projectId, today, filePath, now);

          this.db
            .prepare(
              `INSERT INTO search_index (item_id, project_id, type, content)
               VALUES (?, ?, 'daily', ?)`
            )
            .run(id, projectId, fullContent);
        }
      })();
    } catch (err) {
      // Revertir solo si el archivo fue creado en esta llamada
      if (!fileExists) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
      throw err;
    }

    return { filePath, appended: fileExists };
  }

  // ---------------------------------------------------------------------------
  // Backlog
  // ---------------------------------------------------------------------------

  /**
   * Agrega un ítem al backlog de un proyecto.
   * @returns {string} ID generado
   */
  addBacklogItem(projectId, title, priority = 2) {
    const id = makeId('bl');
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO backlog (id, project_id, title, status, priority, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?)`
      )
      .run(id, projectId, title, priority, now, now);
    return id;
  }

  /**
   * Actualiza campos de un ítem del backlog.
   * @param {string} id     - ID del ítem a actualizar
   * @param {object} fields - Objeto con los campos a modificar (title, status, priority)
   */
  updateBacklogItem(id, fields) {
    const ALLOWED = new Set(['title', 'status', 'priority']);
    const setClauses = [];
    const values = [];

    for (const [key, value] of Object.entries(fields)) {
      if (!ALLOWED.has(key)) continue;
      setClauses.push(`${key} = ?`);
      values.push(value);
    }

    if (setClauses.length === 0) return;

    // Siempre actualizar el timestamp de modificación
    setClauses.push('updated_at = ?');
    values.push(new Date().toISOString(), id);

    this.db.prepare(`UPDATE backlog SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
  }

  // ---------------------------------------------------------------------------
  // Session log
  // ---------------------------------------------------------------------------

  /**
   * Registra una sesión de trabajo finalizada.
   * @param {string}   projectId     - ID del proyecto trabajado
   * @param {string}   summary       - Resumen de lo hecho en la sesión
   * @param {string[]} filesTouched  - Paths absolutos de archivos modificados
   * @returns {string} ID del registro
   */
  logSession(projectId, summary, filesTouched = []) {
    const id = makeId('sess');
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO session_log (id, project_id, started_at, ended_at, summary, files_touched)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, projectId, now, now, summary, JSON.stringify(filesTouched));
    return id;
  }

  /**
   * Retorna el último registro de sesión para un proyecto.
   * @param {string} projectId
   * @returns {object|undefined}
   */
  getLastSession(projectId) {
    return this.db
      .prepare(
        `SELECT * FROM session_log
         WHERE project_id = ?
         ORDER BY ended_at DESC
         LIMIT 1`
      )
      .get(projectId);
  }

  // ---------------------------------------------------------------------------
  // Skills de proyecto
  // ---------------------------------------------------------------------------

  /**
   * Crea un skill de forma atómica: escribe el markdown en
   * projects/<projectId>/skills/<name>.md y hace el INSERT en project_skills.
   * Si la transacción SQLite falla, el archivo escrito se revierte.
   *
   * @param {string} projectId - ID del proyecto dueño
   * @param {string} name      - Nombre del skill (stack, patterns, conventions…)
   * @param {string} filePath  - Ruta absoluta donde se escribirá el markdown
   * @param {string} content   - Contenido del archivo markdown
   * @returns {string} ID generado
   */
  addSkill(projectId, name, filePath, content) {
    const id = makeId('sk');
    const now = new Date().toISOString();

    // Escribir el archivo primero — si falla aquí, nada llega a la BD
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');

    try {
      this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO project_skills (id, project_id, name, file_path, updated_at)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(id, projectId, name, filePath, now);
      })();
    } catch (err) {
      // Revertir la escritura del archivo para mantener consistencia
      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        // Ignorar error de borrado — ya estamos en un estado de fallo
      }
      throw err;
    }

    return id;
  }

  /**
   * Retorna todos los skills de un proyecto.
   * @param {string} projectId
   * @returns {{ id: string, name: string, file_path: string, updated_at: string }[]}
   */
  getSkills(projectId) {
    return this.db
      .prepare('SELECT id, name, file_path, updated_at FROM project_skills WHERE project_id = ?')
      .all(projectId);
  }

  /**
   * Sobreescribe el contenido del archivo markdown de un skill y actualiza updated_at.
   * @param {string} id      - ID del skill a actualizar
   * @param {string} content - Nuevo contenido del archivo markdown
   */
  updateSkill(id, content) {
    const row = this.db
      .prepare('SELECT file_path FROM project_skills WHERE id = ?')
      .get(id);

    if (!row) throw new Error(`Skill no encontrado: ${id}`);

    // Sobreescribir el archivo en disco
    fs.writeFileSync(row.file_path, content, 'utf8');
    this.trackFile(row.file_path);

    // Actualizar timestamp en la BD
    this.db
      .prepare('UPDATE project_skills SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
  }

  // ---------------------------------------------------------------------------
  // Tracking de archivos tocados en la sesión
  // ---------------------------------------------------------------------------

  /**
   * Agrega filePath al registro de archivos tocados en la sesión activa.
   * Los hooks leen este archivo para saber qué incluir en el session log automático.
   * Silencia cualquier error — este método no debe romper ninguna operación principal.
   *
   * @param {string} filePath - Ruta absoluta del archivo a registrar
   */
  trackFile(filePath) {
    const touchedFile = path.join(this.mempunkDir, 'session-touched.json');
    try {
      let tracked = [];
      try {
        tracked = JSON.parse(fs.readFileSync(touchedFile, 'utf8'));
      } catch (_) {
        // Si no existe o está corrupto, empezar con array vacío
      }

      // Agregar solo si no está ya registrado
      if (!tracked.includes(filePath)) {
        tracked.push(filePath);
        fs.writeFileSync(touchedFile, JSON.stringify(tracked), 'utf8');
      }
    } catch (_) {
      // Silenciar cualquier error — el tracking es best-effort
    }
  }

  // ---------------------------------------------------------------------------
  // Listados
  // ---------------------------------------------------------------------------

  /**
   * Devuelve todos los proyectos, opcionalmente filtrados por status.
   * @param {string|null} status - 'active' | 'archived' | null para traer todos
   * @returns {object[]}
   */
  listProjects(status = null) {
    if (status) {
      return this.db
        .prepare('SELECT id, name, path, status, updated_at FROM projects WHERE status = ? ORDER BY name')
        .all(status);
    }
    return this.db
      .prepare('SELECT id, name, path, status, updated_at FROM projects ORDER BY name')
      .all();
  }

  /**
   * Devuelve el backlog de un proyecto, filtrado por status si se indica.
   * @param {string}      projectId
   * @param {string|null} status - 'pending' | 'in_progress' | 'done' | null para todos
   * @returns {object[]}
   */
  listBacklog(projectId, status = null) {
    // Ordenar por prioridad ascendente y luego por más reciente primero
    if (status) {
      return this.db
        .prepare(
          `SELECT id, title, status, priority, updated_at
           FROM backlog
           WHERE project_id = ? AND status = ?
           ORDER BY priority ASC, updated_at DESC`
        )
        .all(projectId, status);
    }
    return this.db
      .prepare(
        `SELECT id, title, status, priority, updated_at
         FROM backlog
         WHERE project_id = ?
         ORDER BY priority ASC, updated_at DESC`
      )
      .all(projectId);
  }

  /**
   * Devuelve las decisiones de un proyecto ordenadas por fecha de creación descendente.
   * @param {string} projectId
   * @returns {object[]}
   */
  listDecisions(projectId) {
    return this.db
      .prepare(
        `SELECT id, title, tags, created_at, file_path
         FROM decisions
         WHERE project_id = ?
         ORDER BY created_at DESC`
      )
      .all(projectId);
  }

  /**
   * Devuelve los skills de un proyecto ordenados por última actualización descendente.
   * @param {string} projectId
   * @returns {object[]}
   */
  listSkills(projectId) {
    return this.db
      .prepare(
        `SELECT id, name, file_path, updated_at
         FROM project_skills
         WHERE project_id = ?
         ORDER BY updated_at DESC`
      )
      .all(projectId);
  }

  /**
   * Devuelve los resources de un proyecto ordenados por created_at descendente.
   * @param {string} projectId
   * @returns {object[]}
   */
  listResources(projectId) {
    return this.db
      .prepare(
        `SELECT id, title, url, file_path, created_at
         FROM resources
         WHERE project_id = ?
         ORDER BY created_at DESC`
      )
      .all(projectId);
  }

  /**
   * Devuelve los logs diarios de un proyecto ordenados por date descendente.
   * @param {string} projectId
   * @returns {object[]}
   */
  listDailyLogs(projectId) {
    return this.db
      .prepare(
        `SELECT id, date, file_path, created_at
         FROM daily_logs
         WHERE project_id = ?
         ORDER BY date DESC`
      )
      .all(projectId);
  }

  // ---------------------------------------------------------------------------
  // Checkpoints de sesión (AutoCheckpoint)
  // ---------------------------------------------------------------------------

  /**
   * Guarda un checkpoint incremental de la sesión actual.
   * Usa INSERT OR REPLACE para evitar duplicados por (project_id, session_id, turn_count).
   *
   * @param {string}   projectId  - ID del proyecto activo
   * @param {string}   sessionId  - session_id de Claude Code
   * @param {number}   turnCount  - Número de turno actual
   * @param {object[]} rawTurns   - Últimos N mensajes del transcript
   * @param {string[]} filesFound - Paths detectados en el transcript
   */
  addCheckpoint(projectId, sessionId, turnCount, rawTurns, filesFound = []) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO session_checkpoints
           (project_id, session_id, turn_count, raw_turns, files_found, created_at)
         VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))`
      )
      .run(
        projectId,
        sessionId,
        turnCount,
        JSON.stringify(rawTurns),
        JSON.stringify(filesFound)
      );
  }

  /**
   * Retorna el checkpoint más reciente de un proyecto.
   * @param {string} projectId
   * @returns {object|undefined}
   */
  getLastCheckpoint(projectId) {
    return this.db
      .prepare(
        `SELECT * FROM session_checkpoints
         WHERE project_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
      )
      .get(projectId);
  }

  /**
   * Lista todos los checkpoints y compact_snapshots de un proyecto, ordenados por fecha.
   * Permite mostrar historial completo de guardados para `session checkpoints`.
   *
   * @param {string} projectId
   * @returns {Array<{ source: 'checkpoint'|'compact', ...rest }>}
   */
  listCheckpoints(projectId) {
    return this.db
      .prepare(
        `SELECT 'checkpoint' AS source, id, session_id, turn_count,
                NULL AS compact_type, NULL AS message_count, files_found, created_at
         FROM session_checkpoints WHERE project_id = ?
         UNION ALL
         SELECT 'compact' AS source, id, session_id, NULL AS turn_count,
                compact_type, message_count, files_found, created_at
         FROM compact_snapshots WHERE project_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 50`
      )
      .all(projectId, projectId);
  }

  // ---------------------------------------------------------------------------
  // Compact snapshots (CompactGuard)
  // ---------------------------------------------------------------------------

  /**
   * Guarda un snapshot completo capturado justo antes de una compactación.
   *
   * @param {string}   projectId    - ID del proyecto activo
   * @param {string}   sessionId    - session_id de Claude Code
   * @param {string}   compactType  - 'automatic' | 'manual'
   * @param {number}   messageCount - Número de mensajes en el transcript
   * @param {object[]} rawTurns     - Últimos 20 mensajes del transcript
   * @param {string[]} filesFound   - Paths detectados en el transcript
   * @param {string[]} commandsRun  - Comandos bash detectados en el transcript
   */
  addCompactSnapshot(projectId, sessionId, compactType, messageCount, rawTurns, filesFound = [], commandsRun = []) {
    this.db
      .prepare(
        `INSERT INTO compact_snapshots
           (project_id, session_id, compact_type, message_count, raw_turns, files_found, commands_run, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))`
      )
      .run(
        projectId,
        sessionId,
        compactType,
        messageCount,
        JSON.stringify(rawTurns),
        JSON.stringify(filesFound),
        JSON.stringify(commandsRun)
      );
  }

  /**
   * Retorna el snapshot más reciente entre session_checkpoints y compact_snapshots.
   * Útil para mostrar el último estado guardado independientemente de su origen.
   *
   * @param {string} projectId
   * @returns {{ source: 'checkpoint'|'compact', ...rest }|undefined}
   */
  getLastCompactSnapshot(projectId) {
    return this.db
      .prepare(
        `SELECT 'checkpoint' AS source, id, project_id, session_id,
                turn_count, NULL AS compact_type, NULL AS message_count,
                raw_turns, files_found, NULL AS commands_run, created_at
         FROM session_checkpoints WHERE project_id = ?
         UNION ALL
         SELECT 'compact' AS source, id, project_id, session_id,
                NULL AS turn_count, compact_type, message_count,
                raw_turns, files_found, commands_run, created_at
         FROM compact_snapshots WHERE project_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
      )
      .get(projectId, projectId);
  }

  // ---------------------------------------------------------------------------
  // Búsqueda FTS5
  // ---------------------------------------------------------------------------

  /**
   * Busca en el índice FTS5. Opcionalmente filtra por proyecto.
   * @param {string}      query     - Término de búsqueda (sintaxis FTS5)
   * @param {string|null} projectId - Filtrar por proyecto (opcional)
   * @returns {{ item_id: string, project_id: string, type: string, file_path: string|null }[]}
   */
  search(query, projectId = null) {
    // COALESCE resuelve el file_path de cualquier tipo registrado en el índice
    const baseQuery = `
      SELECT
        search_index.item_id,
        search_index.project_id,
        search_index.type,
        COALESCE(decisions.file_path, resources.file_path, daily_logs.file_path) AS file_path
      FROM search_index
      LEFT JOIN decisions
        ON search_index.item_id = decisions.id
       AND search_index.type = 'decision'
      LEFT JOIN resources
        ON search_index.item_id = resources.id
       AND search_index.type = 'resource'
      LEFT JOIN daily_logs
        ON search_index.item_id = daily_logs.id
       AND search_index.type = 'daily'
      WHERE search_index MATCH ?
    `;

    if (projectId) {
      return this.db
        .prepare(`${baseQuery} AND search_index.project_id = ?`)
        .all(query, projectId);
    }

    return this.db.prepare(baseQuery).all(query);
  }

  // ---------------------------------------------------------------------------
  // Sync — reconciliación entre disco y BD
  // ---------------------------------------------------------------------------

  /**
   * Escanea el vault y detecta inconsistencias entre la BD y el sistema de archivos.
   * No modifica nada — solo reporta.
   *
   * @returns {{
   *   missing_files:      { id: string, project_id: string, file_path: string, type: string }[],
   *   unregistered_files: { file_path: string, type: string }[]
   * }}
   *   missing_files      — registros en BD cuyo archivo no existe en disco (decisions + skills)
   *   unregistered_files — archivos .md en disco sin registro en la BD (decisions + skills)
   */
  sync() {
    const missing_files = [];
    const unregistered_files = [];
    const projectsRoot = path.join(this.vaultPath, 'projects');

    // ── Decisions ────────────────────────────────────────────────────────────

    const allDecisions = this.db
      .prepare('SELECT id, file_path, project_id FROM decisions')
      .all();

    for (const dec of allDecisions) {
      if (!fs.existsSync(dec.file_path)) {
        missing_files.push({ id: dec.id, project_id: dec.project_id, file_path: dec.file_path, type: 'decision' });
      }
    }

    const registeredDecisions = new Set(allDecisions.map((d) => d.file_path));

    if (fs.existsSync(projectsRoot)) {
      const decDirs = fs
        .readdirSync(projectsRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(projectsRoot, e.name, 'decisions'));

      for (const decDir of decDirs) {
        if (!fs.existsSync(decDir)) continue;
        for (const f of fs.readdirSync(decDir).filter((f) => f.endsWith('.md'))) {
          const filePath = path.join(decDir, f);
          if (!registeredDecisions.has(filePath)) {
            unregistered_files.push({ file_path: filePath, type: 'decision' });
          }
        }
      }
    }

    // ── Skills ───────────────────────────────────────────────────────────────

    const allSkills = this.db
      .prepare('SELECT id, file_path, project_id FROM project_skills')
      .all();

    for (const sk of allSkills) {
      if (!fs.existsSync(sk.file_path)) {
        missing_files.push({ id: sk.id, project_id: sk.project_id, file_path: sk.file_path, type: 'skill' });
      }
    }

    const registeredSkills = new Set(allSkills.map((s) => s.file_path));

    if (fs.existsSync(projectsRoot)) {
      const skillDirs = fs
        .readdirSync(projectsRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(projectsRoot, e.name, 'skills'));

      for (const skillDir of skillDirs) {
        if (!fs.existsSync(skillDir)) continue;
        for (const f of fs.readdirSync(skillDir).filter((f) => f.endsWith('.md'))) {
          const filePath = path.join(skillDir, f);
          if (!registeredSkills.has(filePath)) {
            unregistered_files.push({ file_path: filePath, type: 'skill' });
          }
        }
      }
    }

    // ── Resources ────────────────────────────────────────────────────────────

    const allResources = this.db
      .prepare('SELECT id, file_path, project_id FROM resources')
      .all();

    for (const res of allResources) {
      if (!fs.existsSync(res.file_path)) {
        missing_files.push({ id: res.id, project_id: res.project_id, file_path: res.file_path, type: 'resource' });
      }
    }

    const registeredResources = new Set(allResources.map((r) => r.file_path));
    const resourcesRoot = path.join(this.vaultPath, 'resources');

    if (fs.existsSync(resourcesRoot)) {
      for (const f of fs.readdirSync(resourcesRoot).filter((f) => f.endsWith('.md'))) {
        const filePath = path.join(resourcesRoot, f);
        if (!registeredResources.has(filePath)) {
          unregistered_files.push({ file_path: filePath, type: 'resource' });
        }
      }
    }

    // ── Daily logs ───────────────────────────────────────────────────────────

    const allDailyLogs = this.db
      .prepare('SELECT id, file_path, project_id FROM daily_logs')
      .all();

    for (const log of allDailyLogs) {
      if (!fs.existsSync(log.file_path)) {
        missing_files.push({ id: log.id, project_id: log.project_id, file_path: log.file_path, type: 'daily' });
      }
    }

    const registeredDailyLogs = new Set(allDailyLogs.map((l) => l.file_path));
    const dailyRoot = path.join(this.vaultPath, 'daily');

    if (fs.existsSync(dailyRoot)) {
      for (const f of fs.readdirSync(dailyRoot).filter((f) => f.endsWith('.md'))) {
        const filePath = path.join(dailyRoot, f);
        if (!registeredDailyLogs.has(filePath)) {
          unregistered_files.push({ file_path: filePath, type: 'daily' });
        }
      }
    }

    return { missing_files, unregistered_files };
  }
}

// Nota: el proyecto usa "type": "module" en package.json (ESM).
// Si necesitas CommonJS puro, renombra este archivo a VaultStore.cjs
// o elimina "type": "module" del package.json.
export default VaultStore;
