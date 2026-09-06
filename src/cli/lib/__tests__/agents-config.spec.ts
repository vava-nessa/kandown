/**
 * @file Tests for the versioned agent catalog `.kandown/agents.json`
 * @description Covers the committed team contract behind subtask 2 of t262:
 *
 *  1. `loadAgentsConfig` round-trips a saved file and survives a missing,
 *     corrupt, or wrongly-shaped one by falling back to the shipped defaults
 *     (the launcher must never crash on a hand-edited file).
 *  2. `loadCatalog` merges that file over the built-in registry: a matching id
 *     overrides scalars but keeps the built-in `buildCommand`, and a fully
 *     custom entry is appended and launched through the generic `launchMode`
 *     builder.
 *  3. `kandown init` seeds the file from the built-in registry, so a fresh
 *     project commits the *current* catalog instead of a stale template, and a
 *     re-init never clobbers a catalog the team already tuned.
 *
 * Every case runs against a disposable `.kandown/` under `os.tmpdir()`.
 *
 * `@see` src/cli/lib/agents-config.ts
 * `@see` src/cli/lib/agents.ts (loadCatalog, buildAgentCommand)
 * `@see` src/cli/lib/init.ts (doInit)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadAgentsConfig,
  saveAgentsConfig,
  defaultAgentsConfig,
  resolveCascade,
  AGENTS_CONFIG_VERSION,
  DEFAULT_CASCADE,
  type AgentsConfig,
} from '../agents-config.js';
import { loadCatalog, buildAgentCommand, resolveAgentEntry, getCascadeConfig, type LaunchOpts } from '../agents.js';
import { doInit } from '../init.js';

let dir: string;
let kandownDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kandown-agents-cfg-'));
  kandownDir = join(dir, '.kandown');
  mkdirSync(kandownDir, { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** 📖 Minimal launch options: the prompt text itself is irrelevant here, only
 *  the argv layout the catalog produces around it. */
function launchOpts(): LaunchOpts {
  return { systemPrompt: 'RULES', taskPrompt: 'TASK', kandownDir, taskId: 't001' };
}

/** 📖 Writes a raw (possibly invalid) agents.json, bypassing the serializer. */
function writeRaw(contents: string): void {
  writeFileSync(join(kandownDir, 'agents.json'), contents, 'utf8');
}

describe('agents.json persistence', () => {
  it('returns the shipped defaults when the file does not exist', () => {
    const cfg = loadAgentsConfig(kandownDir);
    expect(cfg.version).toBe(AGENTS_CONFIG_VERSION);
    expect(cfg.preferred).toBe('claude');
    expect(cfg.agents.length).toBe(defaultAgentsConfig().agents.length);
  });

  it('round-trips a saved config', () => {
    const cfg: AgentsConfig = {
      version: AGENTS_CONFIG_VERSION,
      preferred: 'codex',
      cascade: { unassignedBehavior: 'preferred', sameSessionChain: true },
      agents: [{ id: 'codex', name: 'OpenAI Codex', bin: 'codex', aliases: ['cx'], extraArgs: ['--yolo'] }],
    };
    saveAgentsConfig(kandownDir, cfg);

    const onDisk = readFileSync(join(kandownDir, 'agents.json'), 'utf8');
    expect(onDisk.endsWith('\n')).toBe(true);

    const back = loadAgentsConfig(kandownDir);
    expect(back.preferred).toBe('codex');
    expect(back.cascade).toEqual({ unassignedBehavior: 'preferred', sameSessionChain: true });
    expect(back.agents).toEqual([
      { id: 'codex', name: 'OpenAI Codex', bin: 'codex', aliases: ['cx'], extraArgs: ['--yolo'] },
    ]);
  });

  it('falls back to defaults on corrupt JSON without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeRaw('{ not json');
    const cfg = loadAgentsConfig(kandownDir);
    expect(cfg.agents.length).toBe(defaultAgentsConfig().agents.length);
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to defaults when the file is not a JSON object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeRaw('[]');
    expect(loadAgentsConfig(kandownDir).preferred).toBe('claude');
    expect(warn).toHaveBeenCalled();
  });

  it('drops malformed entries and keeps the valid ones', () => {
    writeRaw(JSON.stringify({
      version: 1,
      agents: [
        { id: 'claude', bin: 'claude' },
        { name: 'no id' },
        'nonsense',
        null,
        { id: 'ghost' },
      ],
    }));
    const cfg = loadAgentsConfig(kandownDir);
    expect(cfg.agents.map(a => a.id)).toEqual(['claude']);
    // 📖 A missing `name` defaults to the id so the picker never renders blank.
    expect(cfg.agents[0].name).toBe('claude');
  });

  it('fills cascade defaults for missing or invalid values', () => {
    expect(resolveCascade(undefined)).toEqual(DEFAULT_CASCADE);
    expect(resolveCascade('nope')).toEqual(DEFAULT_CASCADE);
    expect(resolveCascade({ unassignedBehavior: 'bogus', sameSessionChain: 'yes' })).toEqual(DEFAULT_CASCADE);
    expect(resolveCascade({ unassignedBehavior: 'preferred' })).toEqual({
      unassignedBehavior: 'preferred',
      sameSessionChain: false,
    });
  });

  it('exposes cascade prefs and the preferred agent to the orchestrator', () => {
    saveAgentsConfig(kandownDir, {
      version: AGENTS_CONFIG_VERSION,
      preferred: 'goose',
      cascade: { unassignedBehavior: 'preferred', sameSessionChain: true },
      agents: defaultAgentsConfig().agents,
    });
    expect(getCascadeConfig(kandownDir)).toEqual({
      unassignedBehavior: 'preferred',
      sameSessionChain: true,
      preferred: 'goose',
    });
  });
});

