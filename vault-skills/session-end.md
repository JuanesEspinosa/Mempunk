# Session close

Run these steps when finishing. If you already made incremental saves during the session, this process is fast — it only consolidates what already exists.

These CLI writes persist to SQLite (`.mempunk/mempunk.db`) — they are the source of truth for backlog and session history. Markdown notes (ADRs, daily) complement them; they do not replace them.

---

## Step 1 — Update the backlog

For each task that changed state during the session, run:

```
mempunk backlog update <id> --status <done|in_progress|pending>
```

Only the ones that changed. Do not touch the ones that stayed the same. If you need the task ids, list them with `mempunk backlog list <project_id> --json`.

---

## Step 2 — Capture pending decisions

If you made an important architectural decision during the session and did not save it at the time, save it now:

```
mempunk decision add <project_id> "<decision title>"
```

Then fill in the generated markdown file. If you already saved it with an incremental save, do not duplicate it.

---

## Step 3 — Log the session

```
mempunk session log <project_id> "<summary>" --files "path1,path2,path3"
```

### Summary format

Write in this order, separated by periods:
1. What was done
2. What decisions were made (if not saved as individual decisions)
3. What is left pending

Example:
```
"Implemented authentication endpoint with JWT. Decided to use refresh tokens in an httpOnly cookie. Pending: integration tests and expiration handling."
```

### How to build --files

Include only the files you actually modified in this session. Do not include files you only read. Use paths relative to the project when possible.

---

## Step 4 — Update the daily note

Write or update `daily/YYYY-MM-DD.md` in the vault with a short entry: projects worked on, decisions of the day, and a 2-3 line executive summary. If the day's entry already exists, append below without deleting anything.

---

## Rules

- **Do not rewrite** what you already saved with incremental saves during the session.
- The session log is the final summary, not the only source of truth.
- If the session was short and there were no significant changes, the summary can be a single line.
