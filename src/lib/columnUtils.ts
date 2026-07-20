/**
 * @file Shared column utilities
 * @description Provides column color maps, color swatches, and tabler icon resolvers
 * shared across Board and List views.
 *
 * @exports columnIconsByName, getColumnIcon, COLUMN_COLOR_MAP, COLOR_SWATCHES
 * @see src/components/Column.tsx
 * @see src/components/ListView.tsx
 */

import {
  IconCircleCheck,
  IconClipboardList,
  IconEyeCheck,
  IconInbox,
  IconListDetails,
  IconProgress,
  type TablerIcon,
} from '@tabler/icons-react';
import type { ColumnColor } from './types';

export const columnIconsByName: Readonly<Record<string, TablerIcon>> = {
  backlog: IconInbox,
  icebox: IconInbox,
  todo: IconClipboardList,
  'to do': IconClipboardList,
  ready: IconClipboardList,
  doing: IconProgress,
  progress: IconProgress,
  'in progress': IconProgress,
  active: IconProgress,
  review: IconEyeCheck,
  qa: IconEyeCheck,
  verify: IconEyeCheck,
  done: IconCircleCheck,
  complete: IconCircleCheck,
  completed: IconCircleCheck,
};

export function getColumnIcon(columnName: string): TablerIcon {
  const normalizedName = columnName.trim().toLowerCase();
  return columnIconsByName[normalizedName] ?? IconListDetails;
}

// 📖 Column tints. Default is a barely-there neutral that lets the cards carry
// the visual weight. Brighter tints are dialed way down vs the old defaults so
// the board never feels like a kid's coloring book.
export const COLUMN_COLOR_MAP: Record<ColumnColor, string> = {
  red: 'rgba(239,68,68,0.06)',
  orange: 'rgba(249,115,22,0.06)',
  amber: 'rgba(245,158,11,0.06)',
  yellow: 'rgba(234,179,8,0.06)',
  lime: 'rgba(132,204,22,0.06)',
  green: 'rgba(34,197,94,0.06)',
  emerald: 'rgba(16,185,129,0.06)',
  teal: 'rgba(20,184,166,0.06)',
  cyan: 'rgba(6,182,212,0.06)',
  sky: 'rgba(14,165,233,0.06)',
  blue: 'rgba(59,130,246,0.06)',
  indigo: 'rgba(99,102,241,0.06)',
  violet: 'rgba(139,92,246,0.06)',
  purple: 'rgba(168,85,247,0.06)',
  fuchsia: 'rgba(217,70,239,0.06)',
  pink: 'rgba(236,72,153,0.06)',
  rose: 'rgba(244,63,94,0.06)',
  slate: 'rgba(100,116,139,0.05)',
  gray: 'rgba(255,255,255,0.025)',
  zinc: 'rgba(113,113,122,0.05)',
  black: 'rgba(0,0,0,0.24)',
  blackTransparent: 'rgba(0,0,0,0.1)',
};

export const COLOR_SWATCHES: { key: ColumnColor; label: string; color: string }[] = [
  { key: 'red', label: 'Red', color: 'rgba(239,68,68,0.9)' },
  { key: 'orange', label: 'Orange', color: 'rgba(249,115,22,0.9)' },
  { key: 'amber', label: 'Amber', color: 'rgba(245,158,11,0.9)' },
  { key: 'yellow', label: 'Yellow', color: 'rgba(234,179,8,0.9)' },
  { key: 'lime', label: 'Lime', color: 'rgba(132,204,22,0.9)' },
  { key: 'green', label: 'Green', color: 'rgba(34,197,94,0.9)' },
  { key: 'emerald', label: 'Emerald', color: 'rgba(16,185,129,0.9)' },
  { key: 'teal', label: 'Teal', color: 'rgba(20,184,166,0.9)' },
  { key: 'cyan', label: 'Cyan', color: 'rgba(6,182,212,0.9)' },
  { key: 'sky', label: 'Sky', color: 'rgba(14,165,233,0.9)' },
  { key: 'blue', label: 'Blue', color: 'rgba(59,130,246,0.9)' },
  { key: 'indigo', label: 'Indigo', color: 'rgba(99,102,241,0.9)' },
  { key: 'violet', label: 'Violet', color: 'rgba(139,92,246,0.9)' },
  { key: 'purple', label: 'Purple', color: 'rgba(168,85,247,0.9)' },
  { key: 'fuchsia', label: 'Fuchsia', color: 'rgba(217,70,239,0.9)' },
  { key: 'pink', label: 'Pink', color: 'rgba(236,72,153,0.9)' },
  { key: 'rose', label: 'Rose', color: 'rgba(244,63,94,0.9)' },
  { key: 'slate', label: 'Slate', color: 'rgba(100,116,139,0.9)' },
  { key: 'gray', label: 'Gray', color: 'rgba(156,163,175,0.9)' },
  { key: 'zinc', label: 'Zinc', color: 'rgba(113,113,122,0.9)' },
  { key: 'black', label: 'Black', color: 'rgba(0,0,0,0.9)' },
  { key: 'blackTransparent', label: 'Black 50%', color: 'rgba(0,0,0,0.5)' },
];
