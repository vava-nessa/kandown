/**
 * @file Answer form for interactive chat skills (t310)
 * @description Compact panel rendered above the skill buttons when an
 * interactive skill (grill-me) finishes its first turn: one small textarea per
 * parsed question, "Send answers" forwards them through sendAnswers (the slice
 * formats a plain follow-up message the skill's fusion step reads), "Skip"
 * closes the form without sending. Enter never submits: the harness turn is
 * expensive and multiline answers are expected, so there is deliberately no
 * keyboard shortcut here.
 *
 * @functions
 *  → AnswerForm: per-question textareas with send / skip controls
 *
 * @exports AnswerForm
 * @see src/lib/store/agentChatSlice.ts: answersRequested + sendAnswers
 * @see src/components/agent/ChatSidebar.tsx: mount point
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconHelp } from '@tabler/icons-react';

interface AnswerFormProps {
  /** Questions parsed from the interactive first turn, index-aligned. */
  questions: string[];
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

  // 📖 The panel mounts once per question batch (unmounts on send/skip), but a
  // different interactive turn could re-open it with new questions: realign
  // the buffer whenever the question list changes shape.
  useEffect(() => {
    setAnswers(questions.map((_, i) => answers[i] ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  const hasAnswer = answers.some(answer => answer.trim().length > 0);

  const updateAnswer = (index: number, value: string) => {
    setAnswers(current => current.map((answer, i) => (i === index ? value : answer)));
  };

  return (
    <div className="mx-2.5 mb-1 mt-2 flex-none rounded-[10px] border border-border bg-bg-1 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-fg-muted">
        <IconHelp size={12} stroke={1.8} />
        <span>{t('agentSkills.answerFormTitle', 'Answer the questions')}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {questions.map((question, index) => (
          <div key={`${index}-${question}`}>
            {/* 📖 The question text itself comes from the harness turn, the
             * label keeps screen readers oriented inside the form. */}
            <label className="block">
              <span className="sr-only">{t('agentSkills.answerPlaceholder', 'Your answer...')}</span>
              <p className="mb-0.5 line-clamp-2 text-[11.5px] leading-snug text-fg">
                {index + 1}. {question}
              </p>
              <textarea
                rows={2}
                value={answers[index] ?? ''}
                onChange={e => updateAnswer(index, e.target.value)}
                placeholder={t('agentSkills.answerPlaceholder', 'Your answer...')}
                className="w-full resize-none rounded-[8px] border border-border bg-bg px-2 py-1.5 text-[12.5px] leading-snug text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-border-focus"
              />
            </label>
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
