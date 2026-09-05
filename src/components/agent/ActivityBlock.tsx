/**
 * @file One collapsible activity block per assistant turn
 * @description Replaces the pile of interleaved thinking blocks and tool chips
 * the chat used to render: every assistant turn gets a SINGLE panel that
 * updates in place while the turn streams. The collapsed header carries a live
 * status glyph and summary (shimmering "Thinking" while the reasoning channel
 * is active, a spinning tool glyph plus a "3 tools: 2 ok, 1 failed" counter
 * once tools run, a check once the turn settles); the latest thinking fragment
 * ticks on the header line. Expanding reveals the BeautifulUI 02 Thinking
 * reasoning-trace look: a dot-line timeline (one status dot per step, all
 * threaded on a vertical line) where the thinking text is the trace in muted
 * mono and each tool call is a 05/06-style row (status dot, mono name, one
 * line excerpt of what ran, a reserved duration slot), retries included, so
 * repeated bash runs stack inside the same block instead of scattering chips
 * through the message. Finished turns keep the collapsed summary.
 *
 * 📖 Pure render: the data comes from the event fold (agent-chat-events.ts)
 * unchanged; the grouping happens here, at render time. Visual patterns
 * ported from BeautifulUI, https://www.beautifului.dev (MIT): the Thinking
 * expandable trace (shimmer label, chevron, smooth height motion), the Tool
 * Chips summary counter, the Task Rows live status look, and the
 * Loading/working state glyphs, all restyled with kandown tokens and motion
 * presets. The shimmer, pulse and spin are pure CSS or Tailwind animation
 * utilities, so prefers-reduced-motion users get static, calm states.
 *
 * @functions
 *  → ToolRow: one 05/06-style tool step of the trace (name, excerpt,
 *    duration placeholder; the status dot lives on the timeline)
 *  → ActivityBlock: the single collapsible activity panel of one turn
 *
 * @exports ActivityBlock
 * @see src/lib/agent-chat-events.ts: ChatAssistantEntry, the fold output
 * @see src/components/agent/MessageList.tsx
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconBrain, IconCheck, IconChevronRight, IconTool } from '@tabler/icons-react';
import { AnimatePresence, motion } from 'motion/react';
import { MOTION } from '../../lib/motion-presets';
import { toolExcerpt } from '../../lib/agent-chat-events';
import type { ChatAssistantEntry, ChatToolEntry } from '../../lib/agent-chat-events';

/** 📖 One tool step of the reasoning trace: mono name, muted one-line excerpt
 * of WHAT ran (the fold's tool summary, see toolExcerpt; the full summary,
 * untruncated, rides the title attribute) and the reserved duration slot on
 * the right (the fold carries no timings yet: a hairline placeholder keeps
 * the 06 Task Rows geometry honest, pulsing while the call runs). The status
 * dot lives on the timeline, so the row itself stays text. */
function ToolRow({ tool }: { tool: ChatToolEntry }) {
  const { t } = useTranslation();
  const excerpt = toolExcerpt(tool);
  return (
    <div className="flex min-w-0 items-center gap-1.5 py-0.5 text-[11px]" title={tool.summary ?? tool.toolName}>
      <span className={`flex-none font-mono font-medium ${tool.ok === false ? 'text-red-600 dark:text-red-400' : 'text-fg-muted'}`}>
        {tool.toolName}
      </span>
      {excerpt !== '' && (
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-fg-faint">{excerpt}</span>
      )}
      {tool.ok === false && (
        <span className="flex-none font-semibold text-red-600 dark:text-red-400">failed</span>
      )}
      {/* 📖 Duration placeholder: a reserved right-aligned slot (hairline,
       * pulsing while the call runs) so finished and running rows share the
       * same geometry once real timings land. */}
      <span
        className="ml-auto flex-none"
        title={t('agentChat.toolDurationTitle', 'Duration')}
        aria-hidden="true"
      >
        <span className={`block h-px w-5 rounded ${tool.finished ? 'bg-border/80' : 'animate-pulse bg-border-strong'}`} />
      </span>
    </div>
  );
}

/** 📖 Timeline dot tint of one step: live steps pulse in the accent tint,
 * settled tools take their outcome color, thinking history goes quiet. */
function stepDotClass(tool: ChatToolEntry | null, thinkingLive: boolean): string {
  if (tool === null) return thinkingLive ? 'animate-pulse bg-accent' : 'bg-fg-faint/50';
  if (!tool.finished) return 'animate-pulse bg-accent';
  return tool.ok === false ? 'bg-red-500' : 'bg-emerald-500';
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
            <div className="border-t border-border px-2.5 py-2">
              {/* 📖 BeautifulUI 02 Thinking, expanded: a dot-line timeline.
               * One vertical hairline threads every step; each step carries a
               * status dot centered on the line (pulsing accent while live,
               * emerald/red outcome once settled). The reasoning text is the
               * trace: muted mono, softly capped in height. */}
              <div className="relative flex flex-col gap-2 pl-4">
                <span aria-hidden="true" className="absolute bottom-1.5 left-[3.5px] top-1.5 w-px bg-border/70" />
                {thinking.length > 0 && (
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-4 top-[5px] size-2 rounded-full ${stepDotClass(null, thinkingLive)}`}
                    />
                    <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-fg-muted">
                      {thinking}
                    </p>
                  </div>
                )}
                {tools.map((tool, i) => (
                  <div key={tool.toolCallId ?? `${tool.toolName}-${i}`} className="relative">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-4 top-[3px] size-2 rounded-full ${stepDotClass(tool, thinkingLive)}`}
                    />
                    <ToolRow tool={tool} />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
