---
id: t277
status: In Progress
order: 3
created: 2026-07-28
updated: 2026-08-04T23:16:41Z
title: [THEMES] Theme store, community catalog, floating editor
priority: P1
ownerType: agent
assignee: pi
tags: [themes, store, community, editor, website]
---

## Goal

Replace the bundled theme gallery with a community-driven theme store that
mirrors the extension system: ship only the house theme (`kandown`), host
curated + community themes in a registry under `registry/themes/`, expose the
store inside the web UI (Settings → Themes) and on the website
(`kandown.dev/themes`), and ship a floating, draggable, minimizable editor so
users can tweak, export, and propose themes via a one-click GitHub PR link.

## Why now

The current theme gallery is 36 bundled presets in `src/lib/themes/` and
`THEME_PRESETS`, all curated in-house. The extension system has already proven
the community-store pattern works (registry + raw GitHub JSON + install into
`.kandown/extensions/`). Themes are a perfect mirror candidate and unblock three
follow-ups: a real theme-editor UX, a website vitrine that does not require
a rebuild for every new theme, and a low-friction contribution flow.

## Scope

- **Theme cleanup**: delete all of `src/lib/themes/` except `kandown.ts`,
  `shared.ts`, `index.ts`. Filter `THEME_PRESETS` and `SKIN_OPTIONS` in
  `src/lib/theme.ts` to keep `kandown` only.
- **Community registry**: `registry/themes.json` index + per-theme JSON files
  under `registry/themes/<id>.json` for `claude`, `linear`, `notion`. Each
  theme carries `id`, `name`, `author`, `description`, `repo`, `path`, `ref`,
  `minKandownVersion`, `tags`, and a full `KandownTheme` payload.
- **CLI store** (`src/cli/lib/themes-store.ts`): fetch registry, install by
  registry entry or pasted URL, mirror `extensions-store.ts`. CLI surface in
  `src/cli/lib/themes-cli.ts` + `kandown theme list|install|publish|create`.
- **Daemon API**: `GET /api/themes`, `POST /api/themes/install`,
  `DELETE /api/themes/<id>` in `src/cli/lib/server.ts`. Filesystem helpers
  (`serverListThemes`, `serverInstallTheme`, `serverUninstallTheme`,
  `serverFetchThemeRegistry`) in `src/lib/filesystem.ts`.
- **Web UI**: `src/components/settings/ThemesPanel.tsx` (Installed / Store
  tabs mirroring `ExtensionsPanel`), new `themes` section in
  `src/components/settings/schema.ts`, wired in `SettingsPage.tsx`. Add a
  "Get more themes" button to the existing skin picker.
- **Editor rewrite**: turn `ThemeCustomizerModal` into a floating panel
  (draggable by header, minimizable chip, compact size, position persisted
  in localStorage). Add a `Publish` tab with author / GitHub username inputs
  plus `Download JSON` and `Propose on GitHub` buttons (the latter opens a
  prefilled GitHub `new file` URL pointing at
  `registry/themes/<id>.json` with the JSON base64-encoded as the `value`
  query parameter). Add an `Advanced` tab with glass-intensity, border-width,
  font-display override, and custom-shadow controls.
- **Website vitrine**: `website/src/routes/themes.tsx` (Tanstack Router)
  that fetches `registry/themes.json` at build time / SSR and renders a
  card grid mirroring the extensions page.
- **Docs**: add the new subcommand to README, link to `/themes` from the
  features list, mention the editor and the GitHub submission flow.

## Out of scope

- Live preview pane inside the editor (v2 — the user explicitly deferred
  this; live theme application already provides a free preview via the
  surrounding app).
- i18n translations for new strings beyond English (English is the source
  of truth per AGENTS.md rule #4).
- Multi-step GitHub auth / auto-PR via API tokens (the GitHub "new file"
  URL flow is enough for v1 and stays zero-backend).

## Decisions

- **Submission flow** — `https://github.com/vava-nessa/kandown/new/main/registry/themes/<id>.json?filename=...&value=<base64>`.
  The user picks `décide`; the GitHub URL approach matches the extensions
  pattern, needs no token, and is what every README contributor already
  knows.
- **Bundled themes** — only `kandown`. `claude`, `linear`, `notion` live in
  the registry and are one-click installs, exactly like extensions.
- **Storage layout** — installed themes are single JSON files at
  `.kandown/themes/<id>.json` (one file per theme, no subdirectory). The
  app loads them via the existing `registerCustomThemes` mechanism in
  `src/lib/theme.ts`.
- **Editor shape** — rewrite existing `ThemeCustomizerModal` rather than
  keep two editors. The user picked 🟢 "rewrite" in the clarifying
  question.

## Files

- `src/lib/themes/{vercel,linear,claude,apple,...}.ts` (deleted, 36 files)
- `src/lib/themes/index.ts` (rewrite — `kandown` only)
- `src/lib/theme.ts` (filter `THEME_PRESETS` and `SKIN_OPTIONS`)
- `registry/themes.json` (new)
- `registry/themes/{claude,linear,notion}.json` (new)
- `src/cli/lib/themes-store.ts` (new)
- `src/cli/lib/themes-cli.ts` (new)
- `src/cli/cli.ts` (wire `kandown theme` subcommand)
- `src/cli/lib/server.ts` (add `/api/themes*` routes)
- `src/lib/filesystem.ts` (add `serverListThemes`, `serverInstallTheme`,
  `serverUninstallTheme`, `serverFetchThemeRegistry`)
- `src/components/settings/ThemesPanel.tsx` (new)
- `src/components/settings/schema.ts` (add `themes` section)
- `src/components/SettingsPage.tsx` (mount `ThemesPanel`)
- `src/components/settings/SettingRow.tsx` (add "Get more themes" CTA in
  the `skin` row)
- `src/components/ThemeCustomizerModal.tsx` (rewrite — floating, drag,
  minimize, compact, author, GitHub username, propose button, advanced tab)
- `src/lib/i18n/locales/en.json` (new keys)
- `website/src/routes/themes.tsx` (new)
- `README.md` (mention theme store + editor + URL)
