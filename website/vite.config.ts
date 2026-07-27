/**
 * @file vite.config.ts
 * @description Build pipeline for the Kandown website. Wires four things
 * together: TanStack Start (SSR + file-based routing + static prerendering),
 * Tailwind v4, an MDX pipeline that turns `src/content/docs/**\/*.mdx` into React
 * components, and Shiki for build-time syntax highlighting.
 *
 * 📖 Why MDX at build time rather than a markdown renderer at runtime: every
 * docs page is known at build time, so parsing, highlighting and slugging all
 * happen once during `vite build`. The shipped page is plain HTML, no markdown
 * parser or highlighter in the client bundle.
 *
 * 📖 Plugin order matters. `@mdx-js/rollup` must run with `enforce: 'pre'` so it
 * transforms `.mdx` before anything else looks at it, and the React plugin must
 * come after the Start plugin (a documented TanStack Start requirement).
 *
 * @exports default: the Vite config
 */
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeShiki from '@shikijs/rehype'

export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    tanstackStart({
      // 📖 Prerender every page into static HTML. `crawlLinks` follows the docs
      // sidebar, so all content pages are emitted without listing them here.
      prerender: {
        enabled: true,
        crawlLinks: true,
        failOnError: false,
      },
      // 📖 `/404` matches no route, so it renders the router's NotFound
      // component. Emitting it as `404.html` at the root is what lets a static
      // host (Vercel included) serve our own 404 page instead of its default.
      pages: [{ path: '/404', prerender: { enabled: true, outputPath: '/404.html' } }],
    }),
    {
      enforce: 'pre',
      ...mdx({
        providerImportSource: '@mdx-js/react',
        remarkPlugins: [
          remarkGfm,
          remarkFrontmatter,
          // 📖 Exposes the YAML frontmatter of each page as a named export
          // called `frontmatter`, which the docs route reads for title/description.
          [remarkMdxFrontmatter, { name: 'frontmatter' }],
        ],
        rehypePlugins: [
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: 'wrap', properties: { className: 'heading-anchor' } }],
          [
            rehypeShiki,
            {
              // 📖 The site has one deliberate light identity, so highlighted
              // code uses one palette regardless of the device preference.
              theme: 'github-light',
            },
          ],
        ],
      }),
    },
    viteReact(),
    tailwindcss(),
  ],
})
