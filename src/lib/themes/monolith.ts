/**
 * @file "monolith" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const monolithTheme: KandownTheme = {
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
  };
