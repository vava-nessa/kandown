/**
 * @file Shared category chip component
 * @description Renders a category name as a chip. When `ui.categoryChips` is
 * on (default), the chip carries a stable hash-derived background color and a
 * matching small icon (see src/lib/category-color.ts), so the same category
 * always renders the same color everywhere with nothing stored. When the
 * option is off, it falls back to the previous monochrome accent chip.
 *
 * 📖 Renders a `<button>` when `onClick` is provided (the drawer and editor
 * headers let the user edit the category), a `<span>` otherwise (the "All
 * tasks" section header, which sits inside its own toggle button, so a nested
 * button would be invalid HTML).
 *
 * @exports CategoryChip
 * @see src/lib/category-color.ts
 * @see src/components/Drawer.tsx
 * @see src/components/TaskWorkspace.tsx
 */

import { chipHueSat, categoryIcon } from '../lib/category-color';
import type React from 'react';
import { useStore } from '../lib/store';

export interface CategoryChipProps {
  /** The category name, e.g. `WEB` or `CLI`. Rendered uppercase. */
  category: string;
  /** When provided the chip is a button and this runs on click. */
  onClick?: () => void;
  /** Extra classes appended to the chip (for layout contexts). */
  className?: string;
}

export function CategoryChip({ category, onClick, className = '' }: CategoryChipProps) {
  const chips = useStore(s => s.config.ui.categoryChips !== false);
  const Icon = chips ? categoryIcon(category) : null;

  const classes = chips
    ? `category-chip inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${className}`
    : `font-mono text-[12px] uppercase px-1.5 py-0.5 bg-accent/15 rounded text-accent-foreground font-semibold ${className}`;

  const content = (
    <>
      {Icon ? <Icon size={12} stroke={2.2} aria-hidden="true" /> : null}
      <span className="truncate">{chips ? category : `[${category}]`}</span>
    </>
  );

  // 📖 The chip ships the hashed hue/sat as CSS variables; the tint fill and
  // the mode-aware label color live in globals.css (.category-chip), so the
  // same hash reads correctly in light and dark without a mode prop.
  const style = chips
    ? (() => {
        const { hue, sat } = chipHueSat(category);
        return { '--chip-hue': hue, '--chip-sat': sat } as React.CSSProperties;
      })()
    : undefined;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${classes} hover:opacity-85 active:opacity-70 transition-opacity`}
        style={style}
        title="Click to edit category"
      >
        {content}
      </button>
    );
  }
  return (
    <span className={classes} style={style} title={category}>
      {content}
    </span>
  );
}
