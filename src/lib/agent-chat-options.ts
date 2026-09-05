/**
 * @file Agent chat choice/proposal parser (round 5)
 * @description Pure, framework-free parsing of the two interactive answer
 * conventions the Kandown agent charter teaches every chat session (see
 * CHAT_AFFORDANCES_PROMPT in the daemon server):
 *
 *  → an ```options fenced code block, one choice per line, which the chat
 *    renders as a BeautifulUI-04-style clickable choice card instead of code;
 *  → a `PROPOSE: <action>` line, which renders as a recommendation card with
 *    Accept / Dismiss actions (the BeautifulUI 09 Recommendation Card shape).
 *
 * Everything here is display-level only: the chat event fold keeps every
 * event untouched, and the MessageList extracts the blocks BEFORE stripping
 * them from the text handed to the markdown renderer, so the raw entry text
 * stays the single source of truth. No DOM, no store, no React: fully
 * unit-testable. Ported from BeautifulUI, https://www.beautifului.dev (MIT).
 *
 * 📖 Parsing rules (lenient by design, they run on streaming partial text):
 *  → The fence opens with ```options (up to three leading spaces, language
 *    tag case-insensitive) and closes with the next ``` fence line; a fence
 *    still open at the end of the text (mid-stream) yields its choices so far.
 *  → Options fences inside OTHER fences are ignored (a ```ts sample that
 *    contains ```options never becomes a card).
 *  → Empty lines inside the block are skipped; choices cap at
 *    {@link MAX_OPTIONS} (first ones win) and each choice is clipped to
 *    {@link MAX_OPTION_LENGTH} characters, so a runaway model answer can
 *    never blow up the card layout.
 *  → PROPOSE lines are recognized outside any fence, action text required.
 *
 * @functions
 *  → extractOptionsBlocks: every ```options block with its choices + span
 *  → stripOptionsBlocks: removes options blocks from the displayed text
 *  → extractProposals: every PROPOSE line with its action + span
 *  → stripProposals: removes PROPOSE lines from the displayed text
 *
 * @exports OptionsBlock, Proposal, MAX_OPTIONS, MAX_OPTION_LENGTH,
 * extractOptionsBlocks, stripOptionsBlocks, extractProposals, stripProposals
 * @see src/lib/__tests__/agent-chat-options.spec.ts: the locked contract
 * @see src/components/agent/MessageList.tsx: the render-time consumer
 */

/** 📖 Upper bound of choices rendered per options block. First ones win. */
export const MAX_OPTIONS = 6;

/** 📖 Upper bound of one choice's length: longer lines are clipped so a
 * choice always fits the full-width button row of the choice card. */
export const MAX_OPTION_LENGTH = 90;

/** 📖 One parsed ```options block: the choices plus the exact span the block
 * occupies in the source text (`start` inclusive at the opening fence line,
 * `end` exclusive right after the closing fence line, or the end of the text
 * for a fence still open mid-stream), so callers can strip it cleanly. */
export interface OptionsBlock {
  choices: string[];
  start: number;
  end: number;
}

/** 📖 One parsed `PROPOSE: <action>` line: the action text plus the exact
 * span of the line in the source text (same span conventions as above). */
export interface Proposal {
  action: string;
  start: number;
  end: number;
}

/** 📖 A fence opener: up to three leading spaces, three backticks, then an
 * optional info string (the language tag). Group 2 is the tag. */
const FENCE_OPEN_PATTERN = /^ {0,3}```(.*)$/;

/** 📖 A fence closer: a fence line with nothing but optional whitespace after
 * the backticks (the info string of an opener never re-closes anything). */
const FENCE_CLOSE_PATTERN = /^ {0,3}```\s*$/;

/** 📖 A PROPOSE line: the tag at the start of the line with at most the same
 * three-space indent a fence may carry, so indented prose, list items and
 * four-space indented code blocks never trigger it, then the action text. */
const PROPOSE_PATTERN = /^ {0,3}PROPOSE:[ \t]*(.+?)[ \t]*$/;

/** 📖 One line of a scanned text, with its [start, end) offsets. `end` points
 * right after the newline (or the end of the text on the last line). */
interface ScannedLine {
  text: string;
  start: number;
  end: number;
}

