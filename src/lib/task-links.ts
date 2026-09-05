/**
 * @file Task link parser for agent chat messages
 * @description Pure, framework-free parsing of the two task affordances the
 * chat prompt teaches every agent session (see CHAT_AFFORDANCES_PROMPT in the
 * daemon server): inline task references that render as clickable chips, and
 * the `[show: t123]` directive that makes the app open a task automatically
 * once the turn completes. Everything here is display-level only: the chat
 * event fold keeps every event untouched, the MessageList strips the directive
 * from the rendered text and linkifies references at render time.
 *
 * 📖 Two reference shapes are recognized:
 *  → `[[t123]]` (always a reference, brackets are the explicit markup);
 *  → a bare `t123` followed by a space, punctuation or end of line, matching
 *    the canonical numeric task id shape (`/t\d+/i`). Word characters and
 *    slashes right before the `t` disqualify the match so identifiers like
 *    `part123` and URL paths like `/t123` never turn into chips.
 *
 * @functions
 *  → findShowDirective: last `[show: tXXX]` (with optional `#anchor`) in a message
 *  → stripShowDirectives: removes directive markup from the displayed text
 *  → linkifyTaskReferences: rewrites references as `task:` markdown links
 *
 * @exports TaskSectionAnchor, ShowTaskDirective, findShowDirective,
 * stripShowDirectives, linkifyTaskReferences
 * @see src/lib/__tests__/task-links.spec.ts: the parser contract
 * @see src/components/agent/MarkdownContent.tsx: renders `task:` links as chips
 */

/** 📖 Sections of the task editor the `[show:]` anchor can scroll to. Anything
 * else parses as a valid directive with a null anchor: the task still opens,
 * the page just does not scroll. */
export type TaskSectionAnchor = 'description' | 'subtasks' | 'report';

/** 📖 One parsed `[show: t123(#anchor)]` directive: the task to open and the
 * section to scroll to, when the anchor is one of the known sections. */
export interface ShowTaskDirective {
  taskId: string;
  anchor: TaskSectionAnchor | null;
}

/** 📖 `[show: t123]`, tolerant about inner whitespace and letter case, with an
 * optional tight `#anchor` right after the closing bracket (the form the chat
 * prompt teaches; a loose space is deliberately NOT accepted so a real
 * markdown heading on the next line can never be swallowed). Applied
 * line-agnostically: the directive is recognized wherever it sits, but agents
 * are taught to put it on its own line. */
const SHOW_DIRECTIVE_PATTERN = /\[\s*show\s*:\s*(t\d+)\s*\](?:#([a-z-]+))?/gi;

/** 📖 The known anchors, lowercase: anything else is left unparsed (null). */
const KNOWN_ANCHORS: readonly TaskSectionAnchor[] = ['description', 'subtasks', 'report'];

/** 📖 `[[t123]]` explicit markup first, then bare `t123` when it stands alone:
 * no word character or slash immediately before (kills `part123`, `x/t123` in
 * URLs) and no word character immediately after (kills `t123px`). */
const TASK_REFERENCE_PATTERN = /\[\[\s*(t\d+)\s*\]\]|(?<![\w/])t\d+(?![\w])/gi;

/** 📖 Fenced code blocks, including one still streaming (unterminated fence):
 * nothing inside them is ever linkified. */
const CODE_FENCE_PATTERN = /(```[\s\S]*?(?:```|$))/g;

/** 📖 Inline code spans (`like this`, including double-backtick forms): the
 * inner text is protected from linkification. */
const INLINE_CODE_PATTERN = /(`+[^`]*`+)/g;

/**
 * 📖 Finds the `[show: tXXX]` directive of an assistant message, or null.
 * When several directives appear the LAST one wins: it is the pointer the
 * agent chose to end with. A directive whose anchor is not one of the known
 * sections still returns, with a null anchor (open the task, scroll nowhere).
 * Malformed forms (`[show: t]`, `[show 42]`, a bare `t42` without brackets)
 * never match: only the explicit bracket syntax triggers auto-opening.
 */
export function findShowDirective(text: string): ShowTaskDirective | null {
  let found: ShowTaskDirective | null = null;
  for (const match of text.matchAll(SHOW_DIRECTIVE_PATTERN)) {
    const rawId = match[1];
    if (!rawId) continue;
    const rawAnchor = match[2]?.toLowerCase();
    found = {
      taskId: rawId.toLowerCase(),
      anchor: rawAnchor && (KNOWN_ANCHORS as readonly string[]).includes(rawAnchor)
        ? rawAnchor as TaskSectionAnchor
        : null,
    };
  }
  return found;
}

/**
 * 📖 Removes every `[show: ...]` directive from the text the user sees. When a
 * directive sat alone on its line the now-empty line is dropped too, so no
 * double blank gap is left behind. Pure.
 */
export function stripShowDirectives(text: string): string {
  if (!text.includes('[')) return text;
  // 📖 Two passes over the same split: wipe the directive tokens, then drop
  // the lines the wipe emptied (a directive that had its own line leaves no
  // husk behind, one embedded in prose only leaves a double space).
  const cleaned: string[] = [];
  for (const line of text.split('\n')) {
    const stripped = line.replace(SHOW_DIRECTIVE_PATTERN, '');
    if (line.trim() !== '' && stripped.trim() === '') continue;
    cleaned.push(stripped);
  }
  return cleaned
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

/**
 * 📖 Rewrites task references as markdown links with a `task:` href, which the
 * chat markdown renderer turns into clickable task chips. `[[t123]]` keeps its
 * compact `t123` label; a bare `t123` is linkified with its own text. Code
 * fences and inline code spans are left untouched. Pure.
 */
export function linkifyTaskReferences(text: string): string {
  return mapOutsideCode(text, segment => segment.replace(TASK_REFERENCE_PATTERN, match => {
    // 📖 The chip label is always the bare id: `[[t42]]` and `t42` render the
    // same compact chip, only the surrounding markup differs in the source.
    const id = match.replace(/[\[\]\s]/g, '').toLowerCase();
    return `[${id}](task:${id})`;
  }));
}

/** 📖 Applies `fn` to every text segment that is NOT inside a fenced code
 * block, and inside those, not inside an inline code span. */
function mapOutsideCode(text: string, fn: (segment: string) => string): string {
  return text
    .split(CODE_FENCE_PATTERN)
    .map((chunk, index) => {
      // 📖 String.split with a capturing group interleaves captures at odd
      // indexes: those are the fenced blocks, passed through untouched.
      if (index % 2 === 1) return chunk;
      return chunk
        .split(INLINE_CODE_PATTERN)
        .map((inner, innerIndex) => (innerIndex % 2 === 1 ? inner : fn(inner)))
        .join('');
    })
    .join('');
}
