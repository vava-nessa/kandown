/**
 * @file Pure helpers for @task mentions and /skill tokens in the chat prompt
 * @description All the caret-level text surgery the PromptBar needs to detect
 * what the user is typing right before the caret: an unfinished `@task`
 * mention (opens the task picker), an unfinished `/skill` token (opens the
 * skill picker), and the list of mentioned task ids a finished message carries
 * (the transport forwards them so the daemon can inline the integral task
 * files into the prompt). Nothing here touches the DOM, the network or the
 * store, which keeps the whole contract unit-testable.
 *
 * @functions
 *  → findActiveMentionQuery: the @token under the caret, or null
 *  → findActiveSlashQuery: the /token under the caret, or null
 *  → extractMentionedTaskIds: unique @ids of a finished message (max 5)
 *  → stripMentionMarkers: identity by contract (mentions stay visible)
 *
 * @exports MentionQuery, findActiveMentionQuery, findActiveSlashQuery, extractMentionedTaskIds, stripMentionMarkers
 * @see src/components/agent/PromptBar.tsx: the only consumer
 * @see src/lib/__tests__/chat-mentions.spec.ts: the locked contract
 */

/** 📖 An active trigger token right before the caret: `query` is what the
 * user typed after the trigger character (possibly empty), and `tokenStart`
 * is the index of the trigger character itself (`@` or `/`) in the full text,
 * so the caller can replace exactly `text.slice(tokenStart, caretIndex)` on
 * selection. */
export interface MentionQuery {
  query: string;
  tokenStart: number;
}

/** 📖 A mention token is `@` followed by task-id characters, sitting at the
 * start of the text or right after whitespace, with the caret at (or inside)
 * its end. Matches /(^|\s)@([A-Za-z0-9_-]*)$/ against the text up to the
 * caret; `tokenStart` points at the `@`. */
export function findActiveMentionQuery(text: string, caretIndex: number): MentionQuery | null {
  return findActiveTriggerQuery(text, caretIndex, '@');
}

/** 📖 Same shape for the `/skill` trigger: a `/` token at a word boundary
 * with the caret at its end opens the skill picker. Matches
 * /(^|\s)\/([A-Za-z0-9_-]*)$/ against the text up to the caret. */
export function findActiveSlashQuery(text: string, caretIndex: number): MentionQuery | null {
  return findActiveTriggerQuery(text, caretIndex, '/');
}

/** 📖 Shared scanner for both triggers. `upTo` is clamped into the string and
 * only the prefix before the caret participates: a token the caret has already
 * left is not active anymore. */
function findActiveTriggerQuery(text: string, caretIndex: number, trigger: '@' | '/'): MentionQuery | null {
  const upTo = Math.max(0, Math.min(caretIndex, text.length));
  const before = text.slice(0, upTo);
  const pattern = trigger === '@'
    ? /(^|\s)@([A-Za-z0-9_-]*)$/
    : /(^|\s)\/([A-Za-z0-9_-]*)$/;
  const match = pattern.exec(before);
  if (!match) return null;
  // 📖 The trigger character sits right after the boundary group: either at
  // the very start of the text (^ matches empty) or one char after a space.
  const tokenStart = match.index + (match[1]?.length ?? 0);
  return { query: match[2] ?? '', tokenStart };
}

/** 📖 Unique `@id` mentions of a finished message, in first-occurrence order,
 * capped at 5. Anything that is not a mention (emails mid-word, `@@`, a bare
 * `@`) is ignored, and the `@` marker itself stays in the visible text: the
 * ids only ride along to the daemon as structured data. */
export function extractMentionedTaskIds(text: string): string[] {
  const ids: string[] = [];
  const pattern = /@([A-Za-z0-9_-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const id = match[1];
    if (!ids.includes(id)) ids.push(id);
    if (ids.length >= 5) break;
  }
  return ids;
}

/** 📖 Deliberately returns the text unchanged: mentioned tasks are delivered
 * to the harness as structured `mentionedTaskIds` (the daemon inlines the
 * integral files), so the visible user message keeps its `@t271` markers.
 * Kept as a named function so the send path states that decision explicitly
 * instead of implying the text was rewritten. */
export function stripMentionMarkers(text: string): string {
  return text;
}
