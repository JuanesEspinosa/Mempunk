[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Persistent dev brain for Claude Code — a markdown vault that survives between sessions.

## The Problem

Claude Code has no memory between sessions. Every time you start a new conversation, it doesn't know:

- What you were working on yesterday
- What architectural decisions were already made
- What tasks are pending or done
- What files were modified and why
- What the next steps were supposed to be

You end up repeating context, re-explaining decisions, and losing momentum. The longer a project runs, the worse it gets.

## The Solution

Mempunk is a structured markdown vault that acts as Claude's persistent memory. It works in two moments:

- **Session start** (`/mempunk`): Claude reads the vault, sees your projects, loads the relevant overview, conventions, the last session logs, and the backlog. It picks up where you left off.
- **Session end** (`/session-end`): Claude writes what it did, what decisions were made, what's left, and which files were touched. The next session starts with full context.

The vault is just markdown files organized by project. You manage it with a CLI. Claude navigates it with slash commands. It also works as an Obsidian vault, so you can browse and search everything visually.

No database. No server. No API keys. Just files.

## Quick Start

```bash
# 1. Create and link a vault
npx mempunk

# 2. Add a project
npx mempunk project my-app

# 3. In any Claude Code session, type:
/mempunk

# 4. When you're done, type:
/session-end
```

## CLI Reference

### Vault management

```
mempunk setup                  Interactive full setup (recommended)
mempunk init [path] [options]  Create a new vault
mempunk link <path>            Link vault to Claude Code (global config)
mempunk unlink                 Remove vault from Claude Code config
mempunk status                 Show vault dashboard with project info
mempunk sync                   Add missing template files to existing projects
mempunk doctor                 Check vault health and integrity
mempunk -v                     Show version
```

### Project management

```
mempunk project <name>         Add a new project to the vault
mempunk remove <name>          Remove a project from the vault
mempunk backlog <name>         Show a project's backlog in the terminal
mempunk log <name>             Open a project's session log in your editor
```

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
```

## Vault Structure

```
vault/
├── CLAUDE.md              # Entry point — Claude reads this first
├── projects/
│   └── my-project/
│       ├── overview.md    # What the project is, stack, repo, status
│       ├── architecture.md # Technical decisions and diagrams
│       ├── conventions.md # Project rules, coding standards, patterns
│       ├── backlog.md     # Prioritized tasks (- [ ] / - [x])
│       ├── session-log.md # What Claude did each session
│       └── decisions/     # Architecture Decision Records
├── areas/                 # Ongoing responsibilities (not projects)
├── resources/             # Reusable technical knowledge
└── daily/                 # Daily session logs
```

`mempunk project <name>` scaffolds this structure and registers the project in `CLAUDE.md` with a direct `[[wikilink]]`.

`mempunk sync` adds any missing template files (like `conventions.md`) to existing projects without overwriting.

## Session Flow

### Start: `/mempunk`

Installed globally at `~/.claude/skills/mempunk/` during setup. When you type `/mempunk` in any Claude Code session, Claude will:

1. Read the vault's `CLAUDE.md`
2. See the project index with direct links
3. Ask which project you want to work on
4. Read that project's overview and conventions
5. Read the last 3 session logs and backlog
6. Confirm context before proceeding

### End: `/session-end`

Installed globally at `~/.claude/skills/session-end/`. When you type `/session-end`, Claude will:

1. Identify which project was worked on
2. Write a structured entry to the project's `session-log.md`
3. Include: what was done, decisions made, current state, next steps, files modified
4. Note any conventions that were established or changed
5. Confirm what was logged

The next session picks up exactly where this one left off.

## Vault Maintenance

```bash
# Add missing files to existing projects after updating mempunk
mempunk sync

# Check vault integrity — ghost projects, missing files, broken registrations
mempunk doctor
```

## Obsidian Compatible

All files use `[[wikilinks]]`. Open the vault in Obsidian and the graph view shows connections between `CLAUDE.md`, project overviews, backlogs, architecture docs, conventions, and session logs.

## Languages

Available: **English** (default), **Español**, **Português**, **Français**

Use `--lang es`, `--lang pt`, or `--lang fr` with any command, or select interactively during setup.

## License

[MIT](LICENSE)
