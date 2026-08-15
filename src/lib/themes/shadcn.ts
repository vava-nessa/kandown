/**
 * @file "shadcn" theme preset, the clean default
 * @description Ultra-clean neutral palette in the spirit of shadcn/ui and
 * Linear: zinc surfaces, near-black primary, crisp 1px borders, white card on
 * a pure-white background in light mode, zinc-950 surfaces in dark mode.
 * This is the default skin since 0.53.0 (`DEFAULT_CONFIG.ui.skin`), so it is
 * also the fallback returned by `normalizeSkinId` and `resolveTheme` for
 * unknown ids.
 *
 * 📖 Kept deliberately boring: the design does the work, not the color. The
 * only saturated token is `success` / `warning` / `destructive` (shared with
 * every preset) so status stays readable on any surface.
 *
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const shadcnTheme: KandownTheme = {
    id: 'shadcn',
    name: 'Shadcn',
    author: 'Kandown',
    description: 'Ultra-clean zinc palette, near-black primary, crisp borders. The shadcn/ui look as a default.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'Inter var', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "'Inter Tight', 'Inter var', Inter, sans-serif", mono: "'SF Mono', Menlo, Monaco, Consolas, monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 100%', 'foreground': '240 10% 3.9%', 'card': '0 0% 100%', 'card-foreground': '240 10% 3.9%',
      'popover': '0 0% 100%', 'popover-foreground': '240 10% 3.9%', 'primary': '240 5.9% 10%', 'primary-foreground': '0 0% 98%',
      'secondary': '240 4.8% 95.9%', 'secondary-foreground': '240 5.9% 10%', 'muted': '240 4.8% 95.9%', 'muted-foreground': '240 3.8% 46.1%',
      'accent': '240 4.8% 95.9%', 'accent-foreground': '240 5.9% 10%', 'border': '240 5.9% 90%', 'border-strong': '240 5.9% 80%',
      'border-focus': '240 5.9% 10%', 'input': '240 5.9% 90%', 'ring': '240 5.9% 10%',
      'grid': '240 10% 3.9% / 0.04', 'grid-strong': '240 10% 3.9% / 0.07', 'glass': '0 0% 100% / 0.8', 'glass-border': '240 5.9% 90% / 0.8',
      // 📖 Code blocks: very light gray (github-light-ish) so the bundled
      // Shiki palette keeps WCAG-AA contrast. Inline code is a zinc pill.
      'code-bg': '240 6% 96%', 'code-fg': '240 10% 12%', 'code-inline-bg': '240 5% 94%', 'code-inline-fg': '240 8% 18%', 'code-block-border': '240 6% 88%',
    },
    dark: {
      ...sharedDark,
      'background': '240 10% 3.9%', 'foreground': '0 0% 98%', 'card': '240 7% 6%', 'card-foreground': '0 0% 98%',
      'popover': '240 8% 7%', 'popover-foreground': '0 0% 98%', 'primary': '0 0% 98%', 'primary-foreground': '240 5.9% 10%',
      'secondary': '240 3.7% 15.9%', 'secondary-foreground': '0 0% 98%', 'muted': '240 3.7% 15.9%', 'muted-foreground': '240 5% 64.9%',
      'accent': '240 3.7% 15.9%', 'accent-foreground': '0 0% 98%', 'border': '240 3.7% 15.9%', 'border-strong': '240 5% 26%',
      'border-focus': '240 4.9% 83.9%', 'input': '240 3.7% 15.9%', 'ring': '240 4.9% 83.9%',
      'grid': '0 0% 98% / 0.03', 'grid-strong': '0 0% 98% / 0.06', 'glass': '240 7% 6% / 0.8', 'glass-border': '240 5% 16% / 0.8',
      // 📖 Code blocks: zinc-950 close to github-dark's #0d1117 so the dark
      // Shiki palette stays readable; inline code is a slightly lighter pill.
      'code-bg': '240 5% 8%', 'code-fg': '0 0% 93%', 'code-inline-bg': '240 4% 13%', 'code-inline-fg': '240 8% 75%', 'code-block-border': '240 4% 18%',
    },
  };
