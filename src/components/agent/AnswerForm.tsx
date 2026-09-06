/**
 * @file Answer form for interactive chat skills (t310, options since grill-me v2)
 * @description Panel rendered above the skill buttons when an interactive
 * skill (grill-me) finishes its first turn. Design contract (vava, round 10):
 * the typography matches the chat exactly (13.5px questions and answers, no
 * smaller "form font"), choices are full-width rounded rectangles that all
 * share the same width, each carrying its own subtle tint, the free-text
 * field is clearly contrasted against them, and there are no nested boxes:
 * questions are separated by a single hairline instead of a border inside a
 * border inside a border. Picking a choice fills the field, editing the
 * field deselects the choice. "Send answers" forwards them through
 * sendAnswers (the slice formats a plain follow-up message the skill's
 * fusion step reads), "Skip" closes the form without sending. Enter never
 * submits: the harness turn is expensive and multiline answers are
 * expected, so there is deliberately no keyboard shortcut here.
 *
 * @functions
 *  → CHOICE_TINTS: the per-choice tint rotation
 *  → AnswerForm: per-question tinted choice rows + free text with send / skip
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

/** 📖 Per-choice tint rotation (round 10): each row of a question wears its
 * own subtle background so the eye tells them apart without reading, and
 * the picked one deepens its border. Tailwind arbitrary values resolve the
 * bui tokens through hsl() because the CSS variables are raw HSL triplets. */
const CHOICE_TINTS = [
  'hsl(var(--accent-tint))',
  'hsl(var(--green-tint))',
  'hsl(var(--orange-tint))',
  'hsl(var(--inset))',
];

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
  // 📖 Index of the option row currently backing each answer, null when the
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
    // 📖 No bordered panel: the sidebar edge and a top hairline already frame
    // the form, and nested boxes (border, padding, border, background) are
    // exactly the "double margin" pile-up this design removes. Questions
    // separate from each other with a single hairline instead.
    <div className="mx-3 mb-1 mt-2 flex-none max-h-[60vh] overflow-y-auto">
      <div className="flex items-center gap-1.5 pb-1 text-[11.5px] font-medium tracking-wide text-fg-muted">
        <IconHelp size={12} stroke={1.8} />
        <span>{t('agentSkills.answerFormTitle', 'Answer the questions')}</span>
      </div>
      <div className="flex flex-col">
        {questions.map((question, index) => (
          <div key={`${index}-${question.text}`} className="border-b border-line/70 py-3 last:border-b-0">
            {/* 📖 Full question text at chat size (13.5px), no clamping and no
             * smaller form font: the form is the primary way the user reads
             * what the agent asked. */}
            <p className="text-[13.5px] leading-relaxed text-fg">
              {index + 1}. {question.text}
            </p>
            {question.options.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5" role="group" aria-label={question.text}>
                {question.options.map((option, optionIndex) => {
                  const selected = picked[index] === optionIndex;
                  const tint = CHOICE_TINTS[optionIndex % CHOICE_TINTS.length];
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => pickOption(index, optionIndex, option)}
                      className={`w-full rounded-[8px] border px-2.5 py-1.5 text-left text-[13px] leading-snug transition-colors ${
                        selected
                          ? 'border-accent font-medium text-fg'
                          : 'border-transparent text-fg-muted hover:text-fg'
                      }`}
                      style={{ background: tint }}
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
              className="mt-2 w-full resize-none rounded-[8px] border border-border-strong bg-surface px-2.5 py-2 text-[13.5px] leading-relaxed text-fg shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5 py-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={sending}
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12.5px] text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          {t('agentSkills.skip', 'Skip')}
        </button>
        <button
          type="button"
          onClick={() => onSend(answers)}
          disabled={sending || !hasAnswer}
          className="rounded-md bg-primary px-2.5 py-1 text-[12.5px] font-medium text-primary-foreground transition-transform hover:-translate-y-px disabled:translate-y-0 disabled:opacity-40"
        >
          {t('agentSkills.sendAnswers', 'Send answers')}
        </button>
      </div>
    </div>
  );
}
