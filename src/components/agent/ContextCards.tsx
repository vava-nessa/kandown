/**
 * @file Context cards above a user chat message (round 5)
 * @description BeautifulUI 10 Context Cards port: when a user message carries
 * @task mentions, small context cards render above the bubble (task id, title
 * when the board knows it, and a file icon), right-aligned like the bubble.
 * Each card is clickable and opens the task through the same canonical
 * openDrawer path the task chips use. The ids are parsed from the visible
 * message text at render time (the visible text keeps its @markers: the slice
 * forwards the structured ids separately, and this component never touches
 * the fold), capped at 5 like the transport.
 *
 * @functions
 *  → ContextCards: the referenced-task cards of one user message
 *
 * @exports ContextCards
 * @see src/lib/chat-mentions.ts: the mention extraction reused here
 * @see src/components/agent/MessageList.tsx: mount point
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconFileText } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import { extractMentionedTaskIds } from '../../lib/chat-mentions';

interface ContextCardsProps {
  /** The user message's visible text (keeps its @mention markers). */
  text: string;
  /** Opens a task in the app (canonical openDrawer path). */
  onOpenTask: (taskId: string) => void;
}

interface ContextCard {
  id: string;
  title: string | null;
}

/** 📖 Canonical task id shape, same spirit as task-links' reference pattern:
 * an @mention that is not a task id (an email handle, a person name) never
 * becomes a card. */
const TASK_ID_PATTERN = /^t\d+$/;

export function ContextCards({ text, onOpenTask }: ContextCardsProps) {
  const { t } = useTranslation();
  const columns = useStore(s => s.columns);

  // 📖 Resolve mention ids to titles through the board's loaded tasks; ids
  // missing from the board (renamed, archived) still render, title-less.
  const cards = useMemo<ContextCard[]>(() => {
    const titleById = new Map<string, string>();
    for (const column of columns) {
      for (const task of column.tasks) {
        if (!titleById.has(task.id)) titleById.set(task.id, task.title);
      }
    }
    const seen = new Set<string>();
    const resolved: ContextCard[] = [];
    for (const raw of extractMentionedTaskIds(text)) {
      const id = raw.toLowerCase();
      if (!TASK_ID_PATTERN.test(id) || seen.has(id)) continue;
      seen.add(id);
      resolved.push({ id, title: titleById.get(id) ?? null });
      if (resolved.length >= 5) break;
    }
    return resolved;
  }, [text, columns]);

  if (cards.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={t('agentChat.contextCardsLabel', 'Referenced tasks')}
      className="flex flex-col items-end gap-1"
    >
      {cards.map(card => (
        <button
          key={card.id}
          type="button"
          onClick={() => onOpenTask(card.id)}
          title={card.title ?? card.id.toUpperCase()}
          className="inline-flex max-w-[85%] items-center gap-1 rounded-[8px] border border-border bg-bg-1 px-2 py-1 text-left transition-colors hover:border-border-strong hover:bg-bg-2"
        >
          <IconFileText size={11} stroke={1.8} className="flex-none text-fg-muted" />
          <span className="flex-none font-mono text-[11px] font-medium text-fg">{card.id.toUpperCase()}</span>
          {card.title && <span className="min-w-0 truncate text-[11.5px] text-fg-muted">{card.title}</span>}
        </button>
      ))}
    </div>
  );
}
