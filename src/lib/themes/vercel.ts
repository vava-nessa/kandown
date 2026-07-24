/**
 * @file "vercel" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const vercelTheme: KandownTheme = {
    id: 'vercel',
    name: 'Vercel',
    author: 'Geist Design',
    description: 'Radical monochrome contrast, Geist tight typography, zero shadows, sharp 1px borders.',
    appearance: {
      radius: '6px',
      borderWidth: '1px',
      shadows: 'none',
      density: 'compact',
      glass: false,
      motion: 'subtle',
    },
    fonts: {
      sans: "'Inter Tight', 'Inter var', Inter, sans-serif",
      display: "'Inter Tight', 'Inter var', Inter, sans-serif",
      mono: "'SF Mono', Menlo, monospace",
    },
    light: {
      ...sharedLight,
      'background': '0 0% 100%',
      'foreground': '0 0% 9%',
      'card': '0 0% 100%',
      'card-foreground': '0 0% 9%',
      'popover': '0 0% 100%',
      'popover-foreground': '0 0% 9%',
      'primary': '0 0% 9%',
      'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 96%',
      'secondary-foreground': '0 0% 12%',
      'muted': '0 0% 95%',
      'muted-foreground': '0 0% 40%',
      'accent': '0 0% 93%',
      'accent-foreground': '0 0% 9%',
      'border': '0 0% 91%',
      'border-strong': '0 0% 84%',
      'border-focus': '0 0% 50%',
      'input': '0 0% 90%',
      'ring': '0 0% 9%',
      'glass': '0 0% 100% / 0.85',
      'glass-border': '0 0% 88% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 0%',
      'foreground': '0 0% 98%',
      'card': '0 0% 4%',
      'card-foreground': '0 0% 98%',
      'popover': '0 0% 4%',
      'popover-foreground': '0 0% 98%',
      'primary': '0 0% 98%',
      'primary-foreground': '0 0% 0%',
      'secondary': '0 0% 8%',
      'secondary-foreground': '0 0% 98%',
      'muted': '0 0% 9%',
      'muted-foreground': '0 0% 56%',
      'accent': '0 0% 12%',
      'accent-foreground': '0 0% 98%',
      'border': '0 0% 12%',
      'border-strong': '0 0% 18%',
      'border-focus': '0 0% 35%',
      'input': '0 0% 12%',
      'ring': '0 0% 98%',
      'glass': '0 0% 4% / 0.85',
      'glass-border': '0 0% 16% / 0.9',
    },
  };
