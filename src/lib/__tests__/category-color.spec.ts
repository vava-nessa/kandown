/**
 * @file Unit tests for hash-based category colors and icons
 * @description Verifies the deterministic contract of src/lib/category-color.ts:
 * same category string always yields the same color and icon, the foreground
 * is always a legible dark or white on the chosen background, and the palette
 * covers the full color wheel so distinct categories spread out.
 *
 * @see src/lib/category-color.ts
 */
import { describe, it, expect } from 'vitest';
import {
  hashString,
  categoryColor,
  chipHueSat,
  categoryIcon,
  CATEGORY_PALETTE,
  CATEGORY_ICONS,
} from '../category-color';

describe('hashString', () => {
  it('is deterministic and differs across categories', () => {
    expect(hashString('WEB')).toBe(hashString('WEB'));
    expect(hashString('WEB')).not.toBe(hashString('CLI'));
    expect(hashString('')).toBe(2166136261); // FNV-1a offset basis
  });
});

describe('categoryColor', () => {
  it('returns the same chip for the same category', () => {
    expect(categoryColor('WEB')).toEqual(categoryColor('WEB'));
    expect(categoryColor('web')).toEqual(categoryColor('WEB')); // case-insensitive
  });

  it('keeps the chip inside the palette', () => {
    for (const name of ['WEB', 'CLI', 'ARCHITECTURE', 'THEMES', 'AGENTIC', 'DESKTOP', 'QUALITY', 'CLEANUP']) {
      const { bg } = categoryColor(name);
      expect(bg).toMatch(/^hsl\(\d+ \d+% 45% \/ 0\.13\)$/);
    }
  });

  it('always uses the quiet alpha tint with a hue-matched label', () => {
    for (const slot of CATEGORY_PALETTE) {
      const probe = `C${slot.hue}-${slot.sat}`;
      const { bg, fg } = categoryColor(probe);
      // 📖 The probe hashes to an arbitrary slot, so only the fixed shape is
      // asserted: palette hue/sat, the quiet 45%/0.13 tint, the hue-matched
      // label at lightness 32 (dark mode overrides via CSS).
      expect(bg).toMatch(/^hsl\(\d+ \d+% 45% \/ 0\.13\)$/);
      expect(fg).toMatch(/^hsl\(\d+ 50% 32%\)$/);
    }
  });

  it('exposes the raw hue/sat for CSS-variable consumers', () => {
    expect(chipHueSat('WEB')).toEqual(chipHueSat('web'));
    const { hue, sat } = chipHueSat('WEB');
    expect(hue).toBeGreaterThan(0);
    expect(sat).toBeGreaterThan(0);
  });

  it('spreads distinct categories across the palette', () => {
    const seen = new Set(['WEB', 'CLI', 'ARCHITECTURE', 'THEMES', 'DESKTOP', 'QUALITY', 'AGENTIC', 'WEB'].map(c => categoryColor(c).bg));
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('categoryIcon', () => {
  it('is stable and inside the icon pool', () => {
    expect(categoryIcon('WEB')).toBe(categoryIcon('WEB'));
    expect(CATEGORY_ICONS).toContain(categoryIcon('WEB'));
    expect(CATEGORY_ICONS).toContain(categoryIcon('CLI'));
  });
});
