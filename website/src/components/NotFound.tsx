/**
 * @file src/components/NotFound.tsx
 * @description The 404 page, wired up as the router's `defaultNotFoundComponent`.
 *
 * @exports NotFound
 */
import { Link } from '@tanstack/react-router'

export function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-5 py-32 text-center">
      <p className="label text-accent-fg">Error 404</p>
      <h1 className="mt-3 text-[2rem] leading-[1.1] font-semibold tracking-[-0.035em]">This page does not exist</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
        The link may be out of date, or the page may have been renamed. Try the documentation index
        — or press <kbd className="border border-border-strong border-b-2 bg-bg-subtle px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd> and search.
      </p>
      <div className="mt-7 flex gap-3">
        <Link
          to="/docs"
          className="bg-accent px-4 py-2 text-[13.5px] font-medium text-ink transition-opacity hover:opacity-90"
        >
          Browse the docs
        </Link>
        <Link
          to="/"
          className="border border-border px-4 py-2 text-[13.5px] font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
