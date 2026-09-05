---
id: t240
title: Web UI polish batch — tag chips, subtask quick-toggle, drag threshold, focus states
status: Backlog
priority: P3
tags: [web, ux, polish]
ownerType: agent
created: 2026-07-25
order: 12
updated: 2026-09-05T09:16:18Z
category: WEB
---

# Web UI polish batch

## Context

Small, independent UX improvements collected from `ameliorations_ideas_audit`
(§10-13, §33-35) and `DESIGN_IMPROVEMENTS` (§3, §5). Each is a few hours; grouped
here because they are all "the app feels finished" work rather than features.

## Subtasks

- [ ] **Tag chip input** — tags as coloured chips: Enter adds, Backspace removes the
      last, autocomplete from tags already used in the board
- [ ] **Hashed tag colours** — derive the hue from a hash of the tag name so the same
      tag is the same colour everywhere, for everyone, with no configuration
- [ ] **Subtask quick-toggle from the card** — tick a subtask without opening the
      drawer; patch just that line and update the progress bar in place
- [ ] **Drag-vs-click threshold** — record the pointer-down position, treat < 5 px of
      movement as a click and ≥ 5 px as a drag, so a slightly shaky click still
      opens the task instead of starting a failed drag
- [ ] **Unified focus-visible** — one global `focus-visible` style driven by `--ring`,
      applied to cards and every custom interactive element (keyboard a11y)
- [ ] **Standardise form controls** — replace ad-hoc `<input>` / `<select>` classes in
      `Drawer.tsx` and `SettingsPage.tsx` with one shared style

## Notes

The theme system (v0.27) and the motion pass (v0.34) already covered most of what
`DESIGN_IMPROVEMENTS` proposed — glass, elevation, radius, motion tokens and drag
feedback are all tokenised now. What is listed above is what genuinely remains.
