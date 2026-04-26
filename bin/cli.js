#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { getTranslations, getAvailableLanguages } = require("./i18n");

// ── Global state ─────────────────────────────────────────────────────────────

let t = getTranslations("en");

// ── Presets ──────────────────────────────────────────────────────────────────

const PRESETS = {
  full: { folders: ["projects", "areas", "resources", "daily"] },
  standard: { folders: ["projects", "resources", "daily"] },
  minimal: { folders: ["projects"] },
};

// ── Prompt helpers ───────────────────────────────────────────────────────────

function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question, defaultValue) {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

function askYesNo(rl, question, defaultYes = true) {
  const hint = defaultYes ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`  ${question} (${hint}): `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === "") resolve(defaultYes);
      else resolve(a === "y" || a === "yes" || a === "s" || a === "si");
    });
  });
}

function askChoice(rl, question, options) {
  return new Promise((resolve) => {
    console.log(`\n  ${question}\n`);
    options.forEach((opt, i) => {
      console.log(`    ${i + 1}) ${opt.label}`);
    });
    console.log();
    rl.question(`  ${t.choose}: `, (answer) => {
      const index = parseInt(answer.trim(), 10) - 1;
      if (index >= 0 && index < options.length) {
        resolve(options[index].value);
      } else {
        resolve(options[0].value);
      }
    });
  });
}

function askMultiSelect(rl, question, options) {
  return new Promise((resolve) => {
    console.log(`\n  ${question}`);
    console.log(`  ${t.enterNumbers}\n`);
    options.forEach((opt, i) => {
      console.log(`    ${i + 1}) ${opt.label}`);
    });
    console.log();
    rl.question(`  ${t.select}: `, (answer) => {
      const indices = answer
        .split(",")
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((i) => i >= 0 && i < options.length);
      resolve(indices.map((i) => options[i].value));
    });
  });
}

// ── Setup (interactive) ──────────────────────────────────────────────────────

async function setup(lang) {
  const rl = createRL();

  // Language selection if not provided via flag
  if (!lang) {
    const langChoice = await askChoice(rl, t.selectLanguage + ":", [
      { label: "English", value: "en" },
      { label: "Espanol", value: "es" },
    ]);
    lang = langChoice;
    t = getTranslations(lang);
  }

  console.log(`\n  ${t.setupTitle}\n`);

  // 1. Path
  const vaultPath = await ask(rl, t.whereVault, "./mempunk");
  const resolved = path.resolve(vaultPath);

  // Check if vault already exists
  if (
    fs.existsSync(path.join(resolved, "CLAUDE.md")) &&
    fs.existsSync(path.join(resolved, "projects"))
  ) {
    console.log(`\n  ${t.vaultAlreadyExists} ${resolved}`);
    const shouldLink = await askYesNo(rl, t.linkExisting);
    rl.close();
    if (shouldLink) link(resolved);
    return;
  }

  // 2. Structure
  const structureChoice = await askChoice(rl, t.selectStructure, [
    { label: `full      — ${t.presetFull}`, value: "full" },
    { label: `standard  — ${t.presetStandard}`, value: "standard" },
    { label: `minimal   — ${t.presetMinimal}`, value: "minimal" },
    { label: `custom    — ${t.presetCustom}`, value: "custom" },
  ]);

  let folders;

  if (structureChoice === "custom") {
    const folderOptions = [
      { label: `${"projects".padEnd(12)} — ${t.folderProjects}`, value: "projects" },
      { label: `${"areas".padEnd(12)} — ${t.folderAreas}`, value: "areas" },
      { label: `${"resources".padEnd(12)} — ${t.folderResources}`, value: "resources" },
      { label: `${"daily".padEnd(12)} — ${t.folderDaily}`, value: "daily" },
    ];
    folders = await askMultiSelect(rl, t.selectFolders, folderOptions);
    if (folders.length === 0) folders = ["projects"];
  } else {
    folders = PRESETS[structureChoice].folders;
  }

  // 3. Link
  const shouldLink = await askYesNo(rl, t.linkQuestion);

  rl.close();

  // Execute
  console.log();
  initVault(resolved, folders);

  if (shouldLink) {
    link(resolved);
  }

  console.log(`  ${t.done}\n`);
  showPrompt(resolved);
}

// ── Init ─────────────────────────────────────────────────────────────────────

