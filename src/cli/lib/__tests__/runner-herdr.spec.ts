/**
 * @file Herdr runner unit tests
 * @description Pins the t261 Herdr integration where it is pure, plus the one
 * behaviour the whole zero-config promise rests on:
 *
 *   1. herdrSocketPath resolves $HERDR_SOCKET, then $XDG_CONFIG_HOME, then the
 *      documented `~/.config/herdr/herdr.sock` default.
 *   2. detectHerdr answers `{ available: false }` with a reason (and never
 *      throws) when the socket does not exist, and the result is cached until
 *      resetHerdrDetection.
 *   3. parseHerdrPanes / parseHerdrTabs narrow real `herdr pane list` and
 *      `herdr tab list` payloads and drop malformed entries.
 *   4. mapHerdrStatus maps Herdr's lifecycle onto the runner vocabulary, with
 *      an unknown or absent status meaning the run is gone.
 *   5. The `kd:<taskId>` tab-label convention round-trips, and a label that is
 *      merely prefixed (`kd: notes`) is not adopted.
 *   6. pickWorkspaceForProject picks the workspace with the most panes inside
 *      the project, and null when none matches.
 *   7. herdrLaunchCommand swaps the (huge) prompt argument for a `cat` of the
 *      context file and shell-escapes everything else.
 *   8. runsFromHerdrState reports one run per kandown-labelled pane and
 *      ignores the user's own tabs.
 *
 * @see src/cli/lib/runner/herdr-client.ts
 * @see src/cli/lib/runner/herdr-runner.ts
 */

import { afterEach, describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  detectHerdr,
  herdrSocketPath,
  mapHerdrStatus,
  parseHerdrPanes,
  parseHerdrTabs,
  pickWorkspaceForProject,
  resetHerdrDetection,
  tabLabelForTask,
  taskIdFromTabLabel,
} from '../runner/herdr-client';
import { herdrLaunchCommand, runsFromHerdrState } from '../runner/herdr-runner';

const savedEnv = { socket: process.env.HERDR_SOCKET, xdg: process.env.XDG_CONFIG_HOME };

