/**
 * @file Mini-board live theme preview card (FABLE_UI)
 * @description Renders a live preview of a KandownTheme with isolated HSL tokens
 * in a mini 3-column kanban board layout.
 *
 * @functions
 *  → ThemePreviewCard — renders theme card with live mini-board & actions
 *
 * @exports ThemePreviewCard
 * @see src/lib/theme.ts
 * @see src/lib/types.ts
 */

import React from 'react';
import { IconCheck, IconCopy, IconPencil, IconShare } from '@tabler/icons-react';
import type { KandownTheme, TokenName } from '../lib/types';

interface ThemePreviewCardProps {
  theme: KandownTheme;
  active: boolean;
  mode: 'light' | 'dark';
  onSelect: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onExport?: () => void;
}

export const ThemePreviewCard: React.FC<ThemePreviewCardProps> = ({
  theme,
  active,
  mode,
  onSelect,
  onEdit,
  onDuplicate,
  onExport,
}) => {
  const tokens = theme[mode];
  const appearance = theme.appearance;

  // Compute CSS variable inline overrides for isolated preview container
  const styleVars: Record<string, string> = {
    '--radius': appearance.radius || '6px',
    '--font-sans': theme.fonts?.sans || 'Inter, sans-serif',
    '--font-display': theme.fonts?.display && theme.fonts.display !== 'same' ? theme.fonts.display : (theme.fonts?.sans || 'Inter, sans-serif'),
  };

  for (const [key, value] of Object.entries(tokens) as Array<[TokenName, string]>) {
    styleVars[`--${key}`] = value;
  }

  return (
    <div
      onClick={onSelect}
      className={`group relative flex flex-col rounded-xl border p-3.5 transition-all duration-200 cursor-pointer text-left ${
        active
          ? 'border-primary ring-2 ring-primary/40 shadow-md bg-card'
          : 'border-border hover:border-border-strong hover:shadow-sm bg-card/60'
      }`}
    >
      {/* Top Header: Title & Badges */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="font-semibold text-sm truncate text-foreground flex items-center gap-1.5">
            {theme.name}
            {theme.isCustom && (
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                Custom
              </span>
            )}
          </h4>
        </div>

        {/* Active Indicator / Actions */}
        <div className="flex items-center gap-1">
          {active ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <IconCheck className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
      </div>

      {/* Description */}
      {theme.description && (
        <p className="text-xs text-muted-foreground line-clamp-1 mb-3">
          {theme.description}
        </p>
      )}

      {/* Mini Board Isolated Scope */}
      <div
        style={styleVars}
        className="rounded-[var(--radius)] p-2.5 bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] transition-colors overflow-hidden select-none"
      >
        {/* Mini Board Columns */}
        <div className="grid grid-cols-3 gap-1.5 font-sans">
          {/* Column 1 */}
          <div className="flex flex-col gap-1 p-1.5 rounded-[var(--radius)] bg-[hsl(var(--muted))/0.5] border border-[hsl(var(--border))/0.6]">
            <div className="flex items-center justify-between px-1 mb-0.5">
              <span className="text-[9px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-display">
                Backlog
              </span>
              <span className="text-[8px] px-1 py-0.2 rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
                1
              </span>
            </div>
            <div className="p-1.5 rounded-[var(--radius)] bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-xs text-[10px] leading-snug">
              <div className="h-1.5 w-12 rounded bg-[hsl(var(--primary))/0.8] mb-1" />
              <div className="h-1 w-16 rounded bg-[hsl(var(--muted-foreground))/0.4]" />
            </div>
          </div>

          {/* Column 2 */}
          <div className="flex flex-col gap-1 p-1.5 rounded-[var(--radius)] bg-[hsl(var(--muted))/0.5] border border-[hsl(var(--border))/0.6]">
            <div className="flex items-center justify-between px-1 mb-0.5">
              <span className="text-[9px] font-semibold text-[hsl(var(--primary))] uppercase tracking-wider font-display">
                Active
              </span>
              <span className="text-[8px] px-1 py-0.2 rounded-full bg-[hsl(var(--primary))/0.15] text-[hsl(var(--primary))]">
                1
              </span>
            </div>
            <div className="p-1.5 rounded-[var(--radius)] bg-[hsl(var(--card))] border border-[hsl(var(--border-focus))] shadow-xs text-[10px] leading-snug">
              <div className="flex items-center justify-between mb-1">
                <div className="h-1.5 w-10 rounded bg-[hsl(var(--primary))]" />
                <div className="h-2 w-2 rounded-full bg-[hsl(var(--warning))]" />
              </div>
              <div className="h-1 w-14 rounded bg-[hsl(var(--muted-foreground))/0.5]" />
            </div>
          </div>

          {/* Column 3 */}
          <div className="flex flex-col gap-1 p-1.5 rounded-[var(--radius)] bg-[hsl(var(--muted))/0.5] border border-[hsl(var(--border))/0.6]">
            <div className="flex items-center justify-between px-1 mb-0.5">
              <span className="text-[9px] font-semibold text-[hsl(var(--success))] uppercase tracking-wider font-display">
                Done
              </span>
              <span className="text-[8px] px-1 py-0.2 rounded-full bg-[hsl(var(--success))/0.15] text-[hsl(var(--success))]">
                1
              </span>
            </div>
            <div className="p-1.5 rounded-[var(--radius)] bg-[hsl(var(--card))] border border-[hsl(var(--border))] opacity-75 text-[10px] leading-snug">
              <div className="h-1.5 w-14 rounded bg-[hsl(var(--success))] mb-1 line-through" />
              <div className="h-1 w-10 rounded bg-[hsl(var(--muted-foreground))/0.3]" />
            </div>
          </div>
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
        <span className="text-[11px]">
          r: <code className="font-mono text-[10px]">{appearance.radius}</code> ·{' '}
          <span className="capitalize">{appearance.shadows}</span>
        </span>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              title="Edit custom theme"
              className="p-1 rounded hover:bg-accent hover:text-foreground text-muted-foreground transition-colors"
            >
              <IconPencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              title="Duplicate theme"
              className="p-1 rounded hover:bg-accent hover:text-foreground text-muted-foreground transition-colors"
            >
              <IconCopy className="w-3.5 h-3.5" />
            </button>
          )}
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              title="Export JSON"
              className="p-1 rounded hover:bg-accent hover:text-foreground text-muted-foreground transition-colors"
            >
              <IconShare className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
