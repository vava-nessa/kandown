/**
 * @file Compact usage badge for the agent chat sidebar
 * @description Shows the running token totals and USD cost of the active
 * session, accumulated by the event fold from `usage` SSE events. Renders
 * nothing until at least one usage event arrived (a fresh session has no
 * numbers yet and the header should not show "0 tokens").
 *
 * @functions
 *  → compactTokens: 1234 → "1.2k", 4200 → "4.2k"
 *  → UsageBadge: tokens + cost chip
 *
 * @exports UsageBadge
 * @see src/components/agent/ChatSidebar.tsx
 */

import { useTranslation } from 'react-i18next';
import type { ChatUsageTotals } from '../../lib/agent-chat-events';

function compactTokens(value: number): string {
  if (value < 1000) return String(value);
  if (value < 100000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value / 1000)}k`;
}

function hasUsage(totals: ChatUsageTotals): boolean {
  return totals.inputTokens > 0 || totals.outputTokens > 0 || totals.costUsd > 0;
}

interface UsageBadgeProps {
  totals: ChatUsageTotals;
}

export function UsageBadge({ totals }: UsageBadgeProps) {
  const { t } = useTranslation();
  if (!hasUsage(totals)) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-bg-2 px-2 py-0.5 text-[11px] tabular-nums text-fg-muted"
      title={`${t('agentChat.tokens', 'tokens')} ${totals.inputTokens}/${totals.outputTokens}`}
    >
      <span>{compactTokens(totals.inputTokens + totals.outputTokens)} {t('agentChat.tokens', 'tokens')}</span>
      {totals.costUsd > 0 && (
        <>
          <span className="text-fg-faint">·</span>
          <span>${totals.costUsd < 0.01 && totals.costUsd > 0 ? totals.costUsd.toFixed(4): totals.costUsd.toFixed(2)}</span>
        </>
      )}
    </span>
  );
}
