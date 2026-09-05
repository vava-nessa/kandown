/**
 * @file Streaming text with a live caret
 * @description Renders an assistant message that is still arriving: the text is
 * shown as-is and a blinking caret marks the write position while `streaming`.
 * Once the turn finalizes the caret disappears and the block renders like any
 * settled message.
 *
 * @functions
 *  → StreamingText: assistant text with a blinking caret while streaming
 *
 * @exports StreamingText
 * @see src/components/agent/MessageList.tsx
 */

interface StreamingTextProps {
  text: string;
  streaming: boolean;
}

export function StreamingText({ text, streaming }: StreamingTextProps) {
  return (
    <span className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-fg">
      {text}
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
