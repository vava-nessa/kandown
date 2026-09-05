/**
 * @file Message list for the agent chat sidebar
 * @description Renders the folded conversation: user bubbles (plain text),
 * assistant turns as a BeautifulUI-style full-width panel (ONE collapsible
 * activity block that updates in place while the turn streams, then the
 * Markdown answer below it), error entries in the destructive tint, and the
 * quiet "edited ..." line for files the agent touched during the turn. Pure
 * presentation: all state comes from the event fold in the store; the
 * grouping of thinking + tools into the single activity block happens here,
 * at render time, so the fold keeps every event untouched.
 *
 * 📖 Assistant text preparation: the `[show: tXXX]` directive is stripped from
 * what the user sees (the store consumes it separately) and task references
 * are linkified into chips that open the task via the canonical openDrawer
 * action. Panel layout, streaming and activity patterns are ported from
 * BeautifulUI, https://www.beautifului.dev (MIT), in kandown tokens.
 *
 * @functions
 *  → MessageList: the full conversation, with empty state
 *
 * @exports MessageList
 * @see src/components/agent/ChatSidebar.tsx
 * @see src/components/agent/ActivityBlock.tsx
 * @see src/lib/agent-chat-events.ts: the fold that produces these entries
 * @see src/lib/task-links.ts: directive stripping + reference linkifying
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import { linkifyTaskReferences, stripShowDirectives } from '../../lib/task-links';
import type { ChatEntry } from '../../lib/agent-chat-events';
import { StreamingText } from './StreamingText';
import { ActivityBlock } from './ActivityBlock';

interface MessageListProps {
  messages: ChatEntry[];
  changedFiles: string[];
  preContextTaskId: string | null;
}

export function MessageList({ messages, changedFiles, preContextTaskId }: MessageListProps) {
  const { t } = useTranslation();
  // 📖 Task chips open the task through the same path the board uses: the
  // drawer slice reads the file, the workspace/editor renders it (mobile gets
  // the Drawer, desktop the TaskWorkspace editor).
  const openDrawer = useStore(s => s.openDrawer);
  const handleOpenTask = useCallback((taskId: string) => {
    void openDrawer(taskId, { replace: true });
  }, [openDrawer]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[13.5px] text-fg-muted">{t('agentChat.emptyState', 'No messages yet. Ask anything about this project.')}</p>
        {preContextTaskId && (
          <span className="rounded-full bg-bg-2 px-2 py-0.5 font-mono text-[11px] text-fg-muted">
            {t('agentChat.context', 'Context')}: {preContextTaskId.toUpperCase()}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      {messages.map(entry => {
        if (entry.kind === 'user') {
          return (
            <div key={entry.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[8px] bg-accent/15 px-2.5 py-1.5 text-[13.5px] leading-relaxed text-fg">
                {entry.text}
              </div>
            </div>
          );
        }
        if (entry.kind === 'error') {
          return (
            <div
              key={entry.id}
              className={`flex items-start gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[12.5px] leading-relaxed ${
                entry.fatal
                  ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                 : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              }`}
            >
              <IconAlertTriangle size={13} stroke={1.8} className="mt-0.5 flex-none" />
              <span className="break-words">{entry.message}</span>
            </div>
          );
        }
        return (
          // 📖 Assistant turn: one full-width subtle panel (BeautifulUI chat
          // message shape). The single activity block renders thinking and
          // tools; the Markdown answer streams below it.
          <div key={entry.id} className="w-full rounded-[10px] border border-border/70 bg-bg-1/60 px-2.5 py-2">
            <ActivityBlock entry={entry} />
            {entry.text && (
              <StreamingText
                text={linkifyTaskReferences(stripShowDirectives(entry.text))}
                streaming={entry.streaming}
                markdown
                onOpenTask={handleOpenTask}
              />
            )}
          </div>
        );
      })}
      {changedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1 px-0.5 text-[10.5px] text-fg-faint">
          {changedFiles.map(path => (
            <span key={path} className="max-w-full truncate rounded bg-bg-2 px-1.5 py-0.5 font-mono" title={path}>
              {path}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
