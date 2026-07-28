/**
 * @file src/lib/themes.ts
 * @description Type-safe access to the community themes index produced by
 * `scripts/build-themes.mjs`. Mirrors `extensions.ts` exactly: the loader
 * branches on `import.meta.env.SSR` so the same code reads from disk
 * during prerender and fetches the static URL in the browser, with a
 * module-level cache so the list page and the detail page share one fetch.
 *
 * @see scripts/build-themes.mjs. The build that produces `index.json`.
 */

export type ThemeEntry = {
  id: string
  name: string
  author?: string
  description?: string
  repo: string
  path: string
  ref?: string
  minKandownVersion?: string
  tags?: string[]
}

export type ThemesIndex = {
  generatedAt: string
  url: string
  source: 'remote' | 'local'
  tags: string[]
  entries: ThemeEntry[]
}

const SERVER_DIR = '/themes'

let indexPromise: Promise<ThemesIndex> | null = null

export function loadThemesIndex(): Promise<ThemesIndex> {
  if (!indexPromise) {
    const source = import.meta.env.SSR
      ? import('./themes.server').then((m) =>
          m.readThemeFile('index.json', (text) => JSON.parse(text) as ThemesIndex),
        )
      : fetch(`${SERVER_DIR}/index.json`).then(async (res) => {
          if (!res.ok) throw new Error(`${SERVER_DIR}/index.json: ${res.status}`)
          return (await res.json()) as ThemesIndex
        })

    indexPromise = source.catch((error) => {
      indexPromise = null
      throw error
    })
  }
  return indexPromise
}

export function findThemeEntry(index: ThemesIndex, id: string): ThemeEntry | undefined {
  return index.entries.find((entry) => entry.id === id)
}