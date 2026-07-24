/**
 * @file Motion preset tokens
 * @description Single source of truth for every `motion.*` and `AnimatePresence`
 * in the project. Pairing it with Tailwind-only hover/active states in the
 * static components keeps the two animation systems from fighting each other
 * (which produced the "0.5s pop" the user reported).
 *
 * 📖 Two systems intentionally coexist:
 *  → Motion handles **enter/exit/layout**: toasts, hero, progress bars, panel
 *    expand/collapse. Always use the tokens below so durations stay coherent.
 *  → Tailwind handles **hover/active feedback**: card lift, scale, color
 *    transitions. Confined to `transition-transform` and `transition-colors`
 *    so we never animate `all` and trigger redundant repaints.
 *
 * @see https://motion.dev — runtime used by `motion/react`
 */

/** 🪄 Standard ease curve (smooth out) — used for everything that enters
 * or exits the DOM. 180ms is the sweet spot: fast enough to feel snappy
 * on local state, slow enough that the eye follows the motion. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** 🪄 Snappy ease for user-initiated feedback (hover lift, tap scale).
 * Tight duration (120ms) so it never competes with the 180ms enter curve. */
export const EASE_SPRING = [0.4, 0, 0.2, 1] as const;

export const MOTION = {
  /** Fade in/out for ephemeral overlays (toasts, modal panels). */
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.18, ease: EASE_OUT },
  },
  /** Toasts: small upward float + subtle scale on entry, reverse on exit. */
  toast: {
    initial: { opacity: 0, y: 12, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 6, scale: 0.97 },
    transition: { duration: 0.22, ease: EASE_OUT },
  },
  /** Progress bar: animate `width` (no spring — springs on width jitter). */
  progressBar: (widthPercent: number) => ({
    initial: false as const,
    animate: { width: `${widthPercent}%` },
    transition: { duration: 0.32, ease: EASE_OUT },
  }),
  /** Empty-state hero: stagger each child for a soft cascade on first load. */
  heroStagger: (index: number) => ({
    initial: { opacity: 0, y: 8 } as const,
    animate: { opacity: 1, y: 0 } as const,
    transition: { duration: 0.32, ease: EASE_OUT, delay: 0.05 + index * 0.05 },
  }),
  /** Header logo ↔ project name cross-fade when a project opens. */
  headerCrossfade: {
    initial: { opacity: 0 } as const,
    animate: { opacity: 1 } as const,
    exit: { opacity: 0 } as const,
    transition: { duration: 0.18, ease: EASE_OUT },
  },
  /** Subtask panel expand/collapse. */
  panel: {
    initial: { height: 0, opacity: 0 },
    animate: { height: 'auto', opacity: 1 },
    exit: { height: 0, opacity: 0 },
    transition: { duration: 0.18, ease: EASE_OUT },
  },
  /** Chevron rotate (used by SubtaskItem expand/collapse toggle). */
  rotate: (expanded: boolean) => ({
    animate: { rotate: expanded ? 90 : 0 },
    transition: { duration: 0.15, ease: EASE_OUT },
  }),
  /** AnimatePresence exit for items leaving a list (chips, toasts). */
  chip: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
    transition: { duration: 0.15, ease: EASE_OUT },
  },
} as const;
