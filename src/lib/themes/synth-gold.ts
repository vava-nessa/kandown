/**
 * @file "synth-gold" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const synthgoldTheme: KandownTheme = {
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
  };
