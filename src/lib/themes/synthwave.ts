/**
 * @file "synthwave" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const synthwaveTheme: KandownTheme = {
    id: 'synthwave',
    name: '80s Synthwave',
    author: 'Retrowave',
    description: 'Neon dusk grid (#1A0B2E), glowing magenta (#FF007F) & sunset coral glow.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Chakra Petch', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '330 50% 97%', 'foreground': '330 40% 15%', 'card': '0 0% 100%', 'card-foreground': '330 40% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '330 40% 15%', 'primary': '330 100% 50%', 'primary-foreground': '0 0% 100%',
      'secondary': '330 30% 92%', 'secondary-foreground': '330 100% 35%', 'muted': '330 20% 92%', 'muted-foreground': '330 15% 45%',
      'accent': '330 60% 92%', 'accent-foreground': '330 100% 35%', 'border': '330 25% 86%', 'border-strong': '330 25% 78%',
      'border-focus': '330 100% 50%', 'input': '330 25% 88%', 'ring': '330 100% 50%', 'glass': '0 0% 100% / 0.8', 'glass-border': '330 25% 84% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '266 61% 11%', 'foreground': '330 80% 92%', 'card': '266 45% 16%', 'card-foreground': '330 80% 92%',
      'popover': '266 45% 16%', 'popover-foreground': '330 80% 92%', 'primary': '330 100% 50%', 'primary-foreground': '266 61% 11%',
      'secondary': '266 35% 22%', 'secondary-foreground': '330 80% 92%', 'muted': '266 35% 19%', 'muted-foreground': '330 30% 65%',
      'accent': '330 50% 28%', 'accent-foreground': '330 80% 92%', 'border': '266 35% 24%', 'border-strong': '266 35% 32%',
      'border-focus': '330 100% 50%', 'input': '266 35% 24%', 'ring': '330 100% 50%', 'glass': '266 45% 16% / 0.75', 'glass-border': '266 35% 28% / 0.85',
    },
  };
