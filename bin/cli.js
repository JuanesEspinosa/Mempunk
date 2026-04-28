#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import inquirer from "inquirer";
import chalk from "chalk";
import boxen from "boxen";
import ora from "ora";
import gradient from "gradient-string";
import { getTranslations, getAvailableLanguages } from "./i18n.js";

// ── Global state ─────────────────────────────────────────────────────────────

let t = getTranslations("en");

const PRESETS = {
  full: { folders: ["projects", "areas", "resources", "daily"] },
  standard: { folders: ["projects", "resources", "daily"] },
  minimal: { folders: ["projects"] },
};

const ALL_FOLDERS = ["projects", "areas", "resources", "daily"];

// ── Path helpers ─────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizePath(p) {
  return path.resolve(p).replace(/\\/g, "/");
}

function getTemplatesDir() {
  return path.join(__dirname, "..", "templates");
}

function getHomePath(...segments) {
  const home = process.env.HOME || process.env.USERPROFILE;
  return path.join(home, ...segments);
}

// ── Config ───────────────────────────────────────────────────────────────────

function getClaudeConfigPath() {
  return getHomePath(".claude.json");
}

function readClaudeConfig() {
  const configPath = getClaudeConfigPath();
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(chalk.yellow(`  ${t.warnCorruptConfig} ${configPath}`));
    console.warn(chalk.dim(`  ${err.message}`));
    return {};
  }
}

function writeClaudeConfig(config) {
  const configPath = getClaudeConfigPath();
  const backup = configPath + ".bak";

  // Backup before writing
  if (fs.existsSync(configPath)) {
    fs.copyFileSync(configPath, backup);
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  } catch (err) {
    // Rollback on failure
    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, configPath);
    }
    console.error(chalk.red(`  ${t.errorWriteConfig} ${err.message}`));
    process.exit(1);
  }
}

// ── Banner ───────────────────────────────────────────────────────────────────

function showBanner() {
  const banner = `
 ███╗   ███╗███████╗███╗   ███╗██████╗ ██╗   ██╗███╗   ██╗██╗  ██╗
 ████╗ ████║██╔════╝████╗ ████║██╔══██╗██║   ██║████╗  ██║██║ ██╔╝
 ██╔████╔██║█████╗  ██╔████╔██║██████╔╝██║   ██║██╔██╗ ██║█████╔╝
 ██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║██╔═══╝ ██║   ██║██║╚██╗██║██╔═██╗
 ██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║██║     ╚██████╔╝██║ ╚████║██║  ██╗
 ╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝`;

  const mempunkGradient = gradient(["#a855f7", "#ec4899", "#f97316"]);
  console.log(mempunkGradient(banner));
  console.log(chalk.dim("  Persistent dev brain for Claude Code\n"));
}

// ── Tree display ─────────────────────────────────────────────────────────────

function showTree(vaultDir, folders) {
  console.log(chalk.bold(`\n  ${t.structure}:\n`));
  console.log(chalk.dim(`  ${vaultDir}/`));
  console.log(`  ├── ${chalk.cyan("CLAUDE.md")}`);
  folders.forEach((f, i) => {
    const isLast = i === folders.length - 1;
    const prefix = isLast ? "└" : "├";
    console.log(`  ${prefix}── ${chalk.yellow(f + "/")}`);
  });
  console.log();
}

// ── Prompt box ───────────────────────────────────────────────────────────────

function showPrompt(vaultPath) {
  const content =
    chalk.bold(t.promptTitle) +
    "\n\n" +
    chalk.green("/mempunk") +
    "\n\n" +
    chalk.dim(t.promptAlt.replace("{path}", vaultPath));

  console.log(
    boxen(content, {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 1, right: 1 },
      borderStyle: "round",
      borderColor: "magenta",
    })
  );
}

// ── Template adjustment ─────────────────────────────────────────────────────

function adjustTemplate(content, folders) {
  const missing = ALL_FOLDERS.filter((f) => !folders.includes(f));
  const lines = content.split("\n");
  const filtered = lines.filter((line) => {
    for (const folder of missing) {
      // Match tree lines (├── folder/ or └── folder/) and comment lines (# ...folder...)
      if (
        line.match(new RegExp(`[├└]── ${folder}/`)) ||
        line.match(new RegExp(`^├── ${folder}\\s+#`)) ||
        line.match(new RegExp(`^└── ${folder}\\s+#`))
      ) {
        return false;
      }
    }
    return true;
  });
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n");
}

// ── Setup (interactive) ──────────────────────────────────────────────────────

