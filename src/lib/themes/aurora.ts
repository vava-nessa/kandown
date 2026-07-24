/**
 * @file "aurora" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const auroraTheme: KandownTheme = {
    id: 'aurora',
    name: 'Aurora Borealis',
    author: 'Northern Lights',
    description: 'Lapland polar night sky (#0B0F19) with glowing emerald & violet atmospheric lights.',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Outfit', sans-serif", display: "'Outfit', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '170 50% 96%', 'foreground': '175 40% 12%', 'card': '0 0% 100%', 'card-foreground': '175 40% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '175 40% 12%', 'primary': '168 76% 36%', 'primary-foreground': '0 0% 100%',
      'secondary': '170 30% 90%', 'secondary-foreground': '168 76% 25%', 'muted': '170 20% 90%', 'muted-foreground': '175 15% 45%',
      'accent': '168 50% 88%', 'accent-foreground': '168 76% 25%', 'border': '170 20% 84%', 'border-strong': '170 20% 76%',
      'border-focus': '168 76% 36%', 'input': '170 20% 85%', 'ring': '168 76% 36%', 'glass': '0 0% 100% / 0.8', 'glass-border': '170 20% 82% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '222 38% 7%', 'foreground': '170 60% 94%', 'card': '222 30% 12%', 'card-foreground': '170 60% 94%',
      'popover': '222 30% 12%', 'popover-foreground': '170 60% 94%', 'primary': '172 100% 48%', 'primary-foreground': '222 38% 7%',
      'secondary': '222 25% 18%', 'secondary-foreground': '170 60% 94%', 'muted': '222 25% 15%', 'muted-foreground': '170 25% 65%',
      'accent': '172 50% 22%', 'accent-foreground': '170 60% 94%', 'border': '222 25% 20%', 'border-strong': '222 25% 28%',
      'border-focus': '172 100% 48%', 'input': '222 25% 20%', 'ring': '172 100% 48%', 'glass': '222 30% 12% / 0.75', 'glass-border': '222 25% 24% / 0.85',
    },
  };
