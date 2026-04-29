import fs from "fs";
import path from "path";
import { getHomePath } from "./adapters/base.js";

const DEFAULT_CLI = "claude-code";

function configPath() {
  return getHomePath(".mempunk", "config.json");
}

export function readMempunkConfig() {
  const cfg = configPath();
  if (!fs.existsSync(cfg)) return {};
  try {
    return JSON.parse(fs.readFileSync(cfg, "utf-8"));
  } catch {
    return {};
  }
}

export function writeMempunkConfig(config) {
  const cfg = configPath();
  fs.mkdirSync(path.dirname(cfg), { recursive: true });
  fs.writeFileSync(cfg, JSON.stringify(config, null, 2) + "\n");
}

// ── Single CLI (backward compat) ────────────────────────────────────────────

export function getActiveCLI() {
  const cfg = readMempunkConfig();
  // v1.4+: first entry in clis array; v1.3 fallback: cli field
  if (cfg.clis && cfg.clis.length > 0) return cfg.clis[0];
  return cfg.cli || DEFAULT_CLI;
}

export function setActiveCLI(name) {
  const cfg = readMempunkConfig();
  cfg.clis = [name];
  delete cfg.cli; // migrate away from old field
  writeMempunkConfig(cfg);
}

// ── Multi-CLI (v1.4) ───────────────────────────────────────────────────────

export function getActiveCLIs() {
  const cfg = readMempunkConfig();
  // v1.4+: clis array; v1.3 fallback: single cli field
  if (cfg.clis && cfg.clis.length > 0) return [...cfg.clis];
  return [cfg.cli || DEFAULT_CLI];
}

export function addCLI(name) {
  const cfg = readMempunkConfig();
  const clis = cfg.clis && cfg.clis.length > 0
    ? [...cfg.clis]
    : [cfg.cli || DEFAULT_CLI];
  if (clis.includes(name)) return false; // already active
  clis.push(name);
  cfg.clis = clis;
  delete cfg.cli;
  writeMempunkConfig(cfg);
  return true;
}

export function removeCLI(name) {
  const cfg = readMempunkConfig();
  const clis = cfg.clis && cfg.clis.length > 0
    ? [...cfg.clis]
    : [cfg.cli || DEFAULT_CLI];
  if (!clis.includes(name)) return false; // not active
  cfg.clis = clis.filter((c) => c !== name);
  delete cfg.cli;
  if (cfg.clis.length === 0) cfg.clis = [DEFAULT_CLI];
  writeMempunkConfig(cfg);
  return true;
}
