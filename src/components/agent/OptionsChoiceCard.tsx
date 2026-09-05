/**
 * @file Choice card for assistant ```options blocks (round 5)
 * @description BeautifulUI 04 Approval Card port ("choices + skip/continue"):
 * when an assistant reply carries an ```options fenced block (one choice per
 * line, parsed by agent-chat-options.ts), the block is NOT rendered as code;
 * every choice becomes a full-width button with hover/press states. Clicking
 * one sends that choice text as the follow-up message (the slice's sendMessage
 * via MessageList), then the card renders as answered: the chosen option
 * highlighted with a check, the others dimmed. The per-block skip button
 * ("Let me type instead") asks the parent to drop the card so the user can
 * answer in plain text. Buttons disable while the turn is still streaming.
 *
 * 📖 Answered state lives in the parent (MessageList's per-entry map keyed by
 * block index), so the card stays presentation-only and pure.
 *
 * @functions
 *  → OptionsChoiceCard: the clickable choices of one ```options block
 *
 * @exports OptionsChoiceCard
 * @see src/lib/agent-chat-options.ts: the parser that feeds it
 * @see src/components/agent/MessageList.tsx: mount point + answered state
 */

import { useTranslation } from 'react-i18next';
import { IconCheck, IconHelp } from '@tabler/icons-react';

interface OptionsChoiceCardProps {
  /** The block's choices, order preserved from the parsed block. */
  choices: string[];
  /** Index of the chosen choice once answered; null while the card is open. */
  answeredIndex: number | null;
  /** Disables every button while the assistant turn is still streaming. */
  disabled: boolean;
  /** Sends the choice text as the follow-up message. */
  onChoose: (choice: string, index: number) => void;
  /** Drops the card: the user wants to type a free-form answer. */
  onSkip: () => void;
}

export function OptionsChoiceCard({ choices, answeredIndex, disabled, onChoose, onSkip }: OptionsChoiceCardProps) {
  const { t } = useTranslation();
  const answered = answeredIndex !== null;
  return (
    <div
      role="group"
      aria-label={t('agentChat.optionsTitle', 'Choose an option')}
      className="mt-2 flex flex-col gap-1"
    >
      {choices.map((choice, index) => {
        const chosen = answeredIndex === index;
        return (
          <button
            key={`${index}-${choice}`}
            type="button"
            disabled={disabled || answered}
            onClick={() => onChoose(choice, index)}
            aria-pressed={chosen}
            className={`flex w-full items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-left text-[12.5px] leading-snug transition-colors ${
              chosen
                ? 'border-accent bg-accent/15 font-medium text-fg'
                : answered
                  ? 'border-border/50 bg-transparent text-fg-faint'
                  : 'border-border bg-bg-1 text-fg hover:border-border-strong hover:bg-bg-2 active:bg-bg-2 disabled:cursor-default disabled:opacity-60'
            }`}
          >
            {chosen && <IconCheck size={12} stroke={2.2} className="flex-none text-emerald-500" />}
            <span className="min-w-0 flex-1 break-words">{choice}</span>
          </button>
        );
      })}
      {!answered && (
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="mt-0.5 inline-flex items-center gap-1 self-start rounded px-1 py-0.5 text-[10.5px] text-fg-faint transition-colors hover:text-fg-muted disabled:opacity-60"
        >
          <IconHelp size={10} stroke={1.8} className="flex-none" />
          {t('agentChat.optionsSkip', 'Let me type instead')}
        </button>
      )}
    </div>
  );
}
