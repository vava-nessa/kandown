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
| `pnpm llms` | Rebuild the `llms.txt` index and per-page Markdown twins |
| `pnpm changelogs` | Rebuild the `/changelogs` assets from `<repo>/changelogs/` |
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

## Homepage video storyboard

The homepage uses black storyboard frames until the real product recordings are ready. Each frame
contains its own scenario, duration, aspect ratio, and expected filename, so the deployed page also
acts as the current recording brief.

Record every clip at **1920×1200** or **2560×1600** in a 16:10 aspect ratio. Keep movements slow
enough to understand without narration, hide unrelated notifications, and end looped clips on a
frame that can cut cleanly back to the beginning.

| File in `public/` | Length | Recording brief |
|---|---:|---|
| `demo.webm` | 12 to 15 sec | Create a task in the web board, add subtasks, assign an agent, move it into progress, save a completion report, and finish in Done. |
| `agent-handoff.webm` | 10 to 12 sec | Start a task with Codex in the TUI, save partial progress and a report, then launch Claude on the same task and finish it from the saved context. |
| `markdown-sync.webm` | 8 to 10 sec | Show a real task file beside the real board while title, priority, assignee, checklist, and status edits appear in Kandown. |
| `interface-web.webm` | 6 to 8 sec | Create, drag, open, edit, and search for a task in the web board. |
| `interface-tui.webm` | 6 to 8 sec | Navigate, inspect, move, and launch an agent from the terminal UI. |
| `interface-cli.webm` | 5 to 6 sec | Create a task, run `kandown work`, move the task to Done, and show the same result on the board. |

Use WebM as the primary delivery format. A poster frame and MP4 fallback can be added during the
integration pass once the recordings exist. Avoid GIFs because they are larger, look worse, and
cannot respect reduced-motion preferences.

---

## The changelog page

`/changelogs` exposes the per-release Markdown files that already ship with the
Kandown package (`<repo>/changelogs/vX.Y.Z.md`). The site reads them, so a new
release file in the repo becomes a new URL — `/changelogs/v0.37.0` —
automatically, with no further wiring.

Adding a release is therefore one step:

1. Drop a `vX.Y.Z.md` file in `<repo>/changelogs/` whose H1 matches
   `# 0.X.Y — YYYY-MM-DD — "Name"`. The build script rejects anything else.

`scripts/build-changelogs.mjs` then parses every file, runs the body through the
same `remark + rehype-shiki` pipeline the docs use, and emits three things under
`public/changelogs/`:

| File | Used by |
|---|---|
| `index.json` | The sidebar — year-grouped list of `{ slug, version, date, name }`. |
| `vX.Y.Z.html` | The article body for one release, prerendered with Shiki highlighting. |
| `vX.Y.Z/index.html` | The full React page, prerendered for the static host. |

The sidebar and the rendered article are derived from the same parse, so the
two cannot disagree about a version's date or codename. Like `llms.txt`, this
directory is gitignored: edit a release file and the next `pnpm dev` /
`pnpm build` regenerates everything.

The route itself is a TanStack splat: `/changelogs` redirects to the latest
release, and `/changelogs/$` serves every other slug with the same page
component. Load data is split between `changelogs.ts` (the loader the browser
uses) and `changelogs.server.ts` (a sibling module that reads from disk during
prerender) — the client bundle therefore never imports `node:fs`.

---

## The documentation, for machines

Every page is published twice: as the React page you are looking at, and as
plain Markdown at the same URL with `.md` appended —
`/docs/agents/mcp` → `/docs/agents/mcp.md`. Two index files sit at the root:

| File | For |
|---|---|
| `/llms.txt` | The tagline, the install command, and a linked table of contents. Small enough for an agent to read in full before deciding. |
| `/llms-full.txt` | The entire corpus in one request. |

This exists because of what the product claims. Kandown's pitch is that agents
are first-class users; a documentation site only humans can parse would be the
product contradicting itself on its own homepage. Someone tells their agent
"install kandown", the agent fetches this site, and it should get instructions
rather than a wall of `<div class="prose">`.

