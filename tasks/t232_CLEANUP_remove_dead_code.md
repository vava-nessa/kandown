---
id: t232
title: [CLEANUP] Remove dead code and stray files left in the repo
status: Backlog
priority: P2
tags: [cleanup, dette]
ownerType: agent
created: 2026-07-25
order: 4
updated: 2026-07-27T00:33:35Z
---

# Remove dead code and stray files

## Context

Leftovers that cost nothing to keep but confuse every agent and reader who finds
them. All verified still present on 2026-07-25.

## Subtasks

- [ ] Remove the legacy `board.md` endpoint in `src/cli/lib/server.ts:244` — the
      board-index concept was dropped; task files are the only source of truth
- [ ] Remove or wire up the unused `debouncedEmit` in `src/cli/lib/file-watcher.ts:277`
      (also covered by [[t230]] — do it in whichever lands first)
- [x] Clean up the stray files at the repo root
  report: `draft.af` turned out to be the **logo master** (an Affinity Designer
  document), not scratch — renamed to `logo.af` so its purpose is obvious next to
  `logo.svg` / `logo.png`. Its `draft.af~lock~` sibling is an Affinity lock file
  created while the document is open, so it was removed and `*~lock~` added to
  `.gitignore`. `*.af` is deliberately **not** ignored — that would exclude the logo
  source. Also removed `templates/kandown.html`, which was tracked but referenced
  nowhere: the real path is `dist/index.html` → `.kandown/kandown.html`
  (`src/cli/lib/init.ts:56`).
- [ ] Delete `.gitignore 2` — a tracked duplicate of `.gitignore` containing only
      `node_modules`, `dist`, `.DS_Store`, `*.log`, `.env*`, `.vscode`, `.idea`,
      all of which the real `.gitignore` already covers. Left in place pending a
      quick confirm that nothing references it by that name.

## Notes

Source: `FABLE_CODEQUALITY` §Code mort and §Nettoyage repo.
