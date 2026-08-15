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

import { categoryColor, categoryIcon } from '../lib/category-color';
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
  const color = chips ? categoryColor(category) : null;
  const Icon = chips ? categoryIcon(category) : null;

  const classes = chips
    ? `inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${className}`
    : `font-mono text-[12px] uppercase px-1.5 py-0.5 bg-accent/15 border border-accent/30 rounded text-accent-foreground font-semibold ${className}`;

  const content = (
    <>
      {Icon ? <Icon size={12} stroke={2.2} aria-hidden="true" /> : null}
      <span className="truncate">{chips ? category : `[${category}]`}</span>
    </>
  );

  const style = color ? { backgroundColor: color.bg, color: color.fg, border: `1px solid ${color.border}` } : undefined;

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
