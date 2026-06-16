/**
 * @file Project skin engine
 * @description Applies per-project Kandown themes using shadcn-compatible CSS
 * tokens. The board stores only stable ids in kandown.json, while this file
 * owns the actual light/dark token maps and font stacks.
 *
 * @functions
 *  → normalizeThemeMode — validates persisted theme mode ids
 *  → normalizeSkinId — validates persisted skin ids
 *  → normalizeFontId — validates persisted font ids
 *  → applyProjectTheme — applies light/dark mode, skin tokens, and font stack
 *
 * @exports FONT_OPTIONS, SKIN_OPTIONS, applyProjectTheme, normalizeThemeMode, normalizeSkinId, normalizeFontId
 * @see src/lib/types.ts
 * @see src/styles/globals.css
 */

import type { BackgroundId, FontId, SkinId, ThemeMode } from './types';

type TokenName =
  | 'background'
  | 'foreground'
  | 'card'
  | 'card-foreground'
  | 'popover'
  | 'popover-foreground'
  | 'primary'
  | 'primary-foreground'
  | 'secondary'
  | 'secondary-foreground'
  | 'muted'
  | 'muted-foreground'
  | 'accent'
  | 'accent-foreground'
  | 'destructive'
  | 'destructive-foreground'
  | 'border'
  | 'border-strong'
  | 'border-focus'
  | 'input'
  | 'ring'
  | 'success'
  | 'warning'
  | 'grid'
  | 'grid-strong'
  | 'glass'
  | 'glass-border';

type ThemeTokens = Record<TokenName, string>;

export interface SkinOption {
  id: SkinId;
  label: string;
  description: string;
  light: ThemeTokens;
  dark: ThemeTokens;
}

export interface FontOption {
  id: FontId;
  label: string;
  stack: string;
}

