/**
 * @file "arc" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const arcTheme: KandownTheme = {
    id: 'arc',
    name: 'Arc Prism',
    author: 'The Browser Company',
    description: 'Translucent glassmorphism, iridescent gradient hues, soft 16px squircle radius.',
    appearance: { radius: '16px', borderWidth: '1px', shadows: 'elevated', density: 'relaxed', glass: true, motion: 'playful' },
    fonts: { sans: "'Sora', sans-serif", display: "'Sora', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '260 40% 98%', 'foreground': '260 25% 15%', 'card': '0 0% 100%', 'card-foreground': '260 25% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '260 25% 15%', 'primary': '258 90% 66%', 'primary-foreground': '0 0% 100%',
      'secondary': '260 30% 94%', 'secondary-foreground': '258 90% 40%', 'muted': '260 25% 93%', 'muted-foreground': '260 12% 45%',
      'accent': '258 80% 93%', 'accent-foreground': '258 90% 40%', 'border': '260 25% 88%', 'border-strong': '260 25% 80%',
      'border-focus': '258 90% 66%', 'input': '260 25% 90%', 'ring': '258 90% 66%', 'glass': '0 0% 100% / 0.75', 'glass-border': '260 25% 86% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '258 35% 9%', 'foreground': '258 40% 94%', 'card': '258 30% 14%', 'card-foreground': '258 40% 94%',
      'popover': '258 30% 14%', 'popover-foreground': '258 40% 94%', 'primary': '258 90% 75%', 'primary-foreground': '258 35% 9%',
      'secondary': '258 25% 20%', 'secondary-foreground': '258 40% 94%', 'muted': '258 25% 18%', 'muted-foreground': '258 20% 65%',
      'accent': '258 45% 26%', 'accent-foreground': '258 40% 94%', 'border': '258 25% 24%', 'border-strong': '258 25% 32%',
      'border-focus': '258 90% 75%', 'input': '258 25% 24%', 'ring': '258 90% 75%', 'glass': '258 30% 14% / 0.7', 'glass-border': '258 25% 28% / 0.8',
    },
  };
