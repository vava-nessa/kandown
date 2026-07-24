/**
 * @file "apple" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const appleTheme: KandownTheme = {
    id: 'apple',
    name: 'Apple',
    author: 'Human Interface',
    description: 'Translucent materials, vibrant blur, SF Pro Display typography, 14px squircles.',
    appearance: {
      radius: '14px',
      borderWidth: '1px',
      shadows: 'elevated',
      density: 'relaxed',
      glass: true,
      motion: 'playful',
    },
    fonts: {
      sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
      display: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      mono: "'SF Mono', Menlo, Monaco, monospace",
    },
    light: {
      ...sharedLight,
      'background': '240 6% 97%',
      'foreground': '240 6% 10%',
      'card': '0 0% 100%',
      'card-foreground': '240 6% 10%',
      'popover': '0 0% 100%',
      'popover-foreground': '240 6% 10%',
      'primary': '211 100% 52%',
      'primary-foreground': '0 0% 100%',
      'secondary': '240 6% 92%',
      'secondary-foreground': '240 6% 12%',
      'muted': '240 5% 92%',
      'muted-foreground': '240 4% 45%',
      'accent': '211 90% 94%',
      'accent-foreground': '211 100% 40%',
      'border': '240 6% 88%',
      'border-strong': '240 6% 80%',
      'border-focus': '211 100% 52%',
      'input': '240 6% 90%',
      'ring': '211 100% 52%',
      'glass': '0 0% 100% / 0.72',
      'glass-border': '240 6% 86% / 0.8',
    },
    dark: {
      ...sharedDark,
      'background': '240 4% 6%',
      'foreground': '240 4% 96%',
      'card': '240 4% 11%',
      'card-foreground': '240 4% 96%',
      'popover': '240 4% 11%',
      'popover-foreground': '240 4% 96%',
      'primary': '211 100% 52%',
      'primary-foreground': '0 0% 100%',
      'secondary': '240 4% 16%',
      'secondary-foreground': '240 4% 96%',
      'muted': '240 4% 14%',
      'muted-foreground': '240 4% 62%',
      'accent': '211 50% 18%',
      'accent-foreground': '240 4% 96%',
      'border': '240 4% 18%',
      'border-strong': '240 4% 26%',
      'border-focus': '211 100% 52%',
      'input': '240 4% 18%',
      'ring': '211 100% 52%',
      'glass': '240 4% 11% / 0.68',
      'glass-border': '240 4% 22% / 0.8',
    },
  };
