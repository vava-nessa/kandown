/**
 * @file Choice card for assistant ```options blocks (round 5, round 7 renderer)
 * @description BeautifulUI 04 Approval Card, shared bui/ edition: when an
 * assistant reply carries an ```options fenced block (one choice per line,
 * parsed by agent-chat-options.ts), the block is NOT rendered as code; it
 * becomes the official bui ApprovalCard with one radio question. Picking an
 * option fills the radio, auto-answers (the card's own 480ms advance) and
 * then `onChoose` sends that choice text as the follow-up message (the
 * slice's sendMessage via MessageList); the card then renders answered
 * (chosen radio filled, others dimmed). The footer's quiet Skip ("Let me
 * type instead") hands the dismissal to the parent. Everything freezes while
 * the turn is still streaming.
 *
 * 📖 Answered state lives in the parent (MessageList's per-entry map keyed by
 * block index), so the card stays presentation-only. The parent only swaps
 * to the answered rendering on `onChoose`, which fires from the card's
 * submit: unmounting earlier would cancel the card's auto-advance timer and
 * lose the send.
 *
 * @functions
 *  → OptionsChoiceCard: the bui ApprovalCard rendering of one ```options block
 *
 * @exports OptionsChoiceCard
 * @see src/components/bui/ApprovalCard.tsx: the adapted official component
 * @see src/lib/agent-chat-options.ts: the parser that feeds it
 * @see src/components/agent/MessageList.tsx: mount point + answered state
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ApprovalCard, { type ApprovalQuestion } from '../bui/ApprovalCard';

interface OptionsChoiceCardProps {
  /** The block's choices, order preserved from the parsed block. */
  choices: string[];
  /** Index of the chosen choice once answered; null while the card is open. */
  answeredIndex: number | null;
  /** Disables every control while the assistant turn is still streaming. */
  disabled: boolean;
  /** Sends the choice text as the follow-up message (fires once, on submit). */
  onChoose: (choice: string, index: number) => void;
  /** Drops the card: the user wants to type a free-form answer. */
  onSkip: () => void;
}

export function OptionsChoiceCard({ choices, answeredIndex, disabled, onChoose, onSkip }: OptionsChoiceCardProps) {
  const { t } = useTranslation();

  // 📖 One radio question titled by the message context: the generic
  // "Choose an option" heading, the parsed choices as the radio rows.
  const questions = useMemo<ApprovalQuestion[]>(() => ([
    {
      q: t('agentChat.optionsTitle', 'Choose an option'),
      type: 'radio',
      options: choices,
    },
  ]), [choices, t]);

  return (
    <div className="mt-2">
      <ApprovalCard
        questions={questions}
        disabled={disabled}
        dismissible={false}
        custom={false}
        resettable={false}
        answeredIndex={answeredIndex}
        onSkip={onSkip}
        labels={{
          skip: t('agentChat.optionsSkip', 'Let me type instead'),
          send: t('agentChat.send', 'Send'),
        }}
        onSubmitted={answers => {
          const picked = answers[0]?.[0];
          if (picked === undefined) return;
          const choice = choices[picked];
          if (choice !== undefined) onChoose(choice, picked);
        }}
      />
    </div>
  );
}
