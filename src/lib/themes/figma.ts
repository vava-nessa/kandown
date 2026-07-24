/**
 * @file "figma" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const figmaTheme: KandownTheme = {
    id: 'figma',
    name: 'Figma Studio',
    author: 'Figma',
    description: 'Vector canvas theme: slate black (#1E1E1E), hot coral (#F24E1E) & violet accents.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'Inter Tight', sans-serif", display: "'Plus Jakarta Sans', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 96%', 'foreground': '0 0% 12%', 'card': '0 0% 100%', 'card-foreground': '0 0% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '0 0% 12%', 'primary': '14 89% 53%', 'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 90%', 'secondary-foreground': '14 89% 40%', 'muted': '0 0% 91%', 'muted-foreground': '0 0% 45%',
      'accent': '14 80% 93%', 'accent-foreground': '14 89% 40%', 'border': '0 0% 86%', 'border-strong': '0 0% 78%',
      'border-focus': '14 89% 53%', 'input': '0 0% 88%', 'ring': '14 89% 53%', 'glass': '0 0% 100% / 0.85', 'glass-border': '0 0% 84% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 12%', 'foreground': '0 0% 96%', 'card': '0 0% 16%', 'card-foreground': '0 0% 96%',
      'popover': '0 0% 16%', 'popover-foreground': '0 0% 96%', 'primary': '266 100% 67%', 'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 22%', 'secondary-foreground': '0 0% 96%', 'muted': '0 0% 20%', 'muted-foreground': '0 0% 65%',
      'accent': '266 40% 28%', 'accent-foreground': '0 0% 96%', 'border': '0 0% 24%', 'border-strong': '0 0% 32%',
      'border-focus': '266 100% 67%', 'input': '0 0% 24%', 'ring': '266 100% 67%', 'glass': '0 0% 16% / 0.8', 'glass-border': '0 0% 28% / 0.85',
    },
  };
