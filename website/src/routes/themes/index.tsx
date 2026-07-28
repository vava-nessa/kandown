/**
 * @file src/routes/themes/index.tsx
 * @description `/themes` — the community themes gallery. Browse, search, sort,
 * and filter by tag. Each card links to a detail page with the raw JSON and a
 * "Propose" CTA pointing at the same GitHub PR-link flow the in-app editor
 * uses.
 *
 * 📖 **Data source.** The list is the JSON produced by
 * `scripts/build-themes.mjs` at build time, served as a static asset at
 * `/themes/index.json`. The loader fetches it during prerender so the route
 * ships fully rendered HTML.
 *
 * @see src/lib/themes.ts. Loader + types.
 */

import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { loadThemesIndex, type ThemeEntry } from '~/lib/themes'

type SortKey = 'name' | 'author' | 'recent'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'name', label: 'Name (A→Z)' },
  { value: 'author', label: 'Author (A→Z)' },
]

export const Route = createFileRoute('/themes/')({
  loader: () => loadThemesIndex(),
  head: () => ({
    meta: [
      { title: 'Themes — Kandown' },
      {
        name: 'description',
        content:
          'Browse community themes for Kandown: curated starters (Claude, Linear, Notion) and community submissions. Install from the web with one click, or export a JSON via the in-app editor and propose it as a PR.',
      },
    ],
  }),
  component: ThemesIndex,
})

function applySort(entries: ThemeEntry[], sort: SortKey): ThemeEntry[] {
  const copy = [...entries]
  switch (sort) {
    case 'name':
      copy.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'author':
      copy.sort((a, b) => (a.author ?? '').localeCompare(b.author ?? ''))
      break
    case 'recent':
      copy.reverse()
      break
  }
  return copy
}

function applyFilters(
  entries: ThemeEntry[],
  query: string,
  tag: string | null,
): ThemeEntry[] {
  const q = query.trim().toLowerCase()
  if (!q && !tag) return entries
  return entries.filter((entry) => {
    if (tag && !(entry.tags ?? []).includes(tag)) return false
    if (!q) return true
    return (
      entry.name.toLowerCase().includes(q) ||
      (entry.author ?? '').toLowerCase().includes(q) ||
      (entry.description ?? '').toLowerCase().includes(q) ||
      (entry.tags ?? []).some((t) => t.toLowerCase().includes(q))
    )
  })
}

function ThemesIndex() {
  const data = Route.useLoaderData() ?? { tags: [], entries: [] }
  const allTags = data.tags
  const [sort, setSort] = useState<SortKey>('recent')
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const visible = useMemo(
    () => applySort(applyFilters(data.entries, query, activeTag), sort),
    [data.entries, query, activeTag, sort],
  )

  return (
    <article className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-16">
      <header className="max-w-3xl">
        <p className="label mb-3">Community</p>
        <h1 className="text-[2.125rem] leading-[1.08] font-semibold tracking-[-0.035em] sm:text-[2.75rem]">
          Themes
        </h1>
        <p className="mt-4 text-[1.0625rem] leading-relaxed text-fg-muted">
          Color palettes, fonts, and density presets for Kandown — curated by the
          team and contributed by the community. Install from the web with one
          click, or open the floating editor and export a theme as JSON to
          propose your own via a one-click PR.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-[13px]">
          <a
            href="https://github.com/vava-nessa/kandown/blob/main/registry/themes.json"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-fg-muted transition-colors hover:text-fg"
          >
            Submit yours via PR →
          </a>
          <Link
            to="/docs/$"
            params={{ _splat: 'themes' }}
            className="inline-flex items-center gap-1.5 text-fg-muted underline decoration-accent underline-offset-4 hover:text-fg"
          >
            Read the docs →
          </Link>
        </div>
      </header>

      <section
        aria-label="Filter themes"
        className="sticky top-14 z-30 -mx-5 mt-10 border-y border-border bg-bg/85 px-5 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8"
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex flex-1 items-center sm:max-w-xs">
            <span className="sr-only">Search themes</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, author, tag…"
              className="h-9 w-full border border-border bg-bg px-3 pr-8 text-[13.5px] outline-none placeholder:text-fg-faint focus:border-accent"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 text-fg-muted hover:text-fg"
              >
                ×
              </button>
            )}
          </label>
          <label className="flex items-center gap-2">
            <span className="sr-only">Sort by</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-9 border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value === sort ? `Sort: ${opt.label}` : opt.label}
                </option>
              ))}
            </select>
          </label>
          <p className="ml-auto text-[12.5px] text-fg-muted">
            {visible.length} of {data.entries.length}
          </p>
        </div>
        {allTags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={`rounded-full border px-2.5 py-0.5 text-[12px] transition-colors ${
                activeTag === null
                  ? 'border-accent bg-accent/15 text-fg'
                  : 'border-border text-fg-muted hover:text-fg'
              }`}
            >
              all
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                className={`rounded-full border px-2.5 py-0.5 text-[12px] transition-colors ${
                  activeTag === tag
                    ? 'border-accent bg-accent/15 text-fg'
                    : 'border-border text-fg-muted hover:text-fg'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </section>

      {visible.length === 0 ? (
        <div className="mt-10 border border-border bg-bg-1 px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-fg">No themes match those filters.</p>
          <p className="mt-1 text-[13px] text-fg-muted">Try clearing the search or selecting a different tag.</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((entry) => (
            <li key={entry.id} className="bg-bg p-6">
              <ThemeCard entry={entry} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-[12px] text-fg-faint">
        Index generated <span className="font-mono">{data.generatedAt.slice(0, 10)}</span>
        {' · '}
        source:{' '}
        <a href={data.url} target="_blank" rel="noreferrer" className="underline decoration-fg-faint underline-offset-2 hover:text-fg-muted">
          {data.url}
        </a>
      </p>
    </article>
  )
}

function ThemeCard({ entry }: { entry: ThemeEntry }) {
  const rawUrl = `https://raw.githubusercontent.com/${entry.repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')}/${entry.ref ?? 'main'}/${entry.path}`
  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[1.0625rem] font-semibold tracking-tight text-fg truncate">
            {entry.name}
          </h2>
          <p className="text-[12.5px] text-fg-muted">by {entry.author ?? 'unknown'}</p>
        </div>
        {entry.minKandownVersion && (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-muted whitespace-nowrap">
            ≥ {entry.minKandownVersion}
          </span>
        )}
      </div>
      <p className="text-[13.5px] leading-relaxed text-fg-muted">
        {entry.description}
      </p>
      {entry.tags && entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-muted">
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-3 pt-2 text-[12.5px]">
        <Link
          to="/themes/$id"
          params={{ id: entry.id }}
          className="inline-flex items-center gap-1 border border-border px-2.5 py-1 text-fg transition-colors hover:bg-bg-2"
        >
          View JSON →
        </Link>
        <a
          href={rawUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-fg-muted underline decoration-fg-faint underline-offset-2 hover:text-fg"
        >
          Raw file →
        </a>
        <a
          href={entry.repo}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-fg-muted underline decoration-fg-faint underline-offset-2 hover:text-fg"
        >
          Source →
        </a>
      </div>
    </div>
  )
}