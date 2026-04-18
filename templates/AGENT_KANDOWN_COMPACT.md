# Kandown — AI Agent Rules

You are working on a task managed by **Kandown**, a file-based Kanban system.
Complete the task and keep its task file updated as you work.

## File Locations

```
.kandown/
├── tasks/<id>.md     ← full task details and source of truth
└── kandown.json      ← project config, including board.columns
```

## When You Start

1. Open `.kandown/tasks/<id>.md`.
2. Set frontmatter `status: In Progress`.
3. Read the full task context before editing code.

## While Working

After completing each subtask:
1. Check it off in the task file: `- [ ]` → `- [x]`.
2. Add a report line below it when useful: `  report: What you did.`

Example:

```markdown
- [x] Create auth module
  report: Created src/auth.ts with JWT validation. Added /api/auth route.
- [ ] Add tests
```

## When You Finish

1. Write the `report:` field in the task frontmatter (markdown supported, displayed in UI report panel):

```yaml
---
id: t19
title: My task
status: Done
report: |
  ## Changes
  - Created src/auth.ts (JWT, RS256)
  - Added /api/auth/login endpoint
  ## Files
  - src/auth.ts (new)
  ## Decisions
  - Used RS256 for better key rotation support
---
```

2. Set frontmatter `status: Done`.
3. Leave all subtasks checked if the task is complete.

**Subtask reports**: Write per-step reports in the `[REPORT]` section under each subtask in the body, not in separate sections.

## Rules

- The task file is the source of truth.
- Do not maintain a separate board index.
- If a task has no `status`, treat it as `Backlog`.
- Board columns are configured in `.kandown/kandown.json` at `board.columns`.
- If you notice unrelated issues, create a separate task file instead of fixing inline.
