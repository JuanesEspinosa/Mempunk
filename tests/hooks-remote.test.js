import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const CLI_PATH     = path.join(PROJECT_ROOT, 'src', 'cli.js');

// Vault temporal aislado + HOME temporal (hooks install escribe en ~/.claude)
const STAMP        = Date.now();
const TEMP_VAULT   = path.join(os.tmpdir(), `mempunk-hooks-remote-${STAMP}`);
const MEMPUNK_DIR  = path.join(TEMP_VAULT, '.mempunk');
const REMOTE_FILE  = path.join(MEMPUNK_DIR, 'remote.json');
const PATHS_FILE   = path.join(MEMPUNK_DIR, 'project-paths.json');
const LOG_FILE     = path.join(MEMPUNK_DIR, 'hooks.log');
const LAST_PUSH    = path.join(MEMPUNK_DIR, 'last-push.json');
const TEMP_HOME    = path.join(os.tmpdir(), `mempunk-hooks-remote-home-${STAMP}`);
const ISOLATED_ENV = { HOME: TEMP_HOME, USERPROFILE: TEMP_HOME };

// CLI falso: registra argv en calls.log y sale con FAKE_CLI_EXIT (default 0).
// FAKE_CLI_SLEEP_MS simula un CLI colgado (tests de timeout).
// Los hooks NO deben depender del CLI real de push/pull para estos tests.
const FAKE_CLI     = path.join(TEMP_VAULT, 'fake-cli.mjs');
const CALLS_LOG    = path.join(TEMP_VAULT, 'calls.log');
const FAKE_CLI_SRC = `
import fs from 'node:fs';
fs.appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
// El hook borra el temporal al volver: se guarda una copia para inspeccionarla
if (process.argv[3] === 'save-auto') fs.copyFileSync(process.argv[4], process.env.FAKE_CLI_LOG + '.payload');
const sleepMs = parseInt(process.env.FAKE_CLI_SLEEP_MS ?? '0', 10);
if (sleepMs > 0) await new Promise((resolve) => setTimeout(resolve, sleepMs));
const code = parseInt(process.env.FAKE_CLI_EXIT ?? '0', 10);
if (code !== 0) process.stderr.write(process.env.FAKE_CLI_STDERR ?? 'fake failure');
else process.stdout.write('pushed to origin/main\\n');
process.exit(code);
`;

function runHook(hookFile, input, extraEnv = {}) {
  return spawnSync('node', [path.join(PROJECT_ROOT, 'dist', 'hooks', hookFile)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      MEMPUNK_LANG: 'en',
      MEMPUNK_VAULT: TEMP_VAULT,
      MEMPUNK_CLI: `node ${FAKE_CLI}`,
      FAKE_CLI_LOG: CALLS_LOG,
      CLAUDE_PROJECT_ID: '',
      // Sin esto, un plugin instalado en la máquina desactiva estos hooks manuales
      ...ISOLATED_ENV,
      CLAUDE_CONFIG_DIR: '',
      CLAUDE_PROJECT_DIR: '',
      ...extraEnv,
    },
  });
}

function runRealCli(args) {
  return spawnSync('node', [CLI_PATH, ...args.split(' ')], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, MEMPUNK_LANG: 'es', MEMPUNK_VAULT: TEMP_VAULT, ...ISOLATED_ENV },
    encoding: 'utf8',
  });
}

