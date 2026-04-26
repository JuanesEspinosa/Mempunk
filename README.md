[English](README.md) | [Español](README.es.md)

# Mempunk

Persistent dev brain for Claude Code — memory vault across sessions.

Claude Code forgets everything between sessions. Mempunk is the continuity: it reads context at the start, writes what it did at the end.

## Quick Start

```bash
# 1. Create and link vault
npx mempunk

# 2. Add a project
npx mempunk project my-app

# 3. In any Claude Code session, type:
/mempunk
```

That's it. Claude loads the vault, sees your projects, and picks up where it left off.

## CLI

```
mempunk setup                  Interactive full setup (recommended)
mempunk init [path] [options]  Create a new vault
mempunk project <name>         Add a new project to the vault
mempunk link <path>            Link vault to Claude Code
mempunk unlink                 Remove vault from Claude Code config
mempunk status                 Show current linked vault
mempunk help                   Show this message
```

### Init options

```bash
--lang <code>      Language: en, es (default: en)
--preset <name>    Preset: full, standard, minimal
--projects         Include projects folder
--areas            Include areas folder
--resources        Include resources folder
--daily            Include daily folder
```

### Examples

```bash
# Interactive setup in Spanish
mempunk setup --lang es

# Create vault with preset
mempunk init ./vault --preset full

# Pick specific folders
mempunk init ./vault --projects --resources --daily

# Add projects
mempunk project my-saas
mempunk project mobile-app

# Link existing vault
mempunk link ./my-vault

# Check what's linked
mempunk status
```

## Adding Projects

```bash
mempunk project arion-colombia
```

This command:
1. Creates the full project structure inside the vault
2. Registers the project in `CLAUDE.md` with a direct link
3. Connects all files with Obsidian `[[wikilinks]]`

After adding a project, Claude knows it exists and can navigate directly to it without scanning all folders.

## Vault Structure

```
vault/
├── CLAUDE.md              # Entry point — Claude reads this first
├── projects/              # One directory per active project
│   └── my-project/
│       ├── overview.md    # General context (read first)
│       ├── architecture.md # Stack and technical decisions
│       ├── backlog.md     # Prioritized pending tasks
│       ├── session-log.md # Log of each Claude session
│       └── decisions/     # Architecture Decision Records
├── areas/                 # Ongoing responsibilities
├── resources/             # Reusable technical knowledge
└── daily/                 # Daily session logs
```

## How It Works

1. **Setup:** `npx mempunk` — choose language, location, and structure
2. **Add projects:** `mempunk project <name>` — scaffolds and registers each project
3. **Use:** Type `/mempunk` in any Claude Code session
4. **Session start:** Claude reads `CLAUDE.md`, sees project index, reads the relevant overview + session-log + backlog, and confirms context
5. **Session end:** Claude writes what it did, decided, and what's next to the session-log

## The `/mempunk` Command

During setup, a global slash command is installed at `~/.claude/skills/mempunk/`. In any Claude Code session, type `/mempunk` and Claude will:

1. Read the vault's `CLAUDE.md`
2. List your active projects
3. Ask which one you want to work on
4. Load the full context for that project

No need to copy-paste prompts or remember paths.

## Languages

Currently available:

- **English** (default)
- **Espanol**

Use `--lang es` with any command, or select interactively during setup.

## Obsidian Compatible

All files use `[[wikilinks]]` — the graph view shows connections between CLAUDE.md, project overviews, backlogs, architecture docs, and session logs.

## Customize

Edit `CLAUDE.md` to adjust:
- Stack and code style preferences
- Communication rules
- Session start/end protocols

## License

MIT
