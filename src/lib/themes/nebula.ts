/**
 * @file "nebula" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const nebulaTheme: KandownTheme = {
    id: 'nebula',
    name: 'Cosmic Nebula',
    author: 'Stardust',
    description: 'Deep space void (#0D0628), cosmic violet (#7B2CBF) & magenta stardust glow.',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Outfit', sans-serif", display: "'Orbitron', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '265 60% 97%', 'foreground': '265 50% 15%', 'card': '0 0% 100%', 'card-foreground': '265 50% 15%',
      'popover': '0 0% 100%', 'popover-foreground': '265 50% 15%', 'primary': '268 89% 58%', 'primary-foreground': '0 0% 100%',
      'secondary': '265 40% 92%', 'secondary-foreground': '268 89% 35%', 'muted': '265 30% 92%', 'muted-foreground': '265 15% 45%',
      'accent': '268 60% 92%', 'accent-foreground': '268 89% 35%', 'border': '265 30% 86%', 'border-strong': '265 30% 78%',
      'border-focus': '268 89% 58%', 'input': '265 30% 88%', 'ring': '268 89% 58%', 'glass': '0 0% 100% / 0.8', 'glass-border': '265 30% 84% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '256 74% 9%', 'foreground': '270 70% 95%', 'card': '256 50% 15%', 'card-foreground': '270 70% 95%',
      'popover': '256 50% 15%', 'popover-foreground': '270 70% 95%', 'primary': '274 100% 75%', 'primary-foreground': '256 74% 9%',
      'secondary': '256 40% 22%', 'secondary-foreground': '270 70% 95%', 'muted': '256 40% 19%', 'muted-foreground': '270 30% 68%',
      'accent': '274 50% 28%', 'accent-foreground': '270 70% 95%', 'border': '256 40% 24%', 'border-strong': '256 40% 32%',
      'border-focus': '274 100% 75%', 'input': '256 40% 24%', 'ring': '274 100% 75%', 'glass': '256 50% 15% / 0.75', 'glass-border': '256 40% 28% / 0.85',
    },
  };
