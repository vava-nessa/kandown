/**
 * @file src/lib/changelogs.ts
 * @description Type-safe access to the changelogs assets produced by
 * `scripts/build-changelogs.mjs`.
 *
 * 📖 **Why a dedicated loader.** `index.json` and the per-version HTML
 * fragments are prerendered static files emitted by the build, not React
 * modules. Vite would still import the JSON as a static asset, but pulling the
 * file at runtime lets the prerendered HTML be served as plain bytes and
 * trimmed out of the client bundle, which is the same trade-off the docs route makes
 * for its MDX, just for the simpler case where no JSX is allowed in source.
 *
 * 📖 **SSR reads from the filesystem**, the browser fetches by URL. TanStack
 * Start prerenders every route on the server, where `fetch('/changelogs/...')`
 * would throw because Node has no base URL. The same loader runs in both
 * environments, so it branches on `typeof window` and reads from
 * `public/changelogs/` directly during prerender.
 *
 * 📖 **Cache is module-level** because every consumer needs the same entries
 * list and one fetch per page would be wasteful, since the index is 7 KB and never
 * changes within a session.
 *
 * @exports
 *   loadChangelogIndex → sidebar data, memoised per page
 *   loadChangelogHtml  → prerendered HTML for one release, with a one-call cache
 *   groupByYear        → year-grouped entries for the sidebar tree
 *   findEntry          → entry lookup by slug
 *
 * @see scripts/build-changelogs.mjs. The build that produces these files.
 */

export type ChangelogEntry = {
  slug: string
  version: string
  date: string | null
  name: string
}

export type ChangelogIndex = {
  generatedAt: string
  entries: ChangelogEntry[]
}

/** 📖 `public/` from the perspective of the running Vite dev server. */
const SERVER_DIR = '/changelogs'

async function fetchFromUrl<T>(path: string, parse: (text: string) => T): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return parse(await response.text())
}

let indexPromise: Promise<ChangelogIndex> | null = null

export function loadChangelogIndex(): Promise<ChangelogIndex> {
  if (!indexPromise) {
    // 📖 **SSR reads from disk, the browser fetches.** TanStack Start runs
    // loaders inside Node during prerender, where `fetch('/changelogs/...')`
    // throws because Node has no base URL. During a production build the
    // relative path would have to be served by an HTTP server we do not own.
    // The browser hits the URL directly because the assets are copied into
    // `dist/client/changelogs/` by Vite, served as plain static files.
    const source = import.meta.env.SSR
      ? import('./changelogs.server').then((m) =>
          m.readChangelogFile('index.json', (text) => JSON.parse(text) as ChangelogIndex),
        )
      : fetchFromUrl(`${SERVER_DIR}/index.json`, (text) => JSON.parse(text) as ChangelogIndex)

    indexPromise = source.catch((error) => {
      // 📖 Reset so the next call retries. Otherwise a transient failure
      // (offline, first build) would lock the loader to rejection.
      indexPromise = null
      throw error
    })
  }
  return indexPromise
}

const htmlCache = new Map<string, Promise<string>>()

/**
 * 📖 The `.frag` extension is not cosmetic. These files live in
 * `public/changelogs/`, alongside the prerendered output of the
 * `/changelogs/<version>` route. Named `.html`, a fragment would occupy the
 * same public path as the page. `cleanUrls` resolves `/changelogs/v0.39.1` to
 * `changelogs/v0.39.1.html` before it looks at `changelogs/v0.39.1/index.html`,
 * and every release link would serve the bare fragment instead of the page.
 * See the warning at the top of `scripts/build-changelogs.mjs`.
 */
export function loadChangelogHtml(slug: string): Promise<string> {
  const cached = htmlCache.get(slug)
  if (cached) return cached
  const source = import.meta.env.SSR
    ? import('./changelogs.server').then((m) => m.readChangelogFile(`${slug}.frag`, (text) => text))
    : fetchFromUrl(`${SERVER_DIR}/${slug}.frag`, (text) => text)

  const promise = source.catch((error) => {
    htmlCache.delete(slug)
    throw error
  })
  htmlCache.set(slug, promise)
  return promise
}

/**
 * 📖 Buckets every entry under its release year, keeping the index's
 * newest-first ordering inside each group. `Unreleased` and entries with no
 * date land in a synthetic `_` bucket at the top (never under a real year),
 * so a single hand-written file does not pollute the calendar grid.
 */
export function groupByYear(entries: ChangelogEntry[]): { year: string; items: ChangelogEntry[] }[] {
  const buckets = new Map<string, ChangelogEntry[]>()
  for (const entry of entries) {
    const year = entry.date ? entry.date.slice(0, 4) : '_'
    const bucket = buckets.get(year)
    if (bucket) bucket.push(entry)
    else buckets.set(year, [entry])
  }
  return [...buckets.entries()].map(([year, items]) => ({ year, items }))
}

export function findEntry(entries: ChangelogEntry[], slug: string): ChangelogEntry | undefined {
  return entries.find((entry) => entry.slug === slug)
}