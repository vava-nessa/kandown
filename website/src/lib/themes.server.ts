/**
 * @file src/lib/themes.server.ts
 * @description SSR-only filesystem reader for the prerendered community
 * themes index emitted by `scripts/build-themes.mjs`. Mirrors
 * `extensions.server.ts`.
 *
 * @see scripts/build-themes.mjs. The build that produces the index.
 * @see src/lib/themes.ts. The loader the routes use.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SERVER_DIR = resolve(process.cwd(), 'public', 'themes')

export async function readThemeFile<T>(name: string, parse: (text: string) => T): Promise<T> {
  const text = await readFile(`${SERVER_DIR}/${name}`, 'utf8')
  return parse(text)
}