/**
 * @file Update Notification Banner & Modal
 * @description Non-intrusive, floating update notification banner and 1-click installer
 * prompt for the Web UI.
 *
 * 📖 **Source of truth = this web bundle, not the daemon's `/api/update/check`.**
 * The daemon is a long-lived Node process; its compiled `KANDOWN_VERSION` lags
 * behind the package on disk by one global install. An older daemon can happily
 * report `updateAvailable: true` for a version the user is already on (because
 * it compares the registry against its own frozen constant). The banner trusts
 * `KANDOWN_VERSION` instead and only treats the daemon payload as a hint, so a
 * stale daemon cannot nag a user who is already up to date.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, RefreshCw, CheckCircle2, AlertCircle, X, Download } from 'lucide-react';
import { serverCheckUpdate, serverApplyUpdate, UpdateCheckResult } from '../lib/filesystem';
import { KANDOWN_VERSION } from '../lib/version';

/** 📖 Returns 1 if a > b, -1 if a < b, 0 if equal. Prerelease is ignored; the
 * project's versions are plain `MAJOR.MINOR.PATCH`. */
function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] =>
    String(v).replace(/^v/, '').split('-')[0].split('.').map(n => Number(n) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const av = pa[i] || 0;
    const bv = pb[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export const UpdateNotificationBanner: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');
  /** 📖 Which `latest` the user dismissed, so a newer one re-opens the banner. */
  const dismissedFor = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const result = await serverCheckUpdate();
      if (!active || !result) return;
      // 📖 Always store the result, including when nothing is pending: keeping
      // the last "update available" payload around was what left the banner on
      // screen after the update had already been installed.
      setUpdateInfo(result);
      // 📖 A dismissal applies to the state that was dismissed, not forever. If
      // a newer version ships later, or the daemon falls behind, say so again.
      setDismissed(prev => (prev && result.latest === dismissedFor.current ? true : false));
      dismissedFor.current = result.latest;
    };
    check();
    const interval = setInterval(check, 10 * 60 * 1000); // 10 minutes
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (!updateInfo || dismissed) return null;

  // 📖 Two distinct states, and conflating them is what made the banner nag:
  //  - trulyAvailable, the registry has something newer than the version this
  //    web bundle ships with. Real upgrade: click "Update Now".
  //  - daemonIsStale, this web bundle is newer than the daemon process serving
  //    it (running / current). The npm install already landed, only the long-
  //    lived daemon process is stuck on its old compiled code. Re-downloading
  //    would change nothing; only a `kandown daemon refresh-all` will.
  //
  // We do NOT trust the daemon's `updateAvailable` flag as the primary signal:
  // a daemon that was launched before a package upgrade still compares the
  // registry against its own frozen `KANDOWN_VERSION` and reports a phantom
  // update. `KANDOWN_VERSION` (compiled into this very web bundle) is the
  // ground truth for "what version is the user actually on?".
  const reportedRunning = updateInfo.running ?? updateInfo.current;
  const trulyAvailable =
    !!updateInfo.updateAvailable && !!updateInfo.latest &&
    compareSemver(updateInfo.latest, KANDOWN_VERSION) > 0;
  const daemonIsStale =
    !!reportedRunning &&
    compareSemver(KANDOWN_VERSION, reportedRunning) > 0;
  if (!trulyAvailable && !daemonIsStale) return null;

  const handleApplyUpdate = async () => {
    setUpdating(true);
    setErrorText('');
    setStatusText(`Installing kandown@${updateInfo.latest} globally…`);

    const result = await serverApplyUpdate();
    if (result && result.ok) {
      setStatusText(`✓ Updated to v${result.version || updateInfo.latest}! Reloading page…`);
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } else {
      setUpdating(false);
      setErrorText(result?.message || 'Update installation failed. Check terminal permissions.');
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md w-full animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="bg-popover/95 backdrop-blur-md border border-primary/30 rounded-xl p-4 shadow-2xl text-popover-foreground flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold tracking-tight flex items-center gap-1.5">
                {trulyAvailable
                  ? `Kandown v${updateInfo.latest} is available`
                  : `Daemon is running v${reportedRunning}`}
              </h4>
              <p className="text-xs text-muted-foreground">
                {trulyAvailable
                  ? `Current: v${KANDOWN_VERSION}. Get the latest features & fixes.`
                  : `The installed package is v${KANDOWN_VERSION}, but this server is still on v${reportedRunning}. Restart the daemon to finish the upgrade.`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-secondary/80 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorText && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded-lg border border-destructive/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorText}</span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-1">
          {!trulyAvailable ? (
            <code className="flex-1 px-3 py-2 text-xs font-mono bg-secondary/60 rounded-lg text-foreground/90 select-all">
              kandown daemon refresh-all
            </code>
          ) : (
          <button
            onClick={handleApplyUpdate}
            disabled={updating}
            className="flex-1 px-3 py-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {updating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Updating…</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Update Now to v{updateInfo.latest}</span>
              </>
            )}
          </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            disabled={updating}
            className="px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
          >
            {trulyAvailable ? 'Later' : 'Dismiss'}
          </button>
        </div>

        {updating && statusText && (
          <p className="text-[11px] text-center text-muted-foreground animate-pulse">
            {statusText}
          </p>
        )}
      </div>
    </div>
  );
};
