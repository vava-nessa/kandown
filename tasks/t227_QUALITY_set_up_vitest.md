---
id: t227
title: Set up Vitest + test suite for the pure core and the CLI
status: Review
priority: P1
tags: [quality, tests, infra]
ownerType: agent
created: 2026-07-25
order: 0
updated: 2026-09-05T21:57:47Z
category: QUALITY
---

# Set up Vitest + test suite for the pure core and the CLI

## Context

The project has **zero automated tests** today — no `vitest` dependency, no `test`
script, no test file anywhere. This was flagged independently by two audits
(both flagged it under testing and tooling) and is the single largest remaining
quality gap.

It matters more than usual here because kandown writes to the user's filesystem:
a regression in the parser/serializer round-trip silently destroys task content.
That exact bug shipped once already (the old `bin/kandown.js` mini-YAML parser
dropped `report:` block scalars on every `move`/`assign`) — a round-trip test
would have caught it on the first run.

## Subtasks

- [x] Add `vitest` as a devDependency and a `"test"` / `"test:watch"` script
- [x] Unit-test the pure core (no mocks needed): `parseTaskFile` ↔ `serializeTaskFile`
- [x] Integration-test the CLI by spawning `bin/kandown.js` in a tmpdir:
- [x] Test port allocation and `daemon start` / `stop` lifecycle
- [x] Lock the dependency-gate policy in `src/lib/dependencies.ts` with a behavior matrix
- [x] Deepen `src/lib/dependencies.ts` (`resolveTransition`, `assertTransitionAllowed`, `isArchivedStatus`, `movesIntoArchived`)
- [x] Wire web store, TUI, CLI, MCP, cascade through the deep module
- [x] Update `board-reader.moveTaskToColumn` to surface the gate verdict
- [x] Write integration tests for `kandown move` with blocked + resolved deps

      round-trip incl. multi-line block scalars, `buildColumnsFromTasks`,
      the `depends_on` gate in `src/lib/dependencies.ts`, `semverGt`,
      `parseQuickAddInput`, `parseMouseInput`
      `init`, `create -p P1` (regression guard for the old `-p`/`--path` collision),
      `list --json`, `move` incl. the dependency gate, `assign`, archive,
      `$(kandown create ...)` capturing exactly one id on stdout

## Notes

Depends on nothing. Blocks [[t228]] (the CI gate needs something to run).
The core is already pure and import-friendly (`src/lib/parser.ts`,
`serializer.ts`, `dependencies.ts`) — no refactor needed to start.

## Report

### What shipped

**Test suite: 506 → 591 tests, 44 → 51 files, all green in ~5s.**

New suites, each written against the real seam with nothing mocked:

| File | Covers | Tests |
| --- | --- | --- |
| `src/lib/__tests__/build-columns.spec.ts` | `buildColumnsFromTasks`: empty columns kept, unknown status prepended as its own column, case-insensitive matching, archived hidden (bool + `"true"` string), `order:` then numeric id | 11 |
| `src/lib/__tests__/quick-add-parser.spec.ts` | `parseQuickAddInput`: priority / `#tag` / `@assignee` / `due:` / `+dep`, relative dates computed at run time, near-miss tokens (`top1`, `p1x`, `p5`) left alone | 14 |
| `src/cli/lib/__tests__/updater-semver.spec.ts` | `semverGt`: numeric (not string) ordering, `v` prefix, missing segments, release > prerelease, malformed input degrading to 0 | 9 |
| `src/cli/hooks/__tests__/use-mouse.spec.ts` | `parseMouseInput` / `isMouseInput`: press, drag, hover-move, release, wheel up/down, wide-terminal coordinates, batched input | 12 |
| `src/cli/lib/__tests__/cli-lifecycle.spec.ts` | End-to-end `bin/kandown.js` in a tmpdir: `init` (idempotent, correct layout), `create` (`-p` = priority, `--id`, `--to`, bracket category, duplicate refused), `list --json`, `show`, `assign`, `move`, archive, auto-init outside a project | 19 |
| `src/cli/lib/__tests__/move-verdict.spec.ts` | `moveTaskToColumnDetailed`: the three refusal reasons, blocked file left byte-identical, boolean wrapper parity | 9 |
| `src/cli/lib/__tests__/daemon-lifecycle.spec.ts` | Real sockets and a real detached process: `listenOnAvailablePort` (range, skip-busy, preferred port, exhaustion), `daemon start/status/stop`, stale-PID metadata cleanup | 9 |

`parseTaskFile` ↔ `serializeTaskFile` round-trip incl. block scalars and the
`depends_on` gate matrix were already covered by
`src/lib/__tests__/parser-serializer.spec.ts` and
`src/lib/__tests__/dependencies.spec.ts`; verified rather than duplicated.

`vitest.config.ts` now also collects `src/cli/hooks/__tests__/`.

### Production changes made to satisfy the task

1. **`moveTaskToColumn` surfaces the gate verdict** (`src/cli/lib/board-reader.ts`).
   Added `moveTaskToColumnDetailed` returning `{ ok, reason, blockedBy, message }`
   with `reason` one of `not-found` / `blocked` / `write-failed`. `moveTaskToColumn`
   is now a thin boolean wrapper over it, kept for the TUI and the launcher (which
   only branch on success), and still logs the refusal so nothing went silent.
   `kandown move` and the MCP `move_task` tool now print that one sentence instead
   of `Move failed: t1` plus a stray `[kandown] …` line from inside the library.

2. **Bug found by the new CLI suite and fixed** (`src/lib/task-filename.ts`).
   `kandown create "Assign me" --id assignable` wrote `assignable_assign_me.md`.
   Filenames are only split at the first underscore when the id part contains a
   digit (`ID_LIKE`, the backward-compatibility contract), so that file claimed the
   id `assignable_assign_me` and the task was unreachable by its own id: `show`,
   `move`, `assign` and any `depends_on` pointing at it all failed with "Task not
   found". `buildTaskFilename` now only appends a slug when the id is one the
   resolver can split back out; a digitless custom id is stored bare. Regression
   tests in `src/lib/__tests__/task-filename.spec.ts`.

### Verification

```
pnpm test        → 51 files, 591 tests, 0 failures (~5s)
pnpm build:cli   → bin/kandown.js rebuilt (the CLI suites assert on the bundle)
pnpm codemap     → 273 files indexed, 100% documented
```

`pnpm typecheck` reports one pre-existing error in
`src/components/agent/Blobatar.tsx:118` (a motion.dev keyframe type), unrelated to
this task and present in a concurrently modified file.

### Discoveries

- **`kandown` has no CLI `unarchive`.** `kandown move <id> archived` archives, but
  the inverse only exists over HTTP (`POST /api/tasks/:id/unarchive`, used by the
  web drawer). The archive half is tested here; the missing half is a product gap,
  not a test gap, and deserves its own task.
- **Another work stream is editing this checkout concurrently** (`.github/workflows/ci.yml`,
  `AGENTS.md`, `src/components/*`, `bin/*` changed mid-session). Nothing here was
  committed for that reason.
- Coverage is configured but not gated. Picking a floor belongs with [[t228]], which
  now has a suite to run.

### Proposed next status

**Done** — every subtask is checked, the suite is green and the two production
changes are covered by tests. Terminal move left for human confirmation.