function readCalls() {
  if (!fs.existsSync(CALLS_LOG)) return [];
  return fs.readFileSync(CALLS_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** El push de on-end va desacoplado: espera a que el CLI falso registre `count` llamadas */
async function waitForCalls(count, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (readCalls().length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return readCalls();
}

const BG_PUSH = ['push', '--background', '-m', 'auto-push on session end'];

/** Solo las llamadas de sync (on-start también invoca materialize) */
function syncCalls() {
  return readCalls().filter((c) => c[0] === 'pull' || c[0] === 'push');
}

function writeRemote(auto) {
  fs.writeFileSync(REMOTE_FILE, JSON.stringify({
    url: 'https://example.invalid/vault.git', branch: 'main', auto, created_at: new Date().toISOString(),
  }));
}

/** Misma normalización que common.js normalizePathForMatch */
function normalizeForMap(p) {
  let resolved = path.resolve(p);
  try { resolved = fs.realpathSync(resolved); } catch (_) {}
  let n = resolved.replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') n = n.toLowerCase();
  return n;
}

function readLog() {
  return fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '';
}

beforeAll(() => {
  fs.mkdirSync(MEMPUNK_DIR, { recursive: true });
  fs.mkdirSync(TEMP_HOME, { recursive: true });
  fs.writeFileSync(FAKE_CLI, FAKE_CLI_SRC);
});

afterAll(() => {
  fs.rmSync(TEMP_VAULT, { recursive: true, force: true });
  fs.rmSync(TEMP_HOME,  { recursive: true, force: true });
});

beforeEach(() => {
  for (const f of [CALLS_LOG, `${CALLS_LOG}.payload`, REMOTE_FILE, PATHS_FILE, LOG_FILE, LAST_PUSH]) fs.rmSync(f, { force: true });
});

// ── on-end.js ─────────────────────────────────────────────────────────────────

describe('on-end.js (SessionEnd auto-push)', () => {
  it('no llama al CLI y sale 0 sin remote.json', () => {
    const r = runHook('on-end.js', { session_id: 's1', cwd: PROJECT_ROOT, reason: 'exit' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(readCalls()).toEqual([]);
  });

  it('no llama al CLI cuando push_on_end es false', () => {
    writeRemote({ pull_on_start: true, push_on_end: false });
    const r = runHook('on-end.js', { session_id: 's2', cwd: PROJECT_ROOT });
    expect(r.status).toBe(0);
    expect(readCalls()).toEqual([]);
  });

  it('lanza push --background con --project cuando el cwd está mapeado en project-paths.json', async () => {
    writeRemote({ pull_on_start: false, push_on_end: true });
    fs.writeFileSync(PATHS_FILE, JSON.stringify({ [normalizeForMap(PROJECT_ROOT)]: 'mapped-proj' }));
    const r = runHook('on-end.js', { session_id: 's3', cwd: PROJECT_ROOT });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(await waitForCalls(1)).toEqual([[...BG_PUSH, '--project', 'mapped-proj']]);
  });

  it('lanza push --background sin --project cuando no hay mapeo ni proyecto activo', async () => {
    writeRemote({ pull_on_start: false, push_on_end: true });
    const r = runHook('on-end.js', { session_id: 's4', cwd: path.join(os.tmpdir(), `nomap-${STAMP}`) });
    expect(r.status).toBe(0);
    expect(await waitForCalls(1)).toEqual([BG_PUSH]);
  });

  it('sale sin esperar al push: un CLI de 4 s no retrasa el hook', async () => {
    writeRemote({ pull_on_start: false, push_on_end: true });
    const started = Date.now();
    const r = runHook('on-end.js', { session_id: 's5', cwd: PROJECT_ROOT }, { FAKE_CLI_SLEEP_MS: '4000' });
    const elapsed = Date.now() - started;
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(elapsed).toBeLessThan(3000);
    expect(readLog()).toContain('Push en segundo plano lanzado');
    // El proceso desacoplado sigue vivo y termina por su cuenta
    expect(await waitForCalls(1)).toEqual([BG_PUSH]);
  });

  it('registra la sesión (save-auto) antes del push cuando hay estado de sesión', async () => {
    writeRemote({ pull_on_start: false, push_on_end: true });
    fs.writeFileSync(PATHS_FILE, JSON.stringify({ [normalizeForMap(PROJECT_ROOT)]: 'mapped-proj' }));
    const sessionsDir = path.join(MEMPUNK_DIR, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'auto1.json'), JSON.stringify({
      started_at: '2026-01-01T10:00:00.000Z',
      turns: 2,
      first_prompt: 'arregla el bug',
      files_touched: ['src/a.js'],
      recent_messages: [{ role: 'user', text: 'arregla el bug' }, { role: 'assistant', text: 'listo, corregido' }],
    }));

    const r = runHook('on-end.js', { session_id: 'auto1', cwd: PROJECT_ROOT, reason: 'prompt_input_exit' });
    expect(r.status).toBe(0);
    const calls = await waitForCalls(2);
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 2)).toEqual(['session', 'save-auto']);
    expect(calls[1][0]).toBe('push');

    // El hook borra el temporal aunque el CLI no lo haga; la copia del CLI falso muestra lo recibido
    expect(fs.existsSync(calls[0][2])).toBe(false);
    const payload = JSON.parse(fs.readFileSync(`${CALLS_LOG}.payload`, 'utf8'));
    expect(payload).toMatchObject({
      project_id: 'mapped-proj',
      files_touched: ['src/a.js'],
      since: '2026-01-01T10:00:00.000Z',
    });
    expect(payload.summary).toContain('arregla el bug');
    expect(payload.summary).toContain('listo, corregido');
  });

  it('si save-auto falla, sale 0, borra el temporal, lo registra en hooks.log y sigue con el push', async () => {
    writeRemote({ pull_on_start: false, push_on_end: true });
    const sessionsDir = path.join(MEMPUNK_DIR, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'auto2.json'), JSON.stringify({
      project_id: 'state-proj', started_at: '2026-01-01T10:00:00.000Z', turns: 1, first_prompt: 'hola',
    }));

    const r = runHook('on-end.js', { session_id: 'auto2', cwd: path.join(os.tmpdir(), `nomap-${STAMP}`) },
      { FAKE_CLI_EXIT: '1', FAKE_CLI_STDERR: 'Vault desactualizado' });
    expect(r.status).toBe(0);
    const calls = await waitForCalls(2);
    expect(calls.map((c) => c[0])).toEqual(['session', 'push']);
    expect(fs.existsSync(calls[0][2])).toBe(false);
    expect(JSON.parse(fs.readFileSync(`${CALLS_LOG}.payload`, 'utf8')).project_id).toBe('state-proj');
    expect(readLog()).toContain('Registro automático falló');
    expect(readLog()).toContain('Vault desactualizado');
  });

  it('no registra la sesión si no hay estado (sesión sin prompts)', async () => {
    writeRemote({ pull_on_start: false, push_on_end: true });
    const r = runHook('on-end.js', { session_id: 'sin-estado', cwd: PROJECT_ROOT });
    expect(r.status).toBe(0);
    expect((await waitForCalls(1)).map((c) => c[0])).toEqual(['push']);
  });

  it('omite --project (y lo registra) cuando el id mapeado no es un identificador válido', async () => {
    writeRemote({ pull_on_start: false, push_on_end: true });
    fs.writeFileSync(PATHS_FILE, JSON.stringify({ [normalizeForMap(PROJECT_ROOT)]: 'bad id;rm' }));
    const r = runHook('on-end.js', { session_id: 's5b', cwd: PROJECT_ROOT });
    expect(r.status).toBe(0);
    expect(await waitForCalls(1)).toEqual([BG_PUSH]);
    expect(readLog()).toContain('bad id;rm');
  });
});

// ── on-start.js ───────────────────────────────────────────────────────────────

describe('on-start.js (SessionStart auto-pull)', () => {
  it('llama pull en startup cuando pull_on_start es true y emite JSON válido', () => {
    writeRemote({ pull_on_start: true, push_on_end: false });
    const r = runHook('on-start.js', { session_id: 's6', source: 'startup', cwd: PROJECT_ROOT });
    expect(r.status).toBe(0);
    expect(syncCalls()).toEqual([['pull']]);
    expect(JSON.parse(r.stdout)).toEqual({});
  });

  it('no llama pull cuando pull_on_start es false', () => {
    writeRemote({ pull_on_start: false, push_on_end: false });
    const r = runHook('on-start.js', { session_id: 's7', source: 'startup', cwd: PROJECT_ROOT });
    expect(r.status).toBe(0);
    expect(syncCalls()).toEqual([]);
    expect(JSON.parse(r.stdout)).toEqual({});
  });

  it('no llama pull cuando source=compact', () => {
    writeRemote({ pull_on_start: true, push_on_end: false });
    const r = runHook('on-start.js', { session_id: 's8', source: 'compact', cwd: PROJECT_ROOT });
    expect(r.status).toBe(0);
    expect(readCalls().some((c) => c[0] === 'pull')).toBe(false);
  });

  it('no llama pull sin remote.json', () => {
    const r = runHook('on-start.js', { session_id: 's9', source: 'startup', cwd: PROJECT_ROOT });
    expect(r.status).toBe(0);
    expect(syncCalls()).toEqual([]);
  });

  it('ejecuta materialize después del pull (no en compact)', () => {
    writeRemote({ pull_on_start: true, push_on_end: false });
    runHook('on-start.js', { session_id: 's9b', source: 'startup', cwd: PROJECT_ROOT });
    expect(readCalls()).toEqual([['pull'], ['materialize', '--json']]);

    fs.rmSync(CALLS_LOG, { force: true });
    runHook('on-start.js', { session_id: 's9c', source: 'compact', cwd: PROJECT_ROOT });
    expect(readCalls().some((c) => c[0] === 'materialize')).toBe(false);
  });

  it('inyecta un aviso fijo con "mempunk pull" (sin stderr crudo) cuando el pull falla', () => {
    writeRemote({ pull_on_start: true, push_on_end: false });
    const r = runHook('on-start.js', { session_id: 's10', source: 'startup', cwd: PROJECT_ROOT },
      { FAKE_CLI_EXIT: '1', FAKE_CLI_STDERR: 'weird failure\nsecond line' });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.additionalContext).toContain('mempunk pull');
    expect(out.hookSpecificOutput.additionalContext).not.toContain('weird failure');
    expect(out.hookSpecificOutput.additionalContext).not.toContain('second line');
    expect(readLog()).toContain('weird failure');
  });

  it('clasifica el fallo de red y no filtra el stderr de git al contexto', () => {
    writeRemote({ pull_on_start: true, push_on_end: false });
    const r = runHook('on-start.js', { session_id: 's10b', source: 'startup', cwd: PROJECT_ROOT },
      { FAKE_CLI_EXIT: '1', FAKE_CLI_STDERR: "fatal: unable to access 'https://x/': Could not resolve host" });
    expect(r.status).toBe(0);
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    expect(ctx).toContain('(network)');
    expect(ctx).toContain('mempunk pull');
    expect(ctx).not.toContain('unable to access');
    expect(readLog()).toContain('unable to access');
  });

  it('mata el pull colgado al vencer MEMPUNK_HOOK_TIMEOUT_MS y avisa del timeout', () => {
    writeRemote({ pull_on_start: true, push_on_end: false });
    const started = Date.now();
    const r = runHook('on-start.js', { session_id: 's10c', source: 'startup', cwd: PROJECT_ROOT },
      { FAKE_CLI_SLEEP_MS: '8000', MEMPUNK_HOOK_TIMEOUT_MS: '500' });
    const elapsed = Date.now() - started;
    expect(r.status).toBe(0);
    expect(elapsed).toBeLessThan(5000);
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    expect(ctx).toContain('timed out');
    expect(ctx).toContain('mempunk pull');
    expect(readLog()).toContain('timeout');
  });

  it('añade el aviso de pull fallido al contexto de auto-start sin perderlo', () => {
    writeRemote({ pull_on_start: true, push_on_end: false });
    const flag = path.join(MEMPUNK_DIR, 'auto-start.flag');
    fs.writeFileSync(flag, '');
    const r = runHook('on-start.js', { session_id: 's11', source: 'startup', cwd: PROJECT_ROOT },
      // Con proyecto declarado, el CLI falso también hace fallar `context` → aviso de /mempunk
      { FAKE_CLI_EXIT: '1', FAKE_CLI_STDERR: 'network down', CLAUDE_PROJECT_ID: 'remoteproj' });
    fs.rmSync(flag, { force: true });
    expect(r.status).toBe(0);
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    expect(ctx).toContain('Could not load the Mempunk context');
    expect(ctx).toContain('mempunk pull');
  });

  it('avisa la clase "locked" si el pull choca con el lock de otra sincronización', () => {
    writeRemote({ pull_on_start: true, push_on_end: false });
    const r = runHook('on-start.js', { session_id: 's11b', source: 'startup', cwd: PROJECT_ROOT },
      { FAKE_CLI_EXIT: '1', FAKE_CLI_STDERR: 'Error: Hay otra sincronización (pid 1). Borra /v/.mempunk/push.lock' });
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    expect(ctx).toContain('another sync');
    expect(ctx).not.toContain('push.lock');
  });
});