async function setup(lang) {
  showBanner();

  // Language selection
  if (!lang) {
    const { language } = await inquirer.prompt([
      {
        type: "rawlist",
        name: "language",
        message: t.selectLanguage,
        choices: [
          { name: "English", value: "en" },
          { name: "Español", value: "es" },
          { name: "Português", value: "pt" },
          { name: "Français", value: "fr" },
        ],
      },
    ]);
    lang = language;
    t = getTranslations(lang);
  }

  // 1. Path
  const { vaultPath } = await inquirer.prompt([
    {
      type: "input",
      name: "vaultPath",
      message: t.whereVault,
      default: "./mempunk",
    },
  ]);

  const resolved = path.resolve(vaultPath);

  // Check if vault already exists
  if (
    fs.existsSync(path.join(resolved, "CLAUDE.md")) &&
    fs.existsSync(path.join(resolved, "projects"))
  ) {
    console.log(chalk.yellow(`\n  ${t.vaultAlreadyExists} ${resolved}`));
    const { shouldLink } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldLink",
        message: t.linkExisting,
        default: true,
      },
    ]);
    if (shouldLink) linkVault(resolved, false);
    showPrompt(normalizePath(resolved));
    return;
  }

  // 2. Structure
  const { preset } = await inquirer.prompt([
    {
      type: "rawlist",
      name: "preset",
      message: t.selectStructure,
      choices: [
        { name: t.presetFull, value: "full" },
        { name: t.presetStandard, value: "standard" },
        { name: t.presetMinimal, value: "minimal" },
        { name: t.presetCustom, value: "custom" },
      ],
    },
  ]);

  let folders;

  if (preset === "custom") {
    const { selected } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selected",
        message: t.selectFolders,
        choices: [
          { name: t.folderProjects, value: "projects", checked: true },
          { name: t.folderAreas, value: "areas" },
          { name: t.folderResources, value: "resources" },
          { name: t.folderDaily, value: "daily" },
        ],
        validate: (input) =>
          input.length > 0 || t.errorSelectOne,
      },
    ]);
    folders = selected;
  } else {
    folders = PRESETS[preset].folders;
  }

  // 3. Link
  const { shouldLink } = await inquirer.prompt([
    {
      type: "confirm",
      name: "shouldLink",
      message: t.linkQuestion,
      default: true,
    },
  ]);

  // Execute
  initVault(resolved, folders);

  if (shouldLink) {
    linkVault(resolved, false);
  }

  showTree(resolved, folders);

  console.log(chalk.green(`  ✔ ${t.done}\n`));

  showPrompt(normalizePath(resolved));
}

// ── Init ─────────────────────────────────────────────────────────────────────

function initVault(vaultDir, folders) {
  if (
    fs.existsSync(path.join(vaultDir, "CLAUDE.md")) &&
    fs.existsSync(path.join(vaultDir, "projects"))
  ) {
    console.error(chalk.red(`  ${t.errorVaultExists} ${vaultDir}`));
    process.exit(1);
  }

  const spinner = ora({
    text: t.creatingVault,
    spinner: "dots",
  }).start();

  fs.mkdirSync(vaultDir, { recursive: true });

  for (const dir of folders) {
    fs.mkdirSync(path.join(vaultDir, dir), { recursive: true });
  }

  // Copy CLAUDE.md template
  const templateFile = path.join(getTemplatesDir(), "CLAUDE.md");
  const destFile = path.join(vaultDir, "CLAUDE.md");

  if (fs.existsSync(templateFile)) {
    let content = fs.readFileSync(templateFile, "utf-8");
    content = adjustTemplate(content, folders);
    fs.writeFileSync(destFile, content);
  } else {
    fs.writeFileSync(destFile, "# CLAUDE.md\n\nVault initialized by Mempunk.\n");
  }

  spinner.succeed(chalk.green(`${t.vaultCreated} ${chalk.bold(vaultDir)}`));
}

// ── Init CLI entry ───────────────────────────────────────────────────────────

function initFromArgs(args) {
  let targetPath = null;
  let preset = null;
  const selectedFolders = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--preset" && args[i + 1]) {
      preset = args[++i];
    } else if (arg === "--projects") selectedFolders.push("projects");
    else if (arg === "--areas") selectedFolders.push("areas");
    else if (arg === "--resources") selectedFolders.push("resources");
    else if (arg === "--daily") selectedFolders.push("daily");
    else if (!arg.startsWith("-")) targetPath = arg;
  }

  const vaultDir = path.resolve(targetPath || ".");

  let folders;
  if (preset) {
    if (!PRESETS[preset]) {
      console.error(chalk.red(`  ${t.errorUnknownPreset} "${preset}". ${t.usePresets}`));
      process.exit(1);
    }
    folders = PRESETS[preset].folders;
  } else if (selectedFolders.length > 0) {
    folders = selectedFolders;
  } else {
    folders = PRESETS.full.folders;
  }

  initVault(vaultDir, folders);
  showTree(vaultDir, folders);
}

// ── Link / Unlink / Status ───────────────────────────────────────────────────

