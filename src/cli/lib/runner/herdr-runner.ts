/**
 * @file HerdrRunner: a task's agent, running in a real Herdr terminal pane
 * @description The second runner (t261). Instead of a headless child process
 * the daemon owns, a run is a Herdr tab: a real PTY the user can attach to,
 * that survives the daemon, and whose lifecycle Herdr itself watches (it knows
 * when an agent is working, blocked on an approval prompt, or done). Kandown
 * only opens the tab, launches the same command the TUI would have launched,
 * and reads back state and terminal output.
 *
 * 📖 What identifies a run. The tab label, and nothing else: `kd:<taskId>`.
 * Herdr owns the panes, kandown owns the tasks, and the label is the whole
 * join (AGENTS.md rule 6: no index, no sidecar file). A run therefore survives
 * a daemon restart and is discoverable by `list()` even when this process
 * never started it; renaming the tab in Herdr detaches it, which is honest.
 *
 * 📖 Why the prompt is not typed into the terminal. `prepareAgentLaunch`
 * builds a command whose prompt argument is the full compiled `kandown work`
 * document, tens of kilobytes long. Sending that as literal keystrokes would
 * hit the terminal line discipline's input limit, so the prompt argument is
 * swapped for `"$(cat <context file>)"`: the shell reads a short line and does
 * the expansion itself. The context file is the one the launcher already
 * writes for every launch path.
 *
 * 📖 Failure is a value, until it is not. Detection and listing degrade
 * silently (a machine without Herdr lists nothing), but `start()` throws: the
 * user pressed a button, so a failure there is a real error the route turns
 * into a 4xx, and the task is rolled back to the column it came from.
 *
 * @functions
 *  → createHerdrRunner   : build the runner bound to one .kandown directory
 *  → herdrLaunchCommand  : pure: prepared command to a short shell line
 *  → runsFromHerdrState  : pure: panes plus tabs to the kandown run list
 *
 * @exports createHerdrRunner, herdrLaunchCommand, runsFromHerdrState
 * @see src/cli/lib/runner/herdr-client.ts: the CLI wrapper and detection
 * @see src/cli/lib/launcher.ts: the shared launch preparation
 */

import {
  detectHerdr,
  herdrCall,
  herdrCallText,
  mapHerdrStatus,
  parseHerdrPanes,
  parseHerdrTabs,
  pickWorkspaceForProject,
  tabLabelForTask,
  taskIdFromTabLabel,
  type HerdrPane,
  type HerdrTab,
} from './herdr-client';
import { getProjectRoot } from '../board-reader';
import { prepareAgentLaunch, rollbackTaskStatus, shellescape } from '../launcher';
import type {
  RunnerAvailability,
  RunnerOutput,
  RunnerRun,
  RunnerStartRequest,
  TaskRunner,
} from './types';

/** 📖 Ceiling on a preview read. Herdr's own snapshot is bounded by the
 *  scrollback; this keeps one request from shipping a megabyte to the UI. */
const MAX_READ_LINES = 2000;

/**
 * 📖 Turns a prepared launch into the one short line to run in the pane. Every
 * argument is shell-escaped, except the one that *is* the compiled prompt: it
 * becomes a command substitution reading the context file, so the shell (not
 * the terminal input buffer) carries the payload. Pure, so the substitution
 * rule is testable without a running Herdr.
 */
export function herdrLaunchCommand(
  binary: string,
  args: readonly string[],
  prompt: string,
  contextFile: string,
): string {
  const substitution = `"$(cat ${shellescape(contextFile)})"`;
  const rendered = args.map(arg => (arg === prompt ? substitution : shellescape(arg)));
  return [shellescape(binary), ...rendered].join(' ');
}

/**
 * 📖 Joins what Herdr reports into the run list the board consumes: one run
 * per pane sitting in a tab whose label follows the `kd:` convention. Panes in
 * ordinary tabs are ignored, so a user's own terminals never show up on a
 * card. State comes from the pane when Herdr recognizes an agent there and
 * falls back to the tab's aggregate status otherwise.
 */
export function runsFromHerdrState(
  panes: readonly HerdrPane[],
  tabs: readonly HerdrTab[],
  startedAt: ReadonlyMap<string, string>,
): RunnerRun[] {
  const tabById = new Map(tabs.map(tab => [tab.tabId, tab]));
  const runs: RunnerRun[] = [];
  for (const pane of panes) {
    const tab = tabById.get(pane.tabId);
    const taskId = taskIdFromTabLabel(tab?.label);
    if (!taskId) continue;
    const started = startedAt.get(pane.paneId);
    runs.push({
      runnerId: 'herdr',
      runId: pane.paneId,
      taskId,
      agentId: pane.agent ?? 'unknown',
      state: mapHerdrStatus(pane.status ?? tab?.status ?? null),
      ...(started ? { startedAt: started } : {}),
      ...(tab?.label ? { label: tab.label } : {}),
      workspaceId: pane.workspaceId,
      tabId: pane.tabId,
    });
  }
  return runs;
}

/** 📖 Narrows the `tab create` payload down to the ids the runner needs.
 *  A response without them means Herdr changed shape under us, and the caller
 *  turns that into a readable error rather than a silent half-start. */
