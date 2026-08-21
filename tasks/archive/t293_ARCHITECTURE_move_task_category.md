---
id: t293
title: Move task category to frontmatter with filename mirror
status: Done
category: ARCHITECTURE
created: 2026-08-14
updated: 2026-08-21T08:44:31Z
archived: true
---

# Move task category to frontmatter with filename mirror

## Context

Today the task category lives only as a leading `[CATEGORY]` bracket inside the
`title:` frontmatter field. Four ad hoc helpers parse it (`parseTaskTitle` in the
web app, `getTitleCategory` in the TUI, `categorySegmentFromTitle` for filenames,
plus inline regexes in components), and the filename mirrors it as a segment
(`tasks/t293_ARCHITECTURE_move_task_category.md`).

The bracket-in-title approach was a deliberate design (see commit `2e11790` and
ARCHITECTURE invariant #9: the category segment is taxonomy, not description),
but it is a regex convention, not structured data. Vava decided (2026-08-14) to
move the source of truth to a first-class `category:` frontmatter field while
keeping two properties:

1. The filename keeps its category segment (the at-a-glance taxonomy in
   `ls`, `git diff --stat` and PR file lists is the file-based differentiator).
2. The UI and TUI keep rendering the category chip exactly as they do today.

Since every surface already treats the category the same way, the data might as
well be structured.

## Decisions

- `category:` in frontmatter is the single source of truth. The title becomes
  clean prose.
- The filename keeps the category segment, derived from `category:` with a
  fallback to the title bracket for legacy files not yet migrated.
- Creating a task still accepts a bracket title (`kandown create "[UI] Fix
  button"`): the bracket is normalized into `category:` and stripped from the
  title at write time. Same for the web quick-add.
- Bulk migration now: every existing task with a bracket gets `category:`
  written and the bracket stripped from its title. Filenames are untouched
  because the normalized segment is identical.
- Backward compat: all readers prefer `category:`, fall back to the title
  bracket when the field is absent, so a forgotten file never breaks.
- The TUI `#tag` fallback (row rendering for titles opening with a hashtag)
  stays as-is: it is a display convenience, and hashtags already have a
  first-class `tags:` field. Category rows are driven by the category field.

## Acceptance criteria

1. `TaskFrontmatter` gains `category?: string`; parser and serializer
   round-trip it (invariant #1 stays intact).
2. Filenames still carry the category segment, now derived from `category:`
   (legacy fallback: bracket in title). `writeTaskContent` still auto-renames
   with `git mv` when the category changes.
3. Editing the category in the web drawer writes `category:` and leaves the
   title untouched; the file auto-renames on save.
4. "All tasks" grouping by category (web) and the TUI category rows read
   `category:` first, title bracket as fallback.
5. `kandown create "[UI] Fix button"` stores title `Fix button`, category
   `UI`, filename `tasks/tXXX_UI_fix_button.md`. Web quick-add does the same.
6. Migration applied: no task file in `tasks/` or `tasks/archive/` has a
   leading bracket in its title; the category field matches the old bracket.
   Verified by diffing `git show HEAD:tasks/...` against the new content.
7. `pnpm build` and `pnpm verify` are green; codemap and changelog are
   regenerated; unit tests updated and passing.

## Subtasks

- [x] Types: add `category?: string` to `TaskFrontmatter`; confirm parser and
      serializer round-trip it (frontmatter is generic, so this is a type +
      test question, not a parser change).
      report: done. `BoardTask.category` added too; `taskToBoardTask` filters
      `category` out of the metadata block and surfaces it as a dedicated field.
- [x] Canonical read helper: in `task-title-category.ts`, add a helper that
      returns the category from frontmatter first, title bracket as fallback.
      Keep `parseTaskTitle` for legacy and migration.
      report: done. `taskCategory()` added; used by parser, filename, drawer.
- [x] Filename: `buildTaskFilename` accepts an explicit category segment
      (default: derive from title bracket, so existing callers stay valid);
      add `categorySegmentFromFrontmatter`.
      report: done. Signature now (id, title, category?, takenFilenames?).
      All callers updated (board-reader, reslug, filesystem, cli-shared).
- [x] `board-reader.ts`: `newTaskFilePath` and `writeTaskContent` derive the
      category from the parsed frontmatter, not from the raw title string.
      report: done. Auto-rename now triggers on `category:` change.
- [x] CLI create: normalize a leading `[CAT]` bracket into `category:` and a
      clean title before writing; filename built with the category.
      report: done (cmdCreate, cmdImport, createTaskInBoard).
- [x] Web create + quick-add: same normalization; `filesystem.ts` filename
      builder passes the frontmatter category.
      report: done (store.ts, boardSlice.ts, filesystem.ts writeTaskFile).
- [x] `Drawer.tsx`: category editing writes the `category:` field; the title
      field stays clean; the header chip reads `category:` (fallback legacy).
      report: done. Category upper-cased on submit.
- [x] `TaskWorkspace.tsx`: category grouping and auto-reveal read `category:`
      (fallback legacy).
      report: done. Also `grouping.ts` extractGroupKey (card stacks in
      Column/ListView) reads category first.
- [x] TUI: `getTitleCategory` reads the task's frontmatter category first
      (fallback legacy bracket/hashtag).
      report: done (helpers.ts + 6 call sites in board.tsx/components.tsx).
- [x] Migration: one-shot script over `tasks/*.md` and `tasks/archive/*.md`
      using the real parser/serializer; run it; verify with a git diff.
      report: done. scripts/migrate-task-categories.ts (tsx). 37 repo files
      migrated + demoSeed 8 titles, zero filename changes (segment identical).
      Also fixed two pre-existing broken task files found by the TUI crash:
      t279 (title was parsed as a YAML array, now category WEB + quoted clean
      title) and t271 (missing title → "Untitled task").
- [x] Tests: update `task-filename.spec.ts` and `task-filename-cli.spec.ts`;
      add a parser round-trip test for `category`.
      report: done. +1 rename-through-write-path test in the CLI spec,
      +2 filename category tests, +1 parser round-trip. 327 tests pass.
      Defensive guards added so a non-string title can never crash the board
      (parseTaskTitle, getTitleCategory, extractGroupKey, SingleTaskRow).
- [x] Docs: update ARCHITECTURE invariant #9 prose, JSDoc headers,
      `pnpm codemap`, changelog entry for the next release.
      report: done. ARCHITECTURE.md rewritten for the field source of truth;
      changelogs/v0.53.0.md "Structured Categories"; codemap 203 files 100%.
- [x] Verify: `pnpm build`, `pnpm verify`, dev-server smoke test of the
      category chip, grouping and drawer edit.
      report: done. Full verify green. TUI board + kanban category rows load
      from the field (t293 ARCHITECTURE chip). Web daemon :2050 serves the
      app. Rename-on-category-change proven through writeTaskContent.
- [x] Reviews: two independent reviews (standards + spec) via subagents.
      report: done. Standards: 1 blocker fixed (TaskWorkspace desktop chip
      still read the title bracket; now reads displayCategory, same as the
      mobile Drawer), TUI legacy double-render fixed, doc drift fixed,
      legacy-file migration-on-edit guards added (title edit and category
      edit both migrate the bracket). Spec: ACCEPTED, 7/7 criteria, 0
      blocking. pnpm verify green after fixes (327 tests).

## Out of scope

- Multiple categories per task (keep single `category:`, multi-tag remains
  the `tags:` field's job).
- Category validation / autocomplete dropdowns (nice follow-up, not now).
- Dropping the legacy title-bracket fallback entirely (keep it until the
  ecosystem stops producing bracket titles).
- `reslug` semantics for the prose slug (unchanged: frozen at creation).

## Completion report

**Shipped 2026-08-14.** The category moved from a leading `[BRACKET]` inside
`title:` to a first-class `category:` frontmatter field. The filename keeps
its category segment (derived from the field, legacy bracket as fallback),
so `ls` / `git diff --stat` / PR file lists still read id/taxonomy/prose at a
glance. All surfaces read the field first: web grouping, drawer chip, TUI
category rows, card stacks, reslug, the server write path (auto-rename via
git mv on category change). Creating a task still accepts a bracket title
and normalizes it. 37 repo task files + 8 demo seed titles migrated with
`scripts/migrate-task-categories.ts` (real parser, byte-safe, idempotent);
zero filename changes. Two pre-existing broken task files surfaced by the
TUI crash were fixed (t279 title parsed as a YAML array, t271 missing
title) and defensive guards added so a malformed title can never crash the
board again.

Evidence: `pnpm verify` green (327 tests, typecheck, build, codemap 203
files 100%, changelog 116 releases, diff check). Spec review ACCEPTED 7/7.
Standards review: 1 blocker (desktop workspace chip, fixed), 3 non-blocking
hygiene items fixed. Changelog: changelogs/v0.53.0.md "Structured
Categories".
