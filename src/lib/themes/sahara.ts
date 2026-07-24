/**
 * @file "sahara" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const saharaTheme: KandownTheme = {
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
  };
