import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { opts } from './args.js';
import { fail } from './output.js';
import { t } from './i18n.js';
import { readJsonFile, writeJsonFile } from './config-files.js';

// ── Definiciones de CLI ───────────────────────────────────────────────────────

const CLAUDE_CONFIG_PATH   = path.join(os.homedir(), '.claude.json');
const GEMINI_CONFIG_PATH   = path.join(os.homedir(), '.gemini', 'settings.json');
const OPENCODE_AGENTS_PATH = path.join(os.homedir(), '.config', 'opencode', 'AGENTS.md');
// Antigravity comparte ~/.gemini con Gemini CLI, pero su config vive en ~/.gemini/config/
const AGY_CONFIG_DIR       = path.join(os.homedir(), '.gemini', 'config');
const AGY_AGENTS_PATH      = path.join(AGY_CONFIG_DIR, 'AGENTS.md');
const AGY_MCP_CONFIG_PATH  = path.join(AGY_CONFIG_DIR, 'mcp_config.json');
const MCP_SERVER_NAME      = 'mempunk';

// src/cli.js del paquete en ejecución: el MCP se registra como `node <cli.js> mcp`
// porque en Windows `mempunk` es un shim .cmd que los CLIs no lanzan por stdio
const CLI_ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'cli.js');
const DEFAULT_VAULT = path.join(os.homedir(), 'Dev-Brain').replace(/\\/g, '/');

/** true si el ejecutable está en el PATH (`where` en Windows, `which` en el resto) */
function hasBinary(name) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(finder, [name], { stdio: 'ignore' }).status === 0;
}

// ── Bloque de vaults en un AGENTS.md (opencode, Antigravity) ─────────────────

// Markers del bloque gestionado por Mempunk
const OC_VAULT_START = '<!-- MEMPUNK:VAULTS:START -->';
const OC_VAULT_END   = '<!-- MEMPUNK:VAULTS:END -->';
const OC_PATHS_END   = '<!-- MEMPUNK:PATHS:END -->';

function parseBlockVaults(content) {
  const si = content.indexOf(OC_VAULT_START);
  const ei = content.indexOf(OC_VAULT_END);
  if (si === -1 || ei === -1 || ei < si) return [];
  const pi = content.indexOf(OC_PATHS_END);
  const boundary = pi !== -1 && pi < ei ? pi : ei;
  return content.substring(si + OC_VAULT_START.length, boundary)
    .split('\n').map(l => l.trim()).filter(l => l.startsWith('- '))
    .map(l => l.slice(2).trim()).filter(Boolean);
}

const OPENCODE_PROTOCOLS = `### /mempunk — Session start protocol

When the user types "/mempunk" or asks to load vault context:

1. For each vault path above, check if it contains a CLAUDE.md file.
2. If only ONE vault: use it. If MULTIPLE: ask the user which one.
3. Read the vault's CLAUDE.md and list the projects in "Proyectos activos".
4. Ask the user which project to work on — never assume.
5. Read the project's INDEX.md, then overview.md.
6. Check if wiki/state.md exists: if yes read it; if no read last 3 entries of session-log.md. Then read backlog.md.
7. Confirm context with the user before proceeding.

Never read project files before the user confirms which project.

### /session-end — Session close protocol

When the user types "/session-end" or says they're done:

1. Write a structured entry to session-log.md (most recent first).
2. Update backlog.md: mark completed [x], add new tasks.
3. Update INDEX.md: latest session summary and top 3 backlog.
4. Update wiki/state.md if it exists, append to wiki/log.md.
5. Write or update daily/YYYY-MM-DD.md.
6. Confirm what was logged.`;

// Antigravity tiene el servidor MCP de Mempunk registrado: el protocolo usa sus herramientas
const AGY_PROTOCOLS = `### /mempunk — Session start protocol

When the user types "/mempunk" or asks to load vault context:

1. List the projects with \`mempunk project list --json\` and ask the user which one to work on — never assume.
2. Run \`mempunk project activate <id>\` (add \`--here\` inside the project's repo).
3. Load the context with the \`get_context\` tool of the \`mempunk\` MCP server (pass \`project_id\`).
4. Read each \`file_path\` from \`mempunk skill list <id> --json\`.
5. Confirm context with the user before proceeding.

During the session, save decisions with \`save_decision\` and task changes with \`backlog_add\` / \`backlog_update\`.

### /session-end — Session close protocol

When the user types "/session-end" or says they're done:

1. Log the session with \`log_session\` (summary and files touched).
2. Update finished or new tasks with \`backlog_update\` / \`backlog_add\`.
3. Rewrite the compiled state with \`update_state\` if it changed.
4. Confirm what was logged.

The full protocols are in each vault's \`vault-skills/\` folder.`;

function renderVaultBlock(vaults, protocols) {
  const lines = vaults.map(v => `- ${v}`).join('\n');
  return `${OC_VAULT_START}
## Mempunk — persistent dev brain

Vaults:

${lines}
${OC_PATHS_END}

${protocols}
${OC_VAULT_END}`;
}

function upsertVaultBlock(filePath, vaults, protocols) {
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const block = renderVaultBlock(vaults, protocols);
  let next;
  if (content.includes(OC_VAULT_START) && content.includes(OC_VAULT_END)) {
    const si = content.indexOf(OC_VAULT_START);
    const ei = content.indexOf(OC_VAULT_END) + OC_VAULT_END.length;
    next = content.slice(0, si) + block + content.slice(ei);
  } else {
    const sep = content && !content.endsWith('\n') ? '\n\n' : content ? '\n' : '';
    next = content + sep + block + '\n';
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next);
}

function removeVaultBlock(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(OC_VAULT_START)) return;
  const si = content.indexOf(OC_VAULT_START);
  const ei = content.indexOf(OC_VAULT_END) + OC_VAULT_END.length;
  let next = content.slice(0, si) + content.slice(ei);
  next = next.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n');
  if (next.trim() === '') { fs.unlinkSync(filePath); }
  else { fs.writeFileSync(filePath, next); }
}

/** Definición de CLI que vincula vaults con un bloque marcado en un AGENTS.md */
function agentsFileDef({ displayName, filePath, protocols, isInstalled, onFirstLink, onLastUnlink }) {
  return {
    displayName,
    isInstalled,
    getRegisteredDirs() {
      if (!fs.existsSync(filePath)) return [];
      return parseBlockVaults(fs.readFileSync(filePath, 'utf8'));
    },
    addDir(vaultPath) {
      const current = this.getRegisteredDirs();
      if (current.includes(vaultPath)) return false;
      upsertVaultBlock(filePath, [...current, vaultPath], protocols);
      onFirstLink?.(vaultPath);
      return true;
    },
    removeDir(vaultPath) {
      const current = this.getRegisteredDirs();
      if (!current.includes(vaultPath)) return false;
      const next = current.filter(v => v !== vaultPath);
      if (next.length === 0) {
        removeVaultBlock(filePath);
        onLastUnlink?.();
      } else {
        upsertVaultBlock(filePath, next, protocols);
      }
      return true;
    },
  };
}

// ── Servidor MCP en Antigravity ──────────────────────────────────────────────

/** Entrada mcpServers.mempunk; MEMPUNK_VAULT solo si el vault no es el de por defecto */
function agyMcpEntry(vaultPath) {
  const entry = {
    command: process.execPath.replace(/\\/g, '/'),
    args: [path.resolve(CLI_ENTRY).replace(/\\/g, '/'), 'mcp'],
  };
  if (vaultPath !== DEFAULT_VAULT) entry.env = { MEMPUNK_VAULT: vaultPath };
  return entry;
}

/** Registra el servidor MCP si no existe: nunca pisa una entrada del usuario */
function registerAgyMcp(vaultPath) {
  const cfg = readJsonFile(AGY_MCP_CONFIG_PATH);
  if (cfg.mcpServers?.[MCP_SERVER_NAME]) return;
  writeJsonFile(AGY_MCP_CONFIG_PATH, {
    ...cfg,
    mcpServers: { ...cfg.mcpServers, [MCP_SERVER_NAME]: agyMcpEntry(vaultPath) },
  });
}

function unregisterAgyMcp() {
  const cfg = readJsonFile(AGY_MCP_CONFIG_PATH);
  if (!cfg.mcpServers?.[MCP_SERVER_NAME]) return;
  const { [MCP_SERVER_NAME]: _removed, ...servers } = cfg.mcpServers;
  writeJsonFile(AGY_MCP_CONFIG_PATH, { ...cfg, mcpServers: servers });
}

