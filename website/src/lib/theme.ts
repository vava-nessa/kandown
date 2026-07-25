/**
 * @file src/lib/theme.ts
 * @description Theme resolution and persistence, kept out of the component so
 * the no-flash inline script and the toggle button agree on one definition.
 *
 * 📖 The model has three states but only two appearances. `system` is the
 * default and follows `prefers-color-scheme`; `light` and `dark` are explicit
 * choices that override the OS in both directions. The stored value is the
 * *choice*, never the resolved appearance — otherwise a visitor who toggled once
 * in the evening would be pinned to dark forever, which is not what they asked
 * for.
 *
 * 📖 `THEME_INIT_SCRIPT` runs blocking in `<head>` before first paint. It is a
 * string rather than a module because it must execute before any bundle loads;
 * a flash of the wrong theme is far more jarring than the ~300 bytes it costs.
 *
 * @functions
 *   getStoredTheme  → the persisted choice, or 'system'
 *   resolveTheme    → choice + OS preference → 'light' | 'dark'
 *   applyTheme      → persist a choice and reflect it on <html>
 * @exports THEME_STORAGE_KEY, THEME_INIT_SCRIPT, getStoredTheme, resolveTheme, applyTheme
 * @see src/components/ThemeToggler.tsx — the UI that calls applyTheme
 */

export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'kandown-theme'

/**
 * 📖 Sets `data-theme` on `<html>` before the page paints. Deliberately tiny and
 * defensive: localStorage throws in Safari private mode and in sandboxed
 * iframes, and a failure here must degrade to the OS preference rather than
 * break the page.
 *
 * Absence of the attribute is meaningful — it is what lets the CSS
 * `:root:not([data-theme])` rule hand control back to `prefers-color-scheme`.
 */
export const THEME_INIT_SCRIPT = `
(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');
if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();
`.trim()

export function getStoredTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'system'
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice !== 'system') return choice
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)

  try {
    if (choice === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    /* Storage unavailable — the choice still applies for this page view. */
  }
}
