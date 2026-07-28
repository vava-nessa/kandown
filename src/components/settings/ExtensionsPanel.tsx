/**
 * @file Extensions settings panel
 * @description Web UI surface for the extension system: lists installed
 * extensions with their health and contributions, lets the user enable/disable
 * them, and toggles restricted mode (default on). Backed by the daemon's
 * `/api/extensions` routes (see src/cli/lib/server.ts). Outside server mode
 * (standalone File System Access and demo), the panel reports that extensions
 * require the daemon.
 *
 * @see docs/EXTENSIONS.md
 * @see src/lib/filesystem.ts (serverListExtensions / serverEnableExtension / serverDisableExtension)
 */

import { useCallback, useEffect, useState } from 'react';
import { IconPlugConnected, IconRefresh, IconCheck, IconX, IconDownload, IconExternalLink } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import {
  serverListExtensions,
  serverEnableExtension,
  serverDisableExtension,
  serverFetchRegistry,
  serverInstallExtension,
  type ExtensionSummary,
  type RegistryEntry,
  type RegistryResult,
} from '../../lib/filesystem';

function healthClasses(health: string): string {
  if (health === 'enabled') return 'text-emerald-500';
  if (health === 'errored' || health === 'quarantined') return 'text-red-500';
  return 'text-fg-muted';
}

export function ExtensionsPanel() {
  const config = useStore(s => s.config);
  const updateConfig = useStore(s => s.updateConfig);
  const toast = useStore(s => s.toast);

  const [extensions, setExtensions] = useState<ExtensionSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await serverListExtensions();
    setExtensions(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const restricted = config.extensions?.restricted ?? true;

  const [registry, setRegistry] = useState<RegistryResult | null>(null);
  const [pasteUrl, setPasteUrl] = useState('');
  const [installBusy, setInstallBusy] = useState(false);

  const loadRegistry = useCallback(async () => {
    const r = await serverFetchRegistry();
    setRegistry(r);
  }, []);

  useEffect(() => { void loadRegistry(); }, [loadRegistry]);

  const install = useCallback(async (input: { entry?: RegistryEntry; url?: string }) => {
    setInstallBusy(true);
    try {
      const result = await serverInstallExtension(input);
      if (result?.ok) {
        toast(`Installed ${result.id}. Enable it from the list below.`, 'success');
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

  const installedIds = new Set(extensions?.map((e) => e.id) ?? []);

  const toggle = useCallback(async (id: string, enable: boolean) => {
    setBusyId(id);
    try {
      const next = enable ? await serverEnableExtension(id) : (await serverDisableExtension(id)) ? await serverListExtensions() : null;
      if (next) setExtensions(next);
      else await refresh();
      toast(enable ? `Enabled ${id}` : `Disabled ${id}`, 'success');
    } catch (e) {
      toast(`Failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusyId(null);
    }
  }, [refresh, toast]);

  if (loading) {
    return <div className="px-4 py-10 text-center text-[13px] text-fg-muted">Loading extensions…</div>;
  }

  if (extensions === null) {
    return (
      <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1 px-4 py-10 text-center">
        <p className="text-[14px] font-medium text-fg">Extensions require the kandown daemon</p>
        <p className="mt-1 text-[13px] text-fg-muted">Run `kandown` in this project to start the server, or manage extensions from the CLI with `kandown extension`.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Restricted mode toggle */}
      <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1">
        <div className="flex items-center justify-between gap-4 px-4 py-4">
          <div>
            <div className="text-[14px] font-medium text-fg">Restricted mode</div>
            <div className="mt-0.5 text-[12.5px] text-fg-muted">When on (default), extensions load disabled until you enable them. Turn off to auto-enable trusted extensions.</div>
          </div>
          <button
            type="button"
            onClick={() => updateConfig(c => ({ ...c, extensions: { restricted: !restricted } }))}
            className={`relative h-6 w-11 flex-none rounded-full transition-colors ${restricted ? 'bg-emerald-500' : 'bg-border'}`}
            aria-pressed={restricted}
            aria-label="Toggle restricted mode"
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${restricted ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

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
            const busy = installBusy;
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
                    disabled={busy || installed}
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
          <div className="mt-0.5 text-[12px] text-fg-muted">Paste a github.com repo URL (e.g. <span className="font-mono">https://github.com/you/kandown-foo</span>). We fetch <span className="font-mono">manifest.json</span> from the repo root and copy the extension into <span className="font-mono">.kandown/extensions/</span>.</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="https://github.com/you/kandown-foo"
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

      {/* Installed extensions */}
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-medium text-fg">Installed extensions</div>
        <button type="button" onClick={() => void refresh()} className="flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
          <IconRefresh size={14} stroke={1.8} /> Refresh
        </button>
      </div>

      {extensions.length === 0 ? (
        <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1 px-4 py-10 text-center">
          <IconPlugConnected size={22} stroke={1.6} className="mx-auto text-fg-muted" />
          <p className="mt-2 text-[14px] font-medium text-fg">No extensions installed</p>
          <p className="mt-1 text-[13px] text-fg-muted">Scaffold one with `kandown extension create &lt;name&gt;`, or install an example from `examples/extensions/`.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1">
          {extensions.map((ext, i) => (
            <div key={ext.id} className={`px-4 py-3.5 ${i > 0 ? 'border-t border-border' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[12px] font-medium uppercase tracking-wide ${healthClasses(ext.health)}`}>{ext.health}</span>
                    <span className="truncate text-[14px] font-medium text-fg">{ext.id}</span>
                    <span className="text-[12px] text-fg-muted">v{ext.version}</span>
                    <span className="rounded-full bg-bg-2 px-1.5 py-0.5 text-[11px] text-fg-muted">{ext.source}</span>
                  </div>
                  {ext.error && <div className="mt-0.5 truncate text-[12px] text-red-500">↳ {ext.error}</div>}
                  {!ext.error && (ext.fields.length || ext.commands.length || ext.gates || ext.syncs || ext.panels.length) > 0 && (
                    <div className="mt-0.5 text-[12px] text-fg-muted">
                      {[
                        ext.fields.length && `${ext.fields.length} field${ext.fields.length > 1 ? 's' : ''}`,
                        ext.panels.length && `${ext.panels.length} panel${ext.panels.length > 1 ? 's' : ''}`,
                        ext.commands.length && `${ext.commands.length} command${ext.commands.length > 1 ? 's' : ''}`,
                        ext.gates && `${ext.gates} gate${ext.gates > 1 ? 's' : ''}`,
                        ext.syncs && `${ext.syncs} sync${ext.syncs > 1 ? 's' : ''}`,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busyId === ext.id}
                  onClick={() => void toggle(ext.id, ext.health !== 'enabled')}
                  className="flex flex-none items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12.5px] text-fg hover:bg-bg-2 disabled:opacity-50"
                >
                  {ext.health === 'enabled' ? <IconX size={13} stroke={1.8} /> : <IconCheck size={13} stroke={1.8} />}
                  {ext.health === 'enabled' ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[12px] text-fg-muted">Install and scaffold extensions from the CLI: `kandown extension install/create`. See the authoring guide in docs/EXTENSIONS-AUTHORING.md.</p>
    </div>
  );
}