export interface BackgroundOption {
  id: BackgroundId;
  label: string;
  description: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'inter',
    label: 'Inter',
    stack: "'Inter var', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    id: 'system',
    label: 'System',
    stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  {
    id: 'serif',
    label: 'Editorial',
    stack: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif",
  },
  {
    id: 'mono',
    label: 'Mono',
    stack: "'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  },
  {
    id: 'rounded',
    label: 'Rounded',
    stack: "'SF Pro Rounded', ui-rounded, 'Nunito Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  },
];

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  {
    id: 'solid',
    label: 'Solid',
    description: 'Flat background color from the skin.',
  },
  {
    id: 'static-gradient',
    label: 'Static Gradient',
    description: 'A subtle static gradient background.',
  },
];

const sharedLight = {
  'destructive': '0 72% 51%',
  'destructive-foreground': '0 0% 100%',
  'success': '148 55% 39%',
  'warning': '38 82% 49%',
  'grid': '220 13% 0% / 0.05',
  'grid-strong': '220 13% 0% / 0.085',
} satisfies Pick<ThemeTokens, 'destructive' | 'destructive-foreground' | 'success' | 'warning' | 'grid' | 'grid-strong'>;

const sharedDark = {
  'destructive': '358 74% 59%',
  'destructive-foreground': '0 0% 100%',
  'success': '151 55% 42%',
  'warning': '38 82% 57%',
  'grid': '0 0% 100% / 0.018',
  'grid-strong': '0 0% 100% / 0.04',
} satisfies Pick<ThemeTokens, 'destructive' | 'destructive-foreground' | 'success' | 'warning' | 'grid' | 'grid-strong'>;

export const SKIN_OPTIONS: SkinOption[] = [
  {
    id: 'kandown',
    label: 'Kandown',
    description: 'Crisp neutral contrast, close to the original look.',
    light: {
      ...sharedLight,
      'background': '220 14% 99%',
      'foreground': '220 13% 9%',
      'card': '0 0% 100%',
      'card-foreground': '220 13% 9%',
      'popover': '0 0% 100%',
      'popover-foreground': '220 13% 9%',
      'primary': '220 13% 9%',
      'primary-foreground': '0 0% 100%',
      'secondary': '220 14% 96%',
      'secondary-foreground': '220 13% 12%',
      'muted': '220 13% 95%',
      'muted-foreground': '220 9% 40%',
      'accent': '220 13% 93%',
      'accent-foreground': '220 13% 9%',
      'border': '220 13% 91%',
      'border-strong': '220 12% 84%',
      'border-focus': '220 13% 60%',
      'input': '220 13% 90%',
      'ring': '220 13% 50%',
      'glass': '0 0% 100% / 0.78',
      'glass-border': '220 13% 88% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 0%',
      'foreground': '0 0% 95%',
      'card': '0 0% 6%',
      'card-foreground': '0 0% 95%',
      'popover': '0 0% 7%',
      'popover-foreground': '0 0% 95%',
      'primary': '0 0% 95%',
      'primary-foreground': '0 0% 0%',
      'secondary': '0 0% 9%',
      'secondary-foreground': '0 0% 95%',
      'muted': '0 0% 9%',
      'muted-foreground': '0 0% 56%',
      'accent': '0 0% 11%',
      'accent-foreground': '0 0% 95%',
      'border': '0 0% 11%',
      'border-strong': '0 0% 16%',
      'border-focus': '0 0% 24%',
      'input': '0 0% 11%',
      'ring': '0 0% 64%',
      'glass': '0 0% 6% / 0.78',
      'glass-border': '0 0% 14% / 0.85',
    },
  },
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Soft gray surfaces with restrained contrast.',
    light: {
      ...sharedLight,
      'background': '210 17% 97%',
      'foreground': '215 18% 12%',
      'card': '210 20% 99%',
      'card-foreground': '215 18% 12%',
      'popover': '210 20% 99%',
      'popover-foreground': '215 18% 12%',
      'primary': '215 16% 18%',
      'primary-foreground': '210 20% 98%',
      'secondary': '210 18% 91%',
      'secondary-foreground': '215 18% 16%',
      'muted': '210 17% 90%',
      'muted-foreground': '215 10% 39%',
      'accent': '205 24% 88%',
      'accent-foreground': '215 18% 13%',
      'border': '210 15% 82%',
      'border-strong': '211 13% 74%',
      'border-focus': '212 12% 50%',
      'input': '210 15% 84%',
      'ring': '213 12% 45%',
      'glass': '210 20% 99% / 0.78',
      'glass-border': '210 15% 78% / 0.82',
    },
    dark: {
      ...sharedDark,
      'background': '220 6% 4%',
      'foreground': '220 14% 93%',
      'card': '220 6% 8%',
      'card-foreground': '220 14% 93%',
      'popover': '220 6% 8%',
      'popover-foreground': '220 14% 93%',
      'primary': '220 14% 93%',
      'primary-foreground': '220 6% 4%',
      'secondary': '220 6% 11%',
      'secondary-foreground': '220 14% 93%',
      'muted': '220 6% 10%',
      'muted-foreground': '220 8% 58%',
      'accent': '220 6% 13%',
      'accent-foreground': '220 14% 93%',
      'border': '220 6% 12%',
      'border-strong': '220 6% 18%',
      'border-focus': '220 6% 28%',
      'input': '220 6% 12%',
      'ring': '220 12% 67%',
      'glass': '220 6% 8% / 0.78',
      'glass-border': '220 6% 16% / 0.85',
    },
  },
  {
    id: 'sage',
    label: 'Sage',
    description: 'Calm green-gray accents for long planning sessions.',
    light: {
      ...sharedLight,
      'background': '120 16% 97%',
      'foreground': '150 18% 12%',
      'card': '120 18% 99%',
      'card-foreground': '150 18% 12%',
      'popover': '120 18% 99%',
      'popover-foreground': '150 18% 12%',
      'primary': '153 34% 26%',
      'primary-foreground': '120 18% 98%',
      'secondary': '118 15% 90%',
      'secondary-foreground': '150 20% 16%',
      'muted': '118 14% 90%',
      'muted-foreground': '147 11% 38%',
      'accent': '151 24% 86%',
      'accent-foreground': '150 22% 13%',
      'border': '120 12% 81%',
      'border-strong': '123 11% 72%',
      'border-focus': '151 18% 43%',
      'input': '120 12% 84%',
      'ring': '151 27% 39%',
      'glass': '120 18% 99% / 0.78',
      'glass-border': '120 12% 78% / 0.82',
    },
    dark: {
      ...sharedDark,
      'background': '155 8% 4%',
      'foreground': '135 14% 92%',
      'card': '155 8% 8%',
      'card-foreground': '135 14% 92%',
      'popover': '155 8% 8%',
      'popover-foreground': '135 14% 92%',
      'primary': '151 34% 67%',
      'primary-foreground': '155 8% 4%',
      'secondary': '155 6% 11%',
      'secondary-foreground': '135 14% 92%',
      'muted': '155 6% 10%',
      'muted-foreground': '140 8% 58%',
      'accent': '151 12% 14%',
      'accent-foreground': '135 14% 92%',
      'border': '155 6% 12%',
      'border-strong': '155 6% 18%',
      'border-focus': '151 18% 32%',
      'input': '155 6% 12%',
      'ring': '151 34% 67%',
      'glass': '155 8% 8% / 0.78',
      'glass-border': '155 6% 16% / 0.85',
    },
  },
  {
    id: 'cobalt',
    label: 'Cobalt',
    description: 'Cool blue accents without turning the whole UI blue.',
    light: {
      ...sharedLight,
      'background': '210 25% 98%',
      'foreground': '224 20% 12%',
      'card': '0 0% 100%',
      'card-foreground': '224 20% 12%',
      'popover': '0 0% 100%',
      'popover-foreground': '224 20% 12%',
      'primary': '221 69% 43%',
      'primary-foreground': '0 0% 100%',
      'secondary': '213 24% 91%',
      'secondary-foreground': '224 20% 15%',
      'muted': '213 22% 91%',
      'muted-foreground': '222 12% 40%',
      'accent': '214 42% 88%',
      'accent-foreground': '224 22% 13%',
      'border': '214 18% 82%',
      'border-strong': '214 16% 74%',
      'border-focus': '221 44% 50%',
      'input': '214 18% 84%',
      'ring': '221 69% 43%',
      'glass': '0 0% 100% / 0.78',
      'glass-border': '214 18% 78% / 0.82',
    },
    dark: {
      ...sharedDark,
      'background': '222 6% 4%',
      'foreground': '214 18% 93%',
      'card': '222 6% 8%',
      'card-foreground': '214 18% 93%',
      'popover': '222 6% 8%',
      'popover-foreground': '214 18% 93%',
      'primary': '217 76% 70%',
      'primary-foreground': '222 6% 4%',
      'secondary': '222 6% 11%',
      'secondary-foreground': '214 18% 93%',
      'muted': '222 6% 10%',
      'muted-foreground': '216 8% 60%',
      'accent': '219 14% 14%',
      'accent-foreground': '214 18% 93%',
      'border': '222 6% 12%',
      'border-strong': '222 6% 18%',
      'border-focus': '217 36% 36%',
      'input': '222 6% 12%',
      'ring': '217 76% 70%',
      'glass': '222 6% 8% / 0.78',
      'glass-border': '222 6% 16% / 0.85',
    },
  },
  {
    id: 'rose',
    label: 'Rose',
    description: 'Warm ink with a restrained pink accent.',
    light: {
      ...sharedLight,
      'background': '20 22% 98%',
      'foreground': '340 14% 12%',
      'card': '0 0% 100%',
      'card-foreground': '340 14% 12%',
      'popover': '0 0% 100%',
      'popover-foreground': '340 14% 12%',
      'primary': '343 62% 42%',
      'primary-foreground': '0 0% 100%',
      'secondary': '20 20% 91%',
      'secondary-foreground': '340 14% 15%',
      'muted': '20 18% 91%',
      'muted-foreground': '340 9% 41%',
      'accent': '344 38% 90%',
      'accent-foreground': '340 16% 13%',
      'border': '20 15% 83%',
      'border-strong': '20 14% 74%',
      'border-focus': '343 35% 48%',
      'input': '20 15% 85%',
      'ring': '343 62% 42%',
      'glass': '0 0% 100% / 0.78',
      'glass-border': '20 15% 79% / 0.82',
    },
    dark: {
      ...sharedDark,
      'background': '340 6% 4%',
      'foreground': '20 16% 93%',
      'card': '340 6% 8%',
      'card-foreground': '20 16% 93%',
      'popover': '340 6% 8%',
      'popover-foreground': '20 16% 93%',
      'primary': '344 72% 70%',
      'primary-foreground': '340 6% 4%',
      'secondary': '340 6% 11%',
      'secondary-foreground': '20 16% 93%',
      'muted': '340 6% 10%',
      'muted-foreground': '20 8% 60%',
      'accent': '344 14% 14%',
      'accent-foreground': '20 16% 93%',
      'border': '340 6% 12%',
      'border-strong': '340 6% 18%',
      'border-focus': '344 31% 36%',
      'input': '340 6% 12%',
      'ring': '344 72% 70%',
      'glass': '340 6% 8% / 0.78',
      'glass-border': '340 6% 16% / 0.85',
    },
  },
];

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

