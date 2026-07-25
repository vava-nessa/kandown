/**
 * @file scripts/build-llms.mjs
 * @description Emits the machine-readable face of the documentation: a plain
 * Markdown twin of every page, plus the two `llms.txt` index files.
 *
 * 📖 **The problem this solves.** Someone tells their coding agent "install
 * Kandown". The agent fetches this site and gets a React application: a wall of
 * `<div class="prose">`, inlined Shiki spans, a nav, a footer, and the actual
 * instructions somewhere inside. It burns tokens on markup and still has to
 * guess. Since Kandown's whole pitch is that agents are first-class users,
 * shipping a site only humans can read would be the product contradicting
 * itself on its own homepage.
 *
 * 📖 **What it produces**, all under `public/` so they are plain static files:
 *
 *   - `docs/<slug>.md` — every page as clean Markdown. Because the routes live
 *     at `/docs/<slug>`, this means **appending `.md` to any documentation URL
 *     returns its source**. That is the convention agents already probe for.
 *   - `llms.txt` — the index: what Kandown is, how to install it, and a linked
 *     table of contents. Small enough to read in full before deciding.
 *   - `llms-full.txt` — the entire corpus concatenated, for an agent that would
 *     rather make one request than seventeen.
 *
 * 📖 **There is exactly one source of truth: the MDX.** These files are derived
 * on every build and gitignored, so they cannot be edited into disagreement with
 * the site — change a page and its Markdown twin changes with it. The same rule
 * governs the index: `llms.txt` contains no hand-written prose at all. Its
 * tagline and install command come from `src/lib/site.ts` (the constants the
 * hero and the meta tags already use) and every one-line summary is a page's own
 * `description` frontmatter. A summary typed into this script would be a second
 * copy of the documentation, owned by nobody, wrong within a week.
 *
 * 📖 **Ordering comes from `src/content/nav.ts`**, imported directly — Node
 * strips the types natively, so the sidebar, the prev/next links and these files
 * cannot disagree about what the documentation contains or what order it is in.
 *
 * 📖 **Link rewriting matters more than it looks.** Internal `/docs/x` links are
 * rewritten to `/docs/x.md`, so an agent that follows a link stays in Markdown
 * instead of falling back into the HTML application halfway through.
 *
 * Runs from `predev` / `prebuild`; run it alone with `pnpm llms`.
 *
 * @functions
 *   baseUrl      → the canonical origin, from the environment or site.ts
 *   toMarkdown   → MDX source → portable Markdown
 *   readDoc      → load and normalise one page
 *   main         → write the per-page files and both indexes
 *
 * @see website/src/components/CopyPageButton.tsx — the human-facing half
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONTENT_DIR = join(ROOT, 'src', 'content', 'docs')
const PUBLIC_DIR = join(ROOT, 'public')

const { docsNav, flatDocs } = await import(join(ROOT, 'src', 'content', 'nav.ts'))
const { site, INSTALL_COMMAND } = await import(join(ROOT, 'src', 'lib', 'site.ts'))

/**
 * 📖 Absolute URLs are part of the llms.txt convention — an agent may have the
 * file without knowing where it came from. Prefer an explicit `SITE_URL`, then
 * the production domain Vercel injects at build time (which follows a custom
 * domain once one is attached), and fall back to the canonical URL in site.ts.
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
 * @description Turns the MDX source of one page into Markdown that is portable
 * enough to paste anywhere.
 *
 * 📖 Only two constructs need handling, because the content deliberately stays
 * close to plain Markdown: `<Callout>` becomes a blockquote with its type as a
 * bold lead-in, and any stray JSX tag is dropped rather than shown as literal
 * angle brackets. Fenced code blocks pass through untouched — they are the part
 * an agent is most likely to want verbatim.
 */
