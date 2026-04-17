# Kandown — Agent Task System

This file contains the complete documentation for Kandown's file-based Kanban system. AI agents **must** read this file before interacting with any task files.

---

## Overview

**Kandown** is a file-based Kandown engine backed by plain markdown. Everything lives in `.kandown/`:
- `board.md` — lightweight task index (always start here)
- `tasks/` — per-task detail files
- `kandown.html` — the visual UI app

---

## File Architecture

```
.kandown/
├── kandown.html       # Single-file React app (no deps, no server)
├── board.md          # Task index + state (git-diff friendly, <1k tokens)
├── tasks/            # Per-task markdown files
│   ├── t-001.md
│   ├── t-002.md
│   └── ...
├── AGENT.md          # Quick reference (this file is AGENT_KANDOWN.md, the full doc)
├── README.md         # User-facing kandown usage guide
└── AGENT_KANDOWN.md  # This file — full system documentation for AI agents
```

---

## The Golden Rule

> **Always start with `board.md`** — it's the task index. Typically under 1k tokens even with 100+ tasks.

**Never** read the entire `tasks/` directory by default — it pollutes context for no reason.

Only open `tasks/t-xxx.md` when:
- The user explicitly mentions a specific task ID
- You need to implement, modify, or discuss a specific task in depth
- You've identified candidate tasks from `board.md` and need details

---

## File Formats

### board.md (State + Index)

```markdown
---
kanban: v1
columns: [Backlog, Todo, In Progress, Review, Done]
---

# Project Kanban

## Backlog

- [ ] **[t-001]** Short title (2/4) → [détails](tasks/t-001.md) `#tag` `#p1` `@user`
- [ ] **[t-003]** Another task → [détails](tasks/t-003.md) `#backend` `ai`

## Todo

- [x] **[t-002]** Completed task (3/3) → [détails](tasks/t-002.md) `#p2` `@opencode`
```

#### Task Line Anatomy

| Element | Description |
|---------|-------------|
| `- [ ]` / `- [x]` | Checkbox (unchecked/checked) |
| `**[t-xxx]**` | Unique task ID (bold, required) |
| Title | Task title after the ID |
| `(n/total)` | Progress indicator (subtask completion), e.g. `(2/4)` |
| `→ [détails](tasks/t-xxx.md)` | Link to details file (recommended) |
| `` `#tag` `` | Tags (can be multiple) |
| `` `#p1`…`#p4` `` | Priority (P1=highest) |
| `` `@user` `` | Assignee |
| `` `human` `` / `` `ai` `` | Owner type (human task vs AI agent task) |

#### Columns

Default columns: `Backlog`, `Todo`, `In Progress`, `Review`, `Done`

The column order in `board.md` frontmatter must match the actual column sections.

---

### tasks/t-xxx.md (Full Details)

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

Background, links, decisions, and why this task exists.

## Subtasks

- [ ] First step
- [ ] Second step
- [x] Already done step

## Notes

Additional information, edge cases, gotchas.

## What was done

*Filled by AI agent after task completion — summary of changes made.*
```

#### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ID (t-001, t-002, ...) |
| `title` | string | Full task title |
| `status` | string | Current column name |
| `priority` | string | P1, P2, P3, P4 (P1=highest) |
| `tags` | array | List of tags |
| `assignee` | string | Username or AI agent name |
| `created` | string | ISO date |
| `due` | string | ISO date (optional) |
| `ownerType` | string | `human` or `ai` |
| `tools` | string | Space-separated list of tools/MCPs to use |

#### ownerType

- **`human`** — Task is meant for a human to execute
- **`ai`** — Task is meant for an AI agent to execute

#### tools

Free-form list of tools/MCP servers/CLI commands the AI agent should use:

```
tools: filesystem, cli, websearch, browser, mcp__github, mcp__filesystem
```

---

## Task Lifecycle

### Creating a Task

1. Add a line to `board.md` under the appropriate column
2. Create `tasks/t-xxx.md` with frontmatter + structure
3. Use next available ID (scan `board.md` for highest number)

### Completing a Task (AI Agent)

After finishing a task, you **must** do both:

1. **Write a completion report** — Open `tasks/t-xxx.md` and add a `## What was done` section summarizing:
   - What was implemented/changed/fixed
   - Files created or modified (list them)
   - Decisions or trade-offs made

2. **Move the task in kanban** — Update `board.md`:
   - Move the line to the `Done` column
   - Update checkbox: `- [x]`
   - Update progress: `(n/n)` to reflect completed subtasks

```
## Done
- [x] **[t-042]** Implement auth (5/5) → [détails](tasks/t-042.md) `#backend` `#p1`
```

### Creating Follow-up Tasks

If while working on a task you notice something unrelated needs fixing:

1. Create a new task (add line to `board.md` + create `tasks/t-xxx.md`)
2. Note it in the current task's `## What was done`: `→ Created t-043 for the cleanup noticed`

**Do not fix unrelated issues inline** — this keeps the kanban as single source of truth.

---

## Mutation Rules

| Action | Files to Edit |
|--------|---------------|
| Move task between columns | `board.md` only (move line + update checkbox) |
| Change title/priority/tags/assignee | Both `board.md` (inline) AND `tasks/t-xxx.md` (frontmatter) |
| Change ownerType/tools | Both `board.md` (inline) AND `tasks/t-xxx.md` (frontmatter) |
| Edit description/notes | `tasks/t-xxx.md` only |
| Toggle subtask | `tasks/t-xxx.md` + update `(n/total)` in `board.md` |
| Create task | Append line in `board.md` + create `tasks/t-xxx.md` |
| Delete task | Remove line from `board.md` + delete `tasks/t-xxx.md` |

---

## ID Generation

Task IDs use format `t-NNN` (zero-padded, e.g., t-001, t-042).

**To find the next available ID:**
1. Scan `board.md` for all `**[t-xxx]**` occurrences
2. Find the highest number
3. Use `t-{highest + 1}` with zero-padding to 3 digits

---

## Priority System

| Priority | Description |
|----------|-------------|
| `#p1` / `P1` | Critical — do first |
| `#p2` / `P2` | High |
| `#p3` / `P3` | Medium |
| `#p4` / `P4` | Low / nice to have |

---

## Filtering (for Human Users)

The UI supports filtering by:
- **Owner type**: Human tasks vs AI tasks
- **Priority**: P1–P4
- **Tags**: Free-form tag filtering
- **Assignee**: By username
- **Search**: Fuzzy search on task titles

This is for the UI only — the markdown format remains the source of truth.

---

## Key Files Reference

| File | Purpose | When to Read |
|------|---------|--------------|
| `board.md` | Task index + state | **Always first** |
| `tasks/t-xxx.md` | Full task details | Only when needed |
| `.kandown/AGENT.md` | Quick reference | When you need a reminder |

---

## This Project's Stack

Kandown is built with:
- **React 19** — UI components
- **Motion 12** — Animations
- **Tailwind 3** — Styling
- **Vite 6** — Build tool
- **Zustand 5** — State management
- **TypeScript** — Type safety

CLI is plain Node.js ESM in `bin/kandown.js`.

The `dist/index.html` is a pre-built single-file artifact containing the entire app (no external dependencies).
