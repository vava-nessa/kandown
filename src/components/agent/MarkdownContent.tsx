/**
 * @file Markdown renderer for assistant chat messages
 * @description Renders an assistant message as Markdown: headings, lists,
 * bold, links, blockquotes, GFM tables (remark-gfm) and fenced code blocks on
 * the project's code-block token surface with a Copy button. Task references
 * linkified by the chat render as clickable chips that open the task through
 * the canonical openDrawer action (a button, never a href: the view never
 * changes by navigation); external links stay real links in a new tab. User
 * messages never go through this component.
 *
 * 📖 Renderer choice: react-markdown + remark-gfm (tiny, standard, React 19
 * compatible) instead of a hand-rolled parser, because the acceptance bar
 * includes nested lists, tables and fences inside streaming partial text,
 * which is exactly where hand-rolled parsers break mid-stream. Streaming is
 * smoothed twice here: `closeDanglingCodeFence` closes the fence an in-flight
 * code block leaves open so the raw "```ts" marker never flashes as body
 * text, and `withShimmerTail` carries the generation shimmer on the last few
 * words of the rendered tree until the turn completes. Visual patterns (code
 * block surface, copy affordance, chat typography) are ported from
 * BeautifulUI's chat and Code Block components, https://www.beautifului.dev
 * (MIT), restyled with kandown tokens.
 *
 * @functions
 *  → closeDanglingCodeFence: appends the closing fence when the stream cut one open
 *  → splitStreamingTail: splits the last few words off for the shimmer sweep
 *  → withShimmerTail: wraps the rendered tree's tail text in the shimmer span
 *  → TaskChip: clickable task reference chip (a button, no navigation)
 *  → CodeBlock: fenced code panel with a Copy button
 *  → buildComponents: element overrides, chat-scale typography
 *  → MarkdownContent: the markdown root
 *
 * @exports MarkdownContent, closeDanglingCodeFence, splitStreamingTail
 * @see src/lib/task-links.ts: the linkifier that produces `task:` hrefs
 * @see src/components/agent/MessageList.tsx
 * @see src/components/agent/StreamingText.tsx
 */

