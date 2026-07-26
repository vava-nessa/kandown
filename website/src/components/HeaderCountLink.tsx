/**
 * @file src/components/HeaderCountLink.tsx
 * @description The shape shared by the header's two social links: a brand mark
 * and its name on top, the count tucked underneath in a small grey chip, all
 * inside one anchor.
 *
 * 📖 **Why a shared shell.** `GitHubStars` and `NpmDownloads` are the same
 * control pointing at different places. Kept as two independent components they
 * would drift on exactly the details that must not drift — the stack spacing,
 * the chip fill, the hover, the width reserved for the number — and the header
 * would slowly stop looking deliberate. Everything that must match is here;
 * everything that differs is passed in.
 *
 * 📖 **One anchor.** Mark, name, icon and number are a single click target, a
 * single tab stop, and one thing announced once by a screen reader.
 *
 * 📖 **Stacked, not inline.** The count sits on a second line under the mark
 * rather than beside it. Inline, four elements in a row made each link read as
 * a sentence competing with the navigation next to it; stacked, the mark is
 * what you see and the number is a footnote you can choose to read. It also
 * lets the two links stay narrow enough to sit comfortably at the end of the
 * bar.
 *
 * ⚠️ **The chip is positioned, not stacked in flow, and that is the whole
 * point.** As a second flex row it would make the anchor twice as tall, and the
 * header centres its items — so both logos would ride up by half the chip's
 * height and stop lining up with the search field and the App button beside
 * them. The row would look subtly crooked without it being obvious why. Taking
 * the chip out of flow with `absolute top-full` means the anchor is exactly as
 * tall as its mark, sits on the same centre line as every other control, and
 * the number simply hangs underneath. Do not turn this back into a two-row
 * flex column.
 *
 * 📖 **No fill behind the count, and no brand colour on it.** Both were tried
 * and both made the corner louder than it should be: a filled chip drew a box
 * around the quietest element in the header, and tinting each count to its
 * service put two saturated marks under two logos and made the numbers read
 * before the marks — backwards, since the logo identifies the link and the
 * number is supporting detail. Small grey type on the header's own background
 * is enough. Grey also means the two counts read as one kind of thing rather
 * than as two unrelated badges.
 *
 * 📖 **The number's width is reserved.** `min-w` holds the space of a
 * three-character count so the chip does not resize when the `—` placeholder is
 * replaced by the real figure a moment after load, and `tabular-nums` keeps
 * digits from shifting it as the value changes. The width is in `ch`, so it
 * follows the chip's own font size instead of needing to be retuned whenever
 * that size changes.
 *
 * 📖 **The count rests at 50% opacity.** Small grey type was already quiet, but
 * at full strength two numbers still read as a second row of content under the
 * marks. Half-strength puts them below the threshold where the eye stops on
 * them, so the row scans as two logos with something attached rather than as
 * four items.
 *
 * 📖 **Hover grows the whole link to 1.2× over 200ms** and brings the count to
 * full opacity — one gesture, two channels, so the feedback is unmissable on a
 * control this small. Scaling does not affect layout, so the link grows over
 * its neighbours instead of pushing them and the header does not jitter as the
 * pointer crosses it. Under `prefers-reduced-motion` the scale is dropped; the
 * colour and opacity change still report the hover.
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
 * @exports HeaderCountLink
 * @see website/src/components/GitHubStars.tsx
 * @see website/src/components/NpmDownloads.tsx
 */
import type { ReactNode } from 'react'

export function HeaderCountLink({
  href,
  ariaLabel,
  title,
  brand,
  metric,
  count,
}: {
  href: string
  /** What a screen reader announces — include the number when it is known. */
  ariaLabel: string
  /** Native tooltip spelling out what the number counts. */
  title: string
  /** The logo and its name. Sits on the top line at full strength. */
  brand: ReactNode
  /** The icon saying what is being counted. Sits in the chip with the number. */
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
      className="group relative flex items-center gap-1.5 px-1.5 text-[12.5px] leading-none text-fg-muted transition-[color,scale] duration-200 ease-out hover:scale-[1.2] hover:text-fg motion-reduce:transition-none motion-reduce:hover:scale-100"
    >
      {brand}
      <span className="absolute top-full left-1/2 mt-[3px] flex -translate-x-1/2 items-center gap-[3px] text-[8.5px] leading-none text-fg-muted opacity-50 transition-opacity duration-200 ease-out group-hover:opacity-100">
        {metric}
        <span className="min-w-[2.5ch] text-center font-mono tabular-nums">{count}</span>
      </span>
    </a>
  )
}