describe('on-start.js (aviso de push en segundo plano fallido)', () => {
  function writeLastPush(fields) {
    fs.writeFileSync(LAST_PUSH, JSON.stringify({
      at: '2026-11-02T10:00:00.000Z', ok: false, status: 1, signal: null, error_code: null,
      stderr: '', notified: false, ...fields,
    }));
  }

  const contextOf = (r) => JSON.parse(r.stdout).hookSpecificOutput?.additionalContext ?? '';

  it('avisa una sola vez con la clase del fallo, sin el stderr guardado', () => {
    writeLastPush({ stderr: "fatal: unable to access 'https://x/': Could not resolve host" });

    const first = runHook('on-start.js', { session_id: 'p1', source: 'startup', cwd: PROJECT_ROOT });
    expect(first.status).toBe(0);
    const ctx = contextOf(first);
    expect(ctx).toContain('automatic vault push');
    expect(ctx).toContain('(network)');
    expect(ctx).toContain('mempunk push');
    expect(ctx).not.toContain('unable to access');
    expect(JSON.parse(fs.readFileSync(LAST_PUSH, 'utf8')).notified).toBe(true);

    const second = runHook('on-start.js', { session_id: 'p2', source: 'startup', cwd: PROJECT_ROOT });
    expect(contextOf(second)).not.toContain('automatic vault push');
  });

  it('clasifica el timeout del push hijo (SIGKILL / ETIMEDOUT)', () => {
    writeLastPush({ status: null, signal: 'SIGKILL', error_code: 'ETIMEDOUT' });
    const ctx = contextOf(runHook('on-start.js', { session_id: 'p3', source: 'startup', cwd: PROJECT_ROOT }));
    expect(ctx).toContain('timed out');
    expect(ctx).toContain('mempunk push');
  });

  it('no avisa si el último push fue bien, ni en source=compact', () => {
    writeLastPush({ ok: true, status: 0 });
    expect(contextOf(runHook('on-start.js', { session_id: 'p4', source: 'startup', cwd: PROJECT_ROOT })))
      .not.toContain('automatic vault push');

    writeLastPush({ stderr: 'fake' });
    runHook('on-start.js', { session_id: 'p5', source: 'compact', cwd: PROJECT_ROOT });
    expect(JSON.parse(fs.readFileSync(LAST_PUSH, 'utf8')).notified).toBe(false);
  });

  it('push provisional (ok: null): avisa "did not finish" si su proceso murió, nada si sigue vivo', () => {
    writeLastPush({ ok: null, pid: process.pid });
    expect(contextOf(runHook('on-start.js', { session_id: 'p7', source: 'startup', cwd: PROJECT_ROOT })))
      .not.toContain('automatic vault push');

    writeLastPush({ ok: null, pid: 2 ** 31 - 2 });
    const ctx = contextOf(runHook('on-start.js', { session_id: 'p8', source: 'startup', cwd: PROJECT_ROOT }));
    expect(ctx).toContain('did not finish');
    expect(ctx).toContain('mempunk push');
  });

  it('un last-push.json corrupto no rompe el arranque', () => {
    fs.writeFileSync(LAST_PUSH, '{ a medias');
    const r = runHook('on-start.js', { session_id: 'p6', source: 'startup', cwd: PROJECT_ROOT });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
  });
});

