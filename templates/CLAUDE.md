# CLAUDE.md — Dev Brain (Global Vault)

> This file is the entry point for Claude Code in this vault.
> Read it in full before taking any action. It contains the architecture,
> the navigation rules, and the protocols for every project.

---

## What this vault is

This vault is the centralized brain for all active development projects.
It is not a code repo — it is the persistent memory between Claude Code sessions.

**Core principle:** Claude Code forgets everything between sessions. This vault is
the continuity. At the start of each session, Claude loads the relevant context.
At the end, it writes down what was done.

**Where the data lives (v2):** sessions, backlog, decisions metadata, skills,
resources and daily logs are stored in SQLite (`.mempunk/mempunk.db`) and are
read/written through the `mempunk` CLI — never by editing the database or
hand-maintained backlog/session-log files. The markdown files in this vault are
for narrative content: ADRs, project skills, resources, daily notes, and wikis.

---

## Vault structure

```
vault/
├── CLAUDE.md              # You are here. Always read first.
├── projects/              # One directory per active project
├── areas/                 # Ongoing responsibilities
│   └── INDEX.md           # Areas index
├── resources/             # Reusable technical knowledge
│   └── INDEX.md           # Resources index
├── daily/                 # Daily session logs
│   └── INDEX.md           # Daily index
└── .mempunk/
    └── mempunk.db         # SQLite database — never edit manually
```

---

## Internal structure of each project

Each folder in `projects/` follows this standard structure:

```
projects/[project-name]/
├── INDEX.md             # Entry point — read first
├── overview.md          # Full project description
├── architecture.md      # Stack, technical decisions, diagrams
├── conventions.md       # Rules, standards, and code conventions
├── decisions/           # ADRs (Architecture Decision Records)
│   └── YYYY-MM-DD-title.md
├── skills/              # Project skills (stack, patterns, conventions)
└── wiki/                # Project wiki (compiled state, log, sources)
```

> Note: there is no `backlog.md` or `session-log.md` on disk. The backlog and
> session history live in SQLite and are accessed through the `mempunk` CLI.

---

## Active projects

<!-- MEMPUNK:PROJECTS:START -->
*None registered yet. Use `mempunk project add <id> <name>` to add one.*
<!-- MEMPUNK:PROJECTS:END -->

---

## Daily-flow commands

```
mempunk project list --json                          → list all projects
mempunk project activate <id> [--here]               → set the active project (--here maps the cwd)
mempunk session last <id> --json                     → last session summary
mempunk session log <id> "<summary>" --files "a,b"   → record a work session
mempunk backlog list <id> --status pending --json    → pending tasks
mempunk backlog add <id> "<title>"                   → add a task
mempunk backlog update <task_id> --status <value>    → update a task status
mempunk decision add <id> "<title>"                  → create an ADR (markdown + DB)
mempunk skill list <id> --json                       → project skills (read their file_path)
mempunk search "<query>" --json                      → full-text search in the vault
```

Always add `--json` to read commands and parse the JSON — never scrape table output.
Full command reference: run `mempunk` or see the README.

---

## Session start protocol

> **First: check whether the agents are installed.**
> Run `mempunk hooks install --check` or look for `@mempunk-loader` among your agents.

### Path A — With agents (Claude Code, automatic mode)

If the `@mempunk-loader` agent is available, **invoke it directly**.
The agent handles project selection, activation, and full context loading.
Do not follow the manual protocol — it would be redundant.

If `auto-start` is configured, the agent has already been invoked automatically
when this session opened. Just confirm the project and continue.

### Path B — Without agents (manual mode, Gemini CLI, opencode)

**At the start of any session, Claude MUST:**

1. Read this file (`CLAUDE.md`) in full
2. List the registered projects: `mempunk project list --json`
3. Ask the user: *"I found these projects: [list]. Which one are we working on today?"*
4. Run `mempunk project activate <id>` to activate the chosen project (add `--here` if you are inside the repo folder, so checkpoints resolve by directory)
5. Read the last session: `mempunk session last <id> --json`
6. Read the project's `INDEX.md` and `overview.md`
7. Check whether `wiki/state.md` exists in the project:
   - If it **exists**: read `wiki/state.md` (compiled state)
   - If it **does not exist**: rely on the session summary from step 5
8. Read the pending tasks: `mempunk backlog list <id> --status pending --json`
9. Read the project's skills: `mempunk skill list <id> --json`, then read each `file_path`
10. Confirm with the user: *"I loaded the context for [project]. Last work was [summary]. Do we continue with [X] or is there something new?"*

**Never assume the project — always ask first.**
**Never read a project's files before the user confirms it.**
**Never start writing code without completing these steps.**

---

## Session close protocol

