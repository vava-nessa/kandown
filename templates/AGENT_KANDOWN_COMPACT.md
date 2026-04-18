# Kandown — AI Agent Rules

You are working on a task managed by **Kandown**, a file-based Kanban system.
Your job is to complete the task below **and keep the kandown files updated in real-time** as you work.

---

## File Locations

```
.kandown/
├── board.md          ← task index (source of truth for status)
├── tasks/<id>.md     ← full task details (this is your task file)
└── kandown.json      ← project config
```

---

## When You Start

1. Open `.kandown/board.md`
2. Find the line with your task ID (e.g. `**[t-019]**`)
3. Move it to the `## In Progress` section (cut the line, paste under that header)
4. Read your full task file at `.kandown/tasks/<id>.md`

---

## While Working

After completing each subtask:
1. Check it off in the task file: `- [ ]` → `- [x]`
2. Add a report line below it: `  report: What you did.`
3. Update the progress counter in `board.md`: `(1/4)` → `(2/4)`

Example:
```markdown
- [x] Create auth module
  report: Created src/auth.ts with JWT validation. Added /api/auth route.
- [ ] Add tests
```

---

## When You Finish

1. Write the `report:` field in the task frontmatter (summary of all changes):
```yaml
---
id: t-019
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
2. Move the task line to `## Done` in `board.md`
3. Set the checkbox to `- [x]`
4. Set progress to `(n/n)`

---

## board.md Line Format

```
- [ ] **[t-019]** Task title (1/3) → [détails](tasks/t-019.md)
```

Fields: `- [x/space]` checkbox · `**[id]**` · title · `(done/total)` · `→ [détails](path)`

---

## Rules

- **NEVER** read all files in `tasks/` — only open specific task files you need
- **ALWAYS** keep `board.md` and your task file in sync
- Update the progress counter after **every** completed subtask — don't batch
- If you notice unrelated issues, create a new task in `board.md` instead of fixing inline
- The task file is your source of truth — read it carefully before starting
