/**
 * @file src/routes/changelogs/route.tsx
 * @description The `/changelogs` layout: the sticky version sidebar on the
 * left, the article outlet on the right.
 *
 * 📖 Mirrors `docs/route.tsx`'s layout so the two pages read as one product,
 * same ruled column, same mobile toolbar, same backdrop blur. The sidebar
 * keeps its scroll position across page changes because this is a layout
 * route, just like the docs.
 *
 * 📖 The index loader runs once per navigation: every child page reads from
 * the in-memory cache the loader built, so hitting a deep-linked release does
 * not refetch the sidebar data.
 *
 * @exports Route
 */
import { useState } from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { ChangelogSidebar, MobileChangelogSidebar } from '~/components/ChangelogSidebar'
import { loadChangelogIndex } from '~/lib/changelogs'

export const Route = createFileRoute('/changelogs')({
  loader: () => loadChangelogIndex(),
  component: ChangelogsLayout,
})

function ChangelogsLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const entries = Route.useLoaderData()?.entries ?? []

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <div className="grid gap-0 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block lg:border-r lg:border-border">
          <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pr-6">
            <ChangelogSidebar entries={entries} />
          </div>
        </aside>

        {/* 📖 Mobile toolbar, the only way to reach the version picker below lg. */}
        <div className="sticky top-14 z-40 -mx-5 mb-2 flex items-center gap-3 border-b border-border bg-bg/85 px-5 py-2.5 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="label flex items-center gap-2 border border-border px-2.5 py-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
            Versions
          </button>
          <span className="label text-fg-faint">
            {entries.length} {entries.length === 1 ? 'release' : 'releases'}
          </span>
        </div>

        <div className="min-w-0 lg:col-start-2">
          <Outlet />
        </div>
      </div>

      <MobileChangelogSidebar
        entries={entries}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
    </div>
  )
}