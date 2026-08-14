---
id: t279
title: [WEB] Sidebar All tasks: toggle group by status / [category]
status: Review
priority: P2
tags: [web, ui, sidebar, category]
ownerType: human
assignee: pi
created: 2026-08-03
updated: 2026-08-03T20:30:00Z
report: |
  ## Changes
  - `TaskWorkspace.tsx`: new `GroupMode` state (`status` | `category`)
    persisted in `localStorage` under `kandown:tasklist-group`, default
    `status`. Small segmented control in the sidebar header switches modes,
    the hint line below updates with the active mode.
  - Category mode groups every board task by its leading `[CATEGORY]` title
    tag, case insensitive (normalized to uppercase), reusing `parseTaskTitle`
    so only the first leading bracket counts. Tasks without a tag land in an
    "Uncategorized" section shown only when non-empty, sorted last.
  - Intra-category sort: board column order first (the store keeps `columns`
    in visual board order), then priority P1 first, then unset priority last.
  - Auto-reveal: when a task is opened in category mode, its own category
    (or the uncategorized group) expands, every other category collapses,
    and the section scrolls into view. The effect only re-runs on task or
    mode change, so manual collapse/expand gestures are never overridden.
  - Collapse state is tracked separately per mode: `collapsedSections` for
    status, `collapsedCategorySections` for category. Toggling modes never
    leaks one mode's fold state into the other.
  - `TaskSection` was generalized from a `column`-shaped prop to
    `title` + `count` + `tasks` so one component renders both modes.
    Category headers use the mono accent style matching the editor header
    tag; status mode keeps the original look.
  - `ListRow.tsx`: new optional `statusLabel` prop renders a small status
    chip as the first item of the inline meta sub-row. Passed only in
    category mode so the status-first sort is readable at a glance.
  - i18n: added `groupByStatus`, `groupByCategory`, `switchHintCategory`,
    `uncategorized` to `en.json` (source of truth) and translated the full
    `taskWorkspace` block in `fr.json`.

  ## Decisions
  - Toggle state lives in localStorage (same pattern as `kandown:view`),
    not in the project config file, because grouping is a per-user view
    preference, not a project setting.
  - The active task's category is derived from the drawer task id and the
    category groups are read through a ref inside the reveal effect, so
    editing a title does not re-collapse every section on each keystroke.
  - Categories are sorted alphabetically (case insensitive) with the
    uncategorized group last: predictable and stable regardless of task
    order in the store.
  - Status chip in category mode: minimal grey chip, first in the meta
    sub-row, so the status-first sort is visible without adding noise.
  - Contrast fix (vava review): category section headers and the editor
    category tag used `text-accent`, which in the kandown light theme is a
    pale lime (72 100% 90%) and unreadable on white. Switched to
    `text-accent-foreground` (dark green in light mode, light lime in dark
    mode), the shadcn pair, in `TaskWorkspace.tsx` and the mobile `Drawer.tsx`.

  ## Files
  - src/components/TaskWorkspace.tsx (toggle, grouping, sort, reveal)
  - src/components/ListRow.tsx (optional `statusLabel` chip)
  - src/lib/i18n/locales/en.json (new keys, source of truth)
  - src/lib/i18n/locales/fr.json (translated `taskWorkspace` block)
  - CODEMAP.md / CODEMAP.json (regenerated from updated JSDoc headers)
archived: false
---

# Sidebar "All tasks" : toggle group by status / [category]

## Goal

In the desktop task workspace (`TaskWorkspace.tsx`), the left "All tasks"
sidebar currently groups tasks by status column. Add a toggle so the user can
switch between:

1. **Status mode** (default, current behavior): one section per board column.
2. **Category mode**: one section per `[CATEGORY]` title tag, plus an
   "Uncategorized" section for tasks without a tag.

## Decisions (approved by vava)

- Toggle: small segmented control "Status | Category" in the sidebar header,
  persisted in `localStorage` (`kandown:tasklist-group`), default `status`.
- Category grouping: case-insensitive (`[tts-port]` == `[TTS-PORT]`), only the
  FIRST leading bracket of the title counts (reuse `parseTaskTitle`).
- Uncategorized: bottom section, shown ONLY when non-empty.
- Intra-category sort: by status (board column order), then by priority
  (P1 first) within the same status.
- On task open in category mode: auto-expand the active task's category and
  collapse the others, scroll it into view.
- Collapse state is tracked separately per mode (status mode vs category mode).
- Scope: desktop sidebar only. Board and mobile drawer untouched.

## Acceptance criteria

- [x] Toggle renders in the sidebar header, both modes switch the grouping.
- [x] Category mode groups by first `[bracket]` tag, case-insensitive.
- [x] "Uncategorized" section appears at the bottom only when it has tasks.
- [x] Tasks inside a category are sorted by status order, then priority.
- [x] Opening a task in category mode expands its category and collapses others.
- [x] Toggle choice survives a reload (`localStorage`).
- [x] Default mode is `status` (no regression for existing users).
- [x] `pnpm build` passes; JSDoc headers up to date.
- [x] All i18n locales updated from English source of truth.

## Verification (manual, dev server on localhost:5176)

- [x] Created 3 temporary tasks ([ALPHA] x2, [BETA] x1) and verified the
      grouping, then removed them (t280, t281, t282 deleted after the test).
- [x] Status mode: 5 sections (Backlog 19, Todo 5, In Progress 7, Review 0,
      Done 0), unchanged behavior, default on first load.
- [x] Category mode: sections [ALPHA] 2, [BETA] 1, UNCATEGORIZED 28, hint
      line switched, uncategorized section last.
- [x] Intra-category sort: [ALPHA] shows t281 (Backlog) before t280 (Todo),
      status first, priority only breaks ties.
- [x] Auto-reveal: opening t280 (category [ALPHA]) expanded [ALPHA] and
      collapsed [BETA] + UNCATEGORIZED, section scrolled into view.
- [x] Manual collapse/expand works and is not overridden by the reveal effect.
- [x] Persistence: reload kept the Category mode selected.
- [x] Status chip renders in category rows (Backlog / Todo / In Progress).
- [x] `pnpm typecheck`, `pnpm build`, `pnpm codemap:check`,
      `pnpm changelog:check`, `pnpm test` (213 tests) all pass.
- [x] Category headers readable on the light theme (verified computed color
      rgb(41, 69, 23) on white, ~9:1 contrast, after the accent fix).

## Out of scope

- Board view grouping by category (may reuse the same infra later).
- Mobile drawer sidebar (does not exist today).
- Grouping by tag/epic/assignee in the sidebar.
