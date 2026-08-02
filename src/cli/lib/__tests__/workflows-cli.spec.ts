/**
 * @file Workflow CLI adapter tests
 * @description Exercises built-in discovery, provenance-preserving local forks,
 * validated Markdown editing, and no-orphan board preset previews against real
 * temporary Kandown projects.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { forkWorkflow, listWorkflowPackages, loadWorkflowById, previewBoardPreset, updateLocalWorkflowFile } from '../workflows-cli';

const roots: string[] = [];
function project(config?: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'kandown-workflows-'));
  roots.push(root);
  const kandownDir = join(root, '.kandown');
  mkdirSync(kandownDir, { recursive: true });
  writeFileSync(join(kandownDir, 'kandown.json'), `${JSON.stringify(config ?? {}, null, 2)}\n`);
  mkdirSync(join(root, 'tasks'), { recursive: true });
  return kandownDir;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('workflow CLI adapter', () => {
  it('discovers all validated built-ins', () => {
    const kandownDir = project();
    const workflows = listWorkflowPackages(kandownDir);
    expect(workflows).toHaveLength(6);
    expect(workflows.every(item => item.valid && item.source === 'built-in')).toBe(true);
    expect(() => loadWorkflowById(kandownDir, 'missing-workflow')).toThrow(/not installed/);
  });

  it('forks an immutable built-in and validates edits', () => {
    const kandownDir = project();
    const fork = forkWorkflow(kandownDir, 'kandown-standard');
    expect(fork.manifest.id).toBe('kandown-standard-local');
    expect(fork.manifest.provenance).toMatchObject({ sourceId: 'kandown-standard', sourceVersion: '1.0.0' });
    const edited = updateLocalWorkflowFile(kandownDir, fork.manifest.id, 'protocol.md', `${fork.protocol.content}\nExtra local rule.\n`);
    expect(edited.protocol.content).toContain('Extra local rule.');
    expect(() => updateLocalWorkflowFile(kandownDir, fork.manifest.id, '../escape.md', 'bad')).toThrow(/declared/);
  });

  it('previews role-based status moves and preserves occupied custom columns', () => {
    const kandownDir = project({
      board: {
        columns: ['Ideas', 'Building', 'QA', 'Shipped', 'Customer Hold'],
        columnMeta: {
          Ideas: { role: 'backlog' }, Building: { role: 'active' }, QA: { role: 'review' },
          Shipped: { role: 'terminal' }, 'Customer Hold': { role: 'custom' },
        },
      },
    });
    const root = join(kandownDir, '..');
    writeFileSync(join(root, 'tasks', 't1.md'), '---\nid: t1\ntitle: Build\nstatus: Building\n---\n');
    writeFileSync(join(root, 'tasks', 't2.md'), '---\nid: t2\ntitle: Wait\nstatus: Customer Hold\n---\n');
    const preview = previewBoardPreset(kandownDir, 'kandown-standard');
    expect(preview.statusMapping.Building).toBe('In Progress');
    expect(preview.preservedColumns).toEqual(['Customer Hold']);
    expect(preview.targetColumns).toContain('Customer Hold');
  });
});
