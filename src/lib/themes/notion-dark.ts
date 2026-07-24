/**
 * @file "notion-dark" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const notiondarkTheme: KandownTheme = {
    id: 'notion-dark',
    name: 'Notion Dark',
    author: 'Notion',
    description: 'Dark studio workspace, charcoal surface (#191919), pastel subtle tags.',
    appearance: { radius: '4px', borderWidth: '1px', shadows: 'none', density: 'compact', glass: false, motion: 'none' },
    fonts: { sans: "'Inter var', sans-serif", display: "'Newsreader', Georgia, serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '40 15% 97%', 'foreground': '30 6% 16%', 'card': '0 0% 100%', 'card-foreground': '30 6% 16%',
      'popover': '0 0% 100%', 'popover-foreground': '30 6% 16%', 'primary': '30 6% 16%', 'primary-foreground': '0 0% 100%',
      'secondary': '40 12% 91%', 'secondary-foreground': '30 6% 16%', 'muted': '40 10% 92%', 'muted-foreground': '30 4% 45%',
      'accent': '40 15% 88%', 'accent-foreground': '30 6% 16%', 'border': '40 8% 85%', 'border-strong': '40 8% 76%',
      'border-focus': '30 6% 30%', 'input': '40 8% 86%', 'ring': '30 6% 30%', 'glass': '0 0% 100% / 0.85', 'glass-border': '40 8% 82% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 10%', 'foreground': '0 0% 89%', 'card': '0 0% 14%', 'card-foreground': '0 0% 89%',
      'popover': '0 0% 14%', 'popover-foreground': '0 0% 89%', 'primary': '0 0% 89%', 'primary-foreground': '0 0% 10%',
      'secondary': '0 0% 18%', 'secondary-foreground': '0 0% 89%', 'muted': '0 0% 16%', 'muted-foreground': '0 0% 55%',
      'accent': '0 0% 20%', 'accent-foreground': '0 0% 89%', 'border': '0 0% 20%', 'border-strong': '0 0% 28%',
      'border-focus': '0 0% 70%', 'input': '0 0% 20%', 'ring': '0 0% 70%', 'glass': '0 0% 14% / 0.85', 'glass-border': '0 0% 22% / 0.9',
    },
  };
