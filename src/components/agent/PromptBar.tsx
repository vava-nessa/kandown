/**
 * @file Prompt bar for the agent chat sidebar
 * @description Auto-sizing textarea plus send/stop controls. Enter sends,
 * Shift+Enter inserts a newline. While a turn is live the send button becomes a
 * stop button; when no session is active the first send starts one (lazily, so
 * "Ask the agent" never kicks off a harness run the user did not ask for);
 * without a daemon the bar is disabled.
 *
 * @functions
 *  → PromptBar: message composer with send/stop and lazy session start
 *
 * @exports PromptBar
 * @see src/components/agent/ChatSidebar.tsx
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { IconArrowUp, IconPlayerStop } from '@tabler/icons-react';

interface PromptBarProps {
  disabled: boolean;
  turnActive: boolean;
  sending: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function PromptBar({ disabled, turnActive, sending, onSend, onStop }: PromptBarProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 📖 Auto-size: reset height then grow to the scroll height, capped by CSS
  // max-height so long drafts scroll internally instead of eating the sidebar.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || sending) return;
    onSend(trimmed);
    setValue('');
  }, [value, disabled, sending, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (turnActive) return;
      submit();
    }
  };

  return (
    <div className="flex flex-none items-end gap-1.5 border-t border-border bg-bg px-2.5 py-2.5">
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        disabled={disabled}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled
          ? t('agentChat.daemonGuardTitle', 'Agent chat needs the kandown daemon')
         : t('agentChat.placeholder', 'Ask the agent...')}
        className="max-h-[140px] flex-1 resize-none rounded-[8px] border border-border bg-bg-1 px-2.5 py-2 text-[13.5px] leading-snug text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-border-focus disabled:opacity-60"
      />
      {turnActive ? (
        <button
          type="button"
          onClick={onStop}
          disabled={disabled}
          title={t('agentChat.stop', 'Stop')}
          aria-label={t('agentChat.stop', 'Stop')}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-[8px] border border-border-strong bg-bg-1 text-fg transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
        >
          <IconPlayerStop size={15} stroke={1.8} />
        </button>
      ): (
        <button
          type="button"
          onClick={submit}
          disabled={disabled || sending || !value.trim()}
          title={t('agentChat.send', 'Send')}
          aria-label={t('agentChat.send', 'Send')}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-[8px] bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
        >
          <IconArrowUp size={15} stroke={1.8} />
        </button>
      )}
    </div>
  );
}
