/**
 * @file Session index unit tests
 * @description Pins the t308 chat-session index contract against a disposable
 * fake home directory (the module's `~/.kandown/sessions` base is redirected
 * by mocking `os.homedir`, so no real home state is ever touched):
 *
 *   1. upsert writes one JSON file per session and list reads it back whole.
 *   2. listSessionIndexEntries sorts by updatedAt, newest first, stable on ties.
 *   3. patch merges a partial update, preserves createdAt, and reorders.
 *   4. forget removes the entry; forgetting an unknown id is a silent no-op.
 *   5. A corrupt sibling file is skipped, never thrown, never listed.
 *   6. Two different projectRoots map to two different directories, and the
 *      directory name equals node:crypto's sha256(canonical root).slice(0, 24),
 *      the exact keying extension state already has on disk.
 *   7. indexEntryForPrompt derives titles: first non-empty line, collapsed,
 *      capped at 60 characters.
 *
 * @see src/cli/lib/agent/session-index.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  forgetSessionIndexEntry,
  indexEntryForPrompt,
  listSessionIndexEntries,
  patchSessionIndexEntry,
  sessionIndexDir,
  upsertSessionIndexEntry,
  type SessionIndexEntry,
} from '../agent/session-index';

// 📖 Redirect the module's home directory to a per-test temp dir. The holder
// object is hoisted so the mock factory can close over it before any test runs.
const fakeHome = vi.hoisted(() => ({ current: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => fakeHome.current };
});

const cleanups: Array<() => void> = [];

function makeFakeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'kandown-sessions-home-'));
  fakeHome.current = home;
  cleanups.push(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'kandown-sessions-proj-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function makeEntry(overrides: Partial<SessionIndexEntry> = {}): SessionIndexEntry {
  return {
    id: 'ses_abc12345',
    harnessId: 'claude',
    title: 'Fix the login loop',
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  makeFakeHome();
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  fakeHome.current = '';
});

describe('session index', () => {
  it('upserts one JSON file per session and lists it back whole', () => {
    const root = makeProjectRoot();
    upsertSessionIndexEntry(root, makeEntry({ harnessSessionId: 'claude-1', taskId: 't308' }));

    const dir = sessionIndexDir(root);
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir)).toEqual(['ses_abc12345.json']);

    const entries = listSessionIndexEntries(root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      id: 'ses_abc12345',
      harnessId: 'claude',
      harnessSessionId: 'claude-1',
      title: 'Fix the login loop',
      taskId: 't308',
      createdAt: '2026-09-05T10:00:00.000Z',
      updatedAt: '2026-09-05T10:00:00.000Z',
    });
  });

  it('lists entries newest-activity-first with a stable tie-break', () => {
    const root = makeProjectRoot();
    upsertSessionIndexEntry(root, makeEntry({ id: 'ses_old', updatedAt: '2026-09-05T09:00:00.000Z' }));
    upsertSessionIndexEntry(root, makeEntry({ id: 'ses_new', updatedAt: '2026-09-05T11:00:00.000Z' }));
    upsertSessionIndexEntry(root, makeEntry({ id: 'ses_mid', updatedAt: '2026-09-05T10:00:00.000Z' }));
    upsertSessionIndexEntry(root, makeEntry({ id: 'ses_tie', updatedAt: '2026-09-05T10:00:00.000Z', createdAt: '2026-09-05T08:00:00.000Z' }));

    const ids = listSessionIndexEntries(root).map(entry => entry.id);
    expect(ids).toEqual(['ses_new', 'ses_mid', 'ses_tie', 'ses_old']);
  });

  it('patches title, harnessSessionId and updatedAt while keeping createdAt', () => {
    const root = makeProjectRoot();
    upsertSessionIndexEntry(root, makeEntry({ id: 'ses_patch', createdAt: '2026-09-05T08:00:00.000Z', updatedAt: '2026-09-05T08:00:00.000Z' }));

    patchSessionIndexEntry(root, 'ses_patch', {
      harnessSessionId: 'codex-thread-7',
      title: 'Renamed conversation',
      updatedAt: '2026-09-05T12:00:00.000Z',
    });

    const [entry] = listSessionIndexEntries(root);
    expect(entry?.harnessSessionId).toBe('codex-thread-7');
    expect(entry?.title).toBe('Renamed conversation');
    expect(entry?.updatedAt).toBe('2026-09-05T12:00:00.000Z');
    expect(entry?.createdAt).toBe('2026-09-05T08:00:00.000Z');
  });

  it('treats patching an unknown id as a silent no-op', () => {
    const root = makeProjectRoot();
    expect(() => patchSessionIndexEntry(root, 'ses_missing', { title: 'nope' })).not.toThrow();
    expect(listSessionIndexEntries(root)).toEqual([]);
    expect(existsSync(join(sessionIndexDir(root), 'ses_missing.json'))).toBe(false);
  });

  it('forgets an entry and stays silent when it is already gone', () => {
    const root = makeProjectRoot();
    upsertSessionIndexEntry(root, makeEntry({ id: 'ses_gone' }));
    forgetSessionIndexEntry(root, 'ses_gone');
    expect(listSessionIndexEntries(root)).toEqual([]);
    expect(() => forgetSessionIndexEntry(root, 'ses_gone')).not.toThrow();
    expect(() => forgetSessionIndexEntry(root, 'ses_never_existed')).not.toThrow();
  });

  it('skips corrupt sibling files instead of throwing or listing them', () => {
    const root = makeProjectRoot();
    upsertSessionIndexEntry(root, makeEntry({ id: 'ses_good' }));
    const dir = sessionIndexDir(root);
    writeFileSync(join(dir, 'ses_broken.json'), '{ this is not json', 'utf8');
    writeFileSync(join(dir, 'ses_wrongshape.json'), JSON.stringify({ hello: 'world' }), 'utf8');

    const entries = listSessionIndexEntries(root);
    expect(entries.map(entry => entry.id)).toEqual(['ses_good']);

    // 📖 Patching onto a corrupt entry is a no-op, not a resurrection of it.
    expect(() => patchSessionIndexEntry(root, 'ses_broken', { title: 'x' })).not.toThrow();
    expect(listSessionIndexEntries(root).map(entry => entry.id)).toEqual(['ses_good']);
  });

  it('maps two different projectRoots to different directories keyed like extension state', () => {
    const rootA = makeProjectRoot();
    const rootB = makeProjectRoot();
    upsertSessionIndexEntry(rootA, makeEntry({ id: 'ses_in_a' }));

    const dirA = sessionIndexDir(rootA);
    const dirB = sessionIndexDir(rootB);
    expect(dirA).not.toBe(dirB);
    expect(dirA).toContain(join(fakeHome.current, '.kandown', 'sessions'));

    // 📖 Byte-for-byte keying: same sha256 prefix as node:crypto, so the
    // session index and ~/.kandown/project-state always agree on a project.
    const expectedHash = createHash('sha256').update(realpathSync(rootA)).digest('hex').slice(0, 24);
    expect(dirA.endsWith(expectedHash)).toBe(true);
    expect(listSessionIndexEntries(rootB)).toEqual([]);
  });

  it('sanitizes hostile ids into safe file names', () => {
    const root = makeProjectRoot();
    upsertSessionIndexEntry(root, makeEntry({ id: '../../etc/passwd' }));

    const dir = sessionIndexDir(root);
    // 📖 Slashes fold to underscores, so the id stays one flat file and no
    // directory traversal can happen.
    expect(readdirSync(dir)).toEqual(['.._.._etc_passwd.json']);
    expect(listSessionIndexEntries(root).map(entry => entry.id)).toEqual(['../../etc/passwd']);
  });

  it('returns an empty list when the project has no index directory yet', () => {
    const root = makeProjectRoot();
    expect(existsSync(sessionIndexDir(root))).toBe(false);
    expect(listSessionIndexEntries(root)).toEqual([]);
  });
});

describe('indexEntryForPrompt', () => {
  it('uses the first non-empty line and collapses whitespace', () => {
    expect(indexEntryForPrompt('\n\n  Fix   the login\tloop  \nsecond line\n')).toBe('Fix the login loop');
  });

  it('caps the title at 60 characters', () => {
    const long = 'a'.repeat(200);
    expect(indexEntryForPrompt(long)).toHaveLength(60);
    // 📖 Plain character cap, trailing space trimmed: 50 x's, a space, then
    // exactly 9 of the y's fit inside 60.
    expect(indexEntryForPrompt(`${'x'.repeat(50)} ${'y'.repeat(50)}`)).toBe(`${'x'.repeat(50)} ${'y'.repeat(9)}`);
  });

  it('returns an empty string for empty or whitespace-only prompts', () => {
    expect(indexEntryForPrompt('')).toBe('');
    expect(indexEntryForPrompt('   \n\t\n  ')).toBe('');
  });
});