import { cloneElement, isValidElement, memo, useState, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { IconArrowUpRight, IconCheck, IconCopy } from '@tabler/icons-react';

interface MarkdownContentProps {
  /** Assistant message text, already directive-stripped and linkified. */
  text: string;
  /** While streaming: a live caret rides the tail, the fence closer is
   * active and the generation shimmer sweeps the last few words. */
  caret?: boolean;
  /** Opens a task in the app (canonical openDrawer path). */
  onOpenTask?: (taskId: string) => void;
}

/** 📖 Chat URL sanitizer: react-markdown's default strips unknown protocols,
 * which silently emptied every `task:t123` href and dropped the click into the
 * plain external-link branch (an anchor with an empty href that re-opens the
 * page in a new tab). Everything non-`task:` still goes through the default
 * `javascript:`-style filtering unchanged. */
function chatUrlTransform(url: string): string {
  if (url.startsWith('task:')) return url;
  return defaultUrlTransform(url);
}

/** 📖 Streaming fence guard: counts ``` markers and, when the count is odd,
 * the stream cut a fenced block open, so a closing fence is appended before
 * the text reaches the parser. Without it the partial ```ts line renders as
 * body text for the whole duration of the block. Pure. */
export function closeDanglingCodeFence(text: string): string {
  const markers = text.match(/```/g);
  return markers !== null && markers.length % 2 === 1 ? `${text}\n\`\`\`` : text;
}

/** 📖 Splits the last few words off a string for the generation shimmer.
 * Whitespace-only tails return untouched (no shimmer span). Pure. */
export function splitStreamingTail(text: string): { head: string; tail: string } {
  const match = /(?:\S+[^\S\n]*){1,4}$/.exec(text);
  if (match === null || match[0] === '') return { head: text, tail: '' };
  return { head: text.slice(0, match.index), tail: match[0] };
}

/** 📖 Generation shimmer on the rendered tree: descends into the LAST child
 * at every level (the write position is always at the tree's end) and wraps
 * the final text node's last few words in the `.stream-shimmer` span. Running
 * on rendered elements, not on the source, is what keeps markdown integrity:
 * the parse already happened, only the tail styling changes. Returns the
 * input untouched when the tail has no shimmerable text, so settled trees
 * keep their identity (memo-safe). */
function withShimmerTail(node: ReactNode): ReactNode {
  if (typeof node === 'string') {
    const { head, tail } = splitStreamingTail(node);
    if (tail === '') return node;
    return [head, <span key="stream-tail" className="stream-shimmer">{tail}</span>];
  }
  if (Array.isArray(node)) {
    if (node.length === 0) return node;
    const last = node[node.length - 1];
    const patched = withShimmerTail(last);
    if (patched === last) return node;
    return [...node.slice(0, -1), patched];
  }
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    const patched = withShimmerTail(props.children);
    if (patched === props.children) return node;
    return cloneElement(node, undefined, patched);
  }
  return node;
}

/** 📖 Task reference chip: the compact mono pill the rest of the app uses for
 * task ids, clickable so the chat can deep-link the board. */
function TaskChip({ taskId, onOpenTask }: { taskId: string; onOpenTask?: (taskId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpenTask?.(taskId)}
      title={taskId.toUpperCase()}
      className="inline-flex items-center gap-0.5 rounded-full border border-accent/40 bg-accent/10 px-1.5 align-baseline font-mono text-[11.5px] font-medium leading-[1.4] text-fg transition-colors hover:border-accent hover:bg-accent/20"
    >
      {taskId.toUpperCase()}
      <IconArrowUpRight size={10} stroke={2} className="text-fg-muted" />
    </button>
  );
}

/** 📖 Fenced code panel: the same code-bg, code-fg and border tokens the
 * BlockNote editor uses, a mono face, horizontal scroll, and the BeautifulUI
 * Code Block copy affordance (a quiet top-right button that flips to a check).
 * The inner code element resets the global inline-code pill via inline styles,
 * which win over the unlayered element rule in globals.css. */
function CodeBlock({ codeText, children }: { codeText: string; children: ReactElement }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(codeText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="group/code relative my-3.5 overflow-hidden rounded-[8px] border border-border">
      <pre className="overflow-x-auto bg-[hsl(var(--code-bg))] p-2.5 text-[12px] leading-relaxed text-[hsl(var(--code-fg))]">
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? t('agentChat.copied', 'Copied') : t('agentChat.copy', 'Copy')}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-bg-2/80 text-fg-muted opacity-0 transition-opacity hover:text-fg group-hover/code:opacity-100"
      >
        {copied ? <IconCheck size={12} stroke={2} className="text-emerald-500" /> : <IconCopy size={12} stroke={1.8} />}
      </button>
    </div>
  );
}

/** 📖 Element overrides: airier chat-scale typography with kandown tokens
 * (round 2 of vava's feedback: paragraphs breathe with a 3.5 bottom margin
 * and a 1.65 line-height, lists and headings get real vertical rhythm, while
 * the 13.5px base keeps it compact enough for the 400px sidebar). BeautifulUI's
 * quiet-chrome approach: content first, structure in tokens. Prop types come
 * from the Components contextual typing, no annotations. */
