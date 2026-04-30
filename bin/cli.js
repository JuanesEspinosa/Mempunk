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
import { getAdapter, listAdapters } from "./adapters/index.js";
import { getHomePath } from "./adapters/base.js";
import { getActiveCLI, setActiveCLI, getActiveCLIs, addCLI, removeCLI } from "./config.js";

// ── Global state ─────────────────────────────────────────────────────────────

let t = getTranslations("en");

// CLI adapter resolved fresh each call so changes to ~/.mempunk/config.json
// (e.g. during setup) take effect immediately.
function adapter() {
  const a = getAdapter(getActiveCLI());
  if (typeof a.onCorruptConfig === "function") {
    a.onCorruptConfig((cfgPath, err) => {
      console.warn(chalk.yellow(`  ${t.warnCorruptConfig} ${cfgPath}`));
      console.warn(chalk.dim(`  ${err.message}`));
    });
  }
  return a;
}

// All active CLI adapters (v1.4 multi-CLI).
function allAdapters() {
  return getActiveCLIs().map((name) => {
    const a = getAdapter(name);
    if (typeof a.onCorruptConfig === "function") {
      a.onCorruptConfig((cfgPath, err) => {
        console.warn(chalk.yellow(`  ${t.warnCorruptConfig} ${cfgPath}`));
        console.warn(chalk.dim(`  ${err.message}`));
      });
    }
    return a;
  });
}

function runWrite(fn) {
  try {
    fn();
  } catch (err) {
    if (err.code === "WRITE_CONFIG_ERROR") {
      console.error(chalk.red(`  ${t.errorWriteConfig} ${err.cause?.message || err.message}`));
      process.exit(1);
    }
    throw err;
  }
}

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
  console.log(chalk.dim("  Persistent dev brain for AI coding CLIs\n"));
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
    chalk.bold(t.promptTitle.replace("{cli}", adapter().displayName)) +
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

  // CLI selection — persisted in ~/.mempunk/config.json. v1.4: multiple CLIs.
  const { chosenCLIs } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "chosenCLIs",
      message: t.selectCLIs || t.selectCLI,
      choices: listAdapters().map((a) => ({
        name: a.displayName,
        value: a.name,
        checked: a.name === "claude-code",
      })),
      validate: (input) => input.length > 0 || t.errorSelectOne,
    },
  ]);
  // Set first as primary, store all
  setActiveCLI(chosenCLIs[0]);
  for (const cli of chosenCLIs.slice(1)) addCLI(cli);

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
        message: t.linkExisting.replace("{cli}", adapter().displayName),
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
      message: t.linkQuestion.replace("{cli}", adapter().displayName),
      default: true,
    },
  ]);

  // Execute
  initVault(resolved, folders);

  if (shouldLink) {
    linkVault(resolved, false);
  }

  showTree(resolved, folders);

  console.log(chalk.green(`  ✔ ${t.done.replace("{cli}", adapter().displayName)}\n`));

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

  const adapters = allAdapters();

  // Check if already linked in all CLIs
  const allLinked = adapters.every((a) => a.getRegisteredDirs().includes(normalized));
  if (allLinked) {
    console.log(chalk.yellow(`  ${t.alreadyLinked} ${normalized}\n`));
    if (showPromptAfter) showPrompt(normalized);
    return;
  }

  const cliNames = adapters.map((a) => a.displayName).join(", ");
  const spinner = ora({
    text: adapters.length > 1
      ? t.cliLinkingAll.replace("{count}", adapters.length)
      : t.linkingVault.replace("{cli}", adapters[0].displayName),
    spinner: "dots",
  }).start();

  runWrite(() => {
    for (const a of adapters) a.addDir(normalized);
  });

  spinner.succeed(chalk.green(`${t.vaultLinked} ${chalk.bold(normalized)}`));

  // Install/update slash commands for all CLIs
  const spinnerSkill = ora({
    text: adapters.length > 1
      ? t.cliInstallingSkills.replace("{count}", adapters.length)
      : t.installingSkill,
    spinner: "dots",
  }).start();
  for (const a of adapters) a.installSkills();
  spinnerSkill.succeed(chalk.green(t.skillInstalled));

  console.log(chalk.dim(`  ${t.linkSuccess.replace("{cli}", cliNames)}\n`));

  if (showPromptAfter) showPrompt(normalized);
}

