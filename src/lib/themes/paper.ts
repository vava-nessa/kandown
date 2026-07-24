/**
 * @file "paper" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const paperTheme: KandownTheme = {
    id: 'paper',
    name: 'Paper',
    author: 'Notion-inspired',
    description: 'Calm studio workspace, Newsreader serif, warm gray background, pastel subtle accents, flat cards.',
    appearance: {
      radius: '4px',
      borderWidth: '1px',
      shadows: 'none',
      density: 'compact',
      glass: false,
      motion: 'none',
    },
    fonts: {
      sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      display: "'Newsreader', Georgia, serif",
      mono: "'SF Mono', Menlo, monospace",
    },
    light: {
      ...sharedLight,
      'background': '40 20% 96%',
      'foreground': '30 6% 18%',
      'card': '0 0% 100%',
      'card-foreground': '30 6% 18%',
      'popover': '0 0% 100%',
      'popover-foreground': '30 6% 18%',
      'primary': '30 6% 18%',
      'primary-foreground': '0 0% 100%',
      'secondary': '40 15% 90%',
      'secondary-foreground': '30 6% 20%',
      'muted': '40 12% 91%',
      'muted-foreground': '30 4% 45%',
      'accent': '40 20% 88%',
      'accent-foreground': '30 6% 18%',
      'border': '40 10% 84%',
      'border-strong': '40 10% 76%',
      'border-focus': '30 6% 35%',
      'input': '40 10% 86%',
      'ring': '30 6% 35%',
      'glass': '0 0% 100% / 0.85',
      'glass-border': '40 10% 82% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 10%',
      'foreground': '40 10% 90%',
      'card': '0 0% 14%',
      'card-foreground': '40 10% 90%',
      'popover': '0 0% 14%',
      'popover-foreground': '40 10% 90%',
      'primary': '40 10% 90%',
      'primary-foreground': '0 0% 10%',
      'secondary': '0 0% 18%',
      'secondary-foreground': '40 10% 90%',
      'muted': '0 0% 16%',
      'muted-foreground': '0 0% 55%',
      'accent': '0 0% 20%',
      'accent-foreground': '40 10% 90%',
      'border': '0 0% 20%',
      'border-strong': '0 0% 26%',
      'border-focus': '0 0% 45%',
      'input': '0 0% 20%',
      'ring': '0 0% 70%',
      'glass': '0 0% 14% / 0.85',
      'glass-border': '0 0% 22% / 0.9',
    },
  };
