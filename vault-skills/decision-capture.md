# Decision capture

---

## When to save a decision

Save the decision if it affects any of these aspects of the project:

- **Architecture**: module structure, layer separation, data flow
- **Stack**: adding, removing, or changing a dependency or technology
- **Patterns**: adopting or abandoning a design pattern or code convention
- **Infrastructure**: changes to deploy, database, external services

**Do not save** if it is:
- A one-off bug fix with no design implications
- A cosmetic change (renaming a variable, reformatting code)
- A decision that is already obvious given the project's stack

When in doubt, save it. Having one extra decision is cheaper than losing context.

---

## When to run the command

**Immediately** when the decision is made, not at the end of the session.

```
mempunk decision add <project_id> "<concise title>"
mempunk decision add <project_id> "<concise title>" --tags "tag1,tag2"
```

The command creates the markdown file and registers it in the DB in a single operation. To review existing decisions, use `mempunk decision list <project_id> --json`.

---

## Markdown file format

The file is created with empty sections. Fill in all three sections before continuing:

```markdown
## Context

[Why this decision came up. What problem it solves. What constraints existed.]

## Decision

[What was decided, concisely and specifically.]

## Consequences

[What this decision implies going forward. What it enables and what it rules out.]
```

Write the minimum needed for it to make sense in a future session with no context. Do not write essays.

---

## Recommended tags

Use short tags that stay consistent across projects:

`auth`, `database`, `api`, `frontend`, `deploy`, `testing`, `patterns`, `security`, `performance`, `dependencies`