async function unlink(specificPath) {
  const adapters = allAdapters();

  // Aggregate all registered dirs across all CLIs (deduplicated)
  const allDirs = [...new Set(adapters.flatMap((a) => a.getRegisteredDirs()))];

  if (allDirs.length === 0) {
    console.log(chalk.yellow(`  ${t.noVaultLinked}`));
    return;
  }

  // Filter to only Mempunk vaults (dirs with CLAUDE.md)
  const vaults = allDirs.filter((d) => fs.existsSync(path.join(d, "CLAUDE.md")));

  if (specificPath) {
    const normalized = normalizePath(path.resolve(specificPath));
    if (!allDirs.includes(normalized)) {
      console.log(chalk.yellow(`  ${t.notLinked} ${normalized}`));
      return;
    }
    runWrite(() => {
      for (const a of adapters) a.removeDir(normalized);
    });
    cleanupAutoStartIfNoVaults(adapters);
    console.log(chalk.green(`  ✔ ${t.vaultUnlinked} ${chalk.dim(normalized)}`));
    return;
  }

  if (vaults.length === 1) {
    runWrite(() => {
      for (const a of adapters) a.removeDir(vaults[0]);
    });
    cleanupAutoStartIfNoVaults(adapters);
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
    runWrite(() => {
      for (const v of vaults) {
        for (const a of adapters) a.removeDir(v);
      }
    });
    cleanupAutoStartIfNoVaults(adapters);
    console.log(chalk.green(`  ✔ ${t.allVaultsUnlinked}`));
  } else {
    runWrite(() => {
      for (const a of adapters) a.removeDir(selected);
    });
    cleanupAutoStartIfNoVaults(adapters);
    console.log(chalk.green(`  ✔ ${t.vaultUnlinked} ${chalk.dim(selected)}`));
  }
}

