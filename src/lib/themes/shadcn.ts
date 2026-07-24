/**
 * @file "shadcn" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const shadcnTheme: KandownTheme = {
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
  };
