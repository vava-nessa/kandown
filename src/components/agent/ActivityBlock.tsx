/**
 * @file One collapsible activity block per assistant turn
 * @description Replaces the pile of interleaved thinking blocks and tool chips
 * the chat used to render: every assistant turn gets a SINGLE panel that
 * updates in place while the turn streams. The collapsed header carries a live
 * status glyph and summary (shimmering "Thinking" while the reasoning channel
 * is active, a spinning tool glyph plus a "3 tools: 2 ok, 1 failed" counter
 * once tools run, a check once the turn settles); the latest thinking fragment
 * ticks on the header line. Expanding reveals the full reasoning text and one
 * row per tool call, retries included, so repeated bash runs stack inside the
 * same block instead of scattering chips through the message. Each tool row
 * carries a muted one-line excerpt of what ran (the fold's tool summary,
 * see toolExcerpt) so the panel shows work even when collapsed rows are
 * glanced at. Finished turns keep the collapsed summary.
 *
 * 📖 Pure render: the data comes from the event fold (agent-chat-events.ts)
 * unchanged; the grouping happens here, at render time. Visual patterns ported
 * from BeautifulUI, https://www.beautifului.dev (MIT): the Thinking expandable
 * trace (shimmer label, chevron, smooth height motion), the Tool Chips summary
 * counter, the Chat inline tool entries (name + outcome rows), and the
 * Loading/working state glyphs, all restyled with kandown tokens and motion
 * presets. The shimmer, pulse and spin are pure CSS or Tailwind animation
 * utilities, so prefers-reduced-motion users get static, calm states.
 *
 * @functions
 *  → ActivityBlock: the single collapsible activity panel of one turn
 *
 * @exports ActivityBlock
 * @see src/lib/agent-chat-events.ts: ChatAssistantEntry, the fold output
 * @see src/components/agent/MessageList.tsx
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconBrain, IconCheck, IconChevronRight, IconTool, IconX } from '@tabler/icons-react';
import { AnimatePresence, motion } from 'motion/react';
import { MOTION } from '../../lib/motion-presets';
import { toolExcerpt } from '../../lib/agent-chat-events';
import type { ChatAssistantEntry, ChatToolEntry } from '../../lib/agent-chat-events';

/** 📖 Outcome tint + glyph of one tool row: running (pulse, neutral), success
 * (emerald check), failure (red cross). The muted mono excerpt next to the
 * name shows WHAT ran (command, edit path) from the fold's summary when the
 * harness sent one; rows without a detail stay name-only. The full summary,
 * untruncated, rides the title attribute. */
function ToolRow({ tool }: { tool: ChatToolEntry }) {
  const excerpt = toolExcerpt(tool);
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px]" title={tool.summary ?? tool.toolName}>
      {tool.ok === true ? (
        <IconCheck size={11} stroke={2.2} className="flex-none text-emerald-500" />
      ) : tool.ok === false ? (
        <IconX size={11} stroke={2.2} className="flex-none text-red-500" />
      ) : (
        <IconTool size={11} stroke={1.8} className="flex-none animate-pulse text-fg-muted" />
      )}
      <span className={`flex-none font-mono font-medium ${tool.ok === false ? 'text-red-600 dark:text-red-400' : 'text-fg-muted'}`}>
        {tool.toolName}
      </span>
      {excerpt !== '' && (
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-fg-faint">{excerpt}</span>
      )}
      {tool.ok === false && (
        <span className="flex-none font-semibold text-red-600 dark:text-red-400">failed</span>
      )}
    </div>
  );
}

interface ActivityBlockProps {
  entry: ChatAssistantEntry;
}

export function ActivityBlock({ entry }: ActivityBlockProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { thinking, thinkingActive, tools } = entry;
  if (thinking.length === 0 && tools.length === 0) return null;

  const runningTools = tools.filter(tool => !tool.finished).length;
  const failedTools = tools.filter(tool => tool.ok === false).length;
  const okTools = tools.length - runningTools - failedTools;
  const thinkingLive = thinkingActive && runningTools === 0;
  const live = thinkingActive || runningTools > 0;

  // 📖 Header summary: the tool counter wins once tools exist (the BeautifulUI
  // Tool Chips pattern); before that, the tail of the reasoning ticks by like
  // a live ticker, fast enough to feel the agent think.
  const ticker = thinking.replace(/\s+/g, ' ').trim().slice(-120);
  const summary = tools.length > 0
    ? (runningTools > 0
        ? t('agentChat.toolsSummaryRunning', '{{total}} tools: {{ok}} ok, {{running}} running', { total: tools.length, ok: okTools, running: runningTools })
        : t('agentChat.toolsSummary', '{{total}} tools: {{ok}} ok, {{failed}} failed', { total: tools.length, ok: okTools, failed: failedTools }))
    : ticker;

  return (
    <div className="mb-1.5 overflow-hidden rounded-[8px] border border-border bg-bg-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11.5px] font-medium text-fg-muted transition-colors hover:text-fg"
        aria-expanded={open}
        aria-label={open ? t('agentChat.activityCollapse', 'Hide thinking and tool calls') : t('agentChat.activityExpand', 'Show thinking and tool calls')}
      >
        {/* Status glyph: shimmer brain while thinking, spinning tool while a
            call runs, settled check when the turn is done. */}
        {live ? (
          thinkingLive ? (
            <IconBrain size={12} stroke={1.8} className="flex-none animate-pulse text-accent" />
          ) : (
            <IconTool size={12} stroke={1.8} className="flex-none animate-spin text-accent" />
          )
        ) : (
          <IconCheck size={12} stroke={2.2} className={`flex-none ${failedTools > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
        )}
        <span className={thinkingLive ? 'thinking-shimmer flex-none' : 'flex-none'}>
          {thinkingLive ? t('agentChat.thinking', 'Thinking') : t('agentChat.activityLabel', 'Activity')}
        </span>
        {thinkingLive && (
          <span className="flex flex-none items-end gap-[2px]" aria-hidden="true">
            {[0, 1, 2].map(delay => (
              <span
                key={delay}
                className="size-[3px] animate-bounce rounded-full bg-fg-muted/70"
                style={{ animationDelay: `${delay * 140}ms` }}
              />
            ))}
          </span>
        )}
        <span className={`min-w-0 flex-1 truncate font-normal ${live ? 'text-fg-faint' : 'text-fg-faint/70'}`}>
          {summary}
        </span>
        {/* BeautifulUI Thinking trace: chevron (rotated, smooth) instead of the
            classic caret, motion preset keeps the duration coherent. */}
        <motion.span {...MOTION.rotate(open)} className="ml-auto inline-flex flex-none">
          <IconChevronRight size={12} stroke={1.8} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div {...MOTION.panel}>
            <div className="border-t border-border">
              {thinking.length > 0 && (
                <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words px-2.5 py-2 text-[12px] leading-relaxed text-fg-muted">
                  {thinking}
                </p>
              )}
              {tools.length > 0 && (
                <div className={`flex flex-col ${thinking.length > 0 ? 'border-t border-border/60' : ''}`}>
                  {tools.map((tool, i) => (
                    <ToolRow key={tool.toolCallId ?? `${tool.toolName}-${i}`} tool={tool} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
