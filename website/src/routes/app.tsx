/**
 * @file src/routes/app.tsx
 * @description The Kandown web app, running the real application in an iframe.
 * It opens on a disposable sample project and lets compatible browsers switch
 * to a real local project without an account or server.
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
 * 📖 **It loads immediately.** The bundle is megabytes, but arriving at `/app`
 * *is* the request for it — an interstitial asking "do you really want the thing
 * you just clicked?" only adds a step. Nothing anywhere else on the site
 * preloads this route, so the cost is paid by exactly the people who asked.
 * A skeleton holds the frame until the app has booted.
 *
 * @functions
 *  → AppPage — the route component: the iframe, its skeleton, and the way back
 *  → AppOverlay — the floating exit and sample-project status bar
 *  → AppUnavailable — honest fallback when the app build did not run
 *
 * @exports Route
 * @see website/scripts/build-demo.mjs
 * @see src/lib/demoBackend.ts (in the Kandown repository root)
 */
import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CopyCommand } from '~/components/CopyCommand'
import { INSTALL_COMMAND, site } from '~/lib/site'
import demoMeta from '~/generated/demo-meta.json'

/**
 * 📖 Path of the embedded build, relative to the site root. Written by
 * scripts/build-demo.mjs.
 *
 * 📖 Vercel serves the directory URL in production. Vite's development server
 * redirects that spelling through the website router, so local development
 * points at the explicit index file instead.
 */
const DEMO_APP_URL = import.meta.env.DEV ? '/demo/app/index.html' : '/demo/app/'

interface LocalProjectMessage {
  type: 'kandown:local-project-opened'
  projectName: string
}

function isLocalProjectMessage(value: unknown): value is LocalProjectMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'kandown:local-project-opened' &&
    'projectName' in value &&
    typeof value.projectName === 'string'
  )
}

export const Route = createFileRoute('/app')({
  component: AppPage,
  head: () => ({
    meta: [
      { title: `Web app | ${site.name}` },
      {
        name: 'description',
        content:
          'Open the free Kandown web app with no login. Explore the sample project or work directly with a local Kandown folder.',
      },
    ],
  }),
})

function AppPage() {
  const [loaded, setLoaded] = useState(false)
  const [localProjectName, setLocalProjectName] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const markLoaded = () => setLoaded(true)
    frame.addEventListener('load', markLoaded)
    if (frame.contentDocument?.readyState === 'complete') markLoaded()

    return () => frame.removeEventListener('load', markLoaded)
  }, [])

  useEffect(() => {
    const receiveProjectMode = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== frameRef.current?.contentWindow) return
      if (!isLocalProjectMessage(event.data)) return
      setLocalProjectName(event.data.projectName)
    }

    window.addEventListener('message', receiveProjectMode)
    return () => window.removeEventListener('message', receiveProjectMode)
  }, [])

  if (demoMeta.available !== true) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppUnavailable />
      </div>
    )
  }

  // 📖 The site header and footer are suppressed on this route (see
  // __root.tsx), so the app gets the whole viewport and looks like the
  // application it is rather than a widget parked in a page. The way back is
  // the floating bar, not a nav the app has to share a screen with.
  return (
    <div className="relative h-dvh w-full overflow-hidden">
      {/* 📖 `allow-same-origin` is required, not lax: the app reads its own
          origin for the History API. It is our own build on our own origin, so
          this also lets the user-granted local folder picker run from the
          embedded app. */}
      <iframe
        ref={frameRef}
        src={DEMO_APP_URL}
        title="Kandown web app"
        className="h-full w-full border-0 bg-bg"
        sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"
      />
      {loaded ? null : <AppSkeleton />}
      <AppOverlay localProjectName={localProjectName} />
    </div>
  )
}

/* ── Loading ────────────────────────────────────────────────────────────── */

/**
 * 📖 Covers the frame until the app's document has loaded. Deliberately plain:
 * a spinner over a blank page for several megabytes reads as broken, whereas a
 * named thing that is loading reads as working. It is removed on the iframe's
 * `load` event, which fires slightly before React inside has painted — the
 * fade covers that gap rather than pretending it does not exist.
 */
function AppSkeleton() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg">
      <span className="label animate-pulse text-accent-fg">Loading Kandown</span>
      <span className="text-[13px] text-fg-muted">
        The real application, a few megabytes of it.
      </span>
    </div>
  )
}

/* ── The floating way out ───────────────────────────────────────────────── */

/**
 * 📖 Sits over the running application, level with its header and just to the
 * right of its logo — the one strip of the app's own chrome that is empty at
 * every width above the mobile breakpoint.
 *
 * 📖 It carries the demo's status as well as the exit, because with the site
 * header gone this is the *only* thing on screen that says the session is
 * disposable. A visitor who lands here from a shared link would otherwise have
 * no way to know their work evaporates on reload, and would rightly be annoyed
 * when it does.
 *
 * 📖 The 1520px threshold is measured, not guessed. The app's own toolbar (view
 * toggle, archive, settings, search) is pushed left as the window narrows, and
 * it reaches this bar's right edge just below that width — at 1520px the bar
 * ends at 675px and the nearest control starts at 759px. Sitting on top of
 * working controls is worse than sitting somewhere less elegant, so under
 * 1520px the bar drops to the bottom of the screen, where the board has nothing
 * but its own "Add task" row. Re-measure if the app's header layout changes.
 */
function AppOverlay({ localProjectName }: { localProjectName: string | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-3 min-[1520px]:inset-x-auto min-[1520px]:bottom-auto min-[1520px]:top-2.5 min-[1520px]:left-[11.5rem] min-[1520px]:justify-start min-[1520px]:px-0">
      <div className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-black/10 bg-bg/85 p-1 pr-3 shadow-lg backdrop-blur-md">
        <Link
          to="/"
          className="label group flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-ink transition-opacity hover:opacity-90"
        >
          <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">
            ←
          </span>
          Back to kandown website
        </Link>
        <span className="label hidden truncate text-fg-faint sm:inline">
          {localProjectName
            ? `${localProjectName} · local project · saving directly to your folder`
            : `Sample project · changes reset on reload${demoMeta.version ? ` · v${demoMeta.version}` : ''}`}
        </span>
        <span className="label truncate text-fg-faint sm:hidden">
          {localProjectName ? `${localProjectName} · local` : 'Nothing is saved'}
        </span>
      </div>
    </div>
  )
}

/**
 * 📖 The fallback screen has no site header either, so it carries its own way
 * back. Quieter than the overlay: a wayfinding link on a normal page, rather
 * than the only exit from a full-screen application.
 */
function BackLink() {
  return (
    <Link
      to="/"
      className="label group inline-flex items-center gap-1.5 self-start transition-colors hover:text-fg"
    >
      <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">
        ←
      </span>
      Back to kandown website
    </Link>
  )
}

/* ── Fallback ───────────────────────────────────────────────────────────── */

/**
 * 📖 Reached when `build-demo.mjs` marked the demo unavailable. Says so plainly
 * rather than rendering an iframe at a URL that does not exist — a broken demo
 * reads as a broken product.
 */
function AppUnavailable() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-24 sm:px-8">
      <BackLink />
      <p className="label mt-14 text-accent-fg">Unavailable</p>
      <h1 className="mt-3 text-[2rem] leading-[1.1] font-semibold tracking-[-0.035em]">
        The web app did not ship with this build
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
