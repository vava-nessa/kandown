---
id: t334
title: "[UI] Calm board: no nested borders, optional column accents"
status: Review
priority: P1
tags: [ui, redesign, board]
created: 2026-09-08
updated: 2026-09-08T00:30:00Z
order: 3
---

# [UI] Calm board: no nested borders, optional column accents

Slice 3 of the UI redesign decided with vava on 2026-09-08. Core rule from
vava: no double borders. A container next to another container with margin,
padding and borders on both creates dead space.

## Scope

- Elevation contract: columns never carry a border; a card carries at most
  one boundary (border OR shadow, never both); nested groups (category chip
  stacks) never get their own bordered box.
- Column backgrounds become neutral; the configured column color becomes an
  optional accent (a small dot next to the title), OFF by default and
  exposed as a toggle in Settings (vava, point 5).
- Cards: title 13px medium, single meta line (desaturated category chip, id
  in tabular numbers, agent avatars), priority as a colored dot, progress
  bar only when > 0.
- Category chips: tinted background at ~10% of the color with dark text of
  the same hue, replacing the saturated pastels.

## Decisions

- Column color config stays in kandown.json; its meaning changes from
  background fill to optional accent dot.

## Acceptance criteria

- [ ] No surface on the board nests two visible borders (audited visually on light and dark). (report: columns and stack envelopes stripped of borders/cards carry one hairline; browser audit pending)
- [x] Column accent colors are off by default and can be turned on in Settings. (report: ui.columnAccents config + Settings toggle + 2px dot next to column titles)
- [x] Cards read calm: one meta line, tabular ids, no saturated pastels. (report: alpha-tint chips via chipHueSat + CSS vars, mode-aware label, no chip border; card id badge is plain muted mono)
- [ ] Drag and drop, stack/grouped cards and archive flows still work. (report: handlers untouched; re-verified in the final browser pass)
- [x] pnpm build passes. (report: typecheck + build + category-color spec green)

## Reports

- 2026-09-08 (vava review round 2): Four review adjustments applied.
  1. Group identity kept: expanded stacks carry one 3px category-colored
     line that starts at the title chip and runs along the children
     (categoryBarColor, half-alpha hue), replacing the old full envelope
     without nesting any border with the cards' hairlines.
  2. Assignee label renders only when someone is assigned (already true)
     and now reads smaller and bold (10.5px semibold).
  3. Subtask progress bar thickened from 3px to 6px.
  4. Task id moved from the card's bottom edge to a small dedicated box in
     the top-right corner; hover actions (ask agent, stop) shifted left so
     nothing overlaps.
- 2026-09-08: Elevation contract applied. Columns are transparent containers
  (colored fill/border removed from Column.tsx incl. the compact ghost);
  CardStack lost its border-2 tinted envelope and the collapsed stack wears
  one hairline with a neutral ghost sheet; cards carry a single
  border-border hairline, hover-only shadow, no category-colored outlines.
  categoryColor now returns a 13%-alpha hue tint with a hue-matched label;
  CategoryChip sets --chip-hue/--chip-sat CSS vars resolved in globals.css
  (.category-chip, dark-mode aware). New ui.columnAccents option (off by
  default) renders COLUMN_BAR_MAP dots in column headers; added to schema,
  types, config normalizer and all 48 locales.
