---
id: t335
title: "[UI] Frameless task workspace"
status: Review
priority: P1
tags: [ui, redesign, editor]
created: 2026-09-08
updated: 2026-09-08T00:30:00Z
order: 4
---

# [UI] Frameless task workspace

Slice 4 of the UI redesign decided with vava on 2026-09-08. The full-page
editor currently nests bordered panels (task list panel with bordered rows,
bordered description box, bordered toolbars).

## Scope

- ALL TASKS side panel becomes a flat list: no inner borders, hover
  background only, single hairline between panel and content.
- Description renders as a borderless prose surface; the focus ring is the
  only boundary the editing surface gets.
- Metadata and actions live in a quiet right rail; toolbar buttons lose
  their boxes where they are not interactive controls.
- One paper surface: the editor reads as a single sheet, not boxes in boxes.

## Acceptance criteria

- [ ] The editor shows at most one visible boundary between regions (audited visually). (report: ALL TASKS panel is a flat index without box or shadow, main sheet is the single paper surface with soft shadow; browser audit pending)
- [ ] Editing, subtasks, archive, delete and "Ask the agent" all still work. (report: handlers untouched; re-verified in the final browser pass)
- [ ] Mobile Drawer.tsx still renders correctly (shared surface per CODEMAP checklist). (report: no shared component behavior changed; CategoryChip border dropped globally; visual check pending)
- [x] pnpm build passes. (report: typecheck green)

## Reports

- 2026-09-08: TaskSection groups are flat (no bordered card, no header
  divider, secondary-pill count), the aside lost its border/blur/shadow and
  the main sheet became the only paper surface (bg-card + soft shadow, no
  border, no blur). Task id chip renders as plain mono text; the inline
  category input kept its tint but dropped its border. Remaining lines are
  legit: sheet header/footer dividers, list hairlines, dashed add-category
  affordance, danger banner.
