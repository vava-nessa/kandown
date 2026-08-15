/**
 * @file "vercel" theme preset
 * @description Vercel's black-and-white high-contrast look: pure white on
 * near-black, mono display type, compact density, no colored surfaces. The
 * only accent is the status trio shared with every preset. Dark mode is the
 * flagship; light mode is its inversion.
 *
 * 📖 The display font is a mono stack on purpose: it is the Vercel signature
 * (Geist Mono) and makes headings read as engineered, not editorial.
 *
 * @see src/lib/themes/shared.ts
 * @see src/lib/themes/index.ts
 */

import type { KandownTheme } from '../types';
import { sharedLight, sharedDark } from './shared';

export const vercelTheme: KandownTheme = {
    id: 'vercel',
    name: 'Vercel',
    author: 'Kandown',
    description: 'Black and white, mono display type, compact density. The Vercel high-contrast look.',
    appearance: { radius: '6px', borderWidth: '1px', shadows: 'soft', density: 'compact', glass: true, motion: 'subtle' },
    fonts: { sans: "'Inter var', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace", mono: "'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace" },
    light: {
      ...sharedLight,
      'background': '0 0% 98%', 'foreground': '0 0% 4%', 'card': '0 0% 100%', 'card-foreground': '0 0% 4%',
      'popover': '0 0% 100%', 'popover-foreground': '0 0% 4%', 'primary': '0 0% 4%', 'primary-foreground': '0 0% 100%',
      'secondary': '0 0% 96%', 'secondary-foreground': '0 0% 10%', 'muted': '0 0% 96%', 'muted-foreground': '0 0% 44%',
      'accent': '0 0% 93%', 'accent-foreground': '0 0% 8%', 'border': '0 0% 90%', 'border-strong': '0 0% 78%',
      'border-focus': '0 0% 4%', 'input': '0 0% 90%', 'ring': '0 0% 4%',
      'grid': '0 0% 4% / 0.05', 'grid-strong': '0 0% 4% / 0.09', 'glass': '0 0% 100% / 0.8', 'glass-border': '0 0% 90% / 0.8',
      'code-bg': '0 0% 95%', 'code-fg': '0 0% 12%', 'code-inline-bg': '0 0% 92%', 'code-inline-fg': '0 0% 15%', 'code-block-border': '0 0% 86%',
    },
    dark: {
      ...sharedDark,
      'background': '0 0% 4%', 'foreground': '0 0% 98%', 'card': '0 0% 6%', 'card-foreground': '0 0% 98%',
      'popover': '0 0% 7%', 'popover-foreground': '0 0% 98%', 'primary': '0 0% 98%', 'primary-foreground': '0 0% 4%',
      'secondary': '0 0% 13%', 'secondary-foreground': '0 0% 96%', 'muted': '0 0% 12%', 'muted-foreground': '0 0% 58%',
      'accent': '0 0% 15%', 'accent-foreground': '0 0% 96%', 'border': '0 0% 14%', 'border-strong': '0 0% 24%',
      'border-focus': '0 0% 90%', 'input': '0 0% 14%', 'ring': '0 0% 90%',
      'grid': '0 0% 100% / 0.03', 'grid-strong': '0 0% 100% / 0.06', 'glass': '0 0% 6% / 0.8', 'glass-border': '0 0% 16% / 0.8',
      'code-bg': '0 0% 8%', 'code-fg': '0 0% 92%', 'code-inline-bg': '0 0% 14%', 'code-inline-fg': '0 0% 80%', 'code-block-border': '0 0% 18%',
    },
  };
