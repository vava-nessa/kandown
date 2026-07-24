/**
 * @file "nordic" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const nordicTheme: KandownTheme = {
    id: 'nordic',
    name: 'Nordic Polar',
    author: 'Arctic Ice',
    description: 'Official Nord color palette: polar night slate (#2E3440) and frost turquoise (#88C0D0).',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Plus Jakarta Sans', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '218 27% 94%', 'foreground': '220 16% 22%', 'card': '0 0% 100%', 'card-foreground': '220 16% 22%',
      'popover': '0 0% 100%', 'popover-foreground': '220 16% 22%', 'primary': '213 32% 52%', 'primary-foreground': '0 0% 100%',
      'secondary': '218 27% 88%', 'secondary-foreground': '220 16% 22%', 'muted': '218 20% 88%', 'muted-foreground': '220 10% 45%',
      'accent': '193 43% 85%', 'accent-foreground': '193 43% 30%', 'border': '218 20% 82%', 'border-strong': '218 20% 74%',
      'border-focus': '213 32% 52%', 'input': '218 20% 84%', 'ring': '213 32% 52%', 'glass': '0 0% 100% / 0.85', 'glass-border': '218 20% 80% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '220 16% 22%', 'foreground': '218 27% 92%', 'card': '220 17% 26%', 'card-foreground': '218 27% 92%',
      'popover': '220 17% 26%', 'popover-foreground': '218 27% 92%', 'primary': '193 43% 67%', 'primary-foreground': '220 16% 22%',
      'secondary': '220 16% 32%', 'secondary-foreground': '218 27% 92%', 'muted': '220 16% 30%', 'muted-foreground': '218 15% 68%',
      'accent': '193 30% 28%', 'accent-foreground': '218 27% 92%', 'border': '220 16% 34%', 'border-strong': '220 16% 42%',
      'border-focus': '193 43% 67%', 'input': '220 16% 34%', 'ring': '193 43% 67%', 'glass': '220 17% 26% / 0.8', 'glass-border': '220 16% 36% / 0.85',
    },
  };
