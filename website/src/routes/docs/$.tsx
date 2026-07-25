/**
 * @file src/routes/docs/$.tsx
 * @description Renders one documentation page. The splat param is the page slug
 * (`agents/mcp` → `src/content/docs/agents/mcp.mdx`).
 *
 * 📖 A single splat route serves the whole corpus instead of one route file per
 * page: content authors add an `.mdx` file and a line in `src/content/nav.ts`,
 * and never touch the router. Static prerendering still emits one HTML file per
 * page because `crawlLinks` follows the sidebar.
 *
 * 📖 An unknown slug calls `notFound()` from the loader, which renders the 404
 * component rather than an empty article — important because the prerenderer
 * would otherwise happily bake a blank page.
 *
 * @exports Route
 * @see src/lib/docs.ts — slug → MDX module resolution
 */
import { createFileRoute, notFound, Link } from '@tanstack/react-router'
import { MDXProvider } from '@mdx-js/react'
import { getDoc } from '~/lib/docs'
import { flatDocs } from '~/content/nav'
import { mdxComponents } from '~/components/MdxComponents'
import { TableOfContents } from '~/components/TableOfContents'
import { site } from '~/lib/site'

const ARTICLE_ID = 'doc-article'

export const Route = createFileRoute('/docs/$')({
  loader: ({ params }) => {
    const slug = params._splat ?? ''
    const doc = getDoc(slug)
    if (!doc) throw notFound()
    return { slug, frontmatter: doc.frontmatter }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.frontmatter.title} — Kandown docs` },
          ...(loaderData.frontmatter.description
            ? [{ name: 'description', content: loaderData.frontmatter.description }]
            : []),
        ]
      : [],
  }),
  component: DocPage,
})

function DocPage() {
  const { slug, frontmatter } = Route.useLoaderData()
  const doc = getDoc(slug)
  if (!doc) return null
  const { Content } = doc

  const index = flatDocs.findIndex((item) => item.slug === slug)
  const prev = index > 0 ? flatDocs[index - 1] : undefined
  const next = index > -1 ? flatDocs[index + 1] : undefined

  // 📖 Deep-links straight to the page's source file, so a reader who spots a
  // mistake is one click from fixing it.
  const editUrl = `${site.repo}/edit/main/website/src/content/docs/${slug}.mdx`

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-10">
      <article className="min-w-0 py-10 lg:py-16">
        {/* 📖 The section name sits above the title as a mono label, and the
            whole header is separated from the body by a rule — the same
            punctuation the landing page uses between sections. */}
        <header className="mb-9 border-b border-border pb-8">
          {frontmatter.section && <p className="label mb-3">{frontmatter.section}</p>}
          <h1 className="max-w-3xl text-[2.125rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance sm:text-[2.75rem]">
            {frontmatter.title}
          </h1>
          {frontmatter.description && (
            <p className="mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-fg-muted text-pretty">
              {frontmatter.description}
            </p>
          )}
        </header>

        <div id={ARTICLE_ID} className="prose">
          <MDXProvider components={mdxComponents}>
            <Content />
          </MDXProvider>
        </div>

        <nav className="mt-16 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
          {prev ? (
            <Link
              to="/docs/$"
              params={{ _splat: prev.slug }}
              className="group border border-border p-4 transition-colors hover:border-border-strong"
            >
              <span className="label">Previous</span>
              <span className="mt-1 block text-[14px] font-medium text-fg-muted transition-colors group-hover:text-fg">
                ← {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              to="/docs/$"
              params={{ _splat: next.slug }}
              className="group border border-border p-4 text-right transition-colors hover:border-border-strong sm:col-start-2"
            >
              <span className="label">Next</span>
              <span className="mt-1 block text-[14px] font-medium text-fg-muted transition-colors group-hover:text-fg">
                {next.title} →
              </span>
            </Link>
          )}
        </nav>

        <p className="mt-6 text-[12.5px]">
          <a
            href={editUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="label transition-colors hover:text-fg"
          >
            Edit this page on GitHub →
          </a>
        </p>
      </article>

      <aside className="hidden xl:block">
        <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto py-14">
          <TableOfContents containerId={ARTICLE_ID} />
        </div>
      </aside>
    </div>
  )
}
