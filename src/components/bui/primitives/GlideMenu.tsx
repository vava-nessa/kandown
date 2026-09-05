/**
 * @file GlideMenu primitive of the BeautifulUI design system
 * @description Faithful port of the BeautifulUI primitives/GlideMenu
 * (beautifului.dev, MIT): a menu container whose highlight pill glides to the
 * hovered row instead of jumping. Rows opt in with a `data-menu-row`
 * attribute; the highlight element carries the caller's highlight classes.
 *
 * @exports GlideMenu
 * @see src/components/bui/ApprovalCard.tsx
 */

import { useRef, useState, type MouseEvent, type ReactNode } from 'react';

export default function GlideMenu({
  children,
  className = '',
  highlightClassName = 'inset-x-0 rounded-control bg-hover',
}: {
  children: ReactNode;
  className?: string;
  highlightClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<{ top: number; height: number } | null>(null);

  const handleMove = (event: MouseEvent<HTMLDivElement>) => {
    const container = ref.current;
    if (!container) return;
    const row = (event.target as HTMLElement).closest('[data-menu-row]');
    if (row instanceof HTMLElement && container.contains(row)) {
      setHighlight({ top: row.offsetTop, height: row.offsetHeight });
    }
  };

  const clear = () => setHighlight(null);

  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      onMouseOver={handleMove}
      onMouseLeave={clear}
    >
      {highlight && (
        <span
          aria-hidden
          className={`pointer-events-none absolute transition-[top,height] duration-150 ease-out ${highlightClassName}`}
          style={{ top: highlight.top, height: highlight.height }}
        />
      )}
      {children}
    </div>
  );
}
