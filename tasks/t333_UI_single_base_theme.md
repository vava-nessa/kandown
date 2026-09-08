---
id: t333
title: "[UI] One clean base theme, customizer UI removed"
status: Review
priority: P1
tags: [ui, redesign, theme]
created: 2026-09-08
updated: 2026-09-08T00:30:00Z
order: 2
---

# [UI] One clean base theme, customizer UI removed

Slice 2 of the UI redesign decided with vava on 2026-09-08. The token engine
stays (variants will be built from the base theme later); the theme
supermarket goes.

## Scope

- Keep `src/lib/theme.ts` (tokens, mode resolution, code-token safety net,
  `base:` inheritance) and the community store on the CLI side. The
  functionality is kept, only the in-app switching UI is removed.
- Remove from the UI: `ThemeCustomizerModal.tsx`, `ThemeCustomizerLauncher.tsx`,
  `ThemePreviewCard.tsx`, `settings/ThemesPanel.tsx` and the font/background
  pickers. Config values are normalized to the single base theme.
- Collapse `src/lib/themes/` presets (shadcn, vercel, linear, kandown) into
  one redesigned `base` theme: light and dark both polished, glass off,
  Inter only, 4/8px spacing discipline. Unknown/legacy skin ids normalize
  to `base`.
- Font picker gone: Inter only for now.

## Decisions

- Variants (future re-additions) inherit from `base` via the existing
  inheritance field; no second engine.
- Light and dark both stay (vava, Q1).

## Acceptance criteria

- [x] Settings no longer offers theme presets, fonts, background or glass options. (report: ui.skin / ui.background / ui.font rows and the Themes section removed from the schema; SettingRow skin gallery deleted)
- [x] Every previously valid skin id resolves to the base theme with no runtime error. (report: normalizeSkinId falls back to `base`; DEFAULT_CONFIG.ui.skin = base; TUI settings skin/font rows removed as inert)
- [ ] Light and dark modes both render correctly across board, list, editor, settings and agent chat. (report: final browser pass pending)
- [x] pnpm build passes. (report: typecheck + build green)

## Reports

- 2026-09-08: Wrote the single `base` theme (neutral surfaces, brand lime
  primary, glass off, 6px radius, Inter pinned) in src/lib/themes/base.ts;
  deleted the shadcn/vercel/linear/kandown presets and collapsed the
  registry to [base]. Removed ThemeCustomizerLauncher, ThemeCustomizerModal,
  ThemePreviewCard, ThemeToggle (dead), ThemesPanel and the skin picker
  branch from SettingRow; dropped the ui.skin/ui.background/ui.font setting
  rows and the Themes settings section. The engine, registerCustomThemes,
  the CLI theme store and /api/themes stay: installed community themes still
  resolve via ui.skin in kandown.json. Variants later inherit from `base`.
