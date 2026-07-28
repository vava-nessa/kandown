/**
 * @file Website demo move endpoint tests
 * @description Locks the in-memory backend to the managed move protocol. Core
 * dependency refusals match the daemon while Node-only extension gates degrade
 * open and nested plugin data survives successful moves.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_SUPPORTED_ROUTES, demoApi, installDemoBackend, resetDemoBackend } from '../demoBackend';
import { serverMoveTask } from '../filesystem';
import { parseTaskFile } from '../parser';
import { serializeTaskFile } from '../serializer';
import type { MoveTaskResult, TaskFrontmatter } from '../types';

beforeEach(async () => {
  resetDemoBackend();
  await demoApi('/api/config', {
    method: 'PUT',
    body: JSON.stringify({ board: { columns: ['Backlog', 'In Progress', 'Done'] } }),
  });
});

async function putTask(id: string, frontmatter: Partial<TaskFrontmatter>): Promise<void> {
  await demoApi(`/api/tasks/${id}`, {
    method: 'PUT',
    body: serializeTaskFile({ id, title: id, status: 'In Progress', ...frontmatter }, `# ${id}\n`),
  });
}

async function move(id: string, to: string): Promise<{ response: Response; result: MoveTaskResult }> {
  const response = await demoApi(`/api/tasks/${id}/move`, {
    method: 'POST',
    body: JSON.stringify({ to }),
  });
  return { response, result: await response.json() as MoveTaskResult };
}

describe('demo move route', () => {
  it('documents and enforces the dependency gate', async () => {
    expect(DEMO_SUPPORTED_ROUTES).toContain('POST /api/tasks/:id/move');
    await putTask('t1', { depends_on: ['t2'] });
    await putTask('t2', { status: 'Backlog' });

    const { response, result } = await move('t1', 'Done');
    expect(response.status).toBe(409);
    expect(result).toMatchObject({ ok: false, kind: 'dependency', blockedBy: ['t2'] });
    const taskResponse = await demoApi('/api/tasks/t1');
    expect(parseTaskFile(await taskResponse.text()).frontmatter.status).toBe('In Progress');
  });

  it('returns gate refusals through the filesystem move helper', async () => {
    await putTask('t1', { depends_on: ['t2'] });
    await putTask('t2', { status: 'Backlog' });
    installDemoBackend();

    const result = await serverMoveTask('t1', 'Done');
    expect(result).toMatchObject({ ok: false, kind: 'dependency', blockedBy: ['t2'] });
  });

  it('moves without a Node host and preserves nested plugin data', async () => {
    await putTask('t1', { plugins: { burndown: { points: 5 } } });

    const { response, result } = await move('t1', 'Done');
    expect(response.status).toBe(200);
    expect(result).toEqual({ ok: true, from: 'In Progress', to: 'Done', failedIds: [] });
    const taskResponse = await demoApi('/api/tasks/t1');
    const frontmatter = parseTaskFile(await taskResponse.text()).frontmatter;
    expect(frontmatter.status).toBe('Done');
    expect(frontmatter.plugins).toEqual({ burndown: { points: '5' } });
  });
});