function toMarkdown(body, { absolute }) {
  const linkTarget = (path, hash) => {
    const suffix = hash ? `#${hash}` : ''
    // 📖 Anchors are on the rendered page, not the Markdown twin, but they still
    // read correctly as section names, so keep them.
    const md = `${path}.md${suffix}`
    return absolute ? `${BASE}${md}` : md
  }

  return (
    body
      // <Callout type="warn">…</Callout> → > **Warning:** …
      .replace(/<Callout(?:\s+type=["'](\w+)["'])?\s*>([\s\S]*?)<\/Callout>/g, (_m, type, inner) => {
        const lead = { tip: 'Tip', warn: 'Warning', note: 'Note' }[type ?? 'note'] ?? 'Note'
        const text = inner.trim().split('\n').map((line) => `> ${line}`.trimEnd()).join('\n')
        return `> **${lead}**\n${text}`
      })
      // Any remaining JSX element: keep the children, drop the tags.
      .replace(/<\/?[A-Z][\w.]*(?:\s[^>]*)?\/?>/g, '')
      // Internal documentation links → their Markdown twin.
      .replace(/\]\(\/docs\/([^)#\s]+)(?:#([^)\s]+))?\)/g, (_m, slug, hash) =>
        `](${linkTarget(`/docs/${slug}`, hash)})`,
      )
      // Other internal links stay on the site itself.
      .replace(/\]\((\/(?!docs\/)[^)\s]*)\)/g, (_m, path) => `](${absolute ? BASE + path : path})`)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

async function readDoc(slug) {
  const raw = await readFile(join(CONTENT_DIR, `${slug}.mdx`), 'utf8')
  const { data, content } = matter(raw)
  return {
    slug,
    title: data.title ?? slug,
    section: data.section ?? '',
    description: data.description ?? '',
    body: content,
  }
}

/** 📖 One page as a standalone document: title, one-line summary, source link, body. */
function pageFile(doc) {
  const head = [
    `# ${doc.title}`,
    doc.description ? `\n${doc.description}` : '',
    `\n> Kandown documentation — ${BASE}/docs/${doc.slug}`,
  ]
    .filter(Boolean)
    .join('\n')
  return `${head}\n\n${toMarkdown(doc.body, { absolute: false })}\n`
}

async function main() {
  const docs = await Promise.all(flatDocs.map((entry) => readDoc(entry.slug)))
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]))

  // ── one Markdown twin per page ────────────────────────────────────────────
  for (const doc of docs) {
    const out = join(PUBLIC_DIR, 'docs', `${doc.slug}.md`)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, pageFile(doc), 'utf8')
  }

  // ── llms.txt: the index ───────────────────────────────────────────────────
  // 📖 **No prose is written here.** Every line below is derived: the tagline and
  // the install command from `src/lib/site.ts` (the same constants the hero and
  // the meta tags use), and every summary from a page's own `description`
  // frontmatter. That is deliberate and load-bearing — a hand-written summary in
  // this file would be a second copy of the documentation, maintained by nobody,
  // rotting from the first edit onwards. If a sentence here looks wrong, the fix
  // is in the MDX or in site.ts, never in this script.
  const agentsEntry = bySlug.get('agents/overview')
  const installEntry = bySlug.get('installation')

  const index = [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    '## Install',
    '',
    '```bash',
    INSTALL_COMMAND,
    '```',
    '',
    installEntry ? `${installEntry.description} — ${BASE}/docs/installation.md` : '',
    '',
    '## For agents',
    '',
    agentsEntry?.description ?? '',
    '',
    `Start here: ${BASE}/docs/agents/overview.md`,
    '',
    '## Documentation',
    '',
    'Every page below is also served as Markdown by appending `.md` to its URL.',
    '',
  ].filter((line, i, all) => !(line === '' && all[i - 1] === ''))

  for (const group of docsNav) {
    index.push(`### ${group.title}`, '')
    for (const item of group.items) {
      const doc = bySlug.get(item.slug)
      const summary = doc?.description ? `: ${doc.description}` : ''
      index.push(`- [${item.title}](${BASE}/docs/${item.slug}.md)${summary}`)
    }
    index.push('')
  }

  index.push(
    '## Everything at once',
    '',
    `- [Full documentation, one file](${BASE}/llms-full.txt)`,
    '',
    '## Links',
    '',
    `- [Web app](${BASE}/app) | the real app in the browser, free and without a login`,
    `- [Source](${site.repo})`,
    `- [npm](${site.npm})`,
    '',
  )

  await writeFile(join(PUBLIC_DIR, 'llms.txt'), `${index.join('\n')}\n`, 'utf8')

  // ── llms-full.txt: the whole corpus ───────────────────────────────────────
  const full = [
    `# ${site.name} — complete documentation`,
    '',
    `> ${site.description}`,
    '',
    `Generated from ${BASE} — ${docs.length} pages.`,
    '',
    '---',
    '',
  ]
  for (const doc of docs) {
    full.push(
      `# ${doc.title}`,
      '',
      doc.section ? `*${doc.section} — ${BASE}/docs/${doc.slug}*` : `*${BASE}/docs/${doc.slug}*`,
      '',
      doc.description,
      '',
      toMarkdown(doc.body, { absolute: true }),
      '',
      '---',
      '',
    )
  }
  await writeFile(join(PUBLIC_DIR, 'llms-full.txt'), `${full.join('\n')}\n`, 'utf8')

  console.log(`[llms] ${docs.length} pages → public/docs/*.md, llms.txt, llms-full.txt (${BASE})`)
}

main().catch((error) => {
  console.error(`[llms] ${error.message}`)
  process.exit(1)
})
