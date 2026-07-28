/**
 * @file src/routes/extensions/$id.tsx
 * @description Detail page for one community extension: what it does, who
 * maintains it, the source repo, and how to install it (CLI one-click, paste-URL,
 * or the web Settings → Extensions gallery).
 *
 * @see src/lib/extensions.ts. Loader + types.
 */

import { createFileRoute, notFound, Link } from '@tanstack/react-router'
import { loadExtensionsIndex, findEntry, type ExtensionEntry } from '~/lib/extensions'

export const Route = createFileRoute('/extensions/$id')({
  loader: async ({ params }) => {
    const index = await loadExtensionsIndex()
    const entry = findEntry(index, params.id)
    if (!entry) throw notFound()
    return { entry, total: index.entries.length, tags: index.tags }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.entry.name} — Kandown extensions` },
          {
            name: 'description',
            content:
              loaderData.entry.description ??
              `${loaderData.entry.name}, a community extension for Kandown.`,
          },
        ]
      : [],
  }),
  component: ExtensionDetail,
})

function installSnippet(id: string, repo?: string): string {
  const lines = [
    `# Install from the community registry (one click)`,
    `kandown extension install ${id}`,
    ``,
    `# Or paste any GitHub repo URL (kandown fetches manifest.json)`,
  ]
  if (repo) lines.push(`kandown extension install ${repo}`)
  lines.push('')
  lines.push('# Then enable it (restricted mode is on by default)')
  lines.push(`kandown extension enable ${id}`)
  return lines.join('\n')
}

function ExtensionDetail() {
  const { entry, total, tags } = Route.useLoaderData()
  const entryTags = entry.tags ?? []
  const otherTags = entryTags.length > 0 ? tags.filter((t) => !entryTags.includes(t)) : tags
  const installPath = entry.path ? `${entry.repo.replace(/\/$/, '')}/${entry.path}` : entry.repo

  return (
    <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8 lg:py-16">
      <nav className="mb-6 text-[12.5px] text-fg-muted">
        <Link to="/extensions" className="hover:text-fg">
          ← All extensions
        </Link>
        <span className="ml-2 text-fg-faint">({total})</span>
      </nav>

      <header>
        <p className="label mb-3">Community extension</p>
        <h1 className="text-[2rem] leading-[1.08] font-semibold tracking-[-0.035em] sm:text-[2.5rem]">
          {entry.name}
        </h1>
        <p className="mt-3 text-[14px] text-fg-muted">
          by{' '}
          <span className="font-medium text-fg">{entry.author ?? 'unknown'}</span>
          {entry.minKandownVersion && (
            <>
              {' · '}
              <span className="font-mono text-[12px]">≥ kandown {entry.minKandownVersion}</span>
            </>
          )}
        </p>
        {entry.description && (
          <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">{entry.description}</p>
        )}
        {entryTags.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-1.5">
            {entryTags.map((tag) => (
              <li
                key={tag}
                className="rounded-full border border-border px-2.5 py-0.5 text-[12px] text-fg-muted"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
      </header>

      <section className="mt-12 border border-border bg-bg-1 p-6">
        <h2 className="label">Install</h2>
        <p className="mt-2 text-[13.5px] text-fg-muted">
          Three ways to add <span className="font-mono text-fg">{entry.id}</span> to your project.
        </p>
        <ol className="mt-4 space-y-5 text-[13.5px] text-fg-muted">
          <li>
            <span className="block font-medium text-fg">From the web app</span>
            Open your project in the Kandown web UI, then go to{' '}
            <span className="font-mono text-fg">Settings → Extensions</span> and
            install <span className="font-mono text-fg">{entry.id}</span> with one click
            from the Community store, or paste a GitHub URL.
          </li>
          <li>
            <span className="block font-medium text-fg">From the CLI</span>
            Run <span className="font-mono text-fg">kandown extension install</span> and
            paste the repo URL:
            <pre className="mt-2 overflow-x-auto border border-border bg-bg p-3 font-mono text-[12px] leading-relaxed text-fg">
              {installSnippet(entry.id, installPath)}
            </pre>
          </li>
          <li>
            <span className="block font-medium text-fg">From a local copy</span>
            Useful when iterating on the extension itself. Clone the repo and
            run{' '}
            <span className="font-mono text-fg">
              kandown extension install ./path/to/extension
            </span>
            .
          </li>
        </ol>
      </section>

      <section className="mt-10 border border-border bg-bg-1 p-6">
        <h2 className="label">Source</h2>
        <p className="mt-2 text-[13.5px] text-fg-muted">
          {entry.path
            ? `This extension ships in the repo at the path below. The README inside the directory is the canonical reference for that specific extension.`
            : `This extension lives at the root of the repo below.`}
        </p>
        <a
          href={entry.repo}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 break-all text-[13.5px] font-mono text-fg underline decoration-accent underline-offset-4 hover:text-accent"
        >
          {entry.repo} ↗
        </a>
      </section>

      <section className="mt-10">
        <h2 className="label">More like this</h2>
        <p className="mt-2 text-[13px] text-fg-muted">
          Browse the full gallery, filter by tag, or pick one at random.
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {otherTags.slice(0, 12).map((tag) => (
            <li key={tag}>
              <Link
                to="/extensions"
                className="rounded-full border border-border px-2.5 py-0.5 text-[12px] text-fg-muted transition-colors hover:text-fg"
              >
                {tag}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4">
          <Link
            to="/extensions"
            className="text-[13.5px] text-fg underline decoration-accent underline-offset-4 hover:text-accent"
          >
            ← Back to the gallery
          </Link>
        </p>
      </section>
    </article>
  )
}
