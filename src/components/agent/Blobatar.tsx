/**
 * @file Agent blob avatar (t309)
 * @description Deterministic blob avatar identifying the agent session that is
 * currently editing a task: the same sessionId always renders the same creature
 * (shape, face, colors all derive from the id by the blobatar generator), so a
 * session keeps its face across the board card, the list row and the editor
 * header. Optional "I am editing..." bubble.
 *
 * 📖 This is the real blobatar (npm: blobatar + @blobatar/react, MIT,
 * https://github.com/Alain00/blobatar), used as a dependency at vava's request
 * rather than reimplemented: the animated variant renders the package's actual
 * faces with breathing, blinking and glancing via `animate="always"` and the
 * package's motion stylesheet. The library itself respects
 * `prefers-reduced-motion` by going fully static.
 *
 * @functions
 *  → AgentBlobatar: the avatar (optionally with its editing bubble)
 *
 * @exports AgentBlobatar
 * @see src/lib/store/agentEditsSlice.ts: where the sessionId comes from
 */

import { useTranslation } from 'react-i18next';
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