function buildComponents(onOpenTask?: (taskId: string) => void): Components {
  return {
    a({ href, children }) {
      const taskId = href?.startsWith('task:') ? href.slice('task:'.length) : null;
      if (taskId) return <TaskChip taskId={taskId} onOpenTask={onOpenTask} />;
      // 📖 External links only: real anchors, new tab, never same-view task
      // opens (those are TaskChip buttons above).
      return (
        <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2 hover:opacity-80">
          {children}
        </a>
      );
    },
    p({ children }) {
      return <p className="mb-3.5 leading-[1.65]">{children}</p>;
    },
    h1({ children }) {
      return <h1 className="mb-2 mt-5 text-[15px] font-bold first:mt-0">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="mb-2 mt-5 text-[14px] font-bold first:mt-0">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="mb-1.5 mt-4 text-[13.5px] font-semibold first:mt-0">{children}</h3>;
    },
    h4({ children }) {
      return <h4 className="mb-1 mt-4 text-[13px] font-semibold first:mt-0">{children}</h4>;
    },
    ul({ children }) {
      return <ul className="my-3 list-disc space-y-1 pl-5 marker:text-fg-faint">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="my-3 list-decimal space-y-1 pl-5 marker:text-fg-faint">{children}</ol>;
    },
    li({ children }) {
      return <li className="leading-[1.65] pl-0.5">{children}</li>;
    },
    blockquote({ children }) {
      return <blockquote className="my-3 border-l-2 border-border pl-2.5 text-fg-muted">{children}</blockquote>;
    },
    hr() {
      return <hr className="my-3.5 border-border" />;
    },
    // 📖 Block code detection: fenced code always contains a newline (the
    // closing fence sits on its own line), inline code never does.
    code({ className, children }) {
      const isBlock = String(children).includes('\n');
      if (!isBlock) return <code>{children}</code>;
      return (
        <code
          className={className}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            borderRadius: 0,
            color: 'inherit',
            fontSize: 'inherit',
          }}
        >
          {children}
        </code>
      );
    },
    pre({ children }) {
      // 📖 Recover the raw text for the Copy button, then hand the rendered
      // code element through untouched.
      const codeText = extractText(children);
      if (isValidElement(children)) {
        return <CodeBlock codeText={codeText}>{cloneElement(children)}</CodeBlock>;
      }
      return <CodeBlock codeText={codeText}><code>{codeText}</code></CodeBlock>;
    },
    table({ children }) {
      return (
        <div className="my-3 overflow-x-auto rounded-[8px] border border-border">
          <table className="w-full border-collapse text-[12.5px]">{children}</table>
        </div>
      );
    },
    th({ children }) {
      return <th className="border-b border-border bg-bg-2 px-2 py-1 text-left font-semibold">{children}</th>;
    },
    td({ children }) {
      return <td className="border-t border-border/60 px-2 py-1 align-top">{children}</td>;
    },
    input({ node: _eventNode, ...props }) {
      // 📖 GFM task list checkboxes: render the state, disable the edit (chat
      // is read-only: the agent owns the markdown source). The hast `node`
      // extra prop is dropped so it never reaches the DOM.
      return <input {...props} type="checkbox" disabled className="mr-1 align-middle accent-[hsl(var(--accent))]" />;
    },
  };
}

/** 📖 Walks a rendered React child tree and concatenates its text content,
 * used to feed the code block Copy button. */
function extractText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement(node)) {
    const props = node.props as { children?: unknown };
    return extractText(props.children);
  }
  return '';
}

function MarkdownContentInner({ text, caret = false, onOpenTask }: MarkdownContentProps) {
  // 📖 The caret is a literal block character appended to the source so it
  // flows inside the last paragraph (or code fence) while streaming, like a
  // live write position. It disappears once the turn finalizes. The fence
  // closer runs after the caret append, so the caret stays INSIDE the code
  // block an in-flight fence leaves open.
  const content = closeDanglingCodeFence(caret ? `${text}\u258D` : text);
  const rendered = (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildComponents(onOpenTask)} urlTransform={chatUrlTransform}>
      {content}
    </ReactMarkdown>
  );
  return (
    <div className="break-words text-[13.5px] text-fg [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      {caret ? withShimmerTail(rendered) : rendered}
    </div>
  );
}

/** 📖 Memoized: finished messages re-render on every stream delta otherwise,
 * and a settled markdown parse is pure waste. */
export const MarkdownContent = memo(MarkdownContentInner);
