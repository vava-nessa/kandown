/**
 * @file src/components/CodeWindow.tsx
 * @description A small framed code panel used on the landing page.
 *
 * 📖 Landing-page snippets are hand-authored JSX, not MDX, so they do not pass
 * through Shiki. Rather than pull a highlighter into the client bundle for four
 * short excerpts, `Line` accepts a `tone` and the snippets colour themselves.
 * It is less clever than real tokenisation and about 40 KB lighter.
 *
 * @exports CodeWindow — titled frame
 * @exports Line — one line of code, tinted by role
 */
import type { ReactNode } from 'react'

export function CodeWindow({
  title,
  children,
  className = '',
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`bg-bg ${className}`}>
      <div className="border-b border-border px-4 py-2.5">
        <span className="label">{title}</span>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.8]">
        <code>{children}</code>
      </pre>
    </div>
  )
}

const TONES = {
  /** Shell prompt, `$` included by the caller. */
  prompt: 'text-accent-fg',
  /** Program output, deliberately quieter than input. */
  output: 'text-fg-muted',
  /** Comments and annotations. */
  muted: 'text-fg-faint',
  /** Frontmatter keys, headings — the structural bits. */
  key: 'text-fg',
  /** String and scalar values. */
  value: 'text-accent-fg',
} as const

export function Line({
  tone = 'output',
  children,
}: {
  tone?: keyof typeof TONES
  children: ReactNode
}) {
  return <span className={`block ${TONES[tone]}`}>{children || ' '}</span>
}