// ── hooks install / uninstall / --check ───────────────────────────────────────

describe('hooks install incluye on-end.js y mempunk-syncer.md', () => {
  const hooksDir    = path.join(TEMP_HOME, '.claude', 'hooks');
  const agentsDir   = path.join(TEMP_HOME, '.claude', 'agents');
  const settingsFile = path.join(TEMP_HOME, '.claude', 'settings.json');

  beforeAll(() => {
    runRealCli('init');
  });

  it('copia on-end.js, registra SessionEnd y copia mempunk-syncer.md', () => {
    const r = runRealCli('hooks install');
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(hooksDir, 'on-end.js'))).toBe(true);
    expect(fs.existsSync(path.join(agentsDir, 'mempunk-syncer.md'))).toBe(true);
    expect(fs.readFileSync(path.join(agentsDir, 'mempunk-syncer.md'), 'utf8')).toContain('# mempunk-agent');

    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    const cmds = settings.hooks.SessionEnd.flatMap((g) => g.hooks.map((h) => h.command));
    expect(cmds.some((c) => c.includes('on-end.js'))).toBe(true);
  });

  it('registra SessionStart y SessionEnd con timeout 90 (SessionStart) y 60 (SessionEnd) y deja los demás hooks sin timeout', () => {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    const hookFor = (event, file) => settings.hooks[event]
      .flatMap((g) => g.hooks)
      .find((h) => h.type === 'command' && h.command.includes(file));
    expect(hookFor('SessionStart', 'on-start.js').timeout).toBe(90);
    expect(hookFor('SessionEnd', 'on-end.js').timeout).toBe(60);
    expect(hookFor('Stop', 'on-stop.js').timeout).toBeUndefined();
    expect(hookFor('PreCompact', 'on-compact.js').timeout).toBeUndefined();
    expect(hookFor('UserPromptSubmit', 'on-prompt.js').timeout).toBeUndefined();
  });

  it('--check lista on-end.js, SessionEnd y mempunk-syncer.md', () => {
    const r = runRealCli('hooks install --check');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/✓ on-end\.js/);
    expect(r.stdout).toMatch(/✓ SessionEnd → on-end\.js/);
    expect(r.stdout).toMatch(/✓ mempunk-syncer\.md/);
  });

  it('uninstall elimina on-end.js, mempunk-syncer.md y el registro SessionEnd', () => {
    const r = runRealCli('hooks uninstall');
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(hooksDir, 'on-end.js'))).toBe(false);
    expect(fs.existsSync(path.join(agentsDir, 'mempunk-syncer.md'))).toBe(false);
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    expect(settings.hooks?.SessionEnd).toBeUndefined();
  });
});

// ── mempunk-syncer.md ─────────────────────────────────────────────────────────

describe('src/agents/mempunk-syncer.md', () => {
  it('pasa el resumen por stdin con heredoc citado y nunca por -m en la línea de comandos', () => {
    const agent = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'agents', 'mempunk-syncer.md'), 'utf8');
    expect(agent).toContain('--message-stdin');
    expect(agent).toContain("<<'MEMPUNK_EOF'");
    expect(agent).not.toContain('-m "');
    expect(agent).toContain('invalid project id');
  });
});

// ── build ─────────────────────────────────────────────────────────────────────

describe('dist/hooks/on-end.js', () => {
  it('existe tras npm run build y lleva el banner # mempunk-hook', () => {
    const bundle = path.join(PROJECT_ROOT, 'dist', 'hooks', 'on-end.js');
    expect(fs.existsSync(bundle)).toBe(true);
    const head = fs.readFileSync(bundle, 'utf8').split('\n').slice(0, 3).join('\n');
    expect(head).toContain('# mempunk-hook');
  });
});
