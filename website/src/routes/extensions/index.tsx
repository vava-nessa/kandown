/**
 * @file src/routes/extensions/index.tsx
 * @description `/extensions` — the community extensions gallery. Browse,
 * search, sort, and filter by tag. Each card links to a detail page with
 * install instructions, and out to the source repo.
 *
 * 📖 **Data source.** The list is the JSON produced by
 * `scripts/build-extensions.mjs` at build time, served as a static asset at
 * `/extensions/index.json`. The loader fetches it during prerender (or on the
 * server in production) so the route ships fully rendered HTML with zero
 * client-side loading state. A submission CTA at the top links to the
 * canonical contributing flow.
 *
 * @see src/lib/extensions.ts. Loader + types.
 * @see docs/EXTENSIONS.md and docs/EXTENSIONS-AUTHORING.md. The contracts.
 */

import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { loadExtensionsIndex, type ExtensionEntry } from '~/lib/extensions'

type SortKey = 'name' | 'author' | 'recent'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'name', label: 'Name (A→Z)' },
  { value: 'author', label: 'Author (A→Z)' },
]

export const Route = createFileRoute('/extensions/')({
  loader: () => loadExtensionsIndex(),
  head: () => ({
    meta: [
      { title: 'Extensions — Kandown' },
      {
        name: 'description',
        content:
          'Browse community-built extensions for Kandown: fields, gates, sync integrations, and contributed commands. Install from the web with one click, or paste a GitHub URL.',
      },
    ],
  }),
  component: ExtensionsIndex,
})

function applySort(entries: ExtensionEntry[], sort: SortKey): ExtensionEntry[] {
  const copy = [...entries]
  switch (sort) {
    case 'name':
      copy.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'author':
      copy.sort((a, b) => (a.author ?? '').localeCompare(b.author ?? ''))
      break
    case 'recent':
      // 📖 The build script does not stamp a per-entry date; the registry
      // order is insertion order (newest last). Reverse it so the most
      // recent additions land first, which matches the "Recently added" label.
      copy.reverse()
      break
  }
  return copy
}

function applyFilters(
  entries: ExtensionEntry[],
  query: string,
  tag: string | null,
): ExtensionEntry[] {
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

function ExtensionsIndex() {
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
          Extensions
        </h1>
        <p className="mt-4 text-[1.0625rem] leading-relaxed text-fg-muted">
          Community-built modules that add fields, transition gates, sync
          integrations and CLI commands to Kandown — without forking the
          engine. Install from the web with one click, or paste any
          <span className="font-mono text-fg"> github.com/&lt;owner&gt;/&lt;repo&gt;</span> URL.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-[13px]">
          <a
            href="https://github.com/vava-nessa/kandown/blob/main/registry/extensions.json"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-fg-muted transition-colors hover:text-fg"
          >
            Submit yours via PR →
          </a>
          <Link
            to="/docs/$"
            params={{ _splat: 'extensions' }}
            className="inline-flex items-center gap-1.5 text-fg-muted underline decoration-accent underline-offset-4 hover:text-fg"
          >
            Read the authoring guide →
          </Link>
        </div>
      </header>

      {/* Toolbar: search + sort + tag chips. Sticky on mobile so it stays
          reachable while the user scans the grid. */}
      <section
        aria-label="Filter extensions"
        className="sticky top-14 z-30 -mx-5 mt-10 border-y border-border bg-bg/85 px-5 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8"
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex flex-1 items-center sm:max-w-xs">
            <span className="sr-only">Search extensions</span>
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

      {/* Grid. */}
      {visible.length === 0 ? (
        <div className="mt-10 border border-border bg-bg-1 px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-fg">No extensions match those filters.</p>
          <p className="mt-1 text-[13px] text-fg-muted">Try clearing the search or selecting a different tag.</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-px border border-border bg-border sm:grid-cols-2">
          {visible.map((entry) => (
            <li key={entry.id} className="bg-bg p-6">
              <ExtensionCard entry={entry} />
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

function ExtensionCard({ entry }: { entry: ExtensionEntry }) {
  const tags = entry.tags ?? []
  return (
    <article className="flex h-full flex-col">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[1.0625rem] font-semibold tracking-tight text-fg">
            <Link
              to="/extensions/$id"
              params={{ id: entry.id }}
              className="transition-colors hover:text-accent"
            >
              {entry.name}
            </Link>
          </h2>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">
            by <span className="font-medium text-fg">{entry.author ?? 'unknown'}</span>
            {entry.minKandownVersion && (
              <>
                {' · '}
                <span className="font-mono text-[11.5px]">≥ {entry.minKandownVersion}</span>
              </>
            )}
          </p>
        </div>
      </div>
      {entry.description && (
        <p className="mt-3 text-[13.5px] leading-relaxed text-fg-muted">{entry.description}</p>
      )}
      {tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-muted"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex items-center gap-3 pt-4 text-[13px]">
        <Link
          to="/extensions/$id"
          params={{ id: entry.id }}
          className="inline-flex items-center gap-1 text-fg underline decoration-accent underline-offset-4 hover:text-accent"
        >
          Details &amp; install →
        </Link>
        <a
          href={entry.repo}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-[12px] text-fg-muted hover:text-fg"
        >
          Source ↗
        </a>
      </div>
    </article>
  )
}