afterEach(() => {
  if (savedEnv.socket === undefined) delete process.env.HERDR_SOCKET;
  else process.env.HERDR_SOCKET = savedEnv.socket;
  if (savedEnv.xdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = savedEnv.xdg;
  resetHerdrDetection();
});

describe('herdrSocketPath', () => {
  it('prefers $HERDR_SOCKET', () => {
    process.env.HERDR_SOCKET = '/tmp/custom-herdr.sock';
    expect(herdrSocketPath()).toBe('/tmp/custom-herdr.sock');
  });

  it('falls back to $XDG_CONFIG_HOME, then the documented default', () => {
    delete process.env.HERDR_SOCKET;
    process.env.XDG_CONFIG_HOME = '/tmp/xdg';
    expect(herdrSocketPath()).toBe('/tmp/xdg/herdr/herdr.sock');
    delete process.env.XDG_CONFIG_HOME;
    expect(herdrSocketPath()).toBe(join(homedir(), '.config', 'herdr', 'herdr.sock'));
  });
});

describe('detectHerdr', () => {
  it('is silent and unavailable when no server socket exists', () => {
    process.env.HERDR_SOCKET = '/tmp/kandown-no-such-herdr.sock';
    resetHerdrDetection();
    const availability = detectHerdr();
    expect(availability.available).toBe(false);
    expect(availability.reason).toBeTruthy();
    expect(availability.endpoint).toBe('/tmp/kandown-no-such-herdr.sock');
  });

  it('caches its answer until the cache is reset', () => {
    process.env.HERDR_SOCKET = '/tmp/kandown-no-such-herdr.sock';
    resetHerdrDetection();
    const first = detectHerdr();
    process.env.HERDR_SOCKET = '/tmp/kandown-other.sock';
    expect(detectHerdr()).toBe(first);
    resetHerdrDetection();
    expect(detectHerdr().endpoint).toBe('/tmp/kandown-other.sock');
  });
});

describe('payload narrowing', () => {
  const panePayload = {
    type: 'pane_list',
    panes: [
      { pane_id: 'w1:p1', tab_id: 'w1:t1', workspace_id: 'w1', cwd: '/repo', agent: 'claude', agent_status: 'working' },
      { pane_id: 'w1:p2', tab_id: 'w1:t2', workspace_id: 'w1', cwd: null, agent_status: 'unknown' },
      { tab_id: 'w1:t3', workspace_id: 'w1' },
      'nonsense',
    ],
  };

  it('keeps well-formed panes and drops the rest', () => {
    const panes = parseHerdrPanes(panePayload);
    expect(panes.map(pane => pane.paneId)).toEqual(['w1:p1', 'w1:p2']);
    expect(panes[0]).toMatchObject({ cwd: '/repo', agent: 'claude', status: 'working' });
    expect(panes[1].agent).toBeNull();
  });

  it('answers an empty list for an unexpected payload', () => {
    expect(parseHerdrPanes(null)).toEqual([]);
    expect(parseHerdrPanes({ panes: 'nope' })).toEqual([]);
    expect(parseHerdrTabs(undefined)).toEqual([]);
  });

  it('keeps a tab without a label so pane joins still find it', () => {
    const tabs = parseHerdrTabs({ tabs: [{ tab_id: 'w1:t1', workspace_id: 'w1' }, { workspace_id: 'w1' }] });
    expect(tabs).toEqual([{ tabId: 'w1:t1', workspaceId: 'w1', label: '', status: null }]);
  });
});

describe('mapHerdrStatus', () => {
  it('maps the lifecycle and treats an unrecognized pane as gone', () => {
    expect(mapHerdrStatus('working')).toBe('working');
    expect(mapHerdrStatus('blocked')).toBe('blocked');
    expect(mapHerdrStatus('done')).toBe('done');
    expect(mapHerdrStatus('idle')).toBe('idle');
    expect(mapHerdrStatus('unknown')).toBe('unknown');
    expect(mapHerdrStatus(null)).toBe('gone');
    expect(mapHerdrStatus('something-new')).toBe('gone');
  });
});

describe('tab label convention', () => {
  it('round-trips a task id', () => {
    expect(tabLabelForTask('t261')).toBe('kd:t261');
    expect(taskIdFromTabLabel('kd:t261')).toBe('t261');
  });

  it('refuses labels that are not a kandown run', () => {
    expect(taskIdFromTabLabel('dev-server')).toBeNull();
    expect(taskIdFromTabLabel('kd: notes here')).toBeNull();
    expect(taskIdFromTabLabel(null)).toBeNull();
  });
});

describe('pickWorkspaceForProject', () => {
  const panes = parseHerdrPanes({
    panes: [
      { pane_id: 'wA:p1', tab_id: 'wA:t1', workspace_id: 'wA', cwd: '/repo' },
      { pane_id: 'wB:p1', tab_id: 'wB:t1', workspace_id: 'wB', cwd: '/repo/src' },
      { pane_id: 'wB:p2', tab_id: 'wB:t2', workspace_id: 'wB', cwd: '/repo' },
      { pane_id: 'wC:p1', tab_id: 'wC:t1', workspace_id: 'wC', cwd: '/elsewhere' },
    ],
  });

  it('picks the workspace with the most panes in the project', () => {
    expect(pickWorkspaceForProject(panes, '/repo')).toBe('wB');
  });

  it('does not match a sibling directory with the same prefix', () => {
    expect(pickWorkspaceForProject(panes, '/rep')).toBeNull();
  });

  it('answers null when nothing matches', () => {
    expect(pickWorkspaceForProject(panes, '/other/project')).toBeNull();
  });
});

describe('herdrLaunchCommand', () => {
  it('replaces the prompt argument with a read of the context file', () => {
    const prompt = 'a very long compiled kandown work document';
    const command = herdrLaunchCommand('claude', [prompt], prompt, '/tmp/kandown-t261-context.md');
    expect(command).toBe(`'claude' "$(cat '/tmp/kandown-t261-context.md')"`);
  });

  it('escapes every other argument and keeps their order', () => {
    const command = herdrLaunchCommand('gemini', ['--prompt-interactive', 'P', "it's fine"], 'P', '/tmp/c.md');
    expect(command).toBe(`'gemini' '--prompt-interactive' "$(cat '/tmp/c.md')" 'it'\\''s fine'`);
  });
});

describe('runsFromHerdrState', () => {
  const panes = parseHerdrPanes({
    panes: [
      { pane_id: 'w1:p1', tab_id: 'w1:t1', workspace_id: 'w1', cwd: '/repo', agent: 'claude', agent_status: 'blocked' },
      { pane_id: 'w1:p2', tab_id: 'w1:t2', workspace_id: 'w1', cwd: '/repo', agent_status: 'unknown' },
    ],
  });
  const tabs = parseHerdrTabs({
    tabs: [
      { tab_id: 'w1:t1', workspace_id: 'w1', label: 'kd:t261', agent_status: 'blocked' },
      { tab_id: 'w1:t2', workspace_id: 'w1', label: 'dev-server', agent_status: 'unknown' },
    ],
  });

  it('reports one run per kandown-labelled pane and ignores the others', () => {
    const runs = runsFromHerdrState(panes, tabs, new Map());
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runnerId: 'herdr',
      runId: 'w1:p1',
      taskId: 't261',
      agentId: 'claude',
      state: 'blocked',
      tabId: 'w1:t1',
      workspaceId: 'w1',
    });
    expect(runs[0].startedAt).toBeUndefined();
  });

  it('carries the start time of runs this process launched', () => {
    const runs = runsFromHerdrState(panes, tabs, new Map([['w1:p1', '2026-09-05T10:00:00.000Z']]));
    expect(runs[0].startedAt).toBe('2026-09-05T10:00:00.000Z');
  });
});
