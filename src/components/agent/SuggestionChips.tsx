/**
 * @file Follow-up suggestion chips under a settled assistant turn (round 5)
 * @description BeautifulUI 03 Streaming Text follow-ups port: once a turn
 * completes, a quiet row of 2-3 small suggestion chips appears under the
 * reply; clicking one sends its text as the follow-up message. V1 keeps the
 * chips static and i18n-authored ("Show me the task", "Apply this",
 * "Explain more"), which the task brief accepts: they are generic enough for
 * every board conversation and cost zero parsing. The parent hides the row
 * once any chip is picked (the answer is on its way) and while streaming.
 *
 * @functions
 *  → SuggestionChips: the static follow-up chip row
 *
 * @exports SuggestionChips
 * @see src/components/agent/MessageList.tsx: mount point + dismissed state
 */

import { useTranslation } from 'react-i18next';

interface SuggestionChipsProps {
  /** Sends the chip's text as the follow-up message. */
  onPick: (text: string) => void;
}

/** 📖 The static v1 suggestions, i18n keys resolved at render time. */
const SUGGESTION_KEYS = [
  { key: 'agentChat.suggestShowTask', fallback: 'Show me the task' },
  { key: 'agentChat.suggestApply', fallback: 'Apply this' },
  { key: 'agentChat.suggestExplainMore', fallback: 'Explain more' },
] as const;

export function SuggestionChips({ onPick }: SuggestionChipsProps) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('agentChat.suggestionsLabel', 'Suggested follow-ups')}
      className="mt-1.5 flex flex-wrap gap-1"
    >
      {SUGGESTION_KEYS.map(suggestion => (
        <button
          key={suggestion.key}
          type="button"
          onClick={() => onPick(t(suggestion.key, suggestion.fallback))}
          className="rounded-full border border-border bg-bg-1 px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:bg-bg-2 hover:text-fg"
        >
          {t(suggestion.key, suggestion.fallback)}
        </button>
      ))}
    </div>
  );
}
