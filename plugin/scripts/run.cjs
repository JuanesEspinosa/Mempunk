#!/usr/bin/env node
// # mempunk-plugin
// Lanzador del plugin de Claude Code: localiza el paquete `mempunk` instalado
// (npm install -g mempunk) y ejecuta, en este mismo proceso, el bundle del hook
// o el servidor MCP de esa instalación. El plugin no lleva código propio de
// hooks: siempre corre la versión del CLI instalada (specs/phase-2-plugin, D1).
//
// Uso: node run.cjs <on-start|on-prompt|on-tool|on-stop|on-compact|on-end|mcp>
// Desde hooks.json se carga con `node -e "require(...CLAUDE_PLUGIN_ROOT...)" <hook>`
// para no depender de la expansión de ${CLAUDE_PLUGIN_ROOT} en args (rota en
// Windows: anthropics/claude-code#70150).
'use strict';

/* global process, __dirname */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const HOOKS = ['on-start', 'on-prompt', 'on-tool', 'on-stop', 'on-compact', 'on-end'];
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const NPM_ROOT_TIMEOUT_MS = 10_000;

const MESSAGES = {
  en: {
    missing: 'Mempunk: the plugin is installed but the mempunk CLI was not found. ' +
      'Install it with `npm install -g mempunk` and restart the session.',
    outdated: 'Mempunk: the mempunk CLI ({cli}) is older than the plugin ({plugin}). ' +
      'Update it with `npm install -g mempunk`.',
  },
  es: {
    missing: 'Mempunk: el plugin está instalado pero no se encontró el CLI de mempunk. ' +
      'Instálalo con `npm install -g mempunk` y reinicia la sesión.',
    outdated: 'Mempunk: el CLI de mempunk ({cli}) es más antiguo que el plugin ({plugin}). ' +
      'Actualízalo con `npm install -g mempunk`.',
  },
};

// Mismo contrato que src/lib/i18n.js: MEMPUNK_LANG que empiece con "es" → español
function message(key, params = {}) {
  const lang = (process.env.MEMPUNK_LANG ?? '').trim().toLowerCase().startsWith('es') ? 'es' : 'en';
  return MESSAGES[lang][key].replace(/\{(\w+)\}/g, (m, name) => params[name] ?? m);
}

/** Línea en el hooks.log del vault (misma ruta y formato que src/hooks-lib/common.js).
 *  Nunca lanza: el log es best-effort. */
function log(text) {
  try {
    const vault = process.env.MEMPUNK_VAULT?.trim() || path.join(os.homedir(), 'Dev-Brain');
    const dir = path.join(vault, '.mempunk');
    if (!fs.existsSync(dir)) return;
    fs.appendFileSync(path.join(dir, 'hooks.log'), `${new Date().toISOString()} [plugin] ${text}\n`);
  } catch { /* sin log no hay a quién avisar */ }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** ¿Es `dir` la raíz de un paquete mempunk instalado? */
function isCliRoot(dir) {
  if (!dir) return false;
  const pkg = readJson(path.join(dir, 'package.json'));
  return pkg?.name === 'mempunk' && fs.existsSync(path.join(dir, 'src', 'cli.js'));
}

/** MEMPUNK_CLI="node /ruta/src/cli.js" (tests y desarrollo) → raíz del paquete, o null */
function rootFromEnv(cli) {
  // La ruta puede tener espacios: se prueba el resto tras el primer token y cada token
  const rest = cli.replace(/^\S+\s+/, '').replace(/^["']|["']$/g, '');
  const candidates = [rest, ...cli.split(/\s+/)].filter((c) => /cli\.js$/.test(c));
  for (const c of candidates) {
    const root = path.resolve(path.dirname(c), '..');
    if (isCliRoot(root)) return root;
  }
  return null;
}

/** node_modules/.bin de un proyecto (lo añaden `npm run`/`npx` al PATH): su mempunk no es
 *  la instalación global y no debe quedar cacheado para todas las sesiones. */
function isProjectBinDir(dir) {
  return path.resolve(dir).split(path.sep).includes('.bin');
}

/** Busca `mempunk` en el PATH y sube hasta su paquete:
 *  Unix → symlink a <pkg>/src/cli.js (o <prefix>/lib/node_modules/mempunk);
 *  Windows → shim .cmd junto a <prefix>/node_modules/mempunk. */
function rootFromPath() {
  const names = process.platform === 'win32' ? ['mempunk.cmd', 'mempunk'] : ['mempunk'];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    if (isProjectBinDir(dir)) continue;
    for (const name of names) {
      const bin = path.join(dir, name);
      if (!fs.existsSync(bin)) continue;
      const candidates = [
        path.join(dir, 'node_modules', 'mempunk'),
        path.join(dir, '..', 'lib', 'node_modules', 'mempunk'),
      ];
      try {
        const real = fs.realpathSync(bin);
        if (real.endsWith('cli.js')) candidates.unshift(path.resolve(path.dirname(real), '..'));
      } catch { /* symlink roto: se prueban las demás rutas */ }
      const root = candidates.find(isCliRoot);
      if (root) return path.resolve(root);
    }
  }
  return null;
}

/** Último recurso (solo en SessionStart: lanza npm, cuesta cientos de ms) */
function rootFromNpm() {
  try {
    const out = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      timeout: NPM_ROOT_TIMEOUT_MS,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    });
    const root = path.join(out.trim(), 'mempunk');
    return isCliRoot(root) ? root : null;
  } catch {
    return null;
  }
}

