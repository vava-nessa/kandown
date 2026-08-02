/**
 * @file Safe agent instruction migration tests
 * @description Exercises the filesystem migration against disposable project
 * and home directories. The suite proves user-authored text is renamed or
 * backed up instead of discarded, generated files require a known hash before
 * removal, backup collisions are safe, and the AGENTS.md bootstrap owns only
 * its marked line.
 *
 * @see src/cli/lib/agent-migration.ts
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_BOOTSTRAP_LINE,
  ensureAgentBootstrap,
  migrateAgentInstructions,
} from '../agent-migration.js';
import { doInit } from '../init.js';

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

describe('migrateAgentInstructions', () => {
  let root: string;
  let kandownDir: string;
  let homeDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kandown-agent-migration-'));
    kandownDir = join(root, 'project', '.kandown');
    homeDir = join(root, 'home');
    mkdirSync(kandownDir, { recursive: true });
    mkdirSync(join(homeDir, '.kandown'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renames project and injected-home instructions without changing content', () => {
    const projectText = 'project rules\n';
    const globalText = 'global rules\n';
    writeFileSync(join(kandownDir, 'instructions.md'), projectText);
    writeFileSync(join(homeDir, '.kandown', 'instructions.md'), globalText);

    const events = migrateAgentInstructions(kandownDir, { homeDir });

    expect(readFileSync(join(kandownDir, 'kandown_work.md'), 'utf8')).toBe(projectText);
    expect(readFileSync(join(homeDir, '.kandown', 'kandown_work.md'), 'utf8')).toBe(globalText);
    expect(existsSync(join(kandownDir, 'instructions.md'))).toBe(false);
    expect(existsSync(join(homeDir, '.kandown', 'instructions.md'))).toBe(false);
    expect(events.filter((event) => event.code === 'instruction-renamed'))
      .toHaveLength(2);
  });

  it('preserves both instruction files and warns when the destination exists', () => {
    writeFileSync(join(kandownDir, 'instructions.md'), 'old user text');
    writeFileSync(join(kandownDir, 'kandown_work.md'), 'new user text');

    const events = migrateAgentInstructions(kandownDir, { homeDir });

    expect(readFileSync(join(kandownDir, 'instructions.md'), 'utf8')).toBe('old user text');
    expect(readFileSync(join(kandownDir, 'kandown_work.md'), 'utf8')).toBe('new user text');
    expect(events).toContainEqual(expect.objectContaining({
      code: 'instruction-conflict',
      severity: 'warning',
      scope: 'project',
    }));
  });

  it('removes legacy documents only when their hashes are known', () => {
    const shortDoc = 'generated short reference\n';
    const fullDoc = 'generated full reference\n';
    writeFileSync(join(kandownDir, 'AGENT.md'), shortDoc);
    writeFileSync(join(kandownDir, 'AGENT_KANDOWN.md'), fullDoc);

    const events = migrateAgentInstructions(kandownDir, {
      homeDir,
      knownHashes: new Set([hash(shortDoc), hash(fullDoc)]),
    });

    expect(existsSync(join(kandownDir, 'AGENT.md'))).toBe(false);
    expect(existsSync(join(kandownDir, 'AGENT_KANDOWN.md'))).toBe(false);
    expect(events.filter((event) => event.code === 'generated-doc-removed'))
      .toHaveLength(2);
  });

  it('moves hand-edited legacy documents into the backup directory', () => {
    const edited = '# My irreplaceable instructions\n';
    writeFileSync(join(kandownDir, 'AGENT_KANDOWN.md'), edited);

    const events = migrateAgentInstructions(kandownDir, {
      homeDir,
      knownHashes: new Set(),
    });
    const backupPath = join(kandownDir, 'legacy-agent-docs', 'AGENT_KANDOWN.md');

    expect(existsSync(join(kandownDir, 'AGENT_KANDOWN.md'))).toBe(false);
    expect(readFileSync(backupPath, 'utf8')).toBe(edited);
    expect(events).toContainEqual(expect.objectContaining({
      code: 'legacy-doc-backed-up',
      severity: 'warning',
      destination: backupPath,
    }));
  });

  it('uses a collision-safe name when a legacy backup already exists', () => {
    const backupDir = join(kandownDir, 'legacy-agent-docs');
    mkdirSync(backupDir);
    writeFileSync(join(backupDir, 'AGENT.md'), 'earlier backup');
    writeFileSync(join(kandownDir, 'AGENT.md'), 'latest edited copy');

    const events = migrateAgentInstructions(kandownDir, {
      homeDir,
      knownHashes: new Set(),
    });
    const collisionPath = join(backupDir, 'AGENT.1.md');

    expect(readFileSync(join(backupDir, 'AGENT.md'), 'utf8')).toBe('earlier backup');
    expect(readFileSync(collisionPath, 'utf8')).toBe('latest edited copy');
    expect(events).toContainEqual(expect.objectContaining({ destination: collisionPath }));
  });

  it('is idempotent after a successful migration', () => {
    writeFileSync(join(kandownDir, 'instructions.md'), 'rules');
    writeFileSync(join(kandownDir, 'AGENT.md'), 'edited');

    migrateAgentInstructions(kandownDir, { homeDir, knownHashes: new Set() });
    const secondEvents = migrateAgentInstructions(kandownDir, {
      homeDir,
      knownHashes: new Set(),
    });

    expect(secondEvents).toEqual([]);
  });
});

describe('ensureAgentBootstrap', () => {
  let projectRoot: string;
  let agentsPath: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'kandown-agent-bootstrap-'));
    agentsPath = join(projectRoot, 'AGENTS.md');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('creates AGENTS.md when absent', () => {
    const events = ensureAgentBootstrap(projectRoot);

    expect(readFileSync(agentsPath, 'utf8')).toBe(`${AGENT_BOOTSTRAP_LINE}\n`);
    expect(events).toContainEqual(expect.objectContaining({ code: 'bootstrap-created' }));
  });

  it('appends the managed line without rewriting existing prose', () => {
    writeFileSync(agentsPath, '# My rules\nKeep this exact text.');

    const events = ensureAgentBootstrap(projectRoot);

    expect(readFileSync(agentsPath, 'utf8')).toBe(
      `# My rules\nKeep this exact text.\n${AGENT_BOOTSTRAP_LINE}\n`,
    );
    expect(events).toContainEqual(expect.objectContaining({ code: 'bootstrap-appended' }));
  });

  it('repairs only a stale marked line and preserves CRLF bytes', () => {
    writeFileSync(
      agentsPath,
      '# User rules\r\nOld Kandown advice. <!-- kandown:agent-ref -->\r\nKeep me.\r\n',
    );

    const events = ensureAgentBootstrap(projectRoot);

    expect(readFileSync(agentsPath, 'utf8')).toBe(
      `# User rules\r\n${AGENT_BOOTSTRAP_LINE}\r\nKeep me.\r\n`,
    );
    expect(events).toContainEqual(expect.objectContaining({ code: 'bootstrap-repaired' }));
  });

  it('collapses duplicate marked lines while preserving unmarked prose', () => {
    writeFileSync(
      agentsPath,
      `${AGENT_BOOTSTRAP_LINE}\nUser prose\nstale <!-- kandown:agent-ref -->\n`,
    );

    ensureAgentBootstrap(projectRoot);
    const content = readFileSync(agentsPath, 'utf8');

    expect(content).toBe(`${AGENT_BOOTSTRAP_LINE}\nUser prose\n`);
    expect(content.match(/<!-- kandown:agent-ref -->/g)).toHaveLength(1);
  });

  it('is byte-idempotent once the managed line is current', () => {
    writeFileSync(agentsPath, `User prose\n${AGENT_BOOTSTRAP_LINE}\n`);
    const before = readFileSync(agentsPath);

    const events = ensureAgentBootstrap(projectRoot);

    expect(events).toEqual([]);
    expect(readFileSync(agentsPath)).toEqual(before);
  });
});

describe('fresh project initialization', () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('installs one managed runtime bootstrap and no generated agent documents', () => {
    root = mkdtempSync(join(tmpdir(), 'kandown-fresh-init-'));
    const kandownDir = join(root, '.kandown');

    expect(doInit(kandownDir)).toBe(true);
    expect(existsSync(join(kandownDir, 'AGENT.md'))).toBe(false);
    expect(existsSync(join(kandownDir, 'AGENT_KANDOWN.md'))).toBe(false);
    const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(agents).toBe(`${AGENT_BOOTSTRAP_LINE}\n`);
    expect(agents.match(/<!-- kandown:agent-ref -->/g)).toHaveLength(1);
  });
});
