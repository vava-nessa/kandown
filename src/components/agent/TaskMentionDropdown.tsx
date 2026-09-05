/**
 * @file Shared dropdown list for the agent chat prompt (round 3)
 * @description One small list, three uses, anchored above the PromptBar
 * textarea: @task mentions (mono @id chip + task title), /skill tokens
 * (mono /id + chat button label + interactive badge) and the "pick one task"
 * mode a task-scoped skill falls back to when no task context is selected.
 * Purely presentational and keyboard-driven: PromptBar owns the detection,
 * the items, the active index and every key handler; this component renders
 * the rows and reports clicks.
 *
 * @functions
 *  → TaskMentionDropdown: the anchored list (null when there is nothing to show)
 *
 * @exports TaskMentionDropdown, TaskMentionDropdownItem
 * @see src/components/agent/PromptBar.tsx: detection, keyboard, selection
 * @see src/components/agent/ChatSidebar.tsx: pick-task mode wiring
 */

import { useTranslation } from 'react-i18next';
import { IconHelp } from '@tabler/icons-react';

/** 📖 One row of the dropdown, pre-shaped by the caller. `mono` carries the
 * trigger-aware identifier (@t271, /grill-me, plain t271 in pick-task mode),
 * `label` the human title or button label. */
export interface TaskMentionDropdownItem {
  key: string;
  mono: string;
  label: string;
  /** Renders the small help badge (interactive skills ask questions). */
  interactive?: boolean;
}

interface TaskMentionDropdownProps {
  /** Heading above the list; null renders no heading. */
  title: string | null;
  items: TaskMentionDropdownItem[];
  /** Index highlighted by the keyboard (ArrowUp/Down). */
  activeIndex: number;
  /** Message shown instead of rows when the list is empty (empty board). */
  emptyLabel: string | null;
  onSelect: (index: number) => void;
  /** Mouse hover moves the keyboard highlight so the two stay in sync. */
  onActiveIndexChange: (index: number) => void;
}

export function TaskMentionDropdown({
  title,
  items,
  activeIndex,
  emptyLabel,
  onSelect,
  onActiveIndexChange,
}: TaskMentionDropdownProps) {
  const { t } = useTranslation();
  if (items.length === 0 && !emptyLabel) return null;

  return (
    <div
      role="listbox"
      aria-label={title ?? t('agentChat.mentionDropdownLabel', 'Suggestions')}
      className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-[220px] overflow-y-auto rounded-[8px] border border-border bg-bg-1 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
    >
      {title && (
        <p className="truncate px-2.5 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint">
          {title}
        </p>
      )}
      {items.length === 0 && emptyLabel && (
        <p className="px-2.5 py-1.5 text-[12px] text-fg-muted">{emptyLabel}</p>
      )}
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onClick={() => onSelect(index)}
          onMouseEnter={() => onActiveIndexChange(index)}
          className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
            index === activeIndex ? 'bg-bg-2' : ''
          }`}
        >
          <span className="flex-none font-mono text-[11px] text-fg">{item.mono}</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">{item.label}</span>
          {item.interactive && (
            <IconHelp
              size={11}
              stroke={1.8}
              className="flex-none text-fg-faint"
              aria-label={t('agentSkills.interactiveBadge', 'Interactive')}
              title={t('agentSkills.interactiveBadge', 'Interactive')}
            />
          )}
        </button>
      ))}
    </div>
  );
}
