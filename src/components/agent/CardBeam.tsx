/**
 * @file Agent edit border beam (t309)
 * @description Animated border-beam overlay marking a task an agent session is
 * currently editing. Mounted inside Card (board view) and ListRow (list view):
 * the component reads the agentEdits store itself, so hosts render one line
 * and it self-hides when no edit is live. Dismounts with a short fade (motion
 * presets) when the `agent_edit_ended` board event clears the presence.
 *
 * 📖 Inspired by the border-beam pattern (libraries.dev/beam; MagicUI
 * BorderBeam, MIT). Implemented from scratch: a conic gradient rotates inside
 * an overflow-hidden ring that a CSS mask clips to the border area, so the
 * beam runs along the host's rounded border without touching its content.
 *
 * 📖 Accessibility: the ring is a decorative overlay (aria-hidden, no pointer
 * events). With `prefers-reduced-motion: reduce` the rotation stops and the
 * beam becomes a static, tinted border glow.
 *
 * @functions
 *  → ensureBeamStyles: idempotent one-time style injection into document.head
 *  → CardBeam: self-subscribing beam overlay for one task id
 *
 * @exports CardBeam
 * @see src/lib/store/agentEditsSlice.ts: the edits presence it reads
 * @see src/components/Card.tsx, src/components/ListRow.tsx: mount points
 */

import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../../lib/store';
import { MOTION } from '../../lib/motion-presets';

const STYLE_ID = 'kd-agent-beam-style';

/* 📖 Beam styling lives in one injected stylesheet (no new dependency, no
 * Tailwind config change). The mask pair (content-box + full box, composited
 * with exclude/xor) leaves a ring as thick as the padding; the ::before
 * gradient rotating inside it reads as a light running along the border. */
const BEAM_CSS = `
.kd-agent-beam {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
}
.kd-agent-beam-card {
  border-radius: 9px;
}
.kd-agent-beam-row {
  inset: 1px;
  border-radius: 8px;
}
.kd-agent-beam-ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.6px;
  overflow: hidden;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
}
.kd-agent-beam-ring::before {
  content: "";
  position: absolute;
  inset: -120%;
  background: conic-gradient(from 0deg,
    transparent 0deg 300deg,
    color-mix(in srgb, var(--primary, #5b5bd6) 55%, transparent) 330deg,
    var(--primary, #5b5bd6) 350deg,
    transparent 360deg);
  animation: kd-agent-beam-spin 3.8s linear infinite;
}
.kd-agent-beam-ring::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 0 12px -4px color-mix(in srgb, var(--primary, #5b5bd6) 55%, transparent);
}
@keyframes kd-agent-beam-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .kd-agent-beam-ring::before {
    animation: none;
    background: none;
    background-color: color-mix(in srgb, var(--primary, #5b5bd6) 40%, transparent);
    inset: 0;
  }
}
`;

/** 📖 Injects the beam stylesheet once per page, guarded by element id so
 * React strict-mode double renders and multiple mounted beams stay cheap. */
function ensureBeamStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = BEAM_CSS;
  document.head.appendChild(tag);
}

interface CardBeamProps {
  /** Task id to watch in the agentEdits presence map. */
  taskId: string;
  /** `card` tracks the rounded Card surface, `row` insets the beam inside a
   * square list row so it reads as a highlight pill. */
  variant?: 'card' | 'row';
}

export function CardBeam({ taskId, variant = 'card' }: CardBeamProps) {
  ensureBeamStyles();
  const active = useStore(s => s.agentEdits.edits[taskId] !== undefined);
  return (
    <AnimatePresence initial={false}>
      {active && (
        <motion.div
          {...MOTION.fade}
          aria-hidden="true"
          className={`kd-agent-beam ${variant === 'row' ? 'kd-agent-beam-row' : 'kd-agent-beam-card'}`}
        >
          <div className="kd-agent-beam-ring" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
