/**
 * @file Deterministic category colors and icons
 * @description Maps a category name (WEB, CLI, ARCHITECTURE, THEMES...) to a
 * stable accent color and a stable icon by hashing the name: the same string
 * always yields the same color and icon, nothing is stored, nothing to
 * maintain. Powering the optional colored category chips in the web UI
 * (`ui.categoryChips`).
 *
 * 📖 Why a hash and not a lookup: categories are free-form. A hash keeps the
 * whole feature stateless, so renaming a category or opening a repo with new
 * categories never needs a migration or a config entry.
 *
 * 📖 Chip style: quiet tint. The background is the palette hue at ~13%
 * alpha, so it reads as a muted wash on both the near-white light card and
 * the near-black dark card. The chip component (CategoryChip) derives its
 * label color from the same hue through CSS variables, darkening it in light
 * mode and lightening it in dark mode; there is no chip border anywhere
 * (UI redesign t334: one boundary per surface).
 *
 * @functions
 *  → hashString — FNV-1a 32-bit hash of a string
 *  → categoryColor — { bg, fg, border } from a category name
 *  → categoryIcon — a stable tabler icon for a category name
 *
 * @exports hashString, CATEGORY_PALETTE, CATEGORY_ICONS, categoryColor, categoryBarColor, chipHueSat, categoryIcon
 * @see src/components/TaskWorkspace.tsx
 * @see src/components/Drawer.tsx
 */

import {
  IconBox,
  IconBug,
  IconChartBar,
  IconCode,
  IconComponents,
  IconDatabase,
  IconFileText,
  IconGlobe,
  IconPalette,
  IconRocket,
  IconSettings,
  IconShieldCheck,
  IconSparkles,
  IconStack2,
  IconTag,
  IconTerminal2,
  IconTool,
  type TablerIcon,
} from '@tabler/icons-react';

export interface CategoryColor {
  /** Chip background, a pastel tint, e.g. `hsl(215 85% 88%)`. */
  bg: string;
  /** Chip foreground, near-black at 90% opacity on the pastel background. */
  fg: string;
  /** Hairline border one shade deeper than the background, keeps the chip
   * defined on both light and dark pages. */
  border: string;
}

/** 📖 FNV-1a 32-bit. Deterministic, fast, no deps. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 📖 Tint alpha for the chip background: strong enough to read as color,
 * quiet enough that forty categories never scream at once. */
const TINT_ALPHA = 0.13;
/** 📖 Border alpha for consumers that still need a hairline (dependency
 * chips, group markers). Same hue, more presence than the fill. */
const TINT_BORDER_ALPHA = 0.3;
/** 📖 Label color on light surfaces (dark mode overrides via CSS). */
const TINT_FG_LIGHTNESS = 32;

/**
 * 📖 40 curated chip hues, spread around the wheel with varied saturation so
 * adjacent hash indices stay distinguishable as pastels. Lightness is fixed
 * by the pastel constants above; only hue and saturation vary per slot.
 */
