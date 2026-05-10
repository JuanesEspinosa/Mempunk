[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Persistent dev brain for AI coding CLIs — a markdown vault that survives between sessions. Works with **Claude Code**, **opencode**, and **gemini-cli**.

## The Problem

AI coding CLIs have no memory between sessions. Every time you start a new conversation, your assistant doesn't know:

- What you were working on yesterday
- What architectural decisions were already made
- What tasks are pending or done
- What files were modified and why
- What the next steps were supposed to be
- Which CLI tool you were using (Claude Code? opencode? gemini-cli?)

You end up repeating context, re-explaining decisions, and losing momentum. The longer a project runs, the worse it gets.

On top of that, if you switch between different AI coding CLIs — Claude Code for some projects, opencode or gemini-cli for others — each tool lives in its own silo. Your context is fragmented across tools.

## The Solution

Mempunk is a structured markdown vault that acts as your AI's persistent memory. It works in two moments:

- **Session start** (`/mempunk`): the assistant reads the vault, sees your projects, loads the relevant overview, conventions, the last session logs, and the backlog. It picks up where you left off.
- **Session end** (`/session-end`): the assistant writes what it did, what decisions were made, what's left, and which files were touched. The next session starts with full context.

The vault is just markdown files organized by project. You manage it with a CLI. Your AI assistant navigates it with slash commands. It also works as an Obsidian vault, so you can browse and search everything visually.

No database. No server. No API keys. Just files.

And because the vault is CLI-agnostic, you can use the same vault with Claude Code, opencode, and gemini-cli simultaneously. Switch between CLIs without losing context.

## Quick Start

```bash
# 1. Run setup (asks which CLI you'll use, creates and links a vault)
npx mempunk

# 2. Add a project
npx mempunk project my-app

# 3. In any session of your chosen CLI, type:
/mempunk

# 4. When you're done, type:
/session-end
```

## CLI Reference

### Vault management

```
mempunk setup                  Interactive full setup (recommended)
mempunk init [path] [options]  Create a new vault
mempunk link <path>            Link a vault to your CLI (supports multiple)
mempunk unlink [path]          Unlink a vault (interactive if multiple)
mempunk status                 Show all linked vaults and their projects
mempunk cli add <name>         Add a CLI (claude-code, opencode, gemini-cli)
mempunk cli remove <name>      Remove a CLI
mempunk cli list               Show active CLIs
mempunk auto-start [on|off]    Auto-run /mempunk on new sessions
mempunk -v                     Show version
```

### Project management

```
mempunk project <name>         Add a new project to the vault
mempunk remove <name>          Remove a project from the vault
mempunk backlog <name>         Show a project's backlog in the terminal
mempunk log <name>             Open a project's session log in your editor
mempunk sync                   Add missing template files to existing projects
mempunk doctor                 Check vault health and integrity
```

> All project commands ask which vault to use when multiple are linked.

### Options

```
--lang <code>      Language: en, es, pt, fr (default: en)
--preset <name>    Preset: full, standard, minimal
--projects         Include projects folder
--areas            Include areas folder
--resources        Include resources folder
--daily            Include daily folder
```

### Examples

```bash
mempunk setup --lang es
mempunk init ./vault --preset full
mempunk init ./vault --projects --resources --daily
mempunk project my-saas
mempunk remove my-saas
mempunk backlog my-saas
mempunk log my-saas
mempunk sync
mempunk doctor
mempunk status
mempunk cli add opencode
mempunk cli add gemini-cli
mempunk cli list
mempunk cli remove opencode
```

## Vault Structure

```
vault/
├── CLAUDE.md              # Entry point — Claude reads this first
├── projects/
│   └── my-project/
│       ├── INDEX.md       # Quick entry point — status, top 3 backlog, links
│       ├── overview.md    # What the project is, stack, repo, status
│       ├── architecture.md # Technical decisions and diagrams
│       ├── conventions.md # Project rules, coding standards, patterns
│       ├── backlog.md     # Prioritized tasks (- [ ] / - [x])
│       ├── session-log.md # What Claude did each session
│       ├── decisions/     # Architecture Decision Records
│       └── wiki/          # LLM-maintained wiki (state, log, sources)
├── areas/                 # Ongoing responsibilities (not projects)
│   └── INDEX.md           # Area index
├── resources/             # Reusable technical knowledge
│   └── INDEX.md           # Resource index by category
└── daily/                 # Daily consolidated logs
    └── INDEX.md           # Daily index
```

`CLAUDE.md` links directly to each project's `INDEX.md` — never to internal files. Each `INDEX.md` then links to the project's internal files. This keeps the Obsidian graph clean (tree, not spider web).

`mempunk project <name>` scaffolds this structure and registers the project in `CLAUDE.md` with a direct `[[wikilink]]` to its `INDEX.md`.

`mempunk sync` adds any missing template files (like `INDEX.md`, `conventions.md`, `wiki/`) to existing projects without overwriting.

## Supported CLIs

mempunk supports using multiple CLIs simultaneously with the same vault. During `setup`, select one or more CLIs. You can add more later with `mempunk cli add <name>`. Each CLI gets its own native registration:

| CLI | Vault registration | Skills location |
|---|---|---|
| **Claude Code** | `~/.claude.json` → `additionalDirectories[]` | `~/.claude/skills/<name>/SKILL.md` |
| **opencode** | `~/.config/opencode/AGENTS.md` (markers) | `~/.config/opencode/skills/<name>/SKILL.md` |
| **gemini-cli** | `~/.gemini/settings.json` → `context.includeDirectories[]` | `~/.gemini/skills/<name>/SKILL.md` |

The vault itself (markdown files in `projects/`, `daily/`, etc.) is the same regardless of CLI — it's portable. When you `link` or `unlink` a vault, the operation applies to all active CLIs at once. Your active CLIs are persisted in `~/.mempunk/config.json`.

### Feature compatibility

| Feature | Claude Code | opencode | gemini-cli |
|---|:---:|:---:|:---:|
| Vault link/unlink | ✔ | ✔ | ✔ |
| Multi-vault | ✔ | ✔ | ✔ |
| `/mempunk` skill | ✔ | ✔ | ✔ |
| `/session-end` skill | ✔ | ✔ | ✔ |
| Smart Context Check | ✔ | ✔ | ✔ |
| Auto ADRs | ✔ | ✔ | ✔ |
| Backlog inteligente | ✔ | ✔ | ✔ |
| Daily consolidado | ✔ | ✔ | ✔ |
| Knowledge capture | ✔ | ✔ | ✔ |
| `sync` / `doctor` | ✔ | ✔ | ✔ |
| Wiki (state.md) | ✔ | ✔ | ✔ |
| Auto-start | ✔ | ✘ | ✔ |
| Simultaneous multi-CLI | ✔ | ✔ | ✔ |

> Skills, ADRs, backlog updates, and daily logs are vault-level features — they work in any CLI that reads the vault's `CLAUDE.md`. Auto-start requires session hooks, which opencode does not support.

## Session Flow

### Start: `/mempunk`

Installed globally during setup at the path your CLI uses for skills (see table above). When you type `/mempunk`, the assistant will:

1. Discover all linked vaults automatically
2. If multiple vaults exist, ask which one to use
3. Read the vault's `CLAUDE.md` and list available projects
4. Ask which project you want to work on — never assumes
5. Read the project's `INDEX.md`, `overview.md`, `conventions.md`
6. Read project state — if `wiki/state.md` exists, reads it (compiled state); otherwise reads the last 3 session logs
7. **Smart Context Check** — detect gaps (stale session log, empty overview, undefined architecture, empty backlog) and offer to read the real project repo if needed
8. Confirm context before proceeding

### End: `/session-end`

Installed alongside `/mempunk`. When you type `/session-end`, the assistant will:

1. Write a structured entry to the project's `session-log.md`
2. **Update backlog** — mark completed tasks, add new ones, reorder by priority
3. **Update INDEX.md** — reflect latest session and top 3 backlog items
4. **Update wiki state** — if `wiki/` exists, rewrites `wiki/state.md` with a compiled synthesis and appends to `wiki/log.md`
5. **Write daily log** — create or append to `daily/YYYY-MM-DD.md` with a consolidated summary
6. Note any conventions that were established or changed
7. Confirm what was logged

The next session picks up exactly where this one left off.

### Automatic skills

The vault's `CLAUDE.md` includes rules that the assistant follows automatically during any session:

- **Auto ADRs** — When a technical decision is made (architecture, stack, patterns), an ADR is created in `decisions/` without being asked
- **Knowledge capture** — When a reusable technical problem is solved, the solution is saved in `resources/` by category
- **Area context** — When the user asks about university or infrastructure, the assistant reads the relevant `areas/` INDEX first

## Vault Maintenance

```bash
# Add missing files to existing projects after updating mempunk
mempunk sync

# Check vault integrity — ghost projects, missing files, broken registrations
mempunk doctor
```

## Multiple Vaults

You can link multiple vaults and switch between them at session start:

```bash
mempunk link ./work-vault
mempunk link ./personal-vault

# /mempunk will ask which vault to use

mempunk unlink ./personal-vault   # Unlink a specific vault
mempunk unlink                    # Interactive selection if multiple
mempunk status                    # Shows all linked vaults
```

## Multiple CLIs

Use the same vault with different AI coding CLIs at the same time:

```bash
# Add a second CLI
mempunk cli add opencode

# Add a third
mempunk cli add gemini-cli

# link/unlink now registers in all active CLIs at once
mempunk link ./my-vault    # Registers in Claude Code, opencode, AND gemini-cli

# See which CLIs are active
mempunk cli list

# Remove one
mempunk cli remove gemini-cli
```

`doctor` checks skills for all active CLIs. `status` aggregates vaults from all CLIs.

## Auto-start

Automatically load your vault context at the beginning of every new Claude Code session:

```bash
# Enable
mempunk auto-start on

# Disable
mempunk auto-start off

# Check status
mempunk auto-start
```

This installs a `SessionStart` hook in the CLI's `settings.json`. When enabled, `/mempunk` runs automatically on every new session — no need to type it manually. If multiple supported CLIs are active, the command asks which one to configure.

> **Note:** Auto-start is available for **Claude Code** and **gemini-cli**. opencode does not support session hooks. If you unlink all vaults, hooks are automatically removed.

## Obsidian Compatible

All files use `[[wikilinks]]`. Open the vault in Obsidian and the graph view shows connections between `CLAUDE.md`, project overviews, backlogs, architecture docs, conventions, and session logs.

## Languages

Available: **English** (default), **Español**, **Português**, **Français**

Use `--lang es`, `--lang pt`, or `--lang fr` with any command, or select interactively during setup.

## License

[MIT](LICENSE)
