/**
 * @file "linear" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const linearTheme: KandownTheme = {
    id: 'linear',
    name: 'Linear',
    author: 'Linear Team',
    description: 'Dark-first aesthetic, Plus Jakarta Sans font, electric violet accent (#5E6AD2), sleek elevated popovers.',
    appearance: {
      radius: '8px',
      borderWidth: '1px',
      shadows: 'soft',
      density: 'comfortable',
      glass: true,
      motion: 'subtle',
    },
    fonts: {
      sans: "'Plus Jakarta Sans', Outfit, sans-serif",
      display: "'Plus Jakarta Sans', Outfit, sans-serif",
      mono: "'SF Mono', Menlo, Consolas, monospace",
    },
    light: {
      ...sharedLight,
      'background': '220 20% 98%',
      'foreground': '224 24% 12%',
      'card': '0 0% 100%',
      'card-foreground': '224 24% 12%',
      'popover': '0 0% 100%',
      'popover-foreground': '224 24% 12%',
      'primary': '235 59% 60%',
      'primary-foreground': '0 0% 100%',
      'secondary': '235 25% 95%',
      'secondary-foreground': '235 59% 30%',
      'muted': '220 16% 94%',
      'muted-foreground': '220 12% 42%',
      'accent': '235 45% 92%',
      'accent-foreground': '235 59% 35%',
      'border': '220 15% 88%',
      'border-strong': '220 15% 80%',
      'border-focus': '235 59% 60%',
      'input': '220 15% 90%',
      'ring': '235 59% 60%',
      'glass': '0 0% 100% / 0.8',
      'glass-border': '220 15% 86% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '210 11% 4%',
      'foreground': '210 14% 94%',
      'card': '216 7% 8%',
      'card-foreground': '210 14% 94%',
      'popover': '216 7% 8%',
      'popover-foreground': '210 14% 94%',
      'primary': '235 59% 60%',
      'primary-foreground': '0 0% 100%',
      'secondary': '218 9% 13%',
      'secondary-foreground': '210 14% 94%',
      'muted': '218 9% 11%',
      'muted-foreground': '215 8% 58%',
      'accent': '235 30% 15%',
      'accent-foreground': '210 14% 94%',
      'border': '225 9% 14%',
      'border-strong': '225 9% 20%',
      'border-focus': '235 59% 60%',
      'input': '225 9% 14%',
      'ring': '235 59% 60%',
      'glass': '216 7% 8% / 0.78',
      'glass-border': '225 9% 18% / 0.85',
    },
  };
