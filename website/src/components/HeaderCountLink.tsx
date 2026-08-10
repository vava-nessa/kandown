/**
 * @file src/components/HeaderCountLink.tsx
 * @description The sleek, rounded pill shell shared by the header's social links:
 * GitHub stars and npm downloads.
 *
 * 📖 **Inline capsule button.** Replaces the older stacked layout with a clean,
 * single-line pill control: brand logo icon on the left, metric icon in the middle,
 * and the count on the right.
 *
 * 📖 **One anchor.** Brand logo, metric icon and count are a single click target,
 * a single tab stop, and announced cleanly by screen readers.
 *
 * @exports HeaderCountLink
 * @see website/src/components/GitHubStars.tsx
 * @see website/src/components/NpmDownloads.tsx
 */
import type { ReactNode } from 'react'

export function HeaderCountLink({
  href,
  ariaLabel,
  title,
  icon,
  metric,
  count,
}: {
  href: string
  /** What a screen reader announces; include the number when it is known. */
  ariaLabel: string
  /** Native tooltip spelling out what the number counts. */
  title: string
  /** The brand logo icon on the far left of the pill. */
  icon: ReactNode
  /** The icon saying what is being counted (star, download arrow, etc). */
  metric: ReactNode
  /** Already formatted metric count, or `…` while loading. */
  count: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={ariaLabel}
      title={title}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-[13px] font-semibold text-fg shadow-2xs transition-all duration-150 ease-out hover:border-border-strong hover:bg-bg-subtle hover:shadow-xs active:scale-[0.98]"
    >
      <span className="flex shrink-0 items-center justify-center">{icon}</span>
      <span className="flex items-center gap-1.5">
        <span className="flex shrink-0 items-center justify-center">{metric}</span>
        <span className="font-mono text-[12.5px] font-bold tracking-tight text-fg tabular-nums">{count}</span>
      </span>
    </a>
  )
}

