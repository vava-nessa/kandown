/**
 * @file src/components/HeaderCountLink.tsx
 * @description The shape shared by the header's two social links: a brand mark
 * at full strength, then a dimmed metric — an icon and a number — inside one
 * anchor.
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
 * keeps digits from resizing the box as the value changes. The width is in `ch`
 * rather than pixels, so it follows the metric's own font size instead of
 * needing to be retuned whenever that size changes.
 *
 * 📖 **The metric is set a fifth smaller than the mark** — 10px against the
 * link's 12.5px — and its gap tightens to match. Size is doing the same work as
 * the opacity below it: a number that reads at the same scale as the logo asks
 * to be compared with the navigation, and it is not that kind of information.
 * Both icons are drawn at 10px square for the same reason, keeping them optically
 * level with the digits beside them.
 *
 * 📖 **Hover grows the whole link to 1.2× over 200ms**, alongside the metric
 * returning to full opacity — one gesture, two channels, so the feedback is
 * unmissable on a control this small. Scaling does not affect layout, so the
 * link grows *over* its neighbours instead of pushing them and the header does
 * not jitter as the pointer crosses it. `duration-200` and `ease-out` are set
 * on both the anchor and the metric so the growth and the fade finish together.
 * Under `prefers-reduced-motion` the scale is dropped; the colour and opacity
 * change still report the hover.
 *
 * ⚠️ The property list names **`scale`, not `transform`**. Tailwind v4 compiles
 * `scale-[1.2]` to the standalone CSS `scale: 1.2` property, not to
 * `transform: scale(1.2)`, so an arbitrary `transition-[…,transform]` does not
 * observe it and the link snaps to its new size with no animation — close
 * enough to correct in passing that it is easy to miss. (Tailwind's own
 * `transition-transform` utility does cover it, because it expands to
 * `transform,translate,scale,rotate`; only the hand-written property list has
 * to spell it out.) Adding a translate or a rotate here means naming those too.
 *
 * 📖 **The mark stays at full strength; only the metric is held back.** This is
 * the split the two `brand` / `metric` slots exist to enforce. The Octocat and
 * the npm wordmark are what make the link recognisable at a glance and they are
 * already calibrated as logos — dimming them makes the header look faded rather
 * than quiet. The star and the download arrow with their numbers are supporting
 * detail next to those marks, so they sit at 60% and rise to full on hover,
 * which also confirms the whole group is one live target. Opacity rather than a
 * lighter colour, because npm's red has to stay recognisably npm's red.
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
  metricClassName,
  brand,
  metric,
  count,
}: {
  href: string
  /** What a screen reader announces — include the number when it is known. */
  ariaLabel: string
  /** Native tooltip spelling out what the number counts. */
  title: string
  /** Colour classes for the mark and wordmark, resting and hover. */
  className?: string
  /**
   * Colour classes for the icon and number only.
   *
   * 📖 Separate from `className` because the two halves of the link are
   * coloured for different reasons and one is an inline SVG. The Octocat draws
   * with `currentColor`, so colouring the whole anchor to tint the star would
   * repaint the mark along with it — and a coloured Octocat stops being the
   * Octocat. Each link therefore keeps a neutral brand half and an accented
   * metric half.
   */
  metricClassName?: string
  /** The logo, and any wordmark beside it. Rendered at full opacity. */
  brand: ReactNode
  /** The icon that says what is being counted. Dimmed with the number. */
  metric: ReactNode
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
      className={`group flex items-center gap-1.5 px-1.5 py-1 text-[12.5px] transition-[color,scale] duration-200 ease-out hover:scale-[1.2] motion-reduce:transition-none motion-reduce:hover:scale-100 ${className}`}
    >
      {brand}
      {/* 📖 One wrapper for icon and number so they fade as a single unit —
          dimming them separately lets the two land at different moments during
          the transition and reads as a glitch. `group-hover` because the hover
          target is the whole anchor, not this span. */}
      {/* 📖 Icon and number share one chip: they are a single reading — "five
          stars", "fifteen thousand downloads" — and splitting the fill between
          them would make the icon look like it belonged to the mark on its
          left. No border; at 10px an outline around a pale fill turns into
          noise, and the fill alone already separates the value from the brand.
          `items-center` on the row plus `text-center` on the number keeps the
          contents optically centred whether the count is one character or
          four. */}
      <span
        className={`flex items-center gap-1 rounded-[3px] bg-[#F1FFB8] px-1.5 py-0.5 text-[10px] leading-none opacity-60 transition-opacity duration-200 ease-out group-hover:opacity-100 ${metricClassName ?? ''}`}
      >
        {metric}
        <span className="min-w-[2.5ch] text-center font-mono tabular-nums">{count}</span>
      </span>
    </a>
  )
}
