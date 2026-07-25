/**
 * @file src/components/DocSearch.tsx
 * @description Client-side documentation search: a `⌘K` command dialog over the
 * build-time index produced by `scripts/build-search-index.mjs`.
 *
 * 📖 No search service, no network call. The index is a static JSON import of a
 * few dozen kilobytes, scored in memory with a small, explicit ranking function
 * (see `score`). That keeps search working offline and on a static host, and it
 * means the whole feature is auditable in one file.
 *
 * 📖 How the dialog is wired. `SearchTrigger` is the button in the header;
 * `SearchDialog` is the overlay. They talk through a tiny module-level event
 * bus (`openSearch`) so the `⌘K` shortcut can be registered once, globally, and
 * any component can open the dialog without prop-drilling state through the
 * layout.
 *
 * Keyboard: `⌘K`/`Ctrl+K` opens, `↑`/`↓` move, `↵` navigates, `Esc` closes.
 *
 * @functions
 *   score          → relevance of one index entry against a query
 *   openSearch     → imperatively open the dialog from anywhere
 *   SearchTrigger  → the header button
 *   SearchDialog   → the overlay, mounted once in the docs layout
 * @exports SearchTrigger, SearchDialog, openSearch
 * @see scripts/build-search-index.mjs — how the index is produced
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import rawIndex from '~/generated/search-index.json'

type Entry = {
  slug: string
  page: string
  heading: string | null
  hash: string
  text: string
}

const INDEX = rawIndex as Entry[]
const MAX_RESULTS = 8

/** 📖 Module-level listener set — the dialog subscribes, triggers publish. */
const listeners = new Set<() => void>()
export function openSearch() {
  listeners.forEach((fn) => fn())
}

/**
 * 📖 Ranking, highest first. The weights encode a simple editorial judgement:
 * a page title match beats a heading match, which beats a body match, and an
 * exact prefix beats a match in the middle of a word. Every query term must
 * appear somewhere, so multi-word queries narrow rather than widen.
 */
function score(entry: Entry, terms: string[]): number {
  const page = entry.page.toLowerCase()
  const heading = (entry.heading ?? '').toLowerCase()
  const text = entry.text.toLowerCase()
  let total = 0

  for (const term of terms) {
    const inPage = page.indexOf(term)
    const inHeading = heading.indexOf(term)
    const inText = text.indexOf(term)
    if (inPage === -1 && inHeading === -1 && inText === -1) return 0

    if (inPage === 0) total += 60
    else if (inPage > 0) total += 35
    if (inHeading === 0) total += 30
    else if (inHeading > 0) total += 20
    if (inText > -1) total += Math.max(4, 14 - Math.floor(inText / 60))
  }

  // 📖 Nudge whole pages above their own sections so the first hit for
  // "installation" is the page, not a paragraph inside it.
  if (!entry.heading) total += 6
  return total
}

function excerpt(entry: Entry, terms: string[]): string {
  const text = entry.text
  if (!text) return ''
  const lower = text.toLowerCase()
  const hit = terms.map((t) => lower.indexOf(t)).filter((i) => i > -1).sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, hit - 40)
  return (start > 0 ? '…' : '') + text.slice(start, start + 140).trim() + (text.length > start + 140 ? '…' : '')
}

export function SearchTrigger({ full = false }: { full?: boolean }) {
  return (
    <button
      type="button"
      onClick={openSearch}
      className={`group flex items-center gap-2 rounded-[4px] border border-border bg-bg-subtle text-[13px] text-fg-faint transition-colors hover:border-border-strong hover:text-fg-muted ${
        full ? 'w-full px-3 py-2' : 'px-3 py-1.5'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span>Search docs</span>
      <kbd className="ml-auto rounded-[4px] border border-border bg-bg px-1.5 py-0.5 font-mono text-[10.5px] text-fg-faint">
        ⌘K
      </kbd>
    </button>
  )
}

export function SearchDialog() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }, [])

  useEffect(() => {
    const show = () => setOpen(true)
    listeners.add(show)
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      listeners.delete(show)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // 📖 Lock the page behind the dialog, and restore focus to whatever opened it.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open])

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return []
    return INDEX.map((entry) => ({ entry, rank: score(entry, terms) }))
      .filter((r) => r.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, MAX_RESULTS)
      .map((r) => r.entry)
  }, [query])

  useEffect(() => setActive(0), [query])

  // 📖 Keep the highlighted row inside the scroll viewport when arrowing down.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = useCallback(
    (entry: Entry) => {
      close()
      navigate({ to: `/docs/${entry.slug}`, hash: entry.hash.replace('#', '') || undefined })
    },
    [close, navigate],
  )

  if (!open) return null

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)

  return (
    <div
      className="fixed inset-0 z-100 flex items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search documentation"
        className="w-full max-w-xl overflow-hidden rounded-[4px] border border-border-strong bg-bg-raised shadow-2xl"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((i) => (results.length ? (i + 1) % results.length : 0))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            const entry = results[active]
            if (entry) go(entry)
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fg-faint" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the documentation…"
            aria-label="Search the documentation"
            className="w-full bg-transparent py-3.5 text-[15px] text-fg outline-none placeholder:text-fg-faint"
          />
          <button
            type="button"
            onClick={close}
            className="rounded-[4px] border border-border px-1.5 py-0.5 font-mono text-[10.5px] text-fg-faint transition-colors hover:text-fg-muted"
          >
            Esc
          </button>
        </div>

        {query && (
          <ul ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
            {results.length === 0 && (
              <li className="px-3 py-8 text-center text-[13px] text-fg-faint">
                No results for “{query}”
              </li>
            )}
            {results.map((entry, i) => (
              <li key={`${entry.slug}${entry.hash}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(entry)}
                  className={`block w-full rounded-[4px] border-l-2 px-3 py-2.5 text-left transition-colors ${
                    i === active ? 'border-accent bg-bg-subtle' : 'border-transparent'
                  }`}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-[13.5px] font-medium text-fg">
                      {entry.heading ?? entry.page}
                    </span>
                    {entry.heading && (
                      <span className="label truncate">{entry.page}</span>
                    )}
                  </span>
                  {entry.text && (
                    <span className="mt-0.5 block truncate text-[12.5px] text-fg-muted">
                      {excerpt(entry, terms)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!query && (
          <p className="px-4 py-7 text-center text-[12.5px] text-fg-faint">
            Type to search titles, headings and body text across every docs page.
          </p>
        )}

        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-fg-faint">
          <span>
            <Key>↑</Key>
            <Key>↓</Key> navigate
          </span>
          <span>
            <Key>↵</Key> open
          </span>
          <span className="ml-auto">Indexed at build time — no network</span>
        </div>
      </div>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mr-1 inline-block rounded-[4px] border border-border bg-bg px-1 py-px font-mono text-[10px]">
      {children}
    </kbd>
  )
}
