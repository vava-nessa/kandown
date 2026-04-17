# Kanban conventions for AI agents

This project uses a file-based kanban located in `.kanban/`. Read this file before touching any task files.

## The golden rule

**Always start with `board.md`** — it's the task index. Typically under 1k tokens even with 100+ tasks.
**Never read the entire `tasks/` directory by default** — it pollutes context for no reason.

Only read `tasks/t-xxx.md` when:
- The user explicitly mentions a specific task ID
- You need to implement, modify, or discuss a specific task in depth
- The user asks to find tasks about a topic and you've identified candidates from `board.md`

## File format

### board.md (state + index)

```markdown
---
kanban: v1
columns: [Backlog, Todo, In Progress, Review, Done]
---

# Project Kanban

## Todo

- [ ] **[t-001]** Short title → [détails](tasks/t-001.md) `#tag` `#p1` `@user`
```

Anatomy of a task line:
- `- [ ]` unchecked / `- [x]` checked (auto-set when moving to/from Done column)
- `**[t-xxx]**` unique task ID (bold, required)
- Title after the ID
- ` (3/5)` optional progress indicator (subtask completion)
- ` → [détails](tasks/t-xxx.md)` link to details file (recommended)
- Backtick meta: `` `#tag` `` for tags, `` `#p1`…`#p4` `` for priority, `` `@user` `` for assignee, `` `human` `` or `` `ai` `` for owner type

### tasks/t-xxx.md (full details)

```markdown
---
id: t-001
title: Full task title
status: Todo
priority: P1
tags: [backend, security]
assignee: username
created: 2026-04-10
due: 2026-04-25
ownerType: human
tools: filesystem, cli, websearch
---

# Task title

## Context

Background, links, decisions.

## Subtasks

- [ ] First step
- [ ] Second step

## Notes

Additional information.
```

Frontmatter fields:
- `ownerType: human` — task is meant for a human to do
- `ownerType: ai` — task is meant for an AI agent to execute
- `tools: ...` — free-form list of tools/MCP servers/CLI commands the AI agent should use (e.g. `filesystem, cli, websearch, browser, mcp__github`)

## When you complete a task

After finishing a task, you **must** do both of these things:

### 1. Write a completion report

Open `tasks/t-xxx.md` and add a `## What was done` section (or append to it if it already exists). Write a brief summary of:
- What you implemented, changed, or fixed
- Any files you created or modified (list them, keep it short)
- Decisions or trade-offs made

### 2. Move the task in kanban

Update `board.md` to reflect the new state:
- Move the task line to the appropriate column
- Update the checkbox: `- [x]` when Done, `- [ ]` otherwise
- Update `(n/n)` progress if subtasks exist

```
# Instead of staying in "In Progress" or "Todo":
## Done
- [x] **[t-042]** Implement auth (5/5) → [détails](tasks/t-042.md) `#backend` `#p1`
```

If the task needs review before being marked done, move it to `Review` (or your project's equivalent column).

## If you notice something to refactor or improve

While working on any task, if you notice something unrelated that should be fixed, improved, or refactored later:

**Do not fix it inline.** Instead, create a new task:

1. Add a new line in `board.md` under the appropriate column
2. Create `tasks/t-xxx.md` with a brief description
3. Note it in the current task's `## What was done` section: `→ Created t-043 for the cleanup noticed`

This keeps the kanban as the single source of truth and avoids scope creep.

## Mutation rules

| Action | Files to edit |
|---|---|
| Move task between columns | `board.md` only (move the line + update checkbox) |
| Change title/priority/tags/assignee | Both `board.md` (inline meta) AND `tasks/t-xxx.md` (frontmatter) |
| Change ownerType/tools | Both `board.md` (inline `human`/`ai` token) AND `tasks/t-xxx.md` (frontmatter) |
| Edit description/notes | `tasks/t-xxx.md` only |
| Toggle subtask | `tasks/t-xxx.md` + update `(n/total)` in `board.md` |
| Create task | Append line in `board.md` + create `tasks/t-xxx.md` |
| Delete task | Remove line from `board.md` + delete `tasks/t-xxx.md` |

## ID generation

Task IDs use format `t-NNN` zero-padded (t-001, t-002, ... t-042). Always pick the next available number by scanning `board.md`.

## Owner type quick reference

- `` `human` `` in board.md line = human task
- `` `ai` `` in board.md line = AI agent task

Example with owner type:
```
- [ ] **[t-042]** Implement auth → [détails](tasks/t-042.md) `#backend` `#p1` `ai`
```
