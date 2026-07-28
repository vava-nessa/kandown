/**
 * @file Themes settings panel
 * @description Web UI surface for the community theme store: lists installed
 * themes (from `.kandown/themes/<id>.json` via the daemon), lets the user
 * browse and one-click install entries from the curated community registry,
 * and removes installed themes. Backed by the daemon's `/api/themes*`
 * routes (see src/cli/lib/server.ts). Outside server mode (standalone File
 * System Access and demo), the panel reports that the store needs the daemon.
 *
 * @see src/cli/lib/themes-store.ts
 * @see src/lib/filesystem.ts (serverListThemes / serverInstallTheme / serverUninstallTheme / serverFetchThemeRegistry)
 */

import { useCallback, useEffect, useState } from 'react';
import { IconPalette, IconRefresh, IconDownload, IconExternalLink, IconTrash, IconUpload } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import {
  serverListThemes,
  serverInstallTheme,
  serverUninstallTheme,
  serverFetchThemeRegistry,
  type InstalledThemeSummary,
  type RegistryFetchResult,
} from '../../lib/filesystem';
import { registerCustomThemes } from '../../lib/theme';

export function ThemesPanel() {
  const config = useStore(s => s.config);
  const updateConfig = useStore(s => s.updateConfig);
  const toast = useStore(s => s.toast);

  const [themes, setThemes] = useState<InstalledThemeSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [installBusy, setInstallBusy] = useState(false);
  const [registry, setRegistry] = useState<RegistryFetchResult | null>(null);
  const [pasteUrl, setPasteUrl] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await serverListThemes();
    setThemes(list ?? []);
    setLoading(false);
  }, []);

  const loadRegistry = useCallback(async () => {
    const r = await serverFetchThemeRegistry();
    setRegistry(r);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void loadRegistry(); }, [loadRegistry]);

  const installedIds = new Set(themes?.map((t) => t.id) ?? []);

  const install = useCallback(async (input: { entry?: RegistryFetchResult['entries'][number]; url?: string }) => {
    setInstallBusy(true);
    try {
      const result = await serverInstallTheme(input);
      if (result?.ok) {
        toast(`Installed ${result.id}. Pick it from the Skin gallery.`, 'success');
        await refresh();
      } else {
        toast(`Install failed: ${result?.error ?? 'unknown error'}`, 'error');
      }
    } catch (e) {
      toast(`Install failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setInstallBusy(false);
    }
  }, [refresh, toast]);

  const uninstall = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      const result = await serverUninstallTheme(id);
      if (result?.ok) {
        toast(`Removed ${id}.`, 'success');
        await refresh();
      } else {
        toast(`Uninstall failed: ${result?.error ?? 'unknown error'}`, 'error');
      }
    } catch (e) {
      toast(`Uninstall failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusyId(null);
    }
  }, [refresh, toast]);

  if (loading) {
    return <div className="px-4 py-10 text-center text-[13px] text-fg-muted">Loading themes…</div>;
  }

  if (themes === null) {
    return (
      <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1 px-4 py-10 text-center">
        <p className="text-[14px] font-medium text-fg">Theme store requires the kandown daemon</p>
        <p className="mt-1 text-[13px] text-fg-muted">Run <span className="font-mono">kandown</span> in this project, or manage themes from the CLI with <span className="font-mono">kandown theme</span>.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Community store */}
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-medium text-fg">Community store</div>
        <button type="button" onClick={() => void loadRegistry()} className="flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
          <IconRefresh size={14} stroke={1.8} /> Refresh
        </button>
      </div>
      {registry?.error && (
        <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1 px-4 py-3 text-[12.5px] text-fg-muted">
          Store unavailable: <span className="text-red-500">{registry.error}</span>
          {registry.url && <span className="ml-1 text-fg-muted">({registry.url})</span>}
        </div>
      )}
      {registry && registry.entries.length > 0 && (
        <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1">
          {registry.entries.map((entry, i) => {
            const installed = installedIds.has(entry.id);
            return (
              <div key={entry.id} className={`px-4 py-3.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-fg">{entry.name}</span>
                      <span className="text-[12px] text-fg-muted">· {entry.author ?? 'unknown'}</span>
                      {entry.minKandownVersion && <span className="rounded-full bg-bg-2 px-1.5 py-0.5 text-[11px] text-fg-muted">≥ {entry.minKandownVersion}</span>}
                      {installed && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-500">installed</span>}
                    </div>
                    {entry.description && <div className="mt-0.5 text-[12.5px] text-fg-muted">{entry.description}</div>}
                    <a href={entry.repo} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg">
                      <IconExternalLink size={11} stroke={1.8} /> {entry.repo}
                    </a>
                  </div>
                  <button
                    type="button"
                    disabled={installBusy || installed}
                    onClick={() => void install({ entry })}
                    className="flex flex-none items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12.5px] text-fg hover:bg-bg-2 disabled:opacity-50"
                  >
                    <IconDownload size={13} stroke={1.8} />
                    {installed ? 'Installed' : 'Install'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paste-URL install */}
      <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1">
        <div className="px-4 py-3.5">
          <div className="text-[13px] font-medium text-fg">Install from GitHub URL</div>
          <div className="mt-0.5 text-[12px] text-fg-muted">Paste a github.com repo URL or a raw.githubusercontent.com theme JSON URL. We copy the file into <span className="font-mono">.kandown/themes/</span>.</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="https://github.com/you/kandown-theme-foo"
              className="h-8 flex-1 rounded-md border border-border bg-bg-1 px-2 text-[13px] text-fg outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={installBusy || !pasteUrl.trim()}
              onClick={() => { const u = pasteUrl.trim(); if (u) void install({ url: u }); }}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12.5px] text-fg hover:bg-bg-2 disabled:opacity-50"
            >
              <IconDownload size={13} stroke={1.8} /> Install
            </button>
          </div>
        </div>
      </div>

      {/* Open customizer */}
      <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <IconPalette size={18} stroke={1.8} className="flex-none text-fg-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-fg">Theme editor</div>
            <div className="text-[12px] text-fg-muted">Open the floating editor to tweak a theme, export it as JSON, or propose it to the community store.</div>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('kandown:open-customizer', { detail: { mode: 'create' } }))}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12.5px] text-fg hover:bg-bg-2"
          >
            <IconUpload size={13} stroke={1.8} /> Open editor
          </button>
        </div>
      </div>

      {/* Installed themes */}
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-medium text-fg">Installed themes</div>
        <button type="button" onClick={() => void refresh()} className="flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
          <IconRefresh size={14} stroke={1.8} /> Refresh
        </button>
      </div>

      {themes.length === 0 ? (
        <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1 px-4 py-10 text-center">
          <IconPalette size={22} stroke={1.6} className="mx-auto text-fg-muted" />
          <p className="mt-2 text-[14px] font-medium text-fg">No community themes installed</p>
          <p className="mt-1 text-[13px] text-fg-muted">Pick one from the store above, or <span className="font-mono">kandown theme install &lt;url&gt;</span>.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1">
          {themes.map((theme, i) => (
            <div key={theme.id} className={`px-4 py-3.5 ${i > 0 ? 'border-t border-border' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-fg">{theme.name}</span>
                    <span className="font-mono text-[12px] text-fg-muted">{theme.id}</span>
                    <span className="text-[12px] text-fg-muted">· {theme.author ?? 'unknown'}</span>
                  </div>
                  {theme.description && <div className="mt-0.5 text-[12px] text-fg-muted">{theme.description}</div>}
                </div>
                <button
                  type="button"
                  disabled={busyId === theme.id}
                  onClick={() => void uninstall(theme.id)}
                  className="flex flex-none items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12.5px] text-fg hover:bg-bg-2 disabled:opacity-50"
                >
                  <IconTrash size={13} stroke={1.8} /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[12px] text-fg-muted">
        Browse the community catalog at <a href="https://kandown.dev/themes" target="_blank" rel="noreferrer" className="text-accent hover:underline">kandown.dev/themes</a>.
        Propose a new theme with <span className="font-mono">kandown theme publish &lt;file.json&gt;</span> or the editor's "Propose on GitHub" button.
      </p>
    </div>
  );
}