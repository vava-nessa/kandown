/**
 * @file src/lib/cachedCount.ts
 * @description The shared machinery behind the header's social counts: fetch a
 * small value from a public API once a day, keep it in `localStorage`, and hand
 * it to a component without ever blocking a render.
 *
 * 📖 **Why this exists separately.** The GitHub star count and the npm download
 * count are the same problem twice: a number from a third-party API, on a
 * fully static site, that must not break the header when the network does.
 * Written twice they would drift: one would grow a retry, the other a different
 * TTL, and a bug fixed in one would survive in the other. The API-specific part
 * of each is now just a URL and a parser.
 *
 * 📖 **Why client-side at all.** Every page prerenders at build time, so there
 * is no server process to cache anything for us. Fetching in the browser with a
 * 24-hour `localStorage` TTL means one request per visitor per day, which stays
 * far inside GitHub's anonymous limit of 60 requests per hour per IP and adds
 * nothing to first paint. Rebuilding the site on every star via a deploy hook
 * was the alternative, and it would redeploy production as a side effect of
 * someone clicking a button on github.com.
 *
 * 📖 **Why the last known value survives an error.** These APIs are reliable but
 * not perfect, so a rate limit, a flaky network, or a DNS hiccup can all happen. A value from a few
 * hours ago still describes reality; an error state inside what is meant to be
 * a quiet decoration does not. Failures are therefore swallowed and the cached
 * value stays on screen.
 *
 * 📖 **The SSR contract every caller depends on.** The first render must return
 * the same thing on the server and in the browser, or hydration warns and React
 * throws the markup away. So the initial state is always `null` (never the
 * cached value, tempting as that is), and the cache is only consulted inside
 * `useEffect`, which does not run during prerender. Each caller renders a
 * placeholder for `null`, the server bakes that placeholder, and the real
 * number replaces it a moment later.
 *
 * @functions
 *   useCachedValue → hook returning `{ value, loading }` for one remote value
 *   formatCompact  → 1234 → "1.2k", 12345 → "12k", 1200000 → "1.2M"
 *
 * @exports useCachedValue, formatCompact
 * @see website/src/lib/githubStars.ts. Stars.
 * @see website/src/lib/npmDownloads.ts. Downloads.
 */
import { useEffect, useState } from 'react'

const TTL_MS = 24 * 60 * 60 * 1000

type Cached<T> = { value: T; fetchedAt: number }

/**
 * 📖 `fetchedAt` is wall-clock time. Comparing it against `Date.now()` is safe
 * here because the TTL is a full day, so clock drift between tabs, or a machine
 * waking from sleep, cannot meaningfully change the outcome.
 */
function readCache<T>(storageKey: string, isValid: (value: unknown) => value is T): Cached<T> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { value, fetchedAt } = parsed as { value?: unknown; fetchedAt?: unknown }
    if (typeof fetchedAt !== 'number' || !isValid(value)) return null
    return { value, fetchedAt }
  } catch {
    // 📖 Unreadable or malformed cache: from an older key shape, a truncated
    // write, or a browser that just denied access. Treat it as absent and
    // refetch rather than trying to repair it.
    return null
  }
}

function writeCache<T>(storageKey: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    const payload: Cached<T> = { value, fetchedAt: Date.now() }
    window.localStorage.setItem(storageKey, JSON.stringify(payload))
  } catch {
    // 📖 localStorage can be unavailable (private mode, quota exceeded). The
    // in-memory state for this tab is still correct; all that is lost is the
    // cross-session saving. Not worth surfacing to the visitor.
  }
}

/**
 * @description Fetches one remote value at most once per day per visitor and
 * returns it, keeping the previous value visible while a refresh is in flight.
 *
 * 📖 `isValid` is a type guard rather than a cast because the input is
 * `localStorage`, which any extension or an older build of this site can write
 * to. A shape check at the boundary is what keeps the rest of the code free of
 * defensive branches.
 *
 * 📖 `fetcher` is intentionally not in the dependency array: callers pass an
 * inline function, which is a new reference on every render, and depending on
 * it would refetch in a loop. The effect is meant to run exactly once per
 * mount.
 */
export function useCachedValue<T>(options: {
  storageKey: string
  fetcher: () => Promise<T>
  isValid: (value: unknown) => value is T
}): { value: T | null; loading: boolean } {
  const { storageKey, fetcher, isValid } = options

  // 📖 Always `null` on the first render, see the SSR contract above.
  const [value, setValue] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cached = readCache(storageKey, isValid)
    if (cached) {
      setValue(cached.value)
      if (Date.now() - cached.fetchedAt < TTL_MS) {
        setLoading(false)
        return
      }
    }

    let cancelled = false
    fetcher()
      .then((next) => {
        if (cancelled) return
        setValue(next)
        writeCache(storageKey, next)
      })
      .catch(() => {
        // 📖 Keep whatever the cache gave us. See "Why the last known value
        // survives an error" above.
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  return { value, loading }
}

/**
 * 📖 `1.2k`, `12k`, `1.2M`: the compact form GitHub and npm both use. Keeping
 * it under five characters is what stops a growing number from reflowing the
 * header the day the project gets popular.
 */
export function formatCompact(count: number): string {
  if (count < 1000) return String(count)
  if (count < 10_000) {
    const v = count / 1000
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}k`.replace(/\.0k$/, 'k')
  }
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`
  return `${(count / 1_000_000).toFixed(1)}M`
}
