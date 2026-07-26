/**
 * @file src/components/settings/GitHubStarsRow.tsx
 * @description One row in the *About* section: a star + the live GitHub
 * star count, the whole row linking to the repo.
 *
 * 📖 **Same shape as the marketing site's `GitHubStars`.** The badge
 * here and the badge in the site header share the same hook, so the two
 * counts never disagree by more than 24h — and during normal use, by
 * less than a second, because both surfaces hydrate against the same
 * `localStorage` key.
 *
 * 📖 **The row matches the About card's grid.** Version and Status in
 * `AboutVersionCard` already use `flex items-center justify-between`
 * with a fixed label column on the left, so this row slots in without
 * any layout shift.
 *
 * @exports GitHubStarsRow
 */
import { useGithubStars, formatStars } from '../../lib/githubStars';

export function GitHubStarsRow({ href }: { href: string }) {
  const { count, loading } = useGithubStars();
  const text = loading || count === null ? '—' : formatStars(count);

  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-medium text-fg-muted">GitHub stars</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={
          count === null ? 'Kandown on GitHub' : `Kandown on GitHub, ${count} stars`
        }
        className="flex items-center gap-1.5 rounded-[5px] bg-bg-2 px-2.5 py-1 text-[12.5px] text-fg transition-colors hover:bg-bg-3"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="shrink-0 text-warning"
        >
          <path d="M12 2.5l2.95 6 6.6.95-4.78 4.66 1.13 6.58L12 17.65 6.1 20.7l1.13-6.58L2.45 9.45l6.6-.95L12 2.5z" />
        </svg>
        <span className="font-mono tabular-nums">{text}</span>
      </a>
    </div>
  );
}