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

export function getActiveCLI() {
  return readMempunkConfig().cli || DEFAULT_CLI;
}

export function setActiveCLI(name) {
  const cfg = readMempunkConfig();
  cfg.cli = name;
  writeMempunkConfig(cfg);
}
