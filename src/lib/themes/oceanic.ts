/**
 * @file "oceanic" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const oceanicTheme: KandownTheme = {
    id: 'oceanic',
    name: 'Abyssal Ocean',
    author: 'Deep Sea',
    description: 'Deep ocean trenches (#0B132B), bioluminescent cyan (#48CAE4) & wave foam.',
    appearance: { radius: '10px', borderWidth: '1px', shadows: 'elevated', density: 'comfortable', glass: true, motion: 'playful' },
    fonts: { sans: "'Plus Jakarta Sans', sans-serif", display: "'Syne', sans-serif", mono: "'SF Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '190 70% 95%', 'foreground': '210 50% 12%', 'card': '0 0% 100%', 'card-foreground': '210 50% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '210 50% 12%', 'primary': '198 85% 45%', 'primary-foreground': '0 0% 100%',
      'secondary': '190 40% 90%', 'secondary-foreground': '198 85% 25%', 'muted': '190 30% 89%', 'muted-foreground': '210 20% 45%',
      'accent': '190 60% 88%', 'accent-foreground': '198 85% 25%', 'border': '190 30% 82%', 'border-strong': '190 30% 74%',
      'border-focus': '198 85% 45%', 'input': '190 30% 84%', 'ring': '198 85% 45%', 'glass': '0 0% 100% / 0.8', 'glass-border': '190 30% 80% / 0.85',
    },
    dark: {
      ...sharedDark,
      'background': '223 60% 11%', 'foreground': '190 70% 92%', 'card': '223 50% 16%', 'card-foreground': '190 70% 92%',
      'popover': '223 50% 16%', 'popover-foreground': '190 70% 92%', 'primary': '189 74% 59%', 'primary-foreground': '223 60% 11%',
      'secondary': '223 40% 22%', 'secondary-foreground': '190 70% 92%', 'muted': '223 40% 20%', 'muted-foreground': '190 30% 65%',
      'accent': '189 50% 26%', 'accent-foreground': '190 70% 92%', 'border': '223 40% 25%', 'border-strong': '223 40% 34%',
      'border-focus': '189 74% 59%', 'input': '223 40% 25%', 'ring': '189 74% 59%', 'glass': '223 50% 16% / 0.75', 'glass-border': '223 40% 28% / 0.85',
    },
  };
