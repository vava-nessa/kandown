/**
 * @file "bamboo" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const bambooTheme: KandownTheme = {
    id: 'bamboo',
    name: 'Kyoto Bamboo',
    author: 'Nature Zen',
    description: 'Japanese tea garden: deep moss green, warm bamboo wood tones, serene calm.',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Playfair Display', serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '90 15% 95%', 'foreground': '155 25% 18%', 'card': '0 0% 100%', 'card-foreground': '155 25% 18%',
      'popover': '0 0% 100%', 'popover-foreground': '155 25% 18%', 'primary': '155 32% 35%', 'primary-foreground': '0 0% 100%',
      'secondary': '90 15% 88%', 'secondary-foreground': '155 25% 18%', 'muted': '90 12% 88%', 'muted-foreground': '155 12% 42%',
      'accent': '155 25% 88%', 'accent-foreground': '155 32% 25%', 'border': '90 12% 82%', 'border-strong': '90 12% 74%',
      'border-focus': '155 32% 35%', 'input': '90 12% 84%', 'ring': '155 32% 35%', 'glass': '0 0% 100% / 0.85', 'glass-border': '90 12% 80% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '155 21% 11%', 'foreground': '90 20% 90%', 'card': '155 20% 15%', 'card-foreground': '90 20% 90%',
      'popover': '155 20% 15%', 'popover-foreground': '90 20% 90%', 'primary': '155 30% 52%', 'primary-foreground': '155 21% 11%',
      'secondary': '155 18% 20%', 'secondary-foreground': '90 20% 90%', 'muted': '155 18% 18%', 'muted-foreground': '90 12% 62%',
      'accent': '155 25% 24%', 'accent-foreground': '90 20% 90%', 'border': '155 18% 22%', 'border-strong': '155 18% 30%',
      'border-focus': '155 30% 52%', 'input': '155 18% 22%', 'ring': '155 30% 52%', 'glass': '155 20% 15% / 0.8', 'glass-border': '155 18% 26% / 0.85',
    },
  };
