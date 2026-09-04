---
id: t306
title: Color category group block on expanded stacks
status: Done
created: 2026-09-04
updated: 2026-09-04T10:36:59Z
---

# Color category group block on expanded stacks

When a category stack is expanded, wrap the whole group (header + child cards)
in a rounded block tinted with the category color so it reads as one unit
instead of a loose run of cards.

## Decisions

- Block width equals the column width; child cards are inset (internal
  padding), the block never overflows the column grid.
- Applies to both views: board (inset cards) and list (tinted bordered block
  around the group, rows keep full width inside).
- Reuse `category-color.ts` `bg` and `border` exactly, same as the chip.
- Collapsed state: restyle to a crisp stacked-paper look (visible offset
  edges, soft shadows), neutral (no category color). Color appears only on
  expand.

## Out of scope

- Changing grouping logic, `grouping.ts` or the collapsed-vs-expanded toggle.

## Acceptance criteria

- [x] Expanded board stack shows a rounded tinted block (chip bg/border)
      wrapping header + cards; cards inset within column width.
- [x] Expanded list stack shows the same tinted bordered block around the
      group; rows keep full width.
- [x] Collapsed stack keeps a clean stacked-paper look, neutral colors.
- [x] `pnpm build` passes.

## Subtasks

- [x] Board view: tinted block wrapper with inset cards
- [x] List view: tinted bordered block wrapper
- [x] Collapsed stack restyle (neutral, crisp layered edges)
- [x] report: verification and build

## Completion report

Implemented in `src/components/CardStack.tsx` only. The expanded stack now
renders inside a rounded envelope styled with the exact chip palette
(`categoryColor` bg + border, `src/lib/category-color.ts`). Board view pads
the block (p-1.5) so child cards are inset while the block stays at column
width; list view pads vertically only (py-1.5) so rows keep full width inside
the frame. Legacy #tag stacks and `categoryChips: off` fall back to a neutral
block (no style). Collapsed layers reworked: near-full-size offset sheets
(6px/3px, 70-85% opacity) with hairline shadows for the crisp stacked-paper
look, still neutral.

Verified: `pnpm build` passes; visual check on the dev server
(http://localhost:2051) in dark theme, board and list views, expanded AGENTIC
(mint) and ARCHITECTURE (pink) stacks render as distinct colored blocks.

Follow-up (same day, vava feedback): list view expanded block no longer tints
the background (it washed out the row text); it draws only the colored frame
with rows at full width. Collapsed stacks now carry the category border too,
in both views, and single board cards match the 1.5px border width in neutral
theme colors. Verified again on the dev server, both views, light and dark.
