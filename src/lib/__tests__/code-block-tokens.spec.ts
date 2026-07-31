/**
 * @file Code-block contrast safety net
 * @description Locks the four invariants that keep markdown code blocks
 * readable on every theme:
 *
 *  1. The bundled `kandown` theme ships every code token in both modes.
 *  2. `BASE_CODE_TOKENS_LIGHT` and `BASE_CODE_TOKENS_DARK` cover the same
 *     five slots and use light/dark HSL values that contrast (no same-channel
 *     bg/fg pairs).
 *  3. `fillCodeTokens` backfills exactly the missing slots and never
 *     overrides a slot the theme already defined (so a curated theme can
 *     pick its own values).
 *  4. `fillCodeTokens` is a pure function: input is not mutated, output is
 *     a fresh object that can be applied to the DOM.
 *
 * Why a unit test rather than an integration test: the safety net runs on
 * every page load, on every theme, in every mode. A 30-line pure-function
 * test catches a regression in seconds; a visual regression catches the
 * same bug in minutes.
 *
 * @see src/lib/theme.ts
 * @see src/lib/types.ts
 */

import { describe, expect, it } from 'vitest';
import { BASE_CODE_TOKENS_DARK, BASE_CODE_TOKENS_LIGHT, fillCodeTokens } from '../theme';
import { THEME_PRESETS } from '../themes';
import type { ThemeTokens } from '../types';

const CODE_TOKEN_KEYS = [
  'code-bg',
  'code-fg',
  'code-inline-bg',
  'code-inline-fg',
  'code-block-border',
] as const;

function stripCodeTokens(tokens: ThemeTokens): Partial<ThemeTokens> {
  // Clone-then-delete; lets us pretend an old community theme forgot the
  // code slots entirely, then watch `fillCodeTokens` repair it.
  const copy: Record<string, string> = { ...tokens };
  for (const key of CODE_TOKEN_KEYS) delete copy[key];
  return copy as Partial<ThemeTokens>;
}

function hslLightness(value: string): number {
  // Theme tokens are HSL triplets (sometimes with / alpha). Pull the L%
  // and return it as a number; used to assert bg vs fg have meaningfully
  // different lightness in the safety net defaults.
  const trimmed = value.trim();
  const match = trimmed.match(/^\s*\d+\s+\d+%\s+(\d+(?:\.\d+)?)%/);
  if (!match) return Number.NaN;
  return Number(match[1]);
}

