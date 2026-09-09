import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import VaultStore, { VAULT_VERSION, currentHost, normalizeRootPath } from '../src/store/VaultStore.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// Vault temporal aislado — nunca toca ~/Dev-Brain
const TEMP_VAULT = path.join(os.tmpdir(), `mempunk-paths-test-${Date.now()}`);
const PROJ       = 'pathsproj';
const PROJ_PATH  = path.join(TEMP_VAULT, 'projects', PROJ);

const PATH_A = process.platform === 'win32' ? 'C:\\Repos\\A' : '/repos/a';
const PATH_B = process.platform === 'win32' ? 'D:\\Work\\B'  : '/work/b';
const NORM_A = normalizeRootPath(PATH_A);
const NORM_B = normalizeRootPath(PATH_B);

const ORIGINAL_HOST = process.env.MEMPUNK_HOST;
let store;

// currentHost() lee el env en cada llamada — cambiarlo simula otra máquina
function asHost(host) {
  process.env.MEMPUNK_HOST = host;
}

function pathRows(projectId) {
  return store.db
    .prepare('SELECT host, root_path FROM project_paths WHERE project_id = ? ORDER BY host')
    .all(projectId);
}

beforeAll(() => {
  fs.mkdirSync(PROJ_PATH, { recursive: true });
  store = new VaultStore(TEMP_VAULT);
  store.addProject(PROJ, 'Paths Project', PROJ_PATH);
});

afterAll(() => {
  store.db.close();
  fs.rmSync(TEMP_VAULT, { recursive: true, force: true });
  if (ORIGINAL_HOST === undefined) delete process.env.MEMPUNK_HOST;
  else process.env.MEMPUNK_HOST = ORIGINAL_HOST;
});

// ── Identidad de host ─────────────────────────────────────────────────────────

describe('currentHost()', () => {
  it('usa MEMPUNK_HOST cuando está definido y os.hostname() como fallback', () => {
    asHost('  pc-x  ');
    expect(currentHost()).toBe('pc-x');

    delete process.env.MEMPUNK_HOST;
    expect(currentHost()).toBe(os.hostname().toLowerCase().replace(/\.(local|lan)$/, ''));
  });

  it('normaliza a minúsculas y quita el sufijo .local/.lan (macOS y Windows no dan falsos "sin ruta")', () => {
    asHost('My-PC.local');
    expect(currentHost()).toBe('my-pc');
    asHost('Laptop.LAN');
    expect(currentHost()).toBe('laptop');

    store.db.prepare('DELETE FROM project_paths WHERE project_id = ?').run(PROJ);
    asHost('My-PC.local');
    store.setProjectRootPath(PROJ, PATH_A);
    expect(pathRows(PROJ)).toEqual([{ host: 'my-pc', root_path: NORM_A }]);
    store.db.prepare('DELETE FROM project_paths WHERE project_id = ?').run(PROJ);
  });
});

// ── Migración v5 ──────────────────────────────────────────────────────────────

describe('Migración v5 (project_paths)', () => {
  it('VAULT_VERSION es 5 y existe la tabla project_paths', () => {
    expect(VAULT_VERSION).toBe(5);
    expect(store.getVaultVersion()).toBe(5);

    const cols = store.db.prepare('PRAGMA table_info(project_paths)').all().map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['project_id', 'host', 'root_path', 'updated_at']));
  });

  it('el seed copia projects.root_path a la fila del host actual al subir de v4 a v5', () => {
    asHost('seed-host');
    store.db
      .prepare('UPDATE projects SET root_path = ? WHERE id = ?')
      .run(NORM_A, PROJ);

    // Simular un vault v4: sin migración 5, sin tabla, vault_meta en 4
    store.db.prepare('DELETE FROM _migrations WHERE version = 5').run();
    store.db.exec('DROP TABLE project_paths');
    store.db.prepare('UPDATE vault_meta SET value = ? WHERE key = ?').run('4', 'vault_version');
    expect(store.getVaultVersion()).toBe(4);

    store.migrate();

    expect(store.getVaultVersion()).toBe(5);
    expect(pathRows(PROJ)).toEqual([{ host: 'seed-host', root_path: NORM_A }]);
    expect(store.getProjectPathMap()).toEqual({ [NORM_A]: PROJ });
  });
});

