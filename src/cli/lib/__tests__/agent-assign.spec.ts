/**
 * @file Assign-and-launch unit tests
 * @description Covers the three pieces the TUI's `a` key now leans on:
 *
 *  - `assignTaskToAgent` writes the canonical agent id into `assignee:`,
 *    preserves the rest of the frontmatter and the body, is idempotent, and
 *    fails soft on an unknown task.
 *  - `resolveAgentEntry` reads back what the assignment wrote, which is what
 *    lets a second `a` press relaunch without reopening the picker. The
 *    round-trip is the actual contract: writing an alias instead of the id
 *    would silently break it.
 *  - `resolveBinPath` / `detectInstalledAgents` expose the absolute binary
 *    path the picker prints, and never offer an agent that is not on PATH.
 *
 * @see src/cli/lib/board-reader.ts — assignTaskToAgent
 * @see src/cli/lib/agents.ts — detection + alias resolution
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assignTaskToAgent, readTask } from '../board-reader';
import { detectInstalledAgents, resolveAgentEntry, resolveBinPath, isAgentInstalled, AGENTS } from '../agents';
import { shortenPath } from '../../screens/agent-picker';

let projectDir: string;
let kandownDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'kandown-assign-'));
  kandownDir = join(projectDir, '.kandown');
  mkdirSync(kandownDir, { recursive: true });
  mkdirSync(join(projectDir, 'tasks'), { recursive: true });
  writeFileSync(join(kandownDir, 'kandown.json'), JSON.stringify({
    board: { columns: ['Backlog', 'In Progress', 'Done'] },
  }));
  writeFileSync(
    join(projectDir, 'tasks', 't1.md'),
    '---\nid: t1\ntitle: Do the thing\nstatus: Backlog\npriority: P1\n---\n\n# Do the thing\n\nBody stays put.\n',
  );
});

afterEach(() => {
  if (existsSync(projectDir)) rmSync(projectDir, { recursive: true, force: true });
});

describe('assignTaskToAgent', () => {
  it('writes the agent id into assignee without disturbing the rest of the file', () => {
    expect(assignTaskToAgent(kandownDir, 't1', 'codex')).toBe(true);
    const task = readTask(kandownDir, 't1');
    expect(task.frontmatter.assignee).toBe('codex');
    expect(task.frontmatter.status).toBe('Backlog');
    expect(task.frontmatter.priority).toBe('P1');
    expect(task.body).toContain('Body stays put.');
  });

  it('reassigns an already-assigned task', () => {
    assignTaskToAgent(kandownDir, 't1', 'codex');
    assignTaskToAgent(kandownDir, 't1', 'claude');
    expect(readTask(kandownDir, 't1').frontmatter.assignee).toBe('claude');
  });

  it('is a no-op when the agent is already the assignee', () => {
    assignTaskToAgent(kandownDir, 't1', 'claude');
    const before = readFileSync(join(projectDir, 'tasks', 't1.md'), 'utf8');
    expect(assignTaskToAgent(kandownDir, 't1', 'claude')).toBe(true);
    expect(readFileSync(join(projectDir, 'tasks', 't1.md'), 'utf8')).toBe(before);
  });

  it('returns false for an unknown task instead of throwing', () => {
    expect(assignTaskToAgent(kandownDir, 'nope', 'claude')).toBe(false);
  });

  it('writes a value resolveAgentEntry can read back (relaunch round-trip)', () => {
    assignTaskToAgent(kandownDir, 't1', 'opencode');
    const assignee = readTask(kandownDir, 't1').frontmatter.assignee as string;
    expect(resolveAgentEntry(assignee, kandownDir)?.id).toBe('opencode');
  });
});

describe('binary detection', () => {
  it('resolves an absolute path for a binary that exists', () => {
    const path = resolveBinPath('node');
    expect(path).toMatch(/^\//);
    expect(path).toContain('node');
  });

  it('returns null for a binary that does not exist', () => {
    expect(resolveBinPath('kandown-definitely-not-a-real-binary')).toBeNull();
    expect(isAgentInstalled('kandown-definitely-not-a-real-binary')).toBe(false);
  });

  it('only returns installed agents, each carrying its binPath', () => {
    for (const agent of detectInstalledAgents(kandownDir)) {
      expect(agent.binPath).toBeTruthy();
      expect(agent.binPath!.startsWith('/')).toBe(true);
      expect(isAgentInstalled(agent.bin)).toBe(true);
    }
  });
});

describe('built-in catalog integrity', () => {
  it('has unique ids and binaries declared for every entry', () => {
    const ids = AGENTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const agent of AGENTS) {
      expect(agent.bin).toBeTruthy();
      expect(agent.buildCommand).toBeTypeOf('function');
    }
  });

  it('builds a command whose first element is the agent binary', () => {
    for (const agent of AGENTS) {
      const cmd = agent.buildCommand!({
        systemPrompt: 'rules',
        taskPrompt: 'task',
        kandownDir,
        taskId: 't1',
      });
      expect(cmd[0]).toBe(agent.bin);
      expect(cmd.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('shortenPath', () => {
  it('leaves a short path untouched', () => {
    expect(shortenPath('/usr/local/bin/claude', 40)).toBe('/usr/local/bin/claude');
  });

  it('elides the middle but keeps the binary name visible', () => {
    const long = '/Users/someone/.nvm/versions/node/v25.2.1/bin/opencode';
    const out = shortenPath(long, 24);
    expect(out.length).toBeLessThanOrEqual(24);
    expect(out).toContain('…');
    expect(out.endsWith('code')).toBe(true);
  });
});
