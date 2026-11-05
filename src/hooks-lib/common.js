// Código compartido por los hooks de Mempunk (on-start, on-stop, on-compact, on-prompt, on-tool, on-end).
//
// Los hooks se distribuyen como archivos AUTOCONTENIDOS en ~/.claude/hooks/
// (sin node_modules ni imports relativos): `npm run build` bundlea cada hook
// con esbuild a dist/hooks/ inlineando este módulo. Editar la fuente en
// src/hooks/, nunca los bundles.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const VAULT_PATH  = process.env.MEMPUNK_VAULT?.trim() || path.join(os.homedir(), 'Dev-Brain');
export const MEMPUNK_DIR = path.join(VAULT_PATH, '.mempunk');
export const ACTIVE_FILE = path.join(MEMPUNK_DIR, 'active-project.json');
export const PATHS_FILE  = path.join(MEMPUNK_DIR, 'project-paths.json');
export const LOG_FILE    = path.join(MEMPUNK_DIR, 'hooks.log');
export const REMOTE_FILE = path.join(MEMPUNK_DIR, 'remote.json');
// Lo escribe `mempunk push --background` (src/commands/push-background.js)
export const LAST_PUSH_FILE = path.join(MEMPUNK_DIR, 'last-push.json');
// Ajustes versionados del vault (`mempunk auto-session`); duplicado a propósito
// de src/commands/hooks.js porque los hooks no importan de src/lib
export const SETTINGS_FILE = path.join(MEMPUNK_DIR, 'settings.json');
export const AUTO_SESSION_MODES = ['full', 'minimal', 'off'];

// MEMPUNK_CLI permite sobrescribir "mempunk" por "node /path/to/cli.js" en tests
const [CLI_BIN, ...CLI_ARGS_PREFIX] = (process.env.MEMPUNK_CLI ?? 'mempunk').split(' ');

// Git nunca debe pedir credenciales desde un hook (no hay terminal): sin esto un
// push/pull sin credential helper se queda colgado esperando input. Inofensivo
// para los comandos que no tocan git.
// Mismo set que src/lib/git.js — duplicado a propósito: los hooks se bundlean
// autocontenidos y no pueden importar de src/lib. Vacíos GIT_ASKPASS/SSH_ASKPASS
// evitan que git use el helper GUI de Git Bash / VS Code antes que la terminal.
export const NON_INTERACTIVE_GIT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
  SSH_ASKPASS_REQUIRE: 'never',
  GCM_INTERACTIVE: 'never',
};

/** Ejecuta el CLI de mempunk. En Windows el binario global de npm es un shim
 *  .cmd que spawnSync no puede ejecutar sin shell (ENOENT); con shell hay que
 *  citar manualmente los argumentos que contengan espacios.
 *  `timeout` (ms) mata el proceso con SIGKILL al vencer; sin timeout por defecto. */
export function runCli(args, { timeout } = {}) {
  const opts = {
    encoding: 'utf8',
    env: { ...process.env, ...NON_INTERACTIVE_GIT_ENV, MEMPUNK_VAULT: VAULT_PATH },
    ...(timeout ? { timeout, killSignal: 'SIGKILL' } : {}),
  };
  const { bin, argv, shell } = cliSpawnArgs(args);
  return spawnSync(bin, argv, { ...opts, shell });
}

