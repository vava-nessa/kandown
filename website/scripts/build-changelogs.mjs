/**
 * @file scripts/build-changelogs.mjs
 * @description Turns the per-release Markdown files at `<repo>/changelogs/`
 * into the static assets the `/changelogs` route renders from.
 *
 * 📖 **Why a build step.** Every release already lives at
 * `changelogs/vX.Y.Z.md` — that is the single source of truth, and the npm
 * package ships the directory verbatim. Re-parsing Markdown in the browser
 * would force the site to ship a Markdown engine for what is currently 90+
 * small files; shipping prerendered HTML keeps the client bundle unchanged
 * and matches what `scripts/build-llms.mjs` already does for the docs.
 *
 * 📖 **What it produces**, all under `public/changelogs/` so the prerenderer
 * treats them as plain static files:
 *
 *   - `index.json` — `{ entries: [{ slug, version, date, name, file }] }`,
 *     newest first by semver, with `Unreleased` pinned on top when present.
 *     The React sidebar reads this to render its year-grouped tree.
 *   - `vX.Y.Z.frag` — one prerendered HTML fragment per release: title,
 *     date, codename, then the Markdown body run through the same remark
 *     pipeline as the docs (gfm + rehype-slug + shiki + stringify).
 *
 * ⚠️ **The `.frag` extension is load-bearing — do not "fix" it to `.html`.**
 * These fragments sit in `public/changelogs/`, and the site has a route at
 * `/changelogs/<version>` that prerenders to `changelogs/<version>/index.html`.
 * Naming a fragment `v0.39.1.html` puts a second file at the same public path:
 * with `cleanUrls` enabled, Vercel resolves `/changelogs/v0.39.1` to
 * `changelogs/v0.39.1.html` — the fragment — *before* it ever looks at the
 * prerendered directory. The fragment wins, and every release deep link serves
 * 500 bytes of bare `<h2>` with no `<html>`, no site chrome and no meta tags,
 * while the real page sits unreachable one directory below. It looks fine in
 * dev, where Vite serves the route rather than the file. An extension the
 * static host does not map to a route is what keeps the two apart.
 *
 * 📖 **Sidebar data is built from the same parse** as the HTML, so the
 * sidebar and the rendered page cannot disagree about a release's date or
 * codename. A hand-maintained index would drift the moment somebody
 * backports a fix to an old file; this script cannot.
 *
 * Runs from `predev` / `prebuild`; run it alone with `pnpm changelogs`.
 *
 * @functions
 *   parseChangelog → one .md → `{ slug, version, date, name, html }`
 *   compare        → numeric semver descending comparator
 *   main           → write every HTML fragment and the sidebar index
 *
 * @see scripts/build-llms.mjs — the same shape for the documentation
 * @see scripts/build-changelog.js — the CLI-side index generator (different
 *   output, same parsing convention)
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import rehypeShiki from '@shikijs/rehype'
import rehypeStringify from 'rehype-stringify'
import matter from 'gray-matter'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const WEBSITE = resolve(HERE, '..')
// 📖 The repo root is two levels up from `website/`; the changelogs live
// there so a release *adds* a file in one place visible to both the CLI and
// the website.
const REPO_ROOT = resolve(WEBSITE, '..')
const SOURCE_DIR = join(REPO_ROOT, 'changelogs')
const OUT_DIR = join(WEBSITE, 'public', 'changelogs')

/**
 * 📖 The release heading used by every file: `# 0.36.1 — 2026-07-26 — "Name"`.
 * `Unreleased` replaces the version/date pair when work is in flight. Mirrors
 * the regex in `scripts/build-changelog.js` so the two indexes stay aligned.
 */
const RE_TITLE = /^#\s+(Unreleased|\d+\.\d+\.\d+)(?:\s+—\s+(\d{4}-\d{2}-\d{2}))?\s+—\s+"(.+)"\s*$/

/**
 * @description Reads one version file and produces the data the sidebar and
 * the prerendered HTML both consume.
 *
 * 📖 Strips the H1 from the body before rendering: the page already shows the
 * version, date and codename as a typed header, so duplicating them in the
 * Markdown body would render the same line twice. The rest of the file is
 * passed through unchanged so a hand-written `## Notes` heading lands in the
 * HTML exactly as authored.
 */
async function parseChangelog(filename) {
  const raw = await readFile(join(SOURCE_DIR, filename), 'utf8')
  const { content } = matter(raw)

  const titleLine = content.split('\n').find((line) => line.startsWith('# '))
  const match = titleLine ? titleLine.match(RE_TITLE) : null
  if (!match) {
    throw new Error(
      `changelogs/${filename}: first heading must look like ` +
        `'# 0.36.1 — 2026-07-26 — "Name"', got ${titleLine ? `'${titleLine}'` : 'no H1'}`,
    )
  }
  const [, version, date, name] = match

  // 📖 Strip the H1 line and one optional blank, then run the body through the
  // same pipeline the docs use so syntax highlighting and heading anchors are
  // identical across the site.
  const body = content.replace(/^#\s+.+\n+/, '').trimStart()
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    // 📖 Single light palette to match the site's deliberate light-only identity.
    // See styles.css and vite.config.ts for the same decision on the docs.
    .use(rehypeShiki, { theme: 'github-light' })
    .use(rehypeStringify)
    .process(body)

  return {
    slug: `v${version}`,
    version,
    date: date ?? null,
    name,
    html: String(file),
  }
}

/** 📖 Newest first, comparing each numeric segment — not the string. */
function compare(a, b) {
  if (a.version === 'Unreleased') return -1
  if (b.version === 'Unreleased') return 1
  const pa = a.version.split('.').map(Number)
  const pb = b.version.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i]
  }
  return 0
}

async function main() {
  let files = []
  try {
    files = (await readdir(SOURCE_DIR)).filter((name) => name.endsWith('.md'))
  } catch (error) {
    console.warn(`[changelogs] no source at ${SOURCE_DIR} — writing an empty index`)
  }

  const parsed = await Promise.all(files.map(parseChangelog))
  parsed.sort(compare)

  // ── per-release HTML fragments ──────────────────────────────────────────
  for (const entry of parsed) {
    const out = join(OUT_DIR, `${entry.slug}.frag`)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, entry.html, 'utf8')
  }

  // ── sidebar index ───────────────────────────────────────────────────────
  const index = {
    // 📖 Year extracted from each entry's date so the sidebar can group them
    // without re-implementing the parse. `null` (Unreleased, missing date) goes
    // in its own bucket at the top.
    generatedAt: new Date().toISOString(),
    entries: parsed.map(({ html, ...rest }) => rest),
  }
  await writeFile(join(OUT_DIR, 'index.json'), JSON.stringify(index), 'utf8')

  console.log(`[changelogs] ${parsed.length} releases → public/changelogs/ (${OUT_DIR})`)
}

main().catch((error) => {
  console.error(`[changelogs] ${error.message}`)
  process.exit(1)
})