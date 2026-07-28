/**
 * @file src/lib/extensions.ts
 * @description Type-safe access to the community extensions index produced by
 * `scripts/build-extensions.mjs`. Mirrors `changelogs.ts`: the loader branches
 * on `import.meta.env.SSR` so the same code reads from disk during prerender
 * and fetches the static URL in the browser, with a module-level cache so
 * the list page and the detail page share one fetch.
 *
 * @see scripts/build-extensions.mjs. The build that produces `index.json`.
 */

export type ExtensionEntry = {
  id: string
  name: string
  author?: string
  description?: string
  repo: string
  path?: string
  ref?: string
  minKandownVersion?: string
  tags?: string[]
}

export type ExtensionsIndex = {
  generatedAt: string
  url: string
  source: 'remote' | 'local'
  tags: string[]
  entries: ExtensionEntry[]
}

const SERVER_DIR = '/extensions'

let indexPromise: Promise<ExtensionsIndex> | null = null

export function loadExtensionsIndex(): Promise<ExtensionsIndex> {
  if (!indexPromise) {
    const source = import.meta.env.SSR
      ? import('./extensions.server').then((m) =>
          m.readExtensionFile('index.json', (text) => JSON.parse(text) as ExtensionsIndex),
        )
      : fetch(`${SERVER_DIR}/index.json`).then(async (res) => {
          if (!res.ok) throw new Error(`${SERVER_DIR}/index.json: ${res.status}`)
          return (await res.json()) as ExtensionsIndex
        })

    indexPromise = source.catch((error) => {
      indexPromise = null
      throw error
    })
  }
  return indexPromise
}

export function findEntry(index: ExtensionsIndex, id: string): ExtensionEntry | undefined {
  return index.entries.find((entry) => entry.id === id)
}
