/**
 * @file useAgentHarnesses: web UI hook for the detected harness catalog
 * @description Loads the coding-agent harnesses detected by the backend
 * (`/api/agent/harnesses`) for the Settings agent panel. Detection runs in
 * Node (the kandown daemon or the Vite dev middleware); the browser only
 * renders the JSON result.
 *
 * 📖 Unlike useDetectedAgents there is deliberately no module-level cache:
 * harness installs and upgrades happen outside the app, so a session cache
 * would keep showing stale versions (or a missing harness) after the user
 * installs a CLI. Every mount and every refresh() call re-asks the backend.
 *
 * 📖 `harnesses` is null when no backend answered: standalone File System
 * Access mode, the demo, or a daemon older than the route. Callers show an
 * informational "daemon required" card, not an error. Off-server the hook
 * never fetches at all.
 *
 * @functions
 *  → useAgentHarnesses: the hook
 *
 * @exports useAgentHarnesses
 * @see src/lib/filesystem.ts, fetchAgentHarnesses (the REST call)
 * @see src/components/settings/AgentHarnessesPanel.tsx, the consumer
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchAgentHarnesses, isServerMode } from '../lib/filesystem';
import type { DetectedHarness } from '../lib/types';

export interface AgentHarnessesState {
  /** 📖 Detected harnesses, or null when no backend answered (standalone mode
   * or route unavailable). An empty array means the daemon answered and found
   * nothing installed. */
  harnesses: DetectedHarness[] | null;
  /** 📖 Re-run detection (installs and upgrades happen outside the app). */
  refresh: () => void;
  /** 📖 True while a detection request is in flight. */
  loading: boolean;
}

/**
 * 📖 Returns the detected-harness list for the Settings panel, fetching on
 * mount (server mode only) and whenever refresh() is called. Safe to unmount
 * mid-request: the resolved fetch is dropped instead of setting state on a
 * dead component.
 */
export function useAgentHarnesses(): AgentHarnessesState {
  const [harnesses, setHarnesses] = useState<DetectedHarness[] | null>(null);
  const [loading, setLoading] = useState<boolean>(() => isServerMode());
  // 📖 A token bump re-runs the effect, which is what refresh() needs; the
  // callback itself stays referentially stable for consumers.
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken(token => token + 1), []);

  useEffect(() => {
    if (!isServerMode()) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void fetchAgentHarnesses().then(list => {
      if (!alive) return;
      setHarnesses(list);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [refreshToken]);

  return { harnesses, refresh, loading };
}
