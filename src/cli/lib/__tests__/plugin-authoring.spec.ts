/**
 * @file Plugin authoring loop
 * @description Vitest suite over the `kandown plugin` pipeline: every scaffold
 * kind must bundle and validate clean out of the box, and the validator must
 * catch the failures an author (human or agent) actually produces. The second
 * half matters most: a checker that only ever says "pass" teaches an agent to
 * ignore it, so each negative case asserts both the failing check id and that a
 * `fix` sentence came back with it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPlugin } from '../plugin-build';
import { checkPlugin } from '../plugin-check';
import { PLUGIN_KINDS, isValidPluginId, scaffoldPlugin } from '../plugin-scaffold';
import { extensionStateDir } from '../../../lib/extensions/state';

let projectDir: string;
let kandownDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'kd-plugin-'));
  kandownDir = join(projectDir, '.kandown');
  mkdirSync(kandownDir, { recursive: true });
  writeFileSync(join(kandownDir, 'kandown.json'), JSON.stringify({ columns: ['Backlog', 'Todo', 'In Progress', 'Done'] }), 'utf8');
});

afterEach(() => {
  try {
    rmSync(extensionStateDir(projectDir), { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function pluginDir(id: string): string {
  return join(projectDir, '.kandown', 'extensions', id);
}

/** Scaffold, bundle and validate in one call, the way the CLI does. */
async function scaffoldAndCheck(id: string, kind: (typeof PLUGIN_KINDS)[number]) {
  scaffoldPlugin(projectDir, id, kind);
  const build = await buildPlugin(pluginDir(id));
  const report = await checkPlugin(kandownDir, projectDir, id);
  return { build, report };
}

describe('plugin id validation', () => {
  it('accepts kebab-case and rejects everything else', () => {
    expect(isValidPluginId('sprint-velocity')).toBe(true);
    expect(isValidPluginId('a')).toBe(true);
    expect(isValidPluginId('Sprint')).toBe(false);
    expect(isValidPluginId('1st')).toBe(false);
    expect(isValidPluginId('has_underscore')).toBe(false);
  });

  it('refuses to overwrite an existing plugin directory', () => {
    scaffoldPlugin(projectDir, 'twice', 'command');
    expect(() => scaffoldPlugin(projectDir, 'twice', 'command')).toThrow(/already exists/);
  });
});

