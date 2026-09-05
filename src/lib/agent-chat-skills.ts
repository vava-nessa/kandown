/**
 * @file Agent chat skill helpers (t310)
 * @description Pure parsing/formatting for the interactive skill flow in the
 *  agent chat sidebar: when an interactive skill (grill-me) runs, the daemon's
 *  first assistant turn contains numbered questions, the sidebar extracts them
 *  to render an answer form, and the answers are formatted back into a plain
 *  follow-up message the skill's second step can fuse. No DOM, no store, no
 *  imports: everything here is unit-testable in isolation.
 *
 * @functions
 *  → parseNumberedQuestions: extracts "N. question" lines from a turn
 *  → formatAnswers: renders questions + answers as a readable chat message
 *
 * @exports parseNumberedQuestions, formatAnswers
 * @see src/lib/store/agentChatSlice.ts: the state machine that calls these
 * @see src/components/agent/AnswerForm.tsx: the form the questions feed
 */

/** 📖 Upper bound on extracted questions. Interactive skills are interviewed
 *  one turn at a time; a runaway list must never blow up the answer form. */
const MAX_QUESTIONS = 8;

/**
 * 📖 Extracts numbered question lines from an assistant turn. A question line
 * starts with a single digit 1..9 followed by one of the accepted separators:
 * "N. ", "N)" or "N -" (tolerant to the formats models actually emit). The
 * question text is trimmed, duplicates removed (first occurrence wins),
 * at most {@link MAX_QUESTIONS} kept in order of appearance. Lines numbered 10
 * or higher do not match (N is a single digit) so list continuations and
 * code samples rarely leak in. Returns an empty array when nothing matches.
 */
export function parseNumberedQuestions(text: string): string[] {
  // 📖 One digit, then ".", ")" or "-", then whitespace: covers "1.", "1)",
  // "1 -" and "1-". Requiring the trailing whitespace keeps hyphenated words
  // like "1-step" and decimals like "1.5" out.
  const linePattern = /^\s*([1-9])\s*(?:\.|\)|-)\s+(.+)$/;
  const seen = new Set<string>();
  const questions: string[] = [];
  for (const line of text.split('\n')) {
    const match = linePattern.exec(line);
    if (!match) continue;
    const question = match[2].trim();
    if (!question || seen.has(question)) continue;
    seen.add(question);
    questions.push(question);
    if (questions.length >= MAX_QUESTIONS) break;
  }
  return questions;
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