**There is exactly one source of truth: the MDX.** `scripts/build-llms.mjs`
generates all of it on every build from `src/content/docs/`, in the order
`src/content/nav.ts` defines, and the output is gitignored — so it cannot be
edited into disagreement with the site. The index carries **no hand-written
prose at all**: its tagline and install command come from `src/lib/site.ts`, and
every one-line summary is a page's own `description` frontmatter. A summary
typed into that script would be a second copy of the docs, owned by nobody, and
wrong within a week. If a line in `llms.txt` looks stale, fix the MDX.

Each docs page also carries a `<link rel="alternate" type="text/markdown">` and
a **Copy as Markdown** button, which fetches the generated file rather than
scraping the DOM — scraping loses code fences, tables and link targets, which
are the parts somebody pasting into a chat needs most.

Run it alone with `pnpm llms`.

---

## The interactive demo

`/demo` embeds the **real Kandown application**, running on a project that lives
in the browser's memory. Drag a card, edit a task, archive one — then reload and
it is all back.

The route drops the site header and footer entirely: an application framed by a
marketing bar reads as a widget, and the two navigations would compete for the
same corner. In their place a single floating pill carries the way back *and*
the demo's status, because with no site chrome it is the only thing on screen
telling a visitor their work is disposable. It sits beside the app's own logo
above 1520px and moves to the bottom of the screen below that — a measured
threshold, not a guess: under it the app's toolbar reaches the same space.

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

Palette from `logo.svg`: warm white surfaces, deep green-black ink (`#0b1a14`), and the arrow's lime
as the single accent. Black video frames create the strongest contrast on the page. Borders are
deliberately visible because a layout built from rules needs rules you can see.

### Typography

Geist and Geist Mono (SIL OFL — see `public/fonts/LICENSE.txt`), self-hosted as two variable
`woff2` files of ~70 KB each, covering every weight. Self-hosted rather than CDN-loaded for the
same reason the product works offline. Both are preloaded in `<head>`, so there is no flash of the
fallback on a cold load, and a metric-matched `@font-face` fallback holds the layout in the
meantime.

### Light-only identity

The website deliberately has one appearance. It does not read `prefers-color-scheme`, set a
`data-theme` attribute, persist a theme in `localStorage`, or expose a toggle. A device configured
for dark mode still receives the exact same light Kandown identity.

`@theme inline` maps Tailwind utilities such as `bg-bg`, `text-fg-muted`, and `border-border` onto
the single token set declared on `:root`. `color-scheme: light` keeps native controls light, the
browser `theme-color` is always white, and Shiki generates only its `github-light` palette. This is
an identity decision rather than a missing preference: the warm light ground is what gives the
black product recordings and lime accent their contrast.

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

### Domain

The canonical domain is **`kandown.dev`**, declared once in
[`src/lib/site.ts`](src/lib/site.ts) as `site.url` — every canonical tag, OG URL, sitemap entry and
`llms.txt` link derives from that constant, so a domain change is a one-line edit followed by
`pnpm build`.

The domain is registered at **Cloudflare Registrar**, with DNS also served by Cloudflare (the
nameservers stay at Cloudflare — the domain is *not* delegated to `ns1/ns2.vercel-dns.com`). Two
records point it at Vercel:

| Type | Name | Value | Proxy |
|---|---|---|---|
| `A` | `@` | `216.198.79.1` | **DNS only** (grey cloud) |
| `CNAME` | `www` | `cname.vercel-dns.com` | **DNS only** (grey cloud) |

⚠️ Both records **must** stay unproxied. Cloudflare's orange-cloud proxy terminates TLS itself,
which blocks Vercel's ACME challenge — the certificate silently fails to issue or renew and the
site starts serving `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`. Vercel already fronts the site with its
own CDN, so the proxy would buy nothing anyway.

Both `kandown.dev` and `www.kandown.dev` are attached to the Vercel project; `www` redirects to the
apex, and the old `kandown.vercel.app` alias keeps working so historical links never break.

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
│   ├── build-llms.mjs       # ← the Markdown twin + llms.txt (generated)
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
