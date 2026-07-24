/**
 * @file "spotify" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const spotifyTheme: KandownTheme = {
    id: 'spotify',
    name: 'Spotify OLED',
    author: 'Spotify',
    description: 'Deep obsidian dark (#121212), high-contrast electric lime green (#1DB954).',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'none', density: 'comfortable', glass: false, motion: 'subtle' },
    fonts: { sans: "'Outfit', sans-serif", display: "'Outfit', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 98%', 'foreground': '0 0% 10%', 'card': '0 0% 100%', 'card-foreground': '0 0% 10%',
      'popover': '0 0% 100%', 'popover-foreground': '0 0% 10%', 'primary': '141 73% 42%', 'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 94%', 'secondary-foreground': '141 73% 30%', 'muted': '0 0% 93%', 'muted-foreground': '0 0% 45%',
      'accent': '141 50% 92%', 'accent-foreground': '141 73% 30%', 'border': '0 0% 88%', 'border-strong': '0 0% 80%',
      'border-focus': '141 73% 42%', 'input': '0 0% 90%', 'ring': '141 73% 42%', 'glass': '0 0% 100% / 0.85', 'glass-border': '0 0% 86% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 7%', 'foreground': '0 0% 96%', 'card': '0 0% 11%', 'card-foreground': '0 0% 96%',
      'popover': '0 0% 11%', 'popover-foreground': '0 0% 96%', 'primary': '141 73% 42%', 'primary-foreground': '0 0% 0%',
      'secondary': '0 0% 16%', 'secondary-foreground': '0 0% 96%', 'muted': '0 0% 14%', 'muted-foreground': '0 0% 60%',
      'accent': '141 40% 18%', 'accent-foreground': '0 0% 96%', 'border': '0 0% 18%', 'border-strong': '0 0% 26%',
      'border-focus': '141 73% 42%', 'input': '0 0% 18%', 'ring': '141 73% 42%', 'glass': '0 0% 11% / 0.85', 'glass-border': '0 0% 22% / 0.9',
    },
  };
