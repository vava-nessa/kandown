/**
 * @file "terminal" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const terminalTheme: KandownTheme = {
    id: 'terminal',
    name: 'Terminal',
    author: 'Retro CRT',
    description: 'VT323 retro CRT mono font, pitch black (#0C0C0C), phosphor neon green text (#33FF66), 0px radius.',
    appearance: {
      radius: '0px',
      borderWidth: '1px',
      shadows: 'none',
      density: 'compact',
      glass: false,
      motion: 'none',
    },
    fonts: {
      sans: "'VT323', 'SF Mono', monospace",
      display: "'VT323', 'SF Mono', monospace",
      mono: "'VT323', 'SF Mono', monospace",
    },
    light: {
      ...sharedLight,
      'background': '135 30% 96%',
      'foreground': '135 100% 20%',
      'card': '0 0% 100%',
      'card-foreground': '135 100% 20%',
      'popover': '0 0% 100%',
      'popover-foreground': '135 100% 20%',
      'primary': '135 100% 25%',
      'primary-foreground': '0 0% 100%',
      'secondary': '135 25% 88%',
      'secondary-foreground': '135 100% 20%',
      'muted': '135 20% 89%',
      'muted-foreground': '135 40% 35%',
      'accent': '135 35% 85%',
      'accent-foreground': '135 100% 20%',
      'border': '135 30% 80%',
      'border-strong': '135 30% 70%',
      'border-focus': '135 100% 30%',
      'input': '135 30% 82%',
      'ring': '135 100% 25%',
      'glass': '0 0% 100% / 0.9',
      'glass-border': '135 30% 78% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 5%',
      'foreground': '135 100% 60%',
      'card': '0 0% 8%',
      'card-foreground': '135 100% 60%',
      'popover': '0 0% 8%',
      'popover-foreground': '135 100% 60%',
      'primary': '135 100% 60%',
      'primary-foreground': '0 0% 5%',
      'secondary': '0 0% 12%',
      'secondary-foreground': '135 100% 60%',
      'muted': '0 0% 10%',
      'muted-foreground': '135 60% 45%',
      'accent': '135 40% 12%',
      'accent-foreground': '135 100% 60%',
      'border': '135 40% 18%',
      'border-strong': '135 40% 26%',
      'border-focus': '135 100% 60%',
      'input': '135 40% 18%',
      'ring': '135 100% 60%',
      'glass': '0 0% 8% / 0.85',
      'glass-border': '135 40% 22% / 0.9',
    },
  };
