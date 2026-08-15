/**
 * @file "linear" theme preset
 * @description Linear's dark-first aesthetic ported from the community
 * registry (`registry/themes/linear.json`): near-black blue-tinted surfaces,
 * electric violet primary (#5E6AD2, hsl 235 59% 60%), Plus Jakarta Sans,
 * elevated glass popovers. Dark mode is the flagship; light mode keeps the
 * violet accent on cool gray surfaces.
 *
 * 📖 Bundled so it ships offline with the app; the registry copy stays the
 * canonical source for the store listing.
 *
 * @see registry/themes/linear.json
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const linearTheme: KandownTheme = {
    id: 'linear',
    name: 'Linear',
    author: 'Kandown',
    description: 'Dark-first aesthetic, Plus Jakarta Sans, electric violet accent, sleek elevated popovers.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'subtle', glassIntensity: 24, shadowCard: '0 1px 2px rgb(8 8 16 / 0.06), 0 4px 12px rgb(8 8 16 / 0.10)', shadowPopover: '0 12px 32px rgb(8 8 16 / 0.22)' },
    fonts: { sans: "'Plus Jakarta Sans', Outfit, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "'Plus Jakarta Sans', Outfit, -apple-system, BlinkMacSystemFont, sans-serif", mono: "'SF Mono', Menlo, Consolas, monospace" },
    light: {
      ...sharedLight,
      'background': '220 20% 98%', 'foreground': '224 24% 12%', 'card': '0 0% 100%', 'card-foreground': '224 24% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '224 24% 12%', 'primary': '235 59% 60%', 'primary-foreground': '0 0% 100%',
      'secondary': '235 25% 95%', 'secondary-foreground': '235 59% 30%', 'muted': '220 16% 94%', 'muted-foreground': '220 12% 42%',
      'accent': '235 45% 92%', 'accent-foreground': '235 59% 35%', 'border': '220 15% 88%', 'border-strong': '220 15% 80%',
      'border-focus': '235 59% 60%', 'input': '220 15% 90%', 'ring': '235 59% 60%',
      'grid': '235 30% 12% / 0.04', 'grid-strong': '235 30% 12% / 0.08', 'glass': '0 0% 100% / 0.8', 'glass-border': '220 15% 86% / 0.85',
      'code-bg': '220 14% 96%', 'code-fg': '224 24% 12%', 'code-inline-bg': '235 30% 92%', 'code-inline-fg': '235 40% 30%', 'code-block-border': '220 14% 88%',
    },
    dark: {
      ...sharedDark,
      'background': '210 11% 4%', 'foreground': '210 14% 94%', 'card': '216 7% 8%', 'card-foreground': '210 14% 94%',
      'popover': '216 7% 8%', 'popover-foreground': '210 14% 94%', 'primary': '235 59% 60%', 'primary-foreground': '0 0% 100%',
      'secondary': '218 9% 13%', 'secondary-foreground': '210 14% 94%', 'muted': '218 9% 11%', 'muted-foreground': '215 8% 58%',
      'accent': '235 30% 15%', 'accent-foreground': '210 14% 94%', 'border': '225 9% 14%', 'border-strong': '225 9% 20%',
      'border-focus': '235 59% 60%', 'input': '225 9% 14%', 'ring': '235 59% 60%',
      'grid': '0 0% 100% / 0.018', 'grid-strong': '0 0% 100% / 0.04', 'glass': '216 7% 8% / 0.78', 'glass-border': '225 9% 18% / 0.85',
      'code-bg': '216 9% 10%', 'code-fg': '210 14% 90%', 'code-inline-bg': '235 25% 18%', 'code-inline-fg': '235 60% 78%', 'code-block-border': '225 9% 20%',
    },
  };
