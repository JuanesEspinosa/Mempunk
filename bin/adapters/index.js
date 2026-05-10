import { claudeCodeAdapter } from "./claude-code.js";
import { opencodeAdapter } from "./opencode.js";
import { geminiCliAdapter } from "./gemini-cli.js";

const adapters = {
  "claude-code": claudeCodeAdapter,
  "opencode": opencodeAdapter,
  "gemini-cli": geminiCliAdapter,
};

export function getAdapter(name = "claude-code") {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`Unknown CLI adapter: ${name}`);
  }
  return adapter;
}

export function listAdapters() {
  return Object.values(adapters);
}

export { CorruptConfigError, WriteConfigError } from "./base.js";
