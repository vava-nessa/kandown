/**
 * @file Recommendation card for assistant PROPOSE lines (round 5, round 7 renderer)
 * @description BeautifulUI 09 Recommendation Card, shared bui/ edition: when
 * an assistant message contains a `PROPOSE: <action>` line on its own (the
 * Kandown agent charter documents the convention: the agent suggests a board
 * action), the line is lifted out of the markdown and rendered as the
 * official bui card in its external mode: the action text as the headline,
 * a default confidence signal of 2, a quiet Dismiss (drops the card for
 * good) and the accent Accept (sends `Approved: <action>` as the follow-up
 * message). Buttons freeze while the turn is still streaming.
 * Presentation-only: the resolved/hidden state lives in the parent, keyed
 * per message entry.
 *
 * 📖 Parser half lives in agent-chat-options.ts (extractProposals /
 * stripProposals); this component only renders one parsed proposal.
 *
 * @functions
 *  → RecommendationCard: the bui card for one PROPOSE action
 *
 * @exports RecommendationCard
 * @see src/components/bui/RecommendationCard.tsx: the adapted official card
 * @see src/lib/agent-chat-options.ts: the parser that feeds it
 * @see src/components/agent/MessageList.tsx: mount point + resolved state
 */

import { useTranslation } from 'react-i18next';
import BuiRecommendationCard from '../bui/RecommendationCard';

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
    <div className="mt-2" role="group" aria-label={t('agentChat.proposeTitle', 'Proposed action')}>
      <BuiRecommendationCard
        title={action}
        signal={2}
        disabled={disabled}
        onAccept={onAccept}
        onDismiss={onDismiss}
        labels={{
          // 📖 The headline carries the action text; the footer label reuses
          // the "Proposed action" tag, and the actions reuse the existing
          // Accept / Dismiss copy.
          title: t('agentChat.proposeTitle', 'Proposed action'),
          accept: t('agentChat.proposeAccept', 'Accept'),
          dismiss: t('agentChat.proposeDismiss', 'Dismiss'),
        }}
      />
    </div>
  );
}
