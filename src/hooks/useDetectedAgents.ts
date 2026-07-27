/**
 * @file useDetectedAgents — web UI hook for the detected agent catalog
 * @description Loads the AI agents detected by the backend (`/api/agents`) and
 * caches them for the session. The browser cannot inspect `$PATH`, so detection
 * runs server-side (the kandown daemon, or the Vite dev middleware in
 * `vite.config.ts` — both Node) and this hook consumes the JSON result.
 *
 * 📖 Returns only the *installed* agents in practice is left to the caller via
 * `agent.installed`; the hook returns the full list so a component can also
 * show the uninstalled ones greyed out if it wants. A module-level cache keeps
 * the fetch to one per session — agents don't appear/disappear mid-session.
 *
 * 📖 Non-server (pure browser / File System Access) mode gets `[]` because
 * there is no backend to ask — the caller then falls back to a free-text
 * assignee field, matching the pre-t262 behaviour.
 *
 * @functions
 *  → useDetectedAgents — the hook
 *
 * @exports useDetectedAgents
 * @see src/lib/filesystem.ts — fetchDetectedAgents (the REST call)
 * @see src/cli/lib/agents.ts — detectCatalogJSON (the server-side detection)
 */

import { useEffect, useState } from 'react';
import { fetchDetectedAgents } from '../lib/filesystem';
import type { DetectedAgent } from '../lib/types';

/** 📖 Session-level cache so opening/closing the assignee menu doesn't refetch. */
let cache: DetectedAgent[] | null = null;

/**
 * 📖 Returns the detected-agent list, fetching once on first use. Re-renders
 * callers when the fetch resolves. Safe to call from many components — they all
 * share the cache.
 */
export function useDetectedAgents(): DetectedAgent[] {
  const [agents, setAgents] = useState<DetectedAgent[]>(cache ?? []);

  useEffect(() => {
    let alive = true;
    if (cache) {
      setAgents(cache);
      return;
    }
    void fetchDetectedAgents().then(list => {
      if (!alive) return;
      cache = list ?? [];
      setAgents(cache);
    });
    return () => { alive = false; };
  }, []);

  return agents;
}

/** 📖 Test-only: reset the cache (e.g. between integration runs). */
export function resetDetectedAgentsCache(): void {
  cache = null;
}
