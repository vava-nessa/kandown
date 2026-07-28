/**
 * @file Project theme engine (FABLE_UI)
 * @description Manages customizable JSON themes, appearance tokens (--radius,
 * --shadow-*, --font-display, --motion-scale), curated presets (Vercel, Linear,
 * Claude, Apple, Stripe, Paper, Catppuccin, Terminal), and dynamic inheritance.
 *
 * @functions
 *  → registerCustomThemes — registers user custom themes into runtime
 *  → getAllThemes — returns built-in presets + registered custom themes
 *  → resolveTheme — resolves theme with inheritance base merging & fallback
 *  → normalizeSkinId — validates skin / theme id
 *  → applyProjectTheme — applies tokens, appearance variables, and mode to document
 *
 * @exports FONT_OPTIONS, BACKGROUND_OPTIONS, THEME_PRESETS, SKIN_OPTIONS,
 *          registerCustomThemes, getAllThemes, resolveTheme, applyProjectTheme,
 *          normalizeThemeMode, normalizeSkinId, normalizeFontId, normalizeBackgroundId
 * @see src/lib/types.ts
 * @see src/styles/globals.css
 */

import type {
  BackgroundId,
  FontId,
  KandownTheme,
  SkinId,
  ThemeAppearance,
  ThemeMode,
  ThemeTokens,
  TokenName,
} from './types';

export interface FontOption {
  id: FontId;
  label: string;
  stack: string;
}

