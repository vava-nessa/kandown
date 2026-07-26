/**
 * @file src/components/GitHubStars.tsx
 * @description The `⬤ GitHub ★ 1.2k` link in the site header — mark, word, star
 * and count are one single anchor pointing at the repository.
 *
 * 📖 **One link, not two.** The header used to carry an Octocat mark and a
 * bordered star pill side by side: two separate anchors with the same `href`,
 * which meant two tab stops, two hover targets, and a screen reader announcing
 * the repository twice in a row. Both are now inside one anchor, so the whole
 * group highlights and activates as the single thing it always was.
 *
 * 📖 **The border is gone on purpose.** A pill outline around the count boxed
 * it off from the mark next to it and made two controls out of one. Without it
 * the four parts read left to right as a single phrase, and the header's other
 * items (search, npm, menu) are unboxed too, so it now matches them.
 *
 * 📖 **The star is GitHub's own icon**, taken from Octicons at its native
 * 16×16 viewBox rather than redrawn — a hand-made star next to a real one reads
 * as slightly wrong without the viewer being able to say why. It inherits
 * `currentColor` so the whole link lights up as a single unit on hover, which
 * is how GitHub renders it too; a gold star would pull the eye to the icon and
 * break the link into two visual pieces again.
 *
 * 📖 **SSR contract.** `useGithubStars` returns `count: null` and
 * `loading: true` on the first render, so both the server and the first client
 * render emit the same `—` placeholder and hydration finds matching markup. The
 * placeholder is deliberately narrow: `tabular-nums` plus a fixed minimum width
 * keeps the header from shifting when the real number lands.
 *
 * @exports GitHubStars
 * @see website/src/components/SiteHeader.tsx — the only caller
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
      aria-label={count === null ? 'Kandown on GitHub' : `Kandown on GitHub, ${count} stars`}
      className="flex items-center gap-1.5 px-1.5 py-1 text-[12.5px] text-fg-muted transition-colors hover:text-fg"
    >
      {/* 📖 The Octocat mark, kept from the standalone link this component
          absorbed — it is what makes the destination recognisable before the
          word is read. Now inside the anchor rather than beside it. */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
      <span>GitHub</span>
      {/* 📖 Octicon `star-fill`, 16×16, verbatim. */}
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
      </svg>
      {/* 📖 `min-w` reserves the width of a four-character count so the npm logo
          to the right does not jump when `—` is replaced by the real figure. */}
      <span className="min-w-[2.25ch] font-mono tabular-nums">{text}</span>
    </a>
  )
}
