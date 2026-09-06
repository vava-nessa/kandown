/**
 * @file Context cards above a user chat message (round 5, round 7 renderer)
 * @description BeautifulUI 10 Context Cards, shared bui/ edition: when a user
 * message carries @task mentions, the official bui cards render above the
 * bubble, right-aligned like it. Each card carries the task title when the
 * board knows it (the id otherwise), a `${id}.md` source chip with the MD
 * badge, and opens the task through the same canonical openDrawer path the
 * task chips use. Round 11: hovering a card also opens the shared
 * TaskPreviewPopover (scrollable, small-type task preview) anchored to the
 * card's rect, driven by bui/ContextCards' `onCardHover` hook and closed with
 * the same 250ms pointer grace the markdown chips use. The ids are parsed from
 * the visible message text at render time (the visible text keeps its
 * @markers: the slice forwards the structured ids separately), capped at 5
 * like the transport.
 *
 * @functions
 *  → ContextCards: the referenced-task bui cards of one user message
 *
 * @exports ContextCards
 * @see src/components/bui/ContextCards.tsx: the adapted official component
 * @see src/components/agent/TaskHoverCard.tsx: the shared preview popover
 * @see src/lib/chat-mentions.ts: the mention extraction reused here
 * @see src/components/agent/MessageList.tsx: mount point
 */

import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../lib/store';
import { extractMentionedTaskIds } from '../../lib/chat-mentions';
import BuiContextCards, { type ContextChunk } from '../bui/ContextCards';
import { TaskPreviewPopover, useGracefulClose } from './TaskHoverCard';

interface ContextCardsProps {
  /** The user message's visible text (keeps its @mention markers). */
  text: string;
  /** Opens a task in the app (canonical openDrawer path). */
  onOpenTask: (taskId: string) => void;
}

/** 📖 Canonical task id shape, same spirit as task-links' reference pattern:
 * an @mention that is not a task id (an email handle, a person name) never
 * becomes a card. */
const TASK_ID_PATTERN = /^t\d+$/;

export function ContextCards({ text, onOpenTask }: ContextCardsProps) {
  const columns = useStore(s => s.columns);
  // 📖 Round 11: the card hovered last (with its rect captured at enter time)
  // drives the preview popover; null when the pointer left every card.
  const [hover, setHover] = useState<{ taskId: string; anchor: DOMRect } | null>(null);
  const { scheduleClose, cancelClose, closeNow } = useGracefulClose(() => setHover(null));

  // 📖 Resolve mention ids to titles through the board's loaded tasks; ids
  // missing from the board (renamed, archived) still render, titled by id.
  const chunks = useMemo<ContextChunk[]>(() => {
    const titleById = new Map<string, string>();
    for (const column of columns) {
      for (const task of column.tasks) {
        if (!titleById.has(task.id)) titleById.set(task.id, task.title);
      }
    }
    const seen = new Set<string>();
    const resolved: ContextChunk[] = [];
    for (const raw of extractMentionedTaskIds(text)) {
      const id = raw.toLowerCase();
      if (!TASK_ID_PATTERN.test(id) || seen.has(id)) continue;
      seen.add(id);
      resolved.push({
        title: titleById.get(id) ?? id.toUpperCase(),
        source: `${id}.md`,
        badge: 'MD',
        tone: 'bg-accent',
        taskId: id,
      });
      if (resolved.length >= 5) break;
    }
    return resolved;
  }, [text, columns]);

  // 📖 Card hover wiring: entering a card (with a task id) cancels any pending
  // close and swaps the preview; leaving arms the 250ms grace timer, which the
  // popover itself cancels when the pointer reaches it. Declared before the
  // early return below: hook order must not depend on the chunk count.
  const handleCardHover = useCallback(
    (chunk: ContextChunk | null, anchorRect: DOMRect | null) => {
      if (chunk !== null && anchorRect !== null && chunk.taskId !== undefined) {
        cancelClose();
        setHover({ taskId: chunk.taskId, anchor: anchorRect });
      } else {
        scheduleClose();
      }
    },
    [cancelClose, scheduleClose],
  );

  if (chunks.length === 0) return null;

  return (
    <>
      {/* 📖 Bare cards (no header counter row), capped at the bubble width and
          pushed right by the parent's items-end column. */}
      <BuiContextCards
        chunks={chunks}
        showHeader={false}
        className="max-w-[85%]"
        onOpen={chunk => {
          if (chunk.taskId) onOpenTask(chunk.taskId);
        }}
        onCardHover={handleCardHover}
      />
      {hover !== null &&
        createPortal(
          <TaskPreviewPopover
            taskId={hover.taskId}
            anchor={hover.anchor}
            onClose={closeNow}
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
          />,
          document.body,
        )}
    </>
  );
}
