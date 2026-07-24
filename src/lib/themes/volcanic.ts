/**
 * @file "volcanic" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const volcanicTheme: KandownTheme = {
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
  };
