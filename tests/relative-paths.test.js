import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import VaultStore, { VAULT_VERSION, relativizeLegacyPath, toVaultRelative } from '../src/store/VaultStore.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// Vault temporal aislado — nunca toca ~/Dev-Brain
const TEMP_VAULT = path.join(os.tmpdir(), `mempunk-relpaths-test-${Date.now()}`);
const PROJ       = 'relproj';
const PROJ_PATH  = path.join(TEMP_VAULT, 'projects', PROJ);

// Prefijo de "la otra máquina": otro usuario y otra unidad
const OTHER_PC = 'D:/Users/Otro/Dev-Brain';

let store;

beforeAll(() => {
  fs.mkdirSync(path.join(PROJ_PATH, 'decisions'), { recursive: true });
  store = new VaultStore(TEMP_VAULT);
  store.addProject(PROJ, 'Rel Project', PROJ_PATH);
});

afterAll(() => {
  store.db.close();
  fs.rmSync(TEMP_VAULT, { recursive: true, force: true });
});

describe('toVaultRelative / relativizeLegacyPath', () => {
  it('convierte rutas dentro del vault y deja igual las de fuera', () => {
    const inside = path.join(TEMP_VAULT, 'projects', PROJ, 'decisions', 'a.md');
    expect(toVaultRelative(inside, TEMP_VAULT)).toBe(`projects/${PROJ}/decisions/a.md`);
    expect(toVaultRelative(path.join(os.tmpdir(), 'fuera.md'), TEMP_VAULT)).toBe(path.join(os.tmpdir(), 'fuera.md'));
    expect(toVaultRelative('projects/x', TEMP_VAULT)).toBe('projects/x');
  });

  it('reconoce rutas de otra máquina por sufijo anclado', () => {
    const re = /(?:^|\/)(projects\/[^/]+\/decisions\/[^/]+)$/;
    expect(relativizeLegacyPath(`${OTHER_PC}\\projects\\p1\\decisions\\d.md`.replace(/\//g, '\\'), TEMP_VAULT, re))
      .toBe('projects/p1/decisions/d.md');
    expect(relativizeLegacyPath('/home/otro/Dev-Brain/projects/p1/decisions/d.md', TEMP_VAULT, re))
      .toBe('projects/p1/decisions/d.md');
    // No reconocida → igual (nunca inventar una ruta)
    expect(relativizeLegacyPath('/raro/archivo.md', TEMP_VAULT, re)).toBe('/raro/archivo.md');
  });
});

describe('La BD guarda rutas relativas y la API devuelve absolutas', () => {
  it('addDecision / addResource / addDailyLog / addSkill / addProject', () => {
    const decPath = path.join(PROJ_PATH, 'decisions', 'rel.md');
    store.addDecision(PROJ, 'Rel', decPath, [], '# Rel');
    store.addResource(PROJ, 'Res', 'https://example.com', 'cuerpo');
    store.addDailyLog(PROJ, 'entrada');
    store.addSkill(PROJ, 'stack', path.join(PROJ_PATH, 'skills', 'stack.md'), '## Stack');

    const raw = (sql) => store.db.prepare(sql).get(PROJ);
    expect(raw('SELECT file_path FROM decisions WHERE project_id = ?').file_path).toBe(`projects/${PROJ}/decisions/rel.md`);
    expect(raw('SELECT file_path FROM resources WHERE project_id = ?').file_path).toMatch(/^resources\/[^/]+\.md$/);
    expect(raw('SELECT file_path FROM daily_logs WHERE project_id = ?').file_path).toMatch(/^daily\/\d{4}-\d{2}-\d{2}\.md$/);
    expect(raw('SELECT file_path FROM project_skills WHERE project_id = ?').file_path).toBe(`projects/${PROJ}/skills/stack.md`);
    expect(store.db.prepare('SELECT path FROM projects WHERE id = ?').get(PROJ).path).toBe(`projects/${PROJ}`);

    expect(store.listDecisions(PROJ)[0].file_path).toBe(decPath);
    expect(store.listProjects().find((p) => p.id === PROJ).path).toBe(PROJ_PATH);
    expect(fs.existsSync(store.listResources(PROJ)[0].file_path)).toBe(true);
    expect(fs.existsSync(store.listDailyLogs(PROJ)[0].file_path)).toBe(true);
    expect(fs.existsSync(store.getSkills(PROJ)[0].file_path)).toBe(true);
    expect(store.search('Rel', PROJ).some((r) => r.file_path === decPath)).toBe(true);
  });

  it('sync() no reporta como faltantes los archivos guardados con ruta relativa', () => {
    const { missing_files, unregistered_files } = store.sync();
    expect(missing_files).toEqual([]);
    expect(unregistered_files).toEqual([]);
  });

  it('updateSkill() escribe en la ruta absoluta resuelta', () => {
    const sk = store.getSkills(PROJ)[0];
    store.updateSkill(sk.id, '## Stack v2');
    expect(fs.readFileSync(sk.file_path, 'utf8')).toBe('## Stack v2');
  });
});

describe('Migración v6', () => {
  it('convierte rutas absolutas de esta y de otra máquina', () => {
    const id = 'dec_legacy';
    store.db.prepare(
      `INSERT INTO decisions (id, project_id, title, file_path, tags, created_at) VALUES (?, ?, 'L', ?, '[]', 'x')`
    ).run(id, PROJ, `${OTHER_PC}/projects/${PROJ}/decisions/legacy.md`);
    store.db.prepare('UPDATE projects SET path = ? WHERE id = ?').run(PROJ_PATH, PROJ);

    // Simular un vault v5
    store.db.prepare('DELETE FROM _migrations WHERE version = 6').run();
    store.db.prepare('UPDATE vault_meta SET value = ? WHERE key = ?').run('5', 'vault_version');
    store.migrate();

    expect(store.getVaultVersion()).toBe(VAULT_VERSION);
    expect(store.db.prepare('SELECT file_path FROM decisions WHERE id = ?').get(id).file_path)
      .toBe(`projects/${PROJ}/decisions/legacy.md`);
    expect(store.db.prepare('SELECT path FROM projects WHERE id = ?').get(PROJ).path).toBe(`projects/${PROJ}`);
  });
});

describe('openStore con una BD más nueva que el CLI', () => {
  it('aborta pidiendo actualizar mempunk', () => {
    const vault = path.join(os.tmpdir(), `mempunk-newer-test-${Date.now()}`);
    const s = new VaultStore(vault);
    s.db.prepare('UPDATE vault_meta SET value = ? WHERE key = ?').run(String(VAULT_VERSION + 1), 'vault_version');
    s.db.close();
    try {
      const res = spawnSync('node', ['src/cli.js', 'project', 'list'], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, MEMPUNK_VAULT: vault, MEMPUNK_LANG: 'es' },
        encoding: 'utf8',
      });
      expect(res.status).not.toBe(0);
      expect(res.stderr + res.stdout).toContain('Actualiza mempunk');
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });
});

describe('_toAbs confina las rutas al vault', () => {
  it('una ruta relativa que escapa del vault se devuelve como null', () => {
    store.db.prepare(
      `INSERT INTO decisions (id, project_id, title, file_path, tags, created_at) VALUES ('dec_evil', ?, 'E', '../../evil.md', '[]', 'z')`
    ).run(PROJ);
    const row = store.listDecisions(PROJ).find((d) => d.id === 'dec_evil');
    expect(row.file_path).toBeNull();
  });
});
