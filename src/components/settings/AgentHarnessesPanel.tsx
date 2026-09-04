/**
 * @file Agent harnesses settings panel
 * @description Settings surface for the kandown agent harness catalog (t307).
 * Lists every coding-agent CLI the backend detected on this machine with its
 * wire protocol, version, resolved binary path, and how faithfully it supports
 * each permission mode, highlighting the project's current
 * `agent.permissionMode`. Missing harnesses get a copyable install command
 * (or a link when the hint is a URL). Kandown only drives harnesses that are
 * already installed and already authenticated, so the header states up front
 * that no API key is ever requested.
 *
 * 📖 Outside server mode no backend can run detection, so the panel shows an
 * informational "daemon required" card: that is an expected state, styled
 * neutrally, never as an error.
 *
 * @functions
 *  → AgentHarnessesPanel: the panel
 *
 * @exports AgentHarnessesPanel
 * @see src/hooks/useAgentHarnesses.ts, detection state
 * @see src/lib/filesystem.ts, fetchAgentHarnesses (the REST call)
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconCopy, IconExternalLink, IconRefresh, IconRobot } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import { useAgentHarnesses } from '../../hooks/useAgentHarnesses';
import { PERMISSION_MODES } from '../../lib/types';
import type { DetectedHarness, PermissionMode, PermissionSupport } from '../../lib/types';

/** 📖 Short public label per wire protocol; the full ids are internal to the runtime. */
const PROTOCOL_LABELS: Record<DetectedHarness['protocol'], string> = {
  'claude-stream-json': 'stream-json',
  'codex-exec-json': 'exec-json',
  'pi-rpc': 'rpc',
  acp: 'acp',
};

