/**
 * @file Daemon-required card for the agent chat sidebar
 * @description Shown instead of the conversation UI when the session index
 * reported no daemon (standalone File System Access mode, the demo, or an old
 * daemon without the agent routes). Explains the requirement in one breath and
 * hands over the exact command to run, in a copyable mono snippet.
 *
 * @functions
 *  → DaemonGuardCard: friendly "start the daemon" explainer
 *
 * @exports DaemonGuardCard
 * @see src/components/agent/ChatSidebar.tsx
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconCopy } from '@tabler/icons-react';

export function DaemonGuardCard() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText('npx kandown');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (permissions, http): the text is selectable anyway.
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-5">
      <div className="max-w-[300px] rounded-[8px] border border-border bg-bg-1 px-4 py-6 text-center">
        <p className="text-[14px] font-medium text-fg">
          {t('agentChat.daemonGuardTitle', 'Agent chat needs the kandown daemon')}
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">
          {t('agentChat.daemonGuardBody', 'Run kandown in this project to chat with your coding agents right from the sidebar.')}
        </p>
        <button
          type="button"
          onClick={() => void copyCommand()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-2 px-2.5 py-1.5 font-mono text-[12px] text-fg transition-colors hover:border-border-strong"
          title={t('agentChat.copy', 'Copy')}
        >
          npx kandown
          {copied
            ? <IconCheck size={12} stroke={1.8} className="text-emerald-500" />
           : <IconCopy size={12} stroke={1.8} className="text-fg-muted" />}
        </button>
      </div>
    </div>
  );
}
