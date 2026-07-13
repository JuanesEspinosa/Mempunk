# Session start

If the hooks are installed (`mempunk hooks install`), the start and close steps run automatically. Check with `mempunk hooks install --check` whether they are active. If the `@mempunk-loader` agent already loaded the context this session, do not repeat these steps — just confirm the active project.

Run these commands in order before writing a single line of code or answering the user. Use `--json` on every read command and parse the JSON output — never scrape table output.

---

## Step 1 — Last session

```
mempunk session last <project_id> --json
```

Parse the JSON object. Extract:
- What the previous session did (`summary` field)
- Which files were touched (`files_touched` field)
- When it happened (`ended_at` field)

**If the command returns `null`:** this is the project's first session. Skip to step 4 instead of step 3.

---

## Step 2 — Project skills

```
mempunk skill list <project_id> --json
```

For each skill in the JSON array, read the file at its `file_path`:

```
Read <file_path>
```

Load that context before continuing. Skills contain the project's stack, patterns, and conventions — they matter more than the session log.

**If there are no skills:** continue. There is no project context to load yet.

---

## Step 3 — Pending tasks

```
mempunk backlog list <project_id> --status pending --json
```

Review which tasks are open. Do nothing with them yet — just load them as context for when the user says what to work on.

---

## Step 4 — First session of the project

If `session last` returned `null`, run:

```
mempunk sync --project <project_id>
```

Review the output:
- If there are `unregistered_files`: files exist on disk without a DB record. Inform the user.
- If there are `missing_files`: DB records exist without a file on disk. Inform the user.
- If it reports the vault is in sync: the initial state is clean, continue.

---

## Rules

- **Do not read INDEX.md** unless the user explicitly asks for it.
- Use `mempunk search "<term>" --json` if you need to find something specific in the vault.
- Do not ask the user what to load — load all of the above silently and then respond.
