/**
 * @file src/routes/demo.tsx
 * @description The interactive demo: the real Kandown application, running in an
 * iframe, backed by an in-memory filesystem that resets on reload.
 *
 * 📖 **What is embedded.** Not a mock or a recording — `public/demo/app/` is a
 * build of the actual CLI application, produced by `scripts/build-demo.mjs` on
 * every site build from the sources in the parent directory. The version it was
 * built from is stamped into `src/generated/demo-meta.json` and displayed in the
 * bar below, so a visitor can see exactly what they are driving and a stale
 * demo is visible rather than silent.
 *
 * 📖 **Why an iframe.** The demo app is a full application with its own router,
 * keyboard handling, theme system and CSS reset. Mounting it inside this page
 * would mean two competing global stylesheets and two `keydown` listeners
 * fighting over `⌘K` and `/`. The iframe is the boundary that makes both
 * possible, and it costs nothing here because the frame is same-origin and
 * static.
 *
 * 📖 **Why it loads on click.** The bundle is measured in megabytes. Someone who
 * lands on `/demo` has asked for it; someone who is reading the docs has not, so
 * nothing on this page is preloaded from elsewhere on the site.
 *
 * @functions
 *  → DemoPage — the route component: chrome, launcher, iframe
 *  → DemoUnavailable — honest fallback when the demo build did not run
 *
 * @exports Route
 * @see website/scripts/build-demo.mjs
 * @see src/lib/demoBackend.ts (in the Kandown repository root)
 */
import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CopyCommand } from '~/components/CopyCommand'
import { INSTALL_COMMAND, site } from '~/lib/site'
import demoMeta from '~/generated/demo-meta.json'

/**
 * 📖 Path of the embedded build, relative to the site root. Written by
 * scripts/build-demo.mjs.
 *
 * 📖 The directory rather than `index.html`, because `cleanUrls` in vercel.json
 * 308s the explicit filename. In production `trailingSlash: false` then 308s
 * this form too — one cheap redirect either way — but this is the spelling the
 * dev server also resolves, so the same URL works in both.
 */
const DEMO_APP_URL = '/demo/app/'

export const Route = createFileRoute('/demo')({
  component: DemoPage,
  head: () => ({
    meta: [
      { title: `Demo — ${site.name}` },
      {
        name: 'description',
        content:
          'Try Kandown in your browser. The real application, running on an in-memory project that resets when you reload. No install, no account, nothing saved.',
      },
    ],
  }),
})

function DemoPage() {
  const [launched, setLaunched] = useState(false)
  const available = demoMeta.available === true

  // 📖 Once launched the page becomes a window onto the app: the site header
  // (3.5rem) and the demo strip (~2.75rem) are the only chrome, and the iframe
  // takes the rest exactly. Without pinning the height the app renders at its
  // natural size and the *outer* page scrolls, which puts two scrollbars in
  // play and makes the board's own column scrolling unusable.
  return (
    <div
      className={`flex flex-col ${launched ? 'h-[calc(100dvh-3.5rem)] overflow-hidden' : 'min-h-[calc(100dvh-3.5rem)]'}`}
    >
      {/* 📖 A status strip, not a banner. It states three facts a visitor needs
          before they touch anything: this is a demo, this is the version, this
          is where it goes when you leave. */}
      <div className="border-b border-border bg-bg-subtle">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 sm:px-8">
          <span className="label bg-accent px-1.5 py-0.5 text-ink">Demo</span>
          <span className="text-[13px] text-fg-muted">
            Nothing is saved. Reload the page and it resets.
          </span>
          {available && demoMeta.version ? (
            <span className="label ml-auto hidden sm:block">
              Running v{demoMeta.version}
            </span>
          ) : null}
        </div>
      </div>

      {!available ? (
        <DemoUnavailable />
      ) : launched ? (
        // 📖 `allow-same-origin` is required, not lax: the app reads its own
        // origin for the History API and its theme storage. It is our own build
        // on our own origin, so this grants it nothing it would not already
        // have if it were served at the top level.
        <iframe
          src={DEMO_APP_URL}
          title="Kandown interactive demo"
          className="w-full min-h-0 flex-1 border-0 bg-bg"
          sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"
        />
      ) : (
        <Launcher onLaunch={() => setLaunched(true)} version={demoMeta.version} />
      )}
    </div>
  )
}

/* ── Launcher ───────────────────────────────────────────────────────────── */

function Launcher({ onLaunch, version }: { onLaunch: () => void; version: string | null }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-20 sm:px-8">
      <p className="label text-accent-fg">Interactive</p>
      <h1 className="mt-3 text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-[3rem]">
        Drive the real thing.
      </h1>
      <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-fg-muted">
        This is Kandown{version ? ` ${version}` : ''} — the same build the CLI serves — running on a
        project that lives in your browser's memory instead of on a disk. Drag cards, edit tasks,
        search, archive. Nothing is written anywhere, and a reload puts it all back.
      </p>

      <button
        type="button"
        onClick={onLaunch}
        className="mt-9 inline-flex w-full items-center justify-center gap-2 self-start bg-accent px-6 py-3 text-[14px] font-medium text-ink transition-opacity hover:opacity-90 sm:w-auto"
      >
        Launch the demo
        <span aria-hidden="true">→</span>
      </button>
      <p className="mt-3 text-[12.5px] text-fg-muted">
        Loads a few megabytes of application — that is why it waits for a click.
      </p>

      <dl className="mt-14 grid gap-px border-y border-border bg-border sm:grid-cols-3">
        {[
          ['In memory', 'No storage is touched. Not even localStorage.'],
          ['Resets on reload', 'Every visitor gets the same starting board.'],
          ['Really the app', 'Built from the CLI sources on every deploy.'],
        ].map(([term, detail]) => (
          <div key={term} className="bg-bg py-5 sm:px-5 sm:first:pl-0">
            <dt className="label text-accent-fg">{term}</dt>
            <dd className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">{detail}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center">
        <CopyCommand command={INSTALL_COMMAND} className="sm:min-w-[19rem]" />
        <Link
          to="/docs/$"
          params={{ _splat: 'quick-start' }}
          className="group inline-flex items-center gap-2 self-start border-b-2 border-accent py-1 text-[14px] font-medium text-fg"
        >
          Quick start
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </Link>
      </div>
    </div>
  )
}

/* ── Fallback ───────────────────────────────────────────────────────────── */

/**
 * 📖 Reached when `build-demo.mjs` marked the demo unavailable. Says so plainly
 * rather than rendering an iframe at a URL that does not exist — a broken demo
 * reads as a broken product.
 */
function DemoUnavailable() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-24 sm:px-8">
      <p className="label text-accent-fg">Unavailable</p>
      <h1 className="mt-3 text-[2rem] leading-[1.1] font-semibold tracking-[-0.035em]">
        The demo did not ship with this build
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">
        It is generated from the application sources on every deploy, and that step did not run.
        The real thing is one command away in the meantime.
      </p>
      <div className="mt-8">
        <CopyCommand command={INSTALL_COMMAND} className="sm:min-w-[19rem]" />
      </div>
    </div>
  )
}
