/**
 * @file src/components/SiteHeader.tsx
 * @description The sticky top bar shared by every page: wordmark, primary nav,
 * a docs search trigger, and the GitHub / npm links.
 *
 * 📖 The bar is translucent with a backdrop blur only once the page has been
 * scrolled: flat and borderless at the top of the hero so the header does not
 * cut a line across it. The `scrolled` state is the only piece of client state
 * in the component; everything else is static markup.
 *
 * 📖 On mobile the nav collapses into a disclosure panel. It is deliberately not
 * a portal or a focus trap: the panel is three links, and keeping it in flow
 * means no layout shift and no scroll locking to get wrong.
 *
 * @exports SiteHeader
 */
import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Wordmark } from './Logo'
import { SearchTrigger } from './DocSearch'
import { GitHubStars } from './GitHubStars'
import { NpmDownloads } from './NpmDownloads'
import { site } from '~/lib/site'

// 📖 Every docs page is served by the `/docs/$` splat route, so links are
// expressed as a slug passed through `params._splat` rather than a raw path.
// That keeps them type-checked against the route tree.
const NAV = [
  { slug: 'introduction', label: 'Docs' },
] as const

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 border-b border-border transition-colors duration-200 ${
        scrolled ? 'bg-bg/85 backdrop-blur-xl' : 'bg-bg'
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-7 px-5 sm:px-8">
        <Link to="/" className="shrink-0" aria-label="Kandown home">
          <Wordmark />
        </Link>

        {/* 📖 Nav labels are mono and uppercase, like every other label on the
            site. It reads as a system's chrome rather than a marketing menu. */}
        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.slug}
              to="/docs/$"
              params={{ _splat: item.slug }}
              className="label border-b-2 border-transparent py-1 transition-colors hover:text-fg"
              activeProps={{ className: 'label border-b-2 border-accent py-1 text-fg' }}
            >
              {item.label}
            </Link>
          ))}
          {/* 📖 Given its own accent dot rather than sitting flat among the docs
              links: it is the only entry here that runs the product instead of
              describing it, and it is what most first-time visitors want. */}
          <Link
            to="/app"
            className="rounded-[4px] bg-[#88E138] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-ink transition-opacity hover:opacity-90"
            activeProps={{ className: 'rounded-[4px] bg-[#88E138] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-ink ring-2 ring-accent' }}
          >
            App
          </Link>
        </nav>

        {/* 📖 `gap-4` rather than `gap-2`: each social link is now four elements
            wide (mark, word, icon, chip), and at the tighter spacing the npm
            wordmark sat close enough to the GitHub count to read as part of the
            same group. */}
        <div className="ml-auto flex items-center gap-4">
          <div className="hidden sm:block">
            <SearchTrigger />
          </div>

          {/* 📖 Octocat, word, star and count are a single anchor. They were
              previously two anchors with the same href (the mark, then a
              bordered star pill), which meant two hover targets and the
              repository announced twice by a screen reader. */}
          <GitHubStars href={site.repo} />

          {/* 📖 The npm wordmark used to be a bare link. It now carries the
              download count in the same shape as the GitHub link beside it:
              two numbers, read the same way, telling a visitor how used the
              project is before they have to go looking. */}
          <NpmDownloads href={site.npm} />

          {/* 📖 Reddit community link */}
          <a
            href={site.reddit}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Kandown Reddit Community r/kandown"
            title="r/kandown on Reddit"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#FF4500]/10 px-2.5 py-1 text-[11.5px] font-semibold text-[#FF4500] hover:bg-[#FF4500]/20 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
              <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm6.5 0c-.687 0-1.248.562-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.688-.562-1.249-1.25-1.249zm-5.96 4.675a.34.34 0 0 0-.258.106.34.34 0 0 0 .02.482c.749.729 1.834 1.096 2.948 1.096 1.114 0 2.199-.367 2.948-1.096a.34.34 0 0 0 .02-.482.34.34 0 0 0-.482-.02c-.615.598-1.52.898-2.486.898-.966 0-1.871-.3-2.486-.898a.333.333 0 0 0-.224-.086z"/>
            </svg>
            <span>r/kandown</span>
          </a>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle navigation"
            className="p-2 text-fg-muted transition-colors hover:text-fg md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-border bg-bg px-5 py-3 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.slug}
              to="/docs/$"
              params={{ _splat: item.slug }}
              onClick={() => setOpen(false)}
              className="label block border-b border-border py-3 hover:text-fg"
            >
              {item.label}
            </Link>
          ))}
          <a
            href={site.reddit}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => setOpen(false)}
            className="label block border-b border-border py-3 text-[#FF4500] hover:text-[#FF4500]/80"
          >
            Reddit (r/kandown) ↗
          </a>
          <Link
            to="/app"
            onClick={() => setOpen(false)}
            className="mt-3 block text-center rounded-[4px] bg-[#88E138] py-2 font-mono text-[12px] font-semibold uppercase tracking-wider text-ink"
          >
            App
          </Link>
        </nav>
      )}
    </header>
  )
}