function linkVault(vaultPath, showPromptAfter = true) {
  if (!vaultPath) {
    console.error(chalk.red(`  ${t.errorPathRequired}`));
    process.exit(1);
  }

  const resolved = path.resolve(vaultPath);
  const normalized = normalizePath(resolved);

  if (!fs.existsSync(resolved)) {
    console.error(chalk.red(`  ${t.errorPathNotExist} ${resolved}`));
    process.exit(1);
  }

  if (!fs.existsSync(path.join(resolved, "CLAUDE.md"))) {
    console.error(chalk.red(`  ${t.errorNoClaude} ${resolved}`));
    console.error(chalk.dim(`  ${t.runInitFirst}`));
    process.exit(1);
  }

  const config = readClaudeConfig();
  const dirs = config.additionalDirectories || [];

  if (dirs.includes(normalized)) {
    console.log(chalk.yellow(`  ${t.alreadyLinked} ${normalized}\n`));
    if (showPromptAfter) showPrompt(normalized);
    return;
  }

  const spinner = ora({
    text: t.linkingVault,
    spinner: "dots",
  }).start();

  config.additionalDirectories = [...dirs, normalized];
  writeClaudeConfig(config);

  spinner.succeed(chalk.green(`${t.vaultLinked} ${chalk.bold(normalized)}`));

  // Install/update slash commands (multi-vault aware)
  const spinnerSkill = ora({
    text: t.installingSkill,
    spinner: "dots",
  }).start();
  installSlashCommands();
  spinnerSkill.succeed(chalk.green(t.skillInstalled));

  console.log(chalk.dim(`  ${t.linkSuccess}\n`));

  if (showPromptAfter) showPrompt(normalized);
}

async function unlink(specificPath) {
  const config = readClaudeConfig();
  const dirs = config.additionalDirectories || [];

  if (dirs.length === 0) {
    console.log(chalk.yellow(`  ${t.noVaultLinked}`));
    return;
  }

  // Filter to only Mempunk vaults (dirs with CLAUDE.md)
  const vaults = dirs.filter((d) => fs.existsSync(path.join(d, "CLAUDE.md")));
  const nonVaults = dirs.filter((d) => !fs.existsSync(path.join(d, "CLAUDE.md")));

  if (specificPath) {
    // Unlink a specific vault by path
    const normalized = normalizePath(path.resolve(specificPath));
    if (!dirs.includes(normalized)) {
      console.log(chalk.yellow(`  ${t.notLinked} ${normalized}`));
      return;
    }
    config.additionalDirectories = dirs.filter((d) => d !== normalized);
    if (config.additionalDirectories.length === 0) delete config.additionalDirectories;
    writeClaudeConfig(config);
    console.log(chalk.green(`  ✔ ${t.vaultUnlinked} ${chalk.dim(normalized)}`));
    return;
  }

  if (vaults.length === 1) {
    // Only one vault — unlink it directly
    config.additionalDirectories = nonVaults;
    if (config.additionalDirectories.length === 0) delete config.additionalDirectories;
    writeClaudeConfig(config);
    console.log(chalk.green(`  ✔ ${t.vaultUnlinked} ${chalk.dim(vaults[0])}`));
    return;
  }

  // Multiple vaults — ask which to unlink
  const choices = [
    ...vaults.map((v) => {
      const name = path.basename(v);
      return { name: `${name} ${chalk.dim(`(${v})`)}`, value: v };
    }),
    { name: t.unlinkAll, value: "__all__" },
  ];

  const { selected } = await inquirer.prompt([
    {
      type: "rawlist",
      name: "selected",
      message: t.unlinkWhich,
      choices,
    },
  ]);

  if (selected === "__all__") {
    config.additionalDirectories = nonVaults;
    if (config.additionalDirectories.length === 0) delete config.additionalDirectories;
    writeClaudeConfig(config);
    console.log(chalk.green(`  ✔ ${t.allVaultsUnlinked}`));
  } else {
    config.additionalDirectories = dirs.filter((d) => d !== selected);
    if (config.additionalDirectories.length === 0) delete config.additionalDirectories;
    writeClaudeConfig(config);
    console.log(chalk.green(`  ✔ ${t.vaultUnlinked} ${chalk.dim(selected)}`));
  }
}

