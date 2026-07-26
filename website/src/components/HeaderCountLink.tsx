/**
 * @file src/components/HeaderCountLink.tsx
 * @description The shape shared by the header's two social links: a mark, an
 * icon, and a number, all inside one anchor.
 *
 * 📖 **Why a shared shell.** `GitHubStars` and `NpmDownloads` are the same
 * control pointing at different places. Kept as two independent components they
 * would drift on exactly the details that must not drift — the gap between
 * items, the hover transition, the width reserved for the number — and the
 * header would slowly stop looking deliberate. Everything that must match is
 * here; everything that differs is passed in.
 *
 * 📖 **One anchor, no box.** The mark and the count are a single click target,
 * a single tab stop, and one thing announced once by a screen reader. There is
 * no border or background: the header's other controls are unboxed, and an
 * outline around the number would split what is meant to read as one phrase.
 *
 * 📖 **The number's width is reserved.** `min-w` holds the space of a
 * three-character count so the row does not shift sideways when the `—`
 * placeholder is replaced by the real figure a moment after load. `tabular-nums`
 * keeps digits from resizing the box as the value changes.
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
  className = 'text-fg-muted hover:text-fg',
  children,
  count,
}: {
  href: string
  /** What a screen reader announces — include the number when it is known. */
  ariaLabel: string
  /** Native tooltip spelling out what the number counts. */
  title: string
  /** Colour classes for the whole link, resting and hover. */
  className?: string
  /** The mark and icon, in reading order. */
  children: ReactNode
  /** Already formatted, or `—` while loading. */
  count: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={ariaLabel}
      title={title}
      className={`flex items-center gap-1.5 px-1.5 py-1 text-[12.5px] transition-colors ${className}`}
    >
      {children}
      <span className="min-w-[2.25ch] font-mono tabular-nums">{count}</span>
    </a>
  )
}
