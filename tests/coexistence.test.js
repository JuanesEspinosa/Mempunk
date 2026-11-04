import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Convivencia de los hooks manuales con el plugin (D5, D6 de specs/phase-2-plugin/design.md)

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_PATH = path.join(PROJECT_ROOT, 'src', 'cli.js');

const BASE = path.join(os.tmpdir(), `mempunk-coexist-${Date.now()}`);
const VAULT = path.join(BASE, 'vault');
const HOME = path.join(BASE, 'home');
const REPO = path.join(BASE, 'repo');
const CLAUDE_DIR = path.join(HOME, '.claude');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
const AGENTS_DIR = path.join(CLAUDE_DIR, 'agents');
const STATUSLINE = path.join(HOME, '.mempunk', 'statusline.js');
const THIRD_PARTY = { matcher: '', hooks: [{ type: 'command', command: 'node /otro/hook.js' }] };

/** Ejecuta el CLI con vault, home y cwd temporales. Nunca toca la instalación real. */
function cli(args, extraEnv = {}) {
  const r = spawnSync('node', [CLI_PATH, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: {
      ...process.env, MEMPUNK_LANG: 'es', MEMPUNK_VAULT: VAULT,
      HOME, USERPROFILE: HOME, CLAUDE_CONFIG_DIR: '', CLAUDE_PROJECT_DIR: '', ...extraEnv,
    },
  });
  return { ...r, out: `${r.stdout}${r.stderr}` };
}

const readSettings = () => JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));

function mergeSettings(patch) {
  const current = fs.existsSync(SETTINGS) ? readSettings() : {};
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify({ ...current, ...patch }));
}

/** Lo que deja `claude plugin install` (formato comprobado con Claude Code 2.1.296). */
function writeInstalled(userDir) {
  fs.mkdirSync(path.join(userDir, 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(userDir, 'plugins', 'installed_plugins.json'), JSON.stringify({
    version: 2,
    plugins: { 'mempunk@mempunk': [{ scope: 'user', installPath: '/x', version: '2.5.0' }] },
  }));
}

function enablePlugin() {
  mergeSettings({ enabledPlugins: { 'mempunk@mempunk': true } });
  writeInstalled(CLAUDE_DIR);
}

/** Registros de Mempunk que quedan en settings.json. */
function mempunkEntries() {
  const groups = Object.values(readSettings().hooks ?? {}).flat();
  return groups.filter((g) => g.hooks?.some((h) => h.command?.includes('.claude/hooks/on-')));
}

const installedHooks = () => (fs.existsSync(HOOKS_DIR) ? fs.readdirSync(HOOKS_DIR).filter((f) => f.startsWith('on-')) : []);
const installedAgents = () => (fs.existsSync(AGENTS_DIR) ? fs.readdirSync(AGENTS_DIR).filter((f) => f.startsWith('mempunk-')) : []);

beforeAll(() => {
  fs.mkdirSync(HOME, { recursive: true });
  fs.mkdirSync(REPO, { recursive: true });
  cli(['init']);
});

beforeEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
  fs.mkdirSync(HOME, { recursive: true });
});

afterAll(() => fs.rmSync(BASE, { recursive: true, force: true }));

