/**
 * @file Workflow store tests
 * @description Verifies pinned registry validation, capsule checksum enforcement,
 * immutable install provenance, and explicit update confirmation without network.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportWorkflowCapsule } from '../../../lib/workflows';
import { listWorkflowPackages, loadWorkflowById } from '../workflows-cli';
import { applyWorkflowUpdate, installStoreWorkflow, type WorkflowRegistryEntry } from '../workflows-store';

const roots: string[] = [];
function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'kandown-store-'));
  roots.push(root);
  const kandownDir = join(root, '.kandown');
  mkdirSync(kandownDir, { recursive: true });
  writeFileSync(join(kandownDir, 'kandown.json'), '{}\n');
  mkdirSync(join(root, 'tasks'), { recursive: true });
  return kandownDir;
}
afterEach(() => { vi.unstubAllGlobals(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('workflow store', () => {
  it('installs a checksum-verified pinned capsule as immutable store content', async () => {
    const kandownDir = project();
    const builtIn = loadWorkflowById(kandownDir, 'diagnose-and-fix');
    const packed = exportWorkflowCapsule(builtIn);
    if (!packed.ok) throw new Error('fixture failed');
    const entry: WorkflowRegistryEntry = {
      id: builtIn.manifest.id,
      name: builtIn.manifest.name,
      author: 'Kandown',
      repo: 'vava-nessa/workflows',
      ref: 'v1.0.0',
      capsule: 'diagnose.kandown-workflow.md',
      sha256: createHash('sha256').update(packed.value).digest('hex'),
      version: builtIn.manifest.version,
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(packed.value, { status: 200 })));
    const result = await installStoreWorkflow(kandownDir, entry);
    expect(result).toEqual({ ok: true, id: entry.id });
    expect(listWorkflowPackages(kandownDir).find(item => item.id === entry.id)?.source).toBe('store');
    expect(loadWorkflowById(kandownDir, entry.id).manifest.provenance).toMatchObject({ repository: entry.repo, ref: entry.ref });
    expect(await applyWorkflowUpdate(kandownDir, entry, false)).toMatchObject({ ok: false, error: expect.stringContaining('confirmation') });
  });

  it('rejects a capsule whose checksum differs from the approved index', async () => {
    const kandownDir = project();
    const entry: WorkflowRegistryEntry = { id: 'bad', name: 'Bad', author: 'Bad', repo: 'owner/repo', ref: 'v1.0.0', capsule: 'bad.md', sha256: '0'.repeat(64), version: '1.0.0' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response('tampered', { status: 200 })));
    expect(await installStoreWorkflow(kandownDir, entry)).toMatchObject({ ok: false, error: expect.stringContaining('checksum') });
  });
});
