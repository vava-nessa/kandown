/**
 * @file src/routes/docs/route.tsx
 * @description The documentation shell: sticky left sidebar and article outlet.
 *
 * 📖 This is a *layout* route (`route.tsx`), so it wraps every `/docs/*` page and
 * survives navigation between them. That matters: the sidebar keeps its scroll
 * position across page changes.
 *
 * 📖 The grid is `sidebar | article | toc`. The right-hand outline column is
 * declared by the page itself (see `docs/$.tsx`) rather than here, because the
 * docs index has no headings to outline.
 *
 * 📖 The search dialog itself is mounted once in the root layout (`__root.tsx`)
 * so the `SearchTrigger` button in the global header — and ⌘K — work on every
 * page, not just `/docs/*`.
 *
 * @exports Route
 */
import { useState } from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { DocsSidebar, MobileSidebar } from '~/components/DocsSidebar'
import { SearchTrigger } from '~/components/DocSearch'

export const Route = createFileRoute('/docs')({
  component: DocsLayout,
})

function DocsLayout() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      {/* 📖 A vertical rule separates the index from the article, matching the
          ruled construction of the rest of the site. The sidebar scrolls
          independently and keeps its position across page changes because this
          is a layout route. */}
      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block lg:border-r lg:border-border">
          <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pr-6">
            <div className="mb-7">
              <SearchTrigger full />
            </div>
            <DocsSidebar />
          </div>
        </aside>

        {/* 📖 Mobile toolbar: the only way to reach the nav and search below lg. */}
        <div className="sticky top-14 z-40 -mx-5 mb-2 flex items-center gap-3 border-b border-border bg-bg/85 px-5 py-2.5 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="label flex items-center gap-2 border border-border px-2.5 py-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
            Menu
          </button>
          <div className="flex-1">
            <SearchTrigger full />
          </div>
        </div>

        <Outlet />
      </div>

      <MobileSidebar open={navOpen} onClose={() => setNavOpen(false)} />
    </div>
  )
}
