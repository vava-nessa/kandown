/**
 * @file "raycast" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const raycastTheme: KandownTheme = {
    id: 'raycast',
    name: 'Raycast Crimson',
    author: 'Raycast',
    description: 'Ultra-dark command launcher (#111116), fiery crimson badge glow (#FF6363).',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'elevated', density: 'compact', glass: true, motion: 'subtle' },
    fonts: { sans: "'Inter Tight', sans-serif", display: "'Orbitron', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 98%', 'foreground': '0 0% 10%', 'card': '0 0% 100%', 'card-foreground': '0 0% 10%',
      'popover': '0 0% 100%', 'popover-foreground': '0 0% 10%', 'primary': '358 100% 62%', 'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 94%', 'secondary-foreground': '358 100% 40%', 'muted': '0 0% 93%', 'muted-foreground': '0 0% 45%',
      'accent': '358 80% 94%', 'accent-foreground': '358 100% 40%', 'border': '0 0% 88%', 'border-strong': '0 0% 80%',
      'border-focus': '358 100% 62%', 'input': '0 0% 90%', 'ring': '358 100% 62%', 'glass': '0 0% 100% / 0.85', 'glass-border': '0 0% 86% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '240 14% 7%', 'foreground': '0 0% 95%', 'card': '240 10% 11%', 'card-foreground': '0 0% 95%',
      'popover': '240 10% 11%', 'popover-foreground': '0 0% 95%', 'primary': '358 100% 69%', 'primary-foreground': '240 14% 7%',
      'secondary': '240 10% 16%', 'secondary-foreground': '0 0% 95%', 'muted': '240 10% 14%', 'muted-foreground': '240 8% 60%',
      'accent': '358 50% 20%', 'accent-foreground': '0 0% 95%', 'border': '240 10% 20%', 'border-strong': '240 10% 28%',
      'border-focus': '358 100% 69%', 'input': '240 10% 20%', 'ring': '358 100% 69%', 'glass': '240 10% 11% / 0.8', 'glass-border': '240 10% 22% / 0.85',
    },
  };
