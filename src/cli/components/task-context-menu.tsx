/**
 * @file Inline context menu for task actions
 * @description Compact 2-line context menu rendered inline within a board column,
 * directly below the task it refers to. Shows "Open task" and "Move task" options.
 *
 * 📖 Design: minimal, no borders, just indented options with a ▸ cursor.
 * Fits naturally within the column width. Keyboard-navigable (j/k + Enter).
 *
 * @functions
 *  → InlineContextMenu — inline menu component
 *
 * @exports InlineContextMenu
 * @see src/cli/screens/board.tsx — renders this inside KanbanColumn
 */

import { Box, Text } from 'ink';

interface InlineContextMenuProps {
  /** Which option is focused (0 or 1) */
  cursor: number;
  /** Available width (column width) */
  colWidth: number;
}

export function InlineContextMenu({ cursor, colWidth }: InlineContextMenuProps) {
  const options = [
    { label: 'Open task', icon: '📖' },
    { label: 'Move task', icon: '↗' },
  ];

  return (
    <Box flexDirection="column">
      {options.map((opt, idx) => {
        const focused = idx === cursor;
        return (
          <Box key={opt.label}>
            <Text color="gray" dimColor>{'  '}</Text>
            <Text
              color={focused ? 'black' : 'gray'}
              backgroundColor={focused ? 'cyan' : undefined}
              bold={focused}
            >
              {focused ? '▸' : ' '} {opt.icon} {opt.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

/** 📖 Number of terminal lines the menu occupies (for Y-coordinate offset calculation). */
export const MENU_HEIGHT = 2;
