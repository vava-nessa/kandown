/**
 * @file Task Context Menu component
 * @description Small, unobtrusive popup menu that appears when a user clicks
 * on a task in the board TUI. Provides two actions:
 *   - "Open task" — opens the task detail view (same as pressing Enter)
 *   - "Move task" — enters move mode, showing target placeholders in other columns
 *
 * 📖 Design philosophy: minimal, sober TUI modal — no flashy colors, no borders.
 * Just a small floating box near the cursor position with two options.
 *
 * 📖 Keyboard support: j/k or ↑/↓ to navigate, Enter to confirm, Esc to cancel.
 * Mouse support: click on an option to select it.
 *
 * @functions
 *  → TaskContextMenu — context menu overlay component
 *
 * @exports TaskContextMenu
 * @see src/cli/screens/board.tsx — parent that renders this menu
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ContextMenuOption {
  id: string;
  label: string;
  icon: string;
}

interface TaskContextMenuProps {
  /** Task ID the menu is for (shown in header) */
  taskId: string;
  /** Available menu options */
  options: ContextMenuOption[];
  /** Called when user confirms a selection */
  onSelect: (optionId: string) => void;
  /** Called when user cancels (Esc/q) */
  onCancel: () => void;
  /** Mouse position to position the menu near (1-based terminal coords) */
  mouseX?: number;
  mouseY?: number;
  /** Callback fired on mouse click — used for click-to-select in menu items */
  onMouseClick?: (x: number, y: number) => void;
  /** The row offset where the menu starts rendering (for click detection) */
  menuStartRow?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TaskContextMenu({
  taskId,
  options,
  onSelect,
  onCancel,
  mouseX,
  mouseY,
  onMouseClick,
  menuStartRow,
}: TaskContextMenuProps) {
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onCancel();
      return;
    }

    if (key.downArrow || input === 'j') {
      setCursor(c => Math.min(c + 1, options.length - 1));
      return;
    }
    if (key.upArrow || input === 'k') {
      setCursor(c => Math.max(c - 1, 0));
      return;
    }

    if (key.return) {
      const opt = options[cursor];
      if (opt) onSelect(opt.id);
      return;
    }
  });

  // 📖 Calculate menu width — enough for the longest option + icon + padding
  const maxLabelLen = Math.max(...options.map(o => o.label.length));
  const menuWidth = Math.max(24, maxLabelLen + 8);

  // 📖 Build menu lines with position tracking for mouse clicks
  const lines: { optionId: string; y: number }[] = [];
  const startRow = menuStartRow ?? 0;

  return (
    <Box
      flexDirection="column"
      paddingLeft={2}
      marginTop={0}
    >
      {/* Header — small, subtle */}
      <Box>
        <Text color="gray" dimColor>┌─ </Text>
        <Text color="cyan" bold>{taskId}</Text>
        <Text color="gray" dimColor> ─┐</Text>
      </Box>

      {/* Options */}
      {options.map((opt, idx) => {
        const focused = idx === cursor;
        const lineY = startRow + 1 + idx; // +1 for header line
        lines.push({ optionId: opt.id, y: lineY });

        return (
          <Box key={opt.id}>
            <Text color="gray" dimColor>│ </Text>
            <Text
              color={focused ? 'black' : 'gray'}
              backgroundColor={focused ? 'cyan' : undefined}
              bold={focused}
            >
              {focused ? '▸' : ' '} {opt.icon} {opt.label}
            </Text>
            {!focused && <Text color="gray" dimColor>{' '.repeat(Math.max(0, menuWidth - opt.label.length - 4))}│</Text>}
            {focused && <Text color="gray" dimColor>{' '.repeat(Math.max(0, menuWidth - opt.label.length - 4))}│</Text>}
          </Box>
        );
      })}

      {/* Footer */}
      <Box>
        <Text color="gray" dimColor>└{'─'.repeat(menuWidth)}┘</Text>
      </Box>
    </Box>
  );
}