function status() {
  const config = readClaudeConfig();
  const dirs = config.additionalDirectories || [];

  if (dirs.length === 0) {
    console.log(chalk.yellow(`  ${t.noVaultSetup}`));
    return;
  }

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.log(`\n  ${chalk.red("●")} ${dir} ${chalk.dim(`(${t.notFound})`)}\n`);
      continue;
    }

    console.log(`\n  ${chalk.green("●")} ${chalk.bold("Vault:")} ${dir}\n`);

    // Scan projects
    const projectsDir = path.join(dir, "projects");
    if (!fs.existsSync(projectsDir)) {
      console.log(chalk.dim(`  ${t.statusNoProjects}\n`));
      continue;
    }

    const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    if (projects.length === 0) {
      console.log(chalk.dim(`  ${t.statusNoProjects}\n`));
      continue;
    }

    console.log(chalk.bold(`  ${t.statusProjects} (${projects.length}):\n`));

    for (const project of projects) {
      const projectPath = path.join(projectsDir, project);
      const displayName = project
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      // Last session log
      const logFile = path.join(projectPath, "session-log.md");
      let lastSession = chalk.dim(t.statusNoSessions);
      if (fs.existsSync(logFile)) {
        const logContent = fs.readFileSync(logFile, "utf-8");
        const sessionMatch = logContent.match(/## Sesi[oó]n (\d{4}-\d{2}-\d{2}[\s\d:]*)|## Session (\d{4}-\d{2}-\d{2}[\s\d:]*)/);
        if (sessionMatch) {
          const date = (sessionMatch[1] || sessionMatch[2]).trim();
          lastSession = chalk.cyan(date);
        }
      }

      // Backlog pending items
      const backlogFile = path.join(projectPath, "backlog.md");
      let backlogInfo = chalk.dim(t.statusNoBacklog);
      if (fs.existsSync(backlogFile)) {
        const backlogContent = fs.readFileSync(backlogFile, "utf-8");
        const pending = (backlogContent.match(/- \[ \]/g) || []).length;
        const done = (backlogContent.match(/- \[x\]/gi) || []).length;
        if (pending > 0 || done > 0) {
          backlogInfo = chalk.yellow(`${pending} ${t.statusPending}`) + chalk.dim(` / ${done} ${t.statusDone}`);
        }
      }

      console.log(`  ${chalk.bold(displayName)}`);
      console.log(`    ${t.statusLastSession} ${lastSession}`);
      console.log(`    ${t.statusBacklog} ${backlogInfo}`);
      console.log();
    }
  }
}

// ── Project scaffolding ─────────────────────────────────────────────────────

function findVaultPath() {
  const config = readClaudeConfig();
  const dirs = config.additionalDirectories || [];
  for (const dir of dirs) {
    if (fs.existsSync(path.join(dir, "CLAUDE.md"))) {
      return dir;
    }
  }
  if (fs.existsSync(path.join(process.cwd(), "CLAUDE.md"))) {
    return process.cwd();
  }
  return null;
}

async function resolveVaultPath() {
  const config = readClaudeConfig();
  const dirs = config.additionalDirectories || [];
  const vaults = dirs.filter((d) => fs.existsSync(path.join(d, "CLAUDE.md")));

  // Fallback to cwd
  if (vaults.length === 0 && fs.existsSync(path.join(process.cwd(), "CLAUDE.md"))) {
    return process.cwd();
  }

  if (vaults.length === 0) return null;
  if (vaults.length === 1) return vaults[0];

  // Multiple vaults — ask the user
  const choices = vaults.map((v) => ({
    name: `${path.basename(v)} ${chalk.dim(`(${v})`)}`,
    value: v,
  }));

  const { selected } = await inquirer.prompt([
    {
      type: "rawlist",
      name: "selected",
      message: t.selectVault,
      choices,
    },
  ]);

  return selected;
}

async function createProject(projectName) {
  if (!projectName) {
    console.error(chalk.red(`  ${t.errorProjectName}`));
    process.exit(1);
  }

  const vaultPath = await resolveVaultPath();
  if (!vaultPath) {
    console.error(chalk.red(`  ${t.errorNoVault}`));
    process.exit(1);
  }

  const projectDir = path.join(vaultPath, "projects", projectName);

  if (fs.existsSync(projectDir)) {
    console.error(chalk.red(`  ${t.errorProjectExists} ${projectName}`));
    process.exit(1);
  }

  const spinner = ora({
    text: t.creatingProject.replace("{name}", projectName),
    spinner: "dots",
  }).start();

  // Create project directory and decisions subdirectory
  fs.mkdirSync(path.join(projectDir, "decisions"), { recursive: true });

  // Copy and process templates
  const projectTemplateDir = path.join(getTemplatesDir(), "project");
  const displayName = projectName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const templateFiles = ["overview.md", "backlog.md", "architecture.md", "conventions.md", "session-log.md"];

  for (const file of templateFiles) {
    const templatePath = path.join(projectTemplateDir, file);
    if (fs.existsSync(templatePath)) {
      let content = fs.readFileSync(templatePath, "utf-8");
      content = content.replace(/\{PROJECT_NAME\}/g, displayName);
      fs.writeFileSync(path.join(projectDir, file), content);
    }
  }

  // Register project in CLAUDE.md
  registerProjectInClaude(vaultPath, projectName, displayName);

  spinner.succeed(chalk.green(`${t.projectCreated} ${chalk.bold(displayName)}`));

  // Show project structure
  console.log(chalk.bold(`\n  ${t.structure}:\n`));
  console.log(chalk.dim(`  projects/${projectName}/`));
  console.log(`  ├── ${chalk.cyan("overview.md")}`);
  console.log(`  ├── ${chalk.yellow("architecture.md")}`);
  console.log(`  ├── ${chalk.yellow("conventions.md")}`);
  console.log(`  ├── ${chalk.yellow("backlog.md")}`);
  console.log(`  ├── ${chalk.yellow("session-log.md")}`);
  console.log(`  └── ${chalk.dim("decisions/")}`);
  console.log();
}