describe('mempunk hooks migrate', () => {
  it('quita hooks y agentes manuales, deja los ajenos y la statusline', () => {
    cli(['hooks', 'install']);
    const statusLine = readSettings().statusLine;
    const settings = readSettings();
    mergeSettings({ hooks: { ...settings.hooks, Stop: [...settings.hooks.Stop, THIRD_PARTY] } });
    fs.writeFileSync(path.join(HOOKS_DIR, 'mio.js'), '// hook del usuario\n');

    const r = cli(['hooks', 'migrate']);

    expect(r.status).toBe(0);
    expect(installedHooks()).toEqual([]);
    expect(installedAgents()).toEqual([]);
    expect(mempunkEntries()).toEqual([]);
    expect(fs.existsSync(path.join(HOOKS_DIR, 'mio.js'))).toBe(true);
    expect(readSettings().hooks.Stop).toEqual([THIRD_PARTY]);
    expect(readSettings().statusLine).toEqual(statusLine);
    expect(fs.existsSync(STATUSLINE)).toBe(true);
  });

  it('un hook del usuario con el mismo nombre pero sin marcador no se borra', () => {
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
    fs.writeFileSync(path.join(HOOKS_DIR, 'on-start.js'), '// mío\n');
    cli(['hooks', 'migrate']);
    expect(fs.existsSync(path.join(HOOKS_DIR, 'on-start.js'))).toBe(true);
  });

  it('sin plugin indica cómo instalarlo; con plugin activo dice que no queda nada', () => {
    expect(cli(['hooks', 'migrate']).out).toMatch(/claude plugin install mempunk@mempunk/);
    enablePlugin();
    const r = cli(['hooks', 'migrate']);
    expect(r.out).toMatch(/no hay nada más que hacer/);
    expect(r.out).not.toMatch(/claude plugin install/);
  });

  it('settings.json roto: aborta sin borrar nada', () => {
    cli(['hooks', 'install']);
    const broken = fs.readFileSync(SETTINGS, 'utf8').replace(/}\s*$/, ',}');
    fs.writeFileSync(SETTINGS, broken);

    const r = cli(['hooks', 'migrate']);

    expect(r.status).toBe(1);
    expect(installedHooks().length).toBe(6);
    expect(installedAgents().length).toBeGreaterThan(0);
    expect(fs.readFileSync(SETTINGS, 'utf8')).toBe(broken);
  });

  it('no borra un package.json ajeno de ~/.claude/hooks', () => {
    const userPackage = path.join(HOOKS_DIR, 'package.json');
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
    fs.writeFileSync(userPackage, '{"name":"mis-hooks"}\n');
    fs.writeFileSync(path.join(HOOKS_DIR, 'mio.sh'), 'echo hola\n');
    cli(['hooks', 'migrate']);
    expect(fs.existsSync(userPackage)).toBe(true);
  });

  it('un package.json igual al nuestro tampoco se borra si no había hooks de Mempunk', () => {
    const userPackage = path.join(HOOKS_DIR, 'package.json');
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
    fs.writeFileSync(userPackage, '{"type":"module"}\n');
    cli(['hooks', 'migrate']);
    expect(fs.existsSync(userPackage)).toBe(true);
  });

  it('retira el package.json que escribió install', () => {
    cli(['hooks', 'install']);
    cli(['hooks', 'migrate']);
    expect(fs.existsSync(path.join(HOOKS_DIR, 'package.json'))).toBe(false);
  });

  it('conserva enabledPlugins en settings.json', () => {
    enablePlugin();
    cli(['hooks', 'migrate']);
    expect(readSettings().enabledPlugins).toEqual({ 'mempunk@mempunk': true });
  });
});

describe('mempunk hooks install con el plugin', () => {
  it('plugin activo: no escribe hooks, agentes ni statusline', () => {
    enablePlugin();
    const r = cli(['hooks', 'install']);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/no se instalan hooks manuales/);
    expect(installedHooks()).toEqual([]);
    expect(installedAgents()).toEqual([]);
    expect(readSettings().hooks).toBeUndefined();
    expect(readSettings().statusLine).toBeUndefined();
  });

  it('plugin activo: barre los hooks manuales que ya estaban', () => {
    cli(['hooks', 'install']);
    expect(mempunkEntries().length).toBeGreaterThan(0);
    enablePlugin();
    cli(['hooks', 'install']);
    expect(installedHooks()).toEqual([]);
    expect(installedAgents()).toEqual([]);
    expect(mempunkEntries()).toEqual([]);
  });

  it('detecta el plugin en CLAUDE_CONFIG_DIR', () => {
    const configDir = path.join(BASE, 'config-dir');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'settings.json'), JSON.stringify({ enabledPlugins: { 'mempunk@mempunk': true } }));
    writeInstalled(configDir);
    cli(['hooks', 'install'], { CLAUDE_CONFIG_DIR: configDir });
    expect(installedHooks()).toEqual([]);
  });

  it('clave activa pero plugin sin instalar: instala y no barre', () => {
    mergeSettings({ enabledPlugins: { 'mempunk@mempunk': true } });
    cli(['hooks', 'install']);
    expect(installedHooks().length).toBe(6);
    expect(mempunkEntries().length).toBeGreaterThan(0);
  });

  it('plugin desactivado (false): instala como siempre', () => {
    mergeSettings({ enabledPlugins: { 'mempunk@mempunk': false } });
    cli(['hooks', 'install']);
    expect(installedHooks().length).toBe(6);
  });

  it('sin plugin: instala y sugiere el plugin', () => {
    const r = cli(['hooks', 'install']);
    expect(installedHooks().length).toBe(6);
    expect(r.out).toMatch(/claude plugin marketplace add JuanesEspinosa\/Mempunk/);
  });
});

describe('mempunk hooks install --check', () => {
  it('sin plugin: lo informa y no avisa de convivencia', () => {
    cli(['hooks', 'install']);
    const r = cli(['hooks', 'install', '--check']);
    expect(r.out).toMatch(/Plugin mempunk@mempunk: no activo/);
    expect(r.out).not.toMatch(/Conviven/);
  });

  it('plugin + hooks manuales: avisa de convivencia y no modifica nada', () => {
    cli(['hooks', 'install']);
    enablePlugin();
    const before = fs.readFileSync(SETTINGS, 'utf8');
    const r = cli(['hooks', 'install', '--check']);
    expect(r.out).toMatch(/Plugin mempunk@mempunk: activo/);
    expect(r.out).toMatch(/Conviven restos manuales/);
    expect(installedHooks().length).toBe(6);
    expect(fs.readFileSync(SETTINGS, 'utf8')).toBe(before);
  });

  it('solo registros en settings.json, sin archivos: también avisa', () => {
    cli(['hooks', 'install']);
    fs.rmSync(HOOKS_DIR, { recursive: true, force: true });
    enablePlugin();
    expect(cli(['hooks', 'install', '--check']).out).toMatch(/Conviven restos manuales/);
  });

  it('plugin solo: sin aviso', () => {
    enablePlugin();
    const r = cli(['hooks', 'install', '--check']);
    expect(r.out).toMatch(/Plugin mempunk@mempunk: activo/);
    expect(r.out).not.toMatch(/Conviven/);
  });

  it('plugin solo: no marca ✗ en hooks, registros ni agentes', () => {
    enablePlugin();
    const r = cli(['hooks', 'install', '--check']);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/Hooks y agentes los aporta el plugin/);
    expect(r.out).not.toMatch(/✗ (on-|SessionStart|mempunk-)/);
    expect(r.out).toMatch(/Statusline:/);
  });

  it('plugin + restos manuales: mantiene las listas para ver qué sobra', () => {
    cli(['hooks', 'install']);
    enablePlugin();
    const r = cli(['hooks', 'install', '--check']);
    expect(r.out).toMatch(/✓ on-start\.js/);
    expect(r.out).toMatch(/✓ SessionStart → on-start\.js/);
    expect(r.out).not.toMatch(/los aporta el plugin/);
  });

  it('plugin + solo agentes sobrantes: avisa de convivencia', () => {
    enablePlugin();
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(AGENTS_DIR, 'mempunk-saver.md'), '---\nname: mempunk-saver\n---\n# mempunk-agent\n');
    const r = cli(['hooks', 'install', '--check']);
    expect(r.out).toMatch(/✓ mempunk-saver\.md/);
    expect(r.out).toMatch(/Conviven restos manuales/);
  });

  it('plugin + agente sin marcador: no avisa, porque migrate no lo retira', () => {
    enablePlugin();
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(AGENTS_DIR, 'mempunk-saver.md'), '---\nname: mempunk-saver\n---\n');
    const r = cli(['hooks', 'install', '--check']);
    expect(r.out).not.toMatch(/Conviven/);
    expect(r.out).toMatch(/Hooks y agentes los aporta el plugin/);
  });

  it('sin plugin ni hooks: sigue marcando ✗', () => {
    const r = cli(['hooks', 'install', '--check']);
    expect(r.out).toMatch(/✗ on-start\.js/);
    expect(r.out).toMatch(/✗ mempunk-saver\.md/);
    expect(r.out).not.toMatch(/los aporta el plugin/);
  });
});

