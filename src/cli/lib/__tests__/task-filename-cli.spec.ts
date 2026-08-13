/**
 * @file Integration tests for descriptive task filenames
 * @description Spawns `bin/kandown.js` (the published CLI bundle) against a
 * throwaway project whose `tasks/` folder deliberately mixes both naming forms:
 * the legacy bare `t1.md` and the descriptive `t2_add_dark_mode.md`. This is the
 * acceptance gate for t292: the id is what identifies a task, the filename is
 * decoration, and no user should ever be able to tell which form a given task
 * uses.
 *
 * These run through the real CLI rather than the helpers so the whole chain is
 * proven at once: `listTaskIds`, the resolver, the readers and the writers. A
 * unit test on the pure module cannot catch a caller that still builds
 * `${id}.md` by hand, and that was the actual risk in this change.
 *
 * @see src/lib/task-filename.ts
 * @see tasks/t292.md
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI = join(process.cwd(), 'bin', 'kandown.js');

function run(cwd: string, args: string[]) {
  return spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KANDOWN_NO_UPDATE: '1', KANDOWN_NO_GRAPHIFY: '1' },
  });
}

/** 📖 A project holding one bare-named task and one descriptively named task. */
function setupMixedProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kandown-slug-'));
  mkdirSync(join(dir, '.kandown'), { recursive: true });
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeFileSync(join(dir, '.kandown', 'kandown.json'), JSON.stringify({
    ui: {},
    board: { columns: ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'] },
  }, null, 2));

  writeFileSync(join(dir, 'tasks', 't1.md'),
    '---\nid: t1\ntitle: Legacy bare filename\nstatus: Backlog\n---\n\n# Legacy\n');
  writeFileSync(join(dir, 'tasks', 't2_add_dark_mode.md'),
    '---\nid: t2\ntitle: Add dark mode\nstatus: Todo\ndepends_on: [t1]\n---\n\n# Dark mode\n');
  return dir;
}

function taskFiles(dir: string, sub = ''): string[] {
  const target = sub ? join(dir, 'tasks', sub) : join(dir, 'tasks');
  return existsSync(target) ? readdirSync(target).filter(f => f.endsWith('.md')).sort() : [];
}

describe('descriptive task filenames', () => {
  let dir: string;
  beforeEach(() => { dir = setupMixedProject(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('lists both naming forms under their canonical ids', () => {
    const res = run(dir, ['list', '--json']);
    expect(res.status).toBe(0);
    const rows = JSON.parse(res.stdout) as Array<{ id: string; title: string }>;
    expect(rows.map(r => r.id).sort()).toEqual(['t1', 't2']);
    expect(rows.find(r => r.id === 't2')?.title).toBe('Add dark mode');
  });

  it('shows a descriptively named task by its bare id', () => {
    const res = run(dir, ['show', 't2']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Add dark mode');
  });

  it('reports a missing task rather than inventing a match', () => {
    const res = run(dir, ['show', 't9']);
    expect(res.status).not.toBe(0);
  });

  it('creates new tasks with a descriptive filename', () => {
    const res = run(dir, ['create', 'Fix the login button']);
    expect(res.status).toBe(0);
    expect(taskFiles(dir)).toContain('t3_fix_login_button.md');
    // 📖 The frontmatter id stays the short canonical one.
    const content = readFileSync(join(dir, 'tasks', 't3_fix_login_button.md'), 'utf8');
    expect(content).toMatch(/^id: t3$/m);
    expect(run(dir, ['show', 't3']).stdout).toContain('Fix the login button');
  });

  it('falls back to the bare id when a title has no ASCII words', () => {
    expect(run(dir, ['create', '🎉🎉']).status).toBe(0);
    expect(taskFiles(dir)).toContain('t3.md');
  });

  it('allocates the next id across both naming forms', () => {
    run(dir, ['create', 'One more thing']);
    const created = taskFiles(dir).find(f => f.startsWith('t3'));
    expect(created).toBeDefined();
    run(dir, ['create', 'And another']);
    expect(taskFiles(dir).some(f => f.startsWith('t4'))).toBe(true);
  });

  it('moves a descriptively named task without renaming its file', () => {
    expect(run(dir, ['move', 't1', 'Done']).status).toBe(0);
    const res = run(dir, ['move', 't2', 'In Progress']);
    expect(res.status).toBe(0);
    expect(taskFiles(dir)).toEqual(['t1.md', 't2_add_dark_mode.md']);
    expect(readFileSync(join(dir, 'tasks', 't2_add_dark_mode.md'), 'utf8')).toMatch(/^status: In Progress$/m);
  });

  it('keeps the dependency gate working across naming forms', () => {
    // 📖 t2 depends on t1, which is still in Backlog: the gate must refuse.
    const refused = run(dir, ['move', 't2', 'Done']);
    expect(refused.status).not.toBe(0);
    expect(run(dir, ['move', 't1', 'Done']).status).toBe(0);
    expect(run(dir, ['move', 't2', 'Done']).status).toBe(0);
  });

  it('assigns an agent to a descriptively named task', () => {
    expect(run(dir, ['assign', 't2', 'claude']).status).toBe(0);
    expect(readFileSync(join(dir, 'tasks', 't2_add_dark_mode.md'), 'utf8')).toMatch(/^assignee: claude$/m);
  });

  it('archives a task under the filename it already had', () => {
    expect(run(dir, ['move', 't2', 'archived']).status).toBe(0);
    expect(taskFiles(dir)).toEqual(['t1.md']);
    expect(taskFiles(dir, 'archive')).toEqual(['t2_add_dark_mode.md']);
    // 📖 An archived task is still resolvable by id.
    expect(run(dir, ['show', 't2']).stdout).toContain('Add dark mode');
  });

  it('never reuses an id already taken by an archived descriptive file', () => {
    run(dir, ['move', 't2', 'archived']);
    run(dir, ['create', 'Brand new work']);
    expect(taskFiles(dir).some(f => f.startsWith('t3'))).toBe(true);
    expect(taskFiles(dir, 'archive')).toEqual(['t2_add_dark_mode.md']);
  });
});
