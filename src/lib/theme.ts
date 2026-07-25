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
    // 📖 The house theme, and the default one: it is THEME_PRESETS[0], so it is also
    // what resolveTheme()/normalizeSkinId() fall back to for an unknown skin id.
    // Colors come straight from the brand palette used on the website:
    //   #88E138 brand lime (logo arrow, primary actions) — dark mode primary
    //   #7AD12A contrast-adjusted lime for light backgrounds — light mode primary
    //   #0CE931 hero/WebGL shader green — reused as the `success` token
    //   #F1FFB8 pale lime (accent surfaces) · #EBEBEB neutral border grey
    // Lime is far too bright to carry white text, so `primary-foreground` is a
    // near-black green in both modes instead of the usual white.
    id: 'kandown',
    name: 'Kandown',
    author: 'Kandown',
    description: 'The house theme: brand lime (#88E138) on near-neutral surfaces, pale lime accents, 4px radius.',
    appearance: {
      radius: '4px',
      borderWidth: '1px',
      shadows: 'soft',
      density: 'comfortable',
      glass: true,
      motion: 'subtle',
    },
    fonts: {
      sans: "'Inter var', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: "'Inter Tight', 'Inter var', Inter, sans-serif",
      mono: "'SF Mono', Menlo, Monaco, Consolas, monospace",
    },
    light: {
      ...sharedLight,
      'background': '80 40% 99%',
      'foreground': '120 10% 10%',
      'card': '0 0% 100%',
      'card-foreground': '120 10% 10%',
      'popover': '0 0% 100%',
      'popover-foreground': '120 10% 10%',
      'primary': '91 67% 47%',
      'primary-foreground': '96 55% 9%',
      'secondary': '75 45% 94%',
      'secondary-foreground': '96 40% 18%',
      'muted': '75 12% 95%',
      'muted-foreground': '120 5% 40%',
      'accent': '72 100% 90%',
      'accent-foreground': '96 50% 18%',
      'border': '0 0% 92%',
      'border-strong': '0 0% 85%',
      'border-focus': '91 67% 47%',
      'input': '0 0% 90%',
      'ring': '91 67% 47%',
      // 📖 The shader green (#0CE931) darkened: `success` is rendered as *text*
      // (text-success), so it needs 4.5:1 on the light background — 4.57:1 here.
      'success': '130 90% 28%',
      'grid': '92 40% 20% / 0.05',
      'grid-strong': '92 40% 20% / 0.09',
      'glass': '0 0% 100% / 0.78',
      'glass-border': '75 30% 88% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '120 8% 7%',
      'foreground': '80 15% 93%',
      'card': '120 7% 10%',
      'card-foreground': '80 15% 93%',
      'popover': '120 7% 11%',
      'popover-foreground': '80 15% 93%',
      'primary': '92 74% 55%',
      'primary-foreground': '120 30% 7%',
      'secondary': '120 6% 16%',
      'secondary-foreground': '80 15% 93%',
      'muted': '120 6% 14%',
      'muted-foreground': '90 6% 60%',
      'accent': '92 30% 18%',
      'accent-foreground': '92 74% 70%',
      'border': '120 6% 18%',
      'border-strong': '120 6% 26%',
      'border-focus': '92 74% 55%',
      'input': '120 6% 18%',
      'ring': '92 74% 55%',
      'success': '130 90% 48%',
      'grid': '92 60% 60% / 0.03',
      'grid-strong': '92 60% 60% / 0.06',
      'glass': '120 7% 10% / 0.78',
      'glass-border': '92 20% 24% / 0.8',
    },
  },
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
  {
    id: 'github',
    name: 'GitHub Primer',
    author: 'GitHub',
    description: 'Classic GitHub Primer design system (#0D1117), crisp borders, official Octicon blue accent.',
    appearance: { radius: '6px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: false, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'DM Sans', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 100%', 'foreground': '215 28% 17%', 'card': '0 0% 100%', 'card-foreground': '215 28% 17%',
      'popover': '0 0% 100%', 'popover-foreground': '215 28% 17%', 'primary': '212 92% 45%', 'primary-foreground': '0 0% 100%',
      'secondary': '210 24% 96%', 'secondary-foreground': '215 28% 17%', 'muted': '210 24% 96%', 'muted-foreground': '215 14% 46%',
      'accent': '212 92% 95%', 'accent-foreground': '212 92% 35%', 'border': '214 20% 88%', 'border-strong': '214 20% 78%',
      'border-focus': '212 92% 45%', 'input': '214 20% 88%', 'ring': '212 92% 45%', 'glass': '0 0% 100% / 0.85', 'glass-border': '214 20% 85% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '217 33% 7%', 'foreground': '210 17% 82%', 'card': '216 28% 12%', 'card-foreground': '210 17% 82%',
      'popover': '216 28% 12%', 'popover-foreground': '210 17% 82%', 'primary': '213 94% 68%', 'primary-foreground': '217 33% 7%',
      'secondary': '217 19% 18%', 'secondary-foreground': '210 17% 82%', 'muted': '217 19% 15%', 'muted-foreground': '215 14% 60%',
      'accent': '213 94% 20%', 'accent-foreground': '210 17% 82%', 'border': '215 18% 22%', 'border-strong': '215 18% 30%',
      'border-focus': '213 94% 68%', 'input': '215 18% 22%', 'ring': '213 94% 68%', 'glass': '216 28% 12% / 0.85', 'glass-border': '215 18% 25% / 0.9',
    },
  },
  {
    id: 'nordic',
    name: 'Nordic Polar',
    author: 'Arctic Ice',
    description: 'Official Nord color palette: polar night slate (#2E3440) and frost turquoise (#88C0D0).',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Plus Jakarta Sans', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '218 27% 94%', 'foreground': '220 16% 22%', 'card': '0 0% 100%', 'card-foreground': '220 16% 22%',
      'popover': '0 0% 100%', 'popover-foreground': '220 16% 22%', 'primary': '213 32% 52%', 'primary-foreground': '0 0% 100%',
      'secondary': '218 27% 88%', 'secondary-foreground': '220 16% 22%', 'muted': '218 20% 88%', 'muted-foreground': '220 10% 45%',
      'accent': '193 43% 85%', 'accent-foreground': '193 43% 30%', 'border': '218 20% 82%', 'border-strong': '218 20% 74%',
      'border-focus': '213 32% 52%', 'input': '218 20% 84%', 'ring': '213 32% 52%', 'glass': '0 0% 100% / 0.85', 'glass-border': '218 20% 80% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '220 16% 22%', 'foreground': '218 27% 92%', 'card': '220 17% 26%', 'card-foreground': '218 27% 92%',
      'popover': '220 17% 26%', 'popover-foreground': '218 27% 92%', 'primary': '193 43% 67%', 'primary-foreground': '220 16% 22%',
      'secondary': '220 16% 32%', 'secondary-foreground': '218 27% 92%', 'muted': '220 16% 30%', 'muted-foreground': '218 15% 68%',
      'accent': '193 30% 28%', 'accent-foreground': '218 27% 92%', 'border': '220 16% 34%', 'border-strong': '220 16% 42%',
      'border-focus': '193 43% 67%', 'input': '220 16% 34%', 'ring': '193 43% 67%', 'glass': '220 17% 26% / 0.8', 'glass-border': '220 16% 36% / 0.85',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula Pro',
    author: 'Zeno Rocha',
    description: 'Vampiric dark theme: Gothic purple (#282A36), neon pink (#FF79C6) and cyan accents.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'Fira Code', monospace", display: "'Fira Code', monospace", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '250 20% 97%', 'foreground': '231 15% 18%', 'card': '0 0% 100%', 'card-foreground': '231 15% 18%',
      'popover': '0 0% 100%', 'popover-foreground': '231 15% 18%', 'primary': '326 100% 74%', 'primary-foreground': '0 0% 100%',
      'secondary': '250 20% 92%', 'secondary-foreground': '231 15% 18%', 'muted': '250 15% 92%', 'muted-foreground': '231 10% 45%',
      'accent': '326 60% 92%', 'accent-foreground': '326 100% 35%', 'border': '250 15% 85%', 'border-strong': '250 15% 76%',
      'border-focus': '326 100% 74%', 'input': '250 15% 86%', 'ring': '326 100% 74%', 'glass': '0 0% 100% / 0.85', 'glass-border': '250 15% 82% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '231 15% 18%', 'foreground': '60 30% 96%', 'card': '232 14% 24%', 'card-foreground': '60 30% 96%',
      'popover': '232 14% 24%', 'popover-foreground': '60 30% 96%', 'primary': '326 100% 74%', 'primary-foreground': '231 15% 18%',
      'secondary': '232 14% 30%', 'secondary-foreground': '60 30% 96%', 'muted': '232 14% 27%', 'muted-foreground': '225 27% 68%',
      'accent': '265 89% 30%', 'accent-foreground': '60 30% 96%', 'border': '232 14% 34%', 'border-strong': '232 14% 42%',
      'border-focus': '326 100% 74%', 'input': '232 14% 34%', 'ring': '326 100% 74%', 'glass': '232 14% 24% / 0.8', 'glass-border': '232 14% 36% / 0.85',
    },
  },
  {
    id: 'arc',
    name: 'Arc Prism',
    author: 'The Browser Company',
    description: 'Translucent glassmorphism, iridescent gradient hues, soft 16px squircle radius.',
    appearance: { radius: '16px', borderWidth: '1px', shadows: 'elevated', density: 'relaxed', glass: true, motion: 'playful' },
    fonts: { sans: "'Sora', sans-serif", display: "'Sora', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '260 40% 98%', 'foreground': '260 25% 15%', 'card': '0 0% 100%', 'card-foreground': '260 25% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '260 25% 15%', 'primary': '258 90% 66%', 'primary-foreground': '0 0% 100%',
      'secondary': '260 30% 94%', 'secondary-foreground': '258 90% 40%', 'muted': '260 25% 93%', 'muted-foreground': '260 12% 45%',
      'accent': '258 80% 93%', 'accent-foreground': '258 90% 40%', 'border': '260 25% 88%', 'border-strong': '260 25% 80%',
      'border-focus': '258 90% 66%', 'input': '260 25% 90%', 'ring': '258 90% 66%', 'glass': '0 0% 100% / 0.75', 'glass-border': '260 25% 86% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '258 35% 9%', 'foreground': '258 40% 94%', 'card': '258 30% 14%', 'card-foreground': '258 40% 94%',
      'popover': '258 30% 14%', 'popover-foreground': '258 40% 94%', 'primary': '258 90% 75%', 'primary-foreground': '258 35% 9%',
      'secondary': '258 25% 20%', 'secondary-foreground': '258 40% 94%', 'muted': '258 25% 18%', 'muted-foreground': '258 20% 65%',
      'accent': '258 45% 26%', 'accent-foreground': '258 40% 94%', 'border': '258 25% 24%', 'border-strong': '258 25% 32%',
      'border-focus': '258 90% 75%', 'input': '258 25% 24%', 'ring': '258 90% 75%', 'glass': '258 30% 14% / 0.7', 'glass-border': '258 25% 28% / 0.8',
    },
  },
  {
    id: 'raycast',
    name: 'Raycast Crimson',
    author: 'Raycast',
    description: 'Ultra-dark command launcher (#111116), fiery crimson badge glow (#FF6363).',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'elevated', density: 'compact', glass: true, motion: 'subtle' },
    fonts: { sans: "'Inter Tight', sans-serif", display: "'Orbitron', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 98%', 'foreground': '0 0% 10%', 'card': '0 0% 100%', 'card-foreground': '0 0% 10%',
      'popover': '0 0% 100%', 'popover-foreground': '0 0% 10%', 'primary': '358 100% 62%', 'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 94%', 'secondary-foreground': '358 100% 40%', 'muted': '0 0% 93%', 'muted-foreground': '0 0% 45%',
      'accent': '358 80% 94%', 'accent-foreground': '358 100% 40%', 'border': '0 0% 88%', 'border-strong': '0 0% 80%',
      'border-focus': '358 100% 62%', 'input': '0 0% 90%', 'ring': '358 100% 62%', 'glass': '0 0% 100% / 0.85', 'glass-border': '0 0% 86% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '240 14% 7%', 'foreground': '0 0% 95%', 'card': '240 10% 11%', 'card-foreground': '0 0% 95%',
      'popover': '240 10% 11%', 'popover-foreground': '0 0% 95%', 'primary': '358 100% 69%', 'primary-foreground': '240 14% 7%',
      'secondary': '240 10% 16%', 'secondary-foreground': '0 0% 95%', 'muted': '240 10% 14%', 'muted-foreground': '240 8% 60%',
      'accent': '358 50% 20%', 'accent-foreground': '0 0% 95%', 'border': '240 10% 20%', 'border-strong': '240 10% 28%',
      'border-focus': '358 100% 69%', 'input': '240 10% 20%', 'ring': '358 100% 69%', 'glass': '240 10% 11% / 0.8', 'glass-border': '240 10% 22% / 0.85',
    },
  },
  {
    id: 'figma',
    name: 'Figma Studio',
    author: 'Figma',
    description: 'Vector canvas theme: slate black (#1E1E1E), hot coral (#F24E1E) & violet accents.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'Inter Tight', sans-serif", display: "'Plus Jakarta Sans', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 96%', 'foreground': '0 0% 12%', 'card': '0 0% 100%', 'card-foreground': '0 0% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '0 0% 12%', 'primary': '14 89% 53%', 'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 90%', 'secondary-foreground': '14 89% 40%', 'muted': '0 0% 91%', 'muted-foreground': '0 0% 45%',
      'accent': '14 80% 93%', 'accent-foreground': '14 89% 40%', 'border': '0 0% 86%', 'border-strong': '0 0% 78%',
      'border-focus': '14 89% 53%', 'input': '0 0% 88%', 'ring': '14 89% 53%', 'glass': '0 0% 100% / 0.85', 'glass-border': '0 0% 84% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 12%', 'foreground': '0 0% 96%', 'card': '0 0% 16%', 'card-foreground': '0 0% 96%',
      'popover': '0 0% 16%', 'popover-foreground': '0 0% 96%', 'primary': '266 100% 67%', 'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 22%', 'secondary-foreground': '0 0% 96%', 'muted': '0 0% 20%', 'muted-foreground': '0 0% 65%',
      'accent': '266 40% 28%', 'accent-foreground': '0 0% 96%', 'border': '0 0% 24%', 'border-strong': '0 0% 32%',
      'border-focus': '266 100% 67%', 'input': '0 0% 24%', 'ring': '266 100% 67%', 'glass': '0 0% 16% / 0.8', 'glass-border': '0 0% 28% / 0.85',
    },
  },
  {
    id: 'spotify',
    name: 'Spotify OLED',
    author: 'Spotify',
    description: 'Deep obsidian dark (#121212), high-contrast electric lime green (#1DB954).',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'none', density: 'comfortable', glass: false, motion: 'subtle' },
    fonts: { sans: "'Outfit', sans-serif", display: "'Outfit', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 98%', 'foreground': '0 0% 10%', 'card': '0 0% 100%', 'card-foreground': '0 0% 10%',
      'popover': '0 0% 100%', 'popover-foreground': '0 0% 10%', 'primary': '141 73% 42%', 'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 94%', 'secondary-foreground': '141 73% 30%', 'muted': '0 0% 93%', 'muted-foreground': '0 0% 45%',
      'accent': '141 50% 92%', 'accent-foreground': '141 73% 30%', 'border': '0 0% 88%', 'border-strong': '0 0% 80%',
      'border-focus': '141 73% 42%', 'input': '0 0% 90%', 'ring': '141 73% 42%', 'glass': '0 0% 100% / 0.85', 'glass-border': '0 0% 86% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 7%', 'foreground': '0 0% 96%', 'card': '0 0% 11%', 'card-foreground': '0 0% 96%',
      'popover': '0 0% 11%', 'popover-foreground': '0 0% 96%', 'primary': '141 73% 42%', 'primary-foreground': '0 0% 0%',
      'secondary': '0 0% 16%', 'secondary-foreground': '0 0% 96%', 'muted': '0 0% 14%', 'muted-foreground': '0 0% 60%',
      'accent': '141 40% 18%', 'accent-foreground': '0 0% 96%', 'border': '0 0% 18%', 'border-strong': '0 0% 26%',
      'border-focus': '141 73% 42%', 'input': '0 0% 18%', 'ring': '141 73% 42%', 'glass': '0 0% 11% / 0.85', 'glass-border': '0 0% 22% / 0.9',
    },
  },
  {
    id: 'supabase',
    name: 'Supabase Emerald',
    author: 'Supabase',
    description: 'Developer dark studio (#1C1C1C) with vibrant neon emerald green accents (#3ECF8E).',
    appearance: { radius: '6px', borderWidth: '1px', shadows: 'soft', density: 'compact', glass: true, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Outfit', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '210 40% 98%', 'foreground': '215 25% 12%', 'card': '0 0% 100%', 'card-foreground': '215 25% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '215 25% 12%', 'primary': '158 64% 52%', 'primary-foreground': '0 0% 100%',
      'secondary': '210 20% 94%', 'secondary-foreground': '158 64% 30%', 'muted': '210 15% 93%', 'muted-foreground': '215 12% 45%',
      'accent': '158 50% 92%', 'accent-foreground': '158 64% 30%', 'border': '210 15% 88%', 'border-strong': '210 15% 80%',
      'border-focus': '158 64% 52%', 'input': '210 15% 90%', 'ring': '158 64% 52%', 'glass': '0 0% 100% / 0.85', 'glass-border': '210 15% 86% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 11%', 'foreground': '0 0% 94%', 'card': '0 0% 15%', 'card-foreground': '0 0% 94%',
      'popover': '0 0% 15%', 'popover-foreground': '0 0% 94%', 'primary': '158 64% 52%', 'primary-foreground': '0 0% 5%',
      'secondary': '0 0% 20%', 'secondary-foreground': '0 0% 94%', 'muted': '0 0% 18%', 'muted-foreground': '0 0% 62%',
      'accent': '158 40% 20%', 'accent-foreground': '0 0% 94%', 'border': '0 0% 22%', 'border-strong': '0 0% 30%',
      'border-focus': '158 64% 52%', 'input': '0 0% 22%', 'ring': '158 64% 52%', 'glass': '0 0% 15% / 0.8', 'glass-border': '0 0% 26% / 0.85',
    },
  },
  {
    id: 'shadcn',
    name: 'Shadcn Neutral',
    author: 'shadcn/ui',
    description: 'Zinc minimalist aesthetic: pure black/white background, subtle slate neutral tones.',
    appearance: { radius: '6px', borderWidth: '1px', shadows: 'none', density: 'compact', glass: false, motion: 'subtle' },
    fonts: { sans: "'Inter Tight', sans-serif", display: "'Inter Tight', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 100%', 'foreground': '240 10% 4%', 'card': '0 0% 100%', 'card-foreground': '240 10% 4%',
      'popover': '0 0% 100%', 'popover-foreground': '240 10% 4%', 'primary': '240 5.9% 10%', 'primary-foreground': '0 0% 98%',
      'secondary': '240 4.8% 95.9%', 'secondary-foreground': '240 5.9% 10%', 'muted': '240 4.8% 95.9%', 'muted-foreground': '240 3.8% 46.1%',
      'accent': '240 4.8% 92%', 'accent-foreground': '240 5.9% 10%', 'border': '240 5.9% 90%', 'border-strong': '240 5.9% 80%',
      'border-focus': '240 5.9% 10%', 'input': '240 5.9% 90%', 'ring': '240 5.9% 10%', 'glass': '0 0% 100% / 0.85', 'glass-border': '240 5.9% 88% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '240 10% 3.9%', 'foreground': '0 0% 98%', 'card': '240 10% 6.5%', 'card-foreground': '0 0% 98%',
      'popover': '240 10% 6.5%', 'popover-foreground': '0 0% 98%', 'primary': '0 0% 98%', 'primary-foreground': '240 5.9% 10%',
      'secondary': '240 3.7% 15.9%', 'secondary-foreground': '0 0% 98%', 'muted': '240 3.7% 12%', 'muted-foreground': '240 5% 64.9%',
      'accent': '240 3.7% 18%', 'accent-foreground': '0 0% 98%', 'border': '240 3.7% 15.9%', 'border-strong': '240 3.7% 24%',
      'border-focus': '0 0% 98%', 'input': '240 3.7% 15.9%', 'ring': '240 4.9% 83.9%', 'glass': '240 10% 6.5% / 0.85', 'glass-border': '240 3.7% 20% / 0.9',
    },
  },
  {
    id: 'notion-dark',
    name: 'Notion Dark',
    author: 'Notion',
    description: 'Dark studio workspace, charcoal surface (#191919), pastel subtle tags.',
    appearance: { radius: '4px', borderWidth: '1px', shadows: 'none', density: 'compact', glass: false, motion: 'none' },
    fonts: { sans: "'Inter var', sans-serif", display: "'Newsreader', Georgia, serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '40 15% 97%', 'foreground': '30 6% 16%', 'card': '0 0% 100%', 'card-foreground': '30 6% 16%',
      'popover': '0 0% 100%', 'popover-foreground': '30 6% 16%', 'primary': '30 6% 16%', 'primary-foreground': '0 0% 100%',
      'secondary': '40 12% 91%', 'secondary-foreground': '30 6% 16%', 'muted': '40 10% 92%', 'muted-foreground': '30 4% 45%',
      'accent': '40 15% 88%', 'accent-foreground': '30 6% 16%', 'border': '40 8% 85%', 'border-strong': '40 8% 76%',
      'border-focus': '30 6% 30%', 'input': '40 8% 86%', 'ring': '30 6% 30%', 'glass': '0 0% 100% / 0.85', 'glass-border': '40 8% 82% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 10%', 'foreground': '0 0% 89%', 'card': '0 0% 14%', 'card-foreground': '0 0% 89%',
      'popover': '0 0% 14%', 'popover-foreground': '0 0% 89%', 'primary': '0 0% 89%', 'primary-foreground': '0 0% 10%',
      'secondary': '0 0% 18%', 'secondary-foreground': '0 0% 89%', 'muted': '0 0% 16%', 'muted-foreground': '0 0% 55%',
      'accent': '0 0% 20%', 'accent-foreground': '0 0% 89%', 'border': '0 0% 20%', 'border-strong': '0 0% 28%',
      'border-focus': '0 0% 70%', 'input': '0 0% 20%', 'ring': '0 0% 70%', 'glass': '0 0% 14% / 0.85', 'glass-border': '0 0% 22% / 0.9',
    },
  },
  {
    id: 'bamboo',
    name: 'Kyoto Bamboo',
    author: 'Nature Zen',
    description: 'Japanese tea garden: deep moss green, warm bamboo wood tones, serene calm.',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Playfair Display', serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '90 15% 95%', 'foreground': '155 25% 18%', 'card': '0 0% 100%', 'card-foreground': '155 25% 18%',
      'popover': '0 0% 100%', 'popover-foreground': '155 25% 18%', 'primary': '155 32% 35%', 'primary-foreground': '0 0% 100%',
      'secondary': '90 15% 88%', 'secondary-foreground': '155 25% 18%', 'muted': '90 12% 88%', 'muted-foreground': '155 12% 42%',
      'accent': '155 25% 88%', 'accent-foreground': '155 32% 25%', 'border': '90 12% 82%', 'border-strong': '90 12% 74%',
      'border-focus': '155 32% 35%', 'input': '90 12% 84%', 'ring': '155 32% 35%', 'glass': '0 0% 100% / 0.85', 'glass-border': '90 12% 80% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '155 21% 11%', 'foreground': '90 20% 90%', 'card': '155 20% 15%', 'card-foreground': '90 20% 90%',
      'popover': '155 20% 15%', 'popover-foreground': '90 20% 90%', 'primary': '155 30% 52%', 'primary-foreground': '155 21% 11%',
      'secondary': '155 18% 20%', 'secondary-foreground': '90 20% 90%', 'muted': '155 18% 18%', 'muted-foreground': '90 12% 62%',
      'accent': '155 25% 24%', 'accent-foreground': '90 20% 90%', 'border': '155 18% 22%', 'border-strong': '155 18% 30%',
      'border-focus': '155 30% 52%', 'input': '155 18% 22%', 'ring': '155 30% 52%', 'glass': '155 20% 15% / 0.8', 'glass-border': '155 18% 26% / 0.85',
    },
  },
  {
    id: 'sakura',
    name: 'Tokyo Sakura',
    author: 'Japanese Bloom',
    description: 'Cherry blossom petals: soft rose quartz (#FBF0F2), deep plum and crimson accents.',
    appearance: { radius: '12px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Outfit', sans-serif", display: "'Playfair Display', serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '345 50% 96%', 'foreground': '345 30% 15%', 'card': '0 0% 100%', 'card-foreground': '345 30% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '345 30% 15%', 'primary': '345 68% 60%', 'primary-foreground': '0 0% 100%',
      'secondary': '345 35% 90%', 'secondary-foreground': '345 68% 35%', 'muted': '345 25% 91%', 'muted-foreground': '345 12% 45%',
      'accent': '345 50% 90%', 'accent-foreground': '345 68% 35%', 'border': '345 25% 85%', 'border-strong': '345 25% 76%',
      'border-focus': '345 68% 60%', 'input': '345 25% 86%', 'ring': '345 68% 60%', 'glass': '0 0% 100% / 0.8', 'glass-border': '345 25% 82% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '345 22% 10%', 'foreground': '345 35% 92%', 'card': '345 20% 15%', 'card-foreground': '345 35% 92%',
      'popover': '345 20% 15%', 'popover-foreground': '345 35% 92%', 'primary': '345 100% 77%', 'primary-foreground': '345 22% 10%',
      'secondary': '345 18% 20%', 'secondary-foreground': '345 35% 92%', 'muted': '345 18% 18%', 'muted-foreground': '345 15% 65%',
      'accent': '345 35% 26%', 'accent-foreground': '345 35% 92%', 'border': '345 18% 24%', 'border-strong': '345 18% 32%',
      'border-focus': '345 100% 77%', 'input': '345 18% 24%', 'ring': '345 100% 77%', 'glass': '345 20% 15% / 0.78', 'glass-border': '345 18% 28% / 0.85',
    },
  },
  {
    id: 'sahara',
    name: 'Sahara Dune',
    author: 'Desert Sun',
    description: 'Warm desert sands: sunbaked terracotta (#E07A5F), golden ochre & warm dunes.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: false, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Newsreader', serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '44 48% 91%', 'foreground': '20 25% 15%', 'card': '44 55% 96%', 'card-foreground': '20 25% 15%',
      'popover': '44 55% 96%', 'popover-foreground': '20 25% 15%', 'primary': '14 68% 62%', 'primary-foreground': '0 0% 100%',
      'secondary': '44 30% 84%', 'secondary-foreground': '20 25% 15%', 'muted': '44 25% 85%', 'muted-foreground': '20 12% 42%',
      'accent': '14 45% 86%', 'accent-foreground': '14 68% 35%', 'border': '44 20% 80%', 'border-strong': '44 20% 70%',
      'border-focus': '14 68% 62%', 'input': '44 20% 82%', 'ring': '14 68% 62%', 'glass': '44 55% 96% / 0.85', 'glass-border': '44 20% 78% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '18 19% 10%', 'foreground': '40 30% 90%', 'card': '18 18% 14%', 'card-foreground': '40 30% 90%',
      'popover': '18 18% 14%', 'popover-foreground': '40 30% 90%', 'primary': '37 81% 63%', 'primary-foreground': '18 19% 10%',
      'secondary': '18 16% 18%', 'secondary-foreground': '40 30% 90%', 'muted': '18 16% 16%', 'muted-foreground': '40 15% 62%',
      'accent': '14 35% 22%', 'accent-foreground': '40 30% 90%', 'border': '18 16% 22%', 'border-strong': '18 16% 30%',
      'border-focus': '37 81% 63%', 'input': '18 16% 22%', 'ring': '37 81% 63%', 'glass': '18 18% 14% / 0.8', 'glass-border': '18 16% 26% / 0.85',
    },
  },
  {
    id: 'oceanic',
    name: 'Abyssal Ocean',
    author: 'Deep Sea',
    description: 'Deep ocean trenches (#0B132B), bioluminescent cyan (#48CAE4) & wave foam.',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Plus Jakarta Sans', sans-serif", display: "'Syne', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '190 70% 95%', 'foreground': '210 50% 12%', 'card': '0 0% 100%', 'card-foreground': '210 50% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '210 50% 12%', 'primary': '198 85% 45%', 'primary-foreground': '0 0% 100%',
      'secondary': '190 40% 90%', 'secondary-foreground': '198 85% 25%', 'muted': '190 30% 89%', 'muted-foreground': '210 20% 45%',
      'accent': '190 60% 88%', 'accent-foreground': '198 85% 25%', 'border': '190 30% 82%', 'border-strong': '190 30% 74%',
      'border-focus': '198 85% 45%', 'input': '190 30% 84%', 'ring': '198 85% 45%', 'glass': '0 0% 100% / 0.8', 'glass-border': '190 30% 80% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '223 60% 11%', 'foreground': '190 70% 92%', 'card': '223 50% 16%', 'card-foreground': '190 70% 92%',
      'popover': '223 50% 16%', 'popover-foreground': '190 70% 92%', 'primary': '189 74% 59%', 'primary-foreground': '223 60% 11%',
      'secondary': '223 40% 22%', 'secondary-foreground': '190 70% 92%', 'muted': '223 40% 20%', 'muted-foreground': '190 30% 65%',
      'accent': '189 50% 26%', 'accent-foreground': '190 70% 92%', 'border': '223 40% 25%', 'border-strong': '223 40% 34%',
      'border-focus': '189 74% 59%', 'input': '223 40% 25%', 'ring': '189 74% 59%', 'glass': '223 50% 16% / 0.75', 'glass-border': '223 40% 28% / 0.85',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora Borealis',
    author: 'Northern Lights',
    description: 'Lapland polar night sky (#0B0F19) with glowing emerald & violet atmospheric lights.',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Outfit', sans-serif", display: "'Outfit', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '170 50% 96%', 'foreground': '175 40% 12%', 'card': '0 0% 100%', 'card-foreground': '175 40% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '175 40% 12%', 'primary': '168 76% 36%', 'primary-foreground': '0 0% 100%',
      'secondary': '170 30% 90%', 'secondary-foreground': '168 76% 25%', 'muted': '170 20% 90%', 'muted-foreground': '175 15% 45%',
      'accent': '168 50% 88%', 'accent-foreground': '168 76% 25%', 'border': '170 20% 84%', 'border-strong': '170 20% 76%',
      'border-focus': '168 76% 36%', 'input': '170 20% 85%', 'ring': '168 76% 36%', 'glass': '0 0% 100% / 0.8', 'glass-border': '170 20% 82% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '222 38% 7%', 'foreground': '170 60% 94%', 'card': '222 30% 12%', 'card-foreground': '170 60% 94%',
      'popover': '222 30% 12%', 'popover-foreground': '170 60% 94%', 'primary': '172 100% 48%', 'primary-foreground': '222 38% 7%',
      'secondary': '222 25% 18%', 'secondary-foreground': '170 60% 94%', 'muted': '222 25% 15%', 'muted-foreground': '170 25% 65%',
      'accent': '172 50% 22%', 'accent-foreground': '170 60% 94%', 'border': '222 25% 20%', 'border-strong': '222 25% 28%',
      'border-focus': '172 100% 48%', 'input': '222 25% 20%', 'ring': '172 100% 48%', 'glass': '222 30% 12% / 0.75', 'glass-border': '222 25% 24% / 0.85',
    },
  },
  {
    id: 'volcanic',
    name: 'Volcanic Magma',
    author: 'Molten Rock',
    description: 'Obsidian volcanic ash (#121010) with glowing molten orange (#FF5722) lava.',
    appearance: { radius: '6px', borderWidth: '1px', shadows: 'elevated', density: 'compact', glass: true, motion: 'subtle' },
    fonts: { sans: "'Inter Tight', sans-serif", display: "'Orbitron', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '20 30% 96%', 'foreground': '15 30% 12%', 'card': '0 0% 100%', 'card-foreground': '15 30% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '15 30% 12%', 'primary': '14 86% 51%', 'primary-foreground': '0 0% 100%',
      'secondary': '20 20% 90%', 'secondary-foreground': '14 86% 35%', 'muted': '20 15% 91%', 'muted-foreground': '15 10% 45%',
      'accent': '14 60% 92%', 'accent-foreground': '14 86% 35%', 'border': '20 15% 85%', 'border-strong': '20 15% 76%',
      'border-focus': '14 86% 51%', 'input': '20 15% 86%', 'ring': '14 86% 51%', 'glass': '0 0% 100% / 0.85', 'glass-border': '20 15% 82% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 6% 7%', 'foreground': '15 30% 92%', 'card': '0 6% 11%', 'card-foreground': '15 30% 92%',
      'popover': '0 6% 11%', 'popover-foreground': '15 30% 92%', 'primary': '14 100% 57%', 'primary-foreground': '0 6% 7%',
      'secondary': '0 6% 16%', 'secondary-foreground': '15 30% 92%', 'muted': '0 6% 14%', 'muted-foreground': '15 12% 60%',
      'accent': '14 50% 20%', 'accent-foreground': '15 30% 92%', 'border': '0 6% 18%', 'border-strong': '0 6% 26%',
      'border-focus': '14 100% 57%', 'input': '0 6% 18%', 'ring': '14 100% 57%', 'glass': '0 6% 11% / 0.8', 'glass-border': '0 6% 22% / 0.85',
    },
  },
  {
    id: 'glacier',
    name: 'Icelandic Glacier',
    author: 'Polar Ice',
    description: 'Crystal ice cave: translucent icy aqua (#E0F7FA), deep navy frost & glass.',
    appearance: { radius: '12px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Sora', sans-serif", display: "'Sora', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '195 100% 97%', 'foreground': '200 60% 15%', 'card': '0 0% 100%', 'card-foreground': '200 60% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '200 60% 15%', 'primary': '199 89% 48%', 'primary-foreground': '0 0% 100%',
      'secondary': '195 50% 92%', 'secondary-foreground': '199 89% 30%', 'muted': '195 35% 92%', 'muted-foreground': '200 20% 45%',
      'accent': '199 70% 92%', 'accent-foreground': '199 89% 30%', 'border': '195 35% 86%', 'border-strong': '195 35% 78%',
      'border-focus': '199 89% 48%', 'input': '195 35% 88%', 'ring': '199 89% 48%', 'glass': '0 0% 100% / 0.72', 'glass-border': '195 35% 84% / 0.8',
    },
    dark: {
      ...sharedDark,
      'background': '215 64% 11%', 'foreground': '195 80% 94%', 'card': '215 50% 16%', 'card-foreground': '195 80% 94%',
      'popover': '215 50% 16%', 'popover-foreground': '195 80% 94%', 'primary': '198 93% 60%', 'primary-foreground': '215 64% 11%',
      'secondary': '215 40% 22%', 'secondary-foreground': '195 80% 94%', 'muted': '215 40% 20%', 'muted-foreground': '195 30% 68%',
      'accent': '198 50% 26%', 'accent-foreground': '195 80% 94%', 'border': '215 40% 25%', 'border-strong': '215 40% 34%',
      'border-focus': '198 93% 60%', 'input': '215 40% 25%', 'ring': '198 93% 60%', 'glass': '215 50% 16% / 0.75', 'glass-border': '215 40% 28% / 0.85',
    },
  },
  {
    id: 'moss',
    name: 'Deep Moss Forest',
    author: 'Woodland',
    description: 'Ancient woodland canopy: dark earthy moss green (#1C2518) & amber highlights.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Newsreader', serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '100 20% 94%', 'foreground': '120 30% 15%', 'card': '0 0% 100%', 'card-foreground': '120 30% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '120 30% 15%', 'primary': '134 29% 29%', 'primary-foreground': '0 0% 100%',
      'secondary': '100 18% 88%', 'secondary-foreground': '120 30% 15%', 'muted': '100 15% 88%', 'muted-foreground': '120 12% 42%',
      'accent': '134 30% 86%', 'accent-foreground': '134 29% 22%', 'border': '100 15% 82%', 'border-strong': '100 15% 74%',
      'border-focus': '134 29% 29%', 'input': '100 15% 84%', 'ring': '134 29% 29%', 'glass': '0 0% 100% / 0.85', 'glass-border': '100 15% 80% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '105 21% 12%', 'foreground': '90 25% 90%', 'card': '105 18% 16%', 'card-foreground': '90 25% 90%',
      'popover': '105 18% 16%', 'popover-foreground': '90 25% 90%', 'primary': '78 52% 56%', 'primary-foreground': '105 21% 12%',
      'secondary': '105 16% 22%', 'secondary-foreground': '90 25% 90%', 'muted': '105 16% 19%', 'muted-foreground': '90 15% 65%',
      'accent': '78 35% 24%', 'accent-foreground': '90 25% 90%', 'border': '105 16% 24%', 'border-strong': '105 16% 32%',
      'border-focus': '78 52% 56%', 'input': '105 16% 24%', 'ring': '78 52% 56%', 'glass': '105 18% 16% / 0.8', 'glass-border': '105 16% 26% / 0.85',
    },
  },
  {
    id: 'solaris',
    name: 'Golden Hour',
    author: 'Sunset Glow',
    description: 'Golden hour sunset: rich amber (#F59E0B), warm twilight violet & glowing warmth.',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Plus Jakarta Sans', sans-serif", display: "'Syne', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '45 100% 96%', 'foreground': '30 40% 12%', 'card': '0 0% 100%', 'card-foreground': '30 40% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '30 40% 12%', 'primary': '38 92% 50%', 'primary-foreground': '0 0% 100%',
      'secondary': '45 50% 90%', 'secondary-foreground': '38 92% 30%', 'muted': '45 30% 90%', 'muted-foreground': '30 15% 45%',
      'accent': '38 70% 90%', 'accent-foreground': '38 92% 30%', 'border': '45 30% 84%', 'border-strong': '45 30% 76%',
      'border-focus': '38 92% 50%', 'input': '45 30% 85%', 'ring': '38 92% 50%', 'glass': '0 0% 100% / 0.8', 'glass-border': '45 30% 82% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '255 33% 11%', 'foreground': '45 80% 92%', 'card': '255 25% 16%', 'card-foreground': '45 80% 92%',
      'popover': '255 25% 16%', 'popover-foreground': '45 80% 92%', 'primary': '38 92% 50%', 'primary-foreground': '255 33% 11%',
      'secondary': '255 20% 22%', 'secondary-foreground': '45 80% 92%', 'muted': '255 20% 19%', 'muted-foreground': '45 30% 65%',
      'accent': '38 50% 25%', 'accent-foreground': '45 80% 92%', 'border': '255 20% 24%', 'border-strong': '255 20% 32%',
      'border-focus': '38 92% 50%', 'input': '255 20% 24%', 'ring': '38 92% 50%', 'glass': '255 25% 16% / 0.75', 'glass-border': '255 20% 28% / 0.85',
    },
  },
  {
    id: 'nebula',
    name: 'Cosmic Nebula',
    author: 'Stardust',
    description: 'Deep space void (#0D0628), cosmic violet (#7B2CBF) & magenta stardust glow.',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Outfit', sans-serif", display: "'Orbitron', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '265 60% 97%', 'foreground': '265 50% 15%', 'card': '0 0% 100%', 'card-foreground': '265 50% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '265 50% 15%', 'primary': '268 89% 58%', 'primary-foreground': '0 0% 100%',
      'secondary': '265 40% 92%', 'secondary-foreground': '268 89% 35%', 'muted': '265 30% 92%', 'muted-foreground': '265 15% 45%',
      'accent': '268 60% 92%', 'accent-foreground': '268 89% 35%', 'border': '265 30% 86%', 'border-strong': '265 30% 78%',
      'border-focus': '268 89% 58%', 'input': '265 30% 88%', 'ring': '268 89% 58%', 'glass': '0 0% 100% / 0.8', 'glass-border': '265 30% 84% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '256 74% 9%', 'foreground': '270 70% 95%', 'card': '256 50% 15%', 'card-foreground': '270 70% 95%',
      'popover': '256 50% 15%', 'popover-foreground': '270 70% 95%', 'primary': '274 100% 75%', 'primary-foreground': '256 74% 9%',
      'secondary': '256 40% 22%', 'secondary-foreground': '270 70% 95%', 'muted': '256 40% 19%', 'muted-foreground': '270 30% 68%',
      'accent': '274 50% 28%', 'accent-foreground': '270 70% 95%', 'border': '256 40% 24%', 'border-strong': '256 40% 32%',
      'border-focus': '274 100% 75%', 'input': '256 40% 24%', 'ring': '274 100% 75%', 'glass': '256 50% 15% / 0.75', 'glass-border': '256 40% 28% / 0.85',
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk 2077',
    author: 'Neo-Tokyo',
    description: 'High-tech low-life: pitch black (#05050A), electric neon cyan (#00F0FF) & hot magenta.',
    appearance: { radius: '2px', borderWidth: '2px', shadows: 'dramatic', density: 'compact', glass: true, motion: 'playful' },
    fonts: { sans: "'Chakra Petch', sans-serif", display: "'Chakra Petch', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '180 30% 96%', 'foreground': '180 100% 12%', 'card': '0 0% 100%', 'card-foreground': '180 100% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '180 100% 12%', 'primary': '187 100% 42%', 'primary-foreground': '0 0% 100%',
      'secondary': '180 20% 90%', 'secondary-foreground': '187 100% 30%', 'muted': '180 15% 91%', 'muted-foreground': '180 30% 40%',
      'accent': '187 60% 88%', 'accent-foreground': '187 100% 30%', 'border': '187 100% 42%', 'border-strong': '187 100% 35%',
      'border-focus': '187 100% 42%', 'input': '180 15% 85%', 'ring': '187 100% 42%', 'glass': '0 0% 100% / 0.85', 'glass-border': '187 100% 42% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '240 33% 3%', 'foreground': '180 100% 90%', 'card': '240 25% 7%', 'card-foreground': '180 100% 90%',
      'popover': '240 25% 7%', 'popover-foreground': '180 100% 90%', 'primary': '184 100% 50%', 'primary-foreground': '240 33% 3%',
      'secondary': '240 20% 12%', 'secondary-foreground': '180 100% 90%', 'muted': '240 20% 10%', 'muted-foreground': '180 50% 60%',
      'accent': '325 100% 25%', 'accent-foreground': '180 100% 90%', 'border': '184 100% 50%', 'border-strong': '325 100% 50%',
      'border-focus': '184 100% 50%', 'input': '240 20% 12%', 'ring': '184 100% 50%', 'glass': '240 25% 7% / 0.8', 'glass-border': '184 100% 50% / 0.85',
    },
  },
  {
    id: 'synthwave',
    name: '80s Synthwave',
    author: 'Retrowave',
    description: 'Neon dusk grid (#1A0B2E), glowing magenta (#FF007F) & sunset coral glow.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Chakra Petch', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '330 50% 97%', 'foreground': '330 40% 15%', 'card': '0 0% 100%', 'card-foreground': '330 40% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '330 40% 15%', 'primary': '330 100% 50%', 'primary-foreground': '0 0% 100%',
      'secondary': '330 30% 92%', 'secondary-foreground': '330 100% 35%', 'muted': '330 20% 92%', 'muted-foreground': '330 15% 45%',
      'accent': '330 60% 92%', 'accent-foreground': '330 100% 35%', 'border': '330 25% 86%', 'border-strong': '330 25% 78%',
      'border-focus': '330 100% 50%', 'input': '330 25% 88%', 'ring': '330 100% 50%', 'glass': '0 0% 100% / 0.8', 'glass-border': '330 25% 84% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '266 61% 11%', 'foreground': '330 80% 92%', 'card': '266 45% 16%', 'card-foreground': '330 80% 92%',
      'popover': '266 45% 16%', 'popover-foreground': '330 80% 92%', 'primary': '330 100% 50%', 'primary-foreground': '266 61% 11%',
      'secondary': '266 35% 22%', 'secondary-foreground': '330 80% 92%', 'muted': '266 35% 19%', 'muted-foreground': '330 30% 65%',
      'accent': '330 50% 28%', 'accent-foreground': '330 80% 92%', 'border': '266 35% 24%', 'border-strong': '266 35% 32%',
      'border-focus': '330 100% 50%', 'input': '266 35% 24%', 'ring': '330 100% 50%', 'glass': '266 45% 16% / 0.75', 'glass-border': '266 35% 28% / 0.85',
    },
  },
  {
    id: 'bauhaus',
    name: 'Bauhaus Studio',
    author: 'German Modernism',
    description: '1919 Weimar movement: primary cobalt, vermillion & yellow accents on stark geometric surfaces.',
    appearance: { radius: '0px', borderWidth: '2px', shadows: 'none', density: 'compact', glass: false, motion: 'none' },
    fonts: { sans: "'Space Grotesk', sans-serif", display: "'Space Grotesk', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 98%', 'foreground': '0 0% 8%', 'card': '0 0% 100%', 'card-foreground': '0 0% 8%',
      'popover': '0 0% 100%', 'popover-foreground': '0 0% 8%', 'primary': '352 96% 43%', 'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 92%', 'secondary-foreground': '0 0% 8%', 'muted': '0 0% 92%', 'muted-foreground': '0 0% 40%',
      'accent': '217 91% 92%', 'accent-foreground': '217 91% 35%', 'border': '0 0% 0%', 'border-strong': '0 0% 0%',
      'border-focus': '352 96% 43%', 'input': '0 0% 88%', 'ring': '352 96% 43%', 'glass': '0 0% 100% / 0.9', 'glass-border': '0 0% 0% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 7%', 'foreground': '0 0% 96%', 'card': '0 0% 12%', 'card-foreground': '0 0% 96%',
      'popover': '0 0% 12%', 'popover-foreground': '0 0% 96%', 'primary': '352 96% 55%', 'primary-foreground': '0 0% 7%',
      'secondary': '0 0% 18%', 'secondary-foreground': '0 0% 96%', 'muted': '0 0% 15%', 'muted-foreground': '0 0% 60%',
      'accent': '217 60% 25%', 'accent-foreground': '0 0% 96%', 'border': '0 0% 30%', 'border-strong': '0 0% 45%',
      'border-focus': '352 96% 55%', 'input': '0 0% 20%', 'ring': '352 96% 55%', 'glass': '0 0% 12% / 0.85', 'glass-border': '0 0% 28% / 0.9',
    },
  },
  {
    id: 'monolith',
    name: 'Brutalist Monolith',
    author: 'Raw Concrete',
    description: 'Heavy brutalist architecture: raw slate (#18181B), zero radius, bold 2px borders.',
    appearance: { radius: '0px', borderWidth: '2px', shadows: 'none', density: 'compact', glass: false, motion: 'none' },
    fonts: { sans: "'Space Grotesk', sans-serif", display: "'Space Grotesk', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '240 5% 96%', 'foreground': '240 6% 10%', 'card': '0 0% 100%', 'card-foreground': '240 6% 10%',
      'popover': '0 0% 100%', 'popover-foreground': '240 6% 10%', 'primary': '240 6% 10%', 'primary-foreground': '0 0% 100%',
      'secondary': '240 5% 90%', 'secondary-foreground': '240 6% 10%', 'muted': '240 5% 90%', 'muted-foreground': '240 4% 45%',
      'accent': '240 5% 85%', 'accent-foreground': '240 6% 10%', 'border': '240 6% 10%', 'border-strong': '240 6% 0%',
      'border-focus': '240 6% 10%', 'input': '240 5% 88%', 'ring': '240 6% 10%', 'glass': '0 0% 100% / 0.9', 'glass-border': '240 6% 10% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '240 6% 5%', 'foreground': '240 5% 90%', 'card': '240 6% 9%', 'card-foreground': '240 5% 90%',
      'popover': '240 6% 9%', 'popover-foreground': '240 5% 90%', 'primary': '240 5% 90%', 'primary-foreground': '240 6% 5%',
      'secondary': '240 6% 15%', 'secondary-foreground': '240 5% 90%', 'muted': '240 6% 13%', 'muted-foreground': '240 4% 55%',
      'accent': '240 6% 18%', 'accent-foreground': '240 5% 90%', 'border': '240 5% 30%', 'border-strong': '240 5% 45%',
      'border-focus': '240 5% 90%', 'input': '240 6% 15%', 'ring': '240 5% 90%', 'glass': '240 6% 9% / 0.85', 'glass-border': '240 5% 30% / 0.9',
    },
  },
  {
    id: 'emerald',
    name: 'Luxe Emerald',
    author: 'High Jewelry',
    description: 'Imperial green velvet (#064E3B) with brushed gold (#D4AF37) accents.',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Cinzel', serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '160 50% 96%', 'foreground': '165 60% 12%', 'card': '0 0% 100%', 'card-foreground': '165 60% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '165 60% 12%', 'primary': '160 84% 30%', 'primary-foreground': '0 0% 100%',
      'secondary': '160 30% 90%', 'secondary-foreground': '160 84% 20%', 'muted': '160 20% 90%', 'muted-foreground': '165 20% 42%',
      'accent': '45 70% 90%', 'accent-foreground': '45 80% 25%', 'border': '160 20% 82%', 'border-strong': '160 20% 74%',
      'border-focus': '160 84% 30%', 'input': '160 20% 84%', 'ring': '160 84% 30%', 'glass': '0 0% 100% / 0.8', 'glass-border': '160 20% 80% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '165 60% 9%', 'foreground': '160 40% 92%', 'card': '165 50% 14%', 'card-foreground': '160 40% 92%',
      'popover': '165 50% 14%', 'popover-foreground': '160 40% 92%', 'primary': '160 64% 52%', 'primary-foreground': '165 60% 9%',
      'secondary': '165 40% 18%', 'secondary-foreground': '160 40% 92%', 'muted': '165 40% 16%', 'muted-foreground': '160 20% 62%',
      'accent': '45 40% 22%', 'accent-foreground': '160 40% 92%', 'border': '165 40% 20%', 'border-strong': '165 40% 28%',
      'border-focus': '160 64% 52%', 'input': '165 40% 20%', 'ring': '160 64% 52%', 'glass': '165 50% 14% / 0.78', 'glass-border': '165 40% 24% / 0.85',
    },
  },
  {
    id: 'midnight-tokyo',
    name: 'Shinjuku Rain',
    author: 'Tokyo Midnight',
    description: 'Rainy Shinjuku alley: dark obsidian (#0F0F14), neon reflections & cobalt glow.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Inter Tight', sans-serif", display: "'Chakra Petch', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '220 50% 97%', 'foreground': '225 45% 14%', 'card': '0 0% 100%', 'card-foreground': '225 45% 14%',
      'popover': '0 0% 100%', 'popover-foreground': '225 45% 14%', 'primary': '217 91% 60%', 'primary-foreground': '0 0% 100%',
      'secondary': '220 30% 92%', 'secondary-foreground': '217 91% 35%', 'muted': '220 20% 92%', 'muted-foreground': '225 15% 45%',
      'accent': '217 60% 92%', 'accent-foreground': '217 91% 35%', 'border': '220 25% 86%', 'border-strong': '220 25% 78%',
      'border-focus': '217 91% 60%', 'input': '220 25% 88%', 'ring': '217 91% 60%', 'glass': '0 0% 100% / 0.8', 'glass-border': '220 25% 84% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '240 25% 7%', 'foreground': '220 50% 92%', 'card': '240 20% 12%', 'card-foreground': '220 50% 92%',
      'popover': '240 20% 12%', 'popover-foreground': '220 50% 92%', 'primary': '217 91% 67%', 'primary-foreground': '240 25% 7%',
      'secondary': '240 18% 18%', 'secondary-foreground': '220 50% 92%', 'muted': '240 18% 15%', 'muted-foreground': '220 20% 62%',
      'accent': '217 40% 24%', 'accent-foreground': '220 50% 92%', 'border': '240 18% 20%', 'border-strong': '240 18% 28%',
      'border-focus': '217 91% 67%', 'input': '240 18% 20%', 'ring': '217 91% 67%', 'glass': '240 20% 12% / 0.78', 'glass-border': '240 18% 24% / 0.85',
    },
  },
  {
    id: 'copper',
    name: 'Brushed Copper',
    author: 'Industrial Craft',
    description: 'Industrial metallic: matte gunmetal (#1A1D20) & warm brushed copper patina.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Space Grotesk', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '20 30% 97%', 'foreground': '210 15% 15%', 'card': '0 0% 100%', 'card-foreground': '210 15% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '210 15% 15%', 'primary': '16 55% 55%', 'primary-foreground': '0 0% 100%',
      'secondary': '20 20% 91%', 'secondary-foreground': '16 55% 35%', 'muted': '20 15% 91%', 'muted-foreground': '210 10% 45%',
      'accent': '16 45% 90%', 'accent-foreground': '16 55% 35%', 'border': '20 15% 85%', 'border-strong': '20 15% 76%',
      'border-focus': '16 55% 55%', 'input': '20 15% 86%', 'ring': '16 55% 55%', 'glass': '0 0% 100% / 0.85', 'glass-border': '20 15% 82% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '210 10% 12%', 'foreground': '20 20% 90%', 'card': '210 9% 16%', 'card-foreground': '20 20% 90%',
      'popover': '210 9% 16%', 'popover-foreground': '20 20% 90%', 'primary': '16 60% 60%', 'primary-foreground': '210 10% 12%',
      'secondary': '210 8% 22%', 'secondary-foreground': '20 20% 90%', 'muted': '210 8% 19%', 'muted-foreground': '20 10% 60%',
      'accent': '16 35% 24%', 'accent-foreground': '20 20% 90%', 'border': '210 8% 24%', 'border-strong': '210 8% 32%',
      'border-focus': '16 60% 60%', 'input': '210 8% 24%', 'ring': '16 60% 60%', 'glass': '210 9% 16% / 0.8', 'glass-border': '210 8% 28% / 0.85',
    },
  },
  {
    id: 'latte-macchiato',
    name: 'Espresso Latte',
    author: 'Café Studio',
    description: 'Roasted espresso bean (#231714) & creamy steamed milk foam (#F5EBE0).',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: false, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Newsreader', serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '28 40% 92%', 'foreground': '15 30% 12%', 'card': '28 45% 97%', 'card-foreground': '15 30% 12%',
      'popover': '28 45% 97%', 'popover-foreground': '15 30% 12%', 'primary': '25 35% 33%', 'primary-foreground': '0 0% 100%',
      'secondary': '28 25% 85%', 'secondary-foreground': '15 30% 12%', 'muted': '28 20% 86%', 'muted-foreground': '15 12% 42%',
      'accent': '25 30% 86%', 'accent-foreground': '25 35% 25%', 'border': '28 18% 81%', 'border-strong': '28 18% 72%',
      'border-focus': '25 35% 33%', 'input': '28 18% 83%', 'ring': '25 35% 33%', 'glass': '28 45% 97% / 0.85', 'glass-border': '28 18% 79% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '15 28% 9%', 'foreground': '28 30% 88%', 'card': '15 24% 13%', 'card-foreground': '28 30% 88%',
      'popover': '15 24% 13%', 'popover-foreground': '28 30% 88%', 'primary': '25 35% 55%', 'primary-foreground': '15 28% 9%',
      'secondary': '15 20% 18%', 'secondary-foreground': '28 30% 88%', 'muted': '15 20% 16%', 'muted-foreground': '28 15% 60%',
      'accent': '25 25% 22%', 'accent-foreground': '28 30% 88%', 'border': '15 20% 20%', 'border-strong': '15 20% 28%',
      'border-focus': '25 35% 55%', 'input': '15 20% 20%', 'ring': '25 35% 55%', 'glass': '15 24% 13% / 0.8', 'glass-border': '15 20% 24% / 0.85',
    },
  },
  {
    id: 'synth-gold',
    name: 'Black Tie Gold',
    author: 'Luxe Midnight',
    description: 'Exclusive black tie: pitch obsidian (#050505) with champagne gold (#D4AF37) accent.',
    appearance: { radius: '6px', borderWidth: '1px', shadows: 'elevated', density: 'compact', glass: true, motion: 'subtle' },
    fonts: { sans: "'Inter Tight', sans-serif", display: "'Cinzel', serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 98%', 'foreground': '0 0% 8%', 'card': '0 0% 100%', 'card-foreground': '0 0% 8%',
      'popover': '0 0% 100%', 'popover-foreground': '0 0% 8%', 'primary': '43 74% 40%', 'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 94%', 'secondary-foreground': '0 0% 8%', 'muted': '0 0% 93%', 'muted-foreground': '0 0% 45%',
      'accent': '43 60% 90%', 'accent-foreground': '43 74% 30%', 'border': '0 0% 86%', 'border-strong': '0 0% 78%',
      'border-focus': '43 74% 40%', 'input': '0 0% 88%', 'ring': '43 74% 40%', 'glass': '0 0% 100% / 0.85', 'glass-border': '0 0% 84% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 3%', 'foreground': '0 0% 94%', 'card': '0 0% 7%', 'card-foreground': '0 0% 94%',
      'popover': '0 0% 7%', 'popover-foreground': '0 0% 94%', 'primary': '43 85% 63%', 'primary-foreground': '0 0% 3%',
      'secondary': '0 0% 13%', 'secondary-foreground': '0 0% 94%', 'muted': '0 0% 11%', 'muted-foreground': '0 0% 58%',
      'accent': '43 45% 20%', 'accent-foreground': '0 0% 94%', 'border': '0 0% 15%', 'border-strong': '0 0% 24%',
      'border-focus': '43 85% 63%', 'input': '0 0% 15%', 'ring': '43 85% 63%', 'glass': '0 0% 7% / 0.85', 'glass-border': '0 0% 18% / 0.9',
    },
  },
  {
    id: 'vaporwave',
    name: 'Lo-Fi Vaporwave',
    author: 'Aesthetic',
    description: 'Dreamy lo-fi nostalgia: pastel lavender (#E8D7F1), mint green (#B8E0D2) & soft pink.',
    appearance: { radius: '12px', borderWidth: '1px', shadows: 'elevated', density: 'relaxed', glass: true, motion: 'playful' },
    fonts: { sans: "'Outfit', sans-serif", display: "'Syne', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '270 50% 96%', 'foreground': '270 40% 15%', 'card': '0 0% 100%', 'card-foreground': '270 40% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '270 40% 15%', 'primary': '270 80% 65%', 'primary-foreground': '0 0% 100%',
      'secondary': '270 30% 90%', 'secondary-foreground': '270 80% 35%', 'muted': '270 20% 91%', 'muted-foreground': '270 12% 45%',
      'accent': '270 60% 90%', 'accent-foreground': '270 80% 35%', 'border': '270 20% 85%', 'border-strong': '270 20% 76%',
      'border-focus': '270 80% 65%', 'input': '270 20% 86%', 'ring': '270 80% 65%', 'glass': '0 0% 100% / 0.78', 'glass-border': '270 20% 82% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '275 43% 11%', 'foreground': '270 50% 92%', 'card': '275 35% 16%', 'card-foreground': '270 50% 92%',
      'popover': '275 35% 16%', 'popover-foreground': '270 50% 92%', 'primary': '270 90% 75%', 'primary-foreground': '275 43% 11%',
      'secondary': '275 25% 22%', 'secondary-foreground': '270 50% 92%', 'muted': '275 25% 19%', 'muted-foreground': '270 20% 65%',
      'accent': '270 45% 26%', 'accent-foreground': '270 50% 92%', 'border': '275 25% 24%', 'border-strong': '275 25% 32%',
      'border-focus': '270 90% 75%', 'input': '275 25% 24%', 'ring': '270 90% 75%', 'glass': '275 35% 16% / 0.75', 'glass-border': '275 25% 28% / 0.85',
    },
  },
];


/** 📖 Legacy SkinId mapping for backwards compatibility with older kandown.json configs */
// 📖 Pre-FABLE_UI skin ids kept alive so old .kandown/config.json files still resolve.
// `kandown` used to be an alias for `vercel`; it is now a real preset, so it is no
// longer mapped here — an alias would shadow the theme of the same name.
const LEGACY_SKIN_MAP: Record<string, string> = {
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
  if (typeof value !== 'string') return 'kandown';
  const all = getAllThemes();
  const target = LEGACY_SKIN_MAP[value] ?? value;
  return all.some(t => t.id === target) ? target : 'kandown';
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
