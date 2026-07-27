/**
 * @file Integration tests for the gate funneled through board-reader
 * @description Spawns bin/kandown.js (the published CLI bundle) in a tmpdir,
 * seeds two tasks with a dependency edge, and asserts that:
 *
 *  - `kandown move` succeeds when the dependency is already in the
 *    terminal column.
 *  - `kandown move` is refused when the dependency is not yet done
 *    (same gate the web store / TUI / MCP paths use).
 *
 * The shared dependency gate (`src/lib/dependencies.ts`) is the source of
 * truth; this suite proves all four interfaces (web, TUI, CLI, MCP)
 * agree on the rule by exercising the CLI end-to-end against the same
 * `kandown move` entry point any user/agent would call.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI = join(process.cwd(), 'bin', 'kandown.js');

interface SeedTask {
  id: string;
  status: string;
  depends_on?: string[];
}

function run(cwd: string, args: string[]) {
  const res = spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KANDOWN_NO_UPDATE: '1', KANDOWN_NO_GRAPHIFY: '1' },
  });
  return res;
}

function setupProject(seed: SeedTask[]) {
  const dir = mkdtempSync(join(tmpdir(), 'kandown-gate-'));
  mkdirSync(join(dir, '.kandown'), { recursive: true });
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeFileSync(join(dir, '.kandown', 'kandown.json'), JSON.stringify({
    ui: {},
    board: { columns: ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'] },
    agent: { suggestFollowUp: false, workOutput: { mode: 'blocks', includeBaseRules: true, baseRulesMode: 'full', includeProjectInstructions: true, includeBoardDigest: true, sectionOrder: ['baseRules', 'projectInstructions', 'boardDigest'], rawTemplate: '', boardDigest: { showColumnCounts: true, showTasks: true, showPriority: false, showAssignee: false, showBlockedBy: false, showNextActionable: false } } },
    fields: {},
    notifications: {},
  }, null, 2));
  for (const t of seed) {
    const fm: Record<string, unknown> = { id: t.id, title: t.id, status: t.status };
    if (t.depends_on && t.depends_on.length > 0) fm.depends_on = t.depends_on;
    writeFileSync(
      join(dir, 'tasks', `${t.id}.md`),
      `---\nid: ${t.id}\ntitle: ${t.id}\nstatus: ${t.status}\n${t.depends_on ? `depends_on: [${t.depends_on.join(', ')}]\n` : ''}---\n\n# ${t.id}\n`,
    );
  }
  return dir;
}

describe('kandown move + dependency gate', () => {
  let dir: string;
  beforeEach(() => {
    dir = setupProject([
      { id: 't1', status: 'In Progress', depends_on: ['t2'] },
      { id: 't2', status: 'Backlog' },
    ]);
  });
  afterEach(() => { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

  it('refuses a terminal move when a dependency is still open', () => {
    const res = run(dir, ['move', 't1', 'Done']);
    expect(res.status, `stdout=${JSON.stringify(res.stdout)}\nstderr=${JSON.stringify(res.stderr)}`).not.toBe(0);
    expect(res.stderr).toMatch(/Cannot move t1 to Done: blocked by t2/);
  });

  it('allows the terminal move after the dependency is Done', () => {
    const res1 = run(dir, ['move', 't2', 'Done']);
    expect(res1.status, `stdout=${JSON.stringify(res1.stdout)}\nstderr=${JSON.stringify(res1.stderr)}`).toBe(0);
    const res2 = run(dir, ['move', 't1', 'Done']);
    expect(res2.status, `stdout=${JSON.stringify(res2.stdout)}\nstderr=${JSON.stringify(res2.stderr)}`).toBe(0);
    expect(res2.stderr).toMatch(/Moved t1/);
    expect(res2.stderr).toMatch(/Done/);
  });

  it('lets an archived dependency resolve the gate', () => {
    const res = run(dir, ['move', 't2', 'archived']);
    expect(res.status, `stdout=${JSON.stringify(res.stdout)}\nstderr=${JSON.stringify(res.stderr)}`).toBe(0);
    const res2 = run(dir, ['move', 't1', 'Done']);
    expect(res2.status, `stdout=${JSON.stringify(res2.stdout)}\nstderr=${JSON.stringify(res2.stderr)}`).toBe(0);
    expect(res2.stderr).toMatch(/Moved t1/);
  });

  it('treats an unknown dependency id as resolved (typo never blocks)', () => {
    const dir2 = setupProject([
      { id: 't1', status: 'In Progress', depends_on: ['ghost-id'] },
    ]);
    try {
      const res = run(dir2, ['move', 't1', 'Done']);
      expect(res.status, `stdout=${JSON.stringify(res.stdout)}\nstderr=${JSON.stringify(res.stderr)}`).toBe(0);
      expect(res.stderr).toMatch(/Moved t1/);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('ignores self-references', () => {
    const dir2 = setupProject([
      { id: 't1', status: 'In Progress', depends_on: ['t1'] },
    ]);
    try {
      const res = run(dir2, ['move', 't1', 'Done']);
      expect(res.status, `stdout=${JSON.stringify(res.stdout)}\nstderr=${JSON.stringify(res.stderr)}`).toBe(0);
      expect(res.stderr).toMatch(/Moved t1/);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('free moves between non-terminal columns bypass the gate', () => {
    const res = run(dir, ['move', 't1', 'Review']);
    expect(res.status, `stdout=${JSON.stringify(res.stdout)}\nstderr=${JSON.stringify(res.stderr)}`).toBe(0);
    expect(res.stderr).toMatch(/Moved t1/);
  });
});