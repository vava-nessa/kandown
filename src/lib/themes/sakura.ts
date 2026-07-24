/**
 * @file "sakura" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const sakuraTheme: KandownTheme = {
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
  };