export function normalizeSkinId(value: unknown): SkinId {
  return SKIN_OPTIONS.some(skin => skin.id === value) ? (value as SkinId) : 'kandown';
}

export function normalizeFontId(value: unknown): FontId {
  return FONT_OPTIONS.some(font => font.id === value) ? (value as FontId) : 'inter';
}

export function normalizeBackgroundId(value: unknown): BackgroundId {
  return BACKGROUND_OPTIONS.some(bg => bg.id === value) ? (value as BackgroundId) : 'solid';
}

function resolveMode(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

export function applyProjectTheme(theme: ThemeMode, skinId: SkinId, fontId: FontId, backgroundId: BackgroundId = 'solid'): void {
  const root = document.documentElement;
  const resolvedMode = resolveMode(theme);
  const skin = SKIN_OPTIONS.find(item => item.id === skinId) ?? SKIN_OPTIONS[0];
  const font = FONT_OPTIONS.find(item => item.id === fontId) ?? FONT_OPTIONS[0];
  const tokens = skin[resolvedMode];

  root.classList.toggle('dark', resolvedMode === 'dark');
  root.dataset.theme = theme;
  root.dataset.resolvedTheme = resolvedMode;
  root.dataset.skin = skin.id;
  root.dataset.font = font.id;
  root.dataset.background = backgroundId;
  root.style.setProperty('--font-sans', font.stack);
  root.style.setProperty('color-scheme', resolvedMode);

  for (const [name, value] of Object.entries(tokens) as Array<[TokenName, string]>) {
    root.style.setProperty(`--${name}`, value);
  }
}
