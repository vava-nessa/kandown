/**
 * @file src/components/CopyCommand.tsx
 * @description A terminal-styled command with a copy button — the primary call to
 * action in the hero, reused wherever a shell one-liner is offered.
 *
 * 📖 Clipboard behavior is shared with the documentation copy button so both
 * controls recover from unavailable, rejected, or indefinitely pending modern
 * clipboard writes in exactly the same way. The confirmation state resets after
 * 2s and the timer is cleared on unmount.
 *
 * @functions copyToClipboard → best-effort copy, resolving to whether it worked
 * @exports CopyCommand
 */
import { useEffect, useRef, useState } from 'react'
import { copyTextToClipboard } from '~/lib/clipboard'

export function CopyCommand({ command, className = '' }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const onCopy = async () => {
    const ok = await copyTextToClipboard(command)
    if (!ok) return
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-[4px] border border-border bg-bg-subtle py-2.5 pr-2 pl-3.5 font-mono text-[13.5px] ${className}`}
    >
      <span aria-hidden="true" className="text-accent-fg select-none">
        $
      </span>
      <code className="flex-1 truncate text-fg">{command}</code>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? 'Copied' : `Copy "${command}" to clipboard`}
        className="rounded-[4px] p-1.5 text-fg-faint transition-colors hover:bg-bg hover:text-fg"
      >
        {copied ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-accent-fg" aria-hidden="true">
            <path d="m20 6-11 11-5-5" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2.5" />
            <path d="M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
          </svg>
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </div>
  )
}
