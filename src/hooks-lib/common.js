// Código compartido por los hooks de Mempunk (on-start, on-stop, on-compact, on-prompt).
//
// Los hooks se distribuyen como archivos AUTOCONTENIDOS en ~/.claude/hooks/
// (sin node_modules ni imports relativos): `npm run build` bundlea cada hook
// con esbuild a dist/hooks/ inlineando este módulo. Editar la fuente en
// src/hooks/, nunca los bundles.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const VAULT_PATH  = process.env.MEMPUNK_VAULT?.trim() || path.join(os.homedir(), 'Dev-Brain');
export const MEMPUNK_DIR = path.join(VAULT_PATH, '.mempunk');
export const ACTIVE_FILE = path.join(MEMPUNK_DIR, 'active-project.json');
export const PATHS_FILE  = path.join(MEMPUNK_DIR, 'project-paths.json');
export const LOG_FILE    = path.join(MEMPUNK_DIR, 'hooks.log');
export const REMOTE_FILE = path.join(MEMPUNK_DIR, 'remote.json');

// Regex para detectar rutas de archivo en el contenido de los mensajes.
// Acepta separadores / y \ (Windows); los matches se normalizan a /.
export const FILE_RE = /(?:^|[\s"'`(])((?:[\w.-]+[\\/])*[\w.-]+\.(?:js|ts|py|json|md|sh|sql|css|html|jsx|tsx|go|rs))/gm;

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
  if (process.env.MEMPUNK_CLI || process.platform !== 'win32') {
    return spawnSync(CLI_BIN, [...CLI_ARGS_PREFIX, ...args], opts);
  }
  const quoted = args.map((a) => (/[\s"^&|<>]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a));
  return spawnSync(CLI_BIN, quoted, { ...opts, shell: true });
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
];

/** Clasifica el resultado de un runCli() fallido para mostrar a Claude un
 *  mensaje fijo en vez del stderr crudo (un remote malicioso puede inyectar
 *  texto via las líneas `remote:` de git).
 *  @returns {'timeout'|'no-remote'|'auth'|'network'|'conflict'|'error'} */
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

/** Resuelve el proyecto: env → mapa de rutas por cwd (prefijo más largo) → activo global.
 *  El mapa por cwd evita que sesiones concurrentes en proyectos distintos
 *  crucen sus checkpoints/snapshots a través del único active-project.json global. */
export function getProjectId(cwd) {
  if (process.env.CLAUDE_PROJECT_ID) return process.env.CLAUDE_PROJECT_ID;

  if (cwd) {
    try {
      const map = JSON.parse(fs.readFileSync(PATHS_FILE, 'utf8'));
      const target = normalizePathForMatch(cwd);
      let best = null;
      for (const [root, projectId] of Object.entries(map)) {
        if (target === root || target.startsWith(root + '/')) {
          if (!best || root.length > best.root.length) best = { root, projectId };
        }
      }
      if (best) return best.projectId;
    } catch (_) {}
  }

  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
    return data.project_id ?? null;
  } catch (_) {
    return null;
  }
}

/** Un turno REAL del usuario: type "user", con texto, fuera de subagentes.
 *  En el transcript de Claude Code cada tool_result también llega como una
 *  línea type:"user" (content: [{type:"tool_result"}]) — contarlos como
 *  turnos dispararía los checkpoints en casi cada Stop. */
export function isRealUserTurn(entry) {
  if (entry.type !== 'user' || entry.isSidechain) return false;
  const content = entry.message?.content;
  if (typeof content === 'string') return content.trim().length > 0;
  if (Array.isArray(content)) return content.some((b) => b.type === 'text');
  return false;
}

// ── i18n de hooks ─────────────────────────────────────────────────────────────
// Mini-catálogo bilingüe SOLO para los mensajes visibles al usuario final
// (systemMessage / additionalContext). Los mensajes de log() quedan en español:
// son diagnóstico interno, no UI. No importa de src/lib/i18n.js a propósito —
// los hooks se bundlean autocontenidos y este módulo debe seguir liviano.

const HOOK_MESSAGES = {
  en: {
    'context.alert': '🚨 Context at {pct}% — compaction imminent (auto-compact triggers at ~83.5%). ' +
      'Mempunk will save a snapshot automatically when it happens. ' +
      'You can run /compact now to stay in control.',
    'context.warn': '⚠️  Context at {pct}% — automatic compaction triggers at ~83.5%. ' +
      'Consider running /compact manually to control when it happens.',
    'autostart.context': 'mempunk-auto-start: The user has auto-start enabled. Invoke @mempunk-loader ' +
      'to load the vault context for the current project before responding.',
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
    'materialize.conflicts': 'Mempunk: {count} skill/agent file(s) were not updated because they were edited outside the vault — run `mempunk materialize --dry-run` to see which.',
  },
  es: {
    'context.alert': '🚨 Contexto al {pct}% — compactación inminente (auto-compact ocurre al ~83.5%). ' +
      'Mempunk guardará un snapshot automáticamente cuando ocurra. ' +
      'Puedes ejecutar /compact ahora para controlarlo.',
    'context.warn': '⚠️  Contexto al {pct}% — la compactación automática ocurre al ~83.5%. ' +
      'Considera ejecutar /compact manualmente para controlar cuándo ocurre.',
    'autostart.context': 'mempunk-auto-start: El usuario tiene auto-start activado. Invoca @mempunk-loader ' +
      'para cargar el contexto del vault del proyecto actual antes de responder.',
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
    'materialize.conflicts': 'Mempunk: {count} archivo(s) de skills/agentes no se actualizaron porque fueron editados fuera del vault — ejecuta `mempunk materialize --dry-run` para ver cuáles.',
  },
};

// Idioma activo — mismo contrato que src/lib/i18n.js: MEMPUNK_LANG que empiece
// con "es" → español; cualquier otra cosa o ausente → inglés.
const HOOK_LANG = (process.env.MEMPUNK_LANG ?? '').trim().toLowerCase().startsWith('es') ? 'es' : 'en';

/** Mensaje de UI del hook traducido, con placeholders {name}. Nunca lanza. */
export function hookT(key, params = {}) {
  const template = HOOK_MESSAGES[HOOK_LANG][key] ?? HOOK_MESSAGES.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] !== undefined ? String(params[name]) : match
  );
}

/** Extrae el texto plano de una entrada del transcript */
export function extractText(entry) {
  const content = entry.message?.content;
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join(' ');
  }
  return '';
}
