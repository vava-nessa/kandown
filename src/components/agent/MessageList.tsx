/**
 * @file Message list for the agent chat sidebar
 * @description Renders the folded conversation: user bubbles (plain text,
 * with BeautifulUI-10-style context cards for every @task mention above the
 * bubble), assistant turns as a BeautifulUI-style full-width panel (ONE
 * collapsible activity block that updates in place while the turn streams,
 * then the Markdown answer below it), error entries in the destructive tint,
 * the quiet "edited ..." line for files the agent touched during the turn,
 * and the BeautifulUI-01 pixel-grid loader (shimmer label + elapsed seconds,
 * capped at 99s) for the gap between the user's send and the first
 * renderable event of the turn.
 *
 * 📖 Interactive answer surfaces (round 5, ported from BeautifulUI,
 * https://www.beautifului.dev, MIT): an ```options fenced block in an
 * assistant reply never renders as code; it becomes a 04-Approval-Card-style
 * choice card whose buttons send the chosen text as a follow-up through the
 * slice's sendMessage, then render answered (chosen highlighted, others
 * dimmed). A `PROPOSE:` line becomes a 09-Recommendation-Card with
 * Accept (sends "Approved: <action>") and Dismiss. A settled turn gets
 * 03-style follow-up suggestion chips. All of that state is per-entry
 * component-local (block index keyed); the fold itself stays untouched: the
 * parsers run at render time on the raw entry text, and the stripped text is
 * what reaches the markdown renderer.
 *
 * 📖 Task references are linkified into chips that open the task via the
 * canonical openDrawer action, and the `[show: tXXX]` directive is stripped
 * from what the user sees. Panel layout, streaming and activity patterns are
 * ported from BeautifulUI in kandown tokens.
 *
 * @functions
 *  → PixelGridLoader: BeautifulUI-01 loading state (pixel grid + shimmer +
 *    elapsed seconds counter, display capped at 99s)
 *  → UserMessage: bubble + @mention context cards
 *  → AssistantMessage: activity block, markdown, choice/proposal cards,
 *    suggestion chips
 *  → MessageList: the full conversation, with empty state
 *
 * @exports MessageList
 * @see src/components/agent/ChatSidebar.tsx
 * @see src/components/agent/ActivityBlock.tsx
 * @see src/lib/agent-chat-options.ts: options + PROPOSE parsing
 * @see src/lib/agent-chat-events.ts: the fold that produces these entries
 * @see src/lib/task-links.ts: directive stripping + reference linkifying
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import { linkifyTaskReferences, stripShowDirectives } from '../../lib/task-links';
import {
  extractOptionsBlocks,
  extractProposals,
  stripOptionsBlocks,
  stripProposals,
} from '../../lib/agent-chat-options';
import type { ChatAssistantEntry, ChatEntry, ChatUserEntry } from '../../lib/agent-chat-events';
import { StreamingText } from './StreamingText';
import { ActivityBlock } from './ActivityBlock';
import { OptionsChoiceCard } from './OptionsChoiceCard';
import { RecommendationCard } from './RecommendationCard';
import { SuggestionChips } from './SuggestionChips';
import { ContextCards } from './ContextCards';

interface MessageListProps {
  messages: ChatEntry[];
  changedFiles: string[];
  preContextTaskId: string | null;
  /** True while the turn has started (or the send is in flight) but nothing
   * renderable has arrived yet: shows the pixel-grid loader. */
  waiting?: boolean;
}

/** 📖 BeautifulUI 01 Loading State port: a 3x3 grid of tiny pixel cells
 * lighting up in a diagonal sweep (pure CSS keyframes in globals.css, frozen
 * for prefers-reduced-motion users), the shimmer "Working..." label, and an
 * elapsed-seconds counter that stops counting at 99s so an hour-long stall
 * never grows an unbounded label. Shown between the user's send and the
 * first renderable event of the turn. */
