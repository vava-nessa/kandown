/**
 * @file "cyberpunk" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const cyberpunkTheme: KandownTheme = {
    id: 'cyberpunk',
    name: 'Cyberpunk 2077',
    author: 'Neo-Tokyo',
    description: 'High-tech low-life: pitch black (#05050A), electric neon cyan (#00F0FF) & hot magenta.',
    appearance: { radius: '2px', borderWidth: '2px', shadows: 'dramatic', density: 'compact', glass: true, motion: 'playful' },
    fonts: { sans: "'Chakra Petch', sans-serif", display: "'Chakra Petch', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '180 30% 96%', 'foreground': '180 100% 12%', 'card': '0 0% 100%', 'card-foreground': '180 100% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '180 100% 12%', 'primary': '187 100% 42%', 'primary-foreground': '0 0% 100%',
      'secondary': '180 20% 90%', 'secondary-foreground': '187 100% 30%', 'muted': '180 15% 91%', 'muted-foreground': '180 30% 40%',
      'accent': '187 60% 88%', 'accent-foreground': '187 100% 30%', 'border': '187 100% 42%', 'border-strong': '187 100% 35%',
      'border-focus': '187 100% 42%', 'input': '180 15% 85%', 'ring': '187 100% 42%', 'glass': '0 0% 100% / 0.85', 'glass-border': '187 100% 42% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '240 33% 3%', 'foreground': '180 100% 90%', 'card': '240 25% 7%', 'card-foreground': '180 100% 90%',
      'popover': '240 25% 7%', 'popover-foreground': '180 100% 90%', 'primary': '184 100% 50%', 'primary-foreground': '240 33% 3%',
      'secondary': '240 20% 12%', 'secondary-foreground': '180 100% 90%', 'muted': '240 20% 10%', 'muted-foreground': '180 50% 60%',
      'accent': '325 100% 25%', 'accent-foreground': '180 100% 90%', 'border': '184 100% 50%', 'border-strong': '325 100% 50%',
      'border-focus': '184 100% 50%', 'input': '240 20% 12%', 'ring': '184 100% 50%', 'glass': '240 25% 7% / 0.8', 'glass-border': '184 100% 50% / 0.85',
    },
  };
