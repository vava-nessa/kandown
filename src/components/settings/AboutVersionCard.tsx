/**
 * @file Settings — About section version/update card
 * @description Shows the running version, checks npm for a newer release,
 * and can trigger the server-side self-update (serverApplyUpdate) followed
 * by a page reload once the daemon confirms it restarted on the new build.
 *
 * 📖 **Version badge → changelog.** The version row now sits above a one-line
 * "Read changelog for vX.Y.Z" link that opens the site's
 * `/changelogs/vX.Y.Z` page in a new tab. The version used to be a dead
 * label; now it is the entry point to the notes that produced it.
 *
 * 📖 **GitHub stars row.** Reuses the same cache and formatter as the
 * marketing site's header pill, so the count in the running app matches
 * the badge in the browser — the same visitor, the same number.
 *
 * 📖 **Demo build guard.** The web demo runs in a browser without the
 * repo, so the changelog link is swapped for the GitHub release page —
 * still useful, still external, just one layer further from the source.
 *
 * @exports AboutVersionCard
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { serverApplyUpdate } from '../../lib/filesystem';
import { GitHubStarsRow } from './GitHubStarsRow';

interface AboutVersionCardProps {
  currentVersion: string;
  updateStatus: 'idle' | 'checking' | 'upToDate' | 'available' | 'error';
  latestVersion: string | null;
  onCheckUpdate: () => void;
}

const CHANGELOG_SITE_URL = 'https://kandown.dev/changelogs';
const GITHUB_REPO_URL = 'https://github.com/vava-nessa/kandown';
// 📖 Vite defines `__KANDOWN_DEMO_BUILD__` for the demo bundle. In every
// other build (the standalone web app, the CLI daemon) the constant is
// undefined and the real changelog URL is used.
declare const __KANDOWN_DEMO_BUILD__: boolean | undefined;

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

        {/* 📖 The version row gets a one-line companion below it: a discreet
            link to the matching changelog page, opened in a new tab. The
            demo build points at the GitHub release instead, since the
            site's `/changelogs` page is not part of the demo bundle. */}
        <div className="-mt-1 flex items-center justify-end text-[12px]">
          <a
            href={
              typeof __KANDOWN_DEMO_BUILD__ !== 'undefined' && __KANDOWN_DEMO_BUILD__
                ? `${GITHUB_REPO_URL}/releases/tag/v${currentVersion}`
                : `${CHANGELOG_SITE_URL}/v${currentVersion}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg-muted underline decoration-border underline-offset-[3px] transition-colors hover:text-fg hover:decoration-primary"
          >
            Read changelog for v{currentVersion} →
          </a>
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

      {/* 📖 Stars row slots into the same Version / Status grid above. */}
      <GitHubStarsRow href={GITHUB_REPO_URL} />


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
        <a
          href="https://www.reddit.com/r/kandown/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-fg underline underline-offset-2 hover:text-fg-muted"
        >
          Reddit: r/kandown
        </a>
        {/* 📖 Full changelog index lives next to the npm link. The version
            link further up only opens one release; this is the entry point
            for someone browsing the whole history. */}
        <a
          href={
            typeof __KANDOWN_DEMO_BUILD__ !== 'undefined' && __KANDOWN_DEMO_BUILD__
              ? `${GITHUB_REPO_URL}/releases`
              : CHANGELOG_SITE_URL
          }
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-fg underline underline-offset-2 hover:text-fg-muted"
        >
          Changelog
        </a>
      </div>
    </div>
  );
}
