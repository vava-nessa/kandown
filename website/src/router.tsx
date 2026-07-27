/**
 * @file src/router.tsx
 * @description Creates the TanStack Router instance for the site.
 *
 * 📖 TanStack Start calls `getRouter()` once per request on the server and once
 * on the client during hydration, so it must return a *fresh* router each time:
 * a module-level singleton would leak state between server-rendered requests.
 *
 * @functions getRouter → a configured router instance
 */
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { NotFound } from './components/NotFound'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultNotFoundComponent: NotFound,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
