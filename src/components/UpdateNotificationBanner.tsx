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
 *
 * 📖 **A stale daemon is not the user's problem to solve.** This used to render a
 * modal telling the user to go and run `kandown daemon refresh-all` — a chore
 * handed to the one person who could not care less which process is serving
 * which build. The daemon now restarts itself onto the new version
 * (`scheduleDaemonSelfUpgrade` in the CLI), so all this component does for that
 * case is poll faster, show a thin non-blocking "finishing the upgrade" line
 * with no buttons, and reload the page once the daemon comes back current. The
 * full modal is reserved for a genuine new release the user may want to install.
 *
 * @see src/cli/lib/daemon.ts — scheduleDaemonSelfUpgrade, the half that acts
 */

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, RefreshCw, AlertCircle, X, Download } from 'lucide-react';
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

  /** 📖 True once we have seen the daemon lagging behind this bundle, so the
   *  moment it catches up we can reload onto the process that just replaced it
   *  (its watchers, SSE streams and port all died with the old one). */
  const sawStaleDaemon = useRef(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      const result = await serverCheckUpdate();
      if (!active) return;
      if (result) {
        // 📖 Always store the result, including when nothing is pending: keeping
        // the last "update available" payload around was what left the banner on
        // screen after the update had already been installed.
        setUpdateInfo(result);
        // 📖 A dismissal applies to the state that was dismissed, not forever. If
        // a newer version ships later, or the daemon falls behind, say so again.
        setDismissed(prev => (prev && result.latest === dismissedFor.current ? true : false));
        dismissedFor.current = result.latest;

        const running = result.running ?? result.current;
        const stale = !!running && compareSemver(KANDOWN_VERSION, running) > 0;
        if (stale) {
          sawStaleDaemon.current = true;
        } else if (sawStaleDaemon.current) {
          // 📖 The daemon restarted itself onto the current build. Reload so the
          // page is talking to the live process instead of holding connections
          // that ended with the old one.
          window.location.reload();
          return;
        }
      }
      // 📖 Poll every few seconds while an upgrade is finishing, and go back to
      // once every ten minutes otherwise. A stale daemon is a transient state
      // that resolves on its own within seconds; waiting ten minutes to notice
      // would leave the user staring at an indicator long after it was true.
      timer = setTimeout(check, sawStaleDaemon.current ? 4_000 : 10 * 60 * 1000);
    };

    check();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!updateInfo || dismissed) return null;

  // 📖 Two distinct states, and conflating them is what made the banner nag:
  //  - trulyAvailable, the registry has something newer than the version this
  //    web bundle ships with. Real upgrade: click "Update Now".
  //  - daemonIsStale, this web bundle is newer than the daemon process serving
  //    it (running / current). The npm install already landed, only the long-
  //    lived daemon process is stuck on its old compiled code. Re-downloading
  //    would change nothing, and the daemon is already restarting itself, so
  //    this state is reported and waited out, never acted on.
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

  // 📖 Stale daemon: the CLI is already restarting itself onto this version, so
  // there is nothing to ask and nothing to click. A single quiet line that
  // removes itself when the reload lands, rather than a modal handing the user
  // a command to copy.
  if (!trulyAvailable && daemonIsStale) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div
          className="flex items-center gap-2 rounded-full border border-border/60 bg-popover/90 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
          <span>Finishing update to v{KANDOWN_VERSION}…</span>
        </div>
      </div>
    );
  }

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
                {`Kandown v${updateInfo.latest} is available`}
              </h4>
              <p className="text-xs text-muted-foreground">
                {`Current: v${KANDOWN_VERSION}. Get the latest features & fixes.`}
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
          <button
            onClick={() => setDismissed(true)}
            disabled={updating}
            className="px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
          >
            Later
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
