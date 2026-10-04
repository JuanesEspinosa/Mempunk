# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Skills and agents by scope** — global (`global/`), profile (`profiles/<p>/`, shared by stack) and project (`projects/<id>/`), each with `skills/<name>/SKILL.md` and `agents/<name>.md`. Discovered from the filesystem only (no DB table), so they merge through git like any markdown. A project's assets resolve as profiles (in order) → project; the most specific wins.
  - `mempunk skill|agent add <name> --global|--profile <p>|--project <id> --description "..."` (description is required — it is what Claude uses to activate the asset), `list` (resolved for a project, ids `<scope>:<owner>:<name>`), `update <id> --file` (keeps the frontmatter when the new content has none).
  - `mempunk profile list`, `mempunk project profile <id> [--add <p>] [--remove <p>]` (stored in `projects/<id>/mempunk.json`).
  - `mempunk materialize [--global|--project <id>] [--dry-run] [--json]`: copies global assets to `~/.claude/` and profile+project assets to `<repo on this machine>/.claude/`, listed in `.git/info/exclude` so they are never committed. A per-target manifest (`.claude/.mempunk-managed.json`, sha256 per file) means copies edited by hand or files not created by Mempunk are never overwritten or deleted (reported as conflicts; the whole asset is skipped). Runs from `on-start.js` after the auto-pull; only a fixed one-line notice reaches Claude when there are conflicts.
- Guard: commands abort when the vault DB is **newer** than the installed CLI (e.g. upgraded on the other machine) instead of writing to it.

### Changed

- **Vault schema v6 — paths relative to the vault**: `decisions/resources/daily_logs/project_skills.file_path` and `projects.path` are stored relative to the vault (with `/`) and returned absolute by the API. The migration converts paths from this machine by prefix and paths written on another machine by anchored suffix, so a DB that travels through git resolves on every machine. Run `mempunk vault upgrade` on each machine (update mempunk on both first).
- `skill add` creates `skills/<name>/SKILL.md` (native Claude Code skill) instead of a flat `.md`; flat skills are still listed as `scope: "legacy"`. `@mempunk-loader` no longer reads native skills (they load on demand) — only legacy ones.
- `src/commands/skill.js` replaced by the generic `src/commands/asset.js`.

## [2.2.0] — 2026-09-09

### Added

- **Vault sync over git** — three top-level commands so an AI CLI can ship the vault between machines without knowing git (`mempunk sync` keeps its meaning: vault ↔ DB consistency check):
  - `mempunk remote set <url> [--branch <branch>] [--auto]` — registers the vault's git remote (`git init` + `origin` if needed) in `.mempunk/remote.json` (`{ url, branch, auto: { pull_on_start, push_on_end }, created_at }`, versioned, travels with the vault). Without `--branch` it uses the branch currently checked out in `~/Dev-Brain` if it is already a git repo, else `main`. `--auto` enables pull on session start and push on session end. Per-machine timestamps live in `.mempunk/remote-state.json` (gitignored). Credentials are never stored — git's credential helper or SSH keys handle auth.
  - `mempunk remote show [--json]` — url (masked), branch, automation flags, last push/pull. `mempunk remote unset` — removes `remote.json` without touching `.git`.
  - `mempunk push [--message-file <path> | --message-stdin | -m "<msg>"] [--project <id>] [--strict]` — `PRAGMA wal_checkpoint(TRUNCATE)` on the DB, `git add -A` + commit of local changes, fetch + merge of `origin/<branch>`, DB integrity check, then push. Commit message prefix: `vault(<project>):` with `--project`, `vault:` without; default message `vault: session <YYYY-MM-DD> — <n> files`. "Nothing to push" exits 0.
  - `mempunk pull` — verified backup of the local DB (`VACUUM INTO` + `integrity_check`), commit of local changes (`vault: local changes before pull`), fetch + merge of `origin/<branch>`, `PRAGMA integrity_check` on the merged DB (restores the backup on failure), regenerates this machine's `project-paths.json` and lists the projects with no path here with the exact `mempunk project activate <id> --here` hint.
  - New-machine bootstrap: clone the vault into `~/Dev-Brain` before running any mempunk command there. `mempunk init` followed by `remote set`/`pull` produces an "unrelated histories" error; the CLI prints a hint to clone instead.
