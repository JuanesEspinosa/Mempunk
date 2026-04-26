# Mempunk

Persistent dev brain for Claude Code — memory vault across sessions.

Claude Code forgets everything between sessions. Mempunk is the continuity: it reads context at the start, writes what it did at the end.

## Quick Start

```bash
npx mempunk
```

That's it. The interactive setup will ask where to create the vault, which folders to include, and link it to Claude Code automatically.

After setup, every `claude` session in any project has access to your vault.

## CLI

```
mempunk setup                  Interactive full setup (recommended)
mempunk init [path] [options]  Create a new vault
mempunk link <path>            Link vault to Claude Code
mempunk unlink                 Remove vault from Claude Code config
mempunk status                 Show current linked vault
```

### Init options

```bash
# Presets
mempunk init ./vault --preset full       # projects, areas, resources, daily
mempunk init ./vault --preset standard   # projects, resources, daily
mempunk init ./vault --preset minimal    # projects only

# Pick specific folders
mempunk init ./vault --projects --resources --daily
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

1. **Session start:** Claude reads `CLAUDE.md` → identifies the project → reads overview + session-log + backlog → confirms context with the user
2. **During session:** Claude works with full context of past decisions
3. **Session end:** Claude writes to the session-log what it did, decided, and what's next

## What Does `link` Do?

It adds the vault path to Claude Code's global config (`~/.claude.json` → `additionalDirectories`). After linking, every `claude` session — in any project — can read and write to the vault automatically.

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