function PixelGridLoader() {
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(0);
  // 📖 The interval re-arms every tick until the cap: reads back as "stop
  // counting at 99s" without an unbounded timer.
  useEffect(() => {
    if (seconds >= 99) return;
    const timer = window.setInterval(() => {
      setSeconds(current => Math.min(current + 1, 99));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);
  return (
    <div className="flex items-center gap-2 px-1 py-1.5" role="status">
      <span className="grid flex-none grid-cols-3 gap-[2.5px]" aria-hidden="true">
        {Array.from({ length: 9 }, (_, cell) => (
          <span
            key={cell}
            className="agent-pixel-cell size-[4px] rounded-[1px] bg-fg-muted"
            style={{ animationDelay: `${(((cell % 3) + Math.floor(cell / 3)) % 5) * 130}ms` }}
          />
        ))}
      </span>
      <span className="thinking-shimmer text-[11.5px] font-medium">{t('agentChat.working', 'Working...')}</span>
      <span className="flex-none font-mono text-[10.5px] tabular-nums text-fg-faint">{seconds}s</span>
    </div>
  );
}

/** 📖 One user message: the @mention context cards sit above the bubble,
 * right-aligned like it. The visible text keeps its @markers (the ids travel
 * as structured data at send time; here they are re-derived from the text,
 * which the fold preserves verbatim). */
function UserMessage({ entry, onOpenTask }: { entry: ChatUserEntry; onOpenTask: (taskId: string) => void }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <ContextCards text={entry.text} onOpenTask={onOpenTask} />
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[8px] bg-accent/15 px-2.5 py-1.5 text-[13.5px] leading-relaxed text-fg">
        {entry.text}
      </div>
    </div>
  );
}

/** 📖 One assistant turn: the single activity block, the markdown answer
 * (with options blocks and PROPOSE lines stripped out of it), then the
 * interactive answer surfaces. Every per-block state lives here, keyed by
 * block index, and dies with the entry's unmount (a reopened sidebar shows
 * open cards again, which is the honest state: the harness transcript never
 * recorded the click). */
function AssistantMessage({ entry, onOpenTask, onFollowUp }: {
  entry: ChatAssistantEntry;
  onOpenTask: (taskId: string) => void;
  onFollowUp: (text: string) => void;
}) {
  // 📖 block index -> chosen choice index. Keyed by index, not choice text,
  // so two identical choices in one block stay distinguishable.
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [skippedBlocks, setSkippedBlocks] = useState<Record<number, true>>({});
  // 📖 proposal index -> how it was resolved (both resolutions drop the
  // card; the accepted one is visible as the "Approved: ..." user bubble).
  const [resolvedProposals, setResolvedProposals] = useState<Record<number, 'accepted' | 'dismissed'>>({});
  const [suggestionsUsed, setSuggestionsUsed] = useState(false);

  // 📖 Parse the RAW entry text, then strip what became interactive from the
  // displayed markdown. During streaming the memo recomputes per delta, which
  // is exactly what makes the choice card form live under the caret.
  const blocks = useMemo(() => extractOptionsBlocks(entry.text), [entry.text]);
  const proposals = useMemo(() => extractProposals(entry.text), [entry.text]);
  const displayText = useMemo(() => {
    let text = stripShowDirectives(entry.text);
    text = stripOptionsBlocks(text);
    text = stripProposals(text);
    return linkifyTaskReferences(text);
  }, [entry.text]);

  const streaming = entry.streaming;

  const handleChoose = useCallback((blockIndex: number, choice: string, choiceIndex: number) => {
    if (streaming) return;
    setAnswers(previous => {
      if (previous[blockIndex] !== undefined) return previous;
      return { ...previous, [blockIndex]: choiceIndex };
    });
    onFollowUp(choice);
  }, [streaming, onFollowUp]);

  const handleAcceptProposal = useCallback((proposalIndex: number, action: string) => {
    if (streaming) return;
    setResolvedProposals(previous => {
      if (previous[proposalIndex] !== undefined) return previous;
      return { ...previous, [proposalIndex]: 'accepted' };
    });
    onFollowUp(`Approved: ${action}`);
  }, [streaming, onFollowUp]);

  const hasText = displayText.trim() !== '';

  return (
    // 📖 Assistant turn: one full-width subtle panel (BeautifulUI chat
    // message shape). The single activity block renders thinking and
    // tools; the Markdown answer streams below it.
    <div className="w-full rounded-[10px] border border-border/70 bg-bg-1/60 px-2.5 py-2">
      <ActivityBlock entry={entry} />
      {hasText && (
        <StreamingText text={displayText} streaming={streaming} markdown onOpenTask={onOpenTask} />
      )}
      {blocks.map((block, blockIndex) => {
        if (block.choices.length === 0 || skippedBlocks[blockIndex]) return null;
        return (
          <OptionsChoiceCard
            key={`options-${blockIndex}`}
            choices={block.choices}
            answeredIndex={answers[blockIndex] ?? null}
            disabled={streaming}
            onChoose={(choice, choiceIndex) => handleChoose(blockIndex, choice, choiceIndex)}
            onSkip={() => setSkippedBlocks(previous => ({ ...previous, [blockIndex]: true }))}
          />
        );
      })}
      {proposals.map((proposal, proposalIndex) => {
        if (resolvedProposals[proposalIndex] !== undefined) return null;
        return (
          <RecommendationCard
            key={`proposal-${proposalIndex}`}
            action={proposal.action}
            disabled={streaming}
            onAccept={() => handleAcceptProposal(proposalIndex, proposal.action)}
            onDismiss={() => setResolvedProposals(previous => ({ ...previous, [proposalIndex]: 'dismissed' }))}
          />
        );
      })}
      {/* 📖 BeautifulUI 03 follow-ups: only on a settled, non-empty turn,
          and gone for good once one chip was picked (the answer is on its
          way; stale suggestions would just lure a duplicate send). */}
      {!streaming && hasText && !suggestionsUsed && blocks.length === 0 && proposals.length === 0 && (
        <SuggestionChips onPick={text => {
          setSuggestionsUsed(true);
          onFollowUp(text);
        }} />
      )}
    </div>
  );
}

export function MessageList({ messages, changedFiles, preContextTaskId, waiting = false }: MessageListProps) {
  const { t } = useTranslation();
  // 📖 Task chips open the task through the same path the board uses: the
  // drawer slice reads the file, the workspace/editor renders it (mobile gets
  // the Drawer, desktop the TaskWorkspace editor).
  const openDrawer = useStore(s => s.openDrawer);
  // 📖 Choice cards, proposal cards and suggestion chips all answer through
  // the slice's sendMessage: a session always exists by the time an
  // assistant entry is on screen, and the slice guards the impossible case
  // (no active session) as a no-op.
  const sendMessage = useStore(s => s.sendMessage);
  const handleOpenTask = useCallback((taskId: string) => {
    void openDrawer(taskId, { replace: true });
  }, [openDrawer]);
  const handleFollowUp = useCallback((text: string) => {
    void sendMessage(text);
  }, [sendMessage]);

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
    // 📖 BeautifulUI 07 chat page rhythm: a hair more air between turns than
    // between the elements inside one turn.
    <div className="flex flex-col gap-3.5 px-3.5 py-4">
      {messages.map(entry => {
        if (entry.kind === 'user') {
          return <UserMessage key={entry.id} entry={entry} onOpenTask={handleOpenTask} />;
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
        // 📖 A streaming entry that is still completely empty (no text, no
        // thinking, no tools) is skipped: its panel would be an empty bordered
        // shell, and the working dots below stand in until output lands.
        if (entry.streaming && entry.text.length === 0 && entry.thinking.length === 0 && entry.tools.length === 0) {
          return null;
        }
        return (
          <AssistantMessage key={entry.id} entry={entry} onOpenTask={handleOpenTask} onFollowUp={handleFollowUp} />
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
      {/* 📖 Turn started but nothing renderable yet (no text, no thinking, no
          tools): the pixel-grid loader sits where the answer will land. */}
      {waiting && <PixelGridLoader />}
    </div>
  );
}
