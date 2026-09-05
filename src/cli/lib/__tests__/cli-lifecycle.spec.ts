/**
 * @file End-to-end tests for the `kandown` command surface
 * @description Spawns the published bundle (`bin/kandown.js`) in a throwaway
 * tmpdir and drives one full task lifecycle the way a user or an agent would:
 * `init` → `create` → `list --json` → `show` → `assign` → `move` → archive.
 * Nothing is mocked and nothing is imported: if the bundle is broken, argument
 * parsing regresses or a write lands in the wrong directory, these fail.
 *
 * 📖 Run `pnpm build:cli` before this suite — it asserts on `bin/kandown.js`,
 * the build artifact, not on `src/`. `pnpm verify` already orders it that way.
 *
 * Two guarantees here are load-bearing for agents and shell scripts:
 *  - `kandown create` prints *exactly* the new id on stdout and every human
 *    decoration on stderr, so `id=$(kandown create "…")` captures one id.
 *  - `-p` means `--priority`, not `--path`. That collision once silently wrote
 *    tasks into a directory named `P1`; the guard below is why it cannot
 *    return unnoticed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI = join(process.cwd(), 'bin', 'kandown.js');

interface Row {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  tags: string[];
  archived: boolean;
}

let dir: string;

/** 📖 One spawn of the real CLI. `KANDOWN_NO_UPDATE` keeps the registry check
 *  (and its network call) out of the test run. */
function run(args: string[], cwd = dir) {
  return spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KANDOWN_NO_UPDATE: '1', KANDOWN_NO_GRAPHIFY: '1' },
  });
}

/** 📖 Fails with the full stdout/stderr attached, so a red run is diagnosable
 *  without re-running it by hand. */
function runOk(args: string[], cwd = dir) {
  const res = run(args, cwd);
  expect(res.status, `kandown ${args.join(' ')}\nstdout=${res.stdout}\nstderr=${res.stderr}`).toBe(0);
  return res;
}

function listJson(extra: string[] = []): Row[] {
  return JSON.parse(runOk(['list', '--json', ...extra]).stdout) as Row[];
}

const taskFiles = () => readdirSync(join(dir, 'tasks')).filter(f => f.endsWith('.md'));

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'kandown-cli-'));
  runOk(['init']);
});

afterAll(() => {
  if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

describe('kandown init', () => {
  it('creates .kandown/ and tasks/ at the project root, not nested', () => {
    expect(existsSync(join(dir, '.kandown', 'kandown.json'))).toBe(true);
    expect(existsSync(join(dir, '.kandown', 'kandown.html'))).toBe(true);
    expect(existsSync(join(dir, 'tasks'))).toBe(true);
    expect(existsSync(join(dir, '.kandown', 'tasks'))).toBe(false);
  });

  it('seeds a readable board with example tasks', () => {
    const rows = listJson();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => typeof r.id === 'string' && r.id.length > 0)).toBe(true);
  });

  it('is idempotent — a second init does not fail or wipe the tasks', () => {
    const before = taskFiles().length;
    runOk(['init']);
    expect(taskFiles().length).toBe(before);
  });
});

describe('kandown create', () => {
  it('prints exactly the new id on stdout, decorations on stderr', () => {
    const res = runOk(['create', 'Capture me from a shell']);
    expect(res.stdout.trim().split('\n')).toHaveLength(1);
    expect(res.stdout.trim()).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(res.stderr).toMatch(/Created/);
  });

  it('treats -p as --priority and still writes into tasks/ (the -p/--path collision)', () => {
    const id = runOk(['create', 'Fix the login button', '-p', 'P1', '-t', 'auth']).stdout.trim();
    expect(existsSync(join(dir, 'P1'))).toBe(false);
    const row = listJson().find(r => r.id === id);
    expect(row).toMatchObject({ priority: 'P1', tags: ['auth'] });
  });

  it('names the file after the task and lifts a [BRACKET] into category', () => {
    const id = runOk(['create', '[UI] Polish the drawer']).stdout.trim();
    const file = taskFiles().find(f => f.startsWith(`${id}_`) || f === `${id}.md`);
    expect(file).toBe(`${id}_UI_polish_drawer.md`);
    const content = readFileSync(join(dir, 'tasks', file!), 'utf8');
    expect(content).toMatch(/^category: UI$/m);
    expect(content).toMatch(/^title: Polish the drawer$/m);
  });

  it('honours --to and --id', () => {
    runOk(['create', 'Explicitly placed', '--id', 'custom-1', '--to', 'Done']);
    expect(listJson().find(r => r.id === 'custom-1')?.status).toBe('Done');
  });

  it('refuses a duplicate id instead of overwriting the existing file', () => {
    const res = run(['create', 'Clash', '--id', 'custom-1']);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/already exists/i);
    expect(listJson().find(r => r.id === 'custom-1')?.title).toBe('Explicitly placed');
  });

  it('exits non-zero with a usage line when the title is missing', () => {
    const res = run(['create']);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/Usage: kandown create/);
  });
});

