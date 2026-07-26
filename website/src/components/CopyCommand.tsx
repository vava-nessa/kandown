/**
 * @file src/components/CopyCommand.tsx
 * @description A terminal-styled command with a copy button — the primary call to
 * action in the hero, reused wherever a shell one-liner is offered.
 *
 * 📖 The button shows a short label next to the icon (`Copy` idle, `Copied`
 * after a successful click) so the affordance is obvious even when the icon is
 * small. Visual states are deliberately layered: `text-fg-faint` for the
 * resting button so it does not compete with the command itself, a 5% black
 * tint on hover to give a tactile press feel without forcing a hard colour
 * swap, a `focus-visible` ring in the accent colour for keyboard users, and a
 * 1px translate + 0.97 scale on active so the click registers in the
 * finger. The `Copied` state paints the icon in `--kd-accent-fg` and switches
 * the label to confirm.
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
        className="group inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[4px] px-2 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint transition-[color,background-color,transform] duration-150 hover:bg-black/5 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:translate-y-px active:scale-[0.97]"
      >
        {copied ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="text-accent-fg" aria-hidden="true">
              <path d="m20 6-11 11-5-5" />
            </svg>
            <span>Copied</span>
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="9" y="9" width="12" height="12" rx="2.5" />
              <path d="M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
            </svg>
            <span>Copy</span>
          </>
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </div>
  )
}
