/**
 * @file "solaris" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const solarisTheme: KandownTheme = {
    id: 'solaris',
    name: 'Golden Hour',
    author: 'Sunset Glow',
    description: 'Golden hour sunset: rich amber (#F59E0B), warm twilight violet & glowing warmth.',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Plus Jakarta Sans', sans-serif", display: "'Syne', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '45 100% 96%', 'foreground': '30 40% 12%', 'card': '0 0% 100%', 'card-foreground': '30 40% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '30 40% 12%', 'primary': '38 92% 50%', 'primary-foreground': '0 0% 100%',
      'secondary': '45 50% 90%', 'secondary-foreground': '38 92% 30%', 'muted': '45 30% 90%', 'muted-foreground': '30 15% 45%',
      'accent': '38 70% 90%', 'accent-foreground': '38 92% 30%', 'border': '45 30% 84%', 'border-strong': '45 30% 76%',
      'border-focus': '38 92% 50%', 'input': '45 30% 85%', 'ring': '38 92% 50%', 'glass': '0 0% 100% / 0.8', 'glass-border': '45 30% 82% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '255 33% 11%', 'foreground': '45 80% 92%', 'card': '255 25% 16%', 'card-foreground': '45 80% 92%',
      'popover': '255 25% 16%', 'popover-foreground': '45 80% 92%', 'primary': '38 92% 50%', 'primary-foreground': '255 33% 11%',
      'secondary': '255 20% 22%', 'secondary-foreground': '45 80% 92%', 'muted': '255 20% 19%', 'muted-foreground': '45 30% 65%',
      'accent': '38 50% 25%', 'accent-foreground': '45 80% 92%', 'border': '255 20% 24%', 'border-strong': '255 20% 32%',
      'border-focus': '38 92% 50%', 'input': '255 20% 24%', 'ring': '38 92% 50%', 'glass': '255 25% 16% / 0.75', 'glass-border': '255 20% 28% / 0.85',
    },
  };