> If `@mempunk-saver` is available, you can use it for saving.
> Otherwise, follow the manual protocol.

### Manual close

**At the end of any work session, Claude MUST:**

1. Update every task that changed state: `mempunk backlog update <task_id> --status done` (or `in_progress`, `blocked`)
2. Record technical decisions made: `mempunk decision add <project_id> "<title>"` and fill in the generated ADR file
3. Record the session: `mempunk session log <project_id> "<summary>" --files "file1,file2"`
4. Update the project's `INDEX.md` with the latest session and the backlog top 3
5. Update `wiki/state.md` if it exists — rewrite with the compiled state and append a line to `wiki/log.md`
6. Write or update `daily/YYYY-MM-DD.md` (see skill: Consolidated daily)

The CLI writes (steps 1-3) are mandatory — they persist to SQLite. The markdown
notes (steps 4-6) are the narrative layer on top.

---

## Automatic skills

### Automatic ADRs

If during any session a technical decision is made that affects architecture, stack, code patterns, or infrastructure — Claude must run `mempunk decision add <project_id> "<title>"` immediately (which creates the ADR file in `projects/[name]/decisions/` and registers it in the DB), then fill in the file without waiting for the user to ask.

ADR format:

```markdown
# YYYY-MM-DD — [Decision title]

## Context
[Why this decision came up]

## Decision
[What was decided]

## Alternatives considered
[What other options existed]

## Consequences
[What this decision implies going forward]
```

After creating the ADR, update the project's `INDEX.md` with a mention in the latest-session section.

### Knowledge capture in resources/

If Claude solves a problem during the session that is likely to recur (configuring something on Debian, a NestJS pattern, a Dokploy workaround, a PostgreSQL configuration, etc.), it must save it with `mempunk resource add <project_id> "<title>" --url <url>` or as a note under `resources/[category]/title.md`.

Categories: `debian/`, `nestjs/`, `nextjs/`, `electron/`, `dokploy/`, `postgresql/`, `general/`

Before solving a generic technical problem, first search the vault: `mempunk search "<query>" --json`.

### Smart backlog

Task state changes are recorded **immediately** via the CLI, not at session close:
- Starting a task → `mempunk backlog update <task_id> --status in_progress`
- Finishing a task → `mempunk backlog update <task_id> --status done`
- New tasks that emerge → `mempunk backlog add <project_id> "<title>"`

After updating the backlog, reflect the updated top 3 in the project's `INDEX.md`.

### Consolidated daily

When closing the session, in addition to `mempunk session log`, Claude must write or update `daily/YYYY-MM-DD.md` with this format:

```markdown
# YYYY-MM-DD

## Projects worked on
- **[project]:** [one line of what was done]

## Decisions of the day
- [relevant decisions made]

## Executive summary
[2-3 lines of the most important things of the day]
```

If the day's entry already exists (because there was an earlier session), append below without deleting anything.

### Areas context

- If the user asks about something related to a registered area, read `areas/[area]/INDEX.md` before answering.

---

## How to navigate this vault

**Fundamental rule:** never jump straight to an internal file. Always enter through the corresponding INDEX.md and follow the link from there. For anything stored in SQLite (sessions, backlog, skills metadata), use the CLI with `--json` instead of looking for files.

### To work on a project:
1. Go to the project's INDEX.md (linked in "Active projects" above)
2. Decide whether to go deeper → follow the link to `overview.md` from the INDEX
3. Read backlog and session history via the CLI (`mempunk backlog list`, `mempunk session last`)

### For technical decisions:
- Create the ADR via `mempunk decision add` — it lands in `projects/[name]/decisions/`

### For generic technical problems:
- Search first: `mempunk search "<query>" --json`
- If no relevant note exists, save the solution for future sessions

### For area context:
- Go to [[areas/INDEX|Areas]] and follow the link to the corresponding area

### For the day's history:
- Go to [[daily/INDEX|Daily]] and find the day's entry

---

## Preferences (customize)

<!-- MEMPUNK:PREFS:START -->
### Preferred stack
- **Backend:**
- **Frontend:**
- **Database:**
- **Deploy:**

### Code style
- Modular, with clear separation of responsibilities

### Communication
- Direct, concise answers
- Ask before making destructive or irreversible changes
- Confirm understanding of the context at session start
<!-- MEMPUNK:PREFS:END -->

---

## Rules Claude must NOT break

1. **Never modify production code without explicit user confirmation**
2. **Never store credentials, API keys, or passwords in the vault**
3. **Never skip the session start protocol**
4. **Never assume which project is relevant** — ask if there is ambiguity
5. **Always run `mempunk session log` when finishing**
6. **Always update the backlog (via CLI) and INDEX.md when closing a session**
7. **Always create an ADR when a relevant technical decision is made**
