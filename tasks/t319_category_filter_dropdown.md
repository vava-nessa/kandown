---
id: t319
title: Category filter dropdown in header
status: Review
created: 2026-09-05
updated: 2026-09-05T15:39:10Z
---

## Goal

A multi-select category filter dropdown in the header, next to the task count.
It lists every category present in the project; picking entries toggles them in
an array without closing the menu. Only the matching tasks are shown, with card
stacks rendered already expanded and non-collapsible. Each selection shows as a
chip with a small X so one or two can be removed in a click; removing all (or
"All categories", or Clear all) brings the normal board back.

## Acceptance criteria

- [x] Dropdown next to the task count lists all project categories (with counts) (report: verified in browser, options AGENTIC/AGENTS/ARCHITECTURE/... each with live count)
- [x] Selecting categories filters board AND list view to ANY of them (report: multi-select WEB + CLI shows 3 blocks, only CLI/WEB tasks; ListView shares the same filter line)
- [x] In filtered view stacks render expanded and cannot be collapsed (report: 0 collapsed stacks, expanded locked blocks with plain non-clickable headers)
- [x] Selections show as chips with a small X that removes just that category (report: chip X on WEB leaves CLI only, chip count drops to 1)
- [x] Removing the filter (dropdown "All" or Clear all) restores the normal view (report: All categories option: back to 12 collapsed stacks, 0 expanded blocks)
- [x] i18n key added to en + all locales (report: `header.allCategories` in 47 locales; chip X reuses existing `common.remove`)

## Subtasks

- [x] Filters type + store resets carry `category` (report: done, types.ts + store.ts x2 + uiSlice.ts)
- [x] Board + ListView filter tasks by category (report: done, case-folded Set, multi-select ANY-match)
- [x] Header dropdown + active filter chip (report: done, removable chip cluster beside the toggle, count badge, chips visible in server/demo mode too)
- [x] CardStack lockedExpanded prop wired from Column + ListView (report: done, header renders as non-clickable div without chevron)
- [x] Locales updated, build green (report: pnpm build + typecheck + 658 tests pass, codemap:check 100%)

## Verification

Browser cycle against `http://localhost:5176/?p=kandown`: 12 collapsed stacks at
rest; multi-select WEB then CLI keeps the menu open, shows 2 chips + count badge
"2", 0 collapsed stacks and 3 expanded locked blocks holding exactly the CLI and
WEB tasks; clicking the X on the WEB chip leaves 1 chip and only the CLI block;
"All categories" restores the 12 collapsed stacks. The `/api/*` 404s in console
are the bare `pnpm dev` server without the CLI backend, unrelated to this change.

## Decisions

- `filters.category` is a `string[]` (empty = no filter), not a second field:
  one source of truth for both the menu and the chips.
- Match is ANY selected category, case-folded, on the task's canonical category
  (frontmatter first, legacy title bracket fallback).
- Removable chips live next to the toggle in the header-right cluster, not in
  the left filter-chip row, so they exist in server and demo mode too (that row
  requires a dirHandle).
- Stacks stay expanded while the selection is non-empty; the search
  auto-expand behavior is unchanged.

## Completion report

Round 2 (multi-select, requested by vava while reviewing): `filters.category`
became `string[]`; Board/ListView fold the selection into a Set and keep tasks
matching ANY selected category; the header renders each selection as a chip
with an X (title/aria from existing `common.remove`) beside the toggle, which
collapses to a count badge while a selection exists. Toggling in the menu no
longer closes it. README updated to "multi-category filter". Round 1 shipped
the dropdown itself, the locked expanded stacks, and the 47-locale key.
