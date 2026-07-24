/**
 * @file "claude" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const claudeTheme: KandownTheme = {
    id: 'claude',
    name: 'Claude',
    author: 'Anthropic',
    description: 'Editorial warmth, Newsreader serif headings, oat crème light background, terracotta accents.',
    appearance: {
      radius: '12px',
      borderWidth: '1px',
      shadows: 'soft',
      density: 'comfortable',
      glass: false,
      motion: 'subtle',
    },
    fonts: {
      sans: "'Inter var', Inter, sans-serif",
      display: "'Newsreader', Charter, Georgia, serif",
      mono: "'SF Mono', Menlo, monospace",
    },
    light: {
      ...sharedLight,
      'background': '38 33% 94%',
      'foreground': '20 12% 12%',
      'card': '38 40% 98%',
      'card-foreground': '20 12% 12%',
      'popover': '38 40% 98%',
      'popover-foreground': '20 12% 12%',
      'primary': '15 62% 60%',
      'primary-foreground': '0 0% 100%',
      'secondary': '38 25% 88%',
      'secondary-foreground': '20 12% 15%',
      'muted': '38 20% 89%',
      'muted-foreground': '20 8% 42%',
      'accent': '15 45% 90%',
      'accent-foreground': '15 62% 35%',
      'border': '38 18% 84%',
      'border-strong': '38 18% 76%',
      'border-focus': '15 62% 60%',
      'input': '38 18% 86%',
      'ring': '15 62% 60%',
      'glass': '38 40% 98% / 0.85',
      'glass-border': '38 18% 82% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '20 8% 7%',
      'foreground': '38 20% 92%',
      'card': '20 8% 12%',
      'card-foreground': '38 20% 92%',
      'popover': '20 8% 12%',
      'popover-foreground': '38 20% 92%',
      'primary': '15 62% 60%',
      'primary-foreground': '0 0% 100%',
      'secondary': '20 8% 16%',
      'secondary-foreground': '38 20% 92%',
      'muted': '20 8% 14%',
      'muted-foreground': '38 10% 60%',
      'accent': '15 30% 18%',
      'accent-foreground': '38 20% 92%',
      'border': '20 8% 18%',
      'border-strong': '20 8% 25%',
      'border-focus': '15 62% 60%',
      'input': '20 8% 18%',
      'ring': '15 62% 60%',
      'glass': '20 8% 12% / 0.8',
      'glass-border': '20 8% 22% / 0.85',
    },
  };
