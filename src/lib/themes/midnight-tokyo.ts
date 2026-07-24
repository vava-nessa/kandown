/**
 * @file "midnight-tokyo" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const midnighttokyoTheme: KandownTheme = {
    id: 'midnight-tokyo',
    name: 'Shinjuku Rain',
    author: 'Tokyo Midnight',
    description: 'Rainy Shinjuku alley: dark obsidian (#0F0F14), neon reflections & cobalt glow.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Inter Tight', sans-serif", display: "'Chakra Petch', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '220 50% 97%', 'foreground': '225 45% 14%', 'card': '0 0% 100%', 'card-foreground': '225 45% 14%',
      'popover': '0 0% 100%', 'popover-foreground': '225 45% 14%', 'primary': '217 91% 60%', 'primary-foreground': '0 0% 100%',
      'secondary': '220 30% 92%', 'secondary-foreground': '217 91% 35%', 'muted': '220 20% 92%', 'muted-foreground': '225 15% 45%',
      'accent': '217 60% 92%', 'accent-foreground': '217 91% 35%', 'border': '220 25% 86%', 'border-strong': '220 25% 78%',
      'border-focus': '217 91% 60%', 'input': '220 25% 88%', 'ring': '217 91% 60%', 'glass': '0 0% 100% / 0.8', 'glass-border': '220 25% 84% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '240 25% 7%', 'foreground': '220 50% 92%', 'card': '240 20% 12%', 'card-foreground': '220 50% 92%',
      'popover': '240 20% 12%', 'popover-foreground': '220 50% 92%', 'primary': '217 91% 67%', 'primary-foreground': '240 25% 7%',
      'secondary': '240 18% 18%', 'secondary-foreground': '220 50% 92%', 'muted': '240 18% 15%', 'muted-foreground': '220 20% 62%',
      'accent': '217 40% 24%', 'accent-foreground': '220 50% 92%', 'border': '240 18% 20%', 'border-strong': '240 18% 28%',
      'border-focus': '217 91% 67%', 'input': '240 18% 20%', 'ring': '217 91% 67%', 'glass': '240 20% 12% / 0.78', 'glass-border': '240 18% 24% / 0.85',
    },
  };