describe.each(PLUGIN_KINDS)('the %s scaffold', (kind) => {
  it('builds and passes every check with no failures', async () => {
    const { build, report } = await scaffoldAndCheck(`kd-${kind}`, kind);
    expect(build.errors).toEqual([]);
    expect(build.ok).toBe(true);

    const failed = report.checks.filter((entry) => entry.status === 'fail');
    const warned = report.checks.filter((entry) => entry.status === 'warn');
    expect(failed).toEqual([]);
    // 📖 Warnings are held to the same bar as failures here: a scaffold that
    // ships a warning trains every author who copies it to ignore warnings.
    expect(warned).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('declares only permissions its own code needs', async () => {
    const { report } = await scaffoldAndCheck(`kd-${kind}`, kind);
    const permissions = report.checks.find((entry) => entry.id === 'permissions');
    expect(permissions?.status).toBe('pass');
  });
});

describe('the validator', () => {
  it('reports a missing plugin instead of throwing', async () => {
    const report = await checkPlugin(kandownDir, projectDir, 'never-created');
    expect(report.ok).toBe(false);
    expect(report.checks[0]?.id).toBe('discovery');
    expect(report.checks[0]?.fix).toContain('kandown plugin create');
  });

  it('fails when the code calls a capability the manifest does not declare', async () => {
    const id = 'kd-greedy';
    scaffoldPlugin(projectDir, id, 'command');
    const manifestPath = join(pluginDir(id), 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.permissions = [];
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    await buildPlugin(pluginDir(id));
    const report = await checkPlugin(kandownDir, projectDir, id);
    const permissions = report.checks.find((entry) => entry.id === 'permissions');
    expect(permissions?.status).toBe('fail');
    expect(permissions?.message).toContain('read:tasks');
    expect(permissions?.fix).toContain('read:tasks');
    expect(report.ok).toBe(false);
  });

  it('warns about a permission that is declared but never used', async () => {
    const id = 'kd-overbroad';
    scaffoldPlugin(projectDir, id, 'gate');
    const manifestPath = join(pluginDir(id), 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.permissions = ['net:*'];
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    await buildPlugin(pluginDir(id));
    const report = await checkPlugin(kandownDir, projectDir, id);
    const permissions = report.checks.find((entry) => entry.id === 'permissions');
    expect(permissions?.status).toBe('warn');
    expect(permissions?.fix).toContain('net:*');
    // A warning must never fail the run: only `fail` blocks.
    expect(report.ok).toBe(true);
  });

  it('fails when the browser bundle is missing', async () => {
    const id = 'kd-unbuilt';
    scaffoldPlugin(projectDir, id, 'panel');
    const report = await checkPlugin(kandownDir, projectDir, id);
    const bundle = report.checks.find((entry) => entry.id === 'bundle');
    expect(bundle?.status).toBe('fail');
    expect(bundle?.fix).toContain('kandown plugin build');
    expect(report.ok).toBe(false);
  });

  it('warns when a bundle is older than its source', async () => {
    const id = 'kd-stale';
    scaffoldPlugin(projectDir, id, 'field');
    await buildPlugin(pluginDir(id));
    // Age the bundle by a minute rather than sleeping through a real one.
    const past = new Date(Date.now() - 60_000);
    utimesSync(join(pluginDir(id), 'index.js'), past, past);

    const report = await checkPlugin(kandownDir, projectDir, id);
    const bundle = report.checks.find((entry) => entry.id === 'bundle');
    expect(bundle?.status).toBe('warn');
    expect(bundle?.fix).toContain('kandown plugin build');
  });

  it('fails when the factory registers nothing', async () => {
    const id = 'kd-empty';
    scaffoldPlugin(projectDir, id, 'command');
    writeFileSync(join(pluginDir(id), 'index.ts'), 'export default function () {}\n', 'utf8');
    await buildPlugin(pluginDir(id));

    const report = await checkPlugin(kandownDir, projectDir, id);
    const contributions = report.checks.find((entry) => entry.id === 'contributions');
    expect(contributions?.status).toBe('fail');
    expect(report.ok).toBe(false);
  });

  it('fails when the entry throws while registering', async () => {
    const id = 'kd-throws';
    scaffoldPlugin(projectDir, id, 'command');
    writeFileSync(
      join(pluginDir(id), 'index.ts'),
      'export default function () { throw new Error("boom"); }\n',
      'utf8',
    );
    const report = await checkPlugin(kandownDir, projectDir, id);
    const entry = report.checks.find((check) => check.id === 'entry');
    expect(entry?.status).toBe('fail');
    expect(entry?.message).toContain('boom');
    expect(report.ok).toBe(false);
  });

  it('fails when a panel module exports no component', async () => {
    const id = 'kd-nopanel';
    scaffoldPlugin(projectDir, id, 'panel');
    writeFileSync(join(pluginDir(id), 'web.tsx'), 'export const nothing = 1;\n', 'utf8');
    await buildPlugin(pluginDir(id));

    const report = await checkPlugin(kandownDir, projectDir, id);
    const panel = report.checks.find((entry) => entry.id === 'panel:overview');
    expect(panel?.status).toBe('fail');
    expect(panel?.fix).toContain('export const panels');
  });

  it('fails when a panel throws on its first render', async () => {
    const id = 'kd-panelthrows';
    scaffoldPlugin(projectDir, id, 'panel');
    writeFileSync(
      join(pluginDir(id), 'web.tsx'),
      'function Overview() { throw new Error("render exploded"); }\nexport const panels = { overview: Overview };\n',
      'utf8',
    );
    await buildPlugin(pluginDir(id));

    const report = await checkPlugin(kandownDir, projectDir, id);
    const panel = report.checks.find((entry) => entry.id === 'panel:overview');
    expect(panel?.status).toBe('fail');
    expect(panel?.message).toContain('render exploded');
  });

  it('never writes to the real board while checking', async () => {
    const id = 'kd-writer';
    scaffoldPlugin(projectDir, id, 'command');
    writeFileSync(
      join(pluginDir(id), 'index.ts'),
      `import type { KandownExtensionAPI } from 'kandown';

export default function (kd: KandownExtensionAPI) {
  kd.contributeCommand('${id}', {
    handler: async (_args, ctx) => {
      const tasks = await ctx.board.readAll();
      for (const task of tasks) await ctx.setField(task.id, 'touched', true);
    },
  });
}
`,
      'utf8',
    );
    const manifestPath = join(pluginDir(id), 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.permissions = ['read:tasks', `write:field:plugins.${id}.*`];
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    await buildPlugin(pluginDir(id));

    const report = await checkPlugin(kandownDir, projectDir, id);
    expect(report.ok).toBe(true);
    const runtime = report.checks.find((entry) => entry.id === 'runtime');
    expect(runtime?.message).toContain('3 field write(s)');
    const roundtrip = report.checks.find((entry) => entry.id === 'roundtrip');
    expect(roundtrip?.status).toBe('pass');
    // The synthetic board lives in memory: no task file may appear on disk.
    expect(existsSync(join(projectDir, 'tasks'))).toBe(false);
  });
});

describe('the bundler', () => {
  it('rejects a panel bundle that imports react', async () => {
    const id = 'kd-react';
    scaffoldPlugin(projectDir, id, 'panel');
    writeFileSync(
      join(pluginDir(id), 'web.tsx'),
      'import { useState } from "react";\nfunction Overview() { useState(0); return null; }\nexport const panels = { overview: Overview };\n',
      'utf8',
    );
    const build = await buildPlugin(pluginDir(id));
    expect(build.ok).toBe(false);
    expect(build.errors.join(' ')).toContain('imports react');
  });

  it('reports a syntax error instead of throwing', async () => {
    const id = 'kd-syntax';
    scaffoldPlugin(projectDir, id, 'command');
    writeFileSync(join(pluginDir(id), 'index.ts'), 'export default function ( {\n', 'utf8');
    const build = await buildPlugin(pluginDir(id));
    expect(build.ok).toBe(false);
    expect(build.errors.length).toBeGreaterThan(0);
  });

  it('emits a bundle for each entry it finds', async () => {
    const id = 'kd-outputs';
    scaffoldPlugin(projectDir, id, 'full');
    const build = await buildPlugin(pluginDir(id));
    expect(build.ok).toBe(true);
    expect(build.outputs.map((output) => output.out.split('/').pop()).sort()).toEqual(['index.js', 'web.js']);
    expect(existsSync(join(pluginDir(id), 'index.js'))).toBe(true);
    expect(existsSync(join(pluginDir(id), 'web.js'))).toBe(true);
  });
});
