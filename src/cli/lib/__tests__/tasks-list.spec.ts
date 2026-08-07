/**
 * @file `kandown list` integration tests
 * @description Pins the behaviour that broke when cmdList rebuilt its rows by
 * hand instead of going through `buildColumnsFromTasks`. The old version
 * hardcoded `archived: false` for every row and walked the archive folder a
 * second time when `--archived` was set, producing:
 *   - rows flagged `archived: false` even when they came from the archive
 *     folder (the actual bug reported from the suzu board);
 *   - duplicated rows in `--archived` mode (one without the suffix, one with).
 *
 * These tests seed an isolated tmpdir board, invoke `bin/kandown.js list`,
 * and assert both the JSON shape and the visible output. Running through the
 * published CLI bundle (not the source directly) means the same path any
 * user or agent would take — a regression in cmdList that survives the
 * build would still fail here.
 *
 * @see src/cli/commands/tasks.ts — cmdList
 * @see src/cli/lib/board-reader.ts — listTaskIds, readTask
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI = join(process.cwd(), 'bin', 'kandown.js');

function runCli(cwd: string, args: string[]): { stdout: string; stderr: string; status: number } {
  const res = spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KANDOWN_NO_UPDATE: '1', KANDOWN_NO_GRAPHIFY: '1' },
  });
  return { stdout: res.stdout, stderr: res.stderr, status: res.status ?? -1 };
}

interface SeedTask {
  id: string;
  title: string;
  status: string;
  archived?: boolean;
}

function seedProject(tasks: SeedTask[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'kandown-list-'));
  mkdirSync(join(dir, '.kandown'), { recursive: true });
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeFileSync(join(dir, '.kandown', 'kandown.json'), JSON.stringify({
    ui: {},
    board: { columns: ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'] },
    agent: { suggestFollowUp: false, workOutput: { mode: 'blocks', includeBaseRules: true, baseRulesMode: 'full', includeProjectInstructions: true, includeBoardDigest: true, sectionOrder: [], rawTemplate: '', boardDigest: { showColumnCounts: false, showTasks: false, showPriority: false, showAssignee: false, showBlockedBy: false, showNextActionable: false } } },
    fields: {},
    notifications: {},
  }));
  for (const t of tasks) {
    const fm: Record<string, unknown> = { id: t.id, title: t.title, status: t.status };
    if (t.archived) fm.archived = true;
    const body = `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${typeof v === 'string' && v.includes(' ') ? JSON.stringify(v) : v}`).join('\n')}\n---\n\n# ${t.title}\n`;
    writeFileSync(join(dir, 'tasks', `${t.id}.md`), body);
  }
  return dir;
}

describe('kandown list', () => {
  let dir: string;
  beforeEach(() => {
    dir = seedProject([
      { id: 't1', title: 'Active task', status: 'Backlog' },
      { id: 't2', title: 'In progress', status: 'In Progress' },
      { id: 't3', title: 'Done task', status: 'Done', archived: true },
      { id: 't4', title: 'Another done', status: 'Done', archived: true },
    ]);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('defaults to active tasks only, never archived', () => {
    const res = runCli(dir, ['list', '--json']);
    expect(res.status).toBe(0);
    const rows = JSON.parse(res.stdout);
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { id: string }) => r.id).sort()).toEqual(['t1', 't2']);
    // 📖 The bug we are pinning: every row was `archived: false` even when
    // it came from the archive folder. Active-only output must therefore
    // never carry `archived: true`.
    expect(rows.every((r: { archived: boolean }) => r.archived === false)).toBe(true);
  });

  it('--archived includes archived tasks with the right flag', () => {
    const res = runCli(dir, ['list', '--archived', '--json']);
    expect(res.status).toBe(0);
    const rows = JSON.parse(res.stdout);
    expect(rows).toHaveLength(4);
    const archived = rows.filter((r: { archived: boolean }) => r.archived);
    const active = rows.filter((r: { archived: boolean }) => !r.archived);
    expect(archived.map((r: { id: string }) => r.id).sort()).toEqual(['t3', 't4']);
    expect(active.map((r: { id: string }) => r.id).sort()).toEqual(['t1', 't2']);
  });

  it('--archived does not duplicate ids (the original bug)', () => {
    const res = runCli(dir, ['list', '--archived', '--json']);
    const rows = JSON.parse(res.stdout);
    const ids = rows.map((r: { id: string }) => r.id);
    // 📖 The previous implementation walked the archive folder twice in
    // `--archived` mode, so each archived id appeared once with
    // `archived: false` and once with `archived: true`. Assert the new
    // shape never produces the duplicate.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('archived rows carry the `(archived)` status suffix in --archived', () => {
    const res = runCli(dir, ['list', '--archived', '--json']);
    const rows = JSON.parse(res.stdout);
    const t3 = rows.find((r: { id: string }) => r.id === 't3');
    expect(t3.status).toBe('Done (archived)');
  });

  it('human-readable output lists active by default and respects --archived', () => {
    const defaultRes = runCli(dir, ['list']);
    expect(defaultRes.stdout).toContain('t1');
    expect(defaultRes.stdout).toContain('t2');
    expect(defaultRes.stdout).not.toContain('t3');

    const withArchived = runCli(dir, ['list', '--archived']);
    expect(withArchived.stdout).toContain('t1');
    expect(withArchived.stdout).toContain('t3');
    expect(withArchived.stdout).toContain('(archived)');
  });
});
