/**
 * @file src/routes/changelogs/index.tsx
 * @description `/changelogs` itself: redirects to the latest release so the
 * URL is always pointing at something, even when somebody pastes it
 * somewhere unmaintained (an old blog post, a bookmark from a year ago).
 *
 * 📖 Redirects at *loader* time rather than inside the component, so a
 * user who hits the URL with JavaScript disabled still lands on a real
 * page: the prerenderer follows the loader, sees the redirect, and emits
 * `/changelogs/vX.Y.Z` as the destination.
 *
 * 📖 If the index is empty (fresh clone, no releases shipped yet) the
 * component renders a soft "nothing here" state instead of looping on a
 * missing slug.
 *
 * @exports Route
 */
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { loadChangelogIndex } from '~/lib/changelogs'

export const Route = createFileRoute('/changelogs/')({
  loader: async () => {
    const index = await loadChangelogIndex()
    const latest = index.entries[0]
    if (latest) throw redirect({ to: '/changelogs/$', params: { _splat: latest.slug } })
    return { entries: index.entries }
  },
  head: () => ({
    meta: [
      { title: 'Changelog · Kandown' },
      {
        name: 'description',
        content:
          'Every release of Kandown with its full notes: new features, fixes, behaviour changes, and removals.',
      },
    ],
  }),
  component: ChangelogIndex,
})

function ChangelogIndex() {
  // 📖 Rendered only when the loader had nothing to redirect to, a defensive
  // state the prerenderer should never actually bake, but worth handling
  // rather than showing a blank page during local dev with an empty source.
  return (
    <article className="py-10 lg:py-16">
      <p className="label mb-3">Releases</p>
      <h1 className="text-[2.125rem] leading-[1.08] font-semibold tracking-[-0.035em] sm:text-[2.75rem]">
        Changelog
      </h1>
      <p className="mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-fg-muted">
        No releases published yet.
      </p>
      <p className="mt-8 text-[13.5px]">
        <Link to="/docs/$" params={{ _splat: 'introduction' }} className="text-fg-muted underline decoration-accent underline-offset-4 hover:text-fg">
          Read the introduction →
        </Link>
      </p>
    </article>
  )
}