describe('catalog merge', () => {
  it('overrides a built-in scalar while keeping its buildCommand', () => {
    saveAgentsConfig(kandownDir, {
      version: AGENTS_CONFIG_VERSION,
      agents: [{ id: 'claude', name: 'Team Claude', bin: 'claude-wrapper', extraArgs: ['--allowedTools', 'Edit'] }],
    });

    const claude = loadCatalog(kandownDir).find(a => a.id === 'claude');
    expect(claude).toBeDefined();
    expect(claude!.name).toBe('Team Claude');
    expect(claude!.bin).toBe('claude-wrapper');
    expect(typeof claude!.buildCommand).toBe('function');

    const cmd = buildAgentCommand(claude!, launchOpts());
    expect(cmd[0]).toBe('claude-wrapper');
    expect(cmd.slice(-2)).toEqual(['--allowedTools', 'Edit']);
  });

  it('keeps every built-in even when the file lists only one agent', () => {
    saveAgentsConfig(kandownDir, {
      version: AGENTS_CONFIG_VERSION,
      agents: [{ id: 'claude', name: 'Claude Code', bin: 'claude' }],
    });
    const ids = loadCatalog(kandownDir).map(a => a.id);
    expect(ids).toEqual(loadCatalog().map(a => a.id));
  });

  it('appends a fully custom agent and launches it via its launchMode', () => {
    saveAgentsConfig(kandownDir, {
      version: AGENTS_CONFIG_VERSION,
      agents: [
        ...defaultAgentsConfig().agents,
        { id: 'housebot', name: 'House Bot', bin: 'housebot', aliases: ['house'], launchMode: 'prompt-flag', promptFlag: '-p' },
      ],
    });

    const catalog = loadCatalog(kandownDir);
    const custom = catalog[catalog.length - 1];
    expect(custom.id).toBe('housebot');
    expect(custom.buildCommand).toBeUndefined();
    expect(buildAgentCommand(custom, launchOpts())).toEqual(['housebot', '-p', 'RULES\n\n---\n\nTASK']);
  });

  it('resolves a team alias from the file to its catalog entry', () => {
    saveAgentsConfig(kandownDir, {
      version: AGENTS_CONFIG_VERSION,
      agents: [{ id: 'claude', name: 'Claude Code', bin: 'claude', aliases: ['house-agent'] }],
    });
    expect(resolveAgentEntry('House-Agent', kandownDir)?.id).toBe('claude');
    expect(resolveAgentEntry('vava', kandownDir)).toBeUndefined();
  });
});

describe('init seeds the catalog', () => {
  it('writes the full built-in catalog, not a stale template snapshot', () => {
    const fresh = join(dir, 'project', '.kandown');
    expect(doInit(fresh)).toBe(true);

    const written = JSON.parse(readFileSync(join(fresh, 'agents.json'), 'utf8'));
    expect(written.version).toBe(AGENTS_CONFIG_VERSION);
    expect(written.agents.map((a: { id: string }) => a.id)).toEqual(
      defaultAgentsConfig().agents.map(a => a.id),
    );
  });

  it('never clobbers a catalog the project already tuned', () => {
    const fresh = join(dir, 'project2', '.kandown');
    mkdirSync(fresh, { recursive: true });
    writeFileSync(join(fresh, 'agents.json'), JSON.stringify({ version: 1, preferred: 'goose', agents: [] }), 'utf8');

    expect(doInit(fresh)).toBe(true);
    expect(JSON.parse(readFileSync(join(fresh, 'agents.json'), 'utf8')).preferred).toBe('goose');
  });

  it('leaves the catalog out of the generated .kandown/.gitignore so it is committed', () => {
    const fresh = join(dir, 'project3', '.kandown');
    expect(doInit(fresh)).toBe(true);
    expect(existsSync(join(fresh, '.gitignore'))).toBe(true);
    expect(readFileSync(join(fresh, '.gitignore'), 'utf8')).not.toContain('agents.json');
  });
});
