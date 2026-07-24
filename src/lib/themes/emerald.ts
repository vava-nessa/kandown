/**
 * @file "emerald" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const emeraldTheme: KandownTheme = {
    id: 'emerald',
    name: 'Luxe Emerald',
    author: 'High Jewelry',
    description: 'Imperial green velvet (#064E3B) with brushed gold (#D4AF37) accents.',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Cinzel', serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '160 50% 96%', 'foreground': '165 60% 12%', 'card': '0 0% 100%', 'card-foreground': '165 60% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '165 60% 12%', 'primary': '160 84% 30%', 'primary-foreground': '0 0% 100%',
      'secondary': '160 30% 90%', 'secondary-foreground': '160 84% 20%', 'muted': '160 20% 90%', 'muted-foreground': '165 20% 42%',
      'accent': '45 70% 90%', 'accent-foreground': '45 80% 25%', 'border': '160 20% 82%', 'border-strong': '160 20% 74%',
      'border-focus': '160 84% 30%', 'input': '160 20% 84%', 'ring': '160 84% 30%', 'glass': '0 0% 100% / 0.8', 'glass-border': '160 20% 80% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '165 60% 9%', 'foreground': '160 40% 92%', 'card': '165 50% 14%', 'card-foreground': '160 40% 92%',
      'popover': '165 50% 14%', 'popover-foreground': '160 40% 92%', 'primary': '160 64% 52%', 'primary-foreground': '165 60% 9%',
      'secondary': '165 40% 18%', 'secondary-foreground': '160 40% 92%', 'muted': '165 40% 16%', 'muted-foreground': '160 20% 62%',
      'accent': '45 40% 22%', 'accent-foreground': '160 40% 92%', 'border': '165 40% 20%', 'border-strong': '165 40% 28%',
      'border-focus': '160 64% 52%', 'input': '165 40% 20%', 'ring': '160 64% 52%', 'glass': '165 50% 14% / 0.78', 'glass-border': '165 40% 24% / 0.85',
    },
  };
