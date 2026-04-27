[English](README.md) | [Español](README.es.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Persistent dev brain for Claude Code — a markdown vault that survives between sessions.

## The Problem

Claude Code forgets everything when a session ends. Context, decisions, progress — gone. The next session starts from zero.

## The Solution

Mempunk is a structured markdown vault that Claude reads at the start of each session and writes to at the end. It stores project overviews, architecture decisions, backlogs, and session logs. You manage it with a CLI. Claude navigates it with slash commands.

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
mempunk -v                     Show version
```

### Project management

```
mempunk project <name>         Add a new project to the vault
mempunk backlog <name>         Show a project's backlog in the terminal
mempunk log <name>             Open a project's session log in your editor
```

### Options

```
--lang <code>      Language: en, es (default: en)
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
mempunk backlog my-saas
mempunk log my-saas
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
│       ├── backlog.md     # Prioritized tasks (- [ ] / - [x])
│       ├── session-log.md # What Claude did each session
│       └── decisions/     # Architecture Decision Records
├── areas/                 # Ongoing responsibilities (not projects)
├── resources/             # Reusable technical knowledge
└── daily/                 # Daily session logs
```

`mempunk project <name>` scaffolds this structure and registers the project in `CLAUDE.md` with a direct `[[wikilink]]`.

## Session Flow

### Start: `/mempunk`

Installed globally at `~/.claude/skills/mempunk/` during setup. When you type `/mempunk` in any Claude Code session, Claude will:

1. Read the vault's `CLAUDE.md`
2. See the project index with direct links
3. Ask which project you want to work on
4. Read that project's overview, last 3 session logs, and backlog
5. Confirm context before proceeding

### End: `/session-end`

Installed globally at `~/.claude/skills/session-end/`. When you type `/session-end`, Claude will:

1. Identify which project was worked on
2. Write a structured entry to the project's `session-log.md`
3. Include: what was done, decisions made, current state, next steps, files modified
4. Confirm what was logged

The next session picks up exactly where this one left off.

## Obsidian Compatible

All files use `[[wikilinks]]`. Open the vault in Obsidian and the graph view shows connections between `CLAUDE.md`, project overviews, backlogs, architecture docs, and session logs.

## Languages

Available: **English** (default), **Español**

Use `--lang es` with any command, or select interactively during setup.

## License

[MIT](LICENSE)
