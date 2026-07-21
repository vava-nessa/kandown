/**
 * @file Project theme engine (FABLE_UI)
 * @description Manages customizable JSON themes, appearance tokens (--radius,
 * --shadow-*, --font-display, --motion-scale), curated presets (Vercel, Linear,
 * Claude, Apple, Stripe, Paper, Catppuccin, Terminal), and dynamic inheritance.
 *
 * @functions
 *  → registerCustomThemes — registers user custom themes into runtime
 *  → getAllThemes — returns built-in presets + registered custom themes
 *  → resolveTheme — resolves theme with inheritance base merging & fallback
 *  → normalizeSkinId — validates skin / theme id
 *  → applyProjectTheme — applies tokens, appearance variables, and mode to document
 *
 * @exports FONT_OPTIONS, BACKGROUND_OPTIONS, THEME_PRESETS, SKIN_OPTIONS,
 *          registerCustomThemes, getAllThemes, resolveTheme, applyProjectTheme,
 *          normalizeThemeMode, normalizeSkinId, normalizeFontId, normalizeBackgroundId
 * @see src/lib/types.ts
 * @see src/styles/globals.css
 */

import type {
  BackgroundId,
  FontId,
  KandownTheme,
  SkinId,
  ThemeAppearance,
  ThemeMode,
  ThemeTokens,
  TokenName,
} from './types';

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

