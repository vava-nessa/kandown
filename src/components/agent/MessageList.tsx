/**
 * @file Message list for the agent chat sidebar
 * @description Renders the folded conversation: user bubbles with the
 * BeautifulUI context cards for every @task mention above the bubble,
 * assistant turns as a BeautifulUI-style full-width panel (ONE activity
 * block that updates in place while the turn streams, then the Markdown
 * answer below it), error entries in the destructive tint, the quiet
 * "edited ..." line for files the agent touched during the turn, and the
 * official BeautifulUI 01 pixel-grid loader (Drive variant, shimmer label +
 * elapsed timer) for the gap between the user's send and the first
 * renderable event of the turn.
 *
 * 📖 Interactive answer surfaces (round 5, ported from BeautifulUI,
 * https://www.beautifului.dev, MIT; round 7 switches them to the shared
 * bui/ components): an ```options fenced block renders as the 04 Approval
 * Card (single radio question; a pick auto-answers and the chosen text is
 * sent as a follow-up through the slice's sendMessage; Skip is "let me type
 * instead"). A `PROPOSE:` line becomes the 09 Recommendation Card with
 * Accept (sends "Approved: <action>") and Dismiss. A settled turn gets the
 * 03-style follow-up rows. All of that state is per-entry component-local
 * (block index keyed); the fold itself stays untouched: the parsers run at
 * render time on the raw entry text, and the stripped text is what reaches
 * the markdown renderer.
 *
 * 📖 Task references are linkified into chips that open the task via the
 * canonical openDrawer action, and the `[show: tXXX]` directive is stripped
 * from what the user sees. Panel layout, streaming and activity patterns are
 * ported from BeautifulUI in kandown tokens.
 *
 * @functions
 *  → WorkingLoader: official BeautifulUI 01 loading state (Drive grid +
 *    shimmer label + elapsed timer) shown while waiting for the turn
 *  → UserMessage: bubble + @mention context cards
 *  → AssistantMessage: activity block, markdown, choice/proposal cards,
 *    follow-up rows
 *  → MessageList: the full conversation, with empty state
 *
 * @exports MessageList
 * @see src/components/agent/ChatSidebar.tsx
 * @see src/components/agent/ActivityBlock.tsx
 * @see src/lib/agent-chat-options.ts: options + PROPOSE parsing
 * @see src/lib/agent-chat-events.ts: the fold that produces these entries
 * @see src/lib/task-links.ts: directive stripping + reference linkifying
 */

import { useCallback, useMemo, useState } from 'react';
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
import LoadingState from '../bui/LoadingState';

interface MessageListProps {
  messages: ChatEntry[];
  changedFiles: string[];
  preContextTaskId: string | null;
  /** True while the turn has started (or the send is in flight) but nothing
   * renderable has arrived yet: shows the BeautifulUI loading grid. */
  waiting?: boolean;
}

/** 📖 Official BeautifulUI 01 Loading State (Drive variant): pixel-grid wave,
 * shimmering label and its own elapsed timer. Shown between the user's send
 * and the first renderable event of the turn; unmounts as soon as output
 * lands, which also stops the timer. */
function WorkingLoader() {
  const { t } = useTranslation();
  return (
    <div className="px-1 py-1.5">
      <LoadingState variant="Drive" label={t('agentChat.working', 'Working...')} />
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
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[10px] bg-inset px-2.5 py-1.5 text-[13.5px] leading-relaxed text-ink shadow-[inset_0_0_0_1px_var(--line)]">
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
    // 📖 Assistant turn: plain full-width content on the page background,
    // like the BeautifulUI chat page. No panel box around the whole turn:
    // the activity blocks and answer cards carry their own shapes, and the
    // Markdown answer reads as text, not as a card in a card.
    <div className="w-full min-w-0">
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
    <div className="flex flex-col gap-3 px-3 py-3">
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
          tools): the official BeautifulUI loading grid sits where the answer
          will land. */}
      {waiting && <WorkingLoader />}
    </div>
  );
}
