/**
 * @file src/lib/docs.ts
 * @description Resolves a docs URL slug to the compiled MDX module for that page.
 *
 * 📖 `import.meta.glob(..., { eager: true })` is the whole loader. Vite expands
 * it at build time into static imports of every `.mdx` file under
 * `src/content/docs`, so the router never touches the filesystem and the
 * prerenderer can render any page without a data fetch. The trade-off is that all
 * pages end up in one chunk, which is the right call here since the entire corpus is
 * smaller than a single hero image.
 *
 * @functions getDoc → `{ Content, frontmatter }` for a slug, or `null`
 * @exports getDoc, docSlugs
 * @see src/content/nav.ts. The sidebar order, which must agree with these files.
 */
import type { ComponentType } from 'react'

export type DocFrontmatter = {
  title: string
  description?: string
  /** Optional one-line hint shown under the title, e.g. "Reference". */
  section?: string
}

type MdxModule = {
  default: ComponentType<Record<string, unknown>>
  frontmatter?: DocFrontmatter
}

const modules = import.meta.glob<MdxModule>('../content/docs/**/*.mdx', { eager: true })

/** 📖 `../content/docs/agents/mcp.mdx` → `agents/mcp` */
const bySlug = new Map<string, MdxModule>(
  Object.entries(modules).map(([path, mod]) => [
    path.replace('../content/docs/', '').replace(/\.mdx$/, ''),
    mod,
  ]),
)

export const docSlugs: string[] = [...bySlug.keys()].sort()

export function getDoc(slug: string): { Content: MdxModule['default']; frontmatter: DocFrontmatter } | null {
  const mod = bySlug.get(slug)
  if (!mod) return null
  return {
    Content: mod.default,
    frontmatter: mod.frontmatter ?? { title: slug },
  }
}
