# Skill management

Skills are markdown files that store a project's recurring context. They are loaded at the start of each session and replace the need to re-explain the stack and conventions. Their metadata lives in SQLite — always manage them through the `mempunk` CLI.

---

## What goes in each standard skill

### `stack.md`
- Main technologies with their versions
- Non-obvious configurations that affect development
- Key dependencies and why they were chosen
- Environment URLs (staging, production, database) if relevant

### `patterns.md`
- Architectural patterns adopted in the project
- Folder structure and what goes where
- How the code is organized (modules, layers, features)
- Design decisions repeated across the project

### `conventions.md`
- Naming for variables, functions, files, and folders
- Commit format (prefixes, message structure)
- Code rules that are not in the linter
- Code style the team agreed on explicitly

---

## When to create a new skill

Create a skill when you have recurring context that does not fit the three above. Valid examples:

- `testing.md` → if the project has a non-obvious testing strategy
- `api-contracts.md` → if there are contracts with external systems consulted frequently
- `deployment.md` → if the deploy process has non-standard steps

Do not create a skill for single-session context. If the context will not be useful in the next session, it does not deserve a skill.

---

## When to update vs create

- **If the skill already exists**: always update with `mempunk skill update`. Never create a second skill with the same purpose.
- **If the skill does not exist**: create one with `mempunk skill add <project_id> <name>`.

To find a skill's `id` and `file_path`, run:
```
mempunk skill list <project_id> --json
```

### Update flow

1. Edit the file at `file_path` with the new content
2. Run:
```
mempunk skill update <id> --file <file_path>
```

Update immediately when the context changes, not at the end of the session.

---

## Golden rule

A skill should be readable in under 30 seconds and give enough context to work. If it grows too long, split it into two skills with specific names.
