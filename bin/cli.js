#!/usr/bin/env node

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
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
  console.log(
    chalk.dim("  Persistent dev brain for Claude Code\n")
  );
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
    showPrompt(resolved);
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
        validate: (input) => input.length > 0 || "Select at least one folder",
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

  showPrompt(resolved);
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
  const templateFile = path.join(
    new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    "..",
    "templates",
    "CLAUDE.md"
  );
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

function adjustTemplate(content, folders) {
  const allFolders = ["projects", "areas", "resources", "daily"];
  const missing = allFolders.filter((f) => !folders.includes(f));

  for (const folder of missing) {
    const patterns = [
      new RegExp(`^.*├── ${folder}/.*$`, "gm"),
      new RegExp(`^.*└── ${folder}/.*$`, "gm"),
      new RegExp(`^.*${folder}.*#.*$`, "gm"),
    ];
    for (const pattern of patterns) {
      content = content.replace(pattern, "");
    }
  }

  content = content.replace(/\n{3,}/g, "\n\n");
  return content;
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

function getClaudeConfigPath() {
  const home = process.env.HOME || process.env.USERPROFILE;
  return path.join(home, ".claude.json");
}

function readClaudeConfig() {
  const configPath = getClaudeConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

function writeClaudeConfig(config) {
  fs.writeFileSync(getClaudeConfigPath(), JSON.stringify(config, null, 2) + "\n");
}

function linkVault(vaultPath, showPromptAfter = true) {
  if (!vaultPath) {
    console.error(chalk.red(`  ${t.errorPathRequired}`));
    process.exit(1);
  }

  const resolved = path.resolve(vaultPath);

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
  const normalizedPath = resolved.replace(/\\/g, "/");
  const dirs = config.additionalDirectories || [];

  if (dirs.includes(normalizedPath)) {
    console.log(chalk.yellow(`  ${t.alreadyLinked} ${normalizedPath}\n`));
    if (showPromptAfter) showPrompt(normalizedPath);
    return;
  }

  const spinner = ora({
    text: t.linkingVault,
    spinner: "dots",
  }).start();

  config.additionalDirectories = [...dirs, normalizedPath];
  writeClaudeConfig(config);

  spinner.succeed(chalk.green(`${t.vaultLinked} ${chalk.bold(normalizedPath)}`));

  // Install /mempunk slash command
  const spinnerSkill = ora({
    text: t.installingSkill,
    spinner: "dots",
  }).start();
  installSlashCommand(normalizedPath);
  spinnerSkill.succeed(chalk.green(t.skillInstalled));

  console.log(chalk.dim(`  ${t.linkSuccess}\n`));
}

function unlink() {
  const config = readClaudeConfig();
  if (!config.additionalDirectories || config.additionalDirectories.length === 0) {
    console.log(chalk.yellow(`  ${t.noVaultLinked}`));
    return;
  }
  delete config.additionalDirectories;
  writeClaudeConfig(config);
  console.log(chalk.green(`  ✔ ${t.vaultUnlinked}`));
}

function status() {
  const config = readClaudeConfig();
  const dirs = config.additionalDirectories || [];

  if (dirs.length === 0) {
    console.log(chalk.yellow(`  ${t.noVaultSetup}`));
    return;
  }

  console.log(chalk.bold(`\n  ${t.linkedVaults}\n`));
  for (const dir of dirs) {
    const exists = fs.existsSync(dir);
    if (exists) {
      console.log(`  ${chalk.green("●")} ${dir}`);
    } else {
      console.log(`  ${chalk.red("●")} ${dir} ${chalk.dim(`(${t.notFound})`)}`);
    }
  }
  console.log();
}

// ── Project scaffolding ─────────────────────────────────────────────────────

function getTemplatesDir() {
  return path.join(
    new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    "..",
    "templates"
  );
}

function findVaultPath() {
  const config = readClaudeConfig();
  const dirs = config.additionalDirectories || [];
  // Find first linked vault that has CLAUDE.md
  for (const dir of dirs) {
    if (fs.existsSync(path.join(dir, "CLAUDE.md"))) {
      return dir;
    }
  }
  // Check current directory
  if (fs.existsSync(path.join(process.cwd(), "CLAUDE.md"))) {
    return process.cwd();
  }
  return null;
}

function createProject(projectName) {
  if (!projectName) {
    console.error(chalk.red(`  ${t.errorProjectName}`));
    process.exit(1);
  }

  const vaultPath = findVaultPath();
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
  const templatesDir = getTemplatesDir();
  const projectTemplateDir = path.join(templatesDir, "project");
  const displayName = projectName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const templateFiles = ["overview.md", "backlog.md", "architecture.md", "session-log.md"];

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
    // Extract current project list
    const startIdx = content.indexOf(startMarker) + startMarker.length;
    const endIdx = content.indexOf(endMarker);
    const currentSection = content.substring(startIdx, endIdx).trim();

    // Check if project already registered
    if (currentSection.includes(projectName)) return;

    // Build new section
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
    // No markers found — append section
    const section = `\n## Proyectos activos\n\n${startMarker}\n${projectLink}\n${endMarker}\n`;
    content += section;
  }

  fs.writeFileSync(claudePath, content);
}

// ── Slash command install ────────────────────────────────────────────────────

function installSlashCommand(vaultPath) {
  const home = process.env.HOME || process.env.USERPROFILE;
  const skillDir = path.join(home, ".claude", "skills", "mempunk");
  const skillFile = path.join(skillDir, "SKILL.md");

  const normalizedPath = vaultPath.replace(/\\/g, "/");

  const content = `---
name: mempunk
description: Load Mempunk vault context — persistent dev brain across sessions. Use when the user types /mempunk or asks to load vault context.
disable-model-invocation: false
allowed-tools: Read Glob Grep
---

Read the CLAUDE.md file at "${normalizedPath}" and follow the session start protocol defined there.

This is the user's Mempunk vault — a persistent dev brain across sessions. It contains:
- Project overviews, architecture docs, and backlogs
- Session logs from previous Claude Code sessions
- Architecture Decision Records
- Reusable technical knowledge

After reading CLAUDE.md, follow the session start protocol:
1. Identify which project(s) the user wants to work on
2. Read the project's overview.md
3. Read the last 3 entries of the project's session-log.md
4. Read the project's backlog.md
5. Confirm context with the user before proceeding
`;

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(skillFile, content);

  return skillFile;
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
          chalk.red(`  Unknown language: ${lang}. Available: ${getAvailableLanguages().join(", ")}`)
        );
        process.exit(1);
      }
    } else {
      filtered.push(args[i]);
    }
  }

  return { lang, args: filtered };
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
    case "unlink":
      return unlink();
    case "status":
      return status();
    case "help":
    case "--help":
    case "-h":
      return console.log(t.help);
    default:
      if (!command) return setup(lang);
      console.log(t.help);
      process.exit(1);
  }
}

main();
