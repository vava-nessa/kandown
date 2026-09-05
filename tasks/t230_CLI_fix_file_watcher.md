---
id: t230
title: Fix file-watcher performance and coverage (mtime gate, poll interval, ESM require, archive dir)
status: Backlog
priority: P2
tags: [cli, performance, watcher]
ownerType: agent
created: 2026-07-25
order: 3
updated: 2026-09-04T14:49:58Z
category: CLI
---

# Fix file-watcher performance and coverage

## Context

`src/cli/lib/file-watcher.ts` runs an aggressive fallback poll every **300 ms** that
SHA-256-hashes *every* task file on each tick (`file-watcher.ts:112-117`, `:96`).
On a 200-task board that is permanent, pointless CPU and IO — chokidar already
covers real-time detection; the poll is only a safety net and does not need to be
that hot or that thorough.

Two further issues in the same file:
- `hashFileSync` calls `require('node:fs')` inside an ESM module
  (`file-watcher.ts:55`). It only works thanks to the `globalThis.require` shim in
  the bundled bin — a latent trap for anyone importing this module elsewhere.
- `tasks/archive/` is not watched, so archiving or unarchiving from the web UI
  does not refresh the TUI.

## Subtasks

- [ ] Compare `mtimeMs` + `size` first; only compute the hash when they changed
- [ ] Raise the fallback poll to 1-2 s (chokidar covers the real-time path)
- [ ] Replace `require('node:fs')` with a normal `import { readFileSync }`
- [ ] Watch `tasks/archive/` so archive/unarchive propagates to the TUI
- [ ] Remove the unused `debouncedEmit` (`file-watcher.ts:277`) or wire it up

## Notes

Source: `FABLE_CODEQUALITY` §Watcher. Verified still open on 2026-07-25.
