/**
 * @file src/components/SiteHeader.tsx
 * @description The sticky top bar shared by every page: wordmark, primary nav,
 * a docs search trigger, and the GitHub / npm links.
 *
 * 📖 The bar is translucent with a backdrop blur only once the page has been
 * scrolled — flat and borderless at the top of the hero so the header does not
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
import { site } from '~/lib/site'
import npmLogoUrl from '../../../npmjs.svg?url'

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

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <SearchTrigger />
          </div>

          <a
            href={site.repo}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Kandown on GitHub"
            className="p-2 text-fg-muted transition-colors hover:text-fg"
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>

          <a
            href={site.npm}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Kandown on npm"
            className="p-1.5 transition-opacity hover:opacity-80 flex items-center"
          >
            <img src={npmLogoUrl} width="34" height="13" alt="" aria-hidden="true" />
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