/** Binario, argv y shell para llamar al CLI (ver runCli: shim .cmd en Windows) */
function cliSpawnArgs(args) {
  // El lanzador del plugin (plugin/scripts/run.cjs) fija la ruta exacta de cli.js:
  // node + ruta, sin dividir por espacios ni pasar por el shim .cmd
  if (!process.env.MEMPUNK_CLI && process.env.MEMPUNK_CLI_JS) {
    return { bin: process.execPath, argv: [process.env.MEMPUNK_CLI_JS, ...args], shell: false };
  }
  if (process.env.MEMPUNK_CLI || process.platform !== 'win32') {
    return { bin: CLI_BIN, argv: [...CLI_ARGS_PREFIX, ...args], shell: false };
  }
  const quoted = args.map((a) => (/[\s"^&|<>]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a));
  return { bin: CLI_BIN, argv: quoted, shell: true };
}

/** Lanza el CLI desacoplado y vuelve sin esperarlo: el proceso sigue vivo cuando
 *  el hook (y Claude Code) terminan. Sin stdio: el comando deja su resultado en
 *  disco. Devuelve el PID; lanza si el proceso no se pudo crear. */
export function spawnCliDetached(args) {
  const { bin, argv, shell } = cliSpawnArgs(args);
  const child = spawn(bin, argv, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell,
    env: { ...process.env, ...NON_INTERACTIVE_GIT_ENV, MEMPUNK_VAULT: VAULT_PATH },
  });
  // Un fallo asíncrono (ENOENT) llegaría cuando el hook ya salió: no hay a quién avisar
  child.on('error', () => {});
  child.unref();
  return child.pid;
}

/** Timeout (ms) para los push/pull automáticos. MEMPUNK_HOOK_TIMEOUT_MS lo
 *  sobrescribe (tests); inválido o ausente → `defaultMs`. */
export function hookTimeoutMs(defaultMs) {
  const parsed = parseInt(process.env.MEMPUNK_HOOK_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultMs;
}

// Patrones de stderr → clase de fallo. El orden importa: el primero que matchea gana.
const CLI_FAILURE_PATTERNS = [
  ['no-remote', /remote set/],
  ['auth',      /Authentication|could not read Username|Permission denied/i],
  ['network',   /Could not resolve host|unable to access|Connection/i],
  ['conflict',  /conflict|merge/i],
  // Último: una línea `remote:` de git no debe poder disfrazar otra clase
  ['locked',    /push\.lock/],
];

/** Clasifica el resultado de un runCli() fallido para mostrar a Claude un
 *  mensaje fijo en vez del stderr crudo (un remote malicioso puede inyectar
 *  texto via las líneas `remote:` de git).
 *  @returns {'timeout'|'locked'|'no-remote'|'auth'|'network'|'conflict'|'error'} */
export function classifyCliFailure(result) {
  if (result.error?.code === 'ETIMEDOUT' || result.signal) return 'timeout';
  const stderr = result.stderr ?? '';
  const match = CLI_FAILURE_PATTERNS.find(([, re]) => re.test(stderr));
  return match ? match[0] : 'error';
}

/** Lee .mempunk/remote.json (escrito por `mempunk remote set`). Tolera BOM.
 *  Archivo ausente o inválido → null = sin remote configurado. */
export function readRemoteConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(REMOTE_FILE, 'utf8').replace(/^\uFEFF/, ''));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

/** Modo de `mempunk auto-session`: decide si el registro de SessionEnd, los
 *  checkpoints (on-stop) y los snapshots (on-compact) guardan texto de la
 *  conversación (solo en 'full'). Archivo vacío o clave ausente →
 *  'full' (el comportamiento por defecto); archivo ilegible, JSON que no es un
 *  objeto o valor desconocido → 'minimal': ante la duda no se guardan extractos
 *  de la conversación. Misma lectura que cmdAutoSession (src/commands/hooks.js). */
export function readAutoSessionMode(log) {
  let raw;
  try {
    raw = fs.readFileSync(SETTINGS_FILE, 'utf8').replace(/^\uFEFF/, '');
  } catch (err) {
    if (err.code === 'ENOENT') return 'full';
    log?.(`settings.json ilegible (${err.code ?? err.message}); auto_session=minimal`);
    return 'minimal';
  }
  if (!raw.trim()) return 'full';
  let settings;
  try {
    settings = JSON.parse(raw);
  } catch (_) {
    log?.('settings.json con JSON inválido; auto_session=minimal');
    return 'minimal';
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    log?.('settings.json no es un objeto; auto_session=minimal');
    return 'minimal';
  }
  const mode = settings.auto_session;
  if (mode === undefined) return 'full';
  if (AUTO_SESSION_MODES.includes(mode)) return mode;
  log?.(`auto_session inválido ${JSON.stringify(mode)}; se usa minimal`);
  return 'minimal';
}

/** Crea un logger con el nombre del hook como prefijo. Nunca lanza. */
export function createLogger(hookName) {
  return (message) => {
    try {
      fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [${hookName}] ${message}\n`);
    } catch (_) {}
  };
}

/** Lee el stdin completo y lo parsea como JSON, tolerando BOM UTF-8
 *  (p. ej. pipes de PowerShell 5.1). Stdin vacío → objeto vacío. */
export async function readStdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input.replace(/^\uFEFF/, '') || '{}');
}

/** Lee el stdin del hook y comprueba que traiga los campos `required`.
 *  Si el JSON no es v\u00E1lido o falta alg\u00FAn campo (null/undefined), lo registra en
 *  hooks.log \u2014 se\u00F1al de que cambi\u00F3 el contrato de Claude Code \u2014 y devuelve null
 *  para que el hook salga en silencio. */
export async function readHookInput(required, log) {
  let data;
  try {
    data = await readStdinJson();
  } catch (err) {
    log(`stdin inv\u00E1lido: ${err.message}`);
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    log('stdin inv\u00E1lido: no es un objeto JSON');
    return null;
  }
  const missing = required.filter((field) => data[field] === undefined || data[field] === null);
  if (missing.length > 0) {
    log(`Contrato: faltan campos ${missing.join(', ')} en ${data.hook_event_name ?? 'el evento'} \u2014 sin acci\u00F3n`);
    return null;
  }
  return data;
}

/** Normaliza rutas igual que el CLI al escribir project-paths.json:
 *  ruta física (symlinks resueltos — macOS: /var → /private/var),
 *  separadores /, sin slash final, lowercase en Windows. */
export function normalizePathForMatch(p) {
  let resolved = path.resolve(p);
  try { resolved = fs.realpathSync(resolved); } catch (_) { /* la ruta puede no existir */ }
  let normalized = resolved.replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') normalized = normalized.toLowerCase();
  return normalized;
}

/** Proyecto declarado para esta sesión: env → mapa de rutas por cwd (prefijo más largo).
 *  Sin el respaldo del activo global: el auto-start no debe cargar un proyecto
 *  ajeno al directorio solo porque fue el último activado. */
export function getMappedProjectId(cwd) {
  if (process.env.CLAUDE_PROJECT_ID) return process.env.CLAUDE_PROJECT_ID;
  if (!cwd) return null;
  try {
    const map = JSON.parse(fs.readFileSync(PATHS_FILE, 'utf8'));
    const target = normalizePathForMatch(cwd);
    let best = null;
    for (const [root, projectId] of Object.entries(map)) {
      if (target === root || target.startsWith(root + '/')) {
        if (!best || root.length > best.root.length) best = { root, projectId };
      }
    }
    return best?.projectId ?? null;
  } catch (_) {
    return null;
  }
}

/** Resuelve el proyecto: env → mapa de rutas por cwd (prefijo más largo) → activo global.
 *  El mapa por cwd evita que sesiones concurrentes en proyectos distintos
 *  crucen sus checkpoints/snapshots a través del único active-project.json global. */
export function getProjectId(cwd) {
  const mapped = getMappedProjectId(cwd);
  if (mapped) return mapped;

  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
    return data.project_id ?? null;
  } catch (_) {
    return null;
  }
}

// ── i18n de hooks ─────────────────────────────────────────────────────────────
// Mini-catálogo bilingüe SOLO para los mensajes visibles al usuario final
// (systemMessage / additionalContext). Los mensajes de log() quedan en español:
// son diagnóstico interno, no UI. No importa de src/lib/i18n.js a propósito —
// los hooks se bundlean autocontenidos y este módulo debe seguir liviano.

const HOOK_MESSAGES = {
  en: {
    'autostart.failed': 'Could not load the Mempunk context automatically; use {loadCmd} to load it.',
    'autostart.unmapped': 'This directory is not linked to a Mempunk project; use {loadCmd} to choose or create one.',
    'restore.title': '⚠️ CONTEXT RESTORED AFTER COMPACTION ({date})',
    'restore.unknownDate': 'unknown date',
    'restore.files': 'Files you were editing:',
    'restore.commands': 'Commands run before compaction:',
    'restore.messages': 'Last messages of the session:',
    'restore.recoverHint': 'To see the full history run: mempunk session recover {id}',
    'restore.continue': 'Continue from where you left off.',
    'restore.truncated': '…(truncated)',
    'remote.pull.timeout': 'Mempunk: automatic vault pull timed out — run `mempunk pull` manually in the terminal.',
    'remote.pull.no-remote': 'Mempunk: automatic vault pull skipped — no remote configured; run `mempunk remote set <url>`.',
    'remote.pull.auth': 'Mempunk: automatic vault pull failed (authentication) — run `mempunk pull` manually in the terminal to provide credentials.',
    'remote.pull.network': 'Mempunk: automatic vault pull failed (network) — run `mempunk pull` manually.',
    'remote.pull.conflict': 'Mempunk: automatic vault pull failed (conflict) — run `mempunk pull` manually and resolve the conflicts in the vault.',
    'remote.pull.error': 'Mempunk: automatic vault pull failed — run `mempunk pull` manually to see details.',
    'remote.pull.locked': 'Mempunk: automatic vault pull skipped — another sync (probably the background push of the previous session) was still running; run `mempunk pull` in a moment.',
    'remote.push.timeout': 'Mempunk: the last automatic vault push (on session end) timed out — run `mempunk push` manually in the terminal.',
    'remote.push.locked': 'Mempunk: the last automatic vault push (on session end) was skipped because another sync was running — run `mempunk push` manually.',
    'remote.push.no-remote': 'Mempunk: the last automatic vault push was skipped — no remote configured; run `mempunk remote set <url>`.',
    'remote.push.auth': 'Mempunk: the last automatic vault push (on session end) failed (authentication) — run `mempunk push` manually in the terminal to provide credentials.',
    'remote.push.network': 'Mempunk: the last automatic vault push (on session end) failed (network) — run `mempunk push` manually.',
    'remote.push.conflict': 'Mempunk: the last automatic vault push (on session end) failed (conflict) — run `mempunk push` manually and resolve the conflicts in the vault.',
    'remote.push.error': 'Mempunk: the last automatic vault push (on session end) failed — run `mempunk push` manually to see details.',
    'remote.push.interrupted': 'Mempunk: the last automatic vault push (on session end) did not finish — its process was stopped. Run `mempunk push` manually.',
    'materialize.conflicts': 'Mempunk: {count} skill/agent file(s) were not updated because they were edited outside the vault — run `mempunk materialize --dry-run` to see which.',
    'autosession.header': '[auto] Session closed without a log ({turns} turns).',
    'autosession.prompt': 'First prompt: {text}',
    'autosession.reply': 'Last reply: {text}',
  },
  es: {
    'autostart.failed': 'No se pudo cargar el contexto de Mempunk automáticamente; usa {loadCmd} para cargarlo.',
    'autostart.unmapped': 'Este directorio no está vinculado a un proyecto de Mempunk; usa {loadCmd} para elegir o crear uno.',
    'restore.title': '⚠️ CONTEXTO RESTAURADO TRAS COMPACTACION ({date})',
    'restore.unknownDate': 'fecha desconocida',
    'restore.files': 'Archivos que estabas editando:',
    'restore.commands': 'Comandos corridos antes de compactar:',
    'restore.messages': 'Últimos mensajes de la sesión:',
    'restore.recoverHint': 'Para ver el historial completo ejecuta: mempunk session recover {id}',
    'restore.continue': 'Continúa desde donde estabas.',
    'restore.truncated': '…(truncado)',
    'remote.pull.timeout': 'Mempunk: el pull automático del vault excedió el tiempo límite — ejecuta `mempunk pull` manualmente en la terminal.',
    'remote.pull.no-remote': 'Mempunk: pull automático omitido — no hay remote configurado; ejecuta `mempunk remote set <url>`.',
    'remote.pull.auth': 'Mempunk: el pull automático del vault falló (autenticación) — ejecuta `mempunk pull` manualmente en la terminal para dar credenciales.',
    'remote.pull.network': 'Mempunk: el pull automático del vault falló (red) — ejecuta `mempunk pull` manualmente.',
    'remote.pull.conflict': 'Mempunk: el pull automático del vault falló (conflicto) — ejecuta `mempunk pull` manualmente y resuelve los conflictos del vault.',
    'remote.pull.error': 'Mempunk: el pull automático del vault falló — ejecuta `mempunk pull` manualmente para ver el detalle.',
    'remote.pull.locked': 'Mempunk: pull automático omitido — otra sincronización (probablemente el push en segundo plano de la sesión anterior) seguía en curso; ejecuta `mempunk pull` en un momento.',
    'remote.push.timeout': 'Mempunk: el último push automático del vault (al cerrar sesión) excedió el tiempo límite — ejecuta `mempunk push` manualmente en la terminal.',
    'remote.push.locked': 'Mempunk: el último push automático del vault (al cerrar sesión) se omitió porque había otra sincronización en curso — ejecuta `mempunk push` manualmente.',
    'remote.push.no-remote': 'Mempunk: el último push automático se omitió — no hay remote configurado; ejecuta `mempunk remote set <url>`.',
    'remote.push.auth': 'Mempunk: el último push automático del vault (al cerrar sesión) falló (autenticación) — ejecuta `mempunk push` manualmente en la terminal para dar credenciales.',
    'remote.push.network': 'Mempunk: el último push automático del vault (al cerrar sesión) falló (red) — ejecuta `mempunk push` manualmente.',
    'remote.push.conflict': 'Mempunk: el último push automático del vault (al cerrar sesión) falló (conflicto) — ejecuta `mempunk push` manualmente y resuelve los conflictos del vault.',
    'remote.push.error': 'Mempunk: el último push automático del vault (al cerrar sesión) falló — ejecuta `mempunk push` manualmente para ver el detalle.',
    'remote.push.interrupted': 'Mempunk: el último push automático del vault (al cerrar sesión) no terminó — su proceso se detuvo. Ejecuta `mempunk push` manualmente.',
    'materialize.conflicts': 'Mempunk: {count} archivo(s) de skills/agentes no se actualizaron porque fueron editados fuera del vault — ejecuta `mempunk materialize --dry-run` para ver cuáles.',
    'autosession.header': '[auto] Sesión cerrada sin registro ({turns} turnos).',
    'autosession.prompt': 'Primer prompt: {text}',
    'autosession.reply': 'Última respuesta: {text}',
  },
};

// Idioma activo — mismo contrato que src/lib/i18n.js: MEMPUNK_LANG que empiece
// con "es" → español; cualquier otra cosa o ausente → inglés.
const HOOK_LANG = (process.env.MEMPUNK_LANG ?? '').trim().toLowerCase().startsWith('es') ? 'es' : 'en';

/** ¿Corre el hook desde el plugin de Claude Code? Lo marca plugin/scripts/run.cjs. */
export function isViaPlugin() {
  return process.env.MEMPUNK_VIA_PLUGIN === '1';
}

// Clave del plugin en enabledPlugins (<plugin>@<marketplace>)
const PLUGIN_KEY = 'mempunk@mempunk';

/** JSON de un archivo de Claude Code, o undefined si falta o está roto: la detección nunca aborta.
 *  trimStart quita también el BOM. */
function readJsonQuiet(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').trimStart());
  } catch (_) {
    return undefined;
  }
}

/** ¿Lo instaló Claude Code en esta máquina? La clave de enabledPlugins puede venir de un
 *  settings.json compartido (repo de equipo, dotfiles) sin que el plugin esté instalado. */
function isPluginInstalled(userDir) {
  const entries = readJsonQuiet(path.join(userDir, 'plugins', 'installed_plugins.json'))?.plugins?.[PLUGIN_KEY];
  return Array.isArray(entries) && entries.length > 0;
}

/** ¿Está activo el plugin de Mempunk? Instalado y habilitado, con la precedencia de Claude Code:
 *  settings.local.json y settings.json del proyecto antes que los del usuario (CLAUDE_CONFIG_DIR
 *  o ~/.claude). Ante la duda devuelve false: ejecutar dos veces es mejor que quedarse sin hooks.
 *  Duplicado a propósito en src/lib/config-files.js (los hooks no importan de src/lib). */
export function isPluginEnabled(projectDir = process.env.CLAUDE_PROJECT_DIR?.trim() || process.cwd()) {
  const userDir = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), '.claude');
  if (!isPluginInstalled(userDir)) return false;
  const candidates = [
    path.join(projectDir, '.claude', 'settings.local.json'),
    path.join(projectDir, '.claude', 'settings.json'),
    path.join(userDir, 'settings.json'),
  ];
  for (const file of candidates) {
    const flag = readJsonQuiet(file)?.enabledPlugins?.[PLUGIN_KEY];
    if (typeof flag === 'boolean') return flag;
  }
  return false;
}

/** Guardia de doble ejecución (D5): Claude Code suma los hooks del plugin a los de settings.json,
 *  así que un hook instalado a mano sale sin hacer nada si el plugin está activo. */
export function exitIfPluginOwnsHooks(log) {
  if (isViaPlugin() || !isPluginEnabled()) return;
  log('plugin mempunk@mempunk activo: hook manual omitido (mempunk hooks migrate lo retira)');
  process.exit(0);
}

/** Nombres que Claude ve: en el plugin, los skills llevan el prefijo "mempunk:" */
export function assetNames() {
  return { loadCmd: isViaPlugin() ? '/mempunk:load' : '/mempunk' };
}

/** Mensaje de UI del hook traducido, con placeholders {name}. Nunca lanza. */
export function hookT(key, params = {}) {
  const template = HOOK_MESSAGES[HOOK_LANG][key] ?? HOOK_MESSAGES.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] !== undefined ? String(params[name]) : match
  );
}
