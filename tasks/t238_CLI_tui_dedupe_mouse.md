---
id: t238
title: TUI — dedupe mouse hit-testing and fix Windows binary detection
status: Backlog
priority: P3
tags: [cli, tui, dette, windows]
ownerType: agent
created: 2026-07-25
order: 9
updated: 2026-09-04T14:49:58Z
category: CLI
---

# TUI — dedupe hit-testing, fix Windows binary detection

## Context

Two pieces of residual debt, both verified on 2026-07-25.

**Duplicated hit-testing.** The fix for the old click-selects-the-wrong-task bug
works — both paths now walk the rendered rows with a running `currentY` instead of
assuming one task per line. But that walk is written **twice**: `taskHitAt`
(`src/cli/screens/board.tsx:170-208`) and `handleMouseClick` (`:483-537`) each
recompute `maxTasksHeight`, `computeScrollIdx`, the indicator rows and the row
loop. Any future change to the rendering has to be made in both, and the second
one silently drifting is exactly how the original bug came back last time.

**Windows.** `isBinaryAvailable` shells out to `which` unconditionally
(`src/cli/lib/agents.ts:154`), which does not exist on Windows — so agent detection
reports nothing installed. The README documents Windows support.

## Subtasks

- [ ] Extract one `buildRowMap(columns, focus, mode)` helper returning the
      line → `{colIdx, taskIdx} | 'indicator' | 'menu'` mapping, derived from the
      same data the renderer uses; consume it from both call sites
- [ ] Use `where` on `win32` and `which` elsewhere in `isBinaryAvailable`
- [ ] Audit the remaining platform-specific calls (`lsof`, `ps`, `readlink /proc`,
      `tmux`) and either guard them by `process.platform` or state the supported
      platforms honestly in the README

## Notes

Source: `FABLE_CODEQUALITY` §TUI and §Cross-platform.
