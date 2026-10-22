import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import VaultStore from '../src/store/VaultStore.js';
import { requireProject, resolveProjectId } from '../src/services/project.js';
import { addDecision } from '../src/services/decisions.js';
import { logSession } from '../src/services/sessions.js';
import { addItem, listItems, updateItem } from '../src/services/backlog.js';
import { query } from '../src/services/search.js';
import { updateState, STATE_HISTORY_HEADING } from '../src/services/state.js';
import { readState } from '../src/services/context.js';

// Vault temporal aislado — nunca toca ~/Dev-Brain
const TEMP_VAULT = path.join(os.tmpdir(), `mempunk-services-test-${Date.now()}`);
const PROJ       = 'svc';
const PROJ_PATH  = path.join(TEMP_VAULT, 'projects', PROJ);

let store;

beforeAll(() => {
  fs.mkdirSync(PROJ_PATH, { recursive: true });
  store = new VaultStore(TEMP_VAULT);
  store.addProject(PROJ, 'Servicios', PROJ_PATH);
});

afterAll(() => {
  store.db.close();
  fs.rmSync(TEMP_VAULT, { recursive: true, force: true });
});

// ── Proyecto ──────────────────────────────────────────────────────────────────

describe('services/project', () => {
  it('requireProject() devuelve el proyecto existente', () => {
    expect(requireProject(store, PROJ).id).toBe(PROJ);
  });

  it('requireProject() lanza un error explicativo si no existe', () => {
    expect(() => requireProject(store, 'nope')).toThrow(/nope/);
  });

  it('resolveProjectId() prioriza el project_id explícito', () => {
    expect(resolveProjectId(store, { projectId: PROJ, resolveFromCwd: () => 'otro' })).toBe(PROJ);
  });

  it('resolveProjectId() cae al proyecto del cwd', () => {
    expect(resolveProjectId(store, { resolveFromCwd: () => PROJ })).toBe(PROJ);
  });

  it('resolveProjectId() lanza si no hay proyecto explícito ni por cwd', () => {
    expect(() => resolveProjectId(store, { cwd: '/tmp/x', resolveFromCwd: () => null })).toThrow(/project_id/);
  });

  it('resolveProjectId() valida que el proyecto resuelto exista', () => {
    expect(() => resolveProjectId(store, { resolveFromCwd: () => 'fantasma' })).toThrow(/fantasma/);
  });
});

// ── Decisiones ────────────────────────────────────────────────────────────────

