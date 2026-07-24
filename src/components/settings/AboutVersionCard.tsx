/**
 * @file Settings — About section version/update card
 * @description Shows the running version, checks npm for a newer release,
 * and can trigger the server-side self-update (serverApplyUpdate) followed
 * by a page reload once the daemon confirms it restarted on the new build.
 *
 * @exports AboutVersionCard
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { serverApplyUpdate } from '../../lib/filesystem';

interface AboutVersionCardProps {
  currentVersion: string;
  updateStatus: 'idle' | 'checking' | 'upToDate' | 'available' | 'error';
  latestVersion: string | null;
  onCheckUpdate: () => void;
}

export function AboutVersionCard({ currentVersion, updateStatus, latestVersion, onCheckUpdate }: AboutVersionCardProps) {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState('');

  const handleApplyUpdate = async () => {
    setApplying(true);
    setApplyMsg('Installing update globally...');
    const result = await serverApplyUpdate();
    if (result && result.ok) {
      setApplyMsg('✓ Updated! Reloading...');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      setApplying(false);
      setApplyMsg(result?.message || 'Update failed');
    }
  };

  return (
    <div className="flex flex-col gap-6 px-5 py-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-fg-muted">Version</span>
          <span className="rounded-[5px] bg-bg-2 px-2.5 py-1 font-mono text-[13px] font-semibold text-fg">
            v{currentVersion}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-fg-muted">Status</span>
          {updateStatus === 'idle' && (
            <button
              onClick={onCheckUpdate}
              className="rounded-[5px] bg-bg-2 px-2.5 py-1 text-[12.5px] text-fg transition-colors hover:bg-bg-3"
            >
              {t('settings.checkForUpdates')}
            </button>
          )}
          {updateStatus === 'checking' && (
            <span className="text-[12.5px] text-fg-muted">{t('settings.checkingForUpdates')}</span>
          )}
          {updateStatus === 'upToDate' && (
            <span className="rounded-[5px] bg-success/10 px-2.5 py-1 text-[12.5px] font-medium text-success">
              ✓ {t('settings.upToDate')}
            </span>
          )}
          {updateStatus === 'available' && (
            <div className="flex items-center gap-2">
              <span className="rounded-[5px] bg-warning/10 px-2.5 py-1 text-[12.5px] font-medium text-warning">
                v{latestVersion} available
              </span>
              <button
                onClick={handleApplyUpdate}
                disabled={applying}
                className="rounded-[5px] bg-primary px-3 py-1 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {applying ? applyMsg : `Update to v${latestVersion}`}
              </button>
            </div>
          )}
          {updateStatus === 'error' && (
            <button
              onClick={onCheckUpdate}
              className="rounded-[5px] bg-bg-2 px-2.5 py-1 text-[12.5px] text-fg-muted transition-colors hover:bg-bg-3"
            >
              {t('settings.retry')}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-[7px] border border-border bg-bg-2 p-3">
        <p className="text-[12.5px] text-fg-muted">
          Kandown auto-updates automatically when launched. You can also click the Update button above to instantly upgrade to the latest release.
        </p>
      </div>


      <div className="flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-fg-faint">
          {t('settings.links') ?? 'Links'}
        </span>
        <a
          href="https://vanessadepraute.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-fg underline underline-offset-2 hover:text-fg-muted"
        >
          Author: Vanessa Depraute
        </a>
        <a
          href="https://github.com/vava-nessa"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-fg underline underline-offset-2 hover:text-fg-muted"
        >
          GitHub: vava-nessa
        </a>
        <a
          href="https://github.com/vava-nessa/kandown"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-fg underline underline-offset-2 hover:text-fg-muted"
        >
          Repository
        </a>
        <a
          href="https://www.npmjs.com/package/kandown"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-fg underline underline-offset-2 hover:text-fg-muted"
        >
          npm
        </a>
      </div>
    </div>
  );
}
