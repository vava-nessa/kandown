/**
 * @file src/lib/githubStars.ts
 * @description The GitHub star count shown in the site header.
 *
 * 📖 All of the interesting behaviour: the daily `localStorage` cache, the
 * decision to fetch in the browser rather than at build time, and the SSR
 * contract that keeps hydration quiet, lives in `cachedCount.ts` and is
 * documented there. What remains here is the part specific to GitHub: one URL,
 * one field, one shape check.
 *
 * 📖 GitHub's unauthenticated repository endpoint is CORS-friendly and returns
 * the count as `stargazers_count`. It is rate-limited to 60 requests per hour
 * per IP, which the 24-hour cache keeps us far below.
 *
 * @functions
 *   fetchStars     → the API call
 *   useGithubStars → hook returning `{ count, loading }`
 *
 * @exports useGithubStars, formatStars
 * @see website/src/lib/cachedCount.ts. The caching and SSR behaviour.
 * @see website/src/components/GitHubStars.tsx. The only caller.
 */
import { useCachedValue, formatCompact } from './cachedCount'

const REPO = 'vava-nessa/kandown'
// 📖 Bumped to v2 with the move to the shared cache: the stored shape changed
// from `{ count, fetchedAt }` to `{ value, fetchedAt }`. A returning visitor's
// v1 entry would fail validation and be refetched anyway, but a new key makes
// that a deliberate migration rather than a silent parse failure.
const STORAGE_KEY = 'kandown:github-stars:v2'

function isCount(value: unknown): value is number {
  return typeof value === 'number'
}

async function fetchStars(): Promise<number> {
  const response = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(`github stars: ${response.status}`)
  const data = (await response.json()) as { stargazers_count?: unknown }
  if (typeof data.stargazers_count !== 'number') throw new Error('github stars: malformed response')
  return data.stargazers_count
}

export function useGithubStars(): { count: number | null; loading: boolean } {
  const { value, loading } = useCachedValue<number>({
    storageKey: STORAGE_KEY,
    fetcher: fetchStars,
    isValid: isCount,
  })
  return { count: value, loading }
}

/** 📖 Re-exported under its original name; the implementation is shared now. */
export const formatStars = formatCompact