export const CLI_DEFS = {
  'claude-code': {
    displayName: 'Claude Code',
    isInstalled() {
      return fs.existsSync(CLAUDE_CONFIG_PATH) || fs.existsSync(path.join(os.homedir(), '.claude'));
    },
    getRegisteredDirs() {
      const cfg = readJsonFile(CLAUDE_CONFIG_PATH);
      return Array.isArray(cfg.additionalDirectories) ? cfg.additionalDirectories : [];
    },
    addDir(vaultPath) {
      const cfg = readJsonFile(CLAUDE_CONFIG_PATH);
      if (!Array.isArray(cfg.additionalDirectories)) cfg.additionalDirectories = [];
      if (cfg.additionalDirectories.includes(vaultPath)) return false;
      cfg.additionalDirectories.push(vaultPath);
      writeJsonFile(CLAUDE_CONFIG_PATH, cfg);
      return true;
    },
    removeDir(vaultPath) {
      const cfg = readJsonFile(CLAUDE_CONFIG_PATH);
      if (!Array.isArray(cfg.additionalDirectories)) return false;
      const before = cfg.additionalDirectories.length;
      cfg.additionalDirectories = cfg.additionalDirectories.filter(d => d !== vaultPath);
      if (cfg.additionalDirectories.length === before) return false;
      writeJsonFile(CLAUDE_CONFIG_PATH, cfg);
      return true;
    },
  },
  'antigravity': agentsFileDef({
    displayName: 'Antigravity CLI',
    filePath: AGY_AGENTS_PATH,
    protocols: AGY_PROTOCOLS,
    isInstalled: () => fs.existsSync(AGY_CONFIG_DIR) || hasBinary('agy'),
    onFirstLink: registerAgyMcp,
    onLastUnlink: unregisterAgyMcp,
  }),
  'opencode': agentsFileDef({
    displayName: 'opencode',
    filePath: OPENCODE_AGENTS_PATH,
    protocols: OPENCODE_PROTOCOLS,
    isInstalled: () => fs.existsSync(path.dirname(OPENCODE_AGENTS_PATH)) || hasBinary('opencode'),
  }),
  // Deprecado: Gemini CLI ya no recibe actualizaciones (sucesor: Antigravity).
  // Solo se opera con `--cli gemini` explícito, para poder desvincularlo.
  'gemini-cli': {
    displayName: 'Gemini CLI',
    deprecated: true,
    // Solo el binario: ~/.gemini existe también con Antigravity instalado
    isInstalled: () => hasBinary('gemini'),
    getRegisteredDirs() {
      const cfg = readJsonFile(GEMINI_CONFIG_PATH);
      return Array.isArray(cfg.context?.includeDirectories) ? cfg.context.includeDirectories : [];
    },
    addDir(vaultPath) {
      const cfg = readJsonFile(GEMINI_CONFIG_PATH);
      if (!cfg.context) cfg.context = {};
      if (!Array.isArray(cfg.context.includeDirectories)) cfg.context.includeDirectories = [];
      if (cfg.context.includeDirectories.includes(vaultPath)) return false;
      cfg.context.includeDirectories.push(vaultPath);
      cfg.context.loadMemoryFromIncludeDirectories = true;
      writeJsonFile(GEMINI_CONFIG_PATH, cfg);
      return true;
    },
    removeDir(vaultPath) {
      const cfg = readJsonFile(GEMINI_CONFIG_PATH);
      if (!Array.isArray(cfg.context?.includeDirectories)) return false;
      const before = cfg.context.includeDirectories.length;
      cfg.context.includeDirectories = cfg.context.includeDirectories.filter(d => d !== vaultPath);
      if (cfg.context.includeDirectories.length === before) return false;
      if (cfg.context.includeDirectories.length === 0) {
        delete cfg.context.includeDirectories;
        delete cfg.context.loadMemoryFromIncludeDirectories;
        if (Object.keys(cfg.context).length === 0) delete cfg.context;
      }
      writeJsonFile(GEMINI_CONFIG_PATH, cfg);
      return true;
    },
  },
};

const CLI_ALIASES = {
  'claude': 'claude-code', 'claude-code': 'claude-code',
  'agy': 'antigravity',    'antigravity': 'antigravity',
  'opencode': 'opencode',
  'gemini': 'gemini-cli',  'gemini-cli':  'gemini-cli',
};

/** Devuelve los CLI keys a operar según --cli flag (default: todos menos los deprecados) */
export function resolveCLIs() {
  const flag = opts.cli;
  if (!flag || flag === 'all') {
    return Object.keys(CLI_DEFS).filter(key => !CLI_DEFS[key].deprecated);
  }
  const key = CLI_ALIASES[flag];
  if (!key) fail(t('cli.unknownCli', { flag }));
  return [key];
}

/** Alias legible para el flag: claude-code→claude, antigravity→agy, gemini-cli→gemini */
export function cliFlag(key) {
  return { 'claude-code': 'claude', 'antigravity': 'agy', 'gemini-cli': 'gemini' }[key] ?? key;
}
