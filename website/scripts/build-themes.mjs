/**
 * @file scripts/build-themes.mjs
 * @description Fetches the community themes index at build time and writes
 * it (plus a derived tag list and the source URL) to the website's public
 * assets so the prerendered `/themes` route can load it as a static file.
 * Mirror of `build-extensions.mjs`.
 *
 * 📖 The canonical home of the index is `registry/themes.json` in the
 * kandown repo. This script runs inside the same repo, so the local copy
 * on disk is the freshest source available. Remote fetch is a fallback
 * for an unusual clone that lacks `registry/themes.json`.
 *
 * Runs from `predev` / `prebuild`; run it alone with `pnpm themes`.
 *
 * @see website/src/routes/themes/index.tsx — the consumer
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const WEBSITE = resolve(HERE, '..')
const REPO_ROOT = resolve(WEBSITE, '..')
const REGISTRY_LOCAL = join(REPO_ROOT, 'registry', 'themes.json')
const REGISTRY_REMOTE =
  'https://raw.githubusercontent.com/vava-nessa/kandown/main/registry/themes.json'
const OUT_DIR = join(WEBSITE, 'public', 'themes')

async function fetchRemote(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function readLocal() {
  const raw = await readFile(REGISTRY_LOCAL, 'utf8')
  return JSON.parse(raw)
}

/** 📖 Tags are unioned across all entries, sorted alphabetically. */
function collectTags(entries) {
  const set = new Set()
  for (const e of entries) {
    if (Array.isArray(e.tags)) for (const t of e.tags) set.add(t)
  }
  return [...set].sort()
}

async function main() {
  let entries
  let source
  let url
  try {
    entries = await readLocal()
    source = 'local'
    url = REGISTRY_LOCAL
  } catch (localError) {
    console.warn(`[themes] local read failed (${localError.message}), falling back to remote`)
    try {
      entries = await fetchRemote(REGISTRY_REMOTE)
      source = 'remote'
      url = REGISTRY_REMOTE
    } catch (remoteError) {
      throw new Error(
        `neither local (${REGISTRY_LOCAL}) nor remote (${REGISTRY_REMOTE}) worked: ` +
          `${localError.message} / ${remoteError.message}`,
      )
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    url,
    source,
    tags: collectTags(entries),
    entries,
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(join(OUT_DIR, 'index.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8')

  console.log(`[themes] ${out.entries.length} entries, ${out.tags.length} tags → public/themes/ (source: ${source})`)
}

main().catch((error) => {
  console.error(`[themes] ${error.message}`)
  process.exit(1)
})