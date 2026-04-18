# Kandown — Agent Task System

This file contains the complete documentation for Kandown's file-based Kanban system. AI agents must read this file before interacting with task files.

## Overview

Kandown is a file-based Kanban engine backed by plain markdown. Everything lives in `.kandown/`:

- `tasks/` — per-task markdown files and the source of truth
- `kandown.json` — project configuration, board columns, appearance, and enabled fields
- `kandown.html` — the visual UI app

There is no separate board index. The board is derived by scanning `tasks/*.md`.

## File Architecture

```text
.kandown/
├── kandown.json      # Project configuration and board columns
├── kandown.html      # Single-file React app
├── tasks/            # Per-task markdown files
│   ├── t-001.md
│   ├── t-002.md
│   └── ...
├── AGENT.md          # Quick reference
└── README.md         # User-facing Kandown usage guide
```

## Configuration

```json
{
  "ui": {
    "language": "en",
    "theme": "auto",
    "skin": "kandown",
    "font": "inter"
  },
  "agent": {
    "suggestFollowUp": false,
    "maxSuggestions": 3
  },
  "board": {
    "columns": ["Backlog", "Todo", "In Progress", "Review", "Done"],
    "taskPrefix": "t",
    "defaultPriority": "P3",
    "defaultOwnerType": "human"
  },
  "fields": {
    "priority": false,
    "assignee": false,
    "tags": false,
    "dueDate": false,
    "ownerType": false,
    "tools": false
  }
}
```

### Settings Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `board.columns` | `string[]` | `["Backlog", "Todo", "In Progress", "Review", "Done"]` | Ordered board columns. |
| `board.taskPrefix` | `string` | `"t"` | ID prefix for tasks. |
| `board.defaultPriority` | `string` | `"P3"` | Default priority for new tasks when priority is enabled. |
| `board.defaultOwnerType` | `string` | `"human"` | Default owner type when owner type is enabled. |
| `fields.*` | `boolean` | `false` | Controls optional metadata shown in the UI. |

If a task has a `status` that is not listed in `board.columns`, Kandown still displays it as a temporary column at the beginning of the board. The user can add that column to settings from the UI.

If a task has no `status`, treat it as `Backlog`.

## Task Files

```markdown
---
id: t-001
title: Full task title
status: Todo
order: 0
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
- [x] Already done step
  report: What changed for this step.

## Notes

Additional information, edge cases, gotchas.
```

### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ID, e.g. `t-001`. |
| `title` | string | Task title shown on cards. |
| `status` | string | Current board column. Missing status means `Backlog`. |
| `order` | number | Optional order inside the column. |
| `priority` | string | `P1`, `P2`, `P3`, or `P4`. |
| `tags` | array | Free-form tags. |
| `assignee` | string | Username or AI agent name. |
| `created` | string | ISO date. |
| `due` | string | ISO date. |
| `ownerType` | string | `human` or `ai`. |
| `tools` | string | Tool hints for AI-agent tasks. |
| `report` | string | Completion report, often multiline with `|`. |

## Task Lifecycle

### Creating a Task

1. Scan `.kandown/tasks/` for existing IDs.
2. Create the next task file using the configured `board.taskPrefix`.
3. Set `status` to the desired column, or `Backlog` by default.

### Starting a Task

Set the task frontmatter:

```yaml
status: In Progress
```

### Completing a Task

1. Check off completed subtasks.
2. Add subtask reports where useful.
3. Add a completion `report` in frontmatter or a clear report section in the body.
4. Set:

```yaml
status: Done
```

## Mutation Rules

| Action | Files to edit |
|--------|---------------|
| Move task between columns | Task file only: update frontmatter `status`. |
| Reorder task | Task file only: update frontmatter `order`. |
| Change title/priority/tags/assignee | Task file frontmatter only. |
| Change ownerType/tools | Task file frontmatter only. |
| Edit description/notes/subtasks/report | Task file only. |
| Create task | Create one markdown file in `.kandown/tasks/`. |
| Delete task | Delete its markdown file. |
| Create/rename/delete columns | Update `board.columns` in `.kandown/kandown.json`; renaming also updates affected task statuses. |

## Follow-up Tasks

If `agent.suggestFollowUp` is enabled and you identify related work, propose up to 3 follow-up tasks to the user. Do not auto-create them without confirmation.

## This Project's Stack

Kandown is built with React, Motion, Tailwind, Vite, Zustand, TypeScript, and a plain Node.js ESM CLI.
