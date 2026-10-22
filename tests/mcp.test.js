import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { VAULT_VERSION } from '../src/store/VaultStore.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const CLI_PATH     = path.join(PROJECT_ROOT, 'src', 'cli.js');

// Vault, home y repo temporales — nunca toca ~/Dev-Brain
const STAMP      = Date.now();
const TEMP_VAULT = path.join(os.tmpdir(), `mempunk-mcp-test-${STAMP}`);
const TEMP_HOME  = path.join(os.tmpdir(), `mempunk-mcp-home-${STAMP}`);
const REPO_DIR   = path.join(os.tmpdir(), `mempunk-mcp-repo-${STAMP}`);
const PROJ       = 'mcp-demo';

const ENV = {
  ...process.env,
  MEMPUNK_LANG:  'es',
  MEMPUNK_VAULT: TEMP_VAULT,
  HOME:          TEMP_HOME,
  USERPROFILE:   TEMP_HOME,
};
delete ENV.CLAUDE_PROJECT_ID;

const EXPECTED_TOOLS = [
  'backlog_add', 'backlog_list', 'backlog_update', 'get_context',
  'log_session', 'save_decision', 'search', 'update_state',
];

function cli(args, cwd = PROJECT_ROOT) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd, env: ENV, encoding: 'utf8' });
}

async function connect(cwd = REPO_DIR) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args:    [CLI_PATH, 'mcp'],
    cwd,
    env:     ENV,
    stderr:  'pipe',
  });
  const client = new Client({ name: 'mempunk-test', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

function text(result) {
  return result.content.map((c) => c.text).join('\n');
}

function json(result) {
  expect(result.isError).toBeFalsy();
  return JSON.parse(text(result));
}

let client;

beforeAll(async () => {
  fs.mkdirSync(TEMP_HOME, { recursive: true });
  fs.mkdirSync(REPO_DIR, { recursive: true });
  cli(['init']);
  cli(['project', 'add', PROJ, 'Demo MCP']);
  // Vincula REPO_DIR al proyecto: el MCP lanzado ahí lo resuelve sin project_id
  cli(['project', 'activate', PROJ, '--here'], REPO_DIR);
  client = await connect();
}, 30000);

afterAll(async () => {
  await client?.close();
  for (const dir of [TEMP_VAULT, TEMP_HOME, REPO_DIR]) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

// ── Protocolo ─────────────────────────────────────────────────────────────────

describe('mempunk mcp — protocolo', () => {
  it('tools/list expone las 8 herramientas con descripción y esquema', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.description.length).toBeLessThanOrEqual(300);
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('stdout solo contiene JSON-RPC, incluso cuando una herramienta falla', async () => {
    const child = spawn(process.execPath, [CLI_PATH, 'mcp'], { cwd: REPO_DIR, env: ENV });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });

    const send = (msg) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '0' } } });
    send({ method: 'notifications/initialized' });
    send({ id: 2, method: 'tools/list' });
    send({ id: 3, method: 'tools/call', params: { name: 'get_context', arguments: { project_id: 'no-existe' } } });

    // Espera hasta tener las 3 respuestas (o 10 s)
    const deadline = Date.now() + 10000;
    while (stdout.split('\n').filter(Boolean).length < 3 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    child.stdin.end();
    await new Promise((r) => child.on('close', r));

    const lines = stdout.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(JSON.parse(line).jsonrpc).toBe('2.0');
    }
    expect(JSON.parse(lines[2]).result.isError).toBe(true);
  }, 20000);

  it('el proceso termina limpio al cerrarse stdin', async () => {
    const child = spawn(process.execPath, [CLI_PATH, 'mcp'], { cwd: REPO_DIR, env: ENV });
    child.stdin.end();
    const code = await new Promise((r) => child.on('close', r));
    expect(code).toBe(0);
  }, 10000);
});

// ── Herramientas ──────────────────────────────────────────────────────────────