// ── Aislamiento por host ──────────────────────────────────────────────────────

describe('Rutas por máquina', () => {
  beforeEach(() => {
    store.db.prepare('DELETE FROM project_paths WHERE project_id = ?').run(PROJ);
  });

  it('cada host ve solo su propia ruta y projects.root_path guarda la última escritura', () => {
    asHost('pc-a');
    store.setProjectRootPath(PROJ, PATH_A);
    asHost('pc-b');
    store.setProjectRootPath(PROJ, PATH_B);

    asHost('pc-a');
    expect(store.getProjectPathMap()).toEqual({ [NORM_A]: PROJ });
    asHost('pc-b');
    expect(store.getProjectPathMap()).toEqual({ [NORM_B]: PROJ });

    const row = store.db.prepare('SELECT root_path FROM projects WHERE id = ?').get(PROJ);
    expect(row.root_path).toBe(NORM_B);

    expect(store.getProjectPathHosts(PROJ).map((r) => [r.host, r.root_path])).toEqual([
      ['pc-a', NORM_A],
      ['pc-b', NORM_B],
    ]);
  });

  it('getProjectsMissingLocalPath() lista los proyectos sin ruta en este host', () => {
    asHost('pc-a');
    store.setProjectRootPath(PROJ, PATH_A);

    asHost('pc-c');
    expect(store.getProjectsMissingLocalPath()).toEqual([
      { id: PROJ, name: 'Paths Project', known_root_path: NORM_A },
    ]);

    asHost('pc-a');
    expect(store.getProjectsMissingLocalPath()).toEqual([]);
  });

  it('getProjectsMissingLocalPath() ignora proyectos archivados', () => {
    asHost('pc-c');
    store.db.prepare("UPDATE projects SET status = 'archived' WHERE id = ?").run(PROJ);
    expect(store.getProjectsMissingLocalPath()).toEqual([]);
    store.db.prepare("UPDATE projects SET status = 'active' WHERE id = ?").run(PROJ);
  });

  it('setProjectRootPath(id, null) borra solo la fila del host actual', () => {
    asHost('pc-a');
    store.setProjectRootPath(PROJ, PATH_A);
    asHost('pc-b');
    store.setProjectRootPath(PROJ, PATH_B);

    asHost('pc-a');
    store.setProjectRootPath(PROJ, null);

    expect(pathRows(PROJ)).toEqual([{ host: 'pc-b', root_path: NORM_B }]);
    expect(store.getProjectPathMap()).toEqual({});
  });

  it('addProject() con rootPath escribe la fila del host actual sin borrar las de otros hosts', () => {
    asHost('pc-a');
    store.addProject(PROJ, 'Paths Project', PROJ_PATH, PATH_A);
    asHost('pc-b');
    store.addProject(PROJ, 'Paths Project', PROJ_PATH, PATH_B);

    expect(pathRows(PROJ)).toEqual([
      { host: 'pc-a', root_path: NORM_A },
      { host: 'pc-b', root_path: NORM_B },
    ]);
  });

  it('borrar el proyecto elimina sus filas de project_paths (cascade)', () => {
    const tmpProj = 'cascadeproj';
    store.addProject(tmpProj, 'Cascade', path.join(TEMP_VAULT, 'projects', tmpProj));
    asHost('pc-a');
    store.setProjectRootPath(tmpProj, PATH_A);
    asHost('pc-b');
    store.setProjectRootPath(tmpProj, PATH_B);
    expect(pathRows(tmpProj)).toHaveLength(2);

    store.db.prepare('DELETE FROM projects WHERE id = ?').run(tmpProj);

    expect(pathRows(tmpProj)).toEqual([]);
  });
});