- **Binary conflict rule for `mempunk.db`**: when both sides changed the DB, the copy with the most recent activity (`MAX(created_at)` across sessions, daily logs, decisions and backlog) wins; the loser is saved as `.mempunk/backups/conflict-<stamp>-<ours|theirs>.db` and both dates are printed. `--strict` makes `push` exit 1 after resolving. If markdown files conflict, the command stops with the list and the merge stays in progress until the user resolves it (`git add` + `git commit` in `~/Dev-Brain`, or `git merge --abort`); `push`/`pull` refuse to run while a merge is in progress or `.git/index.lock` exists.
- **Agent `@mempunk-syncer`** (Haiku, background, installed by `mempunk hooks install`): maps `SYNC push: project=<id> summary="<summary>"` to `mempunk push --project <id> --message-stdin` with the summary in a quoted heredoc, and `SYNC pull:` to `mempunk pull`. It never runs git directly, never creates `remote.json`, never relays raw git stderr, and reports `MEMPUNK-SYNCER: no remote configured — run: mempunk remote set <url>` when there is no remote or `MEMPUNK-SYNCER ERROR: mempunk push failed (exit N) — run it manually in the terminal to see details` on failure.
- **`on-end.js` hook** on Claude Code's `SessionEnd` event: runs `mempunk push` (60 s timeout) when `auto.push_on_end` is true. `on-start.js` runs `mempunk pull` (45 s timeout) before loading context when `auto.pull_on_start` is true. Both are registered in `settings.json` with `timeout: 90`; on failure only a fixed classified message (network / auth / timeout / conflict) reaches Claude's context and details go to `.mempunk/hooks.log`. `hooks install --check` lists `on-end.js` and `mempunk-syncer.md`.
- **Per-machine project paths (vault schema v5)**: new table `project_paths (project_id, host, root_path)`. Repo paths are keyed by normalized hostname (lowercase, `.local`/`.lan` stripped; `MEMPUNK_HOST` overrides it and is normalized the same way), so `project activate <id> --here` and `project add --path` map the folder on *this* machine only and no longer overwrite the other machine's mapping when the DB travels through git. Existing vaults must run `mempunk vault upgrade` (the migration copies each project's current `path` into `project_paths` for the current host).
- Docs: `CLAUDE.md` / `templates/CLAUDE.md` gain the remote/push/pull commands, the `@mempunk-syncer` agent, a "Sync between machines" section and a final `SYNC push` step in the session close protocol; README gains the same subsection.

### Changed

- `mempunk sync` is unchanged in behavior but is now documented explicitly as the disk ↔ DB consistency check, distinct from `push`/`pull`.
- Vault version is now 5; the vault template's close protocol ends with `SYNC push` when a remote is configured.

### Security