describe('services/decisions', () => {
  it('addDecision() escribe el ADR con contexto y decisión y lo registra', () => {
    const { id, file_path } = addDecision(store, {
      projectId: PROJ, title: 'Usar MCP', context: 'Los subagentes son frágiles', decision: 'Servidor stdio', tags: ['mcp', 'arq'],
    });
    const md = fs.readFileSync(file_path, 'utf8');
    expect(file_path.startsWith(path.join(PROJ_PATH, 'decisions'))).toBe(true);
    expect(md).toContain('title: Usar MCP');
    expect(md).toContain('tags: [mcp, arq]');
    expect(md).toMatch(/## Contexto\n\nLos subagentes son frágiles/);
    expect(md).toMatch(/## Decisión\n\nServidor stdio/);
    expect(store.listDecisions(PROJ).some((d) => d.id === id)).toBe(true);
  });

  it('addDecision() sin contexto ni decisión deja las secciones vacías (como el CLI)', () => {
    const { file_path } = addDecision(store, { projectId: PROJ, title: 'Plantilla' });
    expect(fs.readFileSync(file_path, 'utf8')).toMatch(/## Contexto\n\n## Decisión\n\n## Consecuencias\n/);
  });

  it('addDecision() rechaza título vacío y proyecto inexistente', () => {
    expect(() => addDecision(store, { projectId: PROJ, title: '  ' })).toThrow(/title/);
    expect(() => addDecision(store, { projectId: 'nope', title: 'X' })).toThrow(/nope/);
  });
});

// ── Sesiones ──────────────────────────────────────────────────────────────────

describe('services/sessions', () => {
  it('logSession() registra resumen y archivos y devuelve el id', () => {
    const { id } = logSession(store, { projectId: PROJ, summary: 'Hice cosas', files: ['a.js', ' ', 'b.js'] });
    const last = store.getLastSession(PROJ);
    expect(last.id).toBe(id);
    expect(JSON.parse(last.files_touched)).toEqual(['a.js', 'b.js']);
  });

  it('logSession() rechaza resumen vacío', () => {
    expect(() => logSession(store, { projectId: PROJ, summary: '' })).toThrow(/summary/);
  });
});

// ── Backlog ───────────────────────────────────────────────────────────────────

describe('services/backlog', () => {
  let item;

  it('addItem() crea la tarea con prioridad 2 por defecto y la devuelve', () => {
    item = addItem(store, { projectId: PROJ, title: 'Escribir tests' });
    expect(item).toMatchObject({ project_id: PROJ, title: 'Escribir tests', status: 'pending', priority: 2 });
  });

  it('listItems() filtra por estado', () => {
    expect(listItems(store, { projectId: PROJ, status: 'pending' }).some((i) => i.id === item.id)).toBe(true);
    expect(listItems(store, { projectId: PROJ, status: 'done' })).toEqual([]);
  });

  it('updateItem() cambia estado y prioridad y devuelve la tarea', () => {
    const updated = updateItem(store, { id: item.id, status: 'blocked', priority: 5 });
    expect(updated).toMatchObject({ id: item.id, status: 'blocked', priority: 5 });
  });

  it('valida estado, prioridad, id y que haya algo que actualizar', () => {
    expect(() => addItem(store, { projectId: PROJ, title: 'X', priority: 9 })).toThrow(/9/);
    expect(() => listItems(store, { projectId: PROJ, status: 'completed' })).toThrow(/completed/);
    expect(() => updateItem(store, { id: item.id, status: 'hecho' })).toThrow(/hecho/);
    expect(() => updateItem(store, { id: 'bl_x', status: 'done' })).toThrow(/bl_x/);
    expect(() => updateItem(store, { id: item.id })).toThrow();
  });
});

// ── Búsqueda ──────────────────────────────────────────────────────────────────

describe('services/search', () => {
  it('query() devuelve coincidencias con fragmento y respeta el límite', () => {
    addDecision(store, { projectId: PROJ, title: 'Otra con zanahoria', context: 'zanahoria' });
    addDecision(store, { projectId: PROJ, title: 'Más zanahoria' });
    const hits = query(store, { query: 'zanahoria', projectId: PROJ, limit: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0].snippet).toContain('[zanahoria]');
  });

  it('query() rechaza una consulta vacía', () => {
    expect(() => query(store, { query: ' ' })).toThrow(/query/);
  });
});

// ── Estado ────────────────────────────────────────────────────────────────────

describe('services/state', () => {
  const stateFile = path.join(PROJ_PATH, 'wiki', 'state.md');

  it('updateState() crea state.md con la sección de historial vacía', () => {
    const { file_path } = updateState(store, { projectId: PROJ, markdown: '# Estado\n\nPrimer estado del proyecto.' });
    expect(file_path).toBe(stateFile);
    const md = fs.readFileSync(stateFile, 'utf8');
    expect(md).toContain('Primer estado del proyecto.');
    expect(md).toContain(STATE_HISTORY_HEADING);
    expect(readState(stateFile)).toBe('# Estado\n\nPrimer estado del proyecto.');
  });

  it('updateState() reemplaza el estado y añade el anterior al historial', () => {
    updateState(store, { projectId: PROJ, markdown: '# Estado\n\nSegundo estado.', now: new Date('2026-10-22T10:00:00Z') });
    const md = fs.readFileSync(stateFile, 'utf8');
    expect(md).not.toMatch(/^Primer estado/m);
    expect(md).toContain('- 2026-10-22 — Primer estado del proyecto.');
    expect(readState(stateFile)).toBe('# Estado\n\nSegundo estado.');
  });

  it('updateState() conserva el historial previo e ignora uno incluido en el markdown', () => {
    updateState(store, {
      projectId: PROJ,
      markdown:  `Tercer estado.\n\n${STATE_HISTORY_HEADING}\n\n- inventado`,
      now:       new Date('2026-10-23T10:00:00Z'),
    });
    const md = fs.readFileSync(stateFile, 'utf8');
    expect(md).toContain('- 2026-10-22 — Primer estado del proyecto.');
    expect(md).toContain('- 2026-10-23 — Segundo estado.');
    expect(md).not.toContain('inventado');
    expect(md.split(STATE_HISTORY_HEADING)).toHaveLength(2);
  });

  it('updateState() no añade al historial la plantilla sin rellenar', () => {
    const tplProj = 'svc-tpl';
    const tplPath = path.join(TEMP_VAULT, 'projects', tplProj);
    fs.mkdirSync(path.join(tplPath, 'wiki'), { recursive: true });
    store.addProject(tplProj, 'Plantilla', tplPath);
    fs.writeFileSync(path.join(tplPath, 'wiki', 'state.md'),
      `# Estado\n\n[Una o dos lineas describiendo donde esta el proyecto]\n\n---\n\n${STATE_HISTORY_HEADING}\n\n<!-- comentario -->\n`);

    updateState(store, { projectId: tplProj, markdown: 'Nuevo.' });
    const md = fs.readFileSync(path.join(tplPath, 'wiki', 'state.md'), 'utf8');
    expect(md).toContain('<!-- comentario -->');
    expect(md).not.toMatch(/^- \d{4}-/m);
  });

  it('updateState() rechaza markdown vacío o de más de 4.000 caracteres', () => {
    expect(() => updateState(store, { projectId: PROJ, markdown: '' })).toThrow(/markdown/);
    expect(() => updateState(store, { projectId: PROJ, markdown: 'x'.repeat(4001) })).toThrow(/4000/);
  });
});
