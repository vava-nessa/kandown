/**
 * @file src/components/NpmDownloads.tsx
 * @description The npm link in the site header, with the wordmark and the word
 * "npm" on the centre line, the download count hanging underneath, all one
 * anchor pointing at the package.
 *
 * 📖 **The twin of `GitHubStars`.** Same anchor, same spacing, same loading
 * placeholder, all inherited from `HeaderCountLink`. The two sit next to each
 * other and any difference between them would read as a mistake rather than a
 * distinction.
 *
 * 📖 **Neutral, not npm red.** The wordmark keeps its own colour because it is
 * an image, but the download icon and the number are grey like their GitHub
 * counterparts. Tinting each count to its service put two saturated marks in
 * the quietest corner of the header and made the numbers louder than the logos
 * above them, which is backwards.
 *
 * 📖 **The word "npm" is set beside the wordmark** even though the wordmark
 * already reads "npm". At this size the logo works as a shape rather than as
 * text, and the GitHub link next to it names itself in words, so without the
 * label the two links were not built the same way and the row looked
 * accidental.
 *
 * 📖 **The wordmark is an `<img>`, not inline SVG**, because it is a registered
 * logo used verbatim and shared with the README badge. A copy pasted into this
 * file would be a second version to keep in step. It is `aria-hidden` since the
 * anchor's own label already names the destination.
 *
 * 📖 **What the number means is decided at runtime.** npm has no total-downloads
 * endpoint and silently truncates any range over 18 months, so `useNpmDownloads`
 * checks the window the API actually answered for. While it still covers the
 * package's whole life the tooltip says "total downloads"; the day it stops
 * doing so, the wording changes on its own. See `~/lib/npmDownloads`.
 *
 * @exports NpmDownloads
 * @see website/src/components/GitHubStars.tsx. Its twin.
 */
import { useNpmDownloads } from '~/lib/npmDownloads'
import { formatCompact } from '~/lib/cachedCount'
import { HeaderCountLink } from './HeaderCountLink'
import npmLogoUrl from '../../../npmjs.svg?url'

export function NpmDownloads({ href }: { href: string }) {
  const { count, isLifetime, loading } = useNpmDownloads()
  const text = loading || count === null ? '…' : formatCompact(count)
  const noun = isLifetime ? 'total downloads' : 'downloads in the last 18 months'

  return (
    <HeaderCountLink
      href={href}
      ariaLabel={count === null ? 'Kandown on npm' : `Kandown on npm, ${count} ${noun}`}
      title={`npm ${noun}`}
      count={text}
      brand={
        <>
          <img
            src={npmLogoUrl}
            width="26"
            height="10"
            alt=""
            aria-hidden="true"
            className="shrink-0"
          />
          <span>npm</span>
        </>
      }
      metric={
        // 📖 Octicon `download`, 16×16, verbatim. The same source as the star
        // on the GitHub link, so the two icons share a weight and a corner
        // radius.
        <svg
          width="8"
          height="8"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
          className="shrink-0"
        >
          <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
          <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.97a.75.75 0 1 1 1.06 1.06L8.53 10.03a.75.75 0 0 1-1.06 0L4.22 6.78a.75.75 0 1 1 1.06-1.06l1.97 1.97Z" />
        </svg>
      }
    />
  )
}
