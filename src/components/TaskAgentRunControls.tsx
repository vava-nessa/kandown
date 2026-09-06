/**
 * @file Task agent run controls (t261)
 * @description Shared launch-and-watch surface for agent runs, mounted by BOTH
 * task editor shells (TaskWorkspace on desktop, Drawer on mobile), the same
 * fan-out rule TaskExtensionSurface follows. It carries:
 *
 *  - the harness select (same installed-harness list the chat sidebar uses,
 *    preselected from the task's assignee when it resolves to an install);
 *  - the runner toggle, rendered ONLY when the seeded runner availability
 *    reports Herdr available (progressive disclosure: no Herdr, no button,
 *    no noise); the built-in runner stays the default and is labelled
 *    "Kandown";
 *  - the Run button (POST /api/agent/runs through the store slice);
 *  - while the task has an active run: the PTY preview panel, a collapsible
 *    monospace tail of the run's terminal that polls every 2s until the run
 *    reaches a terminal state, auto-scrolls while pinned to the bottom, and
 *    offers a confirm-free Stop (restarting is cheap).
 *
 * 📖 The per-card status pill ({@link AgentRunBadge}) is exported from here
 * too: it is the same feature's board surface, and keeping pill styles next
 * to the preview keeps one visual language for run states.
 *
 * 📖 Hidden entirely outside server mode (the website demo answers 501 on
 * every /api/agent route): the zero-config promise means the editor simply
 * shows nothing, never a broken control.
 *
 * @functions
 *  → TaskAgentRunControls: harness select, runner toggle, Run button, preview
 *  → RunOutputPanel: collapsible polled PTY tail with Stop
 *  → AgentRunBadge: per-card run state pill (board surface)
 *
 * @exports TaskAgentRunControls, AgentRunBadge
 * @see src/lib/store/agentRunsSlice.ts: state, transport and pure helpers
 * @see src/components/TaskWorkspace.tsx and src/components/Drawer.tsx: mounts
 * @see src/components/Card.tsx: mounts AgentRunBadge
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconBolt, IconChevronDown, IconChevronRight, IconPlayerStopFilled } from '@tabler/icons-react';
import { useStore } from '../lib/store';
import { isDemoMode, isServerMode } from '../lib/filesystem';
import { matchAgent } from '../lib/agent-aliases';
import {
  isOutputPinnedToBottom,
  isTerminalRunState,
  mostActiveRun,
  runBadgeTone,
  shouldAutoExpandOutput,
  type RunBadgeTone,
} from '../lib/store/agentRunsSlice';
import type { RunnerId, RunnerRunState, RunnerRunView } from '../lib/store/types';
import type { TaskFrontmatter } from '../lib/types';

interface TaskAgentRunControlsProps {
  taskId: string;
  frontmatter: TaskFrontmatter;
}

/** 📖 One run per task is ever actionable here: the most active one drives
 * the panel (same pick the card pill uses, so both surfaces agree). */
function useActiveRunForTask(taskId: string): RunnerRunView | null {
  return useStore(s => mostActiveRun(
    s.agentRuns.runs.filter(run => run.taskId?.toLowerCase() === taskId.toLowerCase()),
  ));
}

/** 📖 Localized label for a run state (badge pill, preview header). */
function useRunStateLabel(): (state: RunnerRunState) => string {
  const { t } = useTranslation();
  return (state: RunnerRunState) => t(`agentRuns.state.${state}`, { defaultValue: state });
}

const BADGE_TONE_CLASSES: Record<Exclude<RunBadgeTone, null>, string> = {
  accent: 'border-accent/25 bg-accent/10 text-accent',
  orange: 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  green: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  red: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400',
  neutral: 'border-border/50 bg-black/[0.04] text-fg-muted dark:bg-white/[0.06]',
};

/** 📖 The board card pill: colored dot + state label, 10.5px scale matching
 * the autopilot chip exactly. Renders nothing when the task has no run, and
 * hides too when the most active run is `gone` (a closed pane is not news). */
