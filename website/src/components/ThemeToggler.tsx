/**
 * @file src/components/ThemeToggler.tsx
 * @description The header's light/dark switch, with a circular View Transition
 * reveal that wipes the new theme outward from the button.
 *
 * 📖 Ported from the toggler on vanessadepraute.dev, rebuilt without
 * framer-motion or lucide — the icon crossfade is 20 lines of CSS transform and
 * the icons are inline SVG, which keeps a purely decorative control from adding
 * two runtime dependencies to a documentation site.
 *
 * 📖 How the reveal works. `document.startViewTransition` snapshots the page,
 * `flushSync` applies the theme synchronously inside the callback (React would
 * otherwise batch it to *after* the snapshot and animate nothing), and once the
 * transition is ready we animate a `clip-path` circle on
 * `::view-transition-new(root)` from zero to the furthest viewport corner. The
 * radius is computed with `Math.hypot` against the button's centre so the wipe
 * always finishes covering the screen, wherever the button sits.
 *
 * 📖 Graceful degradation, three ways: browsers without View Transitions get an
 * instant swap; `prefers-reduced-motion` skips the animation deliberately; and
 * the whole control renders inert until mounted, because the server cannot know
 * which theme the visitor has stored.
 *
 * @functions
 *   ThemeToggler → the button
 *   revealRadius → distance from the button's centre to the furthest corner
 * @exports ThemeToggler
 * @see src/lib/theme.ts — resolution, persistence and the no-flash init script
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  type ResolvedTheme,
  type ThemeChoice,
} from '~/lib/theme'

const TRANSITION_MS = 560

function revealRadius(element: HTMLElement): { x: number; y: number; radius: number } {
  const { left, top, width, height } = element.getBoundingClientRect()
  const x = left + width / 2
  const y = top + height / 2
  return {
    x,
    y,
    radius: Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)),
  }
}

export function ThemeToggler({ className = '' }: { className?: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [choice, setChoice] = useState<ThemeChoice>('system')
  const [resolved, setResolved] = useState<ResolvedTheme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = getStoredTheme()
    setChoice(stored)
    setResolved(resolveTheme(stored))
    setMounted(true)
  }, [])

  // 📖 While the visitor is on `system`, follow the OS live — someone flipping
  // macOS to dark at sunset should see the site follow without a reload.
  useEffect(() => {
    if (choice !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setResolved(query.matches ? 'dark' : 'light')
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [choice])

  const toggle = useCallback(() => {
    const next: ThemeChoice = resolved === 'dark' ? 'light' : 'dark'

    const commit = () => {
      applyTheme(next)
      setChoice(next)
      setResolved(next)
    }

    const button = buttonRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!button || reducedMotion || !document.startViewTransition) {
      commit()
      return
    }

    // 📖 flushSync is required: the snapshot is taken when the callback returns,
    // so the DOM must already carry the new theme by then.
    const transition = document.startViewTransition(() => flushSync(commit))

    transition.ready
      .then(() => {
        const { x, y, radius } = revealRadius(button)
        document.documentElement.animate(
          {
            clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
          },
          {
            duration: TRANSITION_MS,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        )
      })
      .catch(() => {
        /* A transition can be skipped (rapid clicks); the theme is applied
           regardless, so there is nothing to recover. */
      })
  }, [resolved])

  const isDark = resolved === 'dark'

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggle}
      // 📖 Before hydration the stored choice is unknown, so the control is
      // hidden from assistive tech and pointer events rather than announcing a
      // state it may be about to contradict.
      aria-hidden={!mounted}
      tabIndex={mounted ? 0 : -1}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`relative grid h-8 w-8 place-items-center rounded-md text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg active:scale-95 ${
        mounted ? 'opacity-100' : 'pointer-events-none opacity-0'
      } ${className}`}
    >
      {/* 📖 Both icons are always in the DOM, stacked. Swapping opacity, scale
          and rotation between them animates far more smoothly than mounting and
          unmounting, and avoids a layout pass mid-transition. */}
      <SunIcon
        className={`absolute transition-all duration-200 ${
          isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-45 opacity-0'
        }`}
      />
      <MoonIcon
        className={`absolute transition-all duration-200 ${
          isDark ? 'scale-50 rotate-45 opacity-0' : 'scale-100 rotate-0 opacity-100'
        }`}
      />
    </button>
  )
}

function SunIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  )
}