export function AgentHarnessesPanel() {
  const { t } = useTranslation();
  const config = useStore(s => s.config);
  const { harnesses, refresh, loading } = useAgentHarnesses();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const currentMode: PermissionMode = config.agent.permissionMode;

  const modeLabel = (mode: PermissionMode): string =>
    mode === 'yolo'
      ? t('settings.yolo', { defaultValue: 'Yolo' })
     : t('settings.acceptEdits', { defaultValue: 'Accept edits' });

  const supportLabel = (support: PermissionSupport): string =>
    support === 'native'
      ? t('settings.harnesses.native', { defaultValue: 'native' })
     : t('settings.harnesses.advisory', { defaultValue: 'advisory' });

  const copyInstallHint = useCallback(async (harness: DetectedHarness) => {
    try {
      await navigator.clipboard.writeText(harness.installHint);
      setCopiedId(harness.id);
      window.setTimeout(() => {
        // 📖 Only clear if this row is still the copied one, so a fast second
        // copy is never swallowed by the first row's timeout.
        setCopiedId(current => (current === harness.id ? null: current));
      }, 1600);
    } catch {
      // 📖 Clipboard refused (permissions or non-secure context): the snippet
      // stays visible in the row so the user can select and copy it manually.
    }
  }, []);

  if (loading && harnesses === null) {
    return (
      <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
        {t('settings.harnesses.loading', { defaultValue: 'Detecting harnesses…' })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-fg">
            {t('settings.harnesses.title', { defaultValue: 'Agent harnesses' })}
          </div>
          <div className="mt-0.5 max-w-[560px] text-[12.5px] text-fg-muted">
            {t('settings.harnesses.description', {
              defaultValue: 'Kandown drives coding agent CLIs that are already installed and already authenticated on this machine. It never asks for an API key.',
            })}
          </div>
          <div className="mt-1 text-[12px] text-fg-muted">
            {t('settings.harnesses.currentMode', { defaultValue: 'Current mode' })}:{' '}
            <span className="text-fg">{modeLabel(currentMode)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="flex flex-none items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg disabled:opacity-50"
        >
          <IconRefresh size={14} stroke={1.8} />
          {t('settings.harnesses.refresh', { defaultValue: 'Refresh' })}
        </button>
      </div>

      {/* Expected state when no backend can answer detection */}
      {harnesses === null ? (
        <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1 px-4 py-10 text-center">
          <IconRobot size={22} stroke={1.6} className="mx-auto text-fg-muted" />
          <p className="mt-2 text-[14px] font-medium text-fg">
            {t('settings.harnesses.needsDaemonTitle', { defaultValue: 'Agent sessions need the kandown daemon' })}
          </p>
          <p className="mt-1 text-[13px] text-fg-muted">
            {t('settings.harnesses.needsDaemonBody', {
              defaultValue: 'Run npx kandown in this project to start the daemon: it detects installed harnesses and runs agent sessions.',
            })}
          </p>
        </div>
      ): harnesses.length === 0 ? (
        <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1 px-4 py-10 text-center">
          <IconRobot size={22} stroke={1.6} className="mx-auto text-fg-muted" />
          <p className="mt-2 text-[14px] font-medium text-fg">
            {t('settings.harnesses.empty', { defaultValue: 'No harnesses detected on this machine' })}
          </p>
        </div>
      ): (
        <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1">
          {harnesses.map((harness, i) => {
            const isUrl = harness.installHint.startsWith('http');
            const copied = copiedId === harness.id;
            return (
              <div key={harness.id} className={`px-4 py-3.5 ${i > 0 ? 'border-t border-border': ''}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium text-fg">{harness.name}</span>
                      <span className="rounded-full bg-bg-2 px-1.5 py-0.5 text-[11px] text-fg-muted">
                        {PROTOCOL_LABELS[harness.protocol]}
                      </span>
                      {harness.version && <span className="text-[12px] text-fg-muted">v{harness.version}</span>}
                      {harness.installed ? (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-500">
                          {t('settings.harnesses.installed', { defaultValue: 'installed' })}
                        </span>
                      ): (
                        <span className="rounded-full bg-bg-2 px-1.5 py-0.5 text-[11px] text-fg-muted">
                          {t('settings.harnesses.notInstalled', { defaultValue: 'not installed' })}
                        </span>
                      )}
                    </div>
                    {harness.installed && harness.binPath && (
                      <div className="mt-0.5 truncate font-mono text-[11.5px] text-fg-muted">{harness.binPath}</div>
                    )}
                    {!harness.installed && !isUrl && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <code className="max-w-full truncate rounded bg-bg-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-muted">
                          {harness.installHint}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyInstallHint(harness)}
                          className="flex flex-none items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-fg hover:bg-bg-2"
                        >
                          {copied
                            ? <IconCheck size={12} stroke={1.8} className="text-emerald-500" />
                           : <IconCopy size={12} stroke={1.8} />}
                          {copied
                            ? t('settings.harnesses.copied', { defaultValue: 'Copied' })
                           : t('settings.harnesses.copyHint', { defaultValue: 'Copy install command' })}
                        </button>
                      </div>
                    )}
                    {!harness.installed && isUrl && (
                      <a
                        href={harness.installHint}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-fg hover:bg-bg-2"
                      >
                        <IconExternalLink size={12} stroke={1.8} />
                        <span className="max-w-[320px] truncate font-mono">{harness.installHint}</span>
                      </a>
                    )}
                    {/* Permission support relative to the current config mode */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {PERMISSION_MODES.map((mode) => {
                        const support = harness.permissionModes[mode];
                        const isCurrent = mode === currentMode;
                        return (
                          <span
                            key={mode}
                            title={supportLabel(support)}
                            className={`rounded-full px-1.5 py-0.5 text-[11px] ${isCurrent ? 'border border-border-focus bg-bg-2 text-fg': 'bg-bg-2 text-fg-muted'}`}
                          >
                            {modeLabel(mode)}:{' '}
                            <span className={support === 'native' ? 'text-emerald-500': 'text-amber-600 dark:text-amber-300'}>
                              {supportLabel(support)}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
