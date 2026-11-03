import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { HOOK_EVENT_MAP, HOOK_MATCHERS, HOOK_TIMEOUT_SECONDS } from '../src/commands/hooks.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const PLUGIN_ROOT  = path.join(PROJECT_ROOT, 'plugin');
const CLI_PATH     = path.join(PROJECT_ROOT, 'src', 'cli.js');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const PKG          = readJson(path.join(PROJECT_ROOT, 'package.json'));
const MANIFEST     = readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'));
const MARKETPLACE  = readJson(path.join(PROJECT_ROOT, '.claude-plugin', 'marketplace.json'));
const HOOKS_JSON   = readJson(path.join(PLUGIN_ROOT, 'hooks', 'hooks.json'));

const TMP = path.join(os.tmpdir(), `mempunk-plugin-test-${Date.now()}`);
const TEMP_VAULT = path.join(TMP, 'vault');
const TEMP_HOME  = path.join(TMP, 'home');
// Prefijo npm vacío: `npm root -g` no encuentra la instalación real del desarrollador
const EMPTY_PREFIX = path.join(TMP, 'empty-prefix');

/** Comando y args de hooks.json para un evento (el lanzador real, tal cual) */
function hookCommand(event) {
  const [{ hooks: [hook] }] = HOOKS_JSON.hooks[event];
  return hook;
}

/** Entorno mínimo: sin el PATH del desarrollador salvo node, sin MEMPUNK_CLI */
function isolatedEnv(extra = {}) {
  const env = {
    ...process.env,
    MEMPUNK_LANG: 'es',
    MEMPUNK_VAULT: TEMP_VAULT,
    HOME: TEMP_HOME,
    USERPROFILE: TEMP_HOME,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    CLAUDE_PLUGIN_DATA: path.join(TMP, `data-${Math.random().toString(36).slice(2)}`),
    NPM_CONFIG_PREFIX: EMPTY_PREFIX,
    npm_config_prefix: EMPTY_PREFIX,
    PATH: path.dirname(process.execPath),
  };
  delete env.MEMPUNK_CLI;
  delete env.MEMPUNK_CLI_JS;
  delete env.MEMPUNK_VIA_PLUGIN;
  delete env.Path; // Windows: evita un segundo PATH con el del desarrollador
  return { ...env, ...extra };
}

/** Ejecuta un hook exactamente como Claude Code: command + args de hooks.json */
function runPluginHook(event, input, env) {
  const { command, args } = hookCommand(event);
  return spawnSync(command, args, {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: TMP,
    env,
  });
}

/** Paquete mempunk falso con bundles que registran lo que ven. Layout del prefijo
 *  global de npm en Windows: <bin>/mempunk(.cmd) junto a <bin>/node_modules/mempunk. */
function makeFakeCli(name, version) {
  const binDir = path.join(TMP, name);
  const root = path.join(binDir, 'node_modules', 'mempunk');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dist', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'mempunk', version, type: 'module' }));
  const report = path.join(binDir, 'report.json');
  const writer = (what) => `import fs from 'node:fs';
fs.writeFileSync(${JSON.stringify(report)}, JSON.stringify({ what: ${JSON.stringify(what)},
  argv: process.argv.slice(2), via: process.env.MEMPUNK_VIA_PLUGIN ?? null,
  cliJs: process.env.MEMPUNK_CLI_JS ?? null, notice: process.env.MEMPUNK_PLUGIN_NOTICE ?? null }));
process.exit(0);
`;
  fs.writeFileSync(path.join(root, 'src', 'cli.js'), writer('cli'));
  for (const hook of ['on-start', 'on-tool']) {
    fs.writeFileSync(path.join(root, 'dist', 'hooks', `${hook}.js`), writer(hook));
  }
  fs.writeFileSync(path.join(binDir, 'mempunk'), '#!/bin/sh\n');
  fs.writeFileSync(path.join(binDir, 'mempunk.cmd'), '@echo off\r\n');
  return { binDir, root, report };
}

const pathWith = (dir) => [dir, path.dirname(process.execPath)].join(path.delimiter);

beforeAll(() => {
  fs.mkdirSync(path.join(TEMP_VAULT, '.mempunk'), { recursive: true });
  fs.mkdirSync(TEMP_HOME, { recursive: true });
  fs.mkdirSync(EMPTY_PREFIX, { recursive: true });
  spawnSync('node', [CLI_PATH, 'init'], {
    env: { ...process.env, MEMPUNK_VAULT: TEMP_VAULT, HOME: TEMP_HOME, USERPROFILE: TEMP_HOME },
  });
});

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ── Estructura ────────────────────────────────────────────────────────────────