export const CATEGORY_PALETTE: ReadonlyArray<{ hue: number; sat: number }> = [
  { hue: 215, sat: 85 },  // blue
  { hue: 262, sat: 80 },  // violet
  { hue: 330, sat: 75 },  // pink
  { hue: 25,  sat: 85 },  // orange
  { hue: 145, sat: 70 },  // green
  { hue: 350, sat: 78 },  // red
  { hue: 200, sat: 82 },  // cyan
  { hue: 305, sat: 65 },  // magenta
  { hue: 45,  sat: 85 },  // amber
  { hue: 225, sat: 70 },  // indigo
  { hue: 165, sat: 75 },  // teal
  { hue: 280, sat: 70 },  // purple
  { hue: 5,   sat: 75 },  // tomato
  { hue: 190, sat: 75 },  // deep cyan
  { hue: 90,  sat: 60 },  // olive
  { hue: 315, sat: 70 },  // fuchsia
  { hue: 230, sat: 60 },  // royal blue
  { hue: 15,  sat: 80 },  // coral
  { hue: 155, sat: 70 },  // sea green
  { hue: 265, sat: 60 },  // deep violet
  { hue: 340, sat: 80 },  // raspberry
  { hue: 210, sat: 75 },  // sky blue
  { hue: 100, sat: 65 },  // leaf
  { hue: 320, sat: 70 },  // orchid
  { hue: 180, sat: 70 },  // pine
  { hue: 25,  sat: 90 },  // bright orange
  { hue: 250, sat: 65 },  // deep indigo
  { hue: 355, sat: 85 },  // bright red
  { hue: 75,  sat: 60 },  // sage
  { hue: 295, sat: 65 },  // plum
  { hue: 195, sat: 80 },  // azure
  { hue: 40,  sat: 85 },  // gold
  { hue: 130, sat: 60 },  // forest
  { hue: 335, sat: 75 },  // rose
  { hue: 215, sat: 55 },  // steel blue
  { hue: 10,  sat: 70 },  // brick
  { hue: 270, sat: 55 },  // lavender
  { hue: 160, sat: 65 },  // mint
  { hue: 30,  sat: 80 },  // brown
  { hue: 245, sat: 55 },  // navy
];

/**
 * 📖 Deterministic pastel chip for a category. Same input, same output, no
 * storage: the palette slot's hue and saturation at a fixed pastel lightness,
 * with near-black 90% text. Legible on a white page and on a dark page.
 */
export function categoryColor(category: string): CategoryColor {
  const name = (category || '').trim().toUpperCase();
  const slot = CATEGORY_PALETTE[hashString(name) % CATEGORY_PALETTE.length] ?? CATEGORY_PALETTE[0];
  const { hue, sat } = slot;
  return {
    bg: `hsl(${hue} ${sat}% 45% / ${TINT_ALPHA})`,
    fg: `hsl(${hue} 50% ${TINT_FG_LIGHTNESS}%)`,
    border: `hsl(${hue} ${sat}% 45% / ${TINT_BORDER_ALPHA})`,
  };
}

/** 📖 Solid-enough hue for the 3px group accent bar (vava review): half
 * alpha keeps it a line, not a wall, while clearly reading as the group's
 * color on both light and dark cards. */
export function categoryBarColor(category: string): string {
  const name = (category || '').trim().toUpperCase();
  const slot = CATEGORY_PALETTE[hashString(name) % CATEGORY_PALETTE.length] ?? CATEGORY_PALETTE[0];
  return `hsl(${slot.hue} ${slot.sat}% 45% / 0.55)`;
}

/** 📖 Raw hashed hue/sat for CSS-variable consumers (CategoryChip). Same
 * hash as categoryColor, so a category's chip and its tint always agree. */
export function chipHueSat(category: string): { hue: number; sat: number } {
  const name = (category || '').trim().toUpperCase();
  const slot = CATEGORY_PALETTE[hashString(name) % CATEGORY_PALETTE.length] ?? CATEGORY_PALETTE[0];
  return { hue: slot.hue, sat: slot.sat };
}

/** 📖 17 generic icons, one picked by hash so a category keeps its icon. */
export const CATEGORY_ICONS: ReadonlyArray<TablerIcon> = [
  IconBox,
  IconCode,
  IconPalette,
  IconRocket,
  IconSettings,
  IconBug,
  IconTerminal2,
  IconShieldCheck,
  IconChartBar,
  IconDatabase,
  IconGlobe,
  IconFileText,
  IconTool,
  IconSparkles,
  IconStack2,
  IconTag,
  IconComponents,
];

/** 📖 The stable icon for a category, derived from the same hash as the color. */
export function categoryIcon(category: string): TablerIcon {
  const name = (category || '').trim().toUpperCase();
  return CATEGORY_ICONS[hashString(name) % CATEGORY_ICONS.length] ?? IconBox;
}
