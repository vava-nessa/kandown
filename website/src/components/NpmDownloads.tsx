/**
 * @file src/components/NpmDownloads.tsx
 * @description The `npm ⤓ 15k` link in the site header — the npm wordmark, a
 * download icon and the download count, as one anchor pointing at the package.
 *
 * 📖 **The twin of `GitHubStars`.** Same anchor, same spacing, same loading
 * placeholder, all inherited from `HeaderCountLink`. The two sit next to each
 * other and any difference between them would read as a mistake rather than a
 * distinction.
 *
 * 📖 **Red, because the wordmark already is.** The npm logo is `#CB3837`, so a
 * muted grey count beside it looked like two unrelated things that happened to
 * touch. Colouring the icon and number to match binds them into one object and
 * tells you which ecosystem the number belongs to before you read it — the
 * GitHub link stays neutral for exactly the same reason, since GitHub's own
 * mark is monochrome. Hover deepens the red rather than switching hue, so the
 * feedback matches the grey link's behaviour without changing identity.
 *
 * 📖 **The wordmark is an `<img>`, not inline SVG**, because it is a registered
 * logo used verbatim and shared with the README badge — a copy pasted into this
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
 * @see website/src/components/GitHubStars.tsx — its twin
 */
import { useNpmDownloads } from '~/lib/npmDownloads'
import { formatCompact } from '~/lib/cachedCount'
import { HeaderCountLink } from './HeaderCountLink'
import npmLogoUrl from '../../../npmjs.svg?url'

export function NpmDownloads({ href }: { href: string }) {
  const { count, isLifetime, loading } = useNpmDownloads()
  const text = loading || count === null ? '—' : formatCompact(count)
  const noun = isLifetime ? 'total downloads' : 'downloads in the last 18 months'

  return (
    <HeaderCountLink
      href={href}
      ariaLabel={count === null ? 'Kandown on npm' : `Kandown on npm, ${count} ${noun}`}
      title={`npm ${noun}`}
      metricClassName="text-[#CB3837]"
      count={text}
      brand={
        <img
          src={npmLogoUrl}
          width="34"
          height="13"
          alt=""
          aria-hidden="true"
          className="shrink-0"
        />
      }
      metric={
        // 📖 Octicon `download`, 16×16, verbatim — the same source as the star
        // on the GitHub link, so the two icons share a weight and a corner
        // radius.
        <svg
          width="10"
          height="10"
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
