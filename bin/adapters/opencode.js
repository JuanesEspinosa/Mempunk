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

function skillPath(name) {
  return path.join(configDir(), "skills", name, "SKILL.md");
}

function skillDir(name) {
  return path.join(configDir(), "skills", name);
}

// ── Vault registration via AGENTS.md markers ─────────────────────────────────

const VAULT_START = "<!-- MEMPUNK:VAULTS:START -->";
const VAULT_END = "<!-- MEMPUNK:VAULTS:END -->";

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
  const block = content.substring(startIdx + VAULT_START.length, endIdx);
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
## Mempunk vaults

The user has the following persistent dev brain vaults. Read their CLAUDE.md to discover available projects when the user invokes /mempunk:

${lines}
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

// ── Skill content ────────────────────────────────────────────────────────────

function mempunkSkillContent() {
  const agents = agentsPath().replace(/\\/g, "/");
  return `---
name: mempunk
description: Load Mempunk vault context — persistent dev brain across sessions. Use when the user types /mempunk or asks to load vault context.
---

This is the Mempunk session start protocol. The user has one or more Mempunk vaults (persistent dev brains).

**Step 1: Discover vaults**

Read the file at "${agents}" and find vault paths listed between \`<!-- MEMPUNK:VAULTS:START -->\` and \`<!-- MEMPUNK:VAULTS:END -->\` markers. Each line starting with "- " under those markers is a vault path. For each path, verify it contains a CLAUDE.md file.

**Step 2: Select vault**

- If there is only ONE vault: use it automatically.
- If there are MULTIPLE vaults: present a numbered list to the user showing the vault name (last segment of the path) and full path, then ask which one they want to work with.
- If there are ZERO vaults: tell the user to run \`mempunk setup\` first.

**Step 3: Load context**

Once a vault is selected, read its CLAUDE.md and follow the session start protocol:
1. Identify which project(s) the user wants to work on
2. Read the project's overview.md
3. Read the project's conventions.md (if it exists) — these are the rules and coding standards for the project
4. Read the last 3 entries of the project's session-log.md
5. Read the project's backlog.md
6. Confirm context with the user before proceeding, mentioning which vault was loaded and any key conventions
`;
}

function sessionEndSkillContent() {
  const agents = agentsPath().replace(/\\/g, "/");
  return `---
name: session-end
description: Close the current session and write the session log. Use when the user types /session-end, says they're done, or wants to close the session.
---

The user wants to close this session. You MUST write a session log entry before ending.

**Step 1: Identify the active vault**

If you loaded a vault via /mempunk earlier in this session, use that vault. Otherwise, read "${agents}" and find vault paths listed between \`<!-- MEMPUNK:VAULTS:START -->\` and \`<!-- MEMPUNK:VAULTS:END -->\` markers (lines starting with "- "). If multiple vaults exist and you don't know which was active, ask the user.

**Step 2: Write the session log**

1. Identify which project(s) were worked on in this session
2. Find the session-log.md file for each project in the active vault
   - The path is: [vault-path]/projects/[project-name]/session-log.md
3. Write a new entry AT THE TOP of the file (most recent first), below the frontmatter/header, using this exact format:

\`\`\`markdown
## Session YYYY-MM-DD HH:MM

### What was done
- [concise list of changes made]

### Decisions made
- [architectural or technical decisions, if any]

### Current state
- [state of the code/feature when session ended]

### Next steps
- [what's left to do, in priority order]

### Modified files
- [list of files touched]
\`\`\`

4. If the project has a conventions.md, check if any conventions were established or changed during this session and note them in "Decisions made"
5. Use the ACTUAL current date and time for the entry
6. Be specific — list real file names, real changes, real decisions
7. After writing the log, confirm to the user what was logged and for which project

IMPORTANT: If you used /mempunk at the start and know which project was active, write the log there. If multiple projects were worked on, write a log entry for each. If no project context exists, ask the user which project this session was for.
`;
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
    fs.mkdirSync(skillDir("mempunk"), { recursive: true });
    fs.writeFileSync(skillPath("mempunk"), mempunkSkillContent());

    fs.mkdirSync(skillDir("session-end"), { recursive: true });
    fs.writeFileSync(skillPath("session-end"), sessionEndSkillContent());
  },

  verifySkills() {
    const missing = [];
    if (!fs.existsSync(skillPath("mempunk"))) missing.push("mempunk");
    if (!fs.existsSync(skillPath("session-end"))) missing.push("session-end");
    return { ok: missing.length === 0, missing };
  },
};
