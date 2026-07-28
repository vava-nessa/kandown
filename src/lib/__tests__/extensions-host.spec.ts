/**
 * @file Extension host integration
 * @description Vitest suite that loads real extensions from a temp project dir
 * via jiti and locks the host contract: discovery, restricted mode + project
 * trust, gate composition with block reasons, command dispatch, and the core
 * invariant that a broken extension is isolated (errored or quarantined) and
 * never stops a healthy one from working. See docs/EXTENSIONS.md § "Isolation".
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ExtensionHost, type HostEnvironment } from '../extensions/host';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kd-ext-'));
});
afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function makeEnv(overrides?: Partial<HostEnvironment>): HostEnvironment {
  return {
    projectDir: dir,
    kandownVersion: '0.43.0',
    config: { extensions: { restricted: false } },
    readAll: async () => [],
    read: async () => null,
    applyField: async () => {},
    log: { info() {}, warn() {}, error() {} },
    ...overrides,
  };
}

function writeExt(id: string, files: Record<string, string>): void {
  const extDir = join(dir, '.kandown', 'extensions', id);
  mkdirSync(extDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(extDir, name), content);
}

const burndownManifest = {
  id: 'burndown',
  name: 'Burndown',
  version: '1.0.0',
  apiVersion: 1,
  minKandownVersion: '0.43.0',
  permissions: ['read:tasks', 'write:field:plugins.burndown.*'],
};

const burndownIndex = `
export default function (kd) {
  kd.contributeField({ key: 'points', label: 'Points', type: 'number' });
  kd.contributeCommand('burndown', {
    description: 'print burndown',
    handler: async (_args, ctx) => { ctx.log.info('ran burndown'); },
  });
  kd.contributeGate({
    on: 'task:beforeMove',
    to: 'Done',
    handler: async (event) => {
      const pts = event.task.plugins?.burndown?.points;
      if (!pts) return { block: true, reason: 'needs points before Done' };
    },
  });
}
`;

describe('ExtensionHost — discovery, trust and restricted mode', () => {
  it('keeps a project extension disabled until enabled (trust + enabled set)', async () => {
    writeExt('burndown', { 'manifest.json': JSON.stringify(burndownManifest), 'index.ts': burndownIndex });
    const host = new ExtensionHost(makeEnv());
    await host.loadAll();
    expect(host.get('burndown')?.health).toBe('disabled');
    expect(host.get('burndown')?.error).toMatch(/not trusted/);

    const ok = await host.enable('burndown');
    expect(ok).toBe(true);
    expect(host.get('burndown')?.health).toBe('enabled');
  });

  it('respects restricted mode even after the first enable flow', async () => {
    writeExt('burndown', { 'manifest.json': JSON.stringify(burndownManifest), 'index.ts': burndownIndex });
    const host = new ExtensionHost(makeEnv({ config: { extensions: { restricted: true } } }));
    await host.loadAll();
    expect(host.get('burndown')?.health).toBe('disabled');
    expect(await host.enable('burndown')).toBe(true);
    expect(host.get('burndown')?.health).toBe('enabled');
  });

  it('reports a clean installed summary after load', async () => {
    writeExt('burndown', { 'manifest.json': JSON.stringify(burndownManifest), 'index.ts': burndownIndex });
    const host = new ExtensionHost(makeEnv());
    await host.enable('burndown');
    const summary = host.installedSummary().find((s) => s.id === 'burndown');
    expect(summary?.fields).toEqual(['points']);
    expect(summary?.commands).toEqual(['burndown']);
    expect(summary?.gates).toBe(1);
  });
});

describe('ExtensionHost — gates', () => {
  it('blocks a move to Done without points and allows it with points', async () => {
    writeExt('burndown', { 'manifest.json': JSON.stringify(burndownManifest), 'index.ts': burndownIndex });
    const host = new ExtensionHost(makeEnv());
    await host.enable('burndown');

    const blocked = await host.runGates({
      type: 'task:beforeMove',
      to: 'Done',
      task: { id: 't1', frontmatter: {}, plugins: {} },
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/points/);

    const allowed = await host.runGates({
      type: 'task:beforeMove',
      to: 'Done',
      task: { id: 't1', frontmatter: {}, plugins: { burndown: { points: 5 } } },
    });
    expect(allowed.allowed).toBe(true);
  });

  it('ignores the gate for other target columns', async () => {
    writeExt('burndown', { 'manifest.json': JSON.stringify(burndownManifest), 'index.ts': burndownIndex });
    const host = new ExtensionHost(makeEnv());
    await host.enable('burndown');
    const res = await host.runGates({
      type: 'task:beforeMove',
      to: 'Review',
      task: { id: 't1', frontmatter: {}, plugins: {} },
    });
    expect(res.allowed).toBe(true);
  });
});

describe('ExtensionHost — commands', () => {
  it('dispatches a contributed command', async () => {
    writeExt('burndown', { 'manifest.json': JSON.stringify(burndownManifest), 'index.ts': burndownIndex });
    const host = new ExtensionHost(makeEnv());
    await host.enable('burndown');
    expect(host.getCommand('burndown')).not.toBeNull();
    await expect(host.runCommand('burndown', '')).resolves.toBeUndefined();
    await expect(host.runCommand('nope', '')).rejects.toThrow(/Unknown/);
  });
});

describe('ExtensionHost — isolation (the core invariant)', () => {
  it('marks a throwing factory as errored without affecting a healthy extension', async () => {
    writeExt('burndown', { 'manifest.json': JSON.stringify(burndownManifest), 'index.ts': burndownIndex });
    writeExt('broken', {
      'manifest.json': JSON.stringify({ id: 'broken', name: 'Broken', version: '1.0.0', apiVersion: 1 }),
      'index.ts': 'export default function () { throw new Error("boom on load"); }',
    });
    const host = new ExtensionHost(makeEnv());
    await host.loadAll();
    await host.enable('burndown');
    await host.enable('broken');

    expect(host.get('broken')?.health).toBe('errored');
    expect(host.get('broken')?.error).toMatch(/boom on load/);
    // The healthy extension is untouched and its gate still fires.
    expect(host.get('burndown')?.health).toBe('enabled');
    const blocked = await host.runGates({
      type: 'task:beforeMove',
      to: 'Done',
      task: { id: 't1', frontmatter: {}, plugins: {} },
    });
    expect(blocked.allowed).toBe(false);
  });

  it('quarantines an extension whose handler keeps throwing', async () => {
    writeExt('flaky', {
      'manifest.json': JSON.stringify({ id: 'flaky', name: 'Flaky', version: '1.0.0', apiVersion: 1 }),
      'index.ts': `
        export default function (kd) {
          kd.contributeGate({ on: 'task:beforeMove', handler: async () => { throw new Error("always"); } });
        }
      `,
    });
    const host = new ExtensionHost(makeEnv());
    await host.enable('flaky');
    for (let i = 0; i < 3; i++) {
      await host.runGates({ type: 'task:beforeMove', task: { id: 't1', frontmatter: {} } });
    }
    expect(host.get('flaky')?.health).toBe('quarantined');
  });
});
