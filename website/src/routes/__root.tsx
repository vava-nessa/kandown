/**
 * @file src/routes/__root.tsx
 * @description The document shell every page renders inside: `<html>`, the head
 * tags, the site header and footer, and the `<Outlet />` where routes mount.
 *
 * 📖 Head tags are declared here (not in `index.html`, which does not exist in a
 * Start app) and merged with each route's own `head()`. Child routes override
 * `title` and `description`; the OpenGraph and favicon tags below are inherited
 * by every page.
 *
 * 📖 Fonts are loaded from a self-hosted `@font-face`-free stack — the CSS falls
 * back to the system UI font, so there is no render-blocking font request and no
 * third-party origin in the critical path.
 *
 * @exports Route — the root route definition
 */
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { SiteHeader } from '~/components/SiteHeader'
import { SiteFooter } from '~/components/SiteFooter'
import { site } from '~/lib/site'
import { THEME_INIT_SCRIPT } from '~/lib/theme'
import appCss from '~/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: `${site.name} — ${site.tagline}` },
      { name: 'description', content: site.description },
      // 📖 `theme-color` is intentionally absent here — see RootDocument. The
      // head manager dedupes meta by `name`, which would collapse the two
      // media-scoped variants into one.
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: site.name },
      { property: 'og:title', content: `${site.name} — ${site.tagline}` },
      { property: 'og:description', content: site.description },
      { property: 'og:image', content: `${site.url}/og-image.png` },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: `${site.name} — ${site.tagline}` },
      { name: 'twitter:description', content: site.description },
      { name: 'twitter:image', content: `${site.url}/og-image.png` },
    ],
    links: [
      // 📖 Preload both variable faces. Without this the browser only discovers
      // them after parsing the stylesheet, and `font-display: swap` then shows a
      // visible flash of the fallback on every cold load. `crossOrigin` is
      // required even same-origin: fonts are always fetched in CORS mode, and
      // omitting it makes the browser fetch the file a second time.
      {
        rel: 'preload',
        as: 'font',
        type: 'font/woff2',
        href: '/fonts/geist-variable.woff2',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        as: 'font',
        type: 'font/woff2',
        href: '/fonts/geist-mono-variable.woff2',
        crossOrigin: 'anonymous',
      },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  // 📖 Read from the router rather than passed down, because the shell renders
  // above the route that would know. `startsWith` so any future `/demo/...`
  // sub-route inherits the same full-bleed treatment.
  const isDemoRoute = useRouterState({
    select: (s) => s.location.pathname.startsWith('/demo'),
  })

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* 📖 Must run before the first paint and before any bundle: it stamps
            `data-theme` on <html> from localStorage so a visitor who chose light
            on a dark machine never sees a flash of the wrong theme. Rendered
            ahead of the stylesheet for the same reason.
            @see src/lib/theme.ts */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* 📖 Written as raw tags rather than through the route's `meta` array:
            the head manager dedupes by `name`, so two media-scoped theme-colors
            declared there would collapse into one and the browser chrome would
            be wrong in one of the two themes. */}
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0c1d17" media="(prefers-color-scheme: dark)" />
        <HeadContent />
      </head>
      <body className="bg-bg text-fg antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#0c1d17]"
        >
          Skip to content
        </a>
        {/* 📖 The demo gets the whole viewport, with no site chrome at all: an
            application framed by a marketing header reads as a widget, and the
            two navigations compete for the same corner of the screen. The route
            renders its own floating way back instead — and, because that bar is
            then the only thing saying the session is disposable, it carries the
            demo's status too. */}
        {isDemoRoute ? null : <SiteHeader />}
        <main id="main">{children}</main>
        {isDemoRoute ? null : <SiteFooter />}
        <Scripts />
      </body>
    </html>
  )
}
