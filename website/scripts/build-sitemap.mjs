/**
 * @file scripts/build-sitemap.mjs
 * @description Emits the two files search engines look for before they look at
 * anything else: `public/sitemap.xml` and `public/robots.txt`.
 *
 * 📖 **Why a sitemap at all, on a site this small.** Crawlers find pages by
 * following links, and most of this site is reachable that way — but not all of
 * it evenly. The changelog is ninety pages deep behind a sidebar, and a crawler
 * that gives up after the first twenty never learns the rest exist. A sitemap
 * hands over the complete list in one request, with a `lastmod` per URL so a
 * return visit can skip everything that has not moved.
 *
 * 📖 **Why robots.txt is generated too.** It has to name the sitemap by
 * *absolute* URL — that is the one place in the file a domain appears. Leaving
 * it hand-written would plant a second copy of the domain outside
 * `src/lib/site.ts`, and the day the domain moves, the stale one keeps pointing
 * crawlers at a host nobody owns any more. Generating it means the URL derives
 * from the same constant as every canonical tag. The prose lives in this script
 * because it is the file's only home.
 *
 * 📖 **What is deliberately absent: `changefreq` and `priority`.** Both are part
 * of the sitemap spec and both are ignored by Google — they were advisory
 * fields that every site set to `daily`/`1.0` until they carried no signal.
 * Emitting them would add a column of noise that has to be kept plausible
 * forever in exchange for nothing.
 *
 * 📖 **How `lastmod` is decided**, since a wrong date is worse than none — a
 * crawler that learns the dates lie stops reading them:
 *
 *   - **Changelog pages** carry their own release date. It is exact and it never
 *     changes: v0.12.0's notes were written the day v0.12.0 shipped.
 *   - **Everything else** carries the date of the most recent release. The site
 *     is rebuilt and redeployed as part of every release, so that is genuinely
 *     the last time the published page could have changed. File mtimes would be
 *     the obvious alternative and are a trap: a CI checkout stamps every file
 *     with the moment it was cloned, so every page would claim to have changed
 *     on every build.
 *
 * 📖 **The URL list is derived, never typed.** Documentation pages come from
 * `src/content/nav.ts` — the same module that builds the sidebar — and release
 * pages from the changelog index this build already produced. A page cannot
 * therefore exist on the site and be missing from the sitemap: adding it to the
 * nav adds it here. The only hand-written entries are the four static routes,
 * which have no generated source to read.
 *
 * 📖 `/404` is excluded (it is `noindex` anyway) and so is `/demo/app/`, the
 * demo's build artifact — a bundle, not content, and `robots.txt` disallows it.
 *
 * Runs from `predev` / `prebuild`, after `build-changelogs.mjs` whose index it
 * reads; run it alone with `pnpm sitemap`.
 *
 * @functions
 *   baseUrl        → the canonical origin, from the environment or site.ts
 *   readChangelogs → the release list produced by build-changelogs.mjs
 *   urlEntry       → one <url> element
 *   main           → write sitemap.xml and robots.txt
 *
 * @see website/scripts/build-llms.mjs — the same derive-everything rule, for agents
 * @see website/src/lib/site.ts — where the domain is defined, once
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PUBLIC_DIR = join(ROOT, 'public')

const { flatDocs } = await import(join(ROOT, 'src', 'content', 'nav.ts'))
const { site } = await import(join(ROOT, 'src', 'lib', 'site.ts'))

/**
 * 📖 Identical to the resolution in `build-llms.mjs`, and deliberately so: an
 * explicit `SITE_URL` wins, then the production domain Vercel injects at build
 * time (which follows a custom domain once one is attached), then the canonical
 * URL in site.ts. A preview deployment therefore emits a sitemap pointing at
 * itself rather than at production.
 */
function baseUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  return site.url.replace(/\/$/, '')
}

const BASE = baseUrl()

/**
 * @description Reads the release list `build-changelogs.mjs` wrote earlier in
 * the same build.
 *
 * 📖 Missing is not fatal. Someone running this script alone, before the
 * changelog step has ever run, should still get a valid sitemap of everything
 * else rather than a failed build.
 */
async function readChangelogs() {
  try {
    const raw = await readFile(join(PUBLIC_DIR, 'changelogs', 'index.json'), 'utf8')
    const entries = JSON.parse(raw).entries ?? []
    return entries.filter((entry) => entry.slug)
  } catch {
    console.warn('[sitemap] no changelog index yet — run build-changelogs.mjs first')
    return []
  }
}

/** 📖 `&` is the only character the URLs here can contain that XML would misread. */
function xmlEscape(value) {
  return value.replace(/&/g, '&amp;')
}

function urlEntry(path, lastmod) {
  const loc = xmlEscape(path === '/' ? BASE : `${BASE}${path}`)
  return lastmod ? `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>` : `  <url>\n    <loc>${loc}</loc>\n  </url>`
}

async function main() {
  const releases = await readChangelogs()

  // 📖 The index is already sorted newest-first by build-changelogs.mjs, so the
  // first dated entry is the latest release. Falls back to today only on a repo
  // with no releases at all, which in practice means a fresh clone mid-setup.
  const latest = releases.find((entry) => entry.date)?.date ?? new Date().toISOString().slice(0, 10)

  // 📖 `/changelogs` is deliberately absent. It resolves to the newest release
  // rather than having content of its own, so its canonical tag points at
  // `/changelogs/<latest>` — which is already listed below. Submitting a URL
  // that canonicalises to a different one asks a crawler to fetch a page in
  // order to be told to ignore it.
  const paths = [
    // ── static routes ───────────────────────────────────────────────────────
    ['/', latest],
    ['/docs', latest],
    ['/app', latest],
    // ── one per documentation page, in sidebar order ────────────────────────
    ...flatDocs.map((entry) => [`/docs/${entry.slug}`, latest]),
    // ── one per release, each with the date it actually shipped ─────────────
    ...releases.map((entry) => [`/changelogs/${entry.slug}`, entry.date || latest]),
  ]

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map(([path, lastmod]) => urlEntry(path, lastmod)),
    '</urlset>',
    '',
  ].join('\n')

  await writeFile(join(PUBLIC_DIR, 'sitemap.xml'), xml, 'utf8')

  // ── robots.txt ────────────────────────────────────────────────────────────
  // 📖 The prose here is the file's only source. Everything a crawler needs to
  // find on its own is listed: the sitemap, and the Markdown convention that
  // makes the documentation readable without executing JavaScript.
  const robots = [
    'User-agent: *',
    'Allow: /',
    '',
    '# The documentation is also published as plain Markdown, generated from the same',
    '# source as the pages themselves. Append .md to any /docs/ URL to get it.',
    '#',
    '#   /llms.txt        index, install command, linked table of contents',
    '#   /llms-full.txt   the whole documentation as a single file',
    '#',
    '# The web application bundle under /demo/app/ is a build artifact, not content.',
    'Disallow: /demo/app/',
    '',
    `Sitemap: ${BASE}/sitemap.xml`,
    '',
  ].join('\n')

  await writeFile(join(PUBLIC_DIR, 'robots.txt'), robots, 'utf8')

  console.log(
    `[sitemap] ${paths.length} URLs → public/sitemap.xml, robots.txt (${BASE})`,
  )
}

main().catch((error) => {
  console.error(`[sitemap] ${error.message}`)
  process.exit(1)
})
