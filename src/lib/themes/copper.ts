/**
 * @file "copper" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const copperTheme: KandownTheme = {
    id: 'copper',
    name: 'Brushed Copper',
    author: 'Industrial Craft',
    description: 'Industrial metallic: matte gunmetal (#1A1D20) & warm brushed copper patina.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Space Grotesk', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '20 30% 97%', 'foreground': '210 15% 15%', 'card': '0 0% 100%', 'card-foreground': '210 15% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '210 15% 15%', 'primary': '16 55% 55%', 'primary-foreground': '0 0% 100%',
      'secondary': '20 20% 91%', 'secondary-foreground': '16 55% 35%', 'muted': '20 15% 91%', 'muted-foreground': '210 10% 45%',
      'accent': '16 45% 90%', 'accent-foreground': '16 55% 35%', 'border': '20 15% 85%', 'border-strong': '20 15% 76%',
      'border-focus': '16 55% 55%', 'input': '20 15% 86%', 'ring': '16 55% 55%', 'glass': '0 0% 100% / 0.85', 'glass-border': '20 15% 82% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '210 10% 12%', 'foreground': '20 20% 90%', 'card': '210 9% 16%', 'card-foreground': '20 20% 90%',
      'popover': '210 9% 16%', 'popover-foreground': '20 20% 90%', 'primary': '16 60% 60%', 'primary-foreground': '210 10% 12%',
      'secondary': '210 8% 22%', 'secondary-foreground': '20 20% 90%', 'muted': '210 8% 19%', 'muted-foreground': '20 10% 60%',
      'accent': '16 35% 24%', 'accent-foreground': '20 20% 90%', 'border': '210 8% 24%', 'border-strong': '210 8% 32%',
      'border-focus': '16 60% 60%', 'input': '210 8% 24%', 'ring': '16 60% 60%', 'glass': '210 9% 16% / 0.8', 'glass-border': '210 8% 28% / 0.85',
    },
  };
