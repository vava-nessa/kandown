/**
 * @file src/routes/docs/index.tsx
 * @description `/docs` itself — a landing page for the documentation rather than
 * a redirect, so linking to `/docs` from outside gives people a map instead of
 * dropping them mid-corpus.
 *
 * @exports Route
 */
import { createFileRoute, Link } from '@tanstack/react-router'
import { docsNav } from '~/content/nav'

export const Route = createFileRoute('/docs/')({
  head: () => ({
    meta: [
      { title: 'Documentation — Kandown' },
      {
        name: 'description',
        content:
          'Everything about Kandown: installing it, using the board, the CLI reference, the Markdown data model, and how AI agents drive it.',
      },
    ],
  }),
  component: DocsIndex,
})

function DocsIndex() {
  return (
    <article className="py-10 lg:py-16">
      <p className="label mb-3">Reference</p>
      <h1 className="text-[2.125rem] leading-[1.08] font-semibold tracking-[-0.035em] sm:text-[2.75rem]">
        Documentation
      </h1>
      <p className="mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-fg-muted">
        Kandown is a Kanban board whose entire database is a folder of Markdown files. Start with
        the introduction, or jump straight to the part you need.
      </p>

      <div className="mt-12 grid gap-px border border-border bg-border sm:grid-cols-2">
        {docsNav.map((group) => (
          <section
            key={group.title}
            className="bg-bg p-6"
          >
            <h2 className="label">{group.title}</h2>
            <ul className="mt-3 space-y-2">
              {group.items.map((item) => (
                <li key={item.slug}>
                  <Link
                    to="/docs/$"
                    params={{ _splat: item.slug }}
                    className="text-[14px] text-fg-muted transition-colors hover:text-fg"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  )
}
