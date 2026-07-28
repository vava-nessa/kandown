/**
 * @file Browser extension runtime provider
 * @description Hydrates one project-wide extension snapshot for fields, panels
 * and card badges. Server mode asks the daemon for Node-computed badges;
 * standalone mode activates project-local bundled index.js files through the
 * File System Access adapter. Components consume one context, avoiding a fetch
 * per card and keeping daemon details out of extension code.
 *
 * @functions
 *  → ExtensionRuntimeProvider: loads and refreshes the active runtime
 *  → useExtensionRuntime: reads summaries, badges and scoped runtime actions
 * @exports ExtensionRuntimeProvider, useExtensionRuntime
 * @see src/lib/extensions/browser-runtime.ts
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../lib/store';
import {
  isDemoMode,
  isServerMode,
  serverLoadExtensionRuntime,
  serverReportExtensionOutcome,
} from '../lib/filesystem';
import {
  invalidateStandaloneExtensions,
  loadExtensionWebModule,
  loadStandaloneExtensionRuntime,
  reportStandalonePanelOutcome,
  type ExtensionWebModule,
} from '../lib/extensions/browser-runtime';
import type { ExtensionRuntimePayload, TaskLike } from '../lib/extensions/types';

interface ExtensionRuntimeContextValue extends ExtensionRuntimePayload {
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
  loadWebModule(extId: string, entry: string): Promise<ExtensionWebModule>;
  reportPanelOutcome(extId: string, outcome: 'success' | 'failure', error?: string): Promise<void>;
}

const EMPTY: ExtensionRuntimePayload = { extensions: [], badges: {} };
const ExtensionRuntimeContext = createContext<ExtensionRuntimeContextValue | null>(null);

function toTaskLike(id: string, frontmatter: Record<string, unknown>): TaskLike {
  const plugins = frontmatter.plugins;
  return {
    id,
    frontmatter,
    plugins: plugins && typeof plugins === 'object' && !Array.isArray(plugins)
      ? plugins as Record<string, unknown>
      : undefined,
  };
}

export function ExtensionRuntimeProvider({ children }: { children: ReactNode }) {
  const dirHandle = useStore((state) => state.dirHandle);
  const projectName = useStore((state) => state.projectName);
  const columns = useStore((state) => state.columns);
  const archivedTasks = useStore((state) => state.archivedTasks);
  const restricted = useStore((state) => state.config.extensions?.restricted ?? true);
  const projectOpen = useStore((state) => state.isOpen);
  const toast = useStore((state) => state.toast);
  const [payload, setPayload] = useState<ExtensionRuntimePayload>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const tasks = useMemo(() => [
    ...columns.flatMap((column) => column.tasks.map((task) => toTaskLike(task.id, task.frontmatter as Record<string, unknown>))),
    ...archivedTasks.map((task) => toTaskLike(task.id, task.frontmatter as Record<string, unknown>)),
  ], [archivedTasks, columns]);

  const refresh = useCallback(async () => {
    setRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!projectOpen && !dirHandle) {
      setPayload(EMPTY);
      setError(null);
      return;
    }
    if (isDemoMode()) {
      setPayload(EMPTY);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      try {
        const next = isServerMode()
          ? await serverLoadExtensionRuntime()
          : dirHandle
            ? await loadStandaloneExtensionRuntime(
                dirHandle,
                restricted,
                tasks,
                projectName ?? 'unnamed-project',
                (manifest) => window.confirm(
                  `Trust and enable extension "${manifest.name}" (${manifest.id}) for this local project?\n\n` +
                  'Kandown will ask again if the extension code changes.',
                ),
              )
            : EMPTY;
        if (!cancelled) {
          setPayload(next ?? EMPTY);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setPayload(EMPTY);
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [dirHandle, projectName, projectOpen, restricted, revision, tasks]);

  useEffect(() => {
    const onExtensionsChanged = () => {
      invalidateStandaloneExtensions();
      void refresh();
    };
    window.addEventListener('kandown:extensions-changed', onExtensionsChanged);
    return () => window.removeEventListener('kandown:extensions-changed', onExtensionsChanged);
  }, [refresh]);

  useEffect(() => () => invalidateStandaloneExtensions(), []);

  const loadWebModule = useCallback((extId: string, entry: string) => (
    loadExtensionWebModule(dirHandle, extId, entry)
  ), [dirHandle]);

  const reportPanelOutcome = useCallback(async (
    extId: string,
    outcome: 'success' | 'failure',
    message?: string,
  ) => {
    const result = isServerMode()
      ? await serverReportExtensionOutcome(extId, outcome, message)
      : dirHandle
        ? await reportStandalonePanelOutcome(dirHandle, extId, outcome, message)
        : null;
    if (result?.health === 'quarantined') {
      toast(`${extId} was quarantined after ${result.failures} panel crashes`, 'error', 8000);
      await refresh();
    }
  }, [dirHandle, refresh, toast]);

  const value = useMemo<ExtensionRuntimeContextValue>(() => ({
    ...payload,
    loading,
    error,
    refresh,
    loadWebModule,
    reportPanelOutcome,
  }), [error, loadWebModule, loading, payload, refresh, reportPanelOutcome]);

  return <ExtensionRuntimeContext.Provider value={value}>{children}</ExtensionRuntimeContext.Provider>;
}

export function useExtensionRuntime(): ExtensionRuntimeContextValue {
  const context = useContext(ExtensionRuntimeContext);
  if (!context) throw new Error('useExtensionRuntime must be used inside ExtensionRuntimeProvider');
  return context;
}
