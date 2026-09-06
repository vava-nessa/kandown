/**
 * @file Follow-up suggestion rows under a settled assistant turn (round 5,
 * restyled round 7)
 * @description BeautifulUI 03 Streaming Text follow-ups: once a turn
 * completes, a quiet list of 2-3 suggestion rows appears under the reply;
 * clicking one sends its text as the follow-up message. Round 7 adopts the
 * exact BUI follow-up look: full-width bordered rows with the little return
 * arrow, staggered fade-up on entry. V1 keeps the suggestions static and
 * i18n-authored ("Show me the task", "Apply this", "Explain more"), which
 * the task brief accepts: they are generic enough for every board
 * conversation and cost zero parsing. The parent hides the row once any row
 * is picked (the answer is on its way) and while streaming.
 *
 * @functions
 *  → SuggestionChips: the static follow-up rows
 *
 * @exports SuggestionChips
 * @see src/components/bui/StreamingText.tsx: the original follow-up rows
 * @see src/components/agent/MessageList.tsx: mount point + dismissed state
 */

import { useTranslation } from 'react-i18next';

interface SuggestionChipsProps {
  /** Sends the row's text as the follow-up message. */
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
      className="mt-2.5"
    >
      <p className="text-[12px] font-medium text-ink-2">
        {t('agentChat.suggestionsLabel', 'Suggested follow-ups')}
      </p>
      <div className="mt-0.5 flex flex-col">
        {SUGGESTION_KEYS.map((suggestion, index) => (
          <button
            key={suggestion.key}
            type="button"
            onClick={() => onPick(t(suggestion.key, suggestion.fallback))}
            // 📖 BUI 03 follow-up row: bordered bottom hairline, return arrow,
            // staggered fade-up. The ink/hover tokens fall back to the
            // kandown palette outside the .bui wrapper.
            className="-mx-1.5 flex items-center gap-2 rounded-[7px] border-b border-line px-1.5 py-1.5
              text-left text-[12.5px] text-ink transition-colors duration-100 hover:bg-hover-2"
            style={{ animation: `fade-up 350ms cubic-bezier(0.23,1,0.32,1) ${index * 90}ms both` }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              style={{ stroke: "hsl(var(--ink-3))" }}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden="true"
            >
              <path d="M9 10l-5 5 5 5" />
              <path d="M20 4v7a4 4 0 0 1-4 4H4" />
            </svg>
            {t(suggestion.key, suggestion.fallback)}
          </button>
        ))}
      </div>
    </div>
  );
}
