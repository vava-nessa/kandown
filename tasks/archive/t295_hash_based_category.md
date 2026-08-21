---
id: t295
title: Hash-based category color chips
status: Done
category: THEMES
created: 2026-08-15
updated: 2026-08-21T08:44:32Z
archived: true
---

# Hash-based category color chips

## Context

Categories (WEB, CLI, ARCHITECTURE, THEMES...) are rendered as plain text
chips today. Vava wants each category to get a deterministic accent color and
icon, derived by hashing the category name: same category always gets the
same color and icon, nothing stored, fully automatic. The category name and a
small icon sit inside a chip with a colored background. The feature is a
toggleable option.

## Decisions

- A pure `src/lib/category-color.ts` module: FNV-1a hash → index into a
  curated palette of 40 HSL colors. Foreground is chosen per color by
  relative luminance (white or near-black), so chips read on both the light
  and dark page backgrounds without duplicating the palette in two tints.
- The icon is derived from the same hash into a pool of generic tabler icons,
  so a category always shows the same icon, no mapping to maintain.
- New `ui.categoryChips` boolean (default `true`), toggleable in Settings
  (appearance section). When off, everything falls back to the current
  monochrome rendering.
- Applied to the three category surfaces: the "All tasks" category section
  headers (TaskWorkspace TaskSection), and the category chips in the
  Drawer and workspace editor headers.
- Uncategorized groups keep the neutral monochrome style (no chip).

## Acceptance criteria

1. `categoryColor("WEB") === categoryColor("WEB")` and
   `categoryColor("WEB") !== categoryColor("CLI")` (for most pairs; hash
   collisions land on different palette slots only by index).
2. Chips render a colored background with a legible foreground (luminance
   check), a small icon, and the uppercase category name at
   `text-[11px] font-semibold tracking-wide uppercase`.
3. Toggling `ui.categoryChips` off in Settings restores the previous
   monochrome rendering everywhere, without a reload.
4. New projects default to `true`.
5. `pnpm verify` green; codemap and changelog regenerated; the new i18n key
   is present in every locale.

## Subtasks

- [x] `src/lib/category-color.ts`: `hashString`, `CATEGORY_PALETTE` (40),
      `categoryColor` (bg + fg by luminance), `CATEGORY_ICONS` + `categoryIcon`.
      report: done. FNV-1a; 40 HSL slots; fg flips by WCAG luminance;
      17 tabler icons. Unit tests: determinism, contrast, icon stability.
- [x] Config: `ui.categoryChips` in types.ts (`UiConfig` + `DEFAULT_CONFIG`),
      normalization in config.ts, settings schema toggle + i18n key in every
      locale.
      report: done. Toggle in Settings → Appearance; keys added to 48 locales.
- [x] TaskWorkspace TaskSection: category headers become colored chips
      (icon + name); uncategorized stays neutral.
      report: done via shared CategoryChip (span mode).
- [x] Drawer + TaskWorkspace editor header chips use the category color and
      icon.
      report: done via shared CategoryChip (button mode).
- [x] Changelog entry, JSDoc headers, `pnpm codemap`.
      report: done. codemap 209 files 100%.
- [x] Verify: `pnpm verify`, dev-server smoke test of chips + toggle.
      report: done. verify green (333 tests). Daemon :2050 serves the new
      bundle (categoryChips present).
- [x] Two reviews (standards + spec) via subagents.
      report: done. Spec: ACCEPTED 5/5 criteria, 0 blocking. Standards:
      0 blocking, 5 nits: WCAG AA contrast fix applied (palette slots are
      darkened until the label clears 4.5:1, min measured 4.68:1), no-op
      casts dropped (Drawer + TaskWorkspace), hover affordance added to the
      button chip; unreachable fallback + i18n baseline left as-is. pnpm
      verify green after fixes (333 tests).

## Out of scope

- TUI colored chips (terminal; the TUI keeps its monochrome category rows).
- User-overridable per-category colors (hash is the point: nothing stored).
- Palette editor in the customizer.

## Completion report

**Shipped 2026-08-15.** Category names now render as colored chips with a
stable hash-derived color and icon: `hashString` (FNV-1a) indexes a curated
40-color HSL palette, the background is darkened until the label clears WCAG
AA (4.5:1, measured min 4.68:1), and the icon comes from the same hash into a
17-icon tabler pool. Nothing is stored; the same category always gets the
same chip. The feature is `ui.categoryChips`, on by default, toggleable in
Settings → Appearance (fallback to the previous monochrome chip, keys added
to all 48 locales).

Follow-up after vava's report ("je ne le vois pas du tout"): the chips were
only on the sidebar headers and the drawer, not on the board. Added the chip
to every **board card** (Card.tsx, replacing the legacy bracket tag spot),
every **list row** (ListRow.tsx), and the **collapsed and expanded stack
cards** (CardStack.tsx), so the colored category label is visible on every
surface where tasks render. The option is ON by default and her project
config already carries `categoryChips: true`.

Evidence: `pnpm verify` green (333 tests, typecheck, build, codemap 209
files 100%, changelog 116 releases). Spec review ACCEPTED 5/5. Standards
review: 0 blocking, contrast fix applied. Changelog: changelogs/v0.53.0.md.
