/**
 * @file Git initialization banner (t309)
 * @description Dismissible info banner shown when the daemon reports that the
 * project folder is not a git repository (`gitWarning: 'not-a-git-repo'` on
 * the POST /api/agent/sessions response): agent edits then leave no git
 * history to diff, revert or audit, which the user should know before letting
 * a harness write freely.
 *
 * 📖 Intentionally NOT wired into the creation flow here: the create response
 * is consumed by agentChatSlice (outside this task's file list). The
 * integrator renders `<GitInitBanner onDismiss={...} />` where that response
 * lands (e.g. under the sidebar header) when the parsed body carries
 * `gitWarning: 'not-a-git-repo'`, and clears its dismissed flag on session
 * switch. Until then the component ships as a pure presentational export.
 *
 * @functions
 *  → GitInitBanner: dismissible info banner
 *
 * @exports GitInitBanner
 */

import { useTranslation } from 'react-i18next';

interface GitInitBannerProps {
  /** Called when the user dismisses the banner. Omit to render without a
   * dismiss control (the host then owns the lifetime). */
  onDismiss?: () => void;
  className?: string;
}

export function GitInitBanner({ onDismiss, className = '' }: GitInitBannerProps) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={`rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 ${className}`}
    >
      <div className="text-[11.5px] font-semibold text-sky-800 dark:text-sky-200">
        {t('agentEdits.gitWarningTitle', 'Project folder is not a git repository')}
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-sky-700 dark:text-sky-300">
        {t('agentEdits.gitWarningBody', 'Agent edits cannot be tracked or reverted without git. Run git init in the project folder so every change stays recoverable.')}
      </p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-1 text-[10.5px] font-semibold text-sky-800 underline underline-offset-2 transition-opacity hover:opacity-75 dark:text-sky-200"
        >
          {t('agentEdits.dismiss', 'Dismiss')}
        </button>
      )}
    </div>
  );
}
