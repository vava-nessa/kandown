/**
 * @file src/components/DocsSidebar.tsx
 * @description The left-hand documentation navigation, rendered from
 * `src/content/nav.ts`.
 *
 * 📖 On desktop it is a sticky column that scrolls independently of the article.
 * Below `lg` the same tree is reused inside a slide-over panel opened from the
 * docs toolbar, so there is one nav definition and one component for both.
 *
 * @exports DocsSidebar. The nav tree.
 * @exports MobileSidebar. The slide-over wrapper for small screens.
 */
import { useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { docsNav } from '~/content/nav'
import { SearchTrigger } from './DocSearch'

export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Documentation">
      {/* 📖 Groups are separated by a rule and their titles set in mono, so the
          sidebar reads as an index rather than a stack of buttons. The active
          item is marked by a solid accent rule on the left (the same device
          used for the current nav item in the header. */}
      {docsNav.map((group) => (
        <div key={group.title} className="mb-6 border-t border-border pt-4 first:border-t-0 first:pt-0">
          <h2 className="label mb-2.5">{group.title}</h2>
          <ul className="-ml-px border-l border-border">
            {group.items.map((item) => (
              <li key={item.slug}>
                <Link
                  to="/docs/$"
                  params={{ _splat: item.slug }}
                  onClick={onNavigate}
                  className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-[13.5px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
                  activeProps={{
                    className:
                      '-ml-px block border-l-2 border-accent py-1.5 pl-4 text-[13.5px] font-medium text-fg',
                  }}
                  activeOptions={{ exact: true }}
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // 📖 Close on navigation and on Escape. Without the pathname effect the panel
  // would stay open behind the new page when a link is followed via keyboard.
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
        <div className="mb-6">
          <SearchTrigger full />
        </div>
        <DocsSidebar onNavigate={onClose} />
      </div>
    </div>
  )
}