describe('mempunk statusline', () => {
  const FOREIGN = { type: 'command', command: 'otra-statusline' };

  it('install la registra y copia el archivo; repetir no cambia nada', () => {
    const r = cli(['statusline', 'install']);
    expect(r.status).toBe(0);
    expect(fs.existsSync(STATUSLINE)).toBe(true);
    expect(readSettings().statusLine.command).toContain('.mempunk/statusline.js');
    expect(cli(['statusline', 'install']).out).toMatch(/ya configurado/);
  });

  it('install funciona con el plugin activo y conserva el resto de settings.json', () => {
    enablePlugin();
    cli(['statusline', 'install']);
    expect(readSettings().statusLine.command).toContain('.mempunk/statusline.js');
    expect(readSettings().enabledPlugins).toEqual({ 'mempunk@mempunk': true });
  });

  it('install no pisa una statusline ajena sin --force', () => {
    mergeSettings({ statusLine: FOREIGN });
    const r = cli(['statusline', 'install']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/otra-statusline/);
    expect(readSettings().statusLine).toEqual(FOREIGN);
    expect(fs.existsSync(STATUSLINE)).toBe(false);
  });

  it('un wrapper del usuario que invoca la nuestra sigue siendo ajeno', () => {
    const wrapper = { type: 'command', command: `wrap.sh "${STATUSLINE.replace(/\\/g, '/')}" --color` };
    mergeSettings({ statusLine: wrapper });
    expect(cli(['statusline', 'install']).status).toBe(1);
    cli(['statusline', 'uninstall']);
    expect(readSettings().statusLine).toEqual(wrapper);
  });

  it('install --force reemplaza la ajena', () => {
    mergeSettings({ statusLine: FOREIGN });
    expect(cli(['statusline', 'install', '--force']).status).toBe(0);
    expect(readSettings().statusLine.command).toContain('.mempunk/statusline.js');
  });

  it('una versión anterior de la propia statusline (otro node) se actualiza sin --force', () => {
    cli(['statusline', 'install']);
    const { statusLine } = readSettings();
    mergeSettings({ statusLine: { ...statusLine, command: statusLine.command.replace(/^"[^"]+"/, '"/otro/node"') } });
    expect(cli(['statusline', 'install']).status).toBe(0);
    expect(readSettings().statusLine).toEqual(statusLine);
  });

  it('uninstall quita la de Mempunk y no toca hooks', () => {
    cli(['hooks', 'install']);
    const r = cli(['statusline', 'uninstall']);
    expect(r.status).toBe(0);
    expect(readSettings().statusLine).toBeUndefined();
    expect(fs.existsSync(STATUSLINE)).toBe(false);
    expect(mempunkEntries().length).toBeGreaterThan(0);
  });

  it('uninstall no toca una statusline ajena', () => {
    mergeSettings({ statusLine: FOREIGN });
    const r = cli(['statusline', 'uninstall']);
    expect(r.out).toMatch(/no está registrada/);
    expect(readSettings().statusLine).toEqual(FOREIGN);
  });

  it('hooks install mantiene su comportamiento: reemplaza la statusline', () => {
    mergeSettings({ statusLine: FOREIGN });
    cli(['hooks', 'install']);
    expect(readSettings().statusLine.command).toContain('.mempunk/statusline.js');
  });

  it('subcomando desconocido: error con las opciones válidas', () => {
    const r = cli(['statusline', 'banana']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/install \| uninstall/);
  });
});

describe('comandos que asumían hooks manuales', () => {
  it('doctor con el plugin activo no pide instalar hooks', () => {
    enablePlugin();
    const r = cli(['doctor']);
    expect(r.out).toMatch(/provistos por el plugin/);
    expect(r.out).not.toMatch(/Hooks no instalados/);
    expect(r.out).not.toMatch(/Agentes no instalados/);
  });

  it('doctor sin plugin ni hooks sigue avisando', () => {
    expect(cli(['doctor']).out).toMatch(/Hooks no instalados/);
  });

  it('auto-start on solo avisa de que faltan hooks si tampoco hay plugin', () => {
    const flag = path.join(VAULT, '.mempunk', 'auto-start.flag');
    fs.rmSync(flag, { force: true });
    expect(cli(['auto-start', 'on']).out).toMatch(/requiere que los hooks/);
    fs.rmSync(flag, { force: true });
    enablePlugin();
    expect(cli(['auto-start', 'on']).out).not.toMatch(/requiere que los hooks/);
    fs.rmSync(flag, { force: true });
  });
});

describe('mempunk setup --plugin', () => {
  const BIN = path.join(BASE, 'bin');
  const CALLS = path.join(BASE, 'claude-calls.log');
  // En Windows la clave es `Path`: añadir `PATH` dejaría dos y no se sabe cuál gana.
  const PATH_KEY = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';

  /** `claude` falso en el PATH: anota sus argumentos y sale con `exitCode`. */
  function fakeClaude(exitCode) {
    fs.rmSync(BIN, { recursive: true, force: true });
    fs.mkdirSync(BIN, { recursive: true });
    fs.rmSync(CALLS, { force: true });
    if (process.platform === 'win32') {
      fs.writeFileSync(path.join(BIN, 'claude.cmd'), `@echo off\r\necho %*>>"${CALLS}"\r\nexit /b ${exitCode}\r\n`);
    } else {
      fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\necho "$*" >> "${CALLS}"\nexit ${exitCode}\n`, { mode: 0o755 });
    }
    return { [PATH_KEY]: `${BIN}${path.delimiter}${process.env[PATH_KEY]}` };
  }

  const claudeCalls = () => fs.readFileSync(CALLS, 'utf8').trim().split(/\r?\n/).map((l) => l.trim());

  it('añade el marketplace, instala el plugin y no escribe hooks si queda activo', () => {
    enablePlugin();
    const r = cli(['setup', '--plugin'], fakeClaude(0));

    expect(r.status).toBe(0);
    expect(claudeCalls()).toEqual([
      'plugin marketplace add JuanesEspinosa/Mempunk',
      'plugin install mempunk@mempunk',
    ]);
    expect(installedHooks()).toEqual([]);
    expect(r.out).toMatch(/Plugin de Claude Code instalado/);
  });

  it('no pregunta: --plugin implica el modo automático', () => {
    enablePlugin();
    cli(['setup', '--plugin'], fakeClaude(0));
    const config = JSON.parse(fs.readFileSync(path.join(VAULT, '.mempunk', 'setup.json'), 'utf8'));
    expect(config.mode).toBe('auto');
  });

  it('si claude falla, cae a hooks install', () => {
    const r = cli(['setup', '--plugin'], fakeClaude(1));

    expect(r.status).toBe(0);
    expect(claudeCalls()).toEqual(['plugin marketplace add JuanesEspinosa/Mempunk']);
    expect(installedHooks().length).toBeGreaterThan(0);
    expect(r.out).toMatch(/No se pudo instalar el plugin/);
  });

  it('si claude no está, cae a hooks install', () => {
    fs.rmSync(BIN, { recursive: true, force: true });
    fs.mkdirSync(BIN, { recursive: true });
    const r = cli(['setup', '--plugin'], { [PATH_KEY]: `${BIN}${path.delimiter}${path.dirname(process.execPath)}` });

    expect(r.status).toBe(0);
    expect(installedHooks().length).toBeGreaterThan(0);
    expect(r.out).toMatch(/No se pudo instalar el plugin/);
  });

  it('rechaza --plugin con un modo sin hooks', () => {
    const r = cli(['setup', '--plugin', '--setup-mode', 'manual'], fakeClaude(0));

    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/--plugin/);
    expect(fs.existsSync(CALLS)).toBe(false);
  });

  it('sin --plugin no llama a claude', () => {
    cli(['setup', '--setup-mode', 'auto'], fakeClaude(0));
    expect(fs.existsSync(CALLS)).toBe(false);
  });
});
