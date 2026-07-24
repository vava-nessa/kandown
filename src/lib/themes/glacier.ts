/**
 * @file "glacier" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const glacierTheme: KandownTheme = {
    id: 'glacier',
    name: 'Icelandic Glacier',
    author: 'Polar Ice',
    description: 'Crystal ice cave: translucent icy aqua (#E0F7FA), deep navy frost & glass.',
    appearance: { radius: '12px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Sora', sans-serif", display: "'Sora', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '195 100% 97%', 'foreground': '200 60% 15%', 'card': '0 0% 100%', 'card-foreground': '200 60% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '200 60% 15%', 'primary': '199 89% 48%', 'primary-foreground': '0 0% 100%',
      'secondary': '195 50% 92%', 'secondary-foreground': '199 89% 30%', 'muted': '195 35% 92%', 'muted-foreground': '200 20% 45%',
      'accent': '199 70% 92%', 'accent-foreground': '199 89% 30%', 'border': '195 35% 86%', 'border-strong': '195 35% 78%',
      'border-focus': '199 89% 48%', 'input': '195 35% 88%', 'ring': '199 89% 48%', 'glass': '0 0% 100% / 0.72', 'glass-border': '195 35% 84% / 0.8',
    },
    dark: {
      ...sharedDark,
      'background': '215 64% 11%', 'foreground': '195 80% 94%', 'card': '215 50% 16%', 'card-foreground': '195 80% 94%',
      'popover': '215 50% 16%', 'popover-foreground': '195 80% 94%', 'primary': '198 93% 60%', 'primary-foreground': '215 64% 11%',
      'secondary': '215 40% 22%', 'secondary-foreground': '195 80% 94%', 'muted': '215 40% 20%', 'muted-foreground': '195 30% 68%',
      'accent': '198 50% 26%', 'accent-foreground': '195 80% 94%', 'border': '215 40% 25%', 'border-strong': '215 40% 34%',
      'border-focus': '198 93% 60%', 'input': '215 40% 25%', 'ring': '198 93% 60%', 'glass': '215 50% 16% / 0.75', 'glass-border': '215 40% 28% / 0.85',
    },
  };