function registerProjectInClaude(vaultPath, projectName, displayName) {
  const claudePath = path.join(vaultPath, "CLAUDE.md");
  let content = fs.readFileSync(claudePath, "utf-8");

  const projectLink = `- [[projects/${projectName}/overview|${displayName}]]`;

  const startMarker = "<!-- MEMPUNK:PROJECTS:START -->";
  const endMarker = "<!-- MEMPUNK:PROJECTS:END -->";

  if (content.includes(startMarker)) {
    const startIdx = content.indexOf(startMarker) + startMarker.length;
    const endIdx = content.indexOf(endMarker);
    const currentSection = content.substring(startIdx, endIdx).trim();

    if (currentSection.includes(projectName)) return;

    let projects;
    if (currentSection.includes("Ninguno registrado") || currentSection.includes("No projects")) {
      projects = projectLink;
    } else {
      projects = currentSection + "\n" + projectLink;
    }

    content =
      content.substring(0, startIdx) +
      "\n" +
      projects +
      "\n" +
      content.substring(endIdx);
  } else {
    const section = `\n## Proyectos activos\n\n${startMarker}\n${projectLink}\n${endMarker}\n`;
    content += section;
  }

  fs.writeFileSync(claudePath, content);
}

// ── Slash command install ────────────────────────────────────────────────────

function installSlashCommands() {
  const configPath = normalizePath(getClaudeConfigPath());

  // /mempunk — session start (multi-vault aware)
  const mempunkDir = getHomePath(".claude", "skills", "mempunk");
  fs.mkdirSync(mempunkDir, { recursive: true });
  fs.writeFileSync(
    path.join(mempunkDir, "SKILL.md"),
    `---
name: mempunk
description: Load Mempunk vault context — persistent dev brain across sessions. Use when the user types /mempunk or asks to load vault context.
disable-model-invocation: false
allowed-tools: Read Glob Grep
---

This is the Mempunk session start protocol. The user has one or more Mempunk vaults (persistent dev brains).

**Step 1: Discover vaults**

Read the file at "${configPath}" and parse the JSON. Look at the "additionalDirectories" array. For each directory, check if it contains a CLAUDE.md file. Those are Mempunk vaults.

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
`
  );

  // /session-end — session close (multi-vault aware)
  const sessionEndDir = getHomePath(".claude", "skills", "session-end");
  fs.mkdirSync(sessionEndDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionEndDir, "SKILL.md"),
    `---
name: session-end
description: Close the current session and write the session log. Use when the user types /session-end, says they're done, or wants to close the session.
disable-model-invocation: false
allowed-tools: Read Write Glob Grep
---

The user wants to close this session. You MUST write a session log entry before ending.

**Step 1: Identify the active vault**

If you loaded a vault via /mempunk earlier in this session, use that vault. Otherwise, read "${configPath}", parse the JSON, and find Mempunk vaults in "additionalDirectories" (directories that contain CLAUDE.md). If multiple vaults exist and you don't know which was active, ask the user.

**Step 2: Write the session log**

1. Identify which project(s) were worked on in this session
2. Find the session-log.md file for each project in the active vault
   - The path is: [vault-path]/projects/[project-name]/session-log.md
3. Write a new entry AT THE TOP of the file (most recent first), below the frontmatter/header, using this exact format:

\\\`\\\`\\\`markdown
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
\\\`\\\`\\\`

4. If the project has a conventions.md, check if any conventions were established or changed during this session and note them in "Decisions made"
5. Use the ACTUAL current date and time for the entry
6. Be specific — list real file names, real changes, real decisions
7. After writing the log, confirm to the user what was logged and for which project

IMPORTANT: If you used /mempunk at the start and know which project was active, write the log there. If multiple projects were worked on, write a log entry for each. If no project context exists, ask the user which project this session was for.
`
  );
}

// ── Parse global flags ──────────────────────────────────────────────────────

function parseGlobalFlags(args) {
  let lang = null;
  const filtered = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--lang" && args[i + 1]) {
      lang = args[++i];
      if (!getAvailableLanguages().includes(lang)) {
        console.error(
          chalk.red(`  ${t.errorUnknownLang} ${lang}. ${t.availableLangs} ${getAvailableLanguages().join(", ")}`)
        );
        process.exit(1);
      }
    } else {
      filtered.push(args[i]);
    }
  }

  return { lang, args: filtered };
}

// ── Log (open session-log) ───────────────────────────────────────────────────

