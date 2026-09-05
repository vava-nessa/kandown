/**
 * @file Answer form for interactive chat skills (t310, options since grill-me v2)
 * @description Compact panel rendered above the skill buttons when an
 * interactive skill (grill-me) finishes its first turn. Each parsed question
 * shows IN FULL (never clamped: a question the user cannot read entirely
 * cannot be answered), followed by the candidate answers the agent proposed
 * as single-select chips, plus a free-text field that stays available all the
 * time: picking a chip fills the field, editing the field deselects the chip.
 * "Send answers" forwards them through sendAnswers (the slice formats a plain
 * follow-up message the skill's fusion step reads), "Skip" closes the form
 * without sending. Enter never submits: the harness turn is expensive and
 * multiline answers are expected, so there is deliberately no keyboard
 * shortcut here.
 *
 * @functions
 *  → AnswerForm: per-question option chips + free text with send / skip
 *
 * @exports AnswerForm
 * @see src/lib/store/agentChatSlice.ts: answersRequested + sendAnswers
 * @see src/lib/agent-chat-skills.ts: the parser that produces the questions
 * @see src/components/agent/ChatSidebar.tsx: mount point
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconHelp } from '@tabler/icons-react';
import type { ChatSkillQuestion } from '../../lib/agent-chat-skills';

interface AnswerFormProps {
  /** Questions parsed from the interactive first turn, index-aligned. */
  questions: ChatSkillQuestion[];
  /** Disables the send button while the slice is delivering a message. */
  sending: boolean;
  /** Sends the (possibly partial) answers as the fusion follow-up. */
  onSend: (answers: string[]) => void;
  /** Closes the form without sending anything. */
  onSkip: () => void;
}

export function AnswerForm({ questions, sending, onSend, onSkip }: AnswerFormProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  // 📖 Index of the option chip currently backing each answer, null when the
  // answer is free text (or empty): purely visual, the answer string is the
  // single truth the send path reads.
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));

  // 📖 The panel mounts once per question batch (unmounts on send/skip), but a
  // different interactive turn could re-open it with new questions: realign
  // both buffers whenever the question list changes shape.
  useEffect(() => {
    setAnswers(current => questions.map((_, i) => current[i] ?? ''));
    setPicked(current => questions.map((_, i) => current[i] ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  const hasAnswer = answers.some(answer => answer.trim().length > 0);

  const updateAnswer = (index: number, value: string) => {
    setAnswers(current => current.map((answer, i) => (i === index ? value : answer)));
    // 📖 Editing the text by hand means the chip is no longer the answer, even
    // when the edit starts from the chip's wording.
    setPicked(current => current.map((pick, i) => (i === index ? null : pick)));
  };

  const pickOption = (index: number, optionIndex: number, optionText: string) => {
    setPicked(current => current.map((pick, i) => (i === index ? optionIndex : pick)));
    setAnswers(current => current.map((answer, i) => (i === index ? optionText : answer)));
  };

  return (
    <div className="mx-2.5 mb-1 mt-2 flex-none max-h-[60vh] overflow-y-auto rounded-[10px] border border-border bg-bg-1 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-fg-muted">
        <IconHelp size={12} stroke={1.8} />
        <span>{t('agentSkills.answerFormTitle', 'Answer the questions')}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {questions.map((question, index) => (
          <div key={`${index}-${question.text}`}>
            {/* 📖 Full question text, no clamping: the form is the primary way
             * the user reads what the agent asked, a truncated question forces
             * guessing. */}
            <label className="block">
              <span className="sr-only">{t('agentSkills.answerPlaceholder', 'Your answer...')}</span>
              <p className="mb-1 text-[11.5px] leading-snug text-fg">
                {index + 1}. {question.text}
              </p>
            </label>
            {question.options.length > 0 && (
              <div className="mb-1 flex flex-wrap gap-1" role="group" aria-label={question.text}>
                {question.options.map((option, optionIndex) => {
                  const selected = picked[index] === optionIndex;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => pickOption(index, optionIndex, option)}
                      className={`max-w-full rounded-full border px-2 py-0.5 text-left text-[11px] leading-snug transition-colors ${
                        selected
                          ? 'border-accent bg-accent/15 font-medium text-fg'
                          : 'border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}
            <textarea
              rows={question.options.length > 0 ? 1 : 2}
              value={answers[index] ?? ''}
              onChange={e => updateAnswer(index, e.target.value)}
              placeholder={t('agentSkills.answerPlaceholder', 'Your answer...')}
              className="w-full resize-none rounded-[8px] border border-border bg-bg px-2 py-1.5 text-[12.5px] leading-snug text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-border-focus"
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onSkip}
          disabled={sending}
          className="rounded-md border border-border bg-bg px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          {t('agentSkills.skip', 'Skip')}
        </button>
        <button
          type="button"
          onClick={() => onSend(answers)}
          disabled={sending || !hasAnswer}
          className="rounded-md bg-primary px-2 py-1 text-[11.5px] font-medium text-primary-foreground transition-transform hover:-translate-y-px disabled:translate-y-0 disabled:opacity-40"
        >
          {t('agentSkills.sendAnswers', 'Send answers')}
        </button>
      </div>
    </div>
  );
}
