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
columns: [Backlog, Todo, In Progress, Done]
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
- Backtick meta: `` `#tag` `` for tags, `` `#p1`…`#p4` `` for priority, `` `@user` `` for assignee

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

Subtask section headers that are recognized (case-insensitive):
- `## Subtasks` / `## Subtask`
- `## Sous-tâches` / `## Sous-taches`
- `## Critères d'acceptation`

## Mutation rules

| Action | Files to edit |
|---|---|
| Move task between columns | `board.md` only (move the line) |
| Change title/priority/tags/assignee | Both `board.md` (inline meta) AND `tasks/t-xxx.md` (frontmatter) |
| Edit description/notes | `tasks/t-xxx.md` only |
| Toggle subtask | `tasks/t-xxx.md` + update `(n/total)` in `board.md` |
| Create task | Append line in `board.md` + create `tasks/t-xxx.md` |
| Delete task | Remove line from `board.md` + delete `tasks/t-xxx.md` |

## ID generation

Task IDs use format `t-NNN` zero-padded (t-001, t-002, ... t-042). Always pick the next available number by scanning `board.md`.