import { execSync } from "child_process";

async function openLog(projectName) {
  if (!projectName) {
    console.error(chalk.red(`  ${t.errorLogProjectName}`));
    process.exit(1);
  }

  const vaultPath = await resolveVaultPath();
  if (!vaultPath) {
    console.error(chalk.red(`  ${t.errorNoVault}`));
    process.exit(1);
  }

  const logFile = path.join(vaultPath, "projects", projectName, "session-log.md");

  if (!fs.existsSync(logFile)) {
    console.error(chalk.red(`  ${t.errorLogNotFound} ${projectName}`));
    process.exit(1);
  }

  const platform = process.platform;
  const cmd =
    platform === "win32" ? `start "" "${logFile}"` :
    platform === "darwin" ? `open "${logFile}"` :
    `xdg-open "${logFile}"`;

  execSync(cmd, { stdio: "ignore", shell: true });
  console.log(chalk.green(`  ✔ ${t.logOpened} ${projectName}`));
}

// ── Backlog viewer ──────────────────────────────────────────────────────────

async function showBacklog(projectName) {
  if (!projectName) {
    console.error(chalk.red(`  ${t.errorBacklogProjectName}`));
    process.exit(1);
  }

  const vaultPath = await resolveVaultPath();
  if (!vaultPath) {
    console.error(chalk.red(`  ${t.errorNoVault}`));
    process.exit(1);
  }

  const backlogFile = path.join(vaultPath, "projects", projectName, "backlog.md");

  if (!fs.existsSync(backlogFile)) {
    console.error(chalk.red(`  ${t.errorBacklogNotFound} ${projectName}`));
    process.exit(1);
  }

  const content = fs.readFileSync(backlogFile, "utf-8");
  const lines = content.split("\n");

  const displayName = projectName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  console.log(chalk.bold(`\n  ${t.backlogTitle} ${displayName}\n`));

  let currentSection = null;
  let pendingCount = 0;
  let doneCount = 0;

  for (const line of lines) {
    // Section headers
    const sectionMatch = line.match(/^## (.+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      console.log(chalk.bold.underline(`  ${currentSection}\n`));
      continue;
    }

    // Skip top-level header and nav links
    if (line.startsWith("# ") || line.startsWith(">") || line.startsWith("<!--")) continue;

    // Pending items
    if (line.match(/^- \[ \]/)) {
      const text = line.replace(/^- \[ \]\s*/, "");
      console.log(`  ${chalk.yellow("○")} ${text}`);
      pendingCount++;
      continue;
    }

    // Done items
    if (line.match(/^- \[x\]/i)) {
      const text = line.replace(/^- \[x\]\s*/i, "");
      console.log(`  ${chalk.green("✔")} ${chalk.dim(text)}`);
      doneCount++;
      continue;
    }
  }

  // Summary
  console.log(
    boxen(
      `${chalk.yellow(`${pendingCount} ${t.statusPending}`)}  ${chalk.dim("│")}  ${chalk.green(`${doneCount} ${t.statusDone}`)}`,
      {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        margin: { top: 1, bottom: 1, left: 1, right: 1 },
        borderStyle: "round",
        borderColor: "dim",
      }
    )
  );
}

// ── Doctor (vault integrity check) ─────────────────────────────────────────

