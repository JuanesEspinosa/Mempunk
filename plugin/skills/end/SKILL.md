---
description: Close the work session in the Mempunk vault — session log, backlog, decisions, compiled state and sync. Use when the user types /mempunk:end.
disable-model-invocation: true
allowed-tools: Bash Read
---

Close this session in the Mempunk vault. Use the Mempunk MCP tools when available; otherwise the
`mempunk` CLI with the same data. If no Mempunk project was active in this session, ask which one.

1. **Decisions:** for each technical or architectural decision made in this session that is not
   saved yet: `save_decision` (or `mempunk decision add <id> "<decision>"`).
2. **Backlog:** list pending tasks (`backlog_list` / `mempunk backlog list <id> --json`). Mark the
   tasks finished in this session as done, update the ones that changed, and add new ones that came up.
3. **Session log:** `log_session` (or `mempunk session log <id> "<summary>" --files "a,b"`) with a
   specific summary: what was done, current state, next steps, and the real files touched.
4. **State:** rewrite the project's compiled state with `update_state` (or `wiki/state.md`): current
   state, what is being built, active decisions, blockers, next 3 steps.
5. **Sync:** if the vault has a remote (`mempunk remote show`), run
   `mempunk push --message-stdin --project <id>` with the summary on stdin. Do not run git directly.
6. Confirm to the user what was saved and whether the push ran.
