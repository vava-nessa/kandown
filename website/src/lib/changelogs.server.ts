/**
 * @file src/lib/changelogs.server.ts
 * @description SSR-only filesystem reader for the prerendered changelog
 * assets. Kept in a separate file so Vite's client bundler never imports it
 * — the changelog loaders only reach this code when `import.meta.env.SSR`
 * is true, and the client graph can therefore drop it entirely.
 *
 * 📖 **Why a separate file.** `changelog.ts` is the loader every consumer
 * imports, and it branches on `import.meta.env.SSR`. The branch that reads
 * the disk must only resolve to an actual filesystem call when the bundle
 * running is the SSR one. Putting the disk code in a sibling file and
 * importing it through a dynamic `import()` keeps the client bundle free of
 * `node:fs` references, so Vite has no reason to externalise anything.
 *
 * 📖 **Why `process.cwd()`.** `import.meta.url` after a production build
 * points at a hashed file inside `dist/server/assets/`, so a relative
 * `new URL('../../public/changelogs/', import.meta.url)` resolves to a path
 * that does not exist (Vite copies `public/` into `dist/client/`, not next
 * to the SSR bundle). `process.cwd()` is the project's `website/` directory
 * in every environment we run in — the Vite dev server, the TanStack Start
 * prerender worker, and the deployed Node runtime — so the path is stable
 * and the file reads are correct.
 *
 * @see scripts/build-changelogs.mjs — the build that produces these files
 * @see src/lib/changelogs.ts — the loader the rest of the app uses
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * 📖 Absolute path to the generated `<repo>/website/public/changelogs/`
 * directory. Resolved once at module load so every call site uses the same
 * path without re-walking `process.cwd()`.
 */
const SERVER_DIR = resolve(process.cwd(), 'public', 'changelogs')

export async function readChangelogFile<T>(name: string, parse: (text: string) => T): Promise<T> {
  const text = await readFile(`${SERVER_DIR}/${name}`, 'utf8')
  return parse(text)
}