export interface BackgroundOption {
  id: BackgroundId;
  label: string;
  description: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'inter',
    label: 'Inter',
    stack: "'Inter var', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    id: 'system',
    label: 'System',
    stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  {
    id: 'serif',
    label: 'Editorial',
    stack: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif",
  },
  {
    id: 'mono',
    label: 'Mono',
    stack: "'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  },
  {
    id: 'rounded',
    label: 'Rounded',
    stack: "'SF Pro Rounded', ui-rounded, 'Nunito Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  },
];

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  {
    id: 'solid',
    label: 'Solid',
    description: 'Flat background color from the skin.',
  },
  {
    id: 'static-gradient',
    label: 'Static Gradient',
    description: 'A subtle static gradient background.',
  },
];

// 📖 Bundled theme: only `kandown` ships with the package. Additional themes
// — curated (claude, linear, notion) and community submissions — come from
// the community registry at `registry/themes.json` and are installed as JSON
// files under `.kandown/themes/<id>.json`. `registerCustomThemes` folds those
// in at runtime; `getAllThemes` returns [bundled, ...installed] in that order.
// See src/cli/lib/themes-store.ts for the install path.
import { THEME_PRESETS } from './themes';
export { THEME_PRESETS };


/** 📖 Legacy SkinId mapping for backwards compatibility with older kandown.json configs */
// 📖 Pre-FABLE_UI skin ids kept alive so old .kandown/config.json files still resolve.
// `kandown` used to be an alias for `vercel`; it is now a real preset, so it is no
// longer mapped here — an alias would shadow the theme of the same name.
// 📖 All other legacy skin ids (sage/claude, cobalt/linear, graphite/paper,
// rose/catppuccin) are now resolved to the bundled `kandown` theme by
// `normalizeSkinId` when the alias target is not installed — the registry
// used to ship them, but the bundled palette is the only thing in the
// package now. Users who want the old look install the theme from
// `registry/themes.json` via `kandown theme install`.
const LEGACY_SKIN_MAP: Record<string, string> = {};

export interface LegacySkinOption {
  id: SkinId;
  label: string;
  description: string;
  light: ThemeTokens;
  dark: ThemeTokens;
}

export const SKIN_OPTIONS: LegacySkinOption[] = THEME_PRESETS.map(t => ({
  id: t.id,
  label: t.name,
  description: t.description ?? '',
  light: t.light,
  dark: t.dark,
}));

let customThemesRegistry: KandownTheme[] = [];

export function registerCustomThemes(themes?: KandownTheme[]): void {
  if (Array.isArray(themes)) {
    customThemesRegistry = themes;
  }
}

export function getAllThemes(): KandownTheme[] {
  return [...THEME_PRESETS, ...customThemesRegistry];
}

export function resolveTheme(skinId: string): KandownTheme {
  const all = getAllThemes();
  const targetId = LEGACY_SKIN_MAP[skinId] ?? skinId;
  let found = all.find(t => t.id === targetId);

  if (!found) {
    // 📖 THEME_PRESETS[0] is `kandown` (the only bundled theme). The cast
    // tells TypeScript the array is non-empty by contract.
    found = THEME_PRESETS[0] as KandownTheme;
  }

  if (found.base) {
    const parent = all.find(t => t.id === found.base) ?? THEME_PRESETS[0];
    return {
      ...parent,
      ...found,
      appearance: { ...parent.appearance, ...found.appearance },
      fonts: { ...parent.fonts, ...found.fonts },
      light: { ...parent.light, ...found.light },
      dark: { ...parent.dark, ...found.dark },
      columnAccents: { ...parent.columnAccents, ...found.columnAccents },
    };
  }

  return found;
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

export function normalizeSkinId(value: unknown): SkinId {
  if (typeof value !== 'string') return 'kandown';
  const all = getAllThemes();
  const target = LEGACY_SKIN_MAP[value] ?? value;
  return all.some(t => t.id === target) ? target : 'kandown';
}

export function normalizeFontId(value: unknown): FontId {
  return FONT_OPTIONS.some(font => font.id === value) ? (value as FontId) : 'inter';
}

export function normalizeBackgroundId(value: unknown): BackgroundId {
  return BACKGROUND_OPTIONS.some(bg => bg.id === value) ? (value as BackgroundId) : 'solid';
}

function resolveMode(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function getShadowValue(level: ThemeAppearance['shadows'], type: 'card' | 'popover' | 'drawer'): string {
  if (level === 'none') {
    return type === 'popover' ? '0 2px 8px rgb(0 0 0 / 0.2)' : 'none';
  }
  if (level === 'soft') {
    if (type === 'card') return '0 1px 3px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.04)';
    if (type === 'popover') return '0 4px 16px rgb(0 0 0 / 0.12)';
    return '0 8px 32px rgb(0 0 0 / 0.15)';
  }
  if (level === 'elevated') {
    if (type === 'card') return '0 4px 12px rgb(0 0 0 / 0.08)';
    if (type === 'popover') return '0 12px 32px rgb(0 0 0 / 0.18)';
    return '0 16px 48px rgb(0 0 0 / 0.25)';
  }
  // dramatic
  if (type === 'card') return '0 8px 24px rgb(0 0 0 / 0.15)';
  if (type === 'popover') return '0 20px 48px rgb(0 0 0 / 0.3)';
  return '0 24px 64px rgb(0 0 0 / 0.35)';
}

export function applyProjectTheme(
  theme: ThemeMode,
  skinId: SkinId,
  fontId: FontId,
  backgroundId: BackgroundId = 'solid'
): void {
  const root = document.documentElement;
  const resolvedMode = resolveMode(theme);
  const activeTheme = resolveTheme(skinId);
  const font = FONT_OPTIONS.find(item => item.id === fontId) ?? FONT_OPTIONS[0];
  const tokens = activeTheme[resolvedMode];
  const appearance = activeTheme.appearance;

  root.classList.toggle('dark', resolvedMode === 'dark');
  root.dataset.theme = theme;
  root.dataset.resolvedTheme = resolvedMode;
  root.dataset.skin = activeTheme.id;
  root.dataset.font = font.id;
  root.dataset.background = backgroundId;
  root.dataset.density = appearance.density;
  root.dataset.motion = appearance.motion;
  root.dataset.glass = appearance.glass ? 'true' : 'false';
  root.style.setProperty('color-scheme', resolvedMode);

  // Fonts
  const sansFont = activeTheme.fonts?.sans ?? font.stack;
  const displayFont = activeTheme.fonts?.display && activeTheme.fonts.display !== 'same'
    ? activeTheme.fonts.display
    : sansFont;
  const monoFont = activeTheme.fonts?.mono ?? "'SF Mono', Menlo, Monaco, Consolas, monospace";

  root.style.setProperty('--font-sans', sansFont);
  root.style.setProperty('--font-display', displayFont);
  root.style.setProperty('--font-mono', monoFont);

  // Appearance Tokens
  const radius = appearance.radius || '6px';
  root.style.setProperty('--radius', radius);
  root.style.setProperty('--radius-sm', `calc(${radius} * 0.67)`);
  root.style.setProperty('--radius-lg', `calc(${radius} * 1.5)`);
  root.style.setProperty('--border-width', appearance.borderWidth ?? '1px');

  root.style.setProperty('--motion-scale', appearance.motion === 'none' ? '0' : appearance.motion === 'playful' ? '1.2' : '1');
  // 📖 `glassIntensity` (0-100, defaults to 20) tunes the backdrop blur when
  // glassmorphism is on. Curated themes ship a calibrated value; the editor's
  // Advanced tab lets the user override it live.
  const blurPx = appearance.glassIntensity ?? 20;
  root.style.setProperty('--card-blur', appearance.glass ? `blur(${blurPx}px) saturate(180%)` : 'none');

  // 📖 Per-level shadow overrides win over the level-derived shadow. Themes
  // that ship a custom shadow (linear's elevated popover, notion's none, etc.)
  // declare it in `appearance.shadowCard/Popover/Drawer` so the editor can
  // tweak it without re-deriving from the four built-in levels.
  root.style.setProperty('--shadow-card', appearance.shadowCard || getShadowValue(appearance.shadows, 'card'));
  root.style.setProperty('--shadow-popover', appearance.shadowPopover || getShadowValue(appearance.shadows, 'popover'));
  root.style.setProperty('--shadow-drawer', appearance.shadowDrawer || getShadowValue(appearance.shadows, 'drawer'));

  // HSL Color Tokens
  for (const [name, value] of Object.entries(tokens) as Array<[TokenName, string]>) {
    root.style.setProperty(`--${name}`, value);
  }
}
