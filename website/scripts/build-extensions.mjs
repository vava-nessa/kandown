/**
 * @file scripts/build-extensions.mjs
 * @description Fetches the community extensions index at build time and writes
 * it (plus a derived tag list and the source URL) to the website's public
 * assets so the prerendered `/extensions` route can load it as a static file.
 *
 * 📖 The canonical home of the index is `registry/extensions.json` in the
 * kandown repo. This build script runs **inside the same repo**, so the local
 * copy on disk is the freshest source available — we read it first. In
 * practice Node's `fetch` and `curl` can hit different CDN edges for the same
 * `raw.githubusercontent.com` URL (we observed one caching the pre-update
 * payload while the other saw the latest), so trusting the remote at build
 * time is a foot-gun. Remote fetch is kept as a fallback so a checkout that
 * lacks `registry/extensions.json` (e.g. an unusual clone) still produces
 * something usable, with a warning.
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
  // 📖 Local first: this script ships in the same repo as the registry, so
  // the file on disk is always the freshest authoritative source. Remote is a
  // fallback for an unusual checkout.
  let entries
  let source
  let url
  try {
    entries = await readLocal()
    source = 'local'
    url = REGISTRY_LOCAL
  } catch (localError) {
    console.warn(`[extensions] local read failed (${localError.message}), falling back to remote`)
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

  console.log(`[extensions] ${out.entries.length} entries, ${out.tags.length} tags → public/extensions/ (source: ${source})`)
}

main().catch((error) => {
  console.error(`[extensions] ${error.message}`)
  process.exit(1)
})
