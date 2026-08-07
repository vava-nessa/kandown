/**
 * @file Dependency chip format
 * @description Shared text formatter for the "depends on" chip shown on task
 * cards (web board view) and TUI list rows. A single dependency renders as
 * `↪ t234: Fix login button…` so a quick board scan surfaces who is blocking
 * whom without opening the drawer; multiple dependencies collapse to
 * `↪2 t234, t112` since the column width is at a premium and the count
 * already conveys "there is more than one".
 *
 * The arrow prefix matches the previous visual identity of the chip (yellow
 * surface, arrow + count) so existing muscle memory keeps working; only the
 * body after the arrow changes from "N" to either "id: <title preview>" or
 * "N id1, id2, …".
 *
 * 📖 The 20-char preview is a deliberate balance: short enough to never blow
 * the card meta row into a second line on a standard title, long enough to
 * disambiguate tasks at a glance. An ellipsis marks truncation so the user
 * knows the title continues in the drawer.
 *
 * @functions
 *  → formatDependencyChip — single source of truth for chip text
 *
 * @exports formatDependencyChip, DEPENDENCY_TITLE_PREVIEW
 * @see src/components/Card.tsx
 * @see src/cli/screens/board/list-view.tsx
 */

export const DEPENDENCY_TITLE_PREVIEW = 20;

/**
 * 📖 Renders the chip body. `titleById` is a Map built once from the current
 * board so each call stays O(deps). Missing titles (deleted tasks) fall
 * through to the ID alone rather than to "id: " — a trailing colon with
 * nothing after it reads like a half-loaded chip.
 */
export function formatDependencyChip(
  ids: readonly string[],
  titleById: ReadonlyMap<string, string>,
): string {
  if (!ids || ids.length === 0) return '';

  if (ids.length === 1) {
    const id = ids[0];
    const title = titleById.get(id) ?? '';
    if (!title) return `↪ ${id}`;
    const preview = title.length > DEPENDENCY_TITLE_PREVIEW
      ? `${title.slice(0, DEPENDENCY_TITLE_PREVIEW)}…`
      : title;
    return `↪ ${id}: ${preview}`;
  }

  return `↪${ids.length} ${ids.join(', ')}`;
}
