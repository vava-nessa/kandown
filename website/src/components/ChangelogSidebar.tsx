/**
 * @file src/components/ChangelogSidebar.tsx
 * @description The left-hand version picker on `/changelogs` and `/changelogs/$`.
 *
 * 📖 Mirrors `DocsSidebar`'s structure so the two reads as one product:
 * year-grouped sections, the same mono section labels, the same accent rule
 * on the active item. Reusing the visual language instead of inventing a new
 * one means the changelog page does not feel like a separate app.
 *
 * 📖 Below `lg` the tree moves into a slide-over panel so the article has the
 * full width on small screens. The disclosure trigger lives on the page's
 * mobile toolbar.
 *
 * @exports ChangelogSidebar — the nav tree
 * @exports MobileChangelogSidebar — the slide-over wrapper for small screens
 */
import { useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { groupByYear, type ChangelogEntry } from '~/lib/changelogs'

export function ChangelogSidebar({
  entries,
  activeSlug,
  onNavigate,
}: {
  entries: ChangelogEntry[]
  activeSlug?: string
  onNavigate?: () => void
}) {
  const groups = groupByYear(entries)

  return (
    <nav aria-label="Changelog versions">
      {groups.map((group) => (
        <div
          key={group.year}
          className="mb-6 border-t border-border pt-4 first:border-t-0 first:pt-0"
        >
          {/* 📖 `Unreleased` deserves a real label rather than the literal
              underscore — the bucket name is implementation detail. */}
          <h2 className="label mb-2.5">
            {group.year === '_' ? 'Unreleased' : group.year}
          </h2>
          <ul className="-ml-px border-l border-border">
            {group.items.map((entry) => {
              const active = entry.slug === activeSlug
              return (
                <li key={entry.slug}>
                  <Link
                    to="/changelogs/$"
                    params={{ _splat: entry.slug }}
                    onClick={onNavigate}
                    className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-[13.5px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
                    activeProps={{
                      className:
                        '-ml-px block border-l-2 border-accent py-1.5 pl-4 text-[13.5px] font-medium text-fg',
                    }}
                    // 📖 `exact` so `v0.37.0` does not match `v0.37.0-beta`
                    // when the latter eventually exists.
                    activeOptions={{ exact: true }}
                  >
                    <span className="block font-mono text-[11px] uppercase tracking-wider text-fg-faint">
                      {entry.version}
                    </span>
                    <span className="block text-[13px] leading-tight">{entry.name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function MobileChangelogSidebar({
  entries,
  activeSlug,
  open,
  onClose,
}: {
  entries: ChangelogEntry[]
  activeSlug?: string
  open: boolean
  onClose: () => void
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // 📖 Close on navigation and on Escape. Without the pathname effect the
  // panel would stay open behind the new page when a link is followed via
  // keyboard.
  useEffect(() => {
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-90 lg:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
      />
      <div className="absolute top-0 left-0 h-full w-[19rem] max-w-[85vw] overflow-y-auto border-r border-border-strong bg-bg p-5">
        <ChangelogSidebar
          entries={entries}
          activeSlug={activeSlug}
          onNavigate={onClose}
        />
      </div>
    </div>
  )
}