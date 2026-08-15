/**
 * @file Theme preset registry
 * @description Aggregates every bundled theme preset into the THEME_PRESETS
 * array consumed by the theme engine (src/lib/theme.ts). Four curated presets
 * ship in the bundle since 0.53.0: `shadcn` (the clean zinc default),
 * `vercel` (black/white mono), `linear` (violet dark-first) and the house
 * `kandown` lime theme. Community submissions live in the registry
 * (`registry/themes.json`) and are installed at runtime into
 * `.kandown/themes/<id>.json`; the installed half is registered via
 * `registerCustomThemes(...)`.
 *
 * 📖 `shadcn` is deliberately first: `resolveTheme` and `normalizeSkinId`
 * fall back to `THEME_PRESETS[0]` for unknown ids, so the clean default is
 * also the safety net.
 *
 * @see src/lib/theme.ts
 * @see src/cli/lib/themes-store.ts
 */

import type { KandownTheme } from '../types';
import { shadcnTheme } from './shadcn';
import { vercelTheme } from './vercel';
import { linearTheme } from './linear';
import { kandownTheme } from './kandown';

export { shadcnTheme } from './shadcn';
export { vercelTheme } from './vercel';
export { linearTheme } from './linear';
export { kandownTheme } from './kandown';
export { sharedLight, sharedDark } from './shared';

/** 📖 Bundled presets, in gallery order. `shadcn` first = the default and the
 * unknown-id fallback. */
export const THEME_PRESETS: KandownTheme[] = [shadcnTheme, vercelTheme, linearTheme, kandownTheme];
