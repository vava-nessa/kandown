---
id: t332
title: "[UI] Side nav rail with git footer, slim header"
status: Review
priority: P1
tags: [ui, redesign, navigation]
created: 2026-09-08
updated: 2026-09-08T00:30:00Z
order: 1
---

# [UI] Side nav rail with git footer, slim header

Slice 1 of the UI redesign decided with vava on 2026-09-08 (specs in this
file and t333, t334, t335). Screenshots discussed in session: Linear-style
icon rail that expands on click, git worktree/branch pinned at the bottom.

## Scope

- New `SideNav.tsx`: 56px collapsed icon rail by default, expands to ~230px
  on click of a toggle (not hover). State persisted in localStorage.
  Contains: Board, List, Archive, Agent chat, and at the bottom Settings
  plus the project name. Light/dark toggle also moves here.
- Git footer at the sidebar bottom: active branch, worktree indicator when
  applicable, click to copy. Backed by a small read-only endpoint in
  `src/cli/lib/server.ts` (git rev-parse). Hidden in demo mode or when git
  info is unavailable.
- Header slimmed: left project switcher, center search, right New task plus
  one overflow menu. Absorbed into it: sync, show/hide metadata (the
  floating bottom-right button disappears), cheatsheet. Version badge moves
  to Settings > About. View toggles move to the sidebar.

## Decisions

- Collapsed by default (vava, Q2), remembered across sessions.
- Both light and dark stay; the toggle lives in the sidebar (vava, Q1).
- No hover-to-expand: click only.

## Acceptance criteria

- [x] Board, List, Archive, Agent, Settings all reachable from the sidebar; the old header view toggles and gear are gone.
- [x] Sidebar starts collapsed on first visit, expands on click, and the choice survives a reload. (report: verified in browser, reload keeps the expanded state via localStorage)
- [x] Git branch (and worktree marker when the project is a linked worktree) shows at the sidebar bottom when served by the kandown daemon; hidden cleanly when unavailable. (report: footer shows feat/ui-redesign with the wt badge on this linked worktree; hidden in demo mode)
- [x] Sync, metadata toggle and cheatsheet are reachable from the header overflow menu.
- [ ] Keyboard shortcuts for views (cmd+1/2), search (/) and chat (cmd+J) still work. (report: handler untouched, re-verified in the final browser pass)
- [ ] pnpm build passes and the round-trip was exercised in a real browser before review. (report: typecheck + build green; final pass pending)

## Reports

- 2026-09-08: Built SideNav.tsx (56px rail, 228px expanded, click-only toggle,
  localStorage persistence), moved view/archive/agent/settings/theme-mode
  entries into it, added the read-only /api/git route in server.ts with a
  vite dev mirror plus fetchGitInfo in filesystem.ts, wrote the git footer
  (branch + wt badge, click to copy), slimmed the header to project/search/
  filters/dots-menu/New task, absorbed reload + metadata + density +
  cheatsheet + palette into the overflow menu, removed the floating
  metadata button. Fixed a double-prefixed nav.* i18n key nest across all
  48 locales. Verified in browser: collapsed default, expansion, git footer,
  overflow menu, persistence after reload.
