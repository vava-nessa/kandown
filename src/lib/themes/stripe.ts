/**
 * @file "stripe" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const stripeTheme: KandownTheme = {
    id: 'stripe',
    name: 'Stripe',
    author: 'Stripe Design',
    description: 'Syne & Space Grotesk display, indigo night dark mode (#0A0A23), blurple accents (#635BFF).',
    appearance: {
      radius: '8px',
      borderWidth: '1px',
      shadows: 'elevated',
      density: 'comfortable',
      glass: true,
      motion: 'subtle',
    },
    fonts: {
      sans: "'Space Grotesk', sans-serif",
      display: "'Syne', 'Space Grotesk', sans-serif",
      mono: "'SF Mono', Menlo, monospace",
    },
    light: {
      ...sharedLight,
      'background': '214 45% 98%',
      'foreground': '222 47% 11%',
      'card': '0 0% 100%',
      'card-foreground': '222 47% 11%',
      'popover': '0 0% 100%',
      'popover-foreground': '222 47% 11%',
      'primary': '243 100% 68%',
      'primary-foreground': '0 0% 100%',
      'secondary': '214 32% 93%',
      'secondary-foreground': '243 50% 30%',
      'muted': '214 25% 93%',
      'muted-foreground': '215 16% 45%',
      'accent': '243 60% 94%',
      'accent-foreground': '243 100% 45%',
      'border': '214 25% 88%',
      'border-strong': '214 25% 80%',
      'border-focus': '243 100% 68%',
      'input': '214 25% 90%',
      'ring': '243 100% 68%',
      'glass': '0 0% 100% / 0.8',
      'glass-border': '214 25% 86% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '240 56% 9%',
      'foreground': '225 60% 96%',
      'card': '240 45% 15%',
      'card-foreground': '225 60% 96%',
      'popover': '240 45% 15%',
      'popover-foreground': '225 60% 96%',
      'primary': '243 100% 68%',
      'primary-foreground': '0 0% 100%',
      'secondary': '240 35% 20%',
      'secondary-foreground': '225 60% 96%',
      'muted': '240 35% 18%',
      'muted-foreground': '230 25% 65%',
      'accent': '243 40% 25%',
      'accent-foreground': '225 60% 96%',
      'border': '240 35% 22%',
      'border-strong': '240 35% 30%',
      'border-focus': '243 100% 68%',
      'input': '240 35% 22%',
      'ring': '243 100% 68%',
      'glass': '240 45% 15% / 0.75',
      'glass-border': '240 35% 26% / 0.85',
    },
  };