function cacheFile() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  return dataDir ? path.join(dataDir, 'cli-root.json') : null;
}

/** { root: string|null } guardado por la última resolución completa, o null si no hay caché */
function readCache() {
  const file = cacheFile();
  const cached = file ? readJson(file) : null;
  return cached && 'root' in cached ? cached : null;
}

function saveCache(root) {
  const file = cacheFile();
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ root }));
  } catch {
    // Sin caché solo se pierde velocidad: la próxima vez se resuelve de nuevo
  }
}

/** Raíz del paquete mempunk, o null.
 *  - MEMPUNK_CLI definido: es la única fuente (si no resuelve, no se mezcla con otra instalación).
 *  - SessionStart: resolución completa (PATH → npm) que renueva la caché, también "no hay CLI".
 *    Así un cambio de versión de Node o de prefijo se detecta en cada sesión.
 *  - Demás hooks: la caché de SessionStart; sin caché, solo el PATH (nunca npm: corren en
 *    cada herramienta y cada prompt). */
function resolveCliRoot(target) {
  const envCli = process.env.MEMPUNK_CLI?.trim();
  if (envCli) return rootFromEnv(envCli);

  if (target !== 'on-start') {
    const cached = readCache();
    if (cached) return isCliRoot(cached.root) ? cached.root : null;
    const found = rootFromPath();
    if (found) saveCache(found);
    return found;
  }

  const found = rootFromPath() ?? rootFromNpm();
  saveCache(found);
  return found;
}

function parseVersion(v) {
  return String(v ?? '').split('.').map((n) => parseInt(n, 10) || 0);
}

function isOlder(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  }
  return false;
}

function emitSessionStartNotice(text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text },
  }));
}

async function runHook(hook, root) {
  if (!root) {
    if (hook === 'on-start') {
      log('CLI de mempunk no encontrado — aviso de instalación');
      emitSessionStartNotice(message('missing'));
    }
    process.exit(0);
  }
  const bundle = path.join(root, 'dist', 'hooks', `${hook}.js`);
  // Plugin más nuevo que el CLI: el hook aún no existe en esa versión
  if (!fs.existsSync(bundle)) {
    log(`${hook}: ${bundle} no existe en el CLI instalado — sin acción`);
    process.exit(0);
  }

  if (hook === 'on-start') {
    const plugin = readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'))?.version;
    const cli = readJson(path.join(root, 'package.json'))?.version;
    if (plugin && cli && isOlder(cli, plugin)) {
      log(`CLI ${cli} más antiguo que el plugin ${plugin}`);
      process.env.MEMPUNK_PLUGIN_NOTICE = message('outdated', { cli, plugin });
    }
  }
  process.env.MEMPUNK_VIA_PLUGIN = '1';
  // Los hooks llaman al CLI de esta misma instalación, sin el shim .cmd de Windows
  if (!process.env.MEMPUNK_CLI) process.env.MEMPUNK_CLI_JS = path.join(root, 'src', 'cli.js');
  await import(pathToFileURL(bundle).href);
}

async function runMcp(root) {
  if (!root) {
    process.stderr.write(`${message('missing')}\n`);
    process.exit(1);
  }
  const cliJs = path.join(root, 'src', 'cli.js');
  // El CLI lee process.argv al importarse (src/lib/args.js)
  process.argv = [process.execPath, cliJs, 'mcp'];
  await import(pathToFileURL(cliJs).href);
}

const target = process.argv[process.argv.length - 1];

if (target === 'mcp') {
  runMcp(resolveCliRoot(target)).catch((err) => {
    // Claude Code muestra el stderr del servidor MCP: sin esto solo se vería "failed"
    process.stderr.write(`mempunk mcp: ${err?.stack ?? err}\n`);
    process.exit(1);
  });
} else if (HOOKS.includes(target)) {
  runHook(target, resolveCliRoot(target)).catch((err) => {
    // Un hook nunca rompe la sesión: el fallo de carga queda en hooks.log
    log(`${target}: no se pudo cargar el hook — ${err?.message ?? err}`);
    process.exit(0);
  });
}
