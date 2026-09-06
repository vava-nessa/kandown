/**
 * @file Runner registry and default-runner unit tests
 * @description Pins the seam the t261 UI codes against:
 *
 *   1. describe() always lists the built-in runner as available, and reports
 *      Herdr as unavailable (with a reason, never an exception) on a machine
 *      with no Herdr server.
 *   2. runs() only asks the available runners, so an absent Herdr costs
 *      nothing and cannot blank the board.
 *   3. getRunnerRegistry caches one registry per .kandown directory and
 *      rebuilds when the daemon is pointed at another project.
 *   4. mapSessionStatus maps the harness lifecycle onto run states.
 *   5. renderEventsAsText turns a buffered session into a readable transcript:
 *      streamed text is concatenated, tool calls and errors get their own
 *      line, and thinking is left out.
 *
 * @see src/cli/lib/runner/index.ts
 * @see src/cli/lib/runner/default-runner.ts
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunnerRegistry, getRunnerRegistry, resetRunnerRegistry } from '../runner/index';
import { mapSessionStatus, renderEventsAsText } from '../runner/default-runner';
import { resetHerdrDetection } from '../runner/herdr-client';
import type { AgentEvent } from '../agent/types';

const savedSocket = process.env.HERDR_SOCKET;
let projectDir = '';
let kandownDir = '';

beforeEach(() => {
  // 📖 Point detection at a socket that cannot exist, so the suite behaves the
  // same on a developer machine that happens to run Herdr and in CI.
  process.env.HERDR_SOCKET = '/tmp/kandown-registry-no-herdr.sock';
  resetHerdrDetection();
  resetRunnerRegistry();
  projectDir = mkdtempSync(join(tmpdir(), 'kandown-runner-'));
  kandownDir = join(projectDir, '.kandown');
});

afterEach(() => {
  if (savedSocket === undefined) delete process.env.HERDR_SOCKET;
  else process.env.HERDR_SOCKET = savedSocket;
  resetHerdrDetection();
  resetRunnerRegistry();
  rmSync(projectDir, { recursive: true, force: true });
});

describe('runner registry', () => {
  it('always offers the built-in runner and stays silent about a missing Herdr', () => {
    const described = createRunnerRegistry(kandownDir).describe();
    expect(described.map(entry => entry.id)).toEqual(['default', 'herdr']);
    expect(described[0]).toMatchObject({ id: 'default', available: true });
    expect(described[1].available).toBe(false);
    expect(described[1].reason).toBeTruthy();
  });

  it('resolves a runner by id and nothing else', () => {
    const registry = createRunnerRegistry(kandownDir);
    expect(registry.get('herdr')?.name).toBe('Herdr');
    expect(registry.get('nope')).toBeUndefined();
  });

  it('lists no runs when nothing is running, without touching Herdr', async () => {
    await expect(createRunnerRegistry(kandownDir).runs()).resolves.toEqual([]);
  });

  it('caches per project and rebuilds when the project changes', () => {
    const first = getRunnerRegistry(kandownDir);
    expect(getRunnerRegistry(kandownDir)).toBe(first);
    expect(getRunnerRegistry(join(projectDir, 'other', '.kandown'))).not.toBe(first);
  });
});

describe('mapSessionStatus', () => {
  it('maps the harness lifecycle', () => {
    expect(mapSessionStatus('starting')).toBe('starting');
    expect(mapSessionStatus('running')).toBe('working');
    expect(mapSessionStatus('completed')).toBe('done');
    expect(mapSessionStatus('stopped')).toBe('gone');
    expect(mapSessionStatus('failed')).toBe('failed');
  });
});

describe('renderEventsAsText', () => {
  const meta = { sessionId: 'ses_1', harnessId: 'claude', timestamp: '2026-09-05T10:00:00.000Z' };
  const events: AgentEvent[] = [
    { type: 'message_delta', text: 'Reading ', partial: true, channel: 'text', ...meta },
    { type: 'message_delta', text: 'the task.', partial: false, channel: 'text', ...meta },
    { type: 'message_delta', text: 'hmm', partial: false, channel: 'thinking', ...meta },
    { type: 'tool_started', toolName: 'read', summary: 'tasks/t261.md', ...meta },
    { type: 'error', message: 'rate limited', fatal: false, ...meta },
    { type: 'stopped', reason: 'exit', exitCode: 0, ...meta },
  ];

  it('renders streamed text, tools and errors, and skips thinking', () => {
    expect(renderEventsAsText(events).split('\n')).toEqual([
      'Reading the task.',
      '· read tasks/t261.md',
      '! rate limited',
      '- session exit (exit 0)',
    ]);
  });

  it('renders an empty buffer as an empty string', () => {
    expect(renderEventsAsText([])).toBe('');
  });
});