async function doctor() {
  const vaultPath = await resolveVaultPath();
  if (!vaultPath) {
    console.error(chalk.red(`  ${t.errorNoVault}`));
    process.exit(1);
  }

  console.log(chalk.bold(`\n  ${t.doctorTitle}\n`));
  console.log(chalk.dim(`  ${t.doctorVaultPath} ${vaultPath}\n`));

  let issues = 0;
  let warnings = 0;

  // 1. Check CLAUDE.md exists and has project markers
  const claudePath = path.join(vaultPath, "CLAUDE.md");
  if (!fs.existsSync(claudePath)) {
    console.log(`  ${chalk.red("✘")} ${t.doctorNoClaude}`);
    issues++;
  } else {
    console.log(`  ${chalk.green("✔")} ${t.doctorClaudeOk}`);

    const claudeContent = fs.readFileSync(claudePath, "utf-8");
    const hasMarkers = claudeContent.includes("<!-- MEMPUNK:PROJECTS:START -->");
    if (!hasMarkers) {
      console.log(`  ${chalk.yellow("!")} ${t.doctorNoMarkers}`);
      warnings++;
    }

    // 2. Check registered vs actual projects
    const registeredProjects = [];
    if (hasMarkers) {
      const startMarker = "<!-- MEMPUNK:PROJECTS:START -->";
      const endMarker = "<!-- MEMPUNK:PROJECTS:END -->";
      const startIdx = claudeContent.indexOf(startMarker) + startMarker.length;
      const endIdx = claudeContent.indexOf(endMarker);
      const section = claudeContent.substring(startIdx, endIdx);
      const matches = section.matchAll(/projects\/([^/]+)\//g);
      for (const match of matches) {
        registeredProjects.push(match[1]);
      }
    }

    const projectsDir = path.join(vaultPath, "projects");
    const actualProjects = fs.existsSync(projectsDir)
      ? fs.readdirSync(projectsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      : [];

    // Registered but not on disk
    for (const proj of registeredProjects) {
      if (!actualProjects.includes(proj)) {
        console.log(`  ${chalk.red("✘")} ${t.doctorGhostProject} ${chalk.bold(proj)}`);
        issues++;
      }
    }

    // On disk but not registered
    for (const proj of actualProjects) {
      if (!registeredProjects.includes(proj)) {
        console.log(`  ${chalk.yellow("!")} ${t.doctorOrphanProject} ${chalk.bold(proj)}`);
        warnings++;
      }
    }
  }

  // 3. Check each project's files
  const projectsDir = path.join(vaultPath, "projects");
  if (fs.existsSync(projectsDir)) {
    const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const expectedFiles = ["overview.md", "architecture.md", "conventions.md", "backlog.md", "session-log.md"];

    for (const project of projects) {
      const projectDir = path.join(projectsDir, project);
      const missingFiles = [];

      for (const file of expectedFiles) {
        if (!fs.existsSync(path.join(projectDir, file))) {
          missingFiles.push(file);
        }
      }

      if (!fs.existsSync(path.join(projectDir, "decisions"))) {
        missingFiles.push("decisions/");
      }

      if (missingFiles.length > 0) {
        const displayName = project.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        console.log(`  ${chalk.yellow("!")} ${chalk.bold(displayName)}: ${t.doctorMissingFiles} ${chalk.dim(missingFiles.join(", "))}`);
        warnings++;
      }
    }
  }

  // 4. Check slash commands installed
  const mempunkSkill = getHomePath(".claude", "skills", "mempunk", "SKILL.md");
  const sessionEndSkill = getHomePath(".claude", "skills", "session-end", "SKILL.md");

  if (!fs.existsSync(mempunkSkill)) {
    console.log(`  ${chalk.yellow("!")} ${t.doctorNoMempunkSkill}`);
    warnings++;
  } else {
    console.log(`  ${chalk.green("✔")} ${t.doctorMempunkSkillOk}`);
  }

  if (!fs.existsSync(sessionEndSkill)) {
    console.log(`  ${chalk.yellow("!")} ${t.doctorNoSessionEndSkill}`);
    warnings++;
  } else {
    console.log(`  ${chalk.green("✔")} ${t.doctorSessionEndSkillOk}`);
  }

  // Summary
  console.log();
  if (issues === 0 && warnings === 0) {
    console.log(chalk.green(`  ✔ ${t.doctorAllGood}`));
  } else {
    if (issues > 0) {
      console.log(chalk.red(`  ✘ ${issues} ${t.doctorIssues}`));
    }
    if (warnings > 0) {
      console.log(chalk.yellow(`  ! ${warnings} ${t.doctorWarnings}`));
    }
    if (warnings > 0) {
      console.log(chalk.dim(`\n  ${t.doctorRunSync}`));
    }
  }
  console.log();
}

// ── Sync (upgrade existing vaults/projects) ────────────────────────────────

async function syncVault() {
  const vaultPath = await resolveVaultPath();
  if (!vaultPath) {
    console.error(chalk.red(`  ${t.errorNoVault}`));
    process.exit(1);
  }

  const projectsDir = path.join(vaultPath, "projects");
  if (!fs.existsSync(projectsDir)) {
    console.log(chalk.yellow(`  ${t.statusNoProjects}`));
    return;
  }

  const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (projects.length === 0) {
    console.log(chalk.yellow(`  ${t.statusNoProjects}`));
    return;
  }

  const projectTemplateDir = path.join(getTemplatesDir(), "project");
  const templateFiles = fs.readdirSync(projectTemplateDir).filter((f) => f.endsWith(".md"));

  let totalCreated = 0;

  console.log(chalk.bold(`\n  ${t.syncScanning} ${projects.length} ${t.syncProjects}...\n`));

  for (const project of projects) {
    const projectDir = path.join(projectsDir, project);
    const displayName = project
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    const missing = [];

    for (const file of templateFiles) {
      const filePath = path.join(projectDir, file);
      if (!fs.existsSync(filePath)) {
        // Create from template
        const templatePath = path.join(projectTemplateDir, file);
        let content = fs.readFileSync(templatePath, "utf-8");
        content = content.replace(/\{PROJECT_NAME\}/g, displayName);
        fs.writeFileSync(filePath, content);
        missing.push(file);
      }
    }

    // Ensure decisions/ directory exists
    const decisionsDir = path.join(projectDir, "decisions");
    if (!fs.existsSync(decisionsDir)) {
      fs.mkdirSync(decisionsDir, { recursive: true });
      missing.push("decisions/");
    }

    if (missing.length > 0) {
      console.log(`  ${chalk.green("+")} ${chalk.bold(displayName)}`);
      for (const file of missing) {
        console.log(`    ${chalk.dim("└")} ${chalk.cyan(file)}`);
      }
      totalCreated += missing.length;
    } else {
      console.log(`  ${chalk.dim("✔")} ${chalk.dim(displayName)} ${chalk.dim(`(${t.syncUpToDate})`)}`);
    }
  }

  console.log();
  if (totalCreated > 0) {
    console.log(chalk.green(`  ✔ ${t.syncDone} ${totalCreated} ${t.syncFilesCreated}`));
  } else {
    console.log(chalk.green(`  ✔ ${t.syncAllUpToDate}`));
  }
  console.log();
}

// ── Remove project ─────────────────────────────────────────────────────────

async function removeProject(projectName) {
  if (!projectName) {
    console.error(chalk.red(`  ${t.errorRemoveProjectName}`));
    process.exit(1);
  }

  const vaultPath = await resolveVaultPath();
  if (!vaultPath) {
    console.error(chalk.red(`  ${t.errorNoVault}`));
    process.exit(1);
  }

  const projectDir = path.join(vaultPath, "projects", projectName);

  if (!fs.existsSync(projectDir)) {
    console.error(chalk.red(`  ${t.errorRemoveNotFound} ${projectName}`));
    process.exit(1);
  }

  const displayName = projectName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  // Show what will be deleted
  console.log(chalk.yellow(`\n  ${t.removeWarning} ${chalk.bold(displayName)}\n`));
  console.log(chalk.dim(`  ${t.removePath} ${projectDir}\n`));

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: t.removeConfirm.replace("{name}", displayName),
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.dim(`  ${t.removeCancelled}`));
    return;
  }

  const spinner = ora({
    text: t.removingProject.replace("{name}", projectName),
    spinner: "dots",
  }).start();

  // Delete project directory
  fs.rmSync(projectDir, { recursive: true, force: true });

  // Unregister from CLAUDE.md
  unregisterProjectFromClaude(vaultPath, projectName);

  spinner.succeed(chalk.green(`${t.projectRemoved} ${chalk.bold(displayName)}`));
}

