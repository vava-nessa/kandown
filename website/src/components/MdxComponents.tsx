/**
 * @file src/components/MdxComponents.tsx
 * @description Element overrides handed to every MDX page through
 * `@mdx-js/react`'s provider.
 *
 * 📖 Two problems are solved here. First, links written as plain markdown
 * (`[CLI](/docs/reference/cli)`) would do a full page load; `a` is swapped for a
 * router `Link` when the href is internal, so docs navigation stays client-side
 * and preloads on hover. Second, reference tables are wide, so every `table` is
 * wrapped in its own horizontal scroll container — the page body itself must
 * never scroll sideways.
 *
 * 📖 `Callout` is exported for use directly inside MDX (`<Callout type="warn">`),
 * which is why the content files can use it without importing anything.
 *
 * @exports mdxComponents — the component map
 * @exports Callout — note / warning / tip box, usable from MDX
 */
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

export function Callout({
  type = 'note',
  title,
  children,
}: {
  type?: 'note' | 'warn' | 'tip'
  title?: string
  children: ReactNode
}) {
  // 📖 A solid 3px rule on the left instead of a tinted rounded box. The rule
  // carries the colour, the body stays on the page ground — which keeps a
  // callout readable and stops three of them in a row from looking like a
  // stack of alerts.
  const styles = {
    note: 'border-border-strong',
    tip: 'border-accent',
    warn: 'border-amber-500',
  }[type]

  const label = title ?? { note: 'Note', tip: 'Tip', warn: 'Careful' }[type]

  return (
    <div className={`my-6 border-l-[3px] bg-bg-subtle py-3.5 pr-4 pl-4 ${styles}`}>
      <p className="label mb-1.5 text-fg">{label}</p>
      <div className="[&>*+*]:mt-2 [&>p]:m-0 [&>p]:text-[14.5px] [&>p]:text-fg-muted">
        {children}
      </div>
    </div>
  )
}

/**
 * 📖 Markdown authors write ordinary paths (`/docs/guides/tasks#dependencies`).
 * Docs paths are rewritten onto the `/docs/$` splat route so navigation stays
 * client-side and type-checked; other internal paths fall back to a plain
 * anchor; external links open in a new tab with `noopener`.
 */
function Anchor({ href = '', children, ...rest }: React.ComponentProps<'a'>) {
  const isInternal = href.startsWith('/') && !href.startsWith('//')

  if (isInternal) {
    const [path = '', hash] = href.split('#')
    const slug = path.startsWith('/docs/') ? path.slice('/docs/'.length) : null

    if (slug) {
      return (
        <Link to="/docs/$" params={{ _splat: slug }} hash={hash} {...rest}>
          {children}
        </Link>
      )
    }
    // 📖 The other routes that exist outside `/docs`. Listed rather than
    // inferred, because `Link`'s `to` is checked against the route tree and a
    // computed string would not type-check.
    if (path === '/demo') {
      return (
        <Link to="/demo" hash={hash} {...rest}>
          {children}
        </Link>
      )
    }
    if (path === '/') {
      return (
        <Link to="/" hash={hash} {...rest}>
          {children}
        </Link>
      )
    }
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }

  return (
    <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
      {children}
    </a>
  )
}

export const mdxComponents = {
  a: Anchor,
  table: (props: React.ComponentProps<'table'>) => (
    <div className="table-scroll">
      <table {...props} />
    </div>
  ),
  Callout,
}
