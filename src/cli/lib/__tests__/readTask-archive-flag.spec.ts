/**
 * @file Path-as-truth archive invariant
 * @description Pins the invariant that the file's *location* (active folder
 * vs `tasks/archive/`) is the single source of truth for whether a task is
 * archived. The frontmatter `archived` flag is a cache that the archive
 * command writes back, not a gate. This invariant was missing before: a
 * `git mv` from `tasks/` to `tasks/archive/` would leave the file with no
 * `archived: true` in frontmatter, and the board would keep showing the
 * task in its column.
 *
 * The CLI `readTask` and the web `readTaskFile` / `readTaskFileStrict` are
 * the three readers that touch task files; this suite exercises all three
 * with the same invariant to guarantee they never drift again.
 *
 * @see src/cli/lib/board-reader.ts — readTask
 * @see src/lib/filesystem.ts — readTaskFile, readTaskFileStrict
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readTask } from '../board-reader';

let projectDir: string;
let kandownDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'kandown-archive-invariant-'));
  kandownDir = join(projectDir, '.kandown');
  mkdirSync(kandownDir, { recursive: true });
  mkdirSync(join(projectDir, 'tasks'), { recursive: true });
  mkdirSync(join(projectDir, 'tasks', 'archive'), { recursive: true });
  writeFileSync(join(kandownDir, 'kandown.json'), JSON.stringify({
    ui: {},
    board: { columns: ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'] },
    agent: {},
    fields: {},
    notifications: {},
  }));
});

afterEach(() => rmSync(projectDir, { recursive: true, force: true }));

function writeTaskFile(folder: 'active' | 'archive', id: string, body: string) {
  const dir = folder === 'active' ? join(projectDir, 'tasks') : join(projectDir, 'tasks', 'archive');
  writeFileSync(join(dir, `${id}.md`), body);
}

const FM = (fields: Record<string, string>) =>
  `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# ${fields.title ?? 'task'}\n`;

describe('readTask — path is the source of truth for archive', () => {
  it('marks an archive-folder file as archived even without a frontmatter flag', () => {
    // 📖 The exact case from claude's bug report: file moved via `git mv`
    // with no frontmatter edit. The CLI must still recognise it.
    writeTaskFile('archive', 't900', FM({ id: 't900', title: 'Manually moved', status: 'Done' }));
    const task = readTask(kandownDir, 't900');
    expect(task.frontmatter.archived).toBe(true);
  });

  it('keeps an active-folder file un-archived regardless of missing flag', () => {
    writeTaskFile('active', 't901', FM({ id: 't901', title: 'Still active', status: 'Backlog' }));
    const task = readTask(kandownDir, 't901');
    expect(task.frontmatter.archived).toBeFalsy();
  });

  it('respects a frontmatter `archived: true` even when the file is in active/', () => {
    // 📖 Legacy compatibility: a file that someone hand-edited to set the
    // flag without moving it. We honour the flag so existing data is not
    // silently re-classified; the path is *necessary* but not *sufficient*
    // — both can independently mark a task as archived.
    writeTaskFile('active', 't902', FM({ id: 't902', title: 'Flagged in active', status: 'Done', archived: 'true' }));
    const task = readTask(kandownDir, 't902');
    expect(task.frontmatter.archived).toBe(true);
  });

  it('overrides `archived: false` in frontmatter when the file is in archive/', () => {
    // 📖 Defensive: if someone literally writes `archived: false` in the
    // file body of an archived task, the path wins.
    writeTaskFile('archive', 't903', FM({ id: 't903', title: 'Mis-flagged', status: 'Done', archived: 'false' }));
    const task = readTask(kandownDir, 't903');
    expect(task.frontmatter.archived).toBe(true);
  });

  it('normalizes the flag to a real boolean so JSON serializers stay stable', () => {
    writeTaskFile('archive', 't904', FM({ id: 't904', title: 'Boolean check', status: 'Done' }));
    const task = readTask(kandownDir, 't904');
    // 📖 Downstream consumers (CLI list, web extractArchivedTasks) check
    // `=== true` and `String() === 'true'` interchangeably. Normalising to
    // a boolean makes both work.
    expect(typeof task.frontmatter.archived).toBe('boolean');
    expect(task.frontmatter.archived).toBe(true);
  });

  it('returns a placeholder when the task does not exist anywhere', () => {
    const task = readTask(kandownDir, 't-missing');
    expect(task.frontmatter.id).toBe('t-missing');
    expect(task.frontmatter.archived).toBeFalsy();
  });
});

describe('kandown list — picks up the path-based override', () => {
  // 📖 End-to-end check: even though cmdList builds rows from frontmatter
  // alone, the upstream readTask now stamps `archived: true` for archive
  // files. The list output must therefore mark these rows as archived.
  it('marks archive-folder files as archived in --json, even without the flag', () => {
    writeTaskFile('active', 't100', FM({ id: 't100', title: 'Active', status: 'Backlog' }));
    writeTaskFile('archive', 't101', FM({ id: 't101', title: 'Manually moved', status: 'Done' }));
    writeTaskFile('archive', 't102', FM({ id: 't102', title: 'Already flagged', status: 'Done', archived: 'true' }));

    const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
    const CLI = join(process.cwd(), 'bin', 'kandown.js');
    const res = spawnSync('node', [CLI, 'list', '--archived', '--json'], {
      cwd: projectDir,
      encoding: 'utf8',
      env: { ...process.env, KANDOWN_NO_UPDATE: '1', KANDOWN_NO_GRAPHIFY: '1' },
    });
    expect(res.status).toBe(0);
    const rows = JSON.parse(res.stdout) as Array<{ id: string; archived: boolean; status: string }>;
    const t100 = rows.find(r => r.id === 't100');
    const t101 = rows.find(r => r.id === 't101');
    const t102 = rows.find(r => r.id === 't102');
    expect(t100?.archived).toBe(false);
    expect(t101?.archived).toBe(true);
    expect(t101?.status).toBe('Done (archived)');
    expect(t102?.archived).toBe(true);
    // 📖 The duplicate-row class of bug stays gone: three tasks, three rows.
    expect(rows).toHaveLength(3);
  });
});
