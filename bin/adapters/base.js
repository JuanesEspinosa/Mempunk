import path from "path";

// ── Shared helpers ───────────────────────────────────────────────────────────

export function getHomePath(...segments) {
  const home = process.env.HOME || process.env.USERPROFILE;
  return path.join(home, ...segments);
}

// ── Typed errors ─────────────────────────────────────────────────────────────

export class CorruptConfigError extends Error {
  constructor(configPath, cause) {
    super(`Corrupt config at ${configPath}: ${cause.message}`);
    this.code = "CORRUPT_CONFIG";
    this.configPath = configPath;
    this.cause = cause;
  }
}

export class WriteConfigError extends Error {
  constructor(configPath, cause) {
    super(`Failed to write config at ${configPath}: ${cause.message}`);
    this.code = "WRITE_CONFIG_ERROR";
    this.configPath = configPath;
    this.cause = cause;
  }
}

// ── CLIAdapter contract (JSDoc) ──────────────────────────────────────────────

/**
 * @typedef {Object} CLIAdapter
 *
 * @property {string} name
 *   Unique stable id (e.g. "claude-code", "opencode", "gemini-cli").
 *
 * @property {string} displayName
 *   Human-readable name for prompts and messages (e.g. "Claude Code").
 *
 * @property {() => string} configPath
 *   Absolute path to the CLI's primary config file. Used by status/doctor for display.
 *
 * @property {() => boolean} isInstalled
 *   Whether the CLI appears installed on this system (config file exists or binary on PATH).
 *
 * @property {(handler: (path: string, err: Error) => void) => void} onCorruptConfig
 *   Register a callback invoked when the CLI's config is malformed during a read.
 *   Adapters that tolerate corrupt configs (warn + treat as empty) call this; orchestrator
 *   uses it to print a translated warning. Optional — adapters may also throw instead.
 *
 * @property {() => string[]} getRegisteredDirs
 *   Raw list of all directories currently registered with the CLI.
 *   May include non-vault dirs — orchestrator filters by CLAUDE.md presence.
 *
 * @property {(vaultPath: string) => void} addDir
 *   Register a vault directory with the CLI. Idempotent.
 *   Throws WriteConfigError on failure.
 *
 * @property {(vaultPath: string) => void} removeDir
 *   Remove a vault directory from the CLI's registered list. Idempotent.
 *   Throws WriteConfigError on failure.
 *
 * @property {() => void} installSkills
 *   Install /mempunk and /session-end slash commands at the CLI's native skills path.
 *
 * @property {() => { ok: boolean, missing: string[] }} verifySkills
 *   Check that both skills are installed. Returns { ok, missing[] } where missing
 *   contains the names of any skills not found.
 */
