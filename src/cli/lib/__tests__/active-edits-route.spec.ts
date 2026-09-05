/**
 * @file Daemon route tests for GET /api/agent/active-edits (t322)
 * @description Spins up a real `createServeServer` instance and pins the
 * live-edit presence snapshot contract:
 *   1. A pristine daemon (no harness session ever spawned) answers
 *      `{ edits: [] }` and must NOT start a file watcher just to say so.
 *   2. With an active edit runtime, the route answers the tracker's pending
 *      (session, task) pairs in the JSON shape the web UI seed folds.
 *   3. A runtime bound to a previous project directory counts as absent
 *      (same rule the lazy getter uses).
 *   4. The route sits behind the global token auth like every other route.
 *
 * The tracker is driven through a fake runtime subscription (no harness
 * process) and injected with the `setAgentEditRuntimeForTests` hook, the same
 * test-only swap pattern as `setActiveToken`.
 *
 * @functions
 *  → (vitest suites)
 *
 * @exports (tests)
 * @see src/cli/lib/server.ts
 * @see src/cli/lib/agent/session-edits.ts
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateToken } from '../daemon-auth';
import { createServeServer, setActiveToken, setAgentEditRuntimeForTests } from '../server';
import { createSessionEditTracker } from '../agent/session-edits';
import type { AgentEvent } from '../agent/types';
import type { SessionEventSubscriber } from '../agent/session-edits';
import { createWatcher } from '../file-watcher';

const SESSION = 'ses_test01';
const HARNESS = 'acp';

interface Harness {
  subscribe: SessionEventSubscriber;
  emit: (event: AgentEvent) => void;
}

function fakeSubscriber(): Harness {
  let listener: ((event: AgentEvent) => void) | null = null;
  return {
    subscribe(_sessionId, next) {
      listener = next;
      return () => { listener = null; };
    },
    emit(event) {
      listener?.(event);
    },
  };
}

/** 📖 A throwaway project whose tasks directory holds one task file, so a
 * file_changed event maps onto a real task id and activates a pair. */
function makeProject(): { root: string; tasksDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'kandown-active-edits-'));
  const tasksDir = join(root, 'tasks');
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, 't42.md'), 't42 before\n');
  return { root, tasksDir };
}

describe('GET /api/agent/active-edits', () => {
  let kandownDir: string;

  beforeEach(() => {
    kandownDir = mkdtempSync(join(tmpdir(), 'kandown-active-edits-daemon-'));
    mkdirSync(join(kandownDir, 'extensions'), { recursive: true });
    writeFileSync(join(kandownDir, 'kandown.json'), JSON.stringify({ board: { columns: ['Todo', 'Done'] } }));
    setActiveToken(null);
  });

  afterEach(() => {
    setActiveToken(null);
    setAgentEditRuntimeForTests(null, null);
    rmSync(kandownDir, { recursive: true, force: true });
  });

  async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
    const server = createServeServer(kandownDir);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
      await run(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }

  /** 📖 Builds a live-edit runtime around a real tracker whose only harness
   * is a fake subscriber, then activates one (session, task) pair. The file
   * watcher is created but never started: the route only reads the tracker. */
  function makeActiveRuntime(): { tracker: ReturnType<typeof createSessionEditTracker>; watcher: ReturnType<typeof createWatcher>; harness: Harness; tasksDir: string } {
    const { root, tasksDir } = makeProject();
    const harness = fakeSubscriber();
    const tracker = createSessionEditTracker(root, tasksDir, () => undefined, {
      subscribe: harness.subscribe,
    });
    const watcher = createWatcher();
    tracker.attachSession(SESSION, HARNESS);
    harness.emit({
      type: 'file_changed',
      path: join(tasksDir, 't42.md'),
      sessionId: SESSION,
      harnessId: HARNESS,
      timestamp: new Date().toISOString(),
    });
    return { tracker, watcher, harness, tasksDir };
  }

  it('answers an empty list on a pristine daemon (no watcher started)', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/agent/active-edits`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ edits: [] });
    });
  });

  it('answers the tracker pending pairs when a runtime is active', async () => {
    const runtime = makeActiveRuntime();
    setAgentEditRuntimeForTests({ tracker: runtime.tracker, watcher: runtime.watcher }, kandownDir);
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/agent/active-edits`);
      expect(response.status).toBe(200);
      const body = await response.json() as { edits: Array<{ sessionId: string; taskId: string; harnessId: string; startedAt: string; lastActivityAt: string }> };
      expect(body.edits).toHaveLength(1);
      const pair = body.edits[0];
      expect(pair?.sessionId).toBe(SESSION);
      expect(pair?.taskId).toBe('t42');
      expect(pair?.harnessId).toBe(HARNESS);
      expect(Number.isNaN(Date.parse(pair?.startedAt ?? 'x'))).toBe(false);
      expect(Number.isNaN(Date.parse(pair?.lastActivityAt ?? 'x'))).toBe(false);
    });
    runtime.tracker.dispose();
    runtime.watcher.stop();
  });

  it('answers an empty list when the runtime is bound to another project', async () => {
    const runtime = makeActiveRuntime();
    setAgentEditRuntimeForTests({ tracker: runtime.tracker, watcher: runtime.watcher }, join(kandownDir, 'elsewhere'));
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/agent/active-edits`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ edits: [] });
    });
    runtime.tracker.dispose();
    runtime.watcher.stop();
  });

  it('sits behind the global token auth like every other route', async () => {
    const token = generateToken();
    setActiveToken(token);
    await withServer(async (baseUrl) => {
      const without = await fetch(`${baseUrl}/api/agent/active-edits`);
      expect(without.status).toBe(401);

      const withHeader = await fetch(`${baseUrl}/api/agent/active-edits`, {
        headers: { 'X-Kandown-Token': token },
      });
      expect(withHeader.status).toBe(200);
      expect(await withHeader.json()).toEqual({ edits: [] });
    });
  });
});