// ── CLI ───────────────────────────────────────────────────────────────────────

describe('CLI: project-paths.json por host', () => {
  const CLI_VAULT = path.join(os.tmpdir(), `mempunk-paths-cli-vault-${Date.now()}`);
  const CLI_HOME  = path.join(os.tmpdir(), `mempunk-paths-cli-home-${Date.now()}`);
  const HERE_DIR  = path.join(os.tmpdir(), `mempunk-paths-here-${Date.now()}`);
  const pathsFile = path.join(CLI_VAULT, '.mempunk', 'project-paths.json');

  function cliEnv(host) {
    return {
      ...process.env,
      MEMPUNK_LANG: 'es',
      MEMPUNK_VAULT: CLI_VAULT,
      MEMPUNK_HOST: host,
      HOME: CLI_HOME,
      USERPROFILE: CLI_HOME,
    };
  }

  function run(args, host, cwd = PROJECT_ROOT) {
    return execSync(`node ${path.join(PROJECT_ROOT, 'src', 'cli.js')} ${args}`, {
      cwd,
      env: cliEnv(host),
      encoding: 'utf8',
    });
  }

  beforeAll(() => {
    fs.mkdirSync(CLI_HOME, { recursive: true });
    fs.mkdirSync(HERE_DIR, { recursive: true });
    run('init', 'pc-a');
    run(`project add cliproj "CLI Project" --path "${HERE_DIR}"`, 'pc-a');
  });

  afterAll(() => {
    fs.rmSync(CLI_VAULT, { recursive: true, force: true });
    fs.rmSync(CLI_HOME,  { recursive: true, force: true });
    fs.rmSync(HERE_DIR,  { recursive: true, force: true });
  });

  it('project activate --here escribe el cwd en project-paths.json para el host actual', () => {
    const result = spawnSync('node', [path.join(PROJECT_ROOT, 'src', 'cli.js'), 'project', 'activate', 'cliproj', '--here'], {
      cwd: HERE_DIR,
      env: cliEnv('pc-a'),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Directorio mapeado');

    const map = JSON.parse(fs.readFileSync(pathsFile, 'utf8'));
    expect(map[normalizeRootPath(HERE_DIR)]).toBe('cliproj');
  });

  it('otro host no ve el mapeo de pc-a al regenerar el archivo', () => {
    run('project activate cliproj', 'pc-b');
    // activate sin --here no regenera el archivo; forzarlo con --here desde otro cwd
    const otherDir = path.join(os.tmpdir(), `mempunk-paths-other-${Date.now()}`);
    fs.mkdirSync(otherDir, { recursive: true });
    run('project activate cliproj --here', 'pc-b', otherDir);

    const map = JSON.parse(fs.readFileSync(pathsFile, 'utf8'));
    expect(map[normalizeRootPath(otherDir)]).toBe('cliproj');
    expect(map[normalizeRootPath(HERE_DIR)]).toBeUndefined();
    fs.rmSync(otherDir, { recursive: true, force: true });

    // De vuelta en pc-a el archivo vuelve a reflejar solo la ruta de pc-a
    run('project activate cliproj --here', 'pc-a', HERE_DIR);
    const mapA = JSON.parse(fs.readFileSync(pathsFile, 'utf8'));
    expect(Object.values(mapA)).toEqual(['cliproj']);
    expect(mapA[normalizeRootPath(HERE_DIR)]).toBe('cliproj');
  });

  it('vault upgrade sobre un vault al día avisa y conserva project-paths.json', () => {
    const out = run('vault upgrade', 'pc-a');
    expect(out).toContain('ya está en la versión más reciente');
    expect(out).toContain(`v${VAULT_VERSION}`);

    const map = JSON.parse(fs.readFileSync(pathsFile, 'utf8'));
    expect(map[normalizeRootPath(HERE_DIR)]).toBe('cliproj');
  });
});
