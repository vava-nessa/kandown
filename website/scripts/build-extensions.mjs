/**
 * @file scripts/build-extensions.mjs
 * @description Fetches the community extensions index at build time and writes
 * it (plus a derived tag list and the source URL) to the website's public
 * assets so the prerendered `/extensions` route can load it as a static file.
 *
 * 📖 The canonical home of the index is `registry/extensions.json` in the
 * kandown repo. In production we fetch it from
 * `raw.githubusercontent.com/vava-nessa/kandown/main/registry/extensions.json`
 * (the same URL the daemon serves). In local development — or when the
 * network is unavailable — the script falls back to reading the file directly
 * from disk so `pnpm dev` never breaks.
 *
 * 📖 **Why a build step.** The route is prerendered, so the data must exist
 * before the page is generated. Bundling a 3 KB JSON at build is cheaper than
 * shipping a network call on every prerender, and it keeps the gallery working
 * offline once the site is cached.
 *
 * Runs from `predev` / `prebuild`; run it alone with `pnpm extensions`.
 *
 * @see website/src/routes/extensions/index.tsx — the consumer
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const WEBSITE = resolve(HERE, '..')
// 📖 Repo root is one level up from `website/`.
const REPO_ROOT = resolve(WEBSITE, '..')
const REGISTRY_LOCAL = join(REPO_ROOT, 'registry', 'extensions.json')
const REGISTRY_REMOTE =
  'https://raw.githubusercontent.com/vava-nessa/kandown/main/registry/extensions.json'
const OUT_DIR = join(WEBSITE, 'public', 'extensions')

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
  /** { entries, url, source: 'remote'|'local', generatedAt, tags } */
  let payload
  try {
    const entries = await fetchRemote(REGISTRY_REMOTE)
    payload = {
      entries: Array.isArray(entries) ? entries : entries.entries ?? [],
      url: REGISTRY_REMOTE,
      source: 'remote',
    }
  } catch (error) {
    const entries = await readLocal()
    payload = {
      entries,
      url: REGISTRY_LOCAL,
      source: 'local',
      fallbackReason: error instanceof Error ? error.message : String(error),
    }
    console.warn(`[extensions] remote fetch failed (${payload.fallbackReason}), using local file`)
  }

  const out = {
    generatedAt: new Date().toISOString(),
    url: payload.url,
    source: payload.source,
    tags: collectTags(payload.entries),
    entries: payload.entries,
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(join(OUT_DIR, 'index.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8')

  console.log(`[extensions] ${out.entries.length} entries, ${out.tags.length} tags → public/extensions/`)
}

main().catch((error) => {
  console.error(`[extensions] ${error.message}`)
  process.exit(1)
})
