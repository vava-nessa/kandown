/**
 * @file Kandown Work CLI adapter tests
 * @description Proves fresh projects print the exact shared compiler output on
 * stdout and that an explicit task replaces the general board digest.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cmdWork } from '../../commands/project';
import { compileProjectKandownWork } from '../kandown-work';
import { doInit } from '../init';

let root = '';
afterEach(() => {
  vi.restoreAllMocks();
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

describe('kandown work CLI', () => {
  it('prints the exact shared compiler result on stdout', async () => {
    root = mkdtempSync(join(tmpdir(), 'kandown-work-cli-'));
    const kandownDir = join(root, '.kandown');
    expect(doInit(kandownDir)).toBe(true);
    const expected = compileProjectKandownWork(kandownDir);
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const metadata = vi.spyOn(console, 'error').mockImplementation(() => {});

    await cmdWork(['--path', kandownDir]);

    expect(output).toHaveBeenCalledTimes(1);
    expect(output.mock.calls[0]?.[0]).toBe(expected.markdown);
    expect(metadata).toHaveBeenCalledWith(expect.stringContaining(`~${expected.stats.estimatedTokens.toLocaleString('en-US')} tokens`));
  });

  it('uses explicit task context instead of the general board digest', () => {
    root = mkdtempSync(join(tmpdir(), 'kandown-work-task-'));
    const kandownDir = join(root, '.kandown');
    expect(doInit(kandownDir)).toBe(true);
    const task = compileProjectKandownWork(kandownDir, 't0');

    expect(task.markdown).toContain('## Target Task Context');
    expect(task.markdown).not.toContain('## Current Board Digest');
  });
});
