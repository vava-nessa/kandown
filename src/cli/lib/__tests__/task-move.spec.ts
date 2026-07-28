/**
 * @file Managed backend task move integration tests
 * @description Exercises the Node move coordinator against real task files and
 * a real jiti-loaded extension. The suite proves dependency and extension gate
 * refusals happen before writes, then verifies successful moves preserve order.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadExtensionHost } from '../extensions-cli';
import { createServeServer } from '../server';
import { moveTaskWithGates } from '../task-move';
import { parseTaskFile } from '../../../lib/parser';
import { serializeTaskFile } from '../../../lib/serializer';
import type { TaskFrontmatter } from '../../../lib/types';
import { extensionStateDir } from '../../../lib/extensions/state';

let projectDir: string;
let kandownDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'kandown-web-move-'));
  kandownDir = join(projectDir, '.kandown');
  mkdirSync(join(kandownDir, 'extensions', 'burndown'), { recursive: true });
  mkdirSync(join(projectDir, 'tasks'), { recursive: true });
  writeFileSync(join(kandownDir, 'kandown.json'), JSON.stringify({
    board: { columns: ['Backlog', 'In Progress', 'Done'] },
    extensions: { restricted: true },
  }));
  writeFileSync(join(kandownDir, 'extensions', 'burndown', 'manifest.json'), JSON.stringify({
    id: 'burndown',
    name: 'Burndown',
    version: '1.0.0',
    apiVersion: 1,
    permissions: ['read:tasks', 'write:field:plugins.burndown.*'],
  }));
  writeFileSync(join(kandownDir, 'extensions', 'burndown', 'index.ts'), `
    export default function (kd) {
      kd.contributeField({ key: 'points', label: 'Story points', type: 'number', badge: (value) => value ? 'P' + value : null });
      kd.contributeWebPanel({ id: 'chart', title: 'Burndown', entry: './web.js' });
      kd.contributeGate({
        on: 'task:beforeMove',
        to: 'Done',
        handler: async (event) => {
          await new Promise(resolve => setTimeout(resolve, 20));
          if (!event.task.plugins?.burndown?.points) {
            return { block: true, reason: 'Story points are required.' };
          }
        },
      });
    }
  `);
  writeFileSync(join(kandownDir, 'extensions', 'burndown', 'web.js'), `export const panels = { chart: () => null };`);
});

afterEach(() => {
  rmSync(join(extensionStateDir(projectDir), '..'), { recursive: true, force: true });
  if (existsSync(projectDir)) rmSync(projectDir, { recursive: true, force: true });
});

function writeTask(id: string, frontmatter: Partial<TaskFrontmatter>): void {
  writeFileSync(join(projectDir, 'tasks', `${id}.md`), serializeTaskFile({
    id,
    title: id,
    status: 'In Progress',
    ...frontmatter,
  }, `# ${id}\n`));
}

function readFrontmatter(id: string): TaskFrontmatter {
  return parseTaskFile(readFileSync(join(projectDir, 'tasks', `${id}.md`), 'utf8')).frontmatter;
}

async function enabledHost() {
  const host = await loadExtensionHost(kandownDir);
  expect(await host.enable('burndown')).toBe(true);
  return host;
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createServeServer(kandownDir);
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  }
}

describe('moveTaskWithGates', () => {
  it('returns a dependency reason and leaves the task unchanged', async () => {
    writeTask('t1', { depends_on: ['t2'] });
    writeTask('t2', { status: 'Backlog' });
    const result = await moveTaskWithGates(await enabledHost(), kandownDir, 't1', 'Done');

    expect(result).toMatchObject({
      ok: false,
      kind: 'dependency',
      blockedBy: ['t2'],
    });
    expect(result.ok ? '' : result.reason).toMatch(/blocked by t2/);
    expect(readFrontmatter('t1').status).toBe('In Progress');
  });

  it('returns the extension reason and leaves the task unchanged', async () => {
    writeTask('t1', {});
    const result = await moveTaskWithGates(await enabledHost(), kandownDir, 't1', 'Done');

    expect(result).toMatchObject({ ok: false, kind: 'extension' });
    expect(result.ok ? '' : result.reason).toMatch(/Story points are required/);
    expect(readFrontmatter('t1').status).toBe('In Progress');
  });

  it('moves a valid task and normalizes both affected column orders', async () => {
    writeTask('t1', { order: 0, plugins: { burndown: { points: 3 } } });
    writeTask('t2', { order: 1 });
    writeTask('t3', { status: 'Done', order: 0, plugins: { burndown: { points: 1 } } });
    const result = await moveTaskWithGates(await enabledHost(), kandownDir, 't1', 'Done', 0);

    expect(result).toEqual({ ok: true, from: 'In Progress', to: 'Done', failedIds: [] });
    expect(readFrontmatter('t1')).toMatchObject({ status: 'Done', order: '0' });
    expect(readFrontmatter('t2')).toMatchObject({ status: 'In Progress', order: '0' });
    expect(readFrontmatter('t3')).toMatchObject({ status: 'Done', order: '1' });
  });

  it('serializes concurrent moves so stale layouts cannot overwrite each other', async () => {
    writeTask('t1', { order: 0, plugins: { burndown: { points: 1 } } });
    writeTask('t2', { order: 1, plugins: { burndown: { points: 2 } } });
    const host = await enabledHost();
    const [first, second] = await Promise.all([
      moveTaskWithGates(host, kandownDir, 't1', 'Done', 0),
      moveTaskWithGates(host, kandownDir, 't2', 'Done', 0),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(readFrontmatter('t1')).toMatchObject({ status: 'Done', order: '1' });
    expect(readFrontmatter('t2')).toMatchObject({ status: 'Done', order: '0' });
  });

  it('surfaces an extension refusal through the daemon move route', async () => {
    writeTask('t1', {});
    await enabledHost();
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/tasks/t1/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'Done' }),
      });
      const result = await response.json() as { ok: boolean; kind?: string; reason?: string };
      expect(response.status).toBe(409);
      expect(result).toMatchObject({ ok: false, kind: 'extension' });
      expect(result.reason).toMatch(/Story points are required/);
      expect(readFrontmatter('t1').status).toBe('In Progress');
    });
  });

  it('reloads the cached host when restricted mode changes in either direction', async () => {
    const host = await enabledHost();
    expect(host.disable('burndown')).toBe(true);
    writeFileSync(join(kandownDir, 'kandown.json'), JSON.stringify({
      board: { columns: ['Backlog', 'In Progress', 'Done'] },
      extensions: { restricted: false },
    }));

    await withServer(async (baseUrl) => {
      const listExtension = async () => {
        const response = await fetch(`${baseUrl}/api/extensions`);
        const payload = await response.json() as { extensions: Array<{ id: string; health: string; error?: string }> };
        return payload.extensions.find((extension) => extension.id === 'burndown');
      };
      const initial = await listExtension();
      expect(initial?.health, JSON.stringify(initial)).toBe('enabled');

      const setRestricted = async (restricted: boolean) => {
        const response = await fetch(`${baseUrl}/api/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            board: { columns: ['Backlog', 'In Progress', 'Done'] },
            extensions: { restricted },
          }),
        });
        expect(response.status).toBe(200);
      };
      await setRestricted(true);
      expect((await listExtension())?.health).toBe('disabled');
      await setRestricted(false);
      expect((await listExtension())?.health).toBe('enabled');
    });
  });

  it('returns serializable field and panel definitions plus grouped badges', async () => {
    writeTask('t1', { plugins: { burndown: { points: 5 } } });
    await enabledHost();
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/extensions`);
      const payload = await response.json() as {
        extensions: Array<{ id: string; fields: unknown[]; panels: unknown[] }>;
        badges: Record<string, unknown[]>;
      };
      expect(response.status).toBe(200);
      expect(payload.extensions.find((extension) => extension.id === 'burndown')).toMatchObject({
        fields: [{ extId: 'burndown', key: 'points', label: 'Story points', type: 'number', hasBadge: true }],
        panels: [{ extId: 'burndown', id: 'chart', title: 'Burndown', entry: './web.js' }],
      });
      expect(payload.badges.t1).toEqual([{ extId: 'burndown', fieldKey: 'points', text: 'P5' }]);
      expect(JSON.stringify(payload.extensions)).not.toContain('badge:');
    });
  });

  it('validates field ownership and returns the authoritative plugins namespace', async () => {
    writeTask('t1', {});
    await enabledHost();
    await withServer(async (baseUrl) => {
      const valid = await fetch(`${baseUrl}/api/tasks/t1/field`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extId: 'burndown', key: 'points', value: 8 }),
      });
      expect(valid.status).toBe(200);
      expect(await valid.json()).toMatchObject({ plugins: { burndown: { points: '8' } } });
      expect(readFrontmatter('t1').plugins).toEqual({ burndown: { points: '8' } });

      const unknown = await fetch(`${baseUrl}/api/tasks/t1/field`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extId: 'burndown', key: 'other', value: 'nope' }),
      });
      expect(unknown.status).toBe(400);
      expect(await unknown.json()).toMatchObject({ error: expect.stringMatching(/unknown field/) });
    });
  });

  it('persistently quarantines an extension after three browser panel failures', async () => {
    writeTask('t1', {});
    await enabledHost();
    await withServer(async (baseUrl) => {
      for (let failure = 1; failure <= 3; failure++) {
        const response = await fetch(`${baseUrl}/api/extensions/burndown/health`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outcome: 'failure', message: `panel crash ${failure}` }),
        });
        expect(response.status).toBe(200);
        const health = await response.json() as { health: string; failures: number };
        expect(health.failures).toBe(failure);
        expect(health.health).toBe(failure === 3 ? 'quarantined' : 'enabled');
      }
    });

    const freshHost = await loadExtensionHost(kandownDir);
    expect(freshHost.get('burndown')?.health).toBe('quarantined');
  });
});
