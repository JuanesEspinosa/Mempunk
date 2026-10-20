import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import VaultStore from '../src/store/VaultStore.js';
import { buildContext, readState } from '../src/services/context.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const CLI_PATH     = path.join(PROJECT_ROOT, 'src', 'cli.js');

const TEMP_VAULT = path.join(os.tmpdir(), `mempunk-context-test-${Date.now()}`);
const TEMP_HOME  = path.join(os.tmpdir(), `mempunk-context-home-${Date.now()}`);

const FILLED_STATE = `# Estado del Proyecto — Demo

## Estado actual

Login con JWT funcionando; falta el refresh token.

## Proximos 3 pasos

1. Refresh token

---

## Historial de estados anteriores

2026-10-01 — estado viejo que no debe aparecer
`;

function cli(args, env = {}) {
  return spawnSync('node', [CLI_PATH, ...args], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, MEMPUNK_LANG: 'es', MEMPUNK_VAULT: TEMP_VAULT, HOME: TEMP_HOME, USERPROFILE: TEMP_HOME, ...env },
    encoding: 'utf8',
  });
}

function stateFile(id) {
  return path.join(TEMP_VAULT, 'projects', id, 'wiki', 'state.md');
}

let store;

beforeAll(() => {
  fs.mkdirSync(TEMP_HOME, { recursive: true });
  cli(['init']);
  cli(['project', 'add', 'demo', 'Demo']);
  cli(['project', 'add', 'vacio', 'Vacio']);
  fs.writeFileSync(stateFile('demo'), FILLED_STATE, 'utf8');
  cli(['session', 'log', 'demo', 'Implementé el login JWT', '--files', 'src/auth.ts,src/jwt.ts']);
  for (let i = 1; i <= 10; i++) cli(['backlog', 'add', 'demo', `Tarea ${i}`]);
  for (let i = 1; i <= 7; i++) cli(['decision', 'add', 'demo', `Decision ${i}`]);

  const snap = path.join(TEMP_HOME, 'snap.json');
  fs.writeFileSync(snap, JSON.stringify({
    project_id: 'demo', session_id: 's1', compact_type: 'auto', message_count: 2,
    raw_turns: JSON.stringify([
      { type: 'user', message: { content: 'agrega refresh token' } },
      { message: { role: 'assistant', content: [{ type: 'text', text: 'Editando src/refresh.ts' }] } },
    ]),
    files_found: JSON.stringify(['src/refresh.ts']),
    commands_run: JSON.stringify(['npm test']),
  }));
  cli(['session', 'save-compact', snap]);

  store = new VaultStore(TEMP_VAULT, { autoMigrate: false });
});

afterAll(() => {
  store?.db.close();
  fs.rmSync(TEMP_VAULT, { recursive: true, force: true });
  fs.rmSync(TEMP_HOME, { recursive: true, force: true });
});

// ── readState ─────────────────────────────────────────────────────────────────

describe('readState', () => {
  it('quita la sección "Historial de estados anteriores"', () => {
    const state = readState(stateFile('demo'));
    expect(state).toContain('Login con JWT funcionando');
    expect(state).not.toContain('Historial de estados anteriores');
    expect(state).not.toContain('estado viejo');
  });

  it('trata la plantilla sin rellenar como inexistente', () => {
    expect(readState(stateFile('vacio'))).toBeNull();
  });

  it('devuelve null si el archivo no existe', () => {
    expect(readState(path.join(TEMP_VAULT, 'no-existe.md'))).toBeNull();
  });
});

// ── buildContext ──────────────────────────────────────────────────────────────

describe('buildContext', () => {
  it('ordena las secciones por prioridad: estado, sesión, backlog, decisiones', () => {
    const ctx = buildContext(store, 'demo');
    expect(ctx.sections.map((s) => s.key)).toEqual(['state', 'lastSession', 'backlog', 'decisions']);
    expect(ctx.text.startsWith('MEMPUNK CONTEXT — demo')).toBe(true);
    expect(ctx.omitted).toEqual([]);
    expect(ctx.truncated).toBe(false);
  });

  it('limita el backlog pendiente a 8 y las decisiones a 5', () => {
    const ctx = buildContext(store, 'demo');
    const body = (key) => ctx.sections.find((s) => s.key === key).body;
    expect(body('backlog').split('\n')).toHaveLength(8);
    expect(body('decisions').split('\n')).toHaveLength(5);
  });

  it('incluye los archivos de la última sesión', () => {
    const ctx = buildContext(store, 'demo');
    expect(ctx.text).toContain('Implementé el login JWT');
    expect(ctx.text).toContain('src/jwt.ts');
  });

  it('con withSnapshot añade archivos, comandos y últimos mensajes', () => {
    const ctx = buildContext(store, 'demo', { withSnapshot: true });
    expect(ctx.sections.at(-1).key).toBe('snapshot');
    expect(ctx.text).toContain('src/refresh.ts');
    expect(ctx.text).toContain('npm test');
    expect(ctx.text).toContain('[user] agrega refresh token');
    expect(ctx.text).toContain('[assistant] Editando src/refresh.ts');
  });

  it('sin state.md relleno empieza por la última sesión', () => {
    const ctx = buildContext(store, 'vacio');
    expect(ctx.sections.map((s) => s.key)).not.toContain('state');
  });

  it('omite secciones enteras por el final cuando no caben', () => {
    const full = buildContext(store, 'demo', { withSnapshot: true });
    const withoutLast = full.text.length - full.sections.at(-1).body.length - 60;
    const ctx = buildContext(store, 'demo', { withSnapshot: true, maxChars: withoutLast });
    expect(ctx.text.length).toBeLessThanOrEqual(withoutLast);
    expect(ctx.omitted).toContain('snapshot');
    expect(ctx.sections.map((s) => s.key)).toContain('state');
  });

  it('trunca el estado antes que perderlo', () => {
    const ctx = buildContext(store, 'demo', { maxChars: 120 });
    expect(ctx.sections.map((s) => s.key)).toEqual(['state']);
    expect(ctx.truncated).toBe(true);
    expect(ctx.text.length).toBeLessThanOrEqual(120);
  });

  it('lanza error si el proyecto no existe', () => {
    expect(() => buildContext(store, 'fantasma')).toThrow('fantasma');
  });
});

// ── mempunk context ───────────────────────────────────────────────────────────

describe('mempunk context', () => {
  it('imprime el bloque de texto', () => {
    const r = cli(['context', 'demo']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('MEMPUNK CONTEXT — demo');
    expect(r.stdout).toContain('Login con JWT funcionando');
  });

  it('--json devuelve secciones, omitidas y texto', () => {
    const r = cli(['context', 'demo', '--json', '--with-snapshot']);
    const json = JSON.parse(r.stdout);
    expect(json.project_id).toBe('demo');
    expect(json.sections.map((s) => s.key)).toContain('snapshot');
    expect(typeof json.text).toBe('string');
  });

  it('--max-chars limita el tamaño', () => {
    const r = cli(['context', 'demo', '--with-snapshot', '--max-chars', '300']);
    expect(r.status).toBe(0);
    expect(r.stdout.trimEnd().length).toBeLessThanOrEqual(300);
  });

  it.each([['abc'], ['10']])('--max-chars %s inválido falla con error', (value) => {
    const r = cli(['context', 'demo', '--max-chars', value]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--max-chars');
  });

  it('sin project_id muestra el uso', () => {
    const r = cli(['context']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('mempunk context');
  });

  it('proyecto inexistente falla', () => {
    const r = cli(['context', 'fantasma']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('fantasma');
  });
});
