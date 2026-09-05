/**
 * @file Agent blob avatar (t309)
 * @description Deterministic, dependency-free SVG "blobatar" identifying the
 * agent session that is currently editing a task: the same sessionId always
 * renders the same blob (shape, hue, animation phase all derive from a djb2
 * hash of the id), so a session keeps its face across the board card, the
 * list row and the editor header. Optional "I am editing..." bubble.
 *
 * 📖 Inspired by blobatar (Alain00/blobatar, MIT). The blob shape is generated
 * from the hash seed: six points on a circle with hash-driven radius jitter,
 * joined with a closed Catmull-Rom spline converted to cubic beziers, so every
 * session gets an organic, reproducible silhouette with zero assets.
 *
 * 📖 Motion: the blob breathes (slow scale) and blinks (scaleY on the face
 * group), phase-shifted per session via negative animation delays. With
 * `prefers-reduced-motion: reduce` both animations are disabled and the blob
 * renders static; the bubble never animates either way.
 *
 * @functions
 *  → hashSessionId: djb2 string hash, the determinism seed
 *  → blobPath: seeded closed spline path in a 64x64 viewBox
 *  → ensureBlobatarStyles: idempotent one-time style injection
 *  → AgentBlobatar: the avatar (optionally with its editing bubble)
 *
 * @exports AgentBlobatar
 * @see src/lib/store/agentEditsSlice.ts: where the sessionId comes from
 */

import { useTranslation } from 'react-i18next';

const STYLE_ID = 'kd-blobatar-style';

const BLOBATAR_CSS = `
.kd-blobatar {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
}
.kd-blobatar svg {
  display: block;
  filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.18));
}
.kd-blobatar-breathe {
  transform-box: fill-box;
  transform-origin: center;
  animation: kd-blob-breathe 3.2s ease-in-out infinite;
}
.kd-blobatar-face {
  transform-box: fill-box;
  transform-origin: center;
  animation: kd-blob-blink 4.6s ease-in-out infinite;
}
.kd-blobatar-bubble {
  position: absolute;
  top: 50%;
  right: calc(100% + 6px);
  transform: translateY(-50%);
  white-space: nowrap;
  border-radius: 999px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
  background: var(--card, #fff);
  color: var(--muted-foreground, #6b7280);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
  padding: 3px 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  animation: kd-blob-float 3.2s ease-in-out infinite;
}
@keyframes kd-blob-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
@keyframes kd-blob-blink {
  0%, 91%, 100% { transform: scaleY(1); }
  94% { transform: scaleY(0.08); }
}
@keyframes kd-blob-float {
  0%, 100% { transform: translateY(-50%); }
  50% { transform: translateY(calc(-50% - 1.5px)); }
}
@media (prefers-reduced-motion: reduce) {
  .kd-blobatar-breathe,
  .kd-blobatar-face,
  .kd-blobatar-bubble {
    animation: none;
  }
}
`;

/** 📖 Injects the blobatar stylesheet once per page, guarded by element id. */
function ensureBlobatarStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = BLOBATAR_CSS;
  document.head.appendChild(tag);
}

/**
 * 📖 djb2 string hash. Two different session ids usually land on different
 * blobs; the same id always lands on the same one. That is the whole contract.
 */
function hashSessionId(sessionId: string): number {
  let hash = 5381;
  for (let i = 0; i < sessionId.length; i++) {
    hash = ((hash << 5) + hash + sessionId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** 📖 Deterministic pseudo-random 0..1 for point i of a seed. */
function seededRand(seed: number, i: number): number {
  let x = (seed ^ Math.imul(i + 1, 2654435761)) >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return (x % 1000) / 1000;
}

/**
 * 📖 Builds a closed blob path from the seed: six anchors around the center
 * with hash-driven radius jitter, smoothed with Catmull-Rom to cubic bezier
 * conversion. Pure, so SSR and re-renders cannot flicker the shape.
 */
function blobPath(seed: number): string {
  const points = 6;
  const center = 32;
  const baseRadius = 19;
  const anchors: Array<[number, number]> = [];
  for (let i = 0; i < points; i++) {
    const angle = (Math.PI * 2 * i) / points;
    const radius = baseRadius + seededRand(seed, i) * 9 - 4.5;
    anchors.push([center + Math.cos(angle) * radius, center + Math.sin(angle) * radius]);
  }
  const first = anchors[0];
  if (!first) return '';
  let d = `M ${first[0].toFixed(1)} ${first[1].toFixed(1)}`;
  for (let i = 0; i < points; i++) {
    const p0 = anchors[(i - 1 + points) % points] as [number, number];
    const p1 = anchors[i] as [number, number];
    const p2 = anchors[(i + 1) % points] as [number, number];
    const p3 = anchors[(i + 2) % points] as [number, number];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

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
  ensureBlobatarStyles();
  const seed = hashSessionId(sessionId);
  const hue = seed % 360;
  // 📖 Negative delays phase-shift the loops so two live sessions never
  // breathe or blink in sync.
  const breatheDelay = `-${((seed >>> 3) % 32) / 10}s`;
  const blinkDelay = `-${((seed >>> 7) % 40) / 10}s`;
  return (
    <span
      className={`kd-blobatar pointer-events-none ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={t('agentEdits.editingAria', 'An agent is editing this task')}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} focusable="false" aria-hidden="true">
        <g className="kd-blobatar-breathe" style={{ animationDelay: breatheDelay }}>
          <path
            d={blobPath(seed)}
            fill={`hsl(${hue} 68% 60%)`}
            stroke={`hsl(${hue} 55% 42%)`}
            strokeWidth="1.5"
          />
          <g className="kd-blobatar-face" style={{ animationDelay: blinkDelay }}>
            <circle cx="25" cy="30" r="3" fill="rgba(15, 23, 42, 0.82)" />
            <circle cx="39" cy="30" r="3" fill="rgba(15, 23, 42, 0.82)" />
            <path
              d="M25 40 Q 32 46 39 40"
              fill="none"
              stroke="rgba(15, 23, 42, 0.72)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </g>
        </g>
      </svg>
      {bubble && (
        <span className="kd-blobatar-bubble">
          {t('agentEdits.editingBubble', 'I am editing this task...')}
        </span>
      )}
    </span>
  );
}
