/**
 * @file src/routes/changelogs/$.tsx
 * @description Renders one release. The splat is the release slug
 * (`v0.37.0` → `changelogs/v0.37.0.md`).
 *
 * 📖 The HTML is fetched at runtime from `/changelogs/<slug>.html` and
 * injected via `dangerouslySetInnerHTML`. The file is prerendered by
 * `scripts/build-changelogs.mjs` with the same remark + shiki pipeline as the
 * docs, so the styling lands identical to the docs without re-running any
 * parser in the browser. The injection is safe because every fragment comes
 * from our own build step on our own Markdown source.
 *
 * 📖 An unknown slug calls `notFound()` from the loader so the prerenderer
 * bakes the same 404 the runtime would, important because TanStack Start
 * happily emits a blank page for a splat that resolved to nothing.
 *
 * 📖 Prev/next links walk the *same* list the sidebar shows, so the footer
 * reads as a continuation of the sidebar rather than a separate navigation.
 *
 * @exports Route
 */
import { createFileRoute, notFound, Link } from '@tanstack/react-router'
import { loadChangelogHtml, loadChangelogIndex, findEntry } from '~/lib/changelogs'

const ARTICLE_ID = 'changelog-article'

export const Route = createFileRoute('/changelogs/$')({
  loader: async ({ params }) => {
    const slug = params._splat ?? ''
    const index = await loadChangelogIndex()
    const entry = findEntry(index.entries, slug)
    if (!entry) throw notFound()
    // 📖 Prefetch the HTML so the article renders synchronously inside the
    // loader's `Promise.all`; the suspense boundary never flashes empty.
    const html = await loadChangelogHtml(slug)
    return { slug, entry, html, all: index.entries }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.entry.version} · ${loaderData.entry.name} · Kandown changelog` },
          {
            name: 'description',
            content: `Release notes for Kandown ${loaderData.entry.version} (${loaderData.entry.name}).`,
          },
        ]
      : [],
  }),
  component: ChangelogPage,
})

function ChangelogPage() {
  const { entry, html, all } = Route.useLoaderData()

  // 📖 Prev/next follow the same newest-first ordering the sidebar shows, so
  // moving through releases is a continuous scroll rather than a flip.
  const index = all.findIndex((item: typeof all[number]) => item.slug === entry.slug)
  const prev = index > 0 ? all[index - 1] : undefined
  const next = index > -1 && index < all.length - 1 ? all[index + 1] : undefined

  return (
    <article className="min-w-0 py-10 lg:py-16">
      <header className="mb-9 border-b border-border pb-8">
        <div className="mb-3 flex items-baseline gap-3">
          <p className="label">Changelog</p>
          {entry.date && (
            <span className="font-mono text-[11px] text-fg-faint">{entry.date}</span>
          )}
        </div>
        <h1 className="max-w-3xl text-[2.125rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance sm:text-[2.75rem]">
          <span className="font-mono text-[1.25rem] tracking-tight text-fg-muted sm:text-[1.5rem]">
            v{entry.version}
          </span>
          <span className="ml-3">· {entry.name}</span>
        </h1>
      </header>

      {/* 📖 `prose` gives the fragment the same typographic scale as the docs,
          so the changelog reads as part of the site rather than a third-party
          paste. Shiki and rehype-slug already produced the heading anchors. */}
      <div id={ARTICLE_ID} className="prose changelog-body" dangerouslySetInnerHTML={{ __html: html }} />

      <nav className="mt-16 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
        {prev ? (
          <Link
            to="/changelogs/$"
            params={{ _splat: prev.slug }}
            className="group border border-border p-4 transition-colors hover:border-border-strong"
          >
            <span className="label">Newer</span>
            <span className="mt-1 block text-[14px] font-medium text-fg-muted transition-colors group-hover:text-fg">
              ← v{prev.version} · {prev.name}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            to="/changelogs/$"
            params={{ _splat: next.slug }}
            className="group border border-border p-4 text-right transition-colors hover:border-border-strong sm:col-start-2"
          >
            <span className="label">Older</span>
            <span className="mt-1 block text-[14px] font-medium text-fg-muted transition-colors group-hover:text-fg">
              v{next.version} · {next.name} →
            </span>
          </Link>
        )}
      </nav>
    </article>
  )
}