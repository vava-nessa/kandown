/**
 * @file src/lib/npmDownloads.ts
 * @description The npm download count shown in the site header, and the one
 * subtlety that makes it honest.
 *
 * 📖 **npm has no "total downloads" endpoint.** The registry's download API
 * answers for a date range, and it silently clamps any range longer than
 * **18 months**, so ask it for everything since 2015 and it returns a number for
 * the last 18 months while quietly rewriting `start` in its own reply. Nothing
 * about the response says it was truncated; a caller that ignores `start` will
 * happily print a year-and-a-half figure under the word "total" and never know.
 *
 * 📖 **So the reply is checked rather than trusted.** We ask for a deliberately
 * over-wide range and compare the `start` we get back against the date the
 * package was first published. If the window reaches back that far, the number
 * genuinely is every download the package has ever had, and the link says so.
 * Once Kandown is older than 18 months that stops being true, and on that day
 * the label changes by itself, with nothing to remember and nothing to edit.
 *
 * 📖 `FIRST_PUBLISH` is a constant rather than a lookup because the alternative
 * is fetching the full packument from `registry.npmjs.org`, which is over
 * 270 KB (every version, every dist tag, every shasum) to read one date that
 * cannot change. The value is the publish date of v0.1.0, visible in the
 * changelog and in `npm view kandown time.created`.
 *
 * @functions
 *   fetchDownloads   → the API call, returning the count and the window it covers
 *   useNpmDownloads  → hook returning `{ count, isLifetime, loading }`
 *
 * @exports useNpmDownloads
 * @see website/src/lib/cachedCount.ts. The caching and SSR behaviour.
 * @see website/src/components/NpmDownloads.tsx. The only caller.
 */
import { useCachedValue } from './cachedCount'

const PACKAGE = 'kandown'
const STORAGE_KEY = 'kandown:npm-downloads:v1'

/** 📖 First publish of v0.1.0. See the note above on why this is not fetched. */
const FIRST_PUBLISH = '2026-04-19'

/**
 * 📖 The earliest date the registry accepts. Asking from here means the reply's
 * `start` is always the API's own clamp rather than our guess at it.
 */
const API_EPOCH = '2015-01-10'

type Downloads = {
  count: number
  /** True when the returned window reaches back to before the first publish. */
  isLifetime: boolean
}

function isDownloads(value: unknown): value is Downloads {
  if (typeof value !== 'object' || value === null) return false
  const { count, isLifetime } = value as { count?: unknown; isLifetime?: unknown }
  return typeof count === 'number' && typeof isLifetime === 'boolean'
}

async function fetchDownloads(): Promise<Downloads> {
  const today = new Date().toISOString().slice(0, 10)
  const response = await fetch(
    `https://api.npmjs.org/downloads/point/${API_EPOCH}:${today}/${PACKAGE}`,
  )
  if (!response.ok) throw new Error(`npm downloads: ${response.status}`)
  const data = (await response.json()) as { downloads?: unknown; start?: unknown }
  if (typeof data.downloads !== 'number') throw new Error('npm downloads: malformed response')

  // 📖 String comparison is exact for ISO dates, which sort lexicographically.
  // A missing `start` is treated as "not lifetime", the cautious reading, and
  // the one that cannot overstate the number.
  const isLifetime = typeof data.start === 'string' && data.start <= FIRST_PUBLISH

  return { count: data.downloads, isLifetime }
}

export function useNpmDownloads(): { count: number | null; isLifetime: boolean; loading: boolean } {
  const { value, loading } = useCachedValue<Downloads>({
    storageKey: STORAGE_KEY,
    fetcher: fetchDownloads,
    isValid: isDownloads,
  })
  return { count: value?.count ?? null, isLifetime: value?.isLifetime ?? false, loading }
}
