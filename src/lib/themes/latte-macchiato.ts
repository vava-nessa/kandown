/**
 * @file "latte-macchiato" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const lattemacchiatoTheme: KandownTheme = {
    id: 'latte-macchiato',
    name: 'Espresso Latte',
    author: 'Café Studio',
    description: 'Roasted espresso bean (#231714) & creamy steamed milk foam (#F5EBE0).',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: false, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Newsreader', serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '28 40% 92%', 'foreground': '15 30% 12%', 'card': '28 45% 97%', 'card-foreground': '15 30% 12%',
      'popover': '28 45% 97%', 'popover-foreground': '15 30% 12%', 'primary': '25 35% 33%', 'primary-foreground': '0 0% 100%',
      'secondary': '28 25% 85%', 'secondary-foreground': '15 30% 12%', 'muted': '28 20% 86%', 'muted-foreground': '15 12% 42%',
      'accent': '25 30% 86%', 'accent-foreground': '25 35% 25%', 'border': '28 18% 81%', 'border-strong': '28 18% 72%',
      'border-focus': '25 35% 33%', 'input': '28 18% 83%', 'ring': '25 35% 33%', 'glass': '28 45% 97% / 0.85', 'glass-border': '28 18% 79% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '15 28% 9%', 'foreground': '28 30% 88%', 'card': '15 24% 13%', 'card-foreground': '28 30% 88%',
      'popover': '15 24% 13%', 'popover-foreground': '28 30% 88%', 'primary': '25 35% 55%', 'primary-foreground': '15 28% 9%',
      'secondary': '15 20% 18%', 'secondary-foreground': '28 30% 88%', 'muted': '15 20% 16%', 'muted-foreground': '28 15% 60%',
      'accent': '25 25% 22%', 'accent-foreground': '28 30% 88%', 'border': '15 20% 20%', 'border-strong': '15 20% 28%',
      'border-focus': '25 35% 55%', 'input': '15 20% 20%', 'ring': '25 35% 55%', 'glass': '15 24% 13% / 0.8', 'glass-border': '15 20% 24% / 0.85',
    },
  };
