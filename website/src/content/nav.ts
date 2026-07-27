/**
 * @file src/content/nav.ts
 * @description The single source of truth for the documentation sidebar, the
 * previous/next footer links, and the order pages appear in search results.
 *
 * 📖 Every entry's `slug` must match a file at `src/content/docs/<slug>.mdx`.
 * The docs route resolves the MDX module by that exact key, so a typo here
 * surfaces immediately as a "page not found" rather than silently rendering
 * nothing. Adding a page is therefore two steps: drop the `.mdx` file in, add a
 * line here.
 *
 * @exports docsNav. Grouped sidebar structure.
 * @exports flatDocs. The same pages, flattened, in reading order (prev/next).
 * @exports findDoc. Look a page up by slug.
 */

export type DocLink = {
  /** Path under `/docs/`, matching the MDX filename without its extension. */
  slug: string
  /** Label shown in the sidebar. Page titles come from the MDX frontmatter. */
  title: string
}

export type DocGroup = {
  title: string
  items: DocLink[]
}

export const docsNav: DocGroup[] = [
  {
    title: 'Getting started',
    items: [
      { slug: 'introduction', title: 'Introduction' },
      { slug: 'installation', title: 'Installation' },
      { slug: 'quick-start', title: 'Quick start' },
    ],
  },
  {
    title: 'Using the board',
    items: [
      { slug: 'guides/tasks', title: 'Tasks' },
      { slug: 'guides/board-and-views', title: 'Board & views' },
      { slug: 'guides/terminal-ui', title: 'Terminal UI' },
      { slug: 'guides/appearance', title: 'Appearance' },
    ],
  },
  {
    title: 'AI agents',
    items: [
      { slug: 'agents/overview', title: 'Overview' },
      { slug: 'agents/instructions', title: 'Project instructions' },
      { slug: 'agents/launching', title: 'Launching agents' },
      { slug: 'agents/mcp', title: 'MCP server' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { slug: 'reference/cli', title: 'CLI' },
      { slug: 'reference/data-model', title: 'Data model' },
      { slug: 'reference/configuration', title: 'Configuration' },
    ],
  },
  {
    title: 'Project',
    items: [
      { slug: 'project/architecture', title: 'Architecture' },
      { slug: 'project/contributing', title: 'Contributing' },
    ],
  },
]

export const flatDocs: DocLink[] = docsNav.flatMap((group) => group.items)

export function findDoc(slug: string): DocLink | undefined {
  return flatDocs.find((doc) => doc.slug === slug)
}