describe('plugin: manifiestos', () => {
  it('el marketplace publica el plugin desde ./plugin', () => {
    expect(MARKETPLACE.name).toBe('mempunk');
    expect(MARKETPLACE.owner.name).toBeTruthy();
    expect(MARKETPLACE.plugins).toEqual([expect.objectContaining({ name: 'mempunk', source: './plugin' })]);
  });

  it('plugin.json tiene la versión de package.json', () => {
    expect(MANIFEST.name).toBe('mempunk');
    expect(MANIFEST.version).toBe(PKG.version);
  });

  it('hooks.json declara los mismos eventos, matchers y timeouts que hooks install', () => {
    const expected = Object.entries(HOOK_EVENT_MAP).map(([file, event]) => ({
      event,
      hook: file.replace(/\.js$/, ''),
      matcher: HOOK_MATCHERS[file] ?? '',
      timeout: HOOK_TIMEOUT_SECONDS[file],
    }));
    expect(Object.keys(HOOKS_JSON.hooks).sort()).toEqual(expected.map((e) => e.event).sort());
    for (const { event, hook, matcher, timeout } of expected) {
      const entries = HOOKS_JSON.hooks[event];
      expect(entries).toHaveLength(1);
      expect(entries[0].matcher).toBe(matcher);
      const cmd = hookCommand(event);
      expect(cmd.type).toBe('command');
      expect(cmd.command).toBe('node');
      expect(cmd.args.at(-1)).toBe(hook);
      expect(cmd.timeout).toBe(timeout);
      // La ruta sale de la variable de entorno, no de la expansión en args
      expect(cmd.args.join(' ')).not.toContain('${');
      expect(fs.existsSync(path.join(PROJECT_ROOT, 'dist', 'hooks', `${hook}.js`))).toBe(true);
    }
  });

  it('los agentes del plugin son copia exacta de src/agents', () => {
    const src = fs.readdirSync(path.join(PROJECT_ROOT, 'src', 'agents')).sort();
    expect(fs.readdirSync(path.join(PLUGIN_ROOT, 'agents')).sort()).toEqual(src);
    for (const file of src) {
      expect(fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', file), 'utf8'))
        .toBe(fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'agents', file), 'utf8'));
    }
  });

  it('los skills load y end tienen description; end solo a petición del usuario', () => {
    const load = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'load', 'SKILL.md'), 'utf8');
    const end = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'end', 'SKILL.md'), 'utf8');
    // \r?: el checkout de Windows (autocrlf) deja CRLF
    expect(load).toMatch(/^---\r?\ndescription: .+/);
    expect(end).toMatch(/^---\r?\ndescription: .+/);
    expect(end).toMatch(/disable-model-invocation: true/);
  });

  it('.mcp.json lanza el servidor por run.cjs', () => {
    const mcp = readJson(path.join(PLUGIN_ROOT, '.mcp.json'));
    expect(mcp.mcpServers.mempunk).toEqual({ command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/run.cjs', 'mcp'] });
  });
});

// ── Lanzador run.cjs ──────────────────────────────────────────────────────────

