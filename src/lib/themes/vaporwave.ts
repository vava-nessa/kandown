/**
 * @file "vaporwave" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const vaporwaveTheme: KandownTheme = {
    id: 'vaporwave',
    name: 'Lo-Fi Vaporwave',
    author: 'Aesthetic',
    description: 'Dreamy lo-fi nostalgia: pastel lavender (#E8D7F1), mint green (#B8E0D2) & soft pink.',
    appearance: { radius: '12px', borderWidth: '1px', shadows: 'elevated', density: 'relaxed', glass: true, motion: 'playful' },
    fonts: { sans: "'Outfit', sans-serif", display: "'Syne', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '270 50% 96%', 'foreground': '270 40% 15%', 'card': '0 0% 100%', 'card-foreground': '270 40% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '270 40% 15%', 'primary': '270 80% 65%', 'primary-foreground': '0 0% 100%',
      'secondary': '270 30% 90%', 'secondary-foreground': '270 80% 35%', 'muted': '270 20% 91%', 'muted-foreground': '270 12% 45%',
      'accent': '270 60% 90%', 'accent-foreground': '270 80% 35%', 'border': '270 20% 85%', 'border-strong': '270 20% 76%',
      'border-focus': '270 80% 65%', 'input': '270 20% 86%', 'ring': '270 80% 65%', 'glass': '0 0% 100% / 0.78', 'glass-border': '270 20% 82% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '275 43% 11%', 'foreground': '270 50% 92%', 'card': '275 35% 16%', 'card-foreground': '270 50% 92%',
      'popover': '275 35% 16%', 'popover-foreground': '270 50% 92%', 'primary': '270 90% 75%', 'primary-foreground': '275 43% 11%',
      'secondary': '275 25% 22%', 'secondary-foreground': '270 50% 92%', 'muted': '275 25% 19%', 'muted-foreground': '270 20% 65%',
      'accent': '270 45% 26%', 'accent-foreground': '270 50% 92%', 'border': '275 25% 24%', 'border-strong': '275 25% 32%',
      'border-focus': '270 90% 75%', 'input': '275 25% 24%', 'ring': '270 90% 75%', 'glass': '275 35% 16% / 0.75', 'glass-border': '275 25% 28% / 0.85',
    },
  };
