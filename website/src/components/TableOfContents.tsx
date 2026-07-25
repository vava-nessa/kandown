/**
 * @file src/components/TableOfContents.tsx
 * @description The "On this page" column: an outline of the current article's
 * `h2`/`h3` headings, with the section you are reading highlighted.
 *
 * 📖 The outline is read from the rendered DOM rather than extracted from MDX at
 * build time. That keeps the content pipeline simple (no custom remark plugin to
 * maintain, no second source of truth for headings) and guarantees the anchors
 * match exactly what `rehype-slug` produced, because they *are* what it produced.
 *
 * 📖 Active-heading tracking uses one `IntersectionObserver` with a top-heavy
 * root margin: a heading counts as "current" from the moment it reaches the top
 * sixth of the viewport until the next one does. Scroll listeners with manual
 * offset maths were the alternative and are worse on every axis.
 *
 * @functions TableOfContents → the outline, or nothing when there are <2 headings
 * @exports TableOfContents
 */
import { useEffect, useState } from 'react'

type Heading = { id: string; text: string; level: number }

export function TableOfContents({ containerId }: { containerId: string }) {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    const container = document.getElementById(containerId)
    if (!container) return

    const found = [...container.querySelectorAll<HTMLElement>('h2[id], h3[id]')].map((el) => ({
      id: el.id,
      text: el.textContent?.trim() ?? '',
      level: Number(el.tagName[1]),
    }))
    setHeadings(found)
    setActiveId(found[0]?.id ?? '')

    if (!found.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]?.target.id) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -72% 0px', threshold: 0 },
    )
    found.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [containerId])

  if (headings.length < 2) return null

  return (
    <nav aria-label="On this page" className="text-[13px]">
      <h2 className="label mb-3">On this page</h2>
      <ul className="space-y-1.5 border-l border-border">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              className={`-ml-px block border-l-2 py-0.5 transition-colors ${
                heading.level === 3 ? 'pl-6' : 'pl-3'
              } ${
                activeId === heading.id
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
