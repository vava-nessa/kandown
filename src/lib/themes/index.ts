/**
 * @file Theme preset registry
 * @description Aggregates every bundled theme preset into the THEME_PRESETS
 * array consumed by the theme engine (src/lib/theme.ts). After the community
 * store landed, only the house theme ships in the bundle — `claude`,
 * `linear`, `notion` and everything else live in the registry and are
 * installed at runtime into `.kandown/themes/<id>.json`. This module owns
 * the bundled half; the installed half is registered via
 * `registerCustomThemes(...)`.
 *
 * @see src/lib/theme.ts
 * @see src/cli/lib/themes-store.ts
 */

import type { KandownTheme } from '../types';
import { kandownTheme } from './kandown';

export { kandownTheme } from './kandown';
export { sharedLight, sharedDark } from './shared';

/** 📖 Bundled presets — only `kandown` ships in the package. Everything else
 * comes from the registry at `registry/themes.json`. */
export const THEME_PRESETS: KandownTheme[] = [kandownTheme];