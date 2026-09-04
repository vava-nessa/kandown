/**
 * @file Shared column utilities
 * @description Provides column color maps, color swatches, and tabler icon resolvers
 * shared across Board and List views.
 *
 * @exports columnIconsByName, getColumnIcon, COLUMN_BAR_MAP, COLOR_SWATCHES,
 *          COLUMN_LIGHT_BG, COLUMN_LIGHT_BORDER, COLUMN_DARK_BG, COLUMN_DARK_BORDER,
 *          getColumnColorStyles
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

// 📖 Solid bar colors for the 3-4px column accent bar (board and list views).
// The old COLUMN_COLOR_MAP tints were meant for a full-column wash; a thin
// top bar needs pigment, so these are the same hue families at ~0.85 alpha.
// `gray` stays muted so an uncustomized column reads as a neutral hairline.
export const COLUMN_BAR_MAP: Record<ColumnColor, string> = {
  red: 'rgba(239,68,68,0.85)',
  orange: 'rgba(249,115,22,0.85)',
  amber: 'rgba(245,158,11,0.85)',
  yellow: 'rgba(234,179,8,0.85)',
  lime: 'rgba(132,204,22,0.85)',
  green: 'rgba(34,197,94,0.85)',
  emerald: 'rgba(16,185,129,0.85)',
  teal: 'rgba(20,184,166,0.85)',
  cyan: 'rgba(6,182,212,0.85)',
  sky: 'rgba(14,165,233,0.85)',
  blue: 'rgba(59,130,246,0.85)',
  indigo: 'rgba(99,102,241,0.85)',
  violet: 'rgba(139,92,246,0.85)',
  purple: 'rgba(168,85,247,0.85)',
  fuchsia: 'rgba(217,70,239,0.85)',
  pink: 'rgba(236,72,153,0.85)',
  rose: 'rgba(244,63,94,0.85)',
  slate: 'rgba(100,116,139,0.7)',
  gray: 'rgba(156,163,175,0.4)',
  zinc: 'rgba(113,113,122,0.55)',
  black: 'rgba(0,0,0,0.7)',
  blackTransparent: 'rgba(0,0,0,0.35)',
};

// 📖 Very light pastel background tints for columns in light mode.
// Keeps the board gentle so white cards, category chips, and tag borders
// pop with crisp contrast.
export const COLUMN_LIGHT_BG: Record<ColumnColor, string> = {
  red: 'rgba(239,68,68,0.12)',
  orange: 'rgba(249,115,22,0.13)',
  amber: 'rgba(245,158,11,0.13)',
  yellow: 'rgba(234,179,8,0.14)',
  lime: 'rgba(132,204,22,0.13)',
  green: 'rgba(34,197,94,0.12)',
  emerald: 'rgba(16,185,129,0.12)',
  teal: 'rgba(20,184,166,0.12)',
  cyan: 'rgba(6,182,212,0.12)',
  sky: 'rgba(14,165,233,0.12)',
  blue: 'rgba(59,130,246,0.12)',
  indigo: 'rgba(99,102,241,0.12)',
  violet: 'rgba(139,92,246,0.12)',
  purple: 'rgba(168,85,247,0.12)',
  fuchsia: 'rgba(217,70,239,0.12)',
  pink: 'rgba(236,72,153,0.12)',
  rose: 'rgba(244,63,94,0.12)',
  slate: 'rgba(100,116,139,0.08)',
  gray: 'rgba(156,163,175,0.08)',
  zinc: 'rgba(113,113,122,0.08)',
  black: 'rgba(0,0,0,0.04)',
  blackTransparent: 'rgba(0,0,0,0.02)',
};

// 📖 Harmonizing subtle borders for columns in light mode.
export const COLUMN_LIGHT_BORDER: Record<ColumnColor, string> = {
  red: 'rgba(239,68,68,0.22)',
  orange: 'rgba(249,115,22,0.24)',
  amber: 'rgba(245,158,11,0.24)',
  yellow: 'rgba(234,179,8,0.25)',
  lime: 'rgba(132,204,22,0.24)',
  green: 'rgba(34,197,94,0.22)',
  emerald: 'rgba(16,185,129,0.22)',
  teal: 'rgba(20,184,166,0.22)',
  cyan: 'rgba(6,182,212,0.22)',
  sky: 'rgba(14,165,233,0.22)',
  blue: 'rgba(59,130,246,0.22)',
  indigo: 'rgba(99,102,241,0.22)',
  violet: 'rgba(139,92,246,0.22)',
  purple: 'rgba(168,85,247,0.22)',
  fuchsia: 'rgba(217,70,239,0.22)',
  pink: 'rgba(236,72,153,0.22)',
  rose: 'rgba(244,63,94,0.22)',
  slate: 'rgba(100,116,139,0.18)',
  gray: 'rgba(156,163,175,0.18)',
  zinc: 'rgba(113,113,122,0.18)',
  black: 'rgba(0,0,0,0.10)',
  blackTransparent: 'rgba(0,0,0,0.06)',
};

// 📖 Very dark, saturated background tints for columns in dark mode.
// Preserves night-time readability and prevents bright column glare.
export const COLUMN_DARK_BG: Record<ColumnColor, string> = {
  red: 'rgba(239,68,68,0.14)',
  orange: 'rgba(249,115,22,0.13)',
  amber: 'rgba(245,158,11,0.12)',
  yellow: 'rgba(234,179,8,0.11)',
  lime: 'rgba(132,204,22,0.11)',
  green: 'rgba(34,197,94,0.12)',
  emerald: 'rgba(16,185,129,0.12)',
  teal: 'rgba(20,184,166,0.12)',
  cyan: 'rgba(6,182,212,0.12)',
  sky: 'rgba(14,165,233,0.12)',
  blue: 'rgba(59,130,246,0.13)',
  indigo: 'rgba(99,102,241,0.13)',
  violet: 'rgba(139,92,246,0.13)',
  purple: 'rgba(168,85,247,0.13)',
  fuchsia: 'rgba(217,70,239,0.13)',
  pink: 'rgba(236,72,153,0.13)',
  rose: 'rgba(244,63,94,0.13)',
  slate: 'rgba(100,116,139,0.12)',
  gray: 'rgba(255,255,255,0.03)',
  zinc: 'rgba(113,113,122,0.12)',
  black: 'rgba(0,0,0,0.40)',
  blackTransparent: 'rgba(0,0,0,0.20)',
};

// 📖 Harmonizing subtle borders for columns in dark mode.
export const COLUMN_DARK_BORDER: Record<ColumnColor, string> = {
  red: 'rgba(239,68,68,0.24)',
  orange: 'rgba(249,115,22,0.22)',
  amber: 'rgba(245,158,11,0.20)',
  yellow: 'rgba(234,179,8,0.18)',
  lime: 'rgba(132,204,22,0.18)',
  green: 'rgba(34,197,94,0.20)',
  emerald: 'rgba(16,185,129,0.20)',
  teal: 'rgba(20,184,166,0.20)',
  cyan: 'rgba(6,182,212,0.20)',
  sky: 'rgba(14,165,233,0.20)',
  blue: 'rgba(59,130,246,0.22)',
  indigo: 'rgba(99,102,241,0.22)',
  violet: 'rgba(139,92,246,0.22)',
  purple: 'rgba(168,85,247,0.22)',
  fuchsia: 'rgba(217,70,239,0.22)',
  pink: 'rgba(236,72,153,0.22)',
  rose: 'rgba(244,63,94,0.22)',
  slate: 'rgba(100,116,139,0.20)',
  gray: 'rgba(255,255,255,0.08)',
  zinc: 'rgba(113,113,122,0.20)',
  black: 'rgba(255,255,255,0.06)',
  blackTransparent: 'rgba(255,255,255,0.04)',
};

export interface ColumnColorStyles {
  lightBg: string;
  darkBg: string;
  lightBorder: string;
  darkBorder: string;
}

export function getColumnColorStyles(colorKey: ColumnColor = 'gray'): ColumnColorStyles {
  return {
    lightBg: COLUMN_LIGHT_BG[colorKey] ?? COLUMN_LIGHT_BG.gray,
    darkBg: COLUMN_DARK_BG[colorKey] ?? COLUMN_DARK_BG.gray,
    lightBorder: COLUMN_LIGHT_BORDER[colorKey] ?? COLUMN_LIGHT_BORDER.gray,
    darkBorder: COLUMN_DARK_BORDER[colorKey] ?? COLUMN_DARK_BORDER.gray,
  };
}
