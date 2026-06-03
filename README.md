[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Persistent memory between Claude Code sessions.

## The Problem

AI coding CLIs have no memory between sessions. Every time you start a new conversation, your assistant doesn't know:

- What you were working on yesterday
- What architectural decisions were already made
- What tasks are pending or done
- What files were modified and why
- What the next steps were supposed to be
- Which CLI tool you were using (Claude Code? opencode? gemini-cli?)

You end up repeating context, re-explaining decisions, and losing momentum. The longer a project runs, the worse it gets.

But there's a deeper issue: even if a CLI *did* remember everything, raw history is inefficient context. Reading 20 session logs to understand where a project stands is nearly as slow as starting from scratch. What you need isn't a log — it's a compiled state that gets more accurate over time, not a pile of entries that keeps growing.

On top of that, if you switch between different AI coding CLIs — Claude Code for some projects, opencode or gemini-cli for others — each tool lives in its own silo. Your context is fragmented across tools.

## The Solution

Mempunk gives your AI a structured vault backed by SQLite and markdown files — and keeps it compiled, not just stored.

- **Session start** (`vault-skills/session-start.md`): the assistant loads the compiled project state from `wiki/state.md` if it exists, or the last session logs otherwise. No re-explaining. No re-deriving. It picks up where you left off.
- **Session end** (`vault-skills/session-end.md`): the assistant writes the session log, updates the backlog, and rewrites the compiled state — a fresh synthesis of everything that's happened so far. The next session starts with a dense, accurate snapshot instead of raw history.
- **The vault** (always): each project accumulates a `wiki/` — a knowledge base the LLM owns and maintains. Every session makes it more accurate. Every source you add makes it richer.

The vault is markdown files organized by project, with SQLite as the structured backend. You manage it with a CLI. Your AI navigates it with the protocols defined in `vault-skills/`. It also works as an Obsidian vault, so you can browse and search everything visually.

Because the vault is CLI-agnostic, you can use the same vault with Claude Code, opencode, and gemini-cli simultaneously. Switch between CLIs without losing context.

## Quick Start

```bash
npm install -g mempunk
mempunk setup
```

`setup` asks which AI CLI you use and configures everything: creates `~/Dev-Brain/`, links it to your CLI, and installs hooks + agents (Claude Code) or vault-skills protocols (Gemini CLI / opencode).

## Vault Structure

```
~/Dev-Brain/
├── projects/
│   └── <id>/
│       ├── INDEX.md        metadata (name, created_at, status)
│       ├── decisions/      architecture decision records (ADRs)
│       ├── skills/         stack, patterns, conventions — loaded each session
│       └── wiki/           LLM-maintained knowledge base
│           ├── state.md    compiled project state — rewritten each session
│           ├── log.md      append-only session history
│           ├── index.md    catalog of all wiki pages
│           └── sources/    documents for the LLM to ingest
├── areas/                  ongoing responsibilities, not projects
├── resources/              links and references
├── daily/                  narrative daily logs
└── .mempunk/
    ├── mempunk.db          SQLite database — do not edit manually
    └── hooks.log           lifecycle hook execution log
```

`wiki/state.md` is the central differentiator. It's the *compiled state* of the project — what's true now, not what happened in order. The LLM rewrites it at the end of every session. Reading one compiled file is faster and more accurate than reading N session logs. Every session makes it more precise. Every source you add enriches it. You never write it yourself.

## Session Flow

### Session start

**With agents (Claude Code, auto mode):** invoke `@mempunk-loader`. It lists your projects, asks which one to work on, activates it, and returns a compact context summary. If you enabled `auto-start`, it runs automatically when you open Claude Code.

**Without agents (manual mode / Gemini CLI / opencode):** follow `vault-skills/session-start.md`. The assistant:

1. Runs `mempunk project activate <id>` to set the active project
2. Runs `mempunk session last <project_id>` to know what the previous session did
3. Runs `mempunk skill list <project_id>` and reads all relevant skill files
4. Reads project state — `wiki/state.md` if it exists, otherwise the last 3 session log entries
5. Runs `mempunk backlog list <project_id> --status pending`
6. Confirms context before proceeding

### Incremental saves (during session)

The assistant saves context immediately when it happens — not only at session end:

- **Architectural decision made** → `mempunk decision add` immediately
- **Important bug fixed** → `mempunk session log` with the fix summary
- **Task completed or started** → `mempunk backlog update` immediately
- **Project skill modified** → `mempunk skill update` immediately
- **Relevant link captured** → `mempunk resource add` immediately
- **Important work block finished** → `mempunk daily log` with a block summary

If a session is interrupted, the important context is already persisted.

### Session end (`vault-skills/session-end.md`)

When a session ends, the assistant:

1. Runs `mempunk backlog update` for each task that changed status during the session
2. Runs `mempunk decision add` for each important decision not yet saved
3. Runs `mempunk session log` with a summary and the list of files touched
4. Updates `wiki/state.md` — rewrites it as a compiled synthesis of the current project state
5. Appends to `wiki/log.md`
6. Creates or appends to `daily/YYYY-MM-DD.md`

The next session picks up exactly where this one left off.

## Lifecycle Hooks (Claude Code)

When hooks are installed (`mempunk hooks install`), Mempunk automatically responds to Claude Code session events:

| Hook | Event | Behavior |
|------|-------|----------|
| `on-prompt.js` | Before each turn | **ContextWarning** — alerts at 70%, 80%, and 84% context usage |
| `on-stop.js` | After each response | **AutoCheckpoint** — saves an incremental checkpoint every 5 turns |
| `on-compact.js` | Before context compaction | **CompactGuard** — captures a full snapshot before Claude compacts |
| `on-start.js` | Session start | **CompactRestore** — restores context from the last snapshot after compaction |

AutoCheckpoint interval is configurable via the `MEMPUNK_CHECKPOINT_INTERVAL` environment variable (default: 5).

Hooks also install a **statusline** integration — a real-time context bar in Claude Code's status line:

```
🟢 ███░░░░░░ 32% | claude-sonnet | $0.12
```

The emoji indicates pressure level: 🟢 below 70%, ⚠️ at 70–80%, 🔶 at 80–84%, 🚨 above 84%.

To recover context from a previous session or after an interruption:

```bash
mempunk session recover <project_id>     # show latest available snapshot
mempunk session checkpoints <project_id> # list all saved checkpoints
```

## Agents (Claude Code)

Three sub-agents are installed alongside hooks:

| Agent | Model | Purpose |
|-------|-------|---------|
| `@mempunk-loader` | Sonnet | Loads project context at session start — lists projects, activates one, returns compact summary |
| `@mempunk-saver` | Haiku (background) | Saves decisions, session logs, and backlog updates mid-session without interrupting the conversation |
| `@mempunk-recover` | Sonnet | Recovers context from a closed or interrupted session manually |

`@mempunk-loader` replaces the manual session-start protocol. If `auto-start` is enabled (`mempunk auto-start on`), it runs automatically each time Claude Code opens.

`@mempunk-saver` is triggered when you write structured save commands:

```
SAVE decision: project=<id> title="Use JWT for auth"
SAVE session: project=<id> summary="Implemented login endpoint"
```

## Commands

### Setup & Configuration

| Command | Description | Example |
|---------|-------------|---------|
| `mempunk setup` | Interactive setup: init + link + hooks install | `mempunk setup` |
| `mempunk init` | Create vault structure and initialize DB | `mempunk init` |
| `mempunk link [--cli <name>]` | Link vault to Claude Code, opencode, or gemini-cli | `mempunk link --cli opencode` |
| `mempunk unlink [--cli <name>]` | Unlink from a CLI | `mempunk unlink` |
| `mempunk status` | Dashboard: vault info, projects, backlog counts, last session | `mempunk status` |
| `mempunk cli list` | List compatible CLIs and their link status | `mempunk cli list` |
| `mempunk auto-start on\|off` | Toggle automatic `@mempunk-loader` on session start | `mempunk auto-start on` |

### Projects

| Command | Description | Example |
|---------|-------------|---------|
| `mempunk project add <id> <name>` | Register a new project | `mempunk project add api "Backend API"` |
| `mempunk project list` | List all projects | `mempunk project list` |
| `mempunk project activate <id>` | Set the active project | `mempunk project activate api` |
| `mempunk log <id>` | Open project INDEX.md in editor | `mempunk log api` |
| `mempunk remove <id> --yes` | Delete a project (DB + disk, irreversible) | `mempunk remove api --yes` |

### Backlog

| Command | Description | Example |
|---------|-------------|---------|
| `mempunk backlog add <project_id> "<title>"` | Add a task to the backlog | `mempunk backlog add api "Add auth middleware"` |
| `mempunk backlog add ... --priority <1\|2\|3>` | Add task with priority (default: 2) | `mempunk backlog add api "Fix CORS" --priority 1` |
| `mempunk backlog list <project_id>` | List all backlog tasks | `mempunk backlog list api` |
| `mempunk backlog list ... --status <value>` | Filter by status | `mempunk backlog list api --status pending` |
| `mempunk backlog update <id> --status <value>` | Update task status | `mempunk backlog update bl_123 --status done` |
| `mempunk backlog update <id> --priority <value>` | Update task priority | `mempunk backlog update bl_123 --priority 1` |

### Decisions, Skills & Resources

| Command | Description | Example |
|---------|-------------|---------|
| `mempunk decision add <project_id> "<title>"` | Create an ADR with markdown file | `mempunk decision add api "Use JWT for auth"` |
| `mempunk decision add ... --tags "t1,t2"` | Add decision with tags | `mempunk decision add api "Use JWT" --tags "auth,security"` |
| `mempunk decision list <project_id>` | List project decisions | `mempunk decision list api` |
| `mempunk skill add <project_id> <name>` | Create a project skill file | `mempunk skill add api stack` |
| `mempunk skill list <project_id>` | List project skills | `mempunk skill list api` |
| `mempunk skill update <id> --file <path>` | Overwrite skill content from a file | `mempunk skill update sk_123 --file stack.md` |
| `mempunk resource add <project_id> "<title>"` | Capture an external resource | `mempunk resource add api "JWT spec" --url https://jwt.io` |
| `mempunk resource list <project_id>` | List project resources | `mempunk resource list api` |

### Sessions & Logs

| Command | Description | Example |
|---------|-------------|---------|
| `mempunk session log <project_id> "<summary>"` | Record a work session | `mempunk session log api "Implemented login endpoint"` |
| `mempunk session log ... --files "p1,p2"` | Record session with touched files | `mempunk session log api "Fix" --files "src/auth.js"` |
| `mempunk session last <project_id>` | Show the last recorded session | `mempunk session last api` |
| `mempunk session recover <project_id>` | Show latest snapshot (checkpoint or compact) | `mempunk session recover api` |
| `mempunk session checkpoints <project_id>` | List all saved checkpoints and compact snapshots | `mempunk session checkpoints api` |
| `mempunk daily log <project_id> "<content>"` | Add an entry to the daily log | `mempunk daily log api "Finished auth module"` |
| `mempunk daily list <project_id>` | List daily log entries | `mempunk daily list api` |

### Search

| Command | Description | Example |
|---------|-------------|---------|
| `mempunk search "<query>"` | Full-text search across the vault | `mempunk search "refresh token"` |
| `mempunk search "<query>" --project <id>` | Search within a single project | `mempunk search "auth" --project api` |

### Hooks & Agents

| Command | Description | Example |
|---------|-------------|---------|
| `mempunk hooks install` | Install hooks + agents globally in `~/.claude/` | `mempunk hooks install` |
| `mempunk hooks install --local` | Install hooks in `.claude/` of the current project | `mempunk hooks install --local` |
| `mempunk hooks install --check` | Verify hooks, agents, and statusline are installed | `mempunk hooks install --check` |
| `mempunk hooks uninstall` | Remove Mempunk hooks | `mempunk hooks uninstall` |

## Vault Maintenance

```bash
# Check consistency between files on disk and the database
mempunk sync

# Check vault integrity — missing files, unregistered files
mempunk doctor

# Show vault schema version and CLI version
mempunk vault version

# Apply pending schema migrations
mempunk vault upgrade
```

`mempunk vault upgrade` is safe to run at any time. It only applies missing migrations and never modifies existing data.

## Compatibility

| Feature | Claude Code | opencode | gemini-cli |
|---|:---:|:---:|:---:|
| Vault link/unlink | ✔ | ✔ | ✔ |
| Multi-vault | ✔ | ✔ | ✔ |
| Session start protocol | ✔ | ✔ | ✔ |
| Session end protocol | ✔ | ✔ | ✔ |
| Smart Context Check | ✔ | ✔ | ✔ |
| Auto ADRs | ✔ | ✔ | ✔ |
| Intelligent backlog | ✔ | ✔ | ✔ |
| Consolidated daily log | ✔ | ✔ | ✔ |
| Knowledge capture | ✔ | ✔ | ✔ |
| `sync` / `doctor` | ✔ | ✔ | ✔ |
| Wiki (`state.md`) | ✔ | ✔ | ✔ |
| Lifecycle hooks (AutoCheckpoint, CompactGuard) | ✔ | ✘ | ✘ |
| Statusline (context usage bar) | ✔ | ✘ | ✘ |
| Agents (`@mempunk-loader`, `@mempunk-saver`) | ✔ | ✘ | ✘ |
| Multi-CLI simultaneous | ✔ | ✔ | ✔ |

> Session protocols, ADRs, backlog updates, and daily logs are vault-level features — they work in any CLI that reads the vault's `CLAUDE.md`. Lifecycle hooks and agents require Claude Code's sub-agent and hook infrastructure.

## How it Compares

| | Mempunk | RAG / file uploads | Manual notes | Engram |
|---|:---:|:---:|:---:|:---:|
| Persists between sessions | ✔ | ✘ | ✔ | Partial |
| Knowledge accumulates | ✔ | ✘ | Depends | ✘ |
| LLM does the maintenance | ✔ | ✔ | ✘ | ✔ |
| Works offline, no infrastructure | ✔ | ✘ | ✔ | ✘ |
| Cross-CLI | ✔ | ✘ | ✔ | ✘ |
| Auto-saves during session | ✔ | ✘ | ✘ | ✘ |
| Survives context compaction | ✔ | ✘ | ✘ | ✘ |

**vs RAG / file uploads:** Tools like NotebookLM or ChatGPT file uploads retrieve from raw documents at query time. Nothing accumulates. Ask the same question twice and the LLM does the same work twice. Mempunk compiles context incrementally — each session produces a richer, more accurate snapshot.

**vs manual notes:** A wiki you write yourself works — until the maintenance burden kills it. Updating cross-references across dozens of pages is tedious. People abandon wikis because the cost of maintenance grows faster than the value. Mempunk delegates all of that to the LLM.

**vs Engram:** Engram uses SQLite-only storage with no human-readable layer. Mempunk keeps markdown as the human layer with SQLite as the structured backend. The vault is portable, readable in any text editor, and works as an Obsidian vault.

## Languages

Documentation available in: **English** (default), **Español**, **Português**, **Français**

## License

[MIT](LICENSE)