function readCreatedTab(result: unknown): { paneId: string; tabId: string; workspaceId: string } | null {
  if (!result || typeof result !== 'object') return null;
  const root = result as { root_pane?: unknown; tab?: unknown };
  const pane = root.root_pane && typeof root.root_pane === 'object' ? root.root_pane as Record<string, unknown> : null;
  const tab = root.tab && typeof root.tab === 'object' ? root.tab as Record<string, unknown> : null;
  const paneId = typeof pane?.pane_id === 'string' ? pane.pane_id : null;
  const tabId = typeof tab?.tab_id === 'string' ? tab.tab_id : typeof pane?.tab_id === 'string' ? pane.tab_id : null;
  const workspaceId = typeof tab?.workspace_id === 'string' ? tab.workspace_id : typeof pane?.workspace_id === 'string' ? pane.workspace_id : null;
  return paneId && tabId && workspaceId ? { paneId, tabId, workspaceId } : null;
}

/**
 * 📖 Builds the Herdr runner for one project. The only state it keeps is when
 * *this* process started a given pane, purely so the UI can show a run age:
 * it is derived, disposable, and never consulted for anything the task file or
 * Herdr itself can answer.
 */
export function createHerdrRunner(kandownDir: string): TaskRunner {
  const startedAt = new Map<string, string>();

  async function listPanesAndTabs(): Promise<{ panes: HerdrPane[]; tabs: HerdrTab[] }> {
    const [paneCall, tabCall] = await Promise.all([herdrCall(['pane', 'list']), herdrCall(['tab', 'list'])]);
    return {
      panes: paneCall.ok ? parseHerdrPanes(paneCall.result) : [],
      tabs: tabCall.ok ? parseHerdrTabs(tabCall.result) : [],
    };
  }

  return {
    id: 'herdr',
    name: 'Herdr',

    detect(): RunnerAvailability {
      return detectHerdr();
    },

    async start(request: RunnerStartRequest): Promise<RunnerRun> {
      const availability = detectHerdr();
      if (!availability.available) throw new Error(availability.reason ?? 'Herdr is not available');

      const projectRoot = getProjectRoot(kandownDir);
      // 📖 Same preparation as every other launch path: the prompt, the
      // assignment and the move to the active column are kandown policy and
      // must not differ because the agent happens to run in Herdr.
      const prepared = prepareAgentLaunch({ taskId: request.taskId, agentId: request.agentId, kandownDir });

      const { panes } = await listPanesAndTabs();
      const workspaceId = pickWorkspaceForProject(panes, projectRoot);
      const createArgs = [
        'tab', 'create',
        ...(workspaceId ? ['--workspace', workspaceId] : []),
        '--cwd', projectRoot,
        '--label', tabLabelForTask(request.taskId),
        '--env', `KANDOWN_CONTEXT_FILE=${prepared.contextFile}`,
        '--env', `KANDOWN_TASK_ID=${request.taskId}`,
        '--env', `KANDOWN_DIR=${kandownDir}`,
        // 📖 The board keeps focus: starting a run must not yank the user's
        // terminal away from whatever they were doing.
        '--no-focus',
      ];
      const created = await herdrCall(createArgs);
      if (!created.ok) {
        rollbackTaskStatus(kandownDir, request.taskId, prepared.originalStatus);
        throw new Error(`Herdr could not open a tab: ${created.error}`);
      }
      const tab = readCreatedTab(created.result);
      if (!tab) {
        rollbackTaskStatus(kandownDir, request.taskId, prepared.originalStatus);
        throw new Error('Herdr opened a tab but reported no pane id.');
      }

      const command = herdrLaunchCommand(prepared.binary, prepared.args, prepared.prompt, prepared.contextFile);
      const ran = await herdrCall(['pane', 'run', tab.paneId, command]);
      if (!ran.ok) {
        // 📖 The tab exists but holds no agent: close it so the board is not
        // left pointing at an empty terminal, then roll the task back.
        await herdrCall(['tab', 'close', tab.tabId]);
        rollbackTaskStatus(kandownDir, request.taskId, prepared.originalStatus);
        throw new Error(`Herdr could not start ${prepared.agentName}: ${ran.error}`);
      }

      const now = new Date().toISOString();
      startedAt.set(tab.paneId, now);
      return {
        runnerId: 'herdr',
        runId: tab.paneId,
        taskId: request.taskId,
        agentId: request.agentId,
        state: 'starting',
        startedAt: now,
        label: tabLabelForTask(request.taskId),
        workspaceId: tab.workspaceId,
        tabId: tab.tabId,
      };
    },

    async list(): Promise<RunnerRun[]> {
      if (!detectHerdr().available) return [];
      const { panes, tabs } = await listPanesAndTabs();
      return runsFromHerdrState(panes, tabs, startedAt);
    },

    async read(runId: string, lines: number): Promise<RunnerOutput> {
      const wanted = Math.min(Math.max(1, lines), MAX_READ_LINES);
      // 📖 `recent-unwrapped` is the snapshot without terminal line wrapping,
      // so the preview re-wraps at the width the UI actually has.
      const out = await herdrCallText(['pane', 'read', runId, '--lines', String(wanted), '--source', 'recent-unwrapped']);
      if (!out.ok) return { text: '', truncated: false };
      const text = out.text.replace(/\s+$/, '');
      return { text, truncated: text.split('\n').length >= wanted };
    },

    async stop(runId: string): Promise<void> {
      // 📖 Closing the pane is the honest "stop": Herdr sends the terminal its
      // hangup, the agent exits with it, and the tab disappears from the board
      // on the next list. A failure is deliberately silent: the user can
      // always close the tab in Herdr itself.
      await herdrCall(['pane', 'close', runId]);
    },
  };
}
