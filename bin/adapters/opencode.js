import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { getHomePath, WriteConfigError } from "./base.js";

// ── Paths ────────────────────────────────────────────────────────────────────

function configDir() {
  return getHomePath(".config", "opencode");
}

function configPath() {
  return path.join(configDir(), "opencode.json");
}

function agentsPath() {
  return path.join(configDir(), "AGENTS.md");
}

// ── Vault registration via AGENTS.md markers ─────────────────────────────────

const VAULT_START = "<!-- MEMPUNK:VAULTS:START -->";
const VAULT_END = "<!-- MEMPUNK:VAULTS:END -->";
const PATHS_END = "<!-- MEMPUNK:PATHS:END -->";

function readAgents() {
  const p = agentsPath();
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
}

function writeAgents(content) {
  const p = agentsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const backup = p + ".bak";
  if (fs.existsSync(p)) fs.copyFileSync(p, backup);
  try {
    fs.writeFileSync(p, content);
  } catch (err) {
    if (fs.existsSync(backup)) fs.copyFileSync(backup, p);
    throw new WriteConfigError(p, err);
  }
}

function parseVaultsBlock(content) {
  const startIdx = content.indexOf(VAULT_START);
  const endIdx = content.indexOf(VAULT_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return [];
  // Only parse vault paths between VAULT_START and PATHS_END (or VAULT_END as fallback)
  const pathsEndIdx = content.indexOf(PATHS_END);
  const boundary = pathsEndIdx !== -1 && pathsEndIdx < endIdx ? pathsEndIdx : endIdx;
  const block = content.substring(startIdx + VAULT_START.length, boundary);
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
}

function renderVaultsBlock(vaults) {
  const lines = vaults.map((v) => `- ${v}`).join("\n");
  return `${VAULT_START}
## Mempunk — persistent dev brain

Vaults:

${lines}
${PATHS_END}

### /mempunk — Session start protocol

When the user types "/mempunk" or asks to load vault context:

1. For each vault path above, check if it contains a CLAUDE.md file.
2. If only ONE vault: use it. If MULTIPLE: ask the user which one.
3. Read the vault's CLAUDE.md and the project index.
4. Ask which project to work on.
5. Read that project's overview.md and conventions.md (if it exists).
6. Read the last 3 entries of session-log.md and the backlog.md.
7. Confirm context with the user before proceeding.

### /session-end — Session close protocol

When the user types "/session-end" or says they're done:

1. Identify which project was worked on.
2. Write a structured entry to the project's session-log.md (most recent first):
   - What was done, decisions made, current state, next steps, modified files.
3. If conventions changed, note them in "Decisions made".
4. Confirm what was logged.
${VAULT_END}`;
}

function upsertVaultsBlock(vaults) {
  const existing = readAgents();
  const block = renderVaultsBlock(vaults);

  if (existing.includes(VAULT_START) && existing.includes(VAULT_END)) {
    const startIdx = existing.indexOf(VAULT_START);
    const endIdx = existing.indexOf(VAULT_END) + VAULT_END.length;
    const next = existing.slice(0, startIdx) + block + existing.slice(endIdx);
    writeAgents(next);
    return;
  }

  // No block yet — append (preserve existing user content)
  const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
  writeAgents(existing + sep + block + "\n");
}

function removeVaultsBlock() {
  const existing = readAgents();
  if (!existing.includes(VAULT_START)) return;
  const startIdx = existing.indexOf(VAULT_START);
  const endIdx = existing.indexOf(VAULT_END) + VAULT_END.length;
  let next = existing.slice(0, startIdx) + existing.slice(endIdx);
  // Trim trailing whitespace introduced by removal
  next = next.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "\n");
  if (next.trim() === "") {
    fs.unlinkSync(agentsPath());
    return;
  }
  writeAgents(next);
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export const opencodeAdapter = {
  name: "opencode",
  displayName: "opencode",

  configPath,

  isInstalled() {
    // Heuristic: ~/.config/opencode/ exists, or opencode binary on PATH (best-effort).
    if (fs.existsSync(configDir())) return true;
    try {
      execSync("which opencode", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  },

  getRegisteredDirs() {
    return parseVaultsBlock(readAgents());
  },

  addDir(vaultPath) {
    const current = parseVaultsBlock(readAgents());
    if (current.includes(vaultPath)) return;
    upsertVaultsBlock([...current, vaultPath]);
  },

  removeDir(vaultPath) {
    const current = parseVaultsBlock(readAgents());
    if (!current.includes(vaultPath)) return;
    const next = current.filter((v) => v !== vaultPath);
    if (next.length === 0) {
      removeVaultsBlock();
    } else {
      upsertVaultsBlock(next);
    }
  },

  installSkills() {
    // opencode reads AGENTS.md automatically — the vault protocol instructions
    // are embedded directly in the vaults block (see renderVaultsBlock).
    // Re-render the block to ensure instructions are up-to-date.
    const current = parseVaultsBlock(readAgents());
    if (current.length > 0) upsertVaultsBlock(current);
  },

  verifySkills() {
    // For opencode, "skills installed" means the AGENTS.md has the protocol
    // instructions embedded in the vaults block.
    const content = readAgents();
    const missing = [];
    if (!content.includes("/mempunk")) missing.push("mempunk");
    if (!content.includes("/session-end")) missing.push("session-end");
    return { ok: missing.length === 0, missing };
  },
};
