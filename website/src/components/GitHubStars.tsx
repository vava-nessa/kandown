/**
 * @file src/components/GitHubStars.tsx
 * @description The `★ 1.2k` pill that lives next to the GitHub icon in the
 * site header. The whole pill is one click target that opens the repo.
 *
 * 📖 **SSR contract.** `useGithubStars` returns `count: null` and
 * `loading: true` on the first render, which means the pill renders the
 * loading placeholder (`★ —`). The server emits the same placeholder, so
 * the hydration step finds matching markup and does not warn. The
 * placeholder is intentionally short — a wider one would shift the
 * header's grid when it expands to a real number.
 *
 * 📖 **Why a `<span>` instead of skeleton animation.** Skeletons in a
 * 60-pixel-wide badge look restless without adding information. A muted
 * dash is enough to mark "loading" while the count lands, and it
 * disappears as soon as the network resolves.
 *
 * @exports GitHubStars
 */
import { useGithubStars, formatStars } from '~/lib/githubStars'

export function GitHubStars({ href }: { href: string }) {
  const { count, loading } = useGithubStars()
  const text = loading || count === null ? '—' : formatStars(count)

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={count === null ? 'GitHub repository' : `GitHub repository, ${count} stars`}
      className="group flex items-center gap-1.5 rounded-[4px] border border-border bg-bg-subtle px-2 py-1 text-[12.5px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
    >
      {/* 📖 Tabler-style star — slightly heavier than the GitHub icon so the
          badge reads as "stars" first, "GitHub" second. Inline SVG keeps the
          site free of icon-font dependencies. */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className="shrink-0 text-warning"
      >
        <path d="M12 2.5l2.95 6 6.6.95-4.78 4.66 1.13 6.58L12 17.65 6.1 20.7l1.13-6.58L2.45 9.45l6.6-.95L12 2.5z" />
      </svg>
      <span className="font-mono tabular-nums">{text}</span>
    </a>
  )
}