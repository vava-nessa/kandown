/**
 * @file dependency-gate behavior matrix
 * @description Vitest suite that locks the policy decisions into tests
 * (see docs/ARCHITECTURE.md invariant #2). Every shape in the file header
 * of src/lib/dependencies.ts becomes a test here; if a future change
 * drops a row, the matrix is no longer an honest description of the rule.
 *
 * The tests are pure: no react, no fs, no Ink. They construct the snapshot
 * the way each real caller does (board columns for web, ParsedTask[] for
 * CLI) so the same suite catches divergence between them.
 */

import { describe, it, expect } from 'vitest';
import type { TransitionTaskInput } from '../../src/lib/dependencies';
import {
  resolveTransition,
  assertTransitionAllowed,
  isTerminalStatus,
  isArchivedStatus,
  movesIntoArchived,
  resolveDependencyStatus,
  unresolvedDependencyIds,
  terminalStatus,
  DependencyGateError,
  checkTerminalStatusGate,
} from '../../src/lib/dependencies';
import type { ParsedTask, KandownConfig } from '../../src/lib/types';

const config: KandownConfig = {
  ui: {},
  board: { columns: ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'] },
} as KandownConfig;

function pt(id: string, status: string, deps: unknown = [], archived: boolean | string = false): ParsedTask {
  const depsArray = Array.isArray(deps) ? deps : typeof deps === 'string' ? [deps] : [];
  return {
    frontmatter: {
      id,
      status,
      depends_on: depsArray as string[],
      archived,
    } as ParsedTask['frontmatter'],
    body: '',
  };
}

function t(id: string, status: string, deps: string[] = [], archived = false): TransitionTaskInput {
  return { id, status, depends_on: deps, archived };
}

function board(...tasks: ParsedTask[]): Map<string, { exists: boolean; resolved: boolean }> {
  const map = resolveDependencyStatus(tasks, config);
  return map;
}

describe('isTerminalStatus', () => {
  it('matches the configured last column', () => {
    expect(isTerminalStatus('Done', config)).toBe(true);
  });
  it('matches case-insensitively', () => {
    expect(isTerminalStatus('done', config)).toBe(true);
    expect(isTerminalStatus('DONE', config)).toBe(true);
  });
  it('treats archived as terminal-equivalent', () => {
    expect(isTerminalStatus('archived', config)).toBe(true);
    expect(isTerminalStatus('Archived', config)).toBe(true);
  });
  it('rejects non-terminal statuses', () => {
    expect(isTerminalStatus('In Progress', config)).toBe(false);
    expect(isTerminalStatus('Review', config)).toBe(false);
    expect(isTerminalStatus('', config)).toBe(false);
  });
});

describe('isArchivedStatus', () => {
  it('detects literal archived status', () => {
    expect(isArchivedStatus('archived')).toBe(true);
    expect(isArchivedStatus('ARCHIVED')).toBe(true);
  });
  it('detects the archived flag', () => {
    expect(isArchivedStatus({ archived: true, status: 'Done' })).toBe(true);
    expect(isArchivedStatus({ archived: 'true' })).toBe(true);
    expect(isArchivedStatus({ archived: false, status: 'Done' })).toBe(false);
  });
  it('returns false for non-archived payloads', () => {
    expect(isArchivedStatus({ status: 'Done' })).toBe(false);
    expect(isArchivedStatus(null)).toBe(false);
    expect(isArchivedStatus(undefined)).toBe(false);
  });
});

describe('movesIntoArchived', () => {
  it('recognises the dedicated status', () => {
    expect(movesIntoArchived('archived')).toBe(true);
    expect(movesIntoArchived('ARCHIVED')).toBe(true);
  });
  it('rejects every other status', () => {
    expect(movesIntoArchived('Done')).toBe(false);
    expect(movesIntoArchived('In Progress')).toBe(false);
    expect(movesIntoArchived('')).toBe(false);
  });
});

describe('resolveTransition — happy path', () => {
  it('allows a free move between non-terminal columns', () => {
    const snap = board(pt('t1', 'Backlog'));
    expect(resolveTransition(pt('t1'), 'Todo', snap, config)).toEqual({
      allowed: true,
      reason: 'not-implemented',
    });
  });
  it('allows terminal when nothing blocks', () => {
    const snap = board(pt('t1', 'In Progress'));
    expect(resolveTransition(pt('t1'), 'Done', snap, config)).toEqual({
      allowed: true,
      reason: 'allowed',
    });
  });
  it('allows archiving when nothing blocks', () => {
    const snap = board(pt('t1', 'In Progress'));
    expect(resolveTransition(pt('t1'), 'archived', snap, config)).toEqual({
      allowed: true,
      reason: 'allowed',
    });
  });
});

describe('resolveTransition — blocked moves', () => {
  it('blocks a terminal move with one unresolved dep', () => {
    const t1 = pt('t1', 'In Progress', ['t2']);
    const t2 = pt('t2', 'Backlog');
    const snap = board(t1, t2);
    const verdict = resolveTransition(t1, 'Done', snap, config);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.blockedBy).toEqual(['t2']);
  });
  it('blocks archiving with the same rule', () => {
    const t1 = pt('t1', 'In Progress', ['t2']);
    const t2 = pt('t2', 'Backlog');
    const snap = board(t1, t2);
    const verdict = resolveTransition(t1, 'archived', snap, config);
    expect(verdict.allowed).toBe(false);
  });
  it('counts multiple unresolved deps in declaration order', () => {
    const t1 = pt('t1', 'In Progress', ['t3', 't2']);
    const t2 = pt('t2', 'Backlog');
    const t3 = pt('t3', 'Backlog');
    const snap = board(t1, t2, t3);
    const verdict = resolveTransition(t1, 'Done', snap, config);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.blockedBy).toEqual(['t3', 't2']);
  });
});

describe('resolveTransition — resolution rules', () => {
  it('treats a dep in the terminal column as resolved', () => {
    const t1 = pt('t1', 'In Progress', ['t2']);
    const t2 = pt('t2', 'Done');
    const snap = board(t1, t2);
    expect(resolveTransition(t1, 'Done', snap, config).allowed).toBe(true);
  });
  it('treats an archived dep as resolved', () => {
    const t1 = pt('t1', 'In Progress', ['t2']);
    const t2 = pt('t2', 'Backlog', [], true);
    const snap = board(t1, t2);
    expect(resolveTransition(t1, 'Done', snap, config).allowed).toBe(true);
  });
  it('treats an unknown dep id as resolved', () => {
    const t1 = pt('t1', 'In Progress', ['ghost']);
    const snap = board(t1);
    expect(resolveTransition(t1, 'Done', snap, config).allowed).toBe(true);
  });
  it('ignores self-references', () => {
    const t1 = pt('t1', 'In Progress', ['t1']);
    const snap = board(t1);
    expect(resolveTransition(t1, 'Done', snap, config).allowed).toBe(true);
  });
  it('survives a stringified depends_on', () => {
    const t1: ParsedTask = {
      frontmatter: { id: 't1', status: 'In Progress', depends_on: 't2' } as ParsedTask['frontmatter'],
      body: '',
    };
    const t2 = pt('t2', 'Done');
    const snap = board(t1, t2);
    expect(resolveTransition(t1, 'Done', snap, config).allowed).toBe(true);
  });
  it('survives a junk depends_on', () => {
    const t1: ParsedTask = {
      frontmatter: { id: 't1', status: 'In Progress', depends_on: ['', null, ' ', 't2'] as unknown as string[] } as ParsedTask['frontmatter'],
      body: '',
    };
    const t2 = pt('t2', 'Backlog');
    const snap = board(t1, t2);
    expect(resolveTransition(t1, 'Done', snap, config).allowed).toBe(false);
  });
});

describe('assertTransitionAllowed', () => {
  it('returns silently when allowed', () => {
    const snap = board(pt('t1', 'In Progress'));
    expect(() => assertTransitionAllowed(pt('t1'), 'Done', snap, config)).not.toThrow();
  });
  it('throws DependencyGateError with structured fields', () => {
    const t1 = pt('t1', 'In Progress', ['t2']);
    const t2 = pt('t2', 'Backlog');
    const snap = board(t1, t2);
    try {
      assertTransitionAllowed(t1, 'Done', snap, config);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DependencyGateError);
      const err = e as DependencyGateError;
      expect(err.taskId).toBe('t1');
      expect(err.targetStatus).toBe('Done');
      expect(err.blockedBy).toEqual(['t2']);
      expect(err.reason).toBe('unresolved-dependency');
      expect(err.message).toMatch(/t1/);
      expect(err.message).toMatch(/t2/);
      expect(err.message).toMatch(/Done/);
    }
  });
});

describe('terminalStatus / dependency helpers', () => {
  it('returns the configured terminal name', () => {
    expect(terminalStatus(config)).toBe('Done');
  });
  it('falls back to "Done" when columns are missing', () => {
    const empty = { board: { columns: [] } } as KandownConfig;
    expect(terminalStatus(empty)).toBe('Done');
  });
  it('exposes the unresolved list with self-refs stripped', () => {
    const t1 = pt('t1', 'In Progress', ['t1', 't2', 'ghost']);
    const t2 = pt('t2', 'Backlog');
    const snap = board(t1, t2);
    expect(unresolvedDependencyIds(t1, snap)).toEqual(['t2']);
  });
});

describe('legacy alias checkTerminalStatusGate', () => {
  it('still throws for terminal moves', () => {
    const t1 = pt('t1', 'In Progress', ['t2']);
    const t2 = pt('t2', 'Backlog');
    const snap = board(t1, t2);
    expect(() => checkTerminalStatusGate(t1, 'Done', snap, config)).toThrowError(DependencyGateError);
  });
  it('still no-ops for non-terminal moves', () => {
    const t1 = pt('t1', 'In Progress');
    const snap = board(t1);
    expect(() => checkTerminalStatusGate(t1, 'Todo', snap, config)).not.toThrow();
  });
});