function unregisterProjectFromClaude(vaultPath, projectName) {
  const claudePath = path.join(vaultPath, "CLAUDE.md");
  if (!fs.existsSync(claudePath)) return;

  let content = fs.readFileSync(claudePath, "utf-8");

  const startMarker = "<!-- MEMPUNK:PROJECTS:START -->";
  const endMarker = "<!-- MEMPUNK:PROJECTS:END -->";

  if (!content.includes(startMarker)) return;

  const startIdx = content.indexOf(startMarker) + startMarker.length;
  const endIdx = content.indexOf(endMarker);
  const currentSection = content.substring(startIdx, endIdx);

  // Remove the line that references this project
  const lines = currentSection.split("\n").filter((line) => {
    return !line.includes(`projects/${projectName}/`);
  });

  const newSection = lines.join("\n");

  content =
    content.substring(0, startIdx) +
    newSection +
    content.substring(endIdx);

  fs.writeFileSync(claudePath, content);
}

// ── Help ─────────────────────────────────────────────────────────────────────

async function showHelp(lang) {
  if (!lang) {
    const { language } = await inquirer.prompt([
      {
        type: "rawlist",
        name: "language",
        message: t.selectLanguage,
        choices: [
          { name: "English", value: "en" },
          { name: "Español", value: "es" },
          { name: "Português", value: "pt" },
          { name: "Français", value: "fr" },
        ],
      },
    ]);
    t = getTranslations(language);
  }
  console.log(t.help);
}

// ── Version ──────────────────────────────────────────────────────────────────

function showVersion() {
  const pkgPath = path.join(__dirname, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  console.log(`  mempunk v${pkg.version}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const { lang, args } = parseGlobalFlags(process.argv.slice(2));

  if (lang) {
    t = getTranslations(lang);
  }

  const [command, ...rest] = args;

  switch (command) {
    case "setup":
      return setup(lang);
    case "init":
      return initFromArgs(rest);
    case "link":
      return linkVault(rest[0]);
    case "project":
      return createProject(rest[0]);
    case "remove":
      return removeProject(rest[0]);
    case "sync":
      return syncVault();
    case "doctor":
      return doctor();
    case "log":
      return openLog(rest[0]);
    case "backlog":
      return showBacklog(rest[0]);
    case "unlink":
      return unlink(rest[0]);
    case "status":
      return status();
    case "help":
    case "--help":
    case "-h":
      return showHelp(lang);
    case "--version":
    case "-v":
      return showVersion();
    default:
      if (!command) return setup(lang);
      console.log(t.help);
      process.exit(1);
  }
}

main();
