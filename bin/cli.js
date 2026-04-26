#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// ── Presets ──────────────────────────────────────────────────────────────────

const AVAILABLE_FOLDERS = {
  projects: "One directory per active project with overview, backlog, and session logs",
  areas: "Ongoing responsibilities (university, infrastructure, etc.)",
  resources: "Reusable technical knowledge across projects",
  daily: "Daily session logs written by Claude",
};

const PRESETS = {
  full: {
    description: "Everything — projects, areas, resources, daily",
    folders: ["projects", "areas", "resources", "daily"],
  },
  standard: {
    description: "Projects + resources + daily logs",
    folders: ["projects", "resources", "daily"],
  },
  minimal: {
    description: "Projects only",
    folders: ["projects"],
  },
};

// ── Help ─────────────────────────────────────────────────────────────────────

const HELP = `
  mempunk — Persistent dev brain for Claude Code

  Usage:
    mempunk setup                  Interactive full setup (recommended)
    mempunk init [path] [options]  Create a new vault
    mempunk link <path>            Link vault to Claude Code (global config)
    mempunk unlink                 Remove vault from Claude Code config
    mempunk status                 Show current linked vault
    mempunk help                   Show this message

  Init options:
    --preset <name>    Use a preset: full, standard, minimal
    --projects         Include projects folder
    --areas            Include areas folder
    --resources        Include resources folder
    --daily            Include daily folder

  Examples:
    mempunk setup
    mempunk init ./my-vault --preset full
    mempunk init ./my-vault --projects --resources
    mempunk link ./my-vault
`;

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
      else resolve(a === "y" || a === "yes");
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
    rl.question("  Choose (number): ", (answer) => {
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
    console.log("  Enter numbers separated by commas (e.g. 1,3,4)\n");
    options.forEach((opt, i) => {
      console.log(`    ${i + 1}) ${opt.label}`);
    });
    console.log();
    rl.question("  Select: ", (answer) => {
      const indices = answer
        .split(",")
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((i) => i >= 0 && i < options.length);
      resolve(indices.map((i) => options[i].value));
    });
  });
}

// ── Setup (interactive) ──────────────────────────────────────────────────────

async function setup() {
  const rl = createRL();

  console.log("\n  mempunk — vault setup\n");

  // 1. Path
  const vaultPath = await ask(rl, "Where do you want your vault?", "./mempunk");
  const resolved = path.resolve(vaultPath);

  // Check if vault already exists
  if (
    fs.existsSync(path.join(resolved, "CLAUDE.md")) &&
    fs.existsSync(path.join(resolved, "projects"))
  ) {
    console.log(`\n  Vault already exists at ${resolved}`);
    const shouldLink = await askYesNo(rl, "Link it to Claude Code?");
    rl.close();
    if (shouldLink) link(resolved);
    return;
  }

  // 2. Structure
  const structureChoice = await askChoice(rl, "Select vault structure:", [
    { label: `full      — ${PRESETS.full.description}`, value: "full" },
    { label: `standard  — ${PRESETS.standard.description}`, value: "standard" },
    { label: `minimal   — ${PRESETS.minimal.description}`, value: "minimal" },
    { label: "custom    — pick folders", value: "custom" },
  ]);

  let folders;

  if (structureChoice === "custom") {
    const folderOptions = Object.entries(AVAILABLE_FOLDERS).map(([key, desc]) => ({
      label: `${key.padEnd(12)} — ${desc}`,
      value: key,
    }));
    folders = await askMultiSelect(rl, "Select folders to include:", folderOptions);
    if (folders.length === 0) folders = ["projects"];
  } else {
    folders = PRESETS[structureChoice].folders;
  }

  // 3. Link
  const shouldLink = await askYesNo(rl, "Link vault to Claude Code?");

  rl.close();

  // Execute
  console.log();
  initVault(resolved, folders);

  if (shouldLink) {
    link(resolved);
  }

  console.log("  Done. Run 'claude' in any project to start using your vault.\n");
}

// ── Init ─────────────────────────────────────────────────────────────────────

function initVault(vaultDir, folders) {
  if (
    fs.existsSync(path.join(vaultDir, "CLAUDE.md")) &&
    fs.existsSync(path.join(vaultDir, "projects"))
  ) {
    console.error(`  Error: vault already exists at ${vaultDir}`);
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
    // Adjust template to match selected folders
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

  console.log(`  Vault created at ${vaultDir}\n`);
  console.log(`    ${vaultDir}/`);
  console.log(`    ├── CLAUDE.md`);
  console.log(tree.join("\n"));
  console.log();
}

function adjustTemplate(content, folders) {
  const allFolders = Object.keys(AVAILABLE_FOLDERS);
  const missing = allFolders.filter((f) => !folders.includes(f));

  for (const folder of missing) {
    // Remove lines referencing missing folders from the structure diagram
    const patterns = [
      new RegExp(`^.*├── ${folder}/.*$`, "gm"),
      new RegExp(`^.*└── ${folder}/.*$`, "gm"),
      new RegExp(`^.*${folder}.*#.*$`, "gm"),
    ];
    for (const pattern of patterns) {
      content = content.replace(pattern, "");
    }
  }

  // Clean up multiple blank lines
  content = content.replace(/\n{3,}/g, "\n\n");
  return content;
}

// ── Init CLI entry ───────────────────────────────────────────────────────────

function initFromArgs(args) {
  // Parse path and flags
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
      console.error(`  Error: unknown preset "${preset}". Use: full, standard, minimal`);
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
    console.error("  Error: path required\n  Usage: mempunk link <path>");
    process.exit(1);
  }

  const resolved = path.resolve(vaultPath);

  if (!fs.existsSync(resolved)) {
    console.error(`  Error: path does not exist: ${resolved}`);
    process.exit(1);
  }

  if (!fs.existsSync(path.join(resolved, "CLAUDE.md"))) {
    console.error(`  Error: no CLAUDE.md found at ${resolved}`);
    console.error("  Run 'mempunk init' first to create a vault.");
    process.exit(1);
  }

  const config = readClaudeConfig();
  const normalizedPath = resolved.replace(/\\/g, "/");
  const dirs = config.additionalDirectories || [];

  if (dirs.includes(normalizedPath)) {
    console.log(`  Already linked: ${normalizedPath}`);
    return;
  }

  config.additionalDirectories = [...dirs, normalizedPath];
  writeClaudeConfig(config);

  console.log(`  Vault linked: ${normalizedPath}`);
  console.log("  Claude Code will have access to the vault in every session.\n");
}

function unlink() {
  const config = readClaudeConfig();
  if (!config.additionalDirectories || config.additionalDirectories.length === 0) {
    console.log("  No vault linked.");
    return;
  }
  delete config.additionalDirectories;
  writeClaudeConfig(config);
  console.log("  Vault unlinked from Claude Code.");
}

function status() {
  const config = readClaudeConfig();
  const dirs = config.additionalDirectories || [];

  if (dirs.length === 0) {
    console.log("  No vault linked. Run 'mempunk setup' to get started.");
    return;
  }

  console.log("  Linked vaults:");
  for (const dir of dirs) {
    const exists = fs.existsSync(dir);
    console.log(`    ${exists ? "+" : "!"} ${dir}${exists ? "" : " (not found)"}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "setup":
      return setup();
    case "init":
      return initFromArgs(args);
    case "link":
      return link(args[0]);
    case "unlink":
      return unlink();
    case "status":
      return status();
    case "help":
    case "--help":
    case "-h":
      return console.log(HELP);
    default:
      if (!command) return setup();
      console.log(HELP);
      process.exit(1);
  }
}

main();
