/**
 * @file src/lib/githubStars.ts
 * @description Client-side GitHub star count, with a localStorage cache.
 *
 * 📖 **Why client-side.** The marketing site is fully static (every page
 * prerenders at build time), so there is no server process to cache the
 * count for us. Hitting GitHub on every render would burn through the
 * anonymous API rate limit (60 req/h per IP) and add latency to first
 * paint. A localStorage cache with a 24h TTL keeps the count fresh in the
 * eyes of every visitor while making exactly one request per visitor per
 * day.
 *
 * 📖 **Why not build-time.** A Vercel deploy hook fired by GitHub would
 * rebuild the site on every star, which is noisy and unnecessary. Stars
 * are not a decision driver at second-by-second resolution; a value that
 * updates once a day is honest about that.
 *
 * 📖 **Why keep the last value on error.** GitHub's anonymous API is
 * reliable but not perfect. If a refresh fails — rate limit, network, a
 * DNS hiccup — the cached value still describes reality from a few hours
 * ago, which is better than rendering nothing or, worse, a hard error
 * inside what should be a quiet decoration.
 *
 * @exports
 *   useGithubStars → hook returning `{ count, loading }`
 *   formatStars    → compact formatter (123 → "1.2k", 12345 → "12k")
 */

import { useEffect, useState } from 'react'

const REPO = 'vava-nessa/kandown'
const STORAGE_KEY = 'kandown:github-stars:v1'
const TTL_MS = 24 * 60 * 60 * 1000

type Cached = { count: number; fetchedAt: number }

/**
 * 📖 `fetchedAt` is the wall-clock time the count was last refreshed.
 * Comparing against `Date.now()` is fine because the TTL is generous
 * enough that clock drift between tabs is irrelevant.
 */
function readCache(): Cached | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached
    if (typeof parsed.count !== 'number' || typeof parsed.fetchedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(count: number): void {
  if (typeof window === 'undefined') return
  try {
    const payload: Cached = { count, fetchedAt: Date.now() }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // 📖 localStorage can be unavailable (private mode, quota); the in-memory
    // state for this tab is still correct, we just lose the cross-session
    // optimisation. Not worth surfacing to the visitor.
  }
}

/**
 * 📖 GitHub's unauthenticated API is CORS-friendly and returns the count
 * in `stargazers_count`. We ask for the minimal payload via the preview
 * header — a few hundred bytes round-tripped, well under any limit.
 */
async function fetchStars(): Promise<number> {
  const response = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(`github stars: ${response.status}`)
  const data = (await response.json()) as { stargazers_count?: number }
  if (typeof data.stargazers_count !== 'number') throw new Error('github stars: malformed response')
  return data.stargazers_count
}

/**
 * 📖 `1.2k`, `12k`, `1.2M` — the compact number Twitter / GitHub use.
 * Keeps the badge under ~5 characters so it never crowds the header.
 */
export function formatStars(count: number): string {
  if (count < 1000) return String(count)
  if (count < 10_000) {
    const v = count / 1000
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}k`.replace(/\.0k$/, 'k')
  }
  if (count < 1_000_000) {
    const v = count / 1000
    return `${Math.round(v)}k`
  }
  return `${(count / 1_000_000).toFixed(1)}M`
}

/**
 * 📖 Returns the cached count synchronously when fresh, then refreshes in
 * the background. The first paint of the badge therefore matches what the
 * server already rendered (a loading placeholder) — no hydration mismatch.
 */
export function useGithubStars(): { count: number | null; loading: boolean } {
  const [count, setCount] = useState<number | null>(() => {
    const cached = readCache()
    return cached ? cached.count : null
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const cached = readCache()
    const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS
    if (fresh) return

    let cancelled = false
    setLoading(true)
    fetchStars()
      .then((next) => {
        if (cancelled) return
        setCount(next)
        writeCache(next)
      })
      .catch(() => {
        // 📖 Keep the cached value (if any) — see "Why keep the last value
        // on error" above. `loading` resets so the badge stops pulsing.
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { count, loading }
}