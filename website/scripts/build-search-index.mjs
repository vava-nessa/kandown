/**
 * @file scripts/build-search-index.mjs
 * @description Builds the documentation search index consumed by `<DocSearch />`.
 *
 * 📖 Why a build step rather than a runtime search service: the whole corpus is
 * a few dozen kilobytes of prose. Indexing it at build time and shipping one
 * JSON file means search works offline, needs no API key, no server and no
 * third-party script, the same promise the product itself makes.
 *
 * 📖 What it produces. Each MDX file is split at its `##` and `###` headings into
 * *sections*, so a hit deep-links to `/docs/<slug>#<heading-id>` instead of
 * dumping you at the top of a long page. Markdown syntax, JSX blocks and fenced
 * code are stripped so the index holds prose, not punctuation.
 *
 * Runs automatically via the `predev` / `prebuild` npm scripts; run it by hand
 * with `pnpm search-index` after editing content while the dev server is up.
 *
 * @functions
 *   slugify        → GitHub-compatible heading id, matching rehype-slug
 *   stripMarkdown  → readable plain text from a markdown block
 *   sectionsOf     → split one document into searchable sections
 *   main           → walk the content tree and write the index
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONTENT_DIR = join(ROOT, 'src', 'content', 'docs')
const OUT_FILE = join(ROOT, 'src', 'generated', 'search-index.json')

/**
 * 📖 Mirrors `rehype-slug` (which uses github-slugger): lowercase, strip
 * anything that is not a word character/space/hyphen, spaces to hyphens. If the
 * two ever disagree, search links land on the page but not the section, so keep
 * this in step with the rehype plugin.
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

function stripMarkdown(block) {
  return block
    .replace(/```[\s\S]*?```/g, ' ')       // fenced code
    .replace(/<[^>]+>/g, ' ')              // JSX / HTML tags
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')  // images
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')// links → their label
    .replace(/[`*_>#|]/g, ' ')
    .replace(/^\s*[-+]\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sectionsOf({ slug, title, description, body }) {
  const sections = []
  const lines = body.split('\n')

  let heading = null
  let buffer = []
  let inFence = false

  const flush = () => {
    const text = stripMarkdown(buffer.join('\n'))
    if (!text && !heading) return
    sections.push({
      slug,
      page: title,
      heading: heading?.text ?? null,
      hash: heading ? `#${slugify(heading.text)}` : '',
      // 📖 Capped so one long page cannot dominate the payload. Search matches
      // on the first ~600 characters of a section, which in practice covers the
      // paragraph a heading introduces.
      text: text.slice(0, 600),
    })
    buffer = []
  }

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) inFence = !inFence
    const match = !inFence && /^(#{2,3})\s+(.+?)\s*$/.exec(line)
    if (match) {
      flush()
      heading = { text: match[2] }
      continue
    }
    buffer.push(line)
  }
  flush()

  // 📖 The page itself is always entry #0 so a title match ranks the page even
  // when none of its sections mention the term.
  return [
    { slug, page: title, heading: null, hash: '', text: description ?? '' },
    ...sections.filter((s) => s.heading || s.text),
  ]
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else if (entry.name.endsWith('.mdx')) files.push(full)
  }
  return files
}

async function main() {
  let files = []
  try {
    files = await walk(CONTENT_DIR)
  } catch {
    console.warn(`[search-index] no content at ${CONTENT_DIR}, writing an empty index`)
  }

  const index = []
  for (const file of files.sort()) {
    const raw = await readFile(file, 'utf8')
    const { data, content } = matter(raw)
    const slug = relative(CONTENT_DIR, file).replace(/\.mdx$/, '').split(sep).join('/')
    index.push(
      ...sectionsOf({
        slug,
        title: data.title ?? slug,
        description: data.description ?? '',
        body: content,
      }),
    )
  }

  await mkdir(join(ROOT, 'src', 'generated'), { recursive: true })
  await writeFile(OUT_FILE, JSON.stringify(index), 'utf8')
  console.log(
    `[search-index] ${index.length} sections from ${files.length} pages → src/generated/search-index.json`,
  )
}

main().catch((error) => {
  console.error('[search-index] failed:', error)
  process.exit(1)
})
