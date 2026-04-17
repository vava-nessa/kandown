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
├── kandown.json      # Project configuration (preferences, enabled fields)
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

## Configuration — `kandown.json`

Project-level settings that control UI behavior, agent behavior, and which fields are active.

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
| `ui.language` | `string` | `"en"` | UI language (`en`, `fr`, `es`, `de`, `pt`, `ja`, `zh`, etc.) |
| `ui.theme` | `string` | `"auto"` | Theme: `"auto"` (system), `"light"`, or `"dark"` |
| `ui.skin` | `string` | `"kandown"` | Project color skin: `"kandown"`, `"graphite"`, `"sage"`, `"cobalt"`, or `"rose"` |
| `ui.font` | `string` | `"inter"` | Project UI font: `"inter"`, `"system"`, `"serif"`, `"mono"`, or `"rounded"` |
| `agent.suggestFollowUp` | `boolean` | `false` | AI agent proposes follow-up tasks after completing a task |
| `agent.maxSuggestions` | `number` | `3` | Max follow-up suggestions (1–5) |
| `board.taskPrefix` | `string` | `"t"` | ID prefix for tasks → `t-001`, `task-001`, `feat-001`, etc. |
| `board.defaultPriority` | `string` | `"P3"` | Default priority for new tasks (P1–P4) |
| `board.defaultOwnerType` | `string` | `"human"` | Default owner type: `"human"` or `"ai"` |
| `fields.priority` | `boolean` | `false` | Enable priority field on tasks |
| `fields.assignee` | `boolean` | `false` | Enable assignee field on tasks |
| `fields.tags` | `boolean` | `false` | Enable tags field on tasks |
| `fields.dueDate` | `boolean` | `false` | Enable due date field on tasks |
| `fields.ownerType` | `boolean` | `false` | Enable human/ai owner type field on tasks |
| `fields.tools` | `boolean` | `false` | Enable tool-hint field on tasks |

### Agent Behavior

- If a field is **disabled**, AI agents should **not** add it when creating tasks (no priority tag, no assignee, no tools, etc.)
- `board.defaultPriority` only applies when `fields.priority` is enabled
- `board.defaultOwnerType` only applies when `fields.ownerType` is enabled
- If `suggestFollowUp` is **disabled** (default), skip the follow-up suggestion step after task completion
- `taskPrefix` determines the ID format: prefix + `-` + zero-padded number (e.g., `task-001`, `bug-042`)

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

When an AI agent works on a task, it must keep the kanban and task files in sync throughout the work. Do **not** wait until the end — update in real-time.

#### During Work — Real-time Updates

**1. Move task to In Progress immediately**
When you start working on a task, update `board.md`:
- Move the line from its current column to `In Progress`
- Keep the checkbox state (`- [ ]` or `- [x]`)

**2. Update subtask reports as you complete each step**
For each subtask you finish in `tasks/t-xxx.md`, update the subtask's report field:
```markdown
- [x] First step
  report: Created `src/auth.ts` with JWT validation. Added `/api/auth` route with
  middleware chain. Used bcrypt for password hashing (cost 12).
```

**3. Keep board.md progress updated**
Whenever you complete a subtask, update the progress counter in `board.md`:
```
- [ ] **[t-042]** Implement auth (1/5) → [détails](tasks/t-042.md) `#backend`
```
becomes:
```
- [ ] **[t-042]** Implement auth (2/5) → [détails](tasks/t-042.md) `#backend`
```

#### After Completion — Final Report

When the task is fully done, do both:

**1. Write the final completion report** — In `tasks/t-xxx.md` frontmatter, set the `report` field:
```yaml
---
id: t-042
title: Implement auth
report: |
  ## Changes
  - Created `src/auth.ts` with JWT validation (RS256)
  - Added `/api/auth/login` and `/api/auth/register` endpoints
  - Added `bcrypt` password hashing (cost 12)
  - Created `src/middleware/auth.ts` for protected routes
  
  ## Files
  - `src/auth.ts` (new)
  - `src/middleware/auth.ts` (new)
  - `src/routes/auth.ts` (new)
  - `src/routes/index.ts` (modified)
  
  ## Decisions
  - Used RS256 instead of HS256 for better key rotation support
  - Refresh tokens stored in httpOnly cookies, not localStorage
---
```

**2. Move the task to Done** — Update `board.md`:
- Move the line to the `Done` column
- Update checkbox: `- [x]`
- Update progress: `(n/n)` for all completed subtasks

```
## Done
- [x] **[t-042]** Implement auth (5/5) → [détails](tasks/t-042.md) `#backend` `#p1`
```

### Subtask Reports

Each subtask can have a `report` field. When working on AI tasks:
- **Fill the subtask's `report`** as you complete each step — this documents what you did
- Subtask reports appear in the UI alongside the task details
- The final `report` in frontmatter summarizes the entire task outcome

### 3. (Optional) Suggest Follow-up Tasks

> ⚙️ This behavior is controlled by `suggestFollowUp` in `.kandown/kandown.json`. Skip this step if disabled or if no config file exists.

After completing your report, if you identified improvements, related work, or logical next steps during execution, **propose up to 3 follow-up tasks** to the user.

**Format your suggestions like this:**

> **Next steps I'd suggest:**
> 1. 🟢 **[P2]** Add input validation to the parser — edge cases found during implementation
> 2. 🟡 **[P3]** Refactor store selectors — current approach won't scale past 200 tasks
> 3. 🔴 **[P4]** Add CLI `kandown status` command — nice to have for quick board overview

**Rules:**
- Maximum **3** suggestions (pick the most impactful)
- Each must include: priority, title, and a **1-line reason**
- Use 🟢 for recommended, 🟡 for moderate value, 🔴 for nice-to-have
- Suggestions must be **contextual** — based on what you actually saw in the code during this task, not generic advice
- **Wait for user confirmation** before creating any task — never auto-create
- User can reply with numbers to approve (e.g., "1 and 3"), or dismiss all
- Only applies to **AI agent tasks** (`ownerType: ai`)

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
