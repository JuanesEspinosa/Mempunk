# Mempunk

Persistent dev brain for Claude Code — memory vault across sessions.

Claude Code forgets everything between sessions. Mempunk is the continuity: it reads context at the start, writes what it did at the end.

## Quick Start

```bash
npx mempunk
```

The interactive setup will guide you through language, vault location, folder structure, and linking to Claude Code.

After setup, you'll get a ready-to-use prompt to paste at the start of any Claude Code session.

## CLI

```
mempunk setup                  Interactive full setup (recommended)
mempunk init [path] [options]  Create a new vault
mempunk link <path>            Link vault to Claude Code
mempunk unlink                 Remove vault from Claude Code config
mempunk status                 Show current linked vault
mempunk help                   Show this message
```

### Options

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

# Link existing vault
mempunk link ./my-vault

# Check what's linked
mempunk status
```

## Vault Structure

```
vault/
├── CLAUDE.md              # Entry point — Claude reads this first
├── projects/              # One directory per active project
├── areas/                 # Ongoing responsibilities
├── resources/             # Reusable technical knowledge
└── daily/                 # Daily session logs
```

### Per-project structure

```
projects/my-project/
├── overview.md            # General context (read first)
├── architecture.md        # Stack and technical decisions
├── backlog.md             # Prioritized pending tasks
├── decisions/             # Architecture Decision Records
└── session-log.md         # Log of each Claude session
```

## How It Works

1. **Setup:** Run `npx mempunk` — choose language, location, and structure
2. **Link:** The CLI adds the vault to Claude Code's global config automatically
3. **Use:** At the start of any Claude Code session, paste the prompt that the CLI gives you
4. **Session start:** Claude reads `CLAUDE.md`, identifies the project, reads context, and confirms with you
5. **Session end:** Claude writes to the session-log what it did, decided, and what's next

## What Does `link` Do?

It adds the vault path to Claude Code's global config (`~/.claude.json` > `additionalDirectories`). After linking, every `claude` session — in any project — can read and write to the vault.

## Languages

Mempunk supports multiple languages. Currently available:

- **English** (default)
- **Espanol**

Use `--lang es` with any command, or select it interactively during setup.

## Obsidian Compatible

This vault works as an Obsidian vault. All files are standard markdown — browse, search, and link notes visually.

## Customize

Edit `CLAUDE.md` to adjust:
- Stack and code style preferences
- Communication rules
- Session start/end protocols
- New project templates

## License

MIT
