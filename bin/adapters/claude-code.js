import fs from "fs";
import {
  getHomePath,
  WriteConfigError,
} from "./base.js";

// ── Paths ────────────────────────────────────────────────────────────────────

function configPath() {
  return getHomePath(".claude.json");
}

function skillPath(name) {
  return getHomePath(".claude", "skills", name, "SKILL.md");
}

function skillDir(name) {
  return getHomePath(".claude", "skills", name);
}

// ── Corrupt-config callback (set by orchestrator to print translated warning) ─

let _onCorruptConfig = null;

// ── Config I/O ───────────────────────────────────────────────────────────────

function readConfig() {
  const cfg = configPath();
  if (!fs.existsSync(cfg)) return {};
  const raw = fs.readFileSync(cfg, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    if (_onCorruptConfig) _onCorruptConfig(cfg, err);
    return {};
  }
}

function writeConfig(config) {
  const cfg = configPath();
  const backup = cfg + ".bak";

  if (fs.existsSync(cfg)) {
    fs.copyFileSync(cfg, backup);
  }

  try {
    fs.writeFileSync(cfg, JSON.stringify(config, null, 2) + "\n");
  } catch (err) {
    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, cfg);
    }
    throw new WriteConfigError(cfg, err);
  }
}

// ── Skill content ────────────────────────────────────────────────────────────

function mempunkSkillContent() {
  const cfg = configPath().replace(/\\/g, "/");
  return `---
name: mempunk
description: Load Mempunk vault context — persistent dev brain across sessions. Use when the user types /mempunk or asks to load vault context.
disable-model-invocation: false
allowed-tools: Read Glob Grep
---

This is the Mempunk session start protocol. The user has one or more Mempunk vaults (persistent dev brains).

**Step 1: Discover vaults**

Read the file at "${cfg}" and parse the JSON. Look at the "additionalDirectories" array. For each directory, check if it contains a CLAUDE.md file. Those are Mempunk vaults.

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
  const cfg = configPath().replace(/\\/g, "/");
  return `---
name: session-end
description: Close the current session and write the session log. Use when the user types /session-end, says they're done, or wants to close the session.
disable-model-invocation: false
allowed-tools: Read Write Glob Grep
---

The user wants to close this session. You MUST write a session log entry before ending.

**Step 1: Identify the active vault**

If you loaded a vault via /mempunk earlier in this session, use that vault. Otherwise, read "${cfg}", parse the JSON, and find Mempunk vaults in "additionalDirectories" (directories that contain CLAUDE.md). If multiple vaults exist and you don't know which was active, ask the user.

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

export const claudeCodeAdapter = {
  name: "claude-code",
  displayName: "Claude Code",

  configPath,

  onCorruptConfig(handler) {
    _onCorruptConfig = handler;
  },

  isInstalled() {
    // Heuristic: claude.json exists, or directory ~/.claude exists.
    return fs.existsSync(configPath()) || fs.existsSync(getHomePath(".claude"));
  },

  getRegisteredDirs() {
    const cfg = readConfig();
    return cfg.additionalDirectories || [];
  },

  addDir(vaultPath) {
    const cfg = readConfig();
    const dirs = cfg.additionalDirectories || [];
    if (dirs.includes(vaultPath)) return;
    cfg.additionalDirectories = [...dirs, vaultPath];
    writeConfig(cfg);
  },

  removeDir(vaultPath) {
    const cfg = readConfig();
    const dirs = cfg.additionalDirectories || [];
    if (!dirs.includes(vaultPath)) return;
    cfg.additionalDirectories = dirs.filter((d) => d !== vaultPath);
    if (cfg.additionalDirectories.length === 0) {
      delete cfg.additionalDirectories;
    }
    writeConfig(cfg);
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