/** 📖 Splits a text into {@link ScannedLine} records without losing offsets. */
function scanLines(text: string): ScannedLine[] {
  const lines: ScannedLine[] = [];
  let cursor = 0;
  for (const line of text.split('\n')) {
    const start = cursor;
    cursor = start + line.length + 1;
    lines.push({ text: line, start, end: Math.min(cursor, text.length) });
  }
  return lines;
}

/**
 * 📖 Extracts every ```options block of a message, in order of appearance.
 * Pure. See the module doc for the leniency rules; an unterminated fence
 * (streaming) yields the choices collected so far with `end` at the text end.
 */
export function extractOptionsBlocks(text: string): OptionsBlock[] {
  const blocks: OptionsBlock[] = [];
  let insideOtherFence = false;
  let open: { start: number; choices: string[] } | null = null;
  for (const line of scanLines(text)) {
    if (open !== null) {
      if (FENCE_CLOSE_PATTERN.test(line.text)) {
        blocks.push({ choices: open.choices, start: open.start, end: line.end });
        open = null;
        continue;
      }
      const choice = line.text.trim();
      if (choice !== '' && open.choices.length < MAX_OPTIONS) {
        open.choices.push(choice.slice(0, MAX_OPTION_LENGTH));
      }
      continue;
    }
    const opener = FENCE_OPEN_PATTERN.exec(line.text);
    if (opener === null) continue;
    const tag = (opener[1] ?? '').trim().toLowerCase();
    if (insideOtherFence) {
      // 📖 Only a bare closing fence ends a foreign fence; a tagged opener
      // inside one is just code content.
      if (tag === '') insideOtherFence = false;
      continue;
    }
    if (tag === 'options') {
      open = { start: line.start, choices: [] };
    } else {
      insideOtherFence = true;
    }
  }
  // 📖 Fence still open at the end of the text: the stream cut it mid-block.
  // Yield what arrived so far so the card forms live while streaming.
  if (open !== null) {
    blocks.push({ choices: open.choices, start: open.start, end: text.length });
  }
  return blocks;
}

/**
 * 📖 Removes every ```options block from the text the user reads. Spans come
 * from {@link extractOptionsBlocks}, so the removal is exact; leftover blank
 * seams are collapsed and the edges trimmed (a block that owned its lines,
 * even the first ones, leaves no husk behind). Pure.
 */
export function stripOptionsBlocks(text: string): string {
  const blocks = extractOptionsBlocks(text);
  if (blocks.length === 0) return text;
  let stripped = text;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    stripped = stripped.slice(0, block.start) + stripped.slice(block.end);
  }
  return stripped.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trimEnd();
}

/**
 * 📖 Extracts every `PROPOSE: <action>` line of a message, in order of
 * appearance. Lines inside any fenced code block never count (a charter
 * sample or code snippet must not become a card). The action text is
 * required: a bare `PROPOSE:` with nothing after it is ignored. Pure.
 */
export function extractProposals(text: string): Proposal[] {
  const proposals: Proposal[] = [];
  let insideFence = false;
  for (const line of scanLines(text)) {
    const opener = FENCE_OPEN_PATTERN.exec(line.text);
    if (opener !== null) {
      // 📖 Any fence line toggles the fenced region (openers and closers are
      // indistinguishable for this purpose: the close pattern is an opener
      // with an empty tag).
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;
    const match = PROPOSE_PATTERN.exec(line.text);
    if (match === null) continue;
    const action = match[1]?.trim() ?? '';
    if (action === '') continue;
    proposals.push({ action, start: line.start, end: line.end });
  }
  return proposals;
}

/**
 * 📖 Removes every `PROPOSE:` line from the text the user reads (the
 * recommendation card renders the action instead). Spans come from
 * {@link extractProposals}; the whole line including its newline goes away,
 * so a proposal that owned its line leaves no blank seam. Pure.
 */
export function stripProposals(text: string): string {
  const proposals = extractProposals(text);
  if (proposals.length === 0) return text;
  let stripped = text;
  for (let i = proposals.length - 1; i >= 0; i -= 1) {
    const proposal = proposals[i];
    stripped = stripped.slice(0, proposal.start) + stripped.slice(proposal.end);
  }
  return stripped.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trimEnd();
}
