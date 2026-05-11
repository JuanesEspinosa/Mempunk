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

Once a vault is selected, read its CLAUDE.md and follow the session start protocol defined there:
1. List the projects registered in the "Proyectos activos" section of CLAUDE.md
2. Ask the user: "Encontre estos proyectos: [list]. Con cual trabajamos hoy?"
3. When the user picks a project, read its INDEX.md
4. Read the project's overview.md
5. Check if [vault-path]/projects/[project]/wiki/state.md exists:
   - If it EXISTS: read wiki/state.md (compiled project state — replaces reading session-log entries)
   - If it does NOT exist: read the last 3 entries of the project's session-log.md
6. Read the project's backlog.md

**Never assume which project — always ask first.**
**Never read project files before the user confirms which project.**

**Step 4: Smart Context Check**

After loading the vault context, evaluate if there are evident gaps:

| Signal | Indicates |
|---|---|
| wiki/state.md or session-log last updated >7 days ago | Vault possibly outdated |
| Overview with empty/placeholder sections | Project not fully documented |
| Architecture not defined | No technical context in vault |
| Backlog empty or only completed items | No clear work direction |

- If gaps are detected: inform the user what you found and what seems missing, then ask: "Noto que [gap]. Quieres que revise tambien el proyecto real en [repo path from overview] para completar el contexto?"
- If the vault seems sufficient: proceed to Step 5 without extra questions.
- **Never** read the real project repo without explicit user confirmation.

**Step 5: Confirm context**

Confirm context with the user: "Lei el contexto de [project]. Ultimo trabajo fue [summary from last session]. Continuamos con [next step from backlog] o hay algo nuevo?"

Mention which vault was loaded and any key conventions from conventions.md (if it exists).
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

**Step 3: Update backlog**

1. Open the project's backlog.md
2. Mark as completed \`[x]\` any tasks that were done in this session
3. Add any new tasks that emerged during the session
4. Reorder by priority if anything changed

**Step 4: Update INDEX.md**

1. Open the project's INDEX.md
2. Update "Ultima sesion (resumen)" with today's date and a one-line summary
3. Update "Backlog top 3" to reflect the current top 3 pending tasks from backlog.md

**Step 5: Update wiki state** (only if wiki/ exists)

Check if [vault-path]/projects/[project-name]/wiki/state.md exists. If it does:
1. Rewrite it completely with a compiled synthesis of the current state:
   - **Actualizado**: today's date (YYYY-MM-DD)
   - **Version/Release**: current version if known, otherwise keep existing value
   - **Estado actual**: one or two lines on where the project stands now
   - **Que se esta construyendo ahora**: active feature/task, or "Idle" if none
   - **Decisiones vigentes clave**: top 2-3 active decisions that still apply
   - **Blockers / riesgos activos**: current blockers, or "Ninguno"
   - **Proximos 3 pasos**: top 3 pending items from the updated backlog
   - Append one line to the "Historial de estados anteriores" section: \`YYYY-MM-DD — [one-line summary of this session]\`
2. Append one line to [vault-path]/projects/[project-name]/wiki/log.md:
   \`## [YYYY-MM-DD] session-end | [one-line session summary]\`

If wiki/state.md does not exist, skip this step entirely.

**Step 6: Write daily log**

1. Create or update the file at [vault-path]/daily/YYYY-MM-DD.md
2. If the file already exists (previous session today), append below without deleting
3. Use this format:

\`\`\`markdown
# YYYY-MM-DD

## Proyectos trabajados
- **[project]:** [one line of what was done]

## Decisiones del dia
- [relevant decisions made]

## Resumen ejecutivo
[2-3 lines of the most important things of the day]
\`\`\`

**Step 7: Confirm**

After writing everything, confirm to the user what was logged and for which project.

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
