/**
 * @file "github" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const githubTheme: KandownTheme = {
    id: 'github',
    name: 'GitHub Primer',
    author: 'GitHub',
    description: 'Classic GitHub Primer design system (#0D1117), crisp borders, official Octicon blue accent.',
    appearance: { radius: '6px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: false, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'DM Sans', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 100%', 'foreground': '215 28% 17%', 'card': '0 0% 100%', 'card-foreground': '215 28% 17%',
      'popover': '0 0% 100%', 'popover-foreground': '215 28% 17%', 'primary': '212 92% 45%', 'primary-foreground': '0 0% 100%',
      'secondary': '210 24% 96%', 'secondary-foreground': '215 28% 17%', 'muted': '210 24% 96%', 'muted-foreground': '215 14% 46%',
      'accent': '212 92% 95%', 'accent-foreground': '212 92% 35%', 'border': '214 20% 88%', 'border-strong': '214 20% 78%',
      'border-focus': '212 92% 45%', 'input': '214 20% 88%', 'ring': '212 92% 45%', 'glass': '0 0% 100% / 0.85', 'glass-border': '214 20% 85% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '217 33% 7%', 'foreground': '210 17% 82%', 'card': '216 28% 12%', 'card-foreground': '210 17% 82%',
      'popover': '216 28% 12%', 'popover-foreground': '210 17% 82%', 'primary': '213 94% 68%', 'primary-foreground': '217 33% 7%',
      'secondary': '217 19% 18%', 'secondary-foreground': '210 17% 82%', 'muted': '217 19% 15%', 'muted-foreground': '215 14% 60%',
      'accent': '213 94% 20%', 'accent-foreground': '210 17% 82%', 'border': '215 18% 22%', 'border-strong': '215 18% 30%',
      'border-focus': '213 94% 68%', 'input': '215 18% 22%', 'ring': '213 94% 68%', 'glass': '216 28% 12% / 0.85', 'glass-border': '215 18% 25% / 0.9',
    },
  };
