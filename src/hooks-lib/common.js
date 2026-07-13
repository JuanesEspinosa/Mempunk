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

// Regex para detectar rutas de archivo en el contenido de los mensajes.
// Acepta separadores / y \ (Windows); los matches se normalizan a /.
export const FILE_RE = /(?:^|[\s"'`(])((?:[\w.-]+[\\/])*[\w.-]+\.(?:js|ts|py|json|md|sh|sql|css|html|jsx|tsx|go|rs))/gm;

// MEMPUNK_CLI permite sobrescribir "mempunk" por "node /path/to/cli.js" en tests
const [CLI_BIN, ...CLI_ARGS_PREFIX] = (process.env.MEMPUNK_CLI ?? 'mempunk').split(' ');

/** Ejecuta el CLI de mempunk. En Windows el binario global de npm es un shim
 *  .cmd que spawnSync no puede ejecutar sin shell (ENOENT); con shell hay que
 *  citar manualmente los argumentos que contengan espacios. */
export function runCli(args) {
  const opts = { encoding: 'utf8', env: { ...process.env, MEMPUNK_VAULT: VAULT_PATH } };
  if (process.env.MEMPUNK_CLI || process.platform !== 'win32') {
    return spawnSync(CLI_BIN, [...CLI_ARGS_PREFIX, ...args], opts);
  }
  const quoted = args.map((a) => (/[\s"^&|<>]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a));
  return spawnSync(CLI_BIN, quoted, { ...opts, shell: true });
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
 *  separadores /, sin slash final, lowercase en Windows. */
export function normalizePathForMatch(p) {
  let normalized = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
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