- `mempunk push` message sources, in precedence order: `--message-file <path>`, `--message-stdin`, `-m "<msg>"`, default. Messages are sanitized (control characters removed, 2000 chars max); `--project <id>` must be a plain identifier (letters, digits, `_`, `-`, `.`).
- `@mempunk-syncer` sends the summary through a quoted heredoc on stdin (`--message-stdin`), never on the command line, and never relays raw git stderr — only fixed status lines reach Claude's context.
- `mempunk remote set` rejects URLs with embedded credentials (`https://user:token@…`) and points to git credential helpers / SSH keys; the url is always shown masked; accepted forms are https/ssh/git/file URLs, scp-style `git@host:path` and local paths. Branch names are validated with `git check-ref-format`, including the one read from `remote.json`. Per-machine files previously committed (`auto-start.flag`, `hooks.log`, backups) are untracked, and a warning states that the DB contains session snapshots with conversation excerpts, so the remote must be a private repository.
- `pull`/`push` no longer stash: local changes are committed first, then fetched and merged; markdown conflicts halt the command with the merge in progress, and both commands refuse to run while a merge is in progress or `.git/index.lock` exists. The DB integrity check runs after any merge. Git runs non-interactively (`GIT_TERMINAL_PROMPT=0`) with timeouts, so a missing credential fails fast instead of opening a prompt.
- Sync hooks run with their own timeouts (45 s pull / 60 s push, `timeout: 90` in `settings.json`) and only inject a fixed classified message (network / auth / timeout / conflict) into Claude's context; details go to `.mempunk/hooks.log`.

### Fixed

- `addProject`: re-registering an existing project no longer wipes the paths recorded by other machines and preserves the original `created_at`.

## [2.1.1] — 2026-07-14

### Fixed

- **CI green on the first run**: hooks are now built before the coverage job (the bundle in `dist/hooks/` is a build artifact and was missing), the matrix requires Node >= 22, symlink resolution is handled on macOS, and coverage runs correctly on Windows.

### Changed

- **Agents rewritten in English** (`mempunk-loader`, `mempunk-saver`, `mempunk-recover`) and now consume `--json` output from every read command instead of parsing table output.
- **Vault template (`templates/CLAUDE.md`) rewritten in English** with the v2 protocol: backlog and sessions are read/written SQLite-first via the CLI (`session log`, `backlog update`, `--json` reads); the exhaustive command table was reduced to the daily-flow commands plus a pointer to the full reference.
- **vault-skills updated to v2 commands** (English, `--json` on reads, session close persists to SQLite via `mempunk session log` / `mempunk backlog update` in addition to markdown notes).
- **Loader/skill precedence rule**: if the session context was already loaded (e.g., via a /mempunk skill or the auto-start hook), `@mempunk-loader` does not reload — it just confirms the active project.

## [2.1.0] — 2026-07-13

> Supersedes 2.0.4, which was never published to npm.

### Added

- **English CLI by default** with full Spanish support via `MEMPUNK_LANG=es` (144-key message catalog in `src/lib/i18n.js`; user-facing hook messages are bilingual too).
- `mempunk vault backup` — consistent copy via `VACUUM INTO` to `.mempunk/backups/`, integrity-checked, keeps the last 10.
- `mempunk export [--out <file>]` — portable JSON dump of all vault tables.
- `--json` flag on read commands (`project/backlog/decision/skill/resource/daily list`, `session last/checkpoints`, `search`) for scripts and agents.
- **CI**: GitHub Actions with lint, test matrix (Ubuntu/Windows/macOS × Node 22/24), 80% line-coverage gate, gitleaks secret scan, and an npm publish workflow with provenance.
- ESLint (flat config) and real coverage measurement with `c8` (subprocess-aware).

### Changed

- **Hooks are now built artifacts**: shared code lives once in `src/hooks-lib/common.js`; `npm run build` (esbuild) bundles each hook self-contained into `dist/hooks/`, which is what `hooks install` copies.
- **`cli.js` modularized**: 2054-line monolith split into `src/commands/` (18 modules) + `src/lib/` (5 modules); entrypoint is a thin dispatcher.
- Hooks and statusline tolerate a UTF-8 BOM on stdin.
- `package-lock.json` is now committed (reproducible CI builds).
- **Node.js >= 22 required** (18 and 20 are EOL; `better-sqlite3` no longer ships prebuilt binaries for them on Windows).
- Path normalization resolves symlinks (`fs.realpathSync`) — fixes cwd-based project resolution on macOS, where `/var` is a symlink to `/private/var`.

## [2.0.4] — 2026-07-12 (unpublished)

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
