/**
 * @file Recommendation card for assistant PROPOSE lines (round 5)
 * @description BeautifulUI 09 Recommendation Card port: when an assistant
 * message contains a `PROPOSE: <action>` line on its own (the Kandown agent
 * charter documents the convention: the agent suggests a board action), the
 * line is lifted out of the markdown and rendered as a card: the action text,
 * an Accept button (sends `Approved: <action>` as the follow-up message) and
 * a Dismiss button (drops the card for good). Buttons disable while the turn
 * is still streaming. Presentation-only: the resolved/hidden state lives in
 * the parent, keyed per message entry.
 *
 * 📖 Parser half lives in agent-chat-options.ts (extractProposals /
 * stripProposals); this component only renders one parsed proposal.
 *
 * @functions
 *  → RecommendationCard: action text + Accept / Dismiss
 *
 * @exports RecommendationCard
 * @see src/lib/agent-chat-options.ts: the parser that feeds it
 * @see src/components/agent/MessageList.tsx: mount point + resolved state
 */

import { useTranslation } from 'react-i18next';
import { IconBulb, IconCheck, IconX } from '@tabler/icons-react';

interface RecommendationCardProps {
  /** The proposed action, verbatim from the PROPOSE line (no tag). */
  action: string;
  /** Disables the buttons while the assistant turn is still streaming. */
  disabled: boolean;
  /** Sends the "Approved: <action>" follow-up. */
  onAccept: () => void;
  /** Drops the card without sending anything. */
  onDismiss: () => void;
}

export function RecommendationCard({ action, disabled, onAccept, onDismiss }: RecommendationCardProps) {
  const { t } = useTranslation();
  return (
    <div
      className="mt-2 rounded-[8px] border border-accent/40 bg-accent/10 p-2.5"
      role="group"
      aria-label={t('agentChat.proposeTitle', 'Proposed action')}
    >
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-muted">
        <IconBulb size={12} stroke={1.8} className="flex-none text-accent" />
        <span>{t('agentChat.proposeTitle', 'Proposed action')}</span>
      </div>
      <p className="mt-1 break-words text-[13px] font-medium leading-snug text-fg">{action}</p>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onDismiss}
          disabled={disabled}
          aria-label={t('agentChat.proposeDismiss', 'Dismiss')}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-1 px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          <IconX size={11} stroke={1.8} className="flex-none" />
          {t('agentChat.proposeDismiss', 'Dismiss')}
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11.5px] font-medium text-primary-foreground transition-transform hover:-translate-y-px disabled:translate-y-0 disabled:opacity-50"
        >
          <IconCheck size={11} stroke={2} className="flex-none" />
          {t('agentChat.proposeAccept', 'Accept')}
        </button>
      </div>
    </div>
  );
}
