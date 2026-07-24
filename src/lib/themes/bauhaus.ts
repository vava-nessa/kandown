/**
 * @file "bauhaus" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const bauhausTheme: KandownTheme = {
    id: 'bauhaus',
    name: 'Bauhaus Studio',
    author: 'German Modernism',
    description: '1919 Weimar movement: primary cobalt, vermillion & yellow accents on stark geometric surfaces.',
    appearance: { radius: '0px', borderWidth: '2px', shadows: 'none', density: 'compact', glass: false, motion: 'none' },
    fonts: { sans: "'Space Grotesk', sans-serif", display: "'Space Grotesk', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 98%', 'foreground': '0 0% 8%', 'card': '0 0% 100%', 'card-foreground': '0 0% 8%',
      'popover': '0 0% 100%', 'popover-foreground': '0 0% 8%', 'primary': '352 96% 43%', 'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 92%', 'secondary-foreground': '0 0% 8%', 'muted': '0 0% 92%', 'muted-foreground': '0 0% 40%',
      'accent': '217 91% 92%', 'accent-foreground': '217 91% 35%', 'border': '0 0% 0%', 'border-strong': '0 0% 0%',
      'border-focus': '352 96% 43%', 'input': '0 0% 88%', 'ring': '352 96% 43%', 'glass': '0 0% 100% / 0.9', 'glass-border': '0 0% 0% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 7%', 'foreground': '0 0% 96%', 'card': '0 0% 12%', 'card-foreground': '0 0% 96%',
      'popover': '0 0% 12%', 'popover-foreground': '0 0% 96%', 'primary': '352 96% 55%', 'primary-foreground': '0 0% 7%',
      'secondary': '0 0% 18%', 'secondary-foreground': '0 0% 96%', 'muted': '0 0% 15%', 'muted-foreground': '0 0% 60%',
      'accent': '217 60% 25%', 'accent-foreground': '0 0% 96%', 'border': '0 0% 30%', 'border-strong': '0 0% 45%',
      'border-focus': '352 96% 55%', 'input': '0 0% 20%', 'ring': '352 96% 55%', 'glass': '0 0% 12% / 0.85', 'glass-border': '0 0% 28% / 0.9',
    },
  };
