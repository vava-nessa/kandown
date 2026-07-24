/**
 * @file "moss" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const mossTheme: KandownTheme = {
    id: 'moss',
    name: 'Deep Moss Forest',
    author: 'Woodland',
    description: 'Ancient woodland canopy: dark earthy moss green (#1C2518) & amber highlights.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Newsreader', serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '100 20% 94%', 'foreground': '120 30% 15%', 'card': '0 0% 100%', 'card-foreground': '120 30% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '120 30% 15%', 'primary': '134 29% 29%', 'primary-foreground': '0 0% 100%',
      'secondary': '100 18% 88%', 'secondary-foreground': '120 30% 15%', 'muted': '100 15% 88%', 'muted-foreground': '120 12% 42%',
      'accent': '134 30% 86%', 'accent-foreground': '134 29% 22%', 'border': '100 15% 82%', 'border-strong': '100 15% 74%',
      'border-focus': '134 29% 29%', 'input': '100 15% 84%', 'ring': '134 29% 29%', 'glass': '0 0% 100% / 0.85', 'glass-border': '100 15% 80% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '105 21% 12%', 'foreground': '90 25% 90%', 'card': '105 18% 16%', 'card-foreground': '90 25% 90%',
      'popover': '105 18% 16%', 'popover-foreground': '90 25% 90%', 'primary': '78 52% 56%', 'primary-foreground': '105 21% 12%',
      'secondary': '105 16% 22%', 'secondary-foreground': '90 25% 90%', 'muted': '105 16% 19%', 'muted-foreground': '90 15% 65%',
      'accent': '78 35% 24%', 'accent-foreground': '90 25% 90%', 'border': '105 16% 24%', 'border-strong': '105 16% 32%',
      'border-focus': '78 52% 56%', 'input': '105 16% 24%', 'ring': '78 52% 56%', 'glass': '105 18% 16% / 0.8', 'glass-border': '105 16% 26% / 0.85',
    },
  };
