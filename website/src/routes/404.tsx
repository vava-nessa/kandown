/**
 * @file src/routes/404.tsx
 * @description A real route whose only job is to be prerendered to `404.html`.
 *
 * 📖 Why this exists. The router already renders `NotFound` for unmatched paths
 * at runtime, but the site deploys as static files, and a static host needs an
 * actual `404.html` on disk to serve for a path that matches nothing. The
 * prerenderer skips unmatched paths (they respond 404, so there is nothing to
 * emit), hence this route: it matches, renders the same component, and
 * `vite.config.ts` writes its output to `/404.html`.
 *
 * The page is excluded from crawling and sitemaps by virtue of nothing linking
 * to it.
 *
 * @exports Route
 * @see vite.config.ts. The `pages` entry that sets its output path.
 */
import { createFileRoute } from '@tanstack/react-router'
import { NotFound } from '~/components/NotFound'

export const Route = createFileRoute('/404')({
  head: () => ({
    meta: [
      { title: 'Page not found · Kandown' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: NotFound,
})
