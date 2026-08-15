---
id: t294
title: Bundle 3 clean themes, clean default, column color bar
status: Done
category: THEMES
created: 2026-08-15
updated: 2026-08-15T09:15:00Z
---

# Bundle 3 clean themes, clean default, column color bar

## Context

The theme picker only ships one bundled preset (`kandown`, brand lime).
The curated themes (linear, claude, notion) live in the remote registry and
require an install step, so the gallery looks empty and the default look
stays the lime house theme. Vava wants an ultra-clean Linear/Vercel/shadcn
look as the default, three more themes available out of the box, and the
column color rendered as a thin top bar instead of a faint full-column tint.

## Decisions

- Bundle three new presets so they appear in the picker offline:
  `shadcn` (zinc neutral, ultra clean, the new default), `vercel`
  (black/white mono, high contrast), `linear` (violet dark-first, ported
  from `registry/themes/linear.json`).
- New default skin is `shadcn`: light-first zinc palette with a matching
  dark variant, radius 8px, soft shadows, Inter. `DEFAULT_CONFIG.ui.skin`,
  the demo seed and the unknown-id fallback all point at it. `kandown`
  stays available as a preset.
- Column color becomes a 3-4px top bar on the column card (board view) and
  on the section header (list view); the full-column background tint is
  removed. A `COLUMN_BAR_MAP` with solid swatch colors replaces the faint
  `COLUMN_COLOR_MAP` tints for the bar.
- Vava's local `.kandown/kandown.json` skin is set to `shadcn` so the new
  default is visible on her project (theme mode stays `dark`, the shadcn
  dark variant applies).

## Acceptance criteria

1. The theme gallery shows 4 bundled presets: shadcn, vercel, linear,
   kandown. Selecting any of them applies immediately.
2. A fresh project (and the demo) defaults to `shadcn`.
3. Column cards in the board view and section headers in the list view show
   a 3-4px colored bar at the top, no background tint. Changing a column
   color from the picker updates the bar.
4. Dark and light mode both look clean and coherent on `shadcn` (no
   white-on-white, no black-on-black).
5. `pnpm verify` green; codemap and changelog regenerated.

## Subtasks

- [x] Create `src/lib/themes/shadcn.ts`, `vercel.ts`, `linear.ts` presets
      with full light/dark token maps (code tokens included).
      report: done. shadcn = zinc neutral (default), vercel = black/white
      mono compact, linear = ported faithfully from registry/themes/linear.json.
- [x] Register the trio in `src/lib/themes/index.ts` (`THEME_PRESETS`),
      shadcn first so unknown ids fall back to the new default.
      report: done. THEME_PRESETS = [shadcn, vercel, linear, kandown].
- [x] Default skin: `src/lib/types.ts` DEFAULT_CONFIG.ui.skin, demo seed,
      `normalizeSkinId` fallback.
      report: done. All three point at 'shadcn'; 'kandown' still resolves.
- [x] `COLUMN_BAR_MAP` in `src/lib/columnUtils.ts`; use it in
      `src/components/Column.tsx` (board + compact) and
      `src/components/ListView.tsx` (section header); drop the background
      tint.
      report: done. 3px top bar; COLUMN_COLOR_MAP removed (dead code).
- [x] Set vava's local `.kandown/kandown.json` skin to `shadcn`.
      report: done (theme mode stays dark, shadcn dark variant applies).
- [x] Changelog entry (v0.53.0), JSDoc headers, `pnpm codemap`.
      report: done. codemap 206 files 100%.
- [x] Verify: `pnpm verify`, dev-server smoke test of the picker, the three
      themes and the column bars.
      report: done. verify green (327 tests). Daemon :2050 serves the new
      bundle (shadcn/vercel/linear present). TUI board loads fine.
- [x] Two reviews (standards + spec) via subagents.
      report: done. Spec: ACCEPTED 5/5 criteria, 0 blocking. Standards:
      0 blocking, 3 nits fixed (em-dash in shadcn.ts header, vercel light
      background 0 0% 100% → 0 0% 98% so cards separate from the page,
      stale theme.ts comment). pnpm verify green after fixes.

## Out of scope

- A community theme store UI redesign (the store exists; only availability
  changes here).
- Per-column colors in the TUI (terminal; unchanged).
- Removing the `kandown` house theme (still shipped, still selectable).

## Completion report

**Shipped 2026-08-15.** Three curated presets now ship in the bundle:
`shadcn` (zinc neutral, ultra clean, the new default), `vercel` (black and
white, mono display, compact) and `linear` (violet dark-first, ported
faithfully from `registry/themes/linear.json`). The theme gallery shows all
four presets offline, the default skin for new projects, the demo seed and
the unknown-id fallback all point at `shadcn`, and vava's local project
config was switched to it (dark mode kept). Column colors are now a 3px
accent bar on top of the column card (board) and the section header (list)
via a new solid `COLUMN_BAR_MAP`; the faint full-column tint and the old
`COLUMN_COLOR_MAP` were removed.

Evidence: `pnpm verify` green (327 tests, typecheck, build, codemap 206
files 100%, changelog 116 releases). Spec review ACCEPTED 5/5. Standards
review: 0 blocking, 3 nits fixed. Changelog: changelogs/v0.53.0.md.