function initVault(vaultDir, folders) {
  if (
    fs.existsSync(path.join(vaultDir, "CLAUDE.md")) &&
    fs.existsSync(path.join(vaultDir, "projects"))
  ) {
    console.error(`  ${t.errorVaultExists} ${vaultDir}`);
    process.exit(1);
  }

  fs.mkdirSync(vaultDir, { recursive: true });

  for (const dir of folders) {
    fs.mkdirSync(path.join(vaultDir, dir), { recursive: true });
  }

  // Copy CLAUDE.md template
  const templateFile = path.join(__dirname, "..", "templates", "CLAUDE.md");
  const destFile = path.join(vaultDir, "CLAUDE.md");

  if (fs.existsSync(templateFile)) {
    let content = fs.readFileSync(templateFile, "utf-8");
    content = adjustTemplate(content, folders);
    fs.writeFileSync(destFile, content);
  } else {
    fs.writeFileSync(destFile, "# CLAUDE.md\n\nVault initialized by Mempunk.\n");
  }

  // Build tree display
  const tree = folders.map((f, i) => {
    const isLast = i === folders.length - 1;
    return `    ${isLast ? "└" : "├"}── ${f}/`;
  });

  console.log(`  ${t.vaultCreated} ${vaultDir}\n`);
  console.log(`    ${vaultDir}/`);
  console.log(`    ├── CLAUDE.md`);
  console.log(tree.join("\n"));
  console.log();
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
    } else if (arg === "--projects") {
      selectedFolders.push("projects");
    } else if (arg === "--areas") {
      selectedFolders.push("areas");
    } else if (arg === "--resources") {
      selectedFolders.push("resources");
    } else if (arg === "--daily") {
      selectedFolders.push("daily");
    } else if (!arg.startsWith("-")) {
      targetPath = arg;
    }
  }

  const vaultDir = path.resolve(targetPath || ".");

  let folders;
  if (preset) {
    if (!PRESETS[preset]) {
      console.error(`  ${t.errorUnknownPreset} "${preset}". ${t.usePresets}`);
      process.exit(1);
    }
    folders = PRESETS[preset].folders;
  } else if (selectedFolders.length > 0) {
    folders = selectedFolders;
  } else {
    folders = PRESETS.full.folders;
  }

  initVault(vaultDir, folders);
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

function link(vaultPath) {
  if (!vaultPath) {
    console.error(`  ${t.errorPathRequired}\n  ${t.usageLink}`);
    process.exit(1);
  }

  const resolved = path.resolve(vaultPath);

  if (!fs.existsSync(resolved)) {
    console.error(`  ${t.errorPathNotExist} ${resolved}`);
    process.exit(1);
  }

  if (!fs.existsSync(path.join(resolved, "CLAUDE.md"))) {
    console.error(`  ${t.errorNoClaude} ${resolved}`);
    console.error(`  ${t.runInitFirst}`);
    process.exit(1);
  }

  const config = readClaudeConfig();
  const normalizedPath = resolved.replace(/\\/g, "/");
  const dirs = config.additionalDirectories || [];

  if (dirs.includes(normalizedPath)) {
    console.log(`  ${t.alreadyLinked} ${normalizedPath}\n`);
    showPrompt(normalizedPath);
    return;
  }

  config.additionalDirectories = [...dirs, normalizedPath];
  writeClaudeConfig(config);

  console.log(`  ${t.vaultLinked} ${normalizedPath}`);
  console.log(`  ${t.linkSuccess}\n`);
  showPrompt(normalizedPath);
}

function unlink() {
  const config = readClaudeConfig();
  if (!config.additionalDirectories || config.additionalDirectories.length === 0) {
    console.log(`  ${t.noVaultLinked}`);
    return;
  }
  delete config.additionalDirectories;
  writeClaudeConfig(config);
  console.log(`  ${t.vaultUnlinked}`);
}

function status() {
  const config = readClaudeConfig();
  const dirs = config.additionalDirectories || [];

  if (dirs.length === 0) {
    console.log(`  ${t.noVaultSetup}`);
    return;
  }

  console.log(`  ${t.linkedVaults}`);
  for (const dir of dirs) {
    const exists = fs.existsSync(dir);
    console.log(`    ${exists ? "+" : "!"} ${dir}${exists ? "" : ` ${t.notFound}`}`);
  }
}

// ── Prompt display ──────────────────────────────────────────────────────────

function showPrompt(vaultPath) {
  const prompt = t.promptText.replace("{path}", vaultPath);
  console.log(`  ┌─────────────────────────────────────────────────────────────`);
  console.log(`  │ ${t.promptTitle}`);
  console.log(`  │`);
  console.log(`  │  "${prompt}"`);
  console.log(`  └─────────────────────────────────────────────────────────────\n`);
}

// ── Parse global flags ──────────────────────────────────────────────────────

function parseGlobalFlags(args) {
  let lang = null;
  const filtered = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--lang" && args[i + 1]) {
      lang = args[++i];
      if (!getAvailableLanguages().includes(lang)) {
        console.error(`  Unknown language: ${lang}. Available: ${getAvailableLanguages().join(", ")}`);
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
      return link(rest[0]);
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
