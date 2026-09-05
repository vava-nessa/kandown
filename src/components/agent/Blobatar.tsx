/**
 * @file Agent blob avatar (t309)
 * @description Deterministic blob avatar identifying the agent session that is
 * currently editing a task: the same sessionId always renders the same creature
 * (shape, face, colors all derive from the id by the blobatar generator), so a
 * session keeps its face across the board card, the list row and the editor
 * header. Optional "I am editing..." bubble.
 *
 * 📖 Two mount shapes live here. AgentBlobatar is the small inline avatar for
 * headers and rows. FloatingAgentBlobatar is the bigger companion that hovers
 * OVER a surface (the board card, the editor panel corner): it rides a slow
 * motion keyframe loop (x/y drift + slight rotation, a closed path so the
 * repeat is seamless) and carries a soft drop shadow so it reads as floating
 * above the page, never as part of it. The floating wrapper is
 * pointer-events-none, so whatever it drifts across stays clickable.
 * `prefers-reduced-motion` disables the drift loop (the blobatar package goes
 * static on its own at the same time).
 *
 * 📖 This is the real blobatar (npm: blobatar + @blobatar/react, MIT,
 * https://github.com/Alain00/blobatar), used as a dependency at vava's request
 * rather than reimplemented: the animated variant renders the package's actual
 * faces with breathing, blinking and glancing via `animate="always"` and the
 * package's motion stylesheet. The library itself respects
 * `prefers-reduced-motion` by going fully static.
 *
 * @functions
 *  → AgentBlobatar: the small avatar (optionally with its editing bubble)
 *  → FloatingAgentBlobatar: the bigger drifting companion for card/editor mounts
 *
 * @exports AgentBlobatar, FloatingAgentBlobatar
 * @see src/lib/store/agentEditsSlice.ts: where the sessionId comes from
 */

import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'motion/react';
import { Blobatar } from '@blobatar/react';
import 'blobatar/motion.css';

interface AgentBlobatarProps {
  /** Agent session id: the determinism seed for shape, hue and phase. */
  sessionId: string;
  /** Pixel size of the blob square. Default 26. */
  size?: number;
  /** Renders the small "I am editing..." bubble to the left of the blob. */
  bubble?: boolean;
  /** Extra classes for positioning at the mount point (absolute etc). */
  className?: string;
}

export function AgentBlobatar({ sessionId, size = 26, bubble = false, className = '' }: AgentBlobatarProps) {
  const { t } = useTranslation();
  return (
    <span
      className={`relative inline-flex flex-none items-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={t('agentEdits.editingAria', 'An agent is editing this task')}
    >
      {/* 📖 animate="always" is the single-creature mode from the blobatar docs:
          continuous ambient motion is for one avatar, not for grids. The
          pointer-events-none wrapper keeps the card click-through intact. */}
      <span className="pointer-events-none inline-flex overflow-visible [&>svg]:drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.18)]">
        <Blobatar name={sessionId} size={size} animate="always" />
      </span>
      {bubble && (
        <span className="absolute right-[calc(100%+6px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-border bg-bg-1 px-2 py-[3px] text-[10.5px] font-semibold leading-none text-fg-muted shadow-sm">
          {t('agentEdits.editingBubble', 'I am editing this task...')}
        </span>
      )}
    </span>
  );
}

/** 📖 Keyframe loop of the floating companion: a small closed circuit (right,
 * up, left, back) with a gentle wobble in rotation. The path returns to its
 * origin so `repeat: Infinity` never jumps, and the whole orbit stays within a
 * few pixels so the creature reads as hovering, not travelling. */
const FLOAT_DRIFT = {
  x: [0, 4, -3, 0],
  y: [0, -5, -2, 0],
  rotate: [0, 5, -4, 0],
};

interface FloatingAgentBlobatarProps {
  /** Agent session id: the determinism seed for shape, hue and phase. */
  sessionId: string;
  /** Pixel size of the blob square. Default 48. */
  size?: number;
  /** Renders the small "I am editing..." bubble to the left of the blob. */
  bubble?: boolean;
  /** Positioning classes at the mount point (top-right, offsets). */
  className?: string;
  /** Hides the creature from the accessibility tree: set on the editor mount,
   * where the small header avatar already announces the session. */
  decorative?: boolean;
}

/** 📖 The floating companion: a bigger blob that hovers over a surface,
 * drifting on the FLOAT_DRIFT loop. Positioned absolutely by the mount point
 * (the board card and the editor header are both `relative` anchors). It never
 * intercepts clicks (pointer-events-none) and goes static under
 * `prefers-reduced-motion`. */
export function FloatingAgentBlobatar({
  sessionId,
  size = 48,
  bubble = false,
  className = '',
  decorative = false,
}: FloatingAgentBlobatarProps) {
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <motion.span
      aria-hidden={decorative || undefined}
      className={`pointer-events-none absolute z-30 inline-flex ${className}`}
      // 📖 The ambient shadow is what sells "hovering OVER the page": the
      // blob's own tight drop shadow reads as contact, this one reads as air.
      style={{ filter: 'drop-shadow(0 6px 10px rgba(0, 0, 0, 0.2))' }}
      animate={reduceMotion ? undefined : FLOAT_DRIFT}
      transition={reduceMotion ? undefined : { duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      <AgentBlobatar sessionId={sessionId} size={size} bubble={bubble} />
    </motion.span>
  );
}
