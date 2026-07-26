/**
 * @file src/lib/githubStars.ts
 * @description Client-side GitHub star count for the Kandown web app,
 * with a localStorage cache.
 *
 * 📖 **Same shape as `website/src/lib/githubStars.ts`.** Both surfaces
 * fetch the same endpoint, format the same way, and cache for the same
 * TTL — kept as separate files because the two packages do not share
 * dependencies (the marketing site and the Kandown CLI are independent
 * workspaces). Each is ~40 lines, the duplication is cheaper than
 * factoring out a shared package.
 *
 * 📖 **Why client-side.** The app runs in the browser and never contacts
 * GitHub itself for this number; doing it server-side would mean a new
 * API surface (the daemon doesn't fetch star counts). One anonymous
 * request per visitor per day is the lightest possible interaction.
 *
 * @exports useGithubStars → hook returning `{ count, loading }`
 * @exports formatStars   → compact formatter ("1.2k", "12k", "1.2M")
 */
import { useEffect, useState } from 'react';

const REPO = 'vava-nessa/kandown';
const STORAGE_KEY = 'kandown:github-stars:v1';
const TTL_MS = 24 * 60 * 60 * 1000;

type Cached = { count: number; fetchedAt: number };

function readCache(): Cached | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (typeof parsed.count !== 'number' || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(count: number): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: Cached = { count, fetchedAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* localStorage may be unavailable (private mode); the in-tab state is
       still correct, we just lose the cross-session optimisation. */
  }
}

async function fetchStars(): Promise<number> {
  const response = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`github stars: ${response.status}`);
  const data = (await response.json()) as { stargazers_count?: number };
  if (typeof data.stargazers_count !== 'number') {
    throw new Error('github stars: malformed response');
  }
  return data.stargazers_count;
}

/**
 * 📖 Same compact formatter the marketing site uses, so the count
 * displayed in the *About* card of the running app matches the badge in
 * the site's header.
 */
export function formatStars(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) {
    const v = count / 1000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}k`.replace(/\.0k$/, 'k');
  }
  if (count < 1_000_000) {
    return `${Math.round(count / 1000)}k`;
  }
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/**
 * 📖 Synchronous cache read on the first render means the badge never
 * flashes empty; the GitHub request only fires when the cache is stale
 * or missing.
 */
export function useGithubStars(): { count: number | null; loading: boolean } {
  const [count, setCount] = useState<number | null>(() => {
    const cached = readCache();
    return cached ? cached.count : null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = readCache();
    const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS;
    if (fresh) return;

    let cancelled = false;
    setLoading(true);
    fetchStars()
      .then((next) => {
        if (cancelled) return;
        setCount(next);
        writeCache(next);
      })
      .catch(() => {
        /* Keep the cached value if any; see website/src/lib/githubStars.ts
           for the full rationale. */
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { count, loading };
}