/**
 * @file Standalone browser extension runtime integration tests
 * @description Uses a minimal in-memory File System Access implementation to
 * prove project-local discovery, bundled index.js activation, typed badge
 * rendering, web module loading, failure isolation and persistent quarantine.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  invalidateStandaloneExtensions,
  loadExtensionWebModule,
  loadStandaloneExtensionRuntime,
  reportStandalonePanelOutcome,
} from '../extensions/browser-runtime';

class MemoryFile {
  readonly kind = 'file' as const;
  constructor(readonly name: string, private content: string) {}

  async getFile(): Promise<File> {
    return { text: async () => this.content } as unknown as File;
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    const file = this;
    let next = '';
    return {
      async write(data: string | Blob) {
        next += typeof data === 'string' ? data : await data.text();
      },
      async close() { file.content = next; },
    } as FileSystemWritableFileStream;
  }

  text(): string { return this.content; }
}

class MemoryDirectory {
  readonly kind = 'directory' as const;
  private entries = new Map<string, MemoryFile | MemoryDirectory>();

  constructor(readonly name: string) {}

  directory(name: string): MemoryDirectory {
    const existing = this.entries.get(name);
    if (existing instanceof MemoryDirectory) return existing;
    const created = new MemoryDirectory(name);
    this.entries.set(name, created);
    return created;
  }

  file(name: string, content: string): MemoryFile {
    const created = new MemoryFile(name, content);
    this.entries.set(name, created);
    return created;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle> {
    const existing = this.entries.get(name);
    if (existing instanceof MemoryDirectory) return existing as unknown as FileSystemDirectoryHandle;
    if (options?.create) return this.directory(name) as unknown as FileSystemDirectoryHandle;
    throw new Error(`directory not found: ${name}`);
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    const existing = this.entries.get(name);
    if (existing instanceof MemoryFile) return existing as unknown as FileSystemFileHandle;
    if (options?.create) return this.file(name, '') as unknown as FileSystemFileHandle;
    throw new Error(`file not found: ${name}`);
  }

  async *values(): AsyncIterableIterator<FileSystemHandle> {
    for (const entry of this.entries.values()) yield entry as unknown as FileSystemHandle;
  }

  read(name: string): string | undefined {
    const entry = this.entries.get(name);
    return entry instanceof MemoryFile ? entry.text() : undefined;
  }
}

function extensionProject(): { kandown: MemoryDirectory; extensions: MemoryDirectory } {
  const kandown = new MemoryDirectory('.kandown');
  const extensions = kandown.directory('extensions');
  extensions.file('enabled.json', JSON.stringify(['burndown', 'broken']));
  extensions.file('trust.json', JSON.stringify(['burndown', 'broken']));
  extensions.file('health.json', JSON.stringify({ version: 1, extensions: {} }));

  const burndown = extensions.directory('burndown');
  burndown.file('manifest.json', JSON.stringify({ id: 'burndown', name: 'Burndown', version: '1.0.0', apiVersion: 1 }));
  burndown.file('index.js', `
    export default function (kd) {
      kd.contributeField({ key: 'points', label: 'Story points', type: 'number', badge: value => value ? 'P' + value : null });
      kd.contributeWebPanel({ id: 'chart', title: 'Burndown', entry: './web.js' });
      kd.contributeGate({ on: 'task:beforeMove', handler: () => ({ block: true }) });
    }
  `);
  burndown.file('web.js', `export const panels = { chart: function Chart() { return null; } };`);

  const broken = extensions.directory('broken');
  broken.file('manifest.json', JSON.stringify({ id: 'broken', name: 'Broken', version: '1.0.0', apiVersion: 1 }));
  broken.file('index.js', `export default function () { throw new Error('broken browser entry'); }`);

  return { kandown, extensions };
}

afterEach(() => invalidateStandaloneExtensions());

describe('standalone browser extension runtime', () => {
  it('ignores repository trust files until the browser approves the source fingerprint', async () => {
    const { kandown } = extensionProject();
    const payload = await loadStandaloneExtensionRuntime(
      kandown as unknown as FileSystemDirectoryHandle,
      true,
      [],
      'untrusted-project',
      () => false,
    );
    expect(payload.extensions.find((extension) => extension.id === 'burndown')).toMatchObject({
      health: 'disabled',
      error: expect.stringMatching(/local approval/),
    });
  });

  it('requires approval again when a deferred panel source changes', async () => {
    const { kandown, extensions } = extensionProject();
    const handle = kandown as unknown as FileSystemDirectoryHandle;
    const first = await loadStandaloneExtensionRuntime(handle, true, [], 'changed-source-project', () => true);
    expect(first.extensions.find((extension) => extension.id === 'burndown')?.health).toBe('enabled');

    invalidateStandaloneExtensions();
    extensions.directory('burndown').file('web.js', `export const panels = { chart: function Changed() { return null; } };`);
    const second = await loadStandaloneExtensionRuntime(handle, true, [], 'changed-source-project', () => false);
    expect(second.extensions.find((extension) => extension.id === 'burndown')?.health).toBe('disabled');
  });

  it('rejects incompatible browser entries before executing their factory', async () => {
    const { kandown, extensions } = extensionProject();
    const incompatible = extensions.directory('future');
    incompatible.file('manifest.json', JSON.stringify({ id: 'future', name: 'Future', version: '1.0.0', apiVersion: 2 }));
    incompatible.file('index.js', `export default function () { globalThis.__futureExtensionRan = true; }`);
    const payload = await loadStandaloneExtensionRuntime(
      kandown as unknown as FileSystemDirectoryHandle,
      true,
      [],
      'incompatible-project',
      () => true,
    );
    expect(payload.extensions.find((extension) => extension.id === 'future')).toMatchObject({
      health: 'errored',
      error: expect.stringMatching(/unsupported apiVersion/),
    });
    expect((globalThis as Record<string, unknown>).__futureExtensionRan).toBeUndefined();
  });

  it('isolates broken entries and activates fields, badges and panels from index.js', async () => {
    const { kandown } = extensionProject();
    const payload = await loadStandaloneExtensionRuntime(
      kandown as unknown as FileSystemDirectoryHandle,
      true,
      [{
        id: 't1',
        frontmatter: { plugins: { burndown: { points: '8' } } },
        plugins: { burndown: { points: '8' } },
      }],
      'test-project',
      () => true,
    );

    expect(payload.extensions.find((extension) => extension.id === 'burndown')).toMatchObject({
      health: 'enabled',
      fields: [{ key: 'points', type: 'number', hasBadge: true }],
      panels: [{ id: 'chart', entry: './web.js' }],
      gates: 1,
    });
    expect(payload.extensions.find((extension) => extension.id === 'broken')).toMatchObject({
      health: 'errored',
      error: expect.stringMatching(/broken browser entry/),
    });
    expect(payload.badges.t1).toEqual([{ extId: 'burndown', fieldKey: 'points', text: 'P8' }]);

    const web = await loadExtensionWebModule(
      kandown as unknown as FileSystemDirectoryHandle,
      'burndown',
      './web.js',
    );
    expect(typeof web.panels?.chart).toBe('function');
  });

  it('persists quarantine after three panel failures and restores it on reload', async () => {
    const { kandown } = extensionProject();
    const handle = kandown as unknown as FileSystemDirectoryHandle;
    await loadStandaloneExtensionRuntime(handle, true, [], 'quarantine-project', () => true);

    await reportStandalonePanelOutcome(handle, 'burndown', 'failure', 'one');
    await reportStandalonePanelOutcome(handle, 'burndown', 'failure', 'two');
    const third = await reportStandalonePanelOutcome(handle, 'burndown', 'failure', 'three');
    expect(third).toMatchObject({ health: 'quarantined', failures: 3 });

    const reloaded = await loadStandaloneExtensionRuntime(handle, true, [], 'quarantine-project', () => true);
    expect(reloaded.extensions.find((extension) => extension.id === 'burndown')).toMatchObject({
      health: 'quarantined',
      failures: 3,
    });
  });
});