describe('kandown list', () => {
  it('emits parseable JSON with the documented row shape', () => {
    const rows = listJson();
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        ['archived', 'assignee', 'id', 'priority', 'status', 'tags', 'title'],
      );
      expect(Array.isArray(row.tags)).toBe(true);
    }
  });

  it('hides archived tasks by default and shows them under --archived', () => {
    const id = runOk(['create', 'Soon archived']).stdout.trim();
    runOk(['move', id, 'archived']);
    expect(listJson().some(r => r.id === id)).toBe(false);
    const archived = listJson(['--archived']).find(r => r.id === id);
    expect(archived).toBeDefined();
    expect(archived!.archived).toBe(true);
    expect(archived!.status).toMatch(/\(archived\)$/);
  });
});

describe('kandown show', () => {
  it('writes the raw task Markdown to stdout', () => {
    const out = runOk(['show', 'custom-1']).stdout;
    expect(out).toMatch(/^---\n/);
    expect(out).toMatch(/^id: custom-1$/m);
  });

  it('exits non-zero on an unknown id', () => {
    const res = run(['show', 'nope-404']);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/not found/i);
  });
});

describe('kandown assign', () => {
  it('writes the agent into assignee: and reflects it in list --json', () => {
    runOk(['create', 'Assign me', '--id', 'assignable']);
    runOk(['assign', 'assignable', 'claude']);
    expect(listJson().find(r => r.id === 'assignable')?.assignee).toBe('claude');
    expect(readFileSync(join(dir, 'tasks', taskFiles().find(f => f.startsWith('assignable'))!), 'utf8'))
      .toMatch(/^assignee: claude$/m);
  });
});

describe('kandown move', () => {
  it('moves a task between columns and persists the new status', () => {
    runOk(['create', 'Walk the board', '--id', 'walker']);
    runOk(['move', 'walker', 'In Progress']);
    expect(listJson().find(r => r.id === 'walker')?.status).toBe('In Progress');
  });

  it('archives through `move <id> archived`, relocating the file into tasks/archive/', () => {
    runOk(['create', 'Archive me', '--id', 'archivable']);
    runOk(['move', 'archivable', 'archived']);
    expect(taskFiles().some(f => f.startsWith('archivable'))).toBe(false);
    expect(readdirSync(join(dir, 'tasks', 'archive')).some(f => f.startsWith('archivable'))).toBe(true);
  });

  it('rejects an unknown column instead of inventing one', () => {
    const res = run(['move', 'walker', 'Nowhere']);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/Unknown status/i);
    expect(listJson().find(r => r.id === 'walker')?.status).toBe('In Progress');
  });

  it('reports an unknown task id rather than failing silently', () => {
    const res = run(['move', 'nope-404', 'Done']);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/nope-404/);
  });
});

describe('running outside a project', () => {
  it('auto-initializes a board and says so, rather than erroring out', () => {
    // 📖 Deliberate: `kandown <anything>` in a fresh directory bootstraps the
    // project instead of asking the user to run `init` first. It is announced
    // on stderr so the creation is never silent.
    const empty = mkdtempSync(join(tmpdir(), 'kandown-empty-'));
    try {
      const res = run(['list', '--json'], empty);
      expect(res.status).toBe(0);
      expect(res.stderr).toMatch(/auto-initializing/i);
      expect(existsSync(join(empty, '.kandown', 'kandown.json'))).toBe(true);
      expect(existsSync(join(empty, 'tasks'))).toBe(true);
      expect(() => JSON.parse(res.stdout)).not.toThrow();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
