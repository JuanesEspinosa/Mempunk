# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.0.4] — 2026-07-12

### Added

- **Active project resolved by cwd** (vault schema v4): projects store the path of their real repository (`root_path`). `project add` maps the current directory automatically (or `--path <dir>`); `project activate <id> --here` maps the current directory for existing projects. Hooks resolve the project from the session's `cwd` via `.mempunk/project-paths.json`, falling back to the global `active-project.json` — concurrent sessions in different projects no longer cross checkpoints.
- **Checkpoint pruning**: at most 30 checkpoints and 10 compact snapshots are kept per project — `mempunk.db` no longer grows without bound.

### Changed

- **Real migration gating**: commands no longer migrate the vault schema silently on every open. An outdated vault aborts with a clear message; `mempunk vault upgrade` is the only place migrations run. Fresh vaults still bootstrap automatically.
- `checkpoint-state.json` now tracks the last saved turn **per session** — concurrent sessions no longer reset each other's checkpoint counter.

### Fixed

- `sync --project` no longer hides orphaned files in `resources/` and `daily/`.
- `mempunk remove` now deletes the project's resource `.md` files, and daily files whose date belongs only to the removed project (shared daily files are preserved).
- `daily list` test used the UTC date instead of the local date (mismatch with `addDailyLog` after the 2.0.3 fix).

## [2.0.1] – [2.0.3] — 2026-06-05 / 2026-07-11

- Hooks registered as a single command string with forward slashes (Windows bash compatibility); statusline uses the full node path.
- Full audit (26 bugs): test suite isolated from the real `~/.claude` installation; `spawnSync` with `shell: true` on Windows (checkpoints work on Windows for the first time); `readJsonFile` no longer destroys corrupted `settings.json`; surgical hook (un)registration; correct context percentage (1M models, sidechains); tool_results no longer counted as turns; FTS5 search escaping; transactional `remove`.

## [2.0.0] — 2026-05-30

Complete architectural rewrite. The vault format is backwards-incompatible with v1.x.

### Breaking changes

- **New entrypoint:** `src/cli.js` replaces `bin/cli.js`. The `bin/` directory has been removed.
- **SQLite backend:** all session data, backlog, decisions, skills, resources and daily logs are now stored in `.mempunk/mempunk.db`. In v1.x these were plain markdown files managed manually.
- **No i18n:** `--lang` flag removed. The CLI is in Spanish; documentation is available in EN / ES / PT / FR.
- **No interactive prompts:** `inquirer` removed. All commands are non-interactive and scriptable.
- **`MEMPUNK_VAULT` env var:** replaces the interactive vault selection prompt from v1.x.
- **5 dependencies removed:** `inquirer`, `i18next`, `i18next-fs-backend`, `chalk`, `ora`.

### Migration from v1.x

1. Install the new version: `npm install -g mempunk`
2. Run setup: `mempunk setup`
   - Select your CLI and mode (auto with agents, or manual with vault-skills).
   - A new vault is created at `~/Dev-Brain/` with the v3 SQLite schema.
3. Re-register your projects: `mempunk project add <id> "<name>"` for each project.
4. Your existing markdown files are still valid — copy them into the new vault structure under `projects/<id>/`.
5. Run `mempunk sync` to verify consistency between disk and database.

> v1.x vaults (markdown only, no DB) are not automatically migrated. The migration is manual because v1 had no structured metadata to import from.

### Added

- `VaultStore` — single SQLite interface for all vault data (sessions, backlog, decisions, skills, resources, daily logs, checkpoints, compact snapshots).
- **Hook system** — 4 lifecycle hooks for Claude Code: `on-start.js`, `on-stop.js`, `on-compact.js`, `on-prompt.js`.
  - `on-stop.js`: saves an incremental checkpoint every 5 turns (AutoCheckpoint).
  - `on-compact.js`: captures full session state before Claude compacts the conversation.
  - `on-start.js`: restores compact snapshot at session start (CompactRestore).
- **Agent system** — 3 Claude Code native agents installed via `mempunk hooks install`:
  - `@mempunk-loader`: interactive project selection and context loading at session start.
  - `@mempunk-saver`: saves decisions, session logs and backlog updates in background.
  - `@mempunk-recover`: recovers context from a closed session manually.
- `mempunk setup` — interactive setup: asks which CLI you use and configures the appropriate mode (auto with hooks+agents, or manual with vault-skills).
- `mempunk project activate <id>` — sets the active project for hooks without requiring the `CLAUDE_PROJECT_ID` env var.
- `mempunk project add` — now copies all scaffold templates (`INDEX.md`, `overview.md`, `architecture.md`, `conventions.md`, `wiki/state.md`, `wiki/log.md`, `wiki/index.md`) and auto-activates the project.
- `mempunk session recover <id>` — shows the last available checkpoint or compact snapshot.
- `mempunk session checkpoints <id>` — lists all checkpoints and compact snapshots.
- `mempunk auto-start on|off` — configures a Claude Code `SessionStart` hook to invoke `@mempunk-loader` automatically.
- `mempunk doctor` — vault health check: DB, vault version, project directories, CLI links, hooks, agents, hooks.log errors, active project.
- `mempunk link / unlink` — links or unlinks the vault from Claude Code, Gemini CLI, and opencode simultaneously.
- `mempunk status` — dashboard: vault info, linked CLIs, projects with backlog counts and last session date.
- `mempunk remove <id> --yes` — removes a project from DB and disk.
- `mempunk cli list` — lists all compatible CLIs and their link status.
- `mempunk log <id>` — opens the project's `INDEX.md` in the default editor.
- `mempunk sync` — verifies consistency between disk files and the database, including scaffold files (`INDEX.md`, `wiki/state.md`, `wiki/log.md`, `wiki/index.md`).
- **Statusline** — `src/statusline.js` integrates with the Claude Code status bar to show the active project.
- **opencode support** — `mempunk link --cli opencode` writes the vault path and session protocols into `~/.config/opencode/AGENTS.md`.
- **vault-skills** — 5 markdown protocol files installed in the vault for manual use (Gemini CLI, opencode, or Claude Code without agents): `session-start.md`, `session-end.md`, `backlog-workflow.md`, `decision-capture.md`, `skill-management.md`.
- `mempunk hooks install` now defaults to global (`~/.claude/`). Use `--local` for project-scoped installation.

### Changed

- `mempunk setup` is now the recommended entry point (replaces `mempunk init + mempunk hooks install`).
- `mempunk hooks install` installs globally by default. `--local` installs in the current project's `.claude/` directory. The old `--global` flag is still accepted as an alias.
- `templates/CLAUDE.md` now declares the agent vs vault-skills hierarchy explicitly (Camino A / Camino B).

### Removed

- `bin/` directory (v1 entrypoint, adapters, i18n, config).
- Interactive prompts (`inquirer`).
- `--lang` flag (i18n support).
- `mempunk init` as the recommended entry point (still works, but `mempunk setup` replaces it for new installs).

---

## [1.x] — prior versions

v1.x was a markdown-only vault manager with interactive CLI, i18n support, and no SQLite backend. It is not documented here. See the git history for details.
