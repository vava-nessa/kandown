/**
 * @file Agent chat skill helpers (t310)
 * @description Pure parsing/formatting for the interactive skill flow in the
 *  agent chat sidebar: when an interactive skill (grill-me) runs, the daemon's
 *  first assistant turn contains numbered questions (optionally each followed
 *  by short candidate-answer bullets), the sidebar extracts them to render an
 *  answer form, and the answers are formatted back into a plain follow-up
 *  message the skill's second step can fuse. No DOM, no store, no imports:
 *  everything here is unit-testable in isolation.
 *
 * @functions
 *  → parseSkillQuestions: extracts "N. question" lines plus their "- option"
 *    candidate answers from a turn
 *  → parseNumberedQuestions: question texts only, the pre-options shape
 *  → formatAnswers: renders questions + answers as a readable chat message
 *
 * @exports parseSkillQuestions, parseNumberedQuestions, formatAnswers,
 *          ChatSkillQuestion, MAX_QUESTIONS
 * @see src/lib/store/agentChatSlice.ts: the state machine that calls these
 * @see src/components/agent/AnswerForm.tsx: the form the questions feed
 */

/** 📖 Upper bound on extracted questions. Interactive skills are interviewed
 *  one turn at a time; a runaway list must never blow up the answer form. */
export const MAX_QUESTIONS = 8;

/** 📖 Upper bound on candidate answers kept per question: the grill-me
 *  contract asks for two or three, so anything beyond that is list noise
 *  (the question happened to sit above an unrelated bullet list). */
const MAX_OPTIONS = 4;

/** 📖 One parsed question: the question text plus its optional short
 *  candidate answers (empty array when the agent offered none, which keeps
 *  every pre-options skill working unchanged). */
export interface ChatSkillQuestion {
  text: string;
  options: string[];
}

/**
 * 📖 Extracts numbered question lines from an assistant turn, plus the
 * candidate answers bulleted directly under each question. A question line
 * starts with a single digit 1..9 followed by one of the accepted separators:
 * "N. ", "N)" or "N -" (tolerant to the formats models actually emit).
 *
 * 📖 Option lines: immediately after a question, "- " or "* " bullets are
 * collected as that question's candidate answers (trimmed, deduplicated,
 * capped at {@link MAX_OPTIONS}). The bullet block ends at the next numbered
 * question or at any other non-empty line, so prose never leaks in as
 * options. A blank line is tolerated inside the block because models emit
 * them freely between a question and its bullets.
 *
 * 📖 The question text is trimmed, duplicates removed (first occurrence
 * wins), at most {@link MAX_QUESTIONS} kept in order of appearance. Lines
 * numbered 10 or higher do not match (N is a single digit) so list
 * continuations and code samples rarely leak in. Returns an empty array when
 * nothing matches.
 */
export function parseSkillQuestions(text: string): ChatSkillQuestion[] {
  const linePattern = /^\s*([1-9])\s*(?:\.|\)|-)\s+(.+)$/;
  const optionPattern = /^\s*[-*]\s+(.+)$/;
  const seen = new Set<string>();
  const questions: ChatSkillQuestion[] = [];

  let current: ChatSkillQuestion | null = null;
  for (const line of text.split('\n')) {
    const questionMatch = linePattern.exec(line);
    if (questionMatch) {
      // 📖 A new question line closes the previous block. The cap is checked
      // AFTER the flush so the eighth question keeps its own option bullets;
      // the break then drops everything from the ninth on.
      if (current) current = flush(current, questions);
      if (questions.length >= MAX_QUESTIONS) break;
      const question = questionMatch[2].trim();
      if (!question || seen.has(question)) continue;
      seen.add(question);
      current = { text: question, options: [] };
      continue;
    }
    const optionMatch = current ? optionPattern.exec(line) : null;
    if (optionMatch) {
      const option = optionMatch[1].trim();
      // 📖 The cap stops collection, not the block: further bullets are
      // ignored until the next question or prose line ends it anyway.
      if (option && !current!.options.includes(option) && current!.options.length < MAX_OPTIONS) {
        current!.options.push(option);
      }
      continue;
    }
    // 📖 Any other non-empty line ends the option block: prose after the
    // bullets belongs to the turn, not to the question.
    if (line.trim() !== '' && current) current = flush(current, questions);
  }
  if (current) questions.push(current);
  return questions;
}

/** 📖 Moves a pending question into the result list. Null-safe so the cap
 *  paths can call it unconditionally. */
function flush(question: ChatSkillQuestion | null, out: ChatSkillQuestion[]): ChatSkillQuestion | null {
  if (question) out.push(question);
  return null;
}

/**
 * 📖 Question texts only: the shape the answer form used before candidate
 * answers existed, kept as a thin wrapper so existing callers (and the
 * fusion-message numbering) stay stable.
 */
export function parseNumberedQuestions(text: string): string[] {
  return parseSkillQuestions(text).map(question => question.text);
}

/**
 * 📖 Formats the user's answers into a follow-up chat message the skill's
 * fusion step can read. Keeps the original 1-based numbering (aligned with the
 * questions the assistant asked, so a skipped answer does not shift the ones
 * after it) and skips empty answers entirely. When no question text is
 * available (the parse found none and nothing was captured), the answers are
 * still sent as a numbered "Answers" list.
 */
export function formatAnswers(questions: string[], answers: string[]): string {
  const lines: string[] = ['Answers:'];
  answers.forEach((raw, index) => {
    const answer = raw.trim();
    if (!answer) return;
    const question = questions[index]?.trim();
    lines.push('', question ? `${index + 1}. ${question}` : `${index + 1}. Answer:`);
    lines.push(answer);
  });
  return lines.join('\n');
}