describe('mempunk mcp — herramientas', () => {
  let taskId;

  it('save_decision guarda el ADR en el proyecto del cwd', async () => {
    const res = json(await client.callTool({
      name: 'save_decision',
      arguments: { title: 'Elegir SQLite', context: 'Necesitamos local', decision: 'better-sqlite3', tags: ['db'] },
    }));
    expect(res.id).toMatch(/^dec/);
    expect(fs.readFileSync(res.file_path, 'utf8')).toContain('better-sqlite3');
  });

  it('log_session registra la sesión', async () => {
    const res = json(await client.callTool({ name: 'log_session', arguments: { summary: 'Sesión MCP', files: ['a.js'] } }));
    expect(res.id).toMatch(/^sess/);
  });

  it('backlog_add, backlog_update y backlog_list', async () => {
    const created = json(await client.callTool({ name: 'backlog_add', arguments: { title: 'Tarea MCP', priority: 1 } }));
    taskId = created.id;
    expect(created).toMatchObject({ project_id: PROJ, status: 'pending', priority: 1 });

    const updated = json(await client.callTool({ name: 'backlog_update', arguments: { id: taskId, status: 'in_progress' } }));
    expect(updated.status).toBe('in_progress');

    const listed = json(await client.callTool({ name: 'backlog_list', arguments: { status: 'in_progress' } }));
    expect(listed.map((i) => i.id)).toEqual([taskId]);
  });

  it('backlog_list devuelve lo mismo que `mempunk backlog list --json`', async () => {
    const viaMcp = json(await client.callTool({ name: 'backlog_list', arguments: { project_id: PROJ } }));
    const viaCli = JSON.parse(cli(['backlog', 'list', PROJ, '--json']).stdout);
    expect(viaMcp).toEqual(viaCli);
  });

  it('search encuentra la decisión con fragmento', async () => {
    const hits = json(await client.callTool({ name: 'search', arguments: { query: 'local' } }));
    expect(hits[0]).toMatchObject({ type: 'decision', project_id: PROJ });
    expect(hits[0].snippet).toContain('[local]');
  });

  it('update_state escribe wiki/state.md y get_context lo incluye', async () => {
    const res = json(await client.callTool({ name: 'update_state', arguments: { markdown: '# Estado\n\nMCP funcionando.' } }));
    expect(res.file_path.endsWith(path.join('wiki', 'state.md'))).toBe(true);

    const ctx = await client.callTool({ name: 'get_context', arguments: {} });
    expect(ctx.isError).toBeFalsy();
    const block = text(ctx);
    expect(block).toContain(`MEMPUNK CONTEXT — ${PROJ}`);
    expect(block).toContain('MCP funcionando.');
    expect(block).toContain('Sesión MCP');
    expect(block).toContain('Elegir SQLite');
  });

  it('get_context respeta max_chars', async () => {
    const ctx = await client.callTool({ name: 'get_context', arguments: { max_chars: 200 } });
    expect(text(ctx).length).toBeLessThanOrEqual(200);
  });

  it('devuelve isError legible con datos inválidos', async () => {
    const unknown = await client.callTool({ name: 'backlog_update', arguments: { id: 'bl_x', status: 'done' } });
    expect(unknown.isError).toBe(true);
    expect(text(unknown)).toContain('bl_x');

    const badStatus = await client.callTool({ name: 'backlog_list', arguments: { status: 'hecho' } });
    expect(badStatus.isError).toBe(true);
  });

  it('sin project_id y fuera de un repo vinculado pide el project_id', async () => {
    const outside = await connect(TEMP_HOME);
    try {
      const res = await outside.callTool({ name: 'get_context', arguments: {} });
      expect(res.isError).toBe(true);
      expect(text(res)).toContain('project_id');
    } finally {
      await outside.close();
    }
  }, 20000);
});

// ── Concurrencia y versión del vault ──────────────────────────────────────────

describe('mempunk mcp — concurrencia y versión', () => {
  it('dos procesos guardando decisiones a la vez no producen SQLITE_BUSY', async () => {
    const other = await connect();
    try {
      const N = 15;
      const save = (c, tag) => Array.from({ length: N }, (_, i) =>
        c.callTool({ name: 'save_decision', arguments: { title: `Concurrente ${tag}-${i}`, context: 'carrera', decision: 'ok' } }));
      const results = await Promise.all([...save(client, 'a'), ...save(other, 'b')]);

      const errors = results.filter((r) => r.isError).map(text);
      expect(errors).toEqual([]);
      const titles = JSON.parse(cli(['decision', 'list', PROJ, '--json']).stdout).map((d) => d.title);
      expect(titles.filter((t) => t.startsWith('Concurrente'))).toHaveLength(2 * N);
    } finally {
      await other.close();
    }
  }, 30000);

  it('con el vault desactualizado devuelve error sin migrar y sigue vivo', async () => {
    const db = new Database(path.join(TEMP_VAULT, '.mempunk', 'mempunk.db'));
    const setVersion = (v) => db.prepare("UPDATE vault_meta SET value = ? WHERE key = 'vault_version'").run(String(v));
    try {
      setVersion(VAULT_VERSION - 1);
      const res = await client.callTool({ name: 'get_context', arguments: {} });
      expect(res.isError).toBe(true);
      expect(text(res)).toContain('vault upgrade');
      expect(db.prepare("SELECT value FROM vault_meta WHERE key = 'vault_version'").get().value).toBe(String(VAULT_VERSION - 1));
    } finally {
      setVersion(VAULT_VERSION);
      db.close();
    }

    const after = await client.callTool({ name: 'get_context', arguments: {} });
    expect(after.isError).toBeFalsy();
  }, 20000);
});
