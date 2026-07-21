/**
 * @file Update Notification Banner & Modal
 * @description Non-intrusive, floating update notification banner and 1-click installer
 * prompt for the Web UI.
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, CheckCircle2, AlertCircle, X, Download } from 'lucide-react';
import { serverCheckUpdate, serverApplyUpdate, UpdateCheckResult } from '../lib/filesystem';

export const UpdateNotificationBanner: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    let active = true;
    const check = async () => {
      const result = await serverCheckUpdate();
      if (active && result && result.updateAvailable) {
        setUpdateInfo(result);
      }
    };
    check();
    const interval = setInterval(check, 10 * 60 * 1000); // 10 minutes
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (!updateInfo || !updateInfo.updateAvailable || dismissed) {
    return null;
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
                Kandown v{updateInfo.latest} is available
              </h4>
              <p className="text-xs text-muted-foreground">
                Current: v{updateInfo.current} — Get the latest features & fixes.
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
