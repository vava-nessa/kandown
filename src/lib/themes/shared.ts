/**
 * @file Shared theme tokens
 * @description Status colors (destructive/success/warning) and grid tokens shared
 * by every theme preset, spread into each preset's light/dark token maps.
 */

import type { ThemeTokens } from '../types';

export const sharedLight = {
  'destructive': '0 72% 51%',
  'destructive-foreground': '0 0% 100%',
  'success': '148 55% 39%',
  'warning': '38 82% 49%',
  'grid': '220 13% 0% / 0.05',
  'grid-strong': '220 13% 0% / 0.085',
} satisfies Pick<ThemeTokens, 'destructive' | 'destructive-foreground' | 'success' | 'warning' | 'grid' | 'grid-strong'>;

export const sharedDark = {
  'destructive': '358 74% 59%',
  'destructive-foreground': '0 0% 100%',
  'success': '151 55% 42%',
  'warning': '38 82% 57%',
  'grid': '0 0% 100% / 0.018',
  'grid-strong': '0 0% 100% / 0.04',
} satisfies Pick<ThemeTokens, 'destructive' | 'destructive-foreground' | 'success' | 'warning' | 'grid' | 'grid-strong'>;

