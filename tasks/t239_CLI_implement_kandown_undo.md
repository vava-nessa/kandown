---
id: t239
title: Implement `kandown undo` (mutation journal)
status: Backlog
priority: P3
tags: [cli, tui, ux]
ownerType: agent
created: 2026-07-25
order: 10
updated: 2026-09-04T14:49:58Z
category: CLI
---

# Implement `kandown undo`

## Context

`FABLE_FEATURES` §2.6 records undo as shipped — `u` in the TUI, `kandown undo` in
the CLI, journal in `.kandown/.undo/log.json`. **Neither exists.** `kandown help`
lists no `undo` command and there is no reference to it in `src/cli/`.

The web UI does have `⌘Z` / `⌘Shift+Z`, so the gap is CLI/TUI-side only. Worth
having: a mis-typed `kandown move` from an agent script is currently unrecoverable
except through git.

## Subtasks

- [ ] Append every mutation (create / move / assign / set / archive / delete) to a
- [ ] `kandown undo` — revert the last entry; `kandown undo --list` to inspect
- [ ] Bind `u` in the TUI to the same code path with a status message
- [ ] Add `.kandown/.undo/` to the generated `.kandown/.gitignore` (runtime state)
- [ ] Make deletes recoverable by keeping the file content in the journal entry

      bounded journal in `.kandown/.undo/log.json`, recording enough to invert it

## Notes

Confirm the web `⌘Z` implementation before starting — if it already maintains an
inverse-operation model in the store, reuse that shape rather than inventing a
second one.