describe('code-block contrast safety net', () => {
  it('ships every code token in the bundled kandown light map', () => {
    const kandown = THEME_PRESETS.find(t => t.id === 'kandown');
    expect(kandown, 'kandown theme must be bundled').toBeDefined();
    for (const key of CODE_TOKEN_KEYS) {
      expect(kandown!.light[key], `kandown.light.${key}`).toBeTypeOf('string');
      expect(kandown!.light[key].length, `kandown.light.${key} must not be empty`).toBeGreaterThan(0);
    }
  });

  it('ships every code token in the bundled kandown dark map', () => {
    const kandown = THEME_PRESETS.find(t => t.id === 'kandown');
    for (const key of CODE_TOKEN_KEYS) {
      expect(kandown!.dark[key], `kandown.dark.${key}`).toBeTypeOf('string');
      expect(kandown!.dark[key].length, `kandown.dark.${key} must not be empty`).toBeGreaterThan(0);
    }
  });

  it('kandown code-bg and code-fg are mode-flipped (light is light, dark is dark)', () => {
    const kandown = THEME_PRESETS.find(t => t.id === 'kandown')!;
    const lightBgL = hslLightness(kandown.light['code-bg']);
    const darkBgL = hslLightness(kandown.dark['code-bg']);
    const lightFgL = hslLightness(kandown.light['code-fg']);
    const darkFgL = hslLightness(kandown.dark['code-fg']);
    expect(Number.isFinite(lightBgL)).toBe(true);
    expect(Number.isFinite(darkBgL)).toBe(true);
    expect(lightBgL, 'light code-bg should be light').toBeGreaterThan(85);
    expect(darkBgL, 'dark code-bg should be dark').toBeLessThan(25);
    expect(lightFgL, 'light code-fg should be dark').toBeLessThan(25);
    expect(darkFgL, 'dark code-fg should be light').toBeGreaterThan(80);
  });

  it('BASE_CODE_TOKENS_LIGHT and BASE_CODE_TOKENS_DARK cover the same five slots', () => {
    expect(Object.keys(BASE_CODE_TOKENS_LIGHT).sort()).toEqual([...CODE_TOKEN_KEYS].sort());
    expect(Object.keys(BASE_CODE_TOKENS_DARK).sort()).toEqual([...CODE_TOKEN_KEYS].sort());
  });

  it('BASE_CODE_TOKENS_LIGHT uses a light code-bg and dark code-fg', () => {
    const bgL = hslLightness(BASE_CODE_TOKENS_LIGHT['code-bg']!);
    const fgL = hslLightness(BASE_CODE_TOKENS_LIGHT['code-fg']!);
    expect(bgL).toBeGreaterThan(85);
    expect(fgL).toBeLessThan(25);
    expect(bgL - fgL, 'light bg and fg must have a meaningful lightness gap').toBeGreaterThan(50);
  });

  it('BASE_CODE_TOKENS_DARK uses a dark code-bg and light code-fg', () => {
    const bgL = hslLightness(BASE_CODE_TOKENS_DARK['code-bg']!);
    const fgL = hslLightness(BASE_CODE_TOKENS_DARK['code-fg']!);
    expect(bgL).toBeLessThan(25);
    expect(fgL).toBeGreaterThan(80);
    expect(fgL - bgL, 'dark fg and bg must have a meaningful lightness gap').toBeGreaterThan(50);
  });

  it('fillCodeTokens backfills every missing code slot in light mode', () => {
    const kandown = THEME_PRESETS.find(t => t.id === 'kandown')!;
    const stripped = stripCodeTokens(kandown.light);
    expect(stripped['code-bg']).toBeUndefined();

    const repaired = fillCodeTokens(kandown.light, 'light');
    for (const key of CODE_TOKEN_KEYS) {
      expect(repaired[key], `repaired light.${key}`).toBe(BASE_CODE_TOKENS_LIGHT[key]);
    }
  });

  it('fillCodeTokens backfills every missing code slot in dark mode', () => {
    const kandown = THEME_PRESETS.find(t => t.id === 'kandown')!;
    const stripped = stripCodeTokens(kandown.dark);
    expect(stripped['code-fg']).toBeUndefined();

    const repaired = fillCodeTokens(kandown.dark, 'dark');
    for (const key of CODE_TOKEN_KEYS) {
      expect(repaired[key], `repaired dark.${key}`).toBe(BASE_CODE_TOKENS_DARK[key]);
    }
  });

  it('fillCodeTokens never overrides a token the theme already defined', () => {
    const kandown = THEME_PRESETS.find(t => t.id === 'kandown')!;
    const light = fillCodeTokens(kandown.light, 'light');
    const dark = fillCodeTokens(kandown.dark, 'dark');
    expect(light).toEqual(kandown.light);
    expect(dark).toEqual(kandown.dark);
  });

  it('fillCodeTokens does not mutate its input', () => {
    const kandown = THEME_PRESETS.find(t => t.id === 'kandown')!;
    const stripped = stripCodeTokens(kandown.light);
    const before = { ...stripped };
    fillCodeTokens(stripped as ThemeTokens, 'light');
    expect(stripped).toEqual(before);
  });

  it('fillCodeTokens is mode-aware (light mode never falls back to dark defaults and vice versa)', () => {
    const kandown = THEME_PRESETS.find(t => t.id === 'kandown')!;
    const empty: Partial<ThemeTokens> = stripCodeTokens(kandown.light);
    const lightResult = fillCodeTokens(empty as ThemeTokens, 'light');
    const darkResult = fillCodeTokens(empty as ThemeTokens, 'dark');
    expect(lightResult['code-bg']).toBe(BASE_CODE_TOKENS_LIGHT['code-bg']);
    expect(darkResult['code-bg']).toBe(BASE_CODE_TOKENS_DARK['code-bg']);
    expect(lightResult['code-bg']).not.toBe(darkResult['code-bg']);
  });
});
