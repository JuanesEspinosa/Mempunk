# Backlog workflow

The backlog lives in SQLite and is managed exclusively through the `mempunk` CLI — there is no `backlog.md` file to edit. Use `--json` when listing and parse the output.

---

## When to add a task

Add a task to the backlog only if it meets both conditions:

1. It stands on its own — it is not a step inside a larger task
2. It will take more than 10 minutes to complete

Do not add trivial tasks, short-term reminders, or things you will resolve in the same session.

```
mempunk backlog add <project_id> "<descriptive title>" --priority <1|2|3>
```

---

## Priority scale

| Value | Meaning |
|-------|---------|
| `1`   | Urgent or blocking — must be resolved before continuing |
| `2`   | Normal — worked in the project's natural order |
| `3`   | When there is time — nice-to-have, tech debt, improvements |

If you are unsure which priority to assign, use `2`.

---

## When to update the status

Update **immediately**, not at the end of the session:

- When **starting** to work on a task:
```
mempunk backlog update <id> --status in_progress
```

- When **finishing** a task:
```
mempunk backlog update <id> --status done
```

- If an in-progress task stops without finishing, leave it as `in_progress`. Only move it back to `pending` if it is dropped and will be restarted from scratch.

---

## How to handle subtasks

There is no "subtask" type — create separate items whose titles reference the parent task.

Example for the task "Implement authentication":
```
mempunk backlog add <proj> "Auth: POST /login endpoint"
mempunk backlog add <proj> "Auth: token validation middleware"
mempunk backlog add <proj> "Auth: integration tests"
```

That way each item is independent, traceable, and can change state separately.

---

## Reviewing the backlog at session start

Load the pending tasks with:
```
mempunk backlog list <project_id> --status pending --json
```

Identify which ones are `in_progress` — those were left unfinished in the previous session. Resume them before starting something new, unless the user says otherwise.