export function AgentRunBadge({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const run = useActiveRunForTask(taskId);
  const stateLabel = useRunStateLabel();
  if (!run) return null;
  const tone = runBadgeTone(run.state);
  if (!tone) return null;
  const spinning = run.state === 'working';
  return (
    <span
      className={`inline-flex h-[16px] items-center gap-1 rounded border px-1.5 text-[10.5px] font-semibold ${BADGE_TONE_CLASSES[tone]}`}
      title={t('agentRuns.badgeTitle', { state: stateLabel(run.state), defaultValue: `Agent run: ${run.state}` })}
    >
      <span className={`h-1 w-1 rounded-full bg-current ${spinning ? 'animate-pulse' : ''}`} aria-hidden />
      {stateLabel(run.state)}
    </span>
  );
}

/** 📖 The PTY preview: collapsible, collapsed by default unless the run is
 * less than five minutes old. Polls the run's terminal tail every 2s while
 * the run is alive, renders it newest-last in an 11px monospace box, and
 * keeps the newest line visible unless the user scrolled up. */
function RunOutputPanel({ run }: { run: RunnerRunView }) {
  const { t } = useTranslation();
  const stopRun = useStore(s => s.stopRun);
  const toast = useStore(s => s.toast);
  const daemonToken = typeof window !== 'undefined' && typeof window.__KANDOWN_TOKEN__ === 'string'
    ? window.__KANDOWN_TOKEN__
    : null;
  const terminal = isTerminalRunState(run.state);
  // 📖 Auto-expand rule evaluated once per mount: a run the user just
  // launched opens its output; an older one (or an adopted pane with no
  // known start) stays collapsed until clicked.
  const [expanded, setExpanded] = useState(() => shouldAutoExpandOutput(run.startedAt ?? run.firstSeenAt, Date.now()));
  const [text, setText] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [stopping, setStopping] = useState(false);
  const preRef = useRef<HTMLPreElement | null>(null);
  const pinnedRef = useRef(true);
  const stateLabel = useRunStateLabel();

  // 📖 Poll the tail every 2s while expanded and the run can still produce
  // output. A failed read keeps the last snapshot: a transient daemon hiccup
  // must not blank the panel.
  useEffect(() => {
    if (!expanded || terminal) return;
    let cancelled = false;
    const readOnce = async () => {
      const params = new URLSearchParams({ runner: run.runnerId, runId: run.runId, lines: '400' });
      try {
        const res = await fetch(`/api/agent/runs/output?${params.toString()}`, {
          headers: daemonToken ? { 'X-Kandown-Token': daemonToken } : undefined,
        });
        if (!res.ok || cancelled) return;
        const data: unknown = await res.json();
        const output = data && typeof data === 'object' && data !== null
          ? (data as { output?: { text?: unknown; truncated?: unknown } }).output
          : undefined;
        if (!output || typeof output.text !== 'string' || cancelled) return;
        setText(output.text);
        setTruncated(output.truncated === true);
      } catch {
        // Unreachable daemon: keep showing the last tail, retry on tick.
      }
    };
    void readOnce();
    const timer = setInterval(() => { void readOnce(); }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [expanded, terminal, run.runnerId, run.runId, daemonToken]);

  // 📖 Auto-scroll: only when the user is (still) at the bottom. Scrolling
  // up freezes the view; touching the bottom again re-pins it.
  useEffect(() => {
    const el = preRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [text, expanded]);

  const handleStop = async () => {
    if (stopping || terminal) return;
    setStopping(true);
    const ok = await stopRun(run.runnerId, run.runId);
    setStopping(false);
    if (!ok) toast(t('agentRuns.stopFailed', { defaultValue: 'Could not stop the run' }), 'error');
  };

  const Chevron = expanded ? IconChevronDown : IconChevronRight;

  return (
    <section className="rounded-lg border border-border bg-bg-1/50">
      <div className="flex w-full items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(current => !current)}
          className="flex flex-1 items-center gap-2 text-left min-w-0"
        >
          <Chevron size={12} className="shrink-0 text-fg-faint" aria-hidden />
          <span className="truncate font-mono text-[11px] text-fg-muted">
            {t('agentRuns.header', { agent: run.agentId, state: stateLabel(run.state), defaultValue: `run · ${run.agentId} · ${run.state}` })}
          </span>
        </button>
        {!terminal && (
          <button
            type="button"
            aria-label={t('agentRuns.stop', { defaultValue: 'Stop' })}
            title={t('agentRuns.stop', { defaultValue: 'Stop' })}
            disabled={stopping}
            onClick={() => { void handleStop(); }}
            className="inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[5px] border border-red-500/40 bg-card text-red-600 shadow-sm transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
          >
            <IconPlayerStopFilled size={11} stroke={1.8} aria-hidden />
          </button>
        )}
      </div>
      {expanded && (
        <div className="border-t border-border px-3 py-2">
          <pre
            ref={preRef}
            onScroll={() => {
              const el = preRef.current;
              if (el) pinnedRef.current = isOutputPinnedToBottom(el.scrollTop, el.clientHeight, el.scrollHeight);
            }}
            className="max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-fg-muted"
          >
            {text || t('agentRuns.waiting', { defaultValue: 'Waiting for output...' })}
          </pre>
          {truncated && (
            <div className="pt-1 font-mono text-[10px] text-fg-faint">{t('agentRuns.truncated', { defaultValue: 'Older output trimmed' })}</div>
          )}
        </div>
      )}
    </section>
  );
}

/** 📖 The launch controls: hidden entirely outside server mode, the Herdr
 * toggle only when Herdr answered available. After a launch the active run's
 * preview replaces the controls until the run reaches a terminal state. */
export function TaskAgentRunControls({ taskId, frontmatter }: TaskAgentRunControlsProps) {
  const { t } = useTranslation();
  const serverBacked = useMemo(() => isServerMode() && !isDemoMode(), []);
  const harnesses = useStore(s => s.agentChat.harnesses);
  const refreshSessions = useStore(s => s.refreshSessions);
  const herdrAvailable = useStore(s => s.agentRuns.runners.find(runner => runner.id === 'herdr')?.available === true);
  const seedRunnerAvailability = useStore(s => s.seedRunnerAvailability);
  const startRun = useStore(s => s.startRun);
  const toast = useStore(s => s.toast);
  const activeRun = useActiveRunForTask(taskId);

  const [runner, setRunner] = useState<RunnerId>('default');
  const [launching, setLaunching] = useState(false);

  // 📖 The harness list is lazy in the chat sidebar (fetched on first sidebar
  // use). The run controls need it too, so they trigger the same refresh once
  // when empty, and re-seed runner availability if the setup-time seed found
  // nothing (a daemon that started Herdr after page load recovers here).
  useEffect(() => {
    if (!serverBacked) return;
    if (harnesses.length === 0) void refreshSessions();
    if (!herdrAvailable) void seedRunnerAvailability();
    // 📖 Run once per mount: the editor remounts per task, the fetches above
    // are each guarded by their own emptiness checks, so the full dependency
    // list is intentionally not needed here.
  }, [serverBacked, taskId]);

  const installedHarnesses = useMemo(() => harnesses.filter(harness => harness.installed), [harnesses]);
  // 📖 Same preselect convention as the chat sidebar: the task's assignee
  // when it resolves to an installed harness, otherwise the first one.
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  useEffect(() => {
    if (selectedAgent && installedHarnesses.some(harness => harness.id === selectedAgent)) return;
    const assignee = typeof frontmatter.assignee === 'string' ? frontmatter.assignee : null;
    const assigneeMatch = assignee ? matchAgent(assignee) : null;
    const preferred = assigneeMatch
      ? installedHarnesses.find(harness => harness.id === assigneeMatch.id)
      : undefined;
    setSelectedAgent((preferred ?? installedHarnesses[0])?.id ?? null);
  }, [installedHarnesses, frontmatter.assignee, selectedAgent]);

  if (!serverBacked) return null;

  // 📖 Progressive disclosure: an installed-harness list is the minimum for
  // offering a launch; before it loads (or with none installed) show nothing.
  if (installedHarnesses.length === 0) return null;

  const handleRun = async () => {
    if (!selectedAgent || launching) return;
    setLaunching(true);
    const result = await startRun(taskId, selectedAgent, runner);
    setLaunching(false);
    if (!result.ok) {
      toast(t('agentRuns.startFailed', { error: result.error ?? '', defaultValue: `Could not start the run: ${result.error ?? ''}` }), 'error');
    }
  };

  return (
    <>
      <div className="h-px bg-border -mx-5" />
      <section data-agent-runs>
        <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-3">
          {t('agentRuns.sectionTitle', { defaultValue: 'Run an agent' })}
        </div>
        <div className="space-y-2.5">
          <label className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg-1/40 px-3 py-2.5">
            <span>
              <span className="block text-[13px] font-medium text-fg">{t('agentRuns.agentLabel', { defaultValue: 'Agent' })}</span>
              <span className="block text-[11px] text-fg-faint">{t('agentRuns.harnessHint', { defaultValue: 'Installed harnesses detected on this machine' })}</span>
            </span>
            <select
              value={selectedAgent ?? ''}
              onChange={event => setSelectedAgent(event.target.value)}
              className="h-9 min-w-[180px] rounded-md border border-border bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-primary"
            >
              {installedHarnesses.map(harness => (
                <option key={harness.id} value={harness.id}>{harness.name}</option>
              ))}
            </select>
          </label>

          {herdrAvailable && (
            <label className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg-1/40 px-3 py-2.5">
              <span>
                <span className="block text-[13px] font-medium text-fg">{t('agentRuns.runnerLabel', { defaultValue: 'Runner' })}</span>
                <span className="block text-[11px] text-fg-faint">
                  {runner === 'herdr'
                    ? t('agentRuns.runnerHerdrTitle', { defaultValue: 'Runs in a Herdr tab you can attach to' })
                    : t('agentRuns.runnerKandownTitle', { defaultValue: 'Runs inside the kandown daemon' })}
                </span>
              </span>
              <span className="inline-flex overflow-hidden rounded-md border border-border" role="group">
                <button
                  type="button"
                  aria-pressed={runner === 'default'}
                  onClick={() => setRunner('default')}
                  className={`h-9 px-3 text-[12.5px] font-medium transition-colors ${
                    runner === 'default' ? 'bg-primary text-primary-foreground' : 'bg-bg text-fg-muted hover:text-fg'
                  }`}
                >
                  {t('agentRuns.runnerKandown', { defaultValue: 'Kandown' })}
                </button>
                <button
                  type="button"
                  aria-pressed={runner === 'herdr'}
                  onClick={() => setRunner('herdr')}
                  className={`inline-flex h-9 items-center gap-1 px-3 text-[12.5px] font-medium transition-colors ${
                    runner === 'herdr' ? 'bg-primary text-primary-foreground' : 'bg-bg text-fg-muted hover:text-fg'
                  }`}
                >
                  <IconBolt size={13} aria-hidden />
                  {t('agentRuns.runnerHerdr', { defaultValue: 'Run with Herdr' })}
                </button>
              </span>
            </label>
          )}

          {!activeRun && (
            <button
              type="button"
              disabled={launching || !selectedAgent}
              onClick={() => { void handleRun(); }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {launching
                ? t('agentRuns.starting', { defaultValue: 'Starting...' })
                : t('agentRuns.run', { defaultValue: 'Run' })}
            </button>
          )}

          {activeRun && <RunOutputPanel run={activeRun} />}
        </div>
      </section>
    </>
  );
}