/** 📖 8 Curated Presets from FABLE_UI spec */
export const THEME_PRESETS: KandownTheme[] = [
  {
    id: 'vercel',
    name: 'Vercel',
    author: 'Geist Design',
    description: 'Radical monochrome contrast, Geist tight typography, zero shadows, sharp 1px borders.',
    appearance: {
      radius: '6px',
      borderWidth: '1px',
      shadows: 'none',
      density: 'compact',
      glass: false,
      motion: 'subtle',
    },
    fonts: {
      sans: "'Inter Tight', 'Inter var', Inter, sans-serif",
      display: "'Inter Tight', 'Inter var', Inter, sans-serif",
      mono: "'SF Mono', Menlo, monospace",
    },
    light: {
      ...sharedLight,
      'background': '0 0% 100%',
      'foreground': '0 0% 9%',
      'card': '0 0% 100%',
      'card-foreground': '0 0% 9%',
      'popover': '0 0% 100%',
      'popover-foreground': '0 0% 9%',
      'primary': '0 0% 9%',
      'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 96%',
      'secondary-foreground': '0 0% 12%',
      'muted': '0 0% 95%',
      'muted-foreground': '0 0% 40%',
      'accent': '0 0% 93%',
      'accent-foreground': '0 0% 9%',
      'border': '0 0% 91%',
      'border-strong': '0 0% 84%',
      'border-focus': '0 0% 50%',
      'input': '0 0% 90%',
      'ring': '0 0% 9%',
      'glass': '0 0% 100% / 0.85',
      'glass-border': '0 0% 88% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 0%',
      'foreground': '0 0% 98%',
      'card': '0 0% 4%',
      'card-foreground': '0 0% 98%',
      'popover': '0 0% 4%',
      'popover-foreground': '0 0% 98%',
      'primary': '0 0% 98%',
      'primary-foreground': '0 0% 0%',
      'secondary': '0 0% 8%',
      'secondary-foreground': '0 0% 98%',
      'muted': '0 0% 9%',
      'muted-foreground': '0 0% 56%',
      'accent': '0 0% 12%',
      'accent-foreground': '0 0% 98%',
      'border': '0 0% 12%',
      'border-strong': '0 0% 18%',
      'border-focus': '0 0% 35%',
      'input': '0 0% 12%',
      'ring': '0 0% 98%',
      'glass': '0 0% 4% / 0.85',
      'glass-border': '0 0% 16% / 0.9',
    },
  },
  {
    id: 'linear',
    name: 'Linear',
    author: 'Linear Team',
    description: 'Dark-first aesthetic, Plus Jakarta Sans font, electric violet accent (#5E6AD2), sleek elevated popovers.',
    appearance: {
      radius: '8px',
      borderWidth: '1px',
      shadows: 'soft',
      density: 'comfortable',
      glass: true,
      motion: 'subtle',
    },
    fonts: {
      sans: "'Plus Jakarta Sans', Outfit, sans-serif",
      display: "'Plus Jakarta Sans', Outfit, sans-serif",
      mono: "'SF Mono', Menlo, Consolas, monospace",
    },
    light: {
      ...sharedLight,
      'background': '220 20% 98%',
      'foreground': '224 24% 12%',
      'card': '0 0% 100%',
      'card-foreground': '224 24% 12%',
      'popover': '0 0% 100%',
      'popover-foreground': '224 24% 12%',
      'primary': '235 59% 60%',
      'primary-foreground': '0 0% 100%',
      'secondary': '235 25% 95%',
      'secondary-foreground': '235 59% 30%',
      'muted': '220 16% 94%',
      'muted-foreground': '220 12% 42%',
      'accent': '235 45% 92%',
      'accent-foreground': '235 59% 35%',
      'border': '220 15% 88%',
      'border-strong': '220 15% 80%',
      'border-focus': '235 59% 60%',
      'input': '220 15% 90%',
      'ring': '235 59% 60%',
      'glass': '0 0% 100% / 0.8',
      'glass-border': '220 15% 86% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '210 11% 4%',
      'foreground': '210 14% 94%',
      'card': '216 7% 8%',
      'card-foreground': '210 14% 94%',
      'popover': '216 7% 8%',
      'popover-foreground': '210 14% 94%',
      'primary': '235 59% 60%',
      'primary-foreground': '0 0% 100%',
      'secondary': '218 9% 13%',
      'secondary-foreground': '210 14% 94%',
      'muted': '218 9% 11%',
      'muted-foreground': '215 8% 58%',
      'accent': '235 30% 15%',
      'accent-foreground': '210 14% 94%',
      'border': '225 9% 14%',
      'border-strong': '225 9% 20%',
      'border-focus': '235 59% 60%',
      'input': '225 9% 14%',
      'ring': '235 59% 60%',
      'glass': '216 7% 8% / 0.78',
      'glass-border': '225 9% 18% / 0.85',
    },
  },
  {
    id: 'claude',
    name: 'Claude',
    author: 'Anthropic',
    description: 'Editorial warmth, Newsreader serif headings, oat crème light background, terracotta accents.',
    appearance: {
      radius: '12px',
      borderWidth: '1px',
      shadows: 'soft',
      density: 'comfortable',
      glass: false,
      motion: 'subtle',
    },
    fonts: {
      sans: "'Inter var', Inter, sans-serif",
      display: "'Newsreader', Charter, Georgia, serif",
      mono: "'SF Mono', Menlo, monospace",
    },
    light: {
      ...sharedLight,
      'background': '38 33% 94%',
      'foreground': '20 12% 12%',
      'card': '38 40% 98%',
      'card-foreground': '20 12% 12%',
      'popover': '38 40% 98%',
      'popover-foreground': '20 12% 12%',
      'primary': '15 62% 60%',
      'primary-foreground': '0 0% 100%',
      'secondary': '38 25% 88%',
      'secondary-foreground': '20 12% 15%',
      'muted': '38 20% 89%',
      'muted-foreground': '20 8% 42%',
      'accent': '15 45% 90%',
      'accent-foreground': '15 62% 35%',
      'border': '38 18% 84%',
      'border-strong': '38 18% 76%',
      'border-focus': '15 62% 60%',
      'input': '38 18% 86%',
      'ring': '15 62% 60%',
      'glass': '38 40% 98% / 0.85',
      'glass-border': '38 18% 82% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '20 8% 7%',
      'foreground': '38 20% 92%',
      'card': '20 8% 12%',
      'card-foreground': '38 20% 92%',
      'popover': '20 8% 12%',
      'popover-foreground': '38 20% 92%',
      'primary': '15 62% 60%',
      'primary-foreground': '0 0% 100%',
      'secondary': '20 8% 16%',
      'secondary-foreground': '38 20% 92%',
      'muted': '20 8% 14%',
      'muted-foreground': '38 10% 60%',
      'accent': '15 30% 18%',
      'accent-foreground': '38 20% 92%',
      'border': '20 8% 18%',
      'border-strong': '20 8% 25%',
      'border-focus': '15 62% 60%',
      'input': '20 8% 18%',
      'ring': '15 62% 60%',
      'glass': '20 8% 12% / 0.8',
      'glass-border': '20 8% 22% / 0.85',
    },
  },
  {
    id: 'apple',
    name: 'Apple',
    author: 'Human Interface',
    description: 'Translucent materials, vibrant blur, SF Pro Display typography, 14px squircles.',
    appearance: {
      radius: '14px',
      borderWidth: '1px',
      shadows: 'elevated',
      density: 'relaxed',
      glass: true,
      motion: 'playful',
    },
    fonts: {
      sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
      display: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      mono: "'SF Mono', Menlo, Monaco, monospace",
    },
    light: {
      ...sharedLight,
      'background': '240 6% 97%',
      'foreground': '240 6% 10%',
      'card': '0 0% 100%',
      'card-foreground': '240 6% 10%',
      'popover': '0 0% 100%',
      'popover-foreground': '240 6% 10%',
      'primary': '211 100% 52%',
      'primary-foreground': '0 0% 100%',
      'secondary': '240 6% 92%',
      'secondary-foreground': '240 6% 12%',
      'muted': '240 5% 92%',
      'muted-foreground': '240 4% 45%',
      'accent': '211 90% 94%',
      'accent-foreground': '211 100% 40%',
      'border': '240 6% 88%',
      'border-strong': '240 6% 80%',
      'border-focus': '211 100% 52%',
      'input': '240 6% 90%',
      'ring': '211 100% 52%',
      'glass': '0 0% 100% / 0.72',
      'glass-border': '240 6% 86% / 0.8',
    },
    dark: {
      ...sharedDark,
      'background': '240 4% 6%',
      'foreground': '240 4% 96%',
      'card': '240 4% 11%',
      'card-foreground': '240 4% 96%',
      'popover': '240 4% 11%',
      'popover-foreground': '240 4% 96%',
      'primary': '211 100% 52%',
      'primary-foreground': '0 0% 100%',
      'secondary': '240 4% 16%',
      'secondary-foreground': '240 4% 96%',
      'muted': '240 4% 14%',
      'muted-foreground': '240 4% 62%',
      'accent': '211 50% 18%',
      'accent-foreground': '240 4% 96%',
      'border': '240 4% 18%',
      'border-strong': '240 4% 26%',
      'border-focus': '211 100% 52%',
      'input': '240 4% 18%',
      'ring': '211 100% 52%',
      'glass': '240 4% 11% / 0.68',
      'glass-border': '240 4% 22% / 0.8',
    },
  },
  {
    id: 'stripe',
    name: 'Stripe',
    author: 'Stripe Design',
    description: 'Syne & Space Grotesk display, indigo night dark mode (#0A0A23), blurple accents (#635BFF).',
    appearance: {
      radius: '8px',
      borderWidth: '1px',
      shadows: 'elevated',
      density: 'comfortable',
      glass: true,
      motion: 'subtle',
    },
    fonts: {
      sans: "'Space Grotesk', sans-serif",
      display: "'Syne', 'Space Grotesk', sans-serif",
      mono: "'SF Mono', Menlo, monospace",
    },
    light: {
      ...sharedLight,
      'background': '214 45% 98%',
      'foreground': '222 47% 11%',
      'card': '0 0% 100%',
      'card-foreground': '222 47% 11%',
      'popover': '0 0% 100%',
      'popover-foreground': '222 47% 11%',
      'primary': '243 100% 68%',
      'primary-foreground': '0 0% 100%',
      'secondary': '214 32% 93%',
      'secondary-foreground': '243 50% 30%',
      'muted': '214 25% 93%',
      'muted-foreground': '215 16% 45%',
      'accent': '243 60% 94%',
      'accent-foreground': '243 100% 45%',
      'border': '214 25% 88%',
      'border-strong': '214 25% 80%',
      'border-focus': '243 100% 68%',
      'input': '214 25% 90%',
      'ring': '243 100% 68%',
      'glass': '0 0% 100% / 0.8',
      'glass-border': '214 25% 86% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '240 56% 9%',
      'foreground': '225 60% 96%',
      'card': '240 45% 15%',
      'card-foreground': '225 60% 96%',
      'popover': '240 45% 15%',
      'popover-foreground': '225 60% 96%',
      'primary': '243 100% 68%',
      'primary-foreground': '0 0% 100%',
      'secondary': '240 35% 20%',
      'secondary-foreground': '225 60% 96%',
      'muted': '240 35% 18%',
      'muted-foreground': '230 25% 65%',
      'accent': '243 40% 25%',
      'accent-foreground': '225 60% 96%',
      'border': '240 35% 22%',
      'border-strong': '240 35% 30%',
      'border-focus': '243 100% 68%',
      'input': '240 35% 22%',
      'ring': '243 100% 68%',
      'glass': '240 45% 15% / 0.75',
      'glass-border': '240 35% 26% / 0.85',
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    author: 'Notion-inspired',
    description: 'Calm studio workspace, Newsreader serif, warm gray background, pastel subtle accents, flat cards.',
    appearance: {
      radius: '4px',
      borderWidth: '1px',
      shadows: 'none',
      density: 'compact',
      glass: false,
      motion: 'none',
    },
    fonts: {
      sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      display: "'Newsreader', Georgia, serif",
      mono: "'SF Mono', Menlo, monospace",
    },
    light: {
      ...sharedLight,
      'background': '40 20% 96%',
      'foreground': '30 6% 18%',
      'card': '0 0% 100%',
      'card-foreground': '30 6% 18%',
      'popover': '0 0% 100%',
      'popover-foreground': '30 6% 18%',
      'primary': '30 6% 18%',
      'primary-foreground': '0 0% 100%',
      'secondary': '40 15% 90%',
      'secondary-foreground': '30 6% 20%',
      'muted': '40 12% 91%',
      'muted-foreground': '30 4% 45%',
      'accent': '40 20% 88%',
      'accent-foreground': '30 6% 18%',
      'border': '40 10% 84%',
      'border-strong': '40 10% 76%',
      'border-focus': '30 6% 35%',
      'input': '40 10% 86%',
      'ring': '30 6% 35%',
      'glass': '0 0% 100% / 0.85',
      'glass-border': '40 10% 82% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 10%',
      'foreground': '40 10% 90%',
      'card': '0 0% 14%',
      'card-foreground': '40 10% 90%',
      'popover': '0 0% 14%',
      'popover-foreground': '40 10% 90%',
      'primary': '40 10% 90%',
      'primary-foreground': '0 0% 10%',
      'secondary': '0 0% 18%',
      'secondary-foreground': '40 10% 90%',
      'muted': '0 0% 16%',
      'muted-foreground': '0 0% 55%',
      'accent': '0 0% 20%',
      'accent-foreground': '40 10% 90%',
      'border': '0 0% 20%',
      'border-strong': '0 0% 26%',
      'border-focus': '0 0% 45%',
      'input': '0 0% 20%',
      'ring': '0 0% 70%',
      'glass': '0 0% 14% / 0.85',
      'glass-border': '0 0% 22% / 0.9',
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    author: 'Catppuccin Org',
    description: 'JetBrains Mono & Fira Code typography, Mocha dark palette (#1E1E2E, mauve #CBA6F7), Latte light.',
    appearance: {
      radius: '10px',
      borderWidth: '1px',
      shadows: 'soft',
      density: 'comfortable',
      glass: true,
      motion: 'subtle',
    },
    fonts: {
      sans: "'JetBrains Mono', 'Fira Code', monospace",
      display: "'JetBrains Mono', 'Fira Code', monospace",
      mono: "'JetBrains Mono', 'Fira Code', monospace",
    },
    light: {
      ...sharedLight,
      'background': '220 23% 95%',
      'foreground': '234 16% 35%',
      'card': '0 0% 100%',
      'card-foreground': '234 16% 35%',
      'popover': '0 0% 100%',
      'popover-foreground': '234 16% 35%',
      'primary': '266 85% 58%',
      'primary-foreground': '0 0% 100%',
      'secondary': '220 18% 90%',
      'secondary-foreground': '266 85% 40%',
      'muted': '220 16% 88%',
      'muted-foreground': '233 10% 52%',
      'accent': '266 50% 90%',
      'accent-foreground': '266 85% 40%',
      'border': '220 14% 82%',
      'border-strong': '220 14% 75%',
      'border-focus': '266 85% 58%',
      'input': '220 14% 84%',
      'ring': '266 85% 58%',
      'glass': '0 0% 100% / 0.8',
      'glass-border': '220 14% 80% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '240 21% 15%',
      'foreground': '226 64% 88%',
      'card': '240 21% 19%',
      'card-foreground': '226 64% 88%',
      'popover': '240 21% 19%',
      'popover-foreground': '226 64% 88%',
      'primary': '267 84% 81%',
      'primary-foreground': '240 21% 15%',
      'secondary': '240 21% 23%',
      'secondary-foreground': '226 64% 88%',
      'muted': '240 21% 21%',
      'muted-foreground': '228 17% 68%',
      'accent': '267 40% 28%',
      'accent-foreground': '226 64% 88%',
      'border': '240 21% 26%',
      'border-strong': '240 21% 34%',
      'border-focus': '267 84% 81%',
      'input': '240 21% 26%',
      'ring': '267 84% 81%',
      'glass': '240 21% 19% / 0.78',
      'glass-border': '240 21% 28% / 0.85',
    },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    author: 'Retro CRT',
    description: 'VT323 retro CRT mono font, pitch black (#0C0C0C), phosphor neon green text (#33FF66), 0px radius.',
    appearance: {
      radius: '0px',
      borderWidth: '1px',
      shadows: 'none',
      density: 'compact',
      glass: false,
      motion: 'none',
    },
    fonts: {
      sans: "'VT323', 'SF Mono', monospace",
      display: "'VT323', 'SF Mono', monospace",
      mono: "'VT323', 'SF Mono', monospace",
    },
    light: {
      ...sharedLight,
      'background': '135 30% 96%',
      'foreground': '135 100% 20%',
      'card': '0 0% 100%',
      'card-foreground': '135 100% 20%',
      'popover': '0 0% 100%',
      'popover-foreground': '135 100% 20%',
      'primary': '135 100% 25%',
      'primary-foreground': '0 0% 100%',
      'secondary': '135 25% 88%',
      'secondary-foreground': '135 100% 20%',
      'muted': '135 20% 89%',
      'muted-foreground': '135 40% 35%',
      'accent': '135 35% 85%',
      'accent-foreground': '135 100% 20%',
      'border': '135 30% 80%',
      'border-strong': '135 30% 70%',
      'border-focus': '135 100% 30%',
      'input': '135 30% 82%',
      'ring': '135 100% 25%',
      'glass': '0 0% 100% / 0.9',
      'glass-border': '135 30% 78% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 5%',
      'foreground': '135 100% 60%',
      'card': '0 0% 8%',
      'card-foreground': '135 100% 60%',
      'popover': '0 0% 8%',
      'popover-foreground': '135 100% 60%',
      'primary': '135 100% 60%',
      'primary-foreground': '0 0% 5%',
      'secondary': '0 0% 12%',
      'secondary-foreground': '135 100% 60%',
      'muted': '0 0% 10%',
      'muted-foreground': '135 60% 45%',
      'accent': '135 40% 12%',
      'accent-foreground': '135 100% 60%',
      'border': '135 40% 18%',
      'border-strong': '135 40% 26%',
      'border-focus': '135 100% 60%',
      'input': '135 40% 18%',
      'ring': '135 100% 60%',
      'glass': '0 0% 8% / 0.85',
      'glass-border': '135 40% 22% / 0.9',
    },
  },
];

/** 📖 Legacy SkinId mapping for backwards compatibility with older kandown.json configs */
const LEGACY_SKIN_MAP: Record<string, string> = {
  kandown: 'vercel',
  graphite: 'paper',
  sage: 'claude',
  cobalt: 'linear',
  rose: 'catppuccin',
};

export interface LegacySkinOption {
  id: SkinId;
  label: string;
  description: string;
  light: ThemeTokens;
  dark: ThemeTokens;
}

export const SKIN_OPTIONS: LegacySkinOption[] = THEME_PRESETS.map(t => ({
  id: t.id,
  label: t.name,
  description: t.description ?? '',
  light: t.light,
  dark: t.dark,
}));

let customThemesRegistry: KandownTheme[] = [];

export function registerCustomThemes(themes?: KandownTheme[]): void {
  if (Array.isArray(themes)) {
    customThemesRegistry = themes;
  }
}

export function getAllThemes(): KandownTheme[] {
  return [...THEME_PRESETS, ...customThemesRegistry];
}

export function resolveTheme(skinId: string): KandownTheme {
  const all = getAllThemes();
  const targetId = LEGACY_SKIN_MAP[skinId] ?? skinId;
  let found = all.find(t => t.id === targetId);

  if (!found) {
    found = THEME_PRESETS[0];
  }

  if (found.base) {
    const parent = all.find(t => t.id === found.base) ?? THEME_PRESETS[0];
    return {
      ...parent,
      ...found,
      appearance: { ...parent.appearance, ...found.appearance },
      fonts: { ...parent.fonts, ...found.fonts },
      light: { ...parent.light, ...found.light },
      dark: { ...parent.dark, ...found.dark },
      columnAccents: { ...parent.columnAccents, ...found.columnAccents },
    };
  }

  return found;
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

export function normalizeSkinId(value: unknown): SkinId {
  if (typeof value !== 'string') return 'vercel';
  const all = getAllThemes();
  const target = LEGACY_SKIN_MAP[value] ?? value;
  return all.some(t => t.id === target) ? target : 'vercel';
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

function getShadowValue(level: ThemeAppearance['shadows'], type: 'card' | 'popover' | 'drawer'): string {
  if (level === 'none') {
    return type === 'popover' ? '0 2px 8px rgb(0 0 0 / 0.2)' : 'none';
  }
  if (level === 'soft') {
    if (type === 'card') return '0 1px 3px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.04)';
    if (type === 'popover') return '0 4px 16px rgb(0 0 0 / 0.12)';
    return '0 8px 32px rgb(0 0 0 / 0.15)';
  }
  if (level === 'elevated') {
    if (type === 'card') return '0 4px 12px rgb(0 0 0 / 0.08)';
    if (type === 'popover') return '0 12px 32px rgb(0 0 0 / 0.18)';
    return '0 16px 48px rgb(0 0 0 / 0.25)';
  }
  // dramatic
  if (type === 'card') return '0 8px 24px rgb(0 0 0 / 0.15)';
  if (type === 'popover') return '0 20px 48px rgb(0 0 0 / 0.3)';
  return '0 24px 64px rgb(0 0 0 / 0.35)';
}

export function applyProjectTheme(
  theme: ThemeMode,
  skinId: SkinId,
  fontId: FontId,
  backgroundId: BackgroundId = 'solid'
): void {
  const root = document.documentElement;
  const resolvedMode = resolveMode(theme);
  const activeTheme = resolveTheme(skinId);
  const font = FONT_OPTIONS.find(item => item.id === fontId) ?? FONT_OPTIONS[0];
  const tokens = activeTheme[resolvedMode];
  const appearance = activeTheme.appearance;

  root.classList.toggle('dark', resolvedMode === 'dark');
  root.dataset.theme = theme;
  root.dataset.resolvedTheme = resolvedMode;
  root.dataset.skin = activeTheme.id;
  root.dataset.font = font.id;
  root.dataset.background = backgroundId;
  root.dataset.density = appearance.density;
  root.dataset.motion = appearance.motion;
  root.dataset.glass = appearance.glass ? 'true' : 'false';
  root.style.setProperty('color-scheme', resolvedMode);

  // Fonts
  const sansFont = activeTheme.fonts?.sans ?? font.stack;
  const displayFont = activeTheme.fonts?.display && activeTheme.fonts.display !== 'same'
    ? activeTheme.fonts.display
    : sansFont;
  const monoFont = activeTheme.fonts?.mono ?? "'SF Mono', Menlo, Monaco, Consolas, monospace";

  root.style.setProperty('--font-sans', sansFont);
  root.style.setProperty('--font-display', displayFont);
  root.style.setProperty('--font-mono', monoFont);

  // Appearance Tokens
  const radius = appearance.radius || '6px';
  root.style.setProperty('--radius', radius);
  root.style.setProperty('--radius-sm', `calc(${radius} * 0.67)`);
  root.style.setProperty('--radius-lg', `calc(${radius} * 1.5)`);
  root.style.setProperty('--border-width', appearance.borderWidth ?? '1px');

  root.style.setProperty('--shadow-card', getShadowValue(appearance.shadows, 'card'));
  root.style.setProperty('--shadow-popover', getShadowValue(appearance.shadows, 'popover'));
  root.style.setProperty('--shadow-drawer', getShadowValue(appearance.shadows, 'drawer'));

  root.style.setProperty('--motion-scale', appearance.motion === 'none' ? '0' : appearance.motion === 'playful' ? '1.2' : '1');
  root.style.setProperty('--card-blur', appearance.glass ? 'blur(20px) saturate(180%)' : 'none');

  // HSL Color Tokens
  for (const [name, value] of Object.entries(tokens) as Array<[TokenName, string]>) {
    root.style.setProperty(`--${name}`, value);
  }
}
