/**
 * @file src/lib/extensions.server.ts
 * @description SSR-only filesystem reader for the prerendered community
 * extensions index emitted by `scripts/build-extensions.mjs`. Mirrors
 * `changelogs.server.ts`: a sibling file so the client bundle never
 * imports `node:fs`.
 *
 * @see scripts/build-extensions.mjs. The build that produces the index.
 * @see src/lib/extensions.ts. The loader the routes use.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SERVER_DIR = resolve(process.cwd(), 'public', 'extensions')

export async function readExtensionFile<T>(name: string, parse: (text: string) => T): Promise<T> {
  const text = await readFile(`${SERVER_DIR}/${name}`, 'utf8')
  return parse(text)
}
