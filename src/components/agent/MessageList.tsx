/**
 * @file Message list for the agent chat sidebar
 * @description Renders the folded conversation: user bubbles, assistant turns
 * (streaming text, collapsible thinking block, tool chips), error entries in
 * the destructive tint, and the quiet "edited ..." line for files the agent
 * touched during the turn. Pure presentation: all state comes from the event
 * fold in the store.
 *
 * @functions
 *  → ThinkingBlock: collapsible reasoning channel of one assistant turn
 *  → ToolChips: one chip per tool call, tinted by outcome
 *  → MessageList: the full conversation, with empty state
 *
 * @exports MessageList
 * @see src/components/agent/ChatSidebar.tsx
 * @see src/lib/agent-chat-events.ts: the fold that produces these entries
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconAlertTriangle, IconBrain, IconChevronDown, IconTool } from '@tabler/icons-react';
import { AnimatePresence, motion } from 'motion/react';
import { MOTION } from '../../lib/motion-presets';
import type { ChatAssistantEntry, ChatEntry } from '../../lib/agent-chat-events';
import { StreamingText } from './StreamingText';

/** 📖 Collapsible thinking channel. Auto-opens while thinking is the live
 * phase, auto-collapses back once answer text starts flowing. */
function ThinkingBlock({ entry }: { entry: ChatAssistantEntry }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(entry.thinkingActive);

  useEffect(() => {
    if (entry.thinkingActive) setOpen(true);
  }, [entry.thinkingActive]);

  if (!entry.thinking) return null;

  return (
    <div className="mb-1.5 overflow-hidden rounded-[8px] border border-border bg-bg-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11.5px] font-medium text-fg-muted transition-colors hover:text-fg"
        aria-expanded={open}
      >
        <IconBrain size={12} stroke={1.8} className={entry.thinkingActive ? 'animate-pulse text-accent': ''} />
        <span>{t('agentChat.thinking', 'Thinking')}</span>
        <motion.span {...MOTION.rotate(open)} className="ml-auto inline-flex">
          <IconChevronDown size={12} stroke={1.8} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div {...MOTION.panel}>
            <p className="whitespace-pre-wrap break-words border-t border-border px-2.5 py-2 text-[12px] leading-relaxed text-fg-muted">
              {entry.thinking}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 📖 One chip per tool call of the turn, paired by the event fold. Tint:
 * running (no result yet) neutral, success emerald, failure red. */
function ToolChips({ entry }: { entry: ChatAssistantEntry }) {
  const { t } = useTranslation();
  if (entry.tools.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {entry.tools.map((tool, i) => (
        <span
          key={tool.toolCallId ?? `${tool.toolName}-${i}`}
          title={tool.summary ?? tool.toolName}
          className={`inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] ${
            tool.ok === true
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
             : tool.ok === false
                ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
               : 'border-border bg-bg-2 text-fg-muted'
          }`}
        >
          <IconTool size={10} stroke={1.8} className={tool.ok === null ? 'animate-pulse': ''} />
          <span className="truncate font-medium">{tool.toolName}</span>
          {tool.summary && <span className="hidden truncate font-normal opacity-70 sm:inline">{tool.summary}</span>}
          {tool.ok === false && <span className="font-semibold">{t('agentChat.toolFailed', 'failed')}</span>}
        </span>
      ))}
    </div>
  );
}

interface MessageListProps {
  messages: ChatEntry[];
  changedFiles: string[];
  preContextTaskId: string | null;
}

export function MessageList({ messages, changedFiles, preContextTaskId }: MessageListProps) {
  const { t } = useTranslation();

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
          <div key={entry.id} className="max-w-[92%] self-start">
            <ThinkingBlock entry={entry} />
            {entry.text && <StreamingText text={entry.text} streaming={entry.streaming} />}
            <ToolChips entry={entry} />
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
