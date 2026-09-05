/**
 * @file Streaming text with a live caret
 * @description Renders an assistant message that is still arriving. Two
 * renderers: Markdown (default for assistant turns, via MarkdownContent) and
 * plain text (fallback). While `streaming` a live caret character rides the
 * tail of the text, marking the write position, and the trailing few words
 * carry the generation shimmer (the soft gradient sweep the Thinking label
 * uses) until the turn finalizes; once settled the caret and shimmer
 * disappear and the block renders like any settled message.
 *
 * 📖 Markdown rendering and the inline caret pattern follow BeautifulUI's
 * streaming text and chat components, https://www.beautifului.dev (MIT),
 * restyled with kandown tokens; the caret itself is the pre-existing CSS
 * pulse approach, kept because it reads as a write position, not a spinner.
 * The markdown path gets the same shimmer inside MarkdownContent
 * (withShimmerTail, applied on the rendered tree); this component only
 * splits the tail for the plain-text path. Both sweeps are pure CSS, so
 * `prefers-reduced-motion` users get a static tail.
 *
 * @functions
 *  → StreamingText: assistant text with a live caret and tail shimmer
 *
 * @exports StreamingText
 * @see src/components/agent/MessageList.tsx
 * @see src/components/agent/MarkdownContent.tsx
 */

import { MarkdownContent, splitStreamingTail } from './MarkdownContent';

interface StreamingTextProps {
  text: string;
  streaming: boolean;
  /** Renders the text as Markdown (assistant turns). Omitted: plain text. */
  markdown?: boolean;
  /** Opens a task from a `task:` markdown link (markdown mode only). */
  onOpenTask?: (taskId: string) => void;
}

export function StreamingText({ text, streaming, markdown = false, onOpenTask }: StreamingTextProps) {
  if (markdown) {
    return <MarkdownContent text={text} caret={streaming} onOpenTask={onOpenTask} />;
  }
  // 📖 Plain-text path: split the trailing few words off so they carry the
  // generation shimmer while the message is still arriving.
  const { head, tail } = streaming ? splitStreamingTail(text) : { head: text, tail: '' };
  return (
    <span className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-fg">
      {head}
      {tail !== '' && <span className="stream-shimmer">{tail}</span>}
      {streaming && (
        // 📖 Blinking caret: a CSS pulse, not a motion preset, because it runs
        // continuously (motion presets here own enter/exit choreography).
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-[14px] w-[2px] translate-y-[2px] animate-pulse rounded-full bg-fg/70"
        />
      )}
    </span>
  );
}
