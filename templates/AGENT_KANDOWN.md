# Kandown — AI Agent Rules

## The System

Kandown is a file-based Kanban backed by plain markdown. All task state lives in `.kandown/tasks/*.md` — no separate board index, no database.

```
.kandown/
├── tasks/           # Task files (source of truth)
├── kandown.json     # Board columns + project settings
└── kandown.html     # Web UI
```

**Board columns** are configured in `kandown.json` at `board.columns`. Tasks without a `status` go to **Backlog**.

---

## Critical: Real-Time Task Updates

⚠️ **ALWAYS keep task files up to date as you work.** This is not optional — it lets the user see exactly what you're doing, what was decided, and what's left.

When you make progress:
1. Check off completed subtasks: `- [ ]` → `- [x]`
2. Add a `report:` under each done subtask with what changed
3. Move the task to the appropriate column by updating `status:` in frontmatter
4. Write a completion `report:` in frontmatter when the task is done

---

## Task Lifecycle

### Start working on a task
Update the task frontmatter: `status: In Progress`

### While working
- Check off each subtask as you finish it
- Add inline reports: `report: Created X, fixed Y`
- If you notice something unrelated — create a new task, don't fix inline

### Complete a task
```yaml
---
status: Done
report: |
  ## Changes
  - Created src/auth.ts
  - Added /api/auth/login
  ## Decisions
  - Used RS256 for key rotation
---
```
The `report:` field supports markdown and is displayed in the UI. Write it as a real summary.

---

## Mutation Rules

| Action | File to edit |
|--------|-------------|
| Move task between columns | Task file: update `status:` in frontmatter |
| Reorder task | Task file: update `order:` in frontmatter |
| Change title/priority/tags/assignee | Task file frontmatter |
| Edit description/notes/subtasks | Task file body only |
| Create task | Create one new `.kandown/tasks/t-NNN.md` |
| Delete task | Delete the task file |
| Create/rename/delete columns | `kandown.json` at `board.columns` |

**One task file = one source of truth.** Never maintain a separate board index.

---

## Task File Format

```markdown
---
id: t-001
title: Task title
status: Backlog
order: 0
priority: P1
tags: [backend]
assignee: username
created: 2026-04-10
ownerType: human
---

# Task title

## Context

Why this exists, background, links.

## Subtasks

- [ ] First step
- [x] Second step
  report: What changed.

## Notes

Edge cases, gotchas.
```

### Frontmatter fields

| Field | Description |
|-------|-------------|
| `status` | Board column (Backlog, Todo, In Progress, Review, Done) |
| `order` | Sort order within the column |
| `priority` | P1–P4 |
| `tags` | Free-form labels |
| `assignee` | Username or AI agent name |
| `ownerType` | `human` or `ai` |
| `report` | Completion summary (markdown, shown in UI) |

---

## Stack

React, Motion, Tailwind, Vite, Zustand, TypeScript, Node.js ESM CLI.