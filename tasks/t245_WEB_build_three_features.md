---
id: t245
title: Build the three features previously documented as shipped but never implemented
status: Backlog
priority: P2
tags: [web, cli, docs-drift]
ownerType: agent
created: 2026-07-25
order: 13
updated: 2026-09-04T14:49:58Z
category: WEB
---

# Features documented as shipped but never implemented

## Context

While auditing the plan documents before deleting them, three items marked
**✅ DONE** in `FABLE_FEATURES.md` turned out not to exist in the codebase at all.
The README had inherited the same claims. Verified against `main` @ v0.34.3 on
2026-07-25:

| Claimed | Reality |
|---|---|
| Web undo/redo — `⌘Z` / `⌘⇧Z` (§3.8) | No undo anywhere in `src/lib/store/` or `src/App.tsx` |
| WIP limits per column (§3.4) | `wipLimits?: Record<string, number>` exists in `src/lib/types.ts:254` and is read by nothing |
| Git timeline per task (§4.1) | No `/api/git/*` route in `src/cli/lib/server.ts`, no `git log` call in `src/` |

The false README claims are already removed. This task is for actually building
them — each is worth having, and the WIP limit is half-done already since the
config field is defined.

## Subtasks

- [ ] **WIP limits** — read `board.wipLimits` and show the column counter in
      amber/red past the limit, with a visual warning on the column. Smallest of the
      three; the type already exists.
- [ ] **Web undo/redo** — `⌘Z` / `⌘⇧Z` over drag, edit and delete. Design the
      inverse-operation model once and share it with the CLI journal in [[t239]]
      rather than building two unrelated undo systems.
- [ ] **Git timeline** — `GET /api/git/history?id=t42` serving
      `git log --follow tasks/t42.md`, surfaced as a history section in the drawer.
      Degrade gracefully when the project is not a git repo.

## Notes

Worth taking as a lesson: a status marker in a hand-maintained document is not
evidence. This is exactly why the codemap is generated and `--check`-enforced rather
than written by hand — see [[t244]].

Also spotted while verifying: `kandown board`, `kandown settings` and
`kandown tasks` are real commands (`src/cli/cli.ts:69,73,103`) but are **missing
from the `kandown help` screen**. Three lines to fix; do it here.
