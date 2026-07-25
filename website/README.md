# Kandown website

The marketing site and documentation for [Kandown](https://github.com/vava-nessa/kandown), at
`kandown.dev`.

Built with **TanStack Start** (React 19, Vite 7), **Tailwind v4**, and an MDX content pipeline with
**Shiki** highlighting. Every page is prerendered to static HTML at build time, so the deployed
site is a folder of files — the same promise the product makes.

---

## Develop

```bash
pnpm install
pnpm dev            # http://localhost:4321
```

This is a **standalone workspace**: `website/pnpm-workspace.yaml` stops pnpm from walking up into
the Kandown CLI's workspace, so the two dependency trees never interfere. Run `pnpm` commands from
inside `website/`.

| Script | What it does |
|---|---|
| `pnpm dev` | Build the search index, then start Vite on port 4321 |
| `pnpm build` | Build the search index, then build + prerender every page |
| `pnpm start` | Serve the production build |
| `pnpm search-index` | Rebuild the search index alone (after editing content mid-session) |
| `pnpm typecheck` | TypeScript, no emit |

---

## Writing documentation

Docs pages are MDX files under `src/content/docs/`. The path under that folder **is** the URL:
`src/content/docs/agents/mcp.mdx` → `/docs/agents/mcp`.

Adding a page is two steps:

1. Create the `.mdx` file with frontmatter:

   ```mdx
   ---
   title: MCP server
   section: AI agents
   description: One sentence, used for the page subtitle and the meta description.
   ---
   ```

2. Add it to the sidebar in [`src/content/nav.ts`](src/content/nav.ts). That file also drives the
   previous/next footer links and the order of the docs index.

### What you get for free

- **Syntax highlighting** on fenced code blocks, at build time, via Shiki with paired light/dark
  themes.
- **Heading anchors** on every `##` and `###`, and an automatic "On this page" outline.
- **Search** — the page is indexed section by section on the next `pnpm dev` / `pnpm build`.
- **Internal links** written as plain markdown (`[CLI](/docs/reference/cli)`) become client-side
  router links automatically.
- **`<Callout>`**, usable directly in MDX without importing it:

  ```mdx
  <Callout type="tip">
  Kandown never contacts the network for task commands.
  </Callout>
  ```

  `type` is `note` (default), `tip` or `warn`.

<!-- prettier-ignore -->
> Restart `pnpm dev` — or run `pnpm search-index` — after adding a page, so search picks it up.

---

## The hero video

The hero renders `<video>` from `public/`. To add the demo:

| File | Purpose |
|---|---|
| `public/demo.webm` | Preferred source — smaller, better quality per byte |
| `public/demo.mp4` | Fallback for Safari and older browsers |
| `public/demo-poster.png` | Still frame shown before playback and on reduced-motion |

Nothing else needs changing. Until those files exist the component falls back to the animated
`BoardMock`, so the hero is never an empty rectangle.

Recording notes: the frame is `16/10`, so record at **1920×1200** (or 2560×1600). Keep it under
~20 seconds and loop-friendly — it autoplays muted and repeats.

---

## The interactive demo

`/demo` embeds the **real Kandown application**, running on a project that lives
in the browser's memory. Drag a card, edit a task, archive one — then reload and
it is all back.

It is built, not written. `scripts/build-demo.mjs` runs before every site build:
it invokes `pnpm build:demo` in the repository root, copies the result into
`public/demo/app/`, and stamps `src/generated/demo-meta.json` with the version it
built. Both are gitignored — **never edit or commit them**. A demo that could
outlive the code it demonstrates is worse than no demo, so a failure in that
script fails the deploy rather than shipping a stale bundle.

| Command | What it does |
|---|---|
| `pnpm demo` | Rebuild the demo now |
| `KANDOWN_DEMO_SKIP=1 pnpm build` | Build the site without it (the page says so) |

`pnpm dev` only builds it if it is missing, so day-to-day work on the docs does
not pay for it. Delete `public/demo/` to force a rebuild.

### How it works

The application has one I/O choke point — `apiFetch` in `src/lib/filesystem.ts`
— through which every call to the CLI's REST API passes. The demo build registers
an in-memory implementation of that same API (`src/lib/demoBackend.ts`), so the
board, drawer, editor, search and archive all work without knowing anything
changed. Nothing is mocked, because there is nothing to mock.

Memory rather than `localStorage` is deliberate: the reset is then free and
total. Nothing is written to the visitor's browser at all — not even the theme
preference or the onboarding flag.

The whole demo is compiled out of the bundle `npx kandown` ships, behind the
`__KANDOWN_DEMO_BUILD__` define.

---

## Design

**Direction: editorial / terminal.** The rules that keep it from drifting back into a template:

- **Everything is left-aligned.** A centred hero with two centred buttons under it is the most
  recognisable landing-page cliché there is.
- **Structure is drawn with 1px rules, not cards.** Sections are separated by full-bleed hairlines
  and numbered `01`–`05` in mono.
- **No glow, no gradient mesh, no floating pill badge.** The only solid use of the accent is the
  highlight behind one word in the `h1`.
- **Prose is Geist, every label is Geist Mono.** Eyebrows, column headers, counts, table headers,
  nav items, kbd — all mono, uppercase, wide-tracked. That split is the page's voice, and it is
  honest to a product whose database is a folder of text files.

Palette from `logo.svg`: deep green-black surfaces (`#08150f` → `#12271f`) and the arrow's lime
(`#88e138`) as the single accent. Borders are deliberately visible — a layout built from rules
needs rules you can see.

### Typography

Geist and Geist Mono (SIL OFL — see `public/fonts/LICENSE.txt`), self-hosted as two variable
`woff2` files of ~70 KB each, covering every weight. Self-hosted rather than CDN-loaded for the
same reason the product works offline. Both are preloaded in `<head>`, so there is no flash of the
fallback on a cold load, and a metric-matched `@font-face` fallback holds the layout in the
meantime.

### Theming

Three layers, resolved in `src/styles.css` in this order:

1. `:root` holds the **light** values — the baseline.
2. `prefers-color-scheme: dark` overrides them for a document with no explicit `data-theme`. This
   is the first-visit behaviour: follow the OS.
3. `:root[data-theme="dark"|"light"]` wins outright — the visitor's own choice, set by the header
   toggle and persisted in `localStorage` under `kandown-theme`.

The mechanism is `@theme inline`, which makes every Tailwind utility emit `var(--kd-…)` instead of
baking in the colour. Flipping the variables on `:root` re-themes the whole page in one frame, with
no re-render. Shiki's dual themes are swapped by the same selectors, so highlighting follows along
with zero JavaScript.

Only the *choice* is stored, never the resolved appearance — a visitor on `system` keeps following
their OS, including live at sunset.

### The toggle

`src/components/ThemeToggler.tsx`, ported from
[vanessadepraute.dev](https://vanessadepraute.dev) and rebuilt without framer-motion or lucide. It
uses the **View Transitions API**: `flushSync` applies the theme inside
`document.startViewTransition`, then a `clip-path` circle animates on
`::view-transition-new(root)`, wiping the incoming theme outward from the button. The radius is
computed to the furthest viewport corner so the wipe always covers the screen.

Degrades three ways: browsers without View Transitions swap instantly, `prefers-reduced-motion`
skips the animation, and `src/lib/theme.ts` exports a blocking init script rendered in `<head>` so
a stored choice never flashes the wrong theme on load.

---

## Deployment

Vercel, configured by [`vercel.json`](vercel.json). Import `website/` as the project root; the
committed config supplies everything else:

| Setting | Value |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Build | `pnpm build` |
| Output | `dist/client` |

Because every page prerenders, the deployment is **fully static** — no serverless function, no
cold start. `dist/client/404.html` is emitted from `src/routes/404.tsx` so unmatched paths get the
site's own 404 rather than the host's.

`vercel.json` also sets long-lived immutable caching for hashed assets and media, security headers
(HSTS, `nosniff`, `DENY` framing, a restrictive `Permissions-Policy`), and a few short redirects
(`/github`, `/npm`, `/documentation`).

---

## Layout

```
website/
├── public/
│   ├── fonts/               # Geist + Geist Mono, self-hosted (OFL)
│   ├── demo/app/            # ← the built application (generated, gitignored)
│   └── …                    # favicons, og-image, demo video (you supply)
├── scripts/
│   ├── build-search-index.mjs
│   └── build-demo.mjs       # ← rebuilds the demo from the CLI sources
├── src/
│   ├── components/          # header, footer, sidebar, search, landing pieces
│   ├── content/
│   │   ├── docs/            # ← the documentation, as MDX
│   │   └── nav.ts           # ← the sidebar
│   ├── generated/           # search index (gitignored)
│   ├── lib/                 # site constants, MDX resolution, theme handling
│   ├── routes/              # file-based routing
│   ├── router.tsx
│   └── styles.css           # design tokens + prose styles
├── vercel.json
└── vite.config.ts           # Start + MDX + Shiki + Tailwind
```

Every file carries a JSDoc `@file` / `@description` header, matching the convention in the main
repository.