describe('plugin: run.cjs', () => {
  it('con MEMPUNK_CLI ejecuta el bundle real del repo (on-tool registra el archivo)', () => {
    const env = isolatedEnv({ MEMPUNK_CLI: `node ${CLI_PATH}` });
    const r = runPluginHook('PostToolUse', {
      session_id: 'plugin-sess', hook_event_name: 'PostToolUse', cwd: TMP,
      tool_name: 'Edit', tool_input: { file_path: path.join(TMP, 'src', 'a.js') },
    }, env);
    expect(r.status).toBe(0);
    const state = readJson(path.join(TEMP_VAULT, '.mempunk', 'sessions', 'plugin-sess.json'));
    expect(state.files_touched).toEqual(['src/a.js']);
  });

  it('localiza el CLI por el PATH, lo cachea y carga el bundle en el mismo proceso', () => {
    const fake = makeFakeCli('fake-path', PKG.version);
    const env = isolatedEnv({ PATH: pathWith(fake.binDir) });
    const r = runPluginHook('PostToolUse', { session_id: 's' }, env);
    expect(r.status).toBe(0);
    const report = readJson(fake.report);
    expect(report.what).toBe('on-tool');
    expect(report.via).toBe('1');
    expect(report.cliJs).toBe(path.join(fake.root, 'src', 'cli.js'));
    expect(readJson(path.join(env.CLAUDE_PLUGIN_DATA, 'cli-root.json')).root).toBe(fake.root);

    // Segunda ejecución: sin el CLI en el PATH, la caché basta
    fs.rmSync(fake.report);
    const r2 = runPluginHook('PostToolUse', { session_id: 's' }, { ...env, PATH: path.dirname(process.execPath) });
    expect(r2.status).toBe(0);
    expect(readJson(fake.report).what).toBe('on-tool');
  });

  it('SessionStart renueva una caché que ya no apunta a un paquete mempunk', () => {
    const fake = makeFakeCli('fake-stale', PKG.version);
    const env = isolatedEnv({ PATH: pathWith(fake.binDir) });
    fs.mkdirSync(env.CLAUDE_PLUGIN_DATA, { recursive: true });
    fs.writeFileSync(path.join(env.CLAUDE_PLUGIN_DATA, 'cli-root.json'), JSON.stringify({ root: path.join(TMP, 'nada') }));

    // Los hooks frecuentes confían en la caché: no buscan de nuevo
    runPluginHook('PostToolUse', { session_id: 's' }, env);
    expect(fs.existsSync(fake.report)).toBe(false);

    runPluginHook('SessionStart', { session_id: 's', source: 'startup' }, env);
    expect(readJson(fake.report).what).toBe('on-start');
    expect(readJson(path.join(env.CLAUDE_PLUGIN_DATA, 'cli-root.json')).root).toBe(fake.root);
  });

  it('sin CLI: SessionStart avisa, cachea la ausencia y los demás hooks salen con 0 sin buscar', () => {
    const env = isolatedEnv();
    const start = runPluginHook('SessionStart', { session_id: 's', source: 'startup' }, env);
    expect(start.status).toBe(0);
    const out = JSON.parse(start.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.additionalContext).toMatch(/npm install -g mempunk/);
    expect(readJson(path.join(env.CLAUDE_PLUGIN_DATA, 'cli-root.json'))).toEqual({ root: null });

    // Aunque ahora haya un CLI en el PATH, hasta el próximo SessionStart vale la caché
    const fake = makeFakeCli('fake-late', PKG.version);
    const tool = runPluginHook('PostToolUse', { session_id: 's' }, { ...env, PATH: pathWith(fake.binDir) });
    expect(tool.status).toBe(0);
    expect(tool.stdout).toBe('');
    expect(fs.existsSync(fake.report)).toBe(false);
  });

  it('MEMPUNK_CLI que no resuelve no cae a otra instalación', () => {
    const fake = makeFakeCli('fake-env', PKG.version);
    const env = isolatedEnv({ PATH: pathWith(fake.binDir), MEMPUNK_CLI: 'node /no/existe/src/cli.js' });
    const r = runPluginHook('SessionStart', { session_id: 's', source: 'startup' }, env);
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toMatch(/npm install -g mempunk/);
    expect(fs.existsSync(fake.report)).toBe(false);
  });

  it('ignora el mempunk de node_modules/.bin de un proyecto', () => {
    const fake = makeFakeCli(path.join('proj', 'node_modules', '.bin'), PKG.version);
    const env = isolatedEnv({ PATH: pathWith(fake.binDir) });
    runPluginHook('PostToolUse', { session_id: 's' }, env);
    expect(fs.existsSync(fake.report)).toBe(false);
  });

  it('SessionStart encuentra el CLI con npm root -g cuando no está en el PATH', () => {
    const prefix = path.join(TMP, 'npm-prefix');
    const globalDir = process.platform === 'win32' ? prefix : path.join(prefix, 'lib');
    const fake = makeFakeCli('fake-npm', PKG.version);
    fs.mkdirSync(path.join(globalDir, 'node_modules'), { recursive: true });
    fs.cpSync(fake.root, path.join(globalDir, 'node_modules', 'mempunk'), { recursive: true });
    const env = isolatedEnv({ NPM_CONFIG_PREFIX: prefix, npm_config_prefix: prefix });
    runPluginHook('SessionStart', { session_id: 's', source: 'startup' }, env);
    expect(readJson(fake.report).what).toBe('on-start');
    expect(readJson(path.join(env.CLAUDE_PLUGIN_DATA, 'cli-root.json')).root)
      .toBe(path.join(globalDir, 'node_modules', 'mempunk'));
  });

  (process.platform === 'win32' ? it.skip : it)('Unix: sigue el symlink de <prefix>/bin/mempunk hasta lib/node_modules', () => {
    const prefix = path.join(TMP, 'unix-prefix');
    const fake = makeFakeCli('fake-unix', PKG.version);
    const root = path.join(prefix, 'lib', 'node_modules', 'mempunk');
    fs.mkdirSync(path.dirname(root), { recursive: true });
    fs.cpSync(fake.root, root, { recursive: true });
    fs.mkdirSync(path.join(prefix, 'bin'), { recursive: true });
    fs.symlinkSync(path.join(root, 'src', 'cli.js'), path.join(prefix, 'bin', 'mempunk'));
    const env = isolatedEnv({ PATH: pathWith(path.join(prefix, 'bin')) });
    runPluginHook('PostToolUse', { session_id: 's' }, env);
    expect(readJson(fake.report).what).toBe('on-tool');
    // realpath: en macOS el tmpdir (/var/…) es un symlink a /private/var/…
    expect(readJson(path.join(env.CLAUDE_PLUGIN_DATA, 'cli-root.json')).root).toBe(fs.realpathSync(root));
  });

  it('un bundle que no carga deja la causa en hooks.log y sale con 0', () => {
    const fake = makeFakeCli('fake-broken', PKG.version);
    fs.writeFileSync(path.join(fake.root, 'dist', 'hooks', 'on-tool.js'), 'export const = ;');
    const r = runPluginHook('PostToolUse', { session_id: 's' }, isolatedEnv({ PATH: pathWith(fake.binDir) }));
    expect(r.status).toBe(0);
    const logText = fs.readFileSync(path.join(TEMP_VAULT, '.mempunk', 'hooks.log'), 'utf8');
    expect(logText).toMatch(/\[plugin\] on-tool: no se pudo cargar el hook/);
  });

  it('mcp: si el CLI no carga, sale con 1 y explica el error por stderr', () => {
    const fake = makeFakeCli('fake-mcp-broken', PKG.version);
    fs.writeFileSync(path.join(fake.root, 'src', 'cli.js'), 'throw new Error("boom de prueba");');
    const r = spawnSync('node', [path.join(PLUGIN_ROOT, 'scripts', 'run.cjs'), 'mcp'], {
      encoding: 'utf8', env: isolatedEnv({ PATH: pathWith(fake.binDir) }),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/mempunk mcp: .*boom de prueba/);
  });

  it('CLI más antiguo que el plugin: SessionStart recibe el aviso de actualizar', () => {
    const fake = makeFakeCli('fake-old', '0.0.1');
    const env = isolatedEnv({ PATH: pathWith(fake.binDir) });
    runPluginHook('SessionStart', { session_id: 's', source: 'startup' }, env);
    const report = readJson(fake.report);
    expect(report.what).toBe('on-start');
    expect(report.notice).toMatch(/0\.0\.1.*más antiguo/);
  });

  it('un hook que el CLI instalado no trae sale con 0 sin hacer nada', () => {
    const fake = makeFakeCli('fake-partial', PKG.version);
    const env = isolatedEnv({ PATH: pathWith(fake.binDir) });
    const r = runPluginHook('Stop', { session_id: 's' }, env);
    expect(r.status).toBe(0);
    expect(fs.existsSync(fake.report)).toBe(false);
  });

  it('mcp carga src/cli.js del CLI instalado con el argumento mcp', () => {
    const fake = makeFakeCli('fake-mcp', PKG.version);
    const r = spawnSync('node', [path.join(PLUGIN_ROOT, 'scripts', 'run.cjs'), 'mcp'], {
      encoding: 'utf8', env: isolatedEnv({ PATH: pathWith(fake.binDir) }),
    });
    expect(r.status).toBe(0);
    expect(readJson(fake.report)).toEqual(expect.objectContaining({ what: 'cli', argv: ['mcp'] }));
  });

  it('en el plugin, el aviso de auto-start nombra /mempunk:load', () => {
    fs.writeFileSync(path.join(TEMP_VAULT, '.mempunk', 'auto-start.flag'), '');
    try {
      const env = isolatedEnv({ MEMPUNK_CLI: `node ${CLI_PATH}` });
      const r = runPluginHook('SessionStart', { session_id: 's', source: 'startup', cwd: TMP }, env);
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toMatch(/\/mempunk:load/);
    } finally {
      fs.rmSync(path.join(TEMP_VAULT, '.mempunk', 'auto-start.flag'));
    }
  });
});
