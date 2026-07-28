/**
 * @file src/routes/themes/$id.tsx
 * @description `/themes/<id>` — single-theme detail page. Shows the raw JSON
 * for copy/paste, a GitHub PR-link with the JSON prefilled (same flow the
 * in-app editor uses), and links back to the gallery and the source repo.
 * Mirror of `routes/extensions/$id.tsx`.
 */

import { createFileRoute, Link } from '@tanstack/react-router'
import { loadThemesIndex, findThemeEntry } from '~/lib/themes'

export const Route = createFileRoute('/themes/$id')({
  loader: ({ params }) => loadThemesIndex().then((index) => ({ index, entry: findThemeEntry(index, params.id) })),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.entry ? `${loaderData.entry.name} — Themes — Kandown` : 'Theme — Kandown' },
    ],
  }),
  component: ThemeDetail,
  notFoundComponent: () => (
    <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <p className="label mb-3">Themes</p>
      <h1 className="text-[2rem] font-semibold tracking-tight">Theme not found</h1>
      <p className="mt-3 text-fg-muted">No theme with that id exists in the registry.</p>
      <Link to="/themes" className="mt-6 inline-block underline decoration-accent underline-offset-4">
        ← Back to all themes
      </Link>
    </article>
  ),
})

function ThemeDetail() {
  const { index, entry } = Route.useLoaderData()

  if (!entry) {
    return null
  }

  const repoPath = entry.repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
  const rawUrl = `https://raw.githubusercontent.com/${repoPath}/${entry.ref ?? 'main'}/${entry.path}`

  return (
    <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 lg:py-16">
      <p className="label mb-3">Community · Themes</p>
      <h1 className="text-[2.125rem] leading-[1.08] font-semibold tracking-[-0.035em] sm:text-[2.75rem]">
        {entry.name}
      </h1>
      <p className="mt-3 text-[1.0625rem] leading-relaxed text-fg-muted">
        {entry.description}
      </p>

      <dl className="mt-8 grid grid-cols-1 gap-4 border border-border bg-bg-1 p-6 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-fg-muted">Author</dt>
          <dd className="mt-1 text-[14px] text-fg">{entry.author ?? 'unknown'}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-fg-muted">Min kandown</dt>
          <dd className="mt-1 font-mono text-[14px] text-fg">{entry.minKandownVersion ?? '—'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] uppercase tracking-wider text-fg-muted">Install</dt>
          <dd className="mt-1 font-mono text-[12.5px] text-fg">
            kandown theme install {entry.repo}
          </dd>
        </div>
      </dl>

      <div className="mt-10">
        <h2 className="text-[1.125rem] font-semibold tracking-tight">How to install</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed text-fg-muted">
          <li>From the web: open <Link to="/docs/$" params={{ _splat: 'themes' }} className="underline decoration-accent underline-offset-4">Settings → Themes</Link> and click <em>Install</em>.</li>
          <li>From the CLI: <code className="font-mono text-fg">kandown theme install {entry.repo}</code></li>
          <li>The theme appears in the Skin picker and at <code className="font-mono text-fg">.kandown/themes/{entry.id}.json</code>.</li>
        </ol>
      </div>

      <div className="mt-10">
        <h2 className="text-[1.125rem] font-semibold tracking-tight">Want to fork this theme?</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">
          Open the in-app editor (Settings → Appearance → <em>Create Custom Theme</em>),
          edit away, then click <em>Propose on GitHub</em> in the Publish tab. The
          editor opens a prefilled PR with your theme JSON as the new file.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
          <a
            href={rawUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-fg-muted transition-colors hover:text-fg"
          >
            View raw JSON →
          </a>
          <a
            href={entry.repo}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-fg-muted transition-colors hover:text-fg"
          >
            Source repo →
          </a>
          <Link
            to="/themes"
            className="ml-auto inline-flex items-center gap-1.5 text-fg-muted underline decoration-accent underline-offset-4 hover:text-fg"
          >
            ← Back to all themes
          </Link>
        </div>
      </div>

      <p className="mt-12 text-[12px] text-fg-faint">
        Index generated <span className="font-mono">{index.generatedAt.slice(0, 10)}</span>
        {' · '}
        source:{' '}
        <a href={index.url} target="_blank" rel="noreferrer" className="underline decoration-fg-faint underline-offset-2 hover:text-fg-muted">
          {index.url}
        </a>
      </p>
    </article>
  )
}