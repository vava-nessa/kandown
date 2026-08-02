/**
 * @file Kandown Work compiler tests
 * @description Verifies immutable-core density, fixed nine-layer ordering,
 * tracking cadence, semantic column placeholders, and structured diagnostics.
 */

import { describe, expect, it } from 'vitest';
import { compileKandownWork, estimateTokenCount, kandownWorkStats, type KandownWorkInput } from '../kandown-work';
import type { LoadedWorkflowPackage } from '../workflows';

const workflow: LoadedWorkflowPackage = {
  manifest: { formatVersion: 1, id: 'test', name: 'Test', version: '1.0.0', author: 'Kandown', description: 'Test.', summary: 'Test.', requiredRoles: ['active', 'terminal'], protocol: 'protocol.md', taskTemplates: [], attribution: [] },
  protocol: { path: 'protocol.md', content: 'Move from {{column:active}} to {{column:terminal}}.\n\n{{trackingPolicy}}' },
  taskTemplates: [],
};

function input(overrides: Partial<KandownWorkInput> = {}): KandownWorkInput {
  return {
    detailMode: 'standard', trackingCadence: 'balanced', workflow,
    columns: [
      { name: 'Ideas', meta: { role: 'backlog' } },
      { name: 'Building', meta: { role: 'active', instructions: 'Implement.' } },
      { name: 'Shipped', meta: { role: 'terminal' } },
    ],
    availableCommands: ['kandown show <id>', 'kandown move <id> <status>'],
    extensions: [{ id: 'proof', name: 'Proof', summary: 'Capture evidence.' }],
    skills: [{ id: 'review', name: 'Review', content: 'Review the diff.' }],
    globalInstructions: 'Global rule.', projectInstructions: 'Project rule.',
    context: { kind: 'task', markdown: 't1 Test task' }, ...overrides,
  };
}

describe('compileKandownWork', () => {
  it('renders all layers in fixed order and resolves role placeholders', () => {
    const result = compileKandownWork(input());
    expect(result.diagnostics).toEqual([]);
    expect(result.stats).toEqual(kandownWorkStats(result.markdown));
    expect(result.markdown).toContain('Move from Building to Shipped.');
    const headings = ['Kandown Core', 'Project Columns', 'Active Extensions', 'Workflow:', 'Tracking Policy:', 'Active Skills', 'Global Instructions', 'Project Instructions', 'Target Task Context'];
    let cursor = -1;
    for (const heading of headings) {
      const next = result.markdown.indexOf(heading);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
  });

  it.each(['caveman', 'standard', 'complete'] as const)('keeps immutable core in %s mode', detailMode => {
    expect(compileKandownWork(input({ detailMode })).markdown).toContain('Task Markdown');
  });

  it('reports missing required roles without inventing a column name', () => {
    const result = compileKandownWork(input({ columns: [] }));
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'missing_column_role', role: 'active' })]));
    expect(result.markdown).toContain('[missing column role: active]');
  });

  it('reports portable token estimates without a model-specific dependency', () => {
    expect(estimateTokenCount('hello world!')).toBe(5);
    expect(kandownWorkStats('hello world!')).toEqual({ characters: 12, words: 2, estimatedTokens: 5 });
  });
});
