/**
 * @file "supabase" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const supabaseTheme: KandownTheme = {
    id: 'supabase',
    name: 'Supabase Emerald',
    author: 'Supabase',
    description: 'Developer dark studio (#1C1C1C) with vibrant neon emerald green accents (#3ECF8E).',
    appearance: { radius: '6px', borderWidth: '1px', shadows: 'soft', density: 'compact', glass: true, motion: 'subtle' },
    fonts: { sans: "'DM Sans', sans-serif", display: "'Outfit', sans-serif", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '210 40% 98%', 'foreground': '215 25% 12%', 'card': '0 0% 100%', 'card-foreground': '215 25% 12%',
      'popover': '0 0% 100%', 'popover-foreground': '215 25% 12%', 'primary': '158 64% 52%', 'primary-foreground': '0 0% 100%',
      'secondary': '210 20% 94%', 'secondary-foreground': '158 64% 30%', 'muted': '210 15% 93%', 'muted-foreground': '215 12% 45%',
      'accent': '158 50% 92%', 'accent-foreground': '158 64% 30%', 'border': '210 15% 88%', 'border-strong': '210 15% 80%',
      'border-focus': '158 64% 52%', 'input': '210 15% 90%', 'ring': '158 64% 52%', 'glass': '0 0% 100% / 0.85', 'glass-border': '210 15% 86% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 11%', 'foreground': '0 0% 94%', 'card': '0 0% 15%', 'card-foreground': '0 0% 94%',
      'popover': '0 0% 15%', 'popover-foreground': '0 0% 94%', 'primary': '158 64% 52%', 'primary-foreground': '0 0% 5%',
      'secondary': '0 0% 20%', 'secondary-foreground': '0 0% 94%', 'muted': '0 0% 18%', 'muted-foreground': '0 0% 62%',
      'accent': '158 40% 20%', 'accent-foreground': '0 0% 94%', 'border': '0 0% 22%', 'border-strong': '0 0% 30%',
      'border-focus': '158 64% 52%', 'input': '0 0% 22%', 'ring': '158 64% 52%', 'glass': '0 0% 15% / 0.8', 'glass-border': '0 0% 26% / 0.85',
    },
  };
