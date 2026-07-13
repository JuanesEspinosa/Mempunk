import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { opts } from './args.js';
import { fail } from './output.js';
import { t } from './i18n.js';
import { readJsonFile, writeJsonFile } from './config-files.js';

// ── Definiciones de CLI ───────────────────────────────────────────────────────

const CLAUDE_CONFIG_PATH   = path.join(os.homedir(), '.claude.json');
const GEMINI_CONFIG_PATH   = path.join(os.homedir(), '.gemini', 'settings.json');
const OPENCODE_AGENTS_PATH = path.join(os.homedir(), '.config', 'opencode', 'AGENTS.md');

// Markers para el bloque de opencode en AGENTS.md
const OC_VAULT_START = '<!-- MEMPUNK:VAULTS:START -->';
const OC_VAULT_END   = '<!-- MEMPUNK:VAULTS:END -->';
const OC_PATHS_END   = '<!-- MEMPUNK:PATHS:END -->';

function parseOpencodeVaults(content) {
  const si = content.indexOf(OC_VAULT_START);
  const ei = content.indexOf(OC_VAULT_END);
  if (si === -1 || ei === -1 || ei < si) return [];
  const pi = content.indexOf(OC_PATHS_END);
  const boundary = pi !== -1 && pi < ei ? pi : ei;
  return content.substring(si + OC_VAULT_START.length, boundary)
    .split('\n').map(l => l.trim()).filter(l => l.startsWith('- '))
    .map(l => l.slice(2).trim()).filter(Boolean);
}

function renderOpencodeBlock(vaults) {
  const lines = vaults.map(v => `- ${v}`).join('\n');
  return `${OC_VAULT_START}
## Mempunk — persistent dev brain

Vaults:

${lines}
${OC_PATHS_END}

### /mempunk — Session start protocol

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
6. Confirm what was logged.
${OC_VAULT_END}`;
}

function upsertOpencodeBlock(vaults) {
  const content = fs.existsSync(OPENCODE_AGENTS_PATH)
    ? fs.readFileSync(OPENCODE_AGENTS_PATH, 'utf8') : '';
  const block = renderOpencodeBlock(vaults);
  let next;
  if (content.includes(OC_VAULT_START) && content.includes(OC_VAULT_END)) {
    const si = content.indexOf(OC_VAULT_START);
    const ei = content.indexOf(OC_VAULT_END) + OC_VAULT_END.length;
    next = content.slice(0, si) + block + content.slice(ei);
  } else {
    const sep = content && !content.endsWith('\n') ? '\n\n' : content ? '\n' : '';
    next = content + sep + block + '\n';
  }
  fs.mkdirSync(path.dirname(OPENCODE_AGENTS_PATH), { recursive: true });
  fs.writeFileSync(OPENCODE_AGENTS_PATH, next);
}

function removeOpencodeBlock() {
  if (!fs.existsSync(OPENCODE_AGENTS_PATH)) return;
  const content = fs.readFileSync(OPENCODE_AGENTS_PATH, 'utf8');
  if (!content.includes(OC_VAULT_START)) return;
  const si = content.indexOf(OC_VAULT_START);
  const ei = content.indexOf(OC_VAULT_END) + OC_VAULT_END.length;
  let next = content.slice(0, si) + content.slice(ei);
  next = next.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n');
  if (next.trim() === '') { fs.unlinkSync(OPENCODE_AGENTS_PATH); }
  else { fs.writeFileSync(OPENCODE_AGENTS_PATH, next); }
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
  'gemini-cli': {
    displayName: 'Gemini CLI',
    isInstalled() {
      if (fs.existsSync(path.join(os.homedir(), '.gemini'))) return true;
      return spawnSync('which', ['gemini'], { stdio: 'ignore' }).status === 0;
    },
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
  'opencode': {
    displayName: 'opencode',
    isInstalled() {
      if (fs.existsSync(path.dirname(OPENCODE_AGENTS_PATH))) return true;
      return spawnSync('which', ['opencode'], { stdio: 'ignore' }).status === 0;
    },
    getRegisteredDirs() {
      if (!fs.existsSync(OPENCODE_AGENTS_PATH)) return [];
      return parseOpencodeVaults(fs.readFileSync(OPENCODE_AGENTS_PATH, 'utf8'));
    },
    addDir(vaultPath) {
      const current = this.getRegisteredDirs();
      if (current.includes(vaultPath)) return false;
      upsertOpencodeBlock([...current, vaultPath]);
      return true;
    },
    removeDir(vaultPath) {
      const current = this.getRegisteredDirs();
      if (!current.includes(vaultPath)) return false;
      const next = current.filter(v => v !== vaultPath);
      if (next.length === 0) { removeOpencodeBlock(); }
      else { upsertOpencodeBlock(next); }
      return true;
    },
  },
};

const CLI_ALIASES = {
  'claude': 'claude-code', 'claude-code': 'claude-code',
  'gemini': 'gemini-cli',  'gemini-cli':  'gemini-cli',
  'opencode': 'opencode',
};

/** Devuelve los CLI keys a operar según --cli flag (default: todos los instalados) */
export function resolveCLIs() {
  const flag = opts.cli;
  if (!flag || flag === 'all') return Object.keys(CLI_DEFS);
  const key = CLI_ALIASES[flag];
  if (!key) fail(t('cli.unknownCli', { flag }));
  return [key];
}

/** Alias legible para el flag: claude-code→claude, gemini-cli→gemini */
export function cliFlag(key) {
  return key === 'claude-code' ? 'claude' : key === 'gemini-cli' ? 'gemini' : key;
}
