/**
 * @file "catppuccin" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const catppuccinTheme: KandownTheme = {
    id: 'catppuccin',
    name: 'Catppuccin',
    author: 'Catppuccin Org',
    description: 'JetBrains Mono & Fira Code typography, Mocha dark palette (#1E1E2E, mauve #CBA6F7), Latte light.',
    appearance: {
      radius: '10px',
      borderWidth: '1px',
      shadows: 'soft',
      density: 'comfortable',
      glass: true,
      motion: 'subtle',
    },
    fonts: {
      sans: "'JetBrains Mono', 'Fira Code', monospace",
      display: "'JetBrains Mono', 'Fira Code', monospace",
      mono: "'JetBrains Mono', 'Fira Code', monospace",
    },
    light: {
      ...sharedLight,
      'background': '220 23% 95%',
      'foreground': '234 16% 35%',
      'card': '0 0% 100%',
      'card-foreground': '234 16% 35%',
      'popover': '0 0% 100%',
      'popover-foreground': '234 16% 35%',
      'primary': '266 85% 58%',
      'primary-foreground': '0 0% 100%',
      'secondary': '220 18% 90%',
      'secondary-foreground': '266 85% 40%',
      'muted': '220 16% 88%',
      'muted-foreground': '233 10% 52%',
      'accent': '266 50% 90%',
      'accent-foreground': '266 85% 40%',
      'border': '220 14% 82%',
      'border-strong': '220 14% 75%',
      'border-focus': '266 85% 58%',
      'input': '220 14% 84%',
      'ring': '266 85% 58%',
      'glass': '0 0% 100% / 0.8',
      'glass-border': '220 14% 80% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '240 21% 15%',
      'foreground': '226 64% 88%',
      'card': '240 21% 19%',
      'card-foreground': '226 64% 88%',
      'popover': '240 21% 19%',
      'popover-foreground': '226 64% 88%',
      'primary': '267 84% 81%',
      'primary-foreground': '240 21% 15%',
      'secondary': '240 21% 23%',
      'secondary-foreground': '226 64% 88%',
      'muted': '240 21% 21%',
      'muted-foreground': '228 17% 68%',
      'accent': '267 40% 28%',
      'accent-foreground': '226 64% 88%',
      'border': '240 21% 26%',
      'border-strong': '240 21% 34%',
      'border-focus': '267 84% 81%',
      'input': '240 21% 26%',
      'ring': '267 84% 81%',
      'glass': '240 21% 19% / 0.78',
      'glass-border': '240 21% 28% / 0.85',
    },
  };
