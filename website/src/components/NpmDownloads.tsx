/**
 * @file src/components/NpmDownloads.tsx
 * @description The npm link in the site header: a sleek pill button showing
 * the npm logo mark, a download icon and the package's download count.
 *
 * 📖 **Pill design.** Passes the circular npm logo icon and download arrow icon
 * into the shared `HeaderCountLink` capsule shell.
 *
 * @exports NpmDownloads
 * @see website/src/components/GitHubStars.tsx. Its twin.
 */
import { useNpmDownloads } from '~/lib/npmDownloads'
import { formatCompact } from '~/lib/cachedCount'
import { HeaderCountLink } from './HeaderCountLink'

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
      icon={
        <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#CB3837] text-white">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
            <path d="M0 0v24h24V0H0zm19.2 19.2H12v-9.6H9.6v9.6H4.8V4.8h14.4v14.4z" />
          </svg>
        </div>
      }
      metric={
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
          className="shrink-0 text-fg"
        >
          <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
          <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.97a.75.75 0 1 1 1.06 1.06L8.53 10.03a.75.75 0 0 1-1.06 0L4.22 6.78a.75.75 0 1 1 1.06-1.06l1.97 1.97Z" />
        </svg>
      }
    />
  )
}

