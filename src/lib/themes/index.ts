/**
 * @file Theme preset registry
 * @description Aggregates the bundled theme presets into the THEME_PRESETS
 * array consumed by the theme engine (src/lib/theme.ts). Since the UI
 * redesign (t333) exactly one preset ships in the bundle: `base`, the clean
 * neutral house theme. Community submissions still live in the registry
 * (`registry/themes.json`) and install into `.kandown/themes/<id>.json`;
 * the installed half is registered via `registerCustomThemes(...)` and stays
 * selectable through `ui.skin` in `kandown.json` even though the in-app
 * picker is gone. New variants should inherit from `base` through the
 * engine's `base:` field.
 *
 * 📖 `base` is deliberately first and only: `resolveTheme` and
 * `normalizeSkinId` fall back to `THEME_PRESETS[0]` for unknown ids, so the
 * house look is also the safety net.
 *
 * @see src/lib/theme.ts
 * @see src/lib/themes/base.ts
 * @see src/cli/lib/themes-store.ts
 */

import type { KandownTheme } from '../types';
import { baseTheme } from './base';

export { baseTheme };
export { sharedLight, sharedDark } from './shared';

/** 📖 Bundled presets. `base` first = the default and the unknown-id
 * fallback. */
export const THEME_PRESETS: KandownTheme[] = [baseTheme];
