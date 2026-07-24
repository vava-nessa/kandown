/**
 * @file "dracula" theme preset
 * @description Curated appearance/color-token preset for the theme gallery.
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const draculaTheme: KandownTheme = {
    id: 'dracula',
    name: 'Dracula Pro',
    author: 'Zeno Rocha',
    description: 'Vampiric dark theme: Gothic purple (#282A36), neon pink (#FF79C6) and cyan accents.',
    appearance: { radius: '8px', borderWidth: '1px', shadows: 'soft', density: 'comfortable', glass: true, motion: 'subtle' },
    fonts: { sans: "'Fira Code', monospace", display: "'Fira Code', monospace", mono: "'Fira Code', monospace" },
    light: {
      ...sharedLight,
      'background': '250 20% 97%', 'foreground': '231 15% 18%', 'card': '0 0% 100%', 'card-foreground': '231 15% 18%',
      'popover': '0 0% 100%', 'popover-foreground': '231 15% 18%', 'primary': '326 100% 74%', 'primary-foreground': '0 0% 100%',
      'secondary': '250 20% 92%', 'secondary-foreground': '231 15% 18%', 'muted': '250 15% 92%', 'muted-foreground': '231 10% 45%',
      'accent': '326 60% 92%', 'accent-foreground': '326 100% 35%', 'border': '250 15% 85%', 'border-strong': '250 15% 76%',
      'border-focus': '326 100% 74%', 'input': '250 15% 86%', 'ring': '326 100% 74%', 'glass': '0 0% 100% / 0.85', 'glass-border': '250 15% 82% / 0.9',
    },
    dark: {
      ...sharedDark,
      'background': '231 15% 18%', 'foreground': '60 30% 96%', 'card': '232 14% 24%', 'card-foreground': '60 30% 96%',
      'popover': '232 14% 24%', 'popover-foreground': '60 30% 96%', 'primary': '326 100% 74%', 'primary-foreground': '231 15% 18%',
      'secondary': '232 14% 30%', 'secondary-foreground': '60 30% 96%', 'muted': '232 14% 27%', 'muted-foreground': '225 27% 68%',
      'accent': '265 89% 30%', 'accent-foreground': '60 30% 96%', 'border': '232 14% 34%', 'border-strong': '232 14% 42%',
      'border-focus': '326 100% 74%', 'input': '232 14% 34%', 'ring': '326 100% 74%', 'glass': '232 14% 24% / 0.8', 'glass-border': '232 14% 36% / 0.85',
    },
  };
