/**
 * @file src/components/CopyPageButton.tsx
 * @description Copies the current documentation page to the clipboard as clean
 * Markdown, and offers the raw file as a link.
 *
 * 📖 The Markdown is not reconstructed from the DOM — it is fetched from
 * `/docs/<slug>.md`, the file `scripts/build-llms.mjs` generated from the same
 * MDX source the page was rendered from. Scraping `innerText` would silently
 * drop code fences, tables and link targets, which are exactly the parts
 * somebody pasting a page into a chat needs most.
 *
 * 📖 The fetch happens on click rather than on mount: most readers never press
 * this, and a docs page should not pull a second copy of itself down just in
 * case. The result is cached for the lifetime of the component, so a second
 * press is instant.
 *
 * 📖 `navigator.clipboard` is unavailable on insecure origins and can be denied
 * outright. Both cases fall back to the "View raw" link that is already next to
 * the button, and the button says what went wrong rather than doing nothing.
 *
 * @functions
 *  → CopyPageButton — the copy control plus its raw-file link
 *
 * @exports CopyPageButton
 * @see website/scripts/build-llms.mjs — writes the file this fetches
 */
import { useCallback, useRef, useState } from 'react'

type Status = 'idle' | 'working' | 'copied' | 'failed'

const LABEL: Record<Status, string> = {
  idle: 'Copy as Markdown',
  working: 'Copying…',
  copied: 'Copied',
  failed: 'Copy failed',
}

export function CopyPageButton({ slug }: { slug: string }) {
  const [status, setStatus] = useState<Status>('idle')
  const cached = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rawUrl = `/docs/${slug}.md`

  const copy = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    setStatus('working')
    try {
      if (cached.current === null) {
        const res = await fetch(rawUrl)
        if (!res.ok) throw new Error(`${res.status}`)
        cached.current = await res.text()
      }
      await navigator.clipboard.writeText(cached.current)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    timer.current = setTimeout(() => setStatus('idle'), 2200)
  }, [rawUrl])

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={copy}
        disabled={status === 'working'}
        aria-live="polite"
        className="label group inline-flex items-center gap-1.5 border border-border px-2.5 py-1.5 transition-colors hover:border-border-strong hover:text-fg disabled:opacity-60"
      >
        {status === 'copied' ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <path d="m20 6-11 11-5-5" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="1.5" />
            <path d="M5 15V4.5A1.5 1.5 0 0 1 6.5 3H15" />
          </svg>
        )}
        {LABEL[status]}
      </button>

      {/* 📖 Always present, not just on failure: it is also how someone points
          an agent at the page without copying anything. */}
      <a
        href={rawUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="label transition-colors hover:text-fg"
      >
        View raw
      </a>
    </div>
  )
}
