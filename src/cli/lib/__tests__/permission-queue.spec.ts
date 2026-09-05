/**
 * @file Permission queue tests
 * @description Locks the FIFO approval store behind the t309 live-edit
 * endpoints: per-session ordering, resolve answering exactly once with the
 * right decision, the found/not-found contract for unknown sessions, unknown
 * ids and double resolves, and the session teardown drop. Pure module: no
 * JSON-RPC, no processes, no timers.
 *
 * @functions
 *  → (vitest suites)
 *
 * @exports (tests)
 * @see src/cli/lib/agent/permission-queue.ts
 */

import { describe, expect, it } from 'vitest';
import { createPermissionQueue } from '../agent/permission-queue';
import type { PermissionAnswer } from '../agent/permission-queue';

function recordingRespond(answers: PermissionAnswer[]): (answer: PermissionAnswer) => void {
  return answer => {
    answers.push(answer);
  };
}

describe('permission queue', () => {
  it('keeps FIFO order per session and never leaks respond', () => {
    const queue = createPermissionQueue();
    queue.push({ sessionId: 'ses_a', title: 'Edit file', kind: 'edit', respond: () => {} });
    queue.push({ sessionId: 'ses_a', title: 'Delete file', kind: 'delete', respond: () => {} });
    queue.push({ sessionId: 'ses_b', title: 'Run command', kind: 'execute', respond: () => {} });

    expect(queue.listPending('ses_a')).toEqual([
      { permissionId: expect.any(String), title: 'Edit file', kind: 'edit' },
      { permissionId: expect.any(String), title: 'Delete file', kind: 'delete' },
    ]);
    expect(queue.listPending('ses_b')).toHaveLength(1);
    expect(queue.listPending('ses_unknown')).toEqual([]);
    expect(queue.pendingCount()).toBe(3);
  });

  it('resolves the entry once, invoking respond with the decision', () => {
    const queue = createPermissionQueue();
    const answers: PermissionAnswer[] = [];
    const { permissionId } = queue.push({
      sessionId: 'ses_a',
      title: 'Edit file',
      kind: 'edit',
      respond: recordingRespond(answers),
    });

    expect(queue.resolve('ses_a', permissionId, true)).toBe(true);
    expect(answers).toEqual(['allow']);
    expect(queue.listPending('ses_a')).toEqual([]);

    // 📖 A second resolve is a 404 at the endpoint, never a second answer.
    expect(queue.resolve('ses_a', permissionId, false)).toBe(false);
    expect(answers).toEqual(['allow']);
  });

  it('rejects with reject semantics and answers false for unknown ids or sessions', () => {
    const queue = createPermissionQueue();
    const answers: PermissionAnswer[] = [];
    const { permissionId } = queue.push({
      sessionId: 'ses_a',
      title: 'Move file',
      kind: 'move',
      respond: recordingRespond(answers),
    });

    expect(queue.resolve('ses_b', permissionId, true)).toBe(false);
    expect(queue.resolve('ses_a', 'perm_missing', true)).toBe(false);
    expect(answers).toEqual([]);

    expect(queue.resolve('ses_a', permissionId, false)).toBe(true);
    expect(answers).toEqual(['reject']);
  });

  it('honors an explicit permissionId and generates unique ids otherwise', () => {
    const queue = createPermissionQueue();
    const first = queue.push({ sessionId: 'ses_a', title: 'A', kind: 'edit', respond: () => {} });
    const second = queue.push({
      sessionId: 'ses_a',
      permissionId: 'perm_pinned',
      title: 'B',
      kind: 'edit',
      respond: () => {},
    });

    expect(second.permissionId).toBe('perm_pinned');
    expect(first.permissionId).not.toBe('perm_pinned');
    expect(first.permissionId).toMatch(/^perm_/);
  });

  it('clearSession drops pending entries without answering them', () => {
    const queue = createPermissionQueue();
    const answers: PermissionAnswer[] = [];
    const { permissionId } = queue.push({
      sessionId: 'ses_a',
      title: 'Edit file',
      kind: 'edit',
      respond: recordingRespond(answers),
    });

    queue.clearSession('ses_a');
    expect(queue.listPending('ses_a')).toEqual([]);
    expect(queue.resolve('ses_a', permissionId, true)).toBe(false);
    expect(answers).toEqual([]);
  });

  it('survives a throwing respond callback and still reports found', () => {
    const queue = createPermissionQueue();
    queue.push({
      sessionId: 'ses_a',
      title: 'Edit file',
      kind: 'edit',
      respond: () => {
        throw new Error('stdin is gone');
      },
    });
    const [pending] = queue.listPending('ses_a');
    expect(queue.resolve('ses_a', pending.permissionId, true)).toBe(true);
    expect(queue.pendingCount()).toBe(0);
  });
});
