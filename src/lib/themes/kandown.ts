/**
 * @file "kandown" theme preset — the house theme
 * @description Kandown's own appearance/color-token preset, built from the brand
 * palette published on the website: #88E138 brand lime (logo arrow, primary
 * actions), #7AD12A the contrast-adjusted lime used on light backgrounds,
 * #0CE931 the hero/WebGL shader green (reused here as the `success` token),
 * #F1FFB8 pale lime for accent surfaces and #EBEBEB for neutral borders.
 *
 * 📖 Lime is far too bright to carry white text, so `primary-foreground` is a
 * near-black green in both modes rather than the usual white.
 *
 * 📖 This is the default skin (`DEFAULT_CONFIG.ui.skin === 'kandown'`) and the
 * fallback returned by `normalizeSkinId` for an unknown id.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const kandownTheme: KandownTheme = {
    id: 'kandown',
    name: 'Kandown',
    author: 'Kandown',
    description: 'The house theme: brand lime (#88E138) on near-neutral surfaces, pale lime accents, 4px radius.',
    appearance: { radius: '4px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'Inter var', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "'Inter Tight', 'Inter var', Inter, sans-serif", mono: "'SF Mono', Menlo, Monaco, Consolas, monospace" },
    light: {
      ...sharedLight,
      'background': '80 40% 99%', 'foreground': '120 10% 10%', 'card': '0 0% 100%', 'card-foreground': '120 10% 10%',
      'popover': '0 0% 100%', 'popover-foreground': '120 10% 10%', 'primary': '91 67% 47%', 'primary-foreground': '96 55% 9%',
      'secondary': '75 45% 94%', 'secondary-foreground': '96 40% 18%', 'muted': '75 12% 95%', 'muted-foreground': '120 5% 40%',
      'accent': '72 100% 90%', 'accent-foreground': '96 50% 18%', 'border': '0 0% 92%', 'border-strong': '0 0% 85%',
      'border-focus': '91 67% 47%', 'input': '0 0% 90%', 'ring': '91 67% 47%', 'success': '130 90% 28%',
      'grid': '92 40% 20% / 0.05', 'grid-strong': '92 40% 20% / 0.09', 'glass': '0 0% 100% / 0.78', 'glass-border': '75 30% 88% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '120 8% 7%', 'foreground': '80 15% 93%', 'card': '120 7% 10%', 'card-foreground': '80 15% 93%',
      'popover': '120 7% 11%', 'popover-foreground': '80 15% 93%', 'primary': '92 74% 55%', 'primary-foreground': '120 30% 7%',
      'secondary': '120 6% 16%', 'secondary-foreground': '80 15% 93%', 'muted': '120 6% 14%', 'muted-foreground': '90 6% 60%',
      'accent': '92 30% 18%', 'accent-foreground': '92 74% 70%', 'border': '120 6% 18%', 'border-strong': '120 6% 26%',
      'border-focus': '92 74% 55%', 'input': '120 6% 18%', 'ring': '92 74% 55%', 'success': '130 90% 48%',
      'grid': '92 60% 60% / 0.03', 'grid-strong': '92 60% 60% / 0.06', 'glass': '120 7% 10% / 0.78', 'glass-border': '92 20% 24% / 0.8',
    },
  };
