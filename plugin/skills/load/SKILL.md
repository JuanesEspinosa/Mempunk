---
description: Load or switch the Mempunk project for this session (last session, pending backlog, recent decisions, skills). Use when the user types /mempunk:load, asks to load the vault or project context, or wants to switch to or create a Mempunk project.
argument-hint: "[project-id]"
allowed-tools: Bash Read
---

Load the Mempunk context for this session. Mempunk is a persistent dev brain: a local vault
(`~/Dev-Brain`, or `MEMPUNK_VAULT`) managed by the `mempunk` CLI. Always use `--json` when reading;
never parse the ASCII tables.

If the SessionStart hook already injected a Mempunk context block for a project in this session,
do not load it again: confirm the active project and continue. Switch only if the user asks.

1. If `$ARGUMENTS` names a project id, use it. Otherwise run `mempunk project list --json`, show the
   projects as a numbered list (id and name) and ask which one to work on. Never assume.
   - If the user wants a new project: `mempunk project add <id> "<name>"`.
   - If `mempunk` is not found, tell the user to run `npm install -g mempunk` and stop.
2. `mempunk project activate <id>`. Add `--here` when the current directory is that project's repo.
3. `mempunk context <id>` and read its output: state, last session, pending backlog, decisions.
4. `mempunk skill list <id> --json` and read each `file_path` with Read.
5. Give the user a short summary (last session, top pending tasks, key decisions) and ask what to
   work on.

During the session, save decisions, backlog changes and session logs with the Mempunk MCP tools
(`save_decision`, `backlog_update`, `log_session`, `update_state`) when available, or with the CLI.
