/**
 * @file "base" theme preset: the single house theme (t333)
 * @description The only bundled theme since the UI redesign. Neutral surfaces
 * (near-white light mode, near-black dark mode) with the kandown brand lime
 * reserved for primary actions and focus states, so color signals intent
 * instead of decorating chrome. Glass is off and the radius is a quiet 6px:
 * the base look is a clean paper surface, and future variants (community
 * presets, seasonal palettes) inherit from this object through the theme
 * engine's `base:` field rather than adding a second engine.
 *
 * 📖 Lime is too bright to carry white text, so `primary-foreground` is a
 * near-black green in both modes.
 *
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 * @see src/lib/theme.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const baseTheme: KandownTheme = {
  id: 'base',
  name: 'Base',
  author: 'Kandown',
  description: 'The single house theme: neutral paper surfaces, brand lime accents, quiet 6px radius.',
  appearance: {
    radius: '6px',
    borderWidth: '1px',
    shadows: 'soft',
    density: 'comfortable',
    glass: false,
    motion: 'subtle',
  },
  fonts: {
    sans: "'Inter var', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "'Inter Tight', 'Inter var', Inter, sans-serif",
    mono: "'SF Mono', Menlo, Monaco, Consolas, monospace",
  },
  light: {
    ...sharedLight,
    'background': '0 0% 99%',
    'foreground': '0 0% 10%',
    'card': '0 0% 100%',
    'card-foreground': '0 0% 10%',
    'popover': '0 0% 100%',
    'popover-foreground': '0 0% 10%',
    'primary': '91 67% 40%',
    'primary-foreground': '96 55% 9%',
    'secondary': '0 0% 95%',
    'secondary-foreground': '0 0% 18%',
    'muted': '0 0% 95%',
    'muted-foreground': '0 0% 42%',
    'accent': '0 0% 93%',
    'accent-foreground': '0 0% 12%',
    'border': '0 0% 91%',
    'border-strong': '0 0% 84%',
    'border-focus': '91 67% 40%',
    'input': '0 0% 90%',
    'ring': '91 67% 40%',
    'success': '130 90% 28%',
    'grid': '0 0% 20% / 0.05',
    'grid-strong': '0 0% 20% / 0.09',
    'glass': '0 0% 100% / 0.8',
    'glass-border': '0 0% 88% / 0.85',
    // 📖 Code blocks mirror the BASE_CODE_TOKENS_LIGHT safety net in
    // src/lib/theme.ts exactly: one source of truth for these values, so a
    // stripped community theme backfills to the same look as the bundle.
    'code-bg': '220 14% 96%',
    'code-fg': '220 30% 12%',
    'code-inline-bg': '75 35% 90%',
    'code-inline-fg': '120 25% 18%',
    'code-block-border': '220 14% 88%',
  },
  dark: {
    ...sharedDark,
    'background': '0 0% 7%',
    'foreground': '0 0% 93%',
    'card': '0 0% 10%',
    'card-foreground': '0 0% 93%',
    'popover': '0 0% 11%',
    'popover-foreground': '0 0% 93%',
    'primary': '92 74% 55%',
    'primary-foreground': '0 0% 7%',
    'secondary': '0 0% 15%',
    'secondary-foreground': '0 0% 93%',
    'muted': '0 0% 13%',
    'muted-foreground': '0 0% 60%',
    'accent': '0 0% 17%',
    'accent-foreground': '0 0% 93%',
    'border': '0 0% 18%',
    'border-strong': '0 0% 26%',
    'border-focus': '92 74% 55%',
    'input': '0 0% 18%',
    'ring': '92 74% 55%',
    'success': '130 90% 48%',
    'grid': '0 0% 60% / 0.03',
    'grid-strong': '0 0% 60% / 0.06',
    'glass': '0 0% 10% / 0.8',
    'glass-border': '0 0% 24% / 0.8',
    // 📖 Code blocks mirror the BASE_CODE_TOKENS_DARK safety net in
    // src/lib/theme.ts exactly (deep neutral close to github-dark's own
    // #0d1117, so the bundled Shiki light tokens stay readable).
    'code-bg': '220 15% 11%',
    'code-fg': '80 20% 92%',
    'code-inline-bg': '92 20% 22%',
    'code-inline-fg': '92 50% 78%',
    'code-block-border': '220 14% 22%',
  },
};