function status() {
  const adapters = allAdapters();
  const cliNames = adapters.map((a) => a.displayName).join(", ");
  const dirs = [...new Set(adapters.flatMap((a) => a.getRegisteredDirs()))];

  if (dirs.length === 0) {
    console.log(chalk.yellow(`  ${t.noVaultSetup}`));
    return;
  }

  console.log(chalk.dim(`\n  CLIs: ${cliNames}`));

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
  const dirs = [...new Set(allAdapters().flatMap((a) => a.getRegisteredDirs()))];
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
  const dirs = [...new Set(allAdapters().flatMap((a) => a.getRegisteredDirs()))];
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

  const templateFiles = ["INDEX.md", "overview.md", "backlog.md", "architecture.md", "conventions.md", "session-log.md"];

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
  console.log(`  ├── ${chalk.cyan("INDEX.md")}`);
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

  const projectLink = `- [[projects/${projectName}/INDEX|${displayName}]]`;

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

  // 4. Check slash commands installed for all active CLIs
  for (const a of allAdapters()) {
    const skills = a.verifySkills();
    const label = allAdapters().length > 1 ? ` (${a.displayName})` : "";
    if (skills.missing.includes("mempunk")) {
      console.log(`  ${chalk.yellow("!")} ${t.doctorNoMempunkSkill}${label}`);
      warnings++;
    } else {
      console.log(`  ${chalk.green("✔")} ${t.doctorMempunkSkillOk}${label}`);
    }

    if (skills.missing.includes("session-end")) {
      console.log(`  ${chalk.yellow("!")} ${t.doctorNoSessionEndSkill}${label}`);
      warnings++;
    } else {
      console.log(`  ${chalk.green("✔")} ${t.doctorSessionEndSkillOk}${label}`);
    }
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

// ── CLI management (v1.4) ───────────────────────────────────────────────────

function cliCommand(subcommand, cliName) {
  const validNames = listAdapters().map((a) => a.name);

  switch (subcommand) {
    case "add": {
      if (!cliName) {
        console.error(chalk.red(`  ${t.cliNameRequired}`));
        process.exit(1);
      }
      if (!validNames.includes(cliName)) {
        console.error(chalk.red(`  ${t.cliUnknown} ${cliName}`));
        console.error(chalk.dim(`  ${t.cliAvailable} ${validNames.join(", ")}`));
        process.exit(1);
      }
      const a = getAdapter(cliName);
      if (!a.isInstalled()) {
        console.log(chalk.yellow(`  ${t.cliNotInstalled.replace("{cli}", a.displayName)}`));
      }
      if (!addCLI(cliName)) {
        console.log(chalk.yellow(`  ${t.cliAlreadyActive} ${a.displayName}`));
        return;
      }
      console.log(chalk.green(`  ✔ ${t.cliAddSuccess} ${chalk.bold(a.displayName)}`));
      // Re-register existing vaults and install skills for the new CLI
      const primaryDirs = adapter().getRegisteredDirs();
      if (primaryDirs.length > 0) {
        runWrite(() => {
          for (const dir of primaryDirs) a.addDir(dir);
        });
        a.installSkills();
        console.log(chalk.dim(`  ${primaryDirs.length} vault(s) synced to ${a.displayName}`));
      }
      return;
    }
    case "remove": {
      if (!cliName) {
        console.error(chalk.red(`  ${t.cliNameRequired}`));
        process.exit(1);
      }
      if (!validNames.includes(cliName)) {
        console.error(chalk.red(`  ${t.cliUnknown} ${cliName}`));
        console.error(chalk.dim(`  ${t.cliAvailable} ${validNames.join(", ")}`));
        process.exit(1);
      }
      const activeCLIs = getActiveCLIs();
      if (activeCLIs.length <= 1 && activeCLIs.includes(cliName)) {
        console.log(chalk.yellow(`  ${t.cliCannotRemoveLast}`));
        return;
      }
      const a2 = getAdapter(cliName);
      if (!removeCLI(cliName)) {
        console.log(chalk.yellow(`  ${t.cliNotActive} ${a2.displayName}`));
        return;
      }
      console.log(chalk.green(`  ✔ ${t.cliRemoveSuccess} ${chalk.bold(a2.displayName)}`));
      return;
    }
    case "list": {
      const active = getActiveCLIs();
      console.log(chalk.bold(`\n  ${t.cliListTitle}\n`));
      for (const name of active) {
        const a = getAdapter(name);
        const installed = a.isInstalled() ? chalk.green("●") : chalk.yellow("○");
        console.log(`  ${installed} ${chalk.bold(a.displayName)} ${chalk.dim(`(${a.name})`)}`);
      }
      console.log();
      return;
    }
    default:
      console.error(chalk.red(`  ${t.cliNameRequired}`));
      process.exit(1);
  }
}

// ── Auto-start ──────────────────────────────────────────────────────────────

const MEMPUNK_HOOK_MARKER = "mempunk-auto-start";

function getClaudeSettingsPath() {
  return getHomePath(".claude", "settings.json");
}

function readClaudeSettings() {
  const settingsPath = getClaudeSettingsPath();
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  } catch {
    return {};
  }
}

function writeClaudeSettings(settings) {
  const settingsPath = getClaudeSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

function isMempunkHook(hookGroup) {
  return hookGroup.matcher === MEMPUNK_HOOK_MARKER ||
    (hookGroup.hooks && hookGroup.hooks.some((h) => h.prompt && h.prompt.includes("/mempunk")));
}

function isAutoStartEnabled() {
  const settings = readClaudeSettings();
  if (!settings.hooks || !settings.hooks.SessionStart) return false;
  return settings.hooks.SessionStart.some(isMempunkHook);
}

function enableAutoStart() {
  const settings = readClaudeSettings();
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

  // Don't add if already present
  if (settings.hooks.SessionStart.some(isMempunkHook)) return;

  settings.hooks.SessionStart.push({
    matcher: MEMPUNK_HOOK_MARKER,
    hooks: [
      {
        type: "prompt",
        prompt: "The user has mempunk auto-start enabled. Run the /mempunk slash command now to load the vault context.",
      },
    ],
  });

  writeClaudeSettings(settings);
}

function disableAutoStart() {
  const settings = readClaudeSettings();
  if (!settings.hooks || !settings.hooks.SessionStart) return;

  settings.hooks.SessionStart = settings.hooks.SessionStart.filter((g) => !isMempunkHook(g));

  // Clean up empty arrays
  if (settings.hooks.SessionStart.length === 0) delete settings.hooks.SessionStart;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

  writeClaudeSettings(settings);
}

function cleanupAutoStartIfNoVaults(adapters) {
  const remaining = [...new Set(adapters.flatMap((a) => a.getRegisteredDirs()))];
  if (remaining.length === 0 && isAutoStartEnabled()) {
    disableAutoStart();
  }
}

function autoStart(action) {
  // Only works with claude-code
  const activeCLIs = getActiveCLIs();
  if (!activeCLIs.includes("claude-code")) {
    console.log(chalk.yellow(`  ${t.autoStartOnlyClaudeCode}`));
    return;
  }

  switch (action) {
    case "on":
      enableAutoStart();
      console.log(chalk.green(`  ✔ ${t.autoStartEnabled}`));
      return;
    case "off":
      disableAutoStart();
      console.log(chalk.green(`  ✔ ${t.autoStartDisabled}`));
      return;
    default: {
      const enabled = isAutoStartEnabled();
      console.log(`  ${t.autoStartStatus} ${enabled ? chalk.green(t.autoStartOn) : chalk.yellow(t.autoStartOff)}`);
      console.log(chalk.dim(`  ${t.autoStartUsage}`));
      return;
    }
  }
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
    case "cli":
      return cliCommand(rest[0], rest[1]);
    case "auto-start":
      return autoStart(rest[0]);
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
