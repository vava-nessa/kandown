/**
 * @file Workflow skill package tests
 * @description Locks data-only skill validation, compatibility filtering, and
 * semantic role diagnostics for additive workflow guidance.
 */

import { describe, expect, it } from 'vitest';
import { compileKandownWork } from '../kandown-work';
import { loadWorkflowPackage, loadWorkflowSkill } from '../workflows';

const skillFiles = {
  'manifest.json': JSON.stringify({
    formatVersion: 1,
    id: 'test-driven',
    name: 'Test Driven',
    version: '1.0.0',
    description: 'Focused test-first loops.',
    instructions: 'instructions.md',
    compatibleWorkflows: ['guided-feature'],
    requiredRoles: ['active'],
  }),
  'instructions.md': 'Write one failing test before implementation.',
};

function workflow() {
  const result = loadWorkflowPackage({
    'manifest.json': JSON.stringify({
      formatVersion: 1,
      id: 'guided-feature',
      name: 'Guided Feature',
      version: '1.0.0',
      author: 'Kandown',
      description: 'Guided delivery.',
      summary: 'Guided delivery.',
      requiredRoles: ['active', 'terminal'],
      protocol: 'protocol.md',
      taskTemplates: [],
      attribution: [],
    }),
    'protocol.md': 'Work in {{column:active}}, then move to {{column:terminal}}. {{trackingPolicy}}',
  });
  if (!result.ok) throw new Error('Invalid workflow test fixture.');
  return result.value;
}

describe('workflow skills', () => {
  it('loads a valid data-only skill and rejects undeclared payloads', () => {
    const valid = loadWorkflowSkill(skillFiles);
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.value.content).toContain('failing test');

    const invalid = loadWorkflowSkill({ ...skillFiles, 'run.js': 'process.exit()' });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors).toContainEqual(expect.objectContaining({ code: 'unknown_file' }));
  });

  it('includes compatible guidance and diagnoses incompatible or missing-role skills', () => {
    const loaded = loadWorkflowSkill(skillFiles);
    if (!loaded.ok) throw new Error('Invalid skill test fixture.');
    const base = {
      detailMode: 'standard' as const,
      trackingCadence: 'balanced' as const,
      availableCommands: ['kandown work'],
      workflow: workflow(),
      globalInstructions: undefined,
      projectInstructions: undefined,
      context: { kind: 'board' as const, markdown: 'Empty board.' },
    };
    const included = compileKandownWork({
      ...base,
      columns: [{ name: 'Ideas', meta: { role: 'backlog' as const } }, { name: 'Building', meta: { role: 'active' as const } }, { name: 'Done', meta: { role: 'terminal' as const } }],
      skills: [loaded.value],
    });
    expect(included.markdown).toContain('Write one failing test');

    const incompatible = compileKandownWork({
      ...base,
      workflow: { ...workflow(), manifest: { ...workflow().manifest, id: 'other-workflow' } },
      columns: [{ name: 'Ideas', meta: { role: 'backlog' as const } }, { name: 'Building', meta: { role: 'active' as const } }, { name: 'Done', meta: { role: 'terminal' as const } }],
      skills: [loaded.value],
    });
    expect(incompatible.diagnostics).toContainEqual(expect.objectContaining({ code: 'incompatible_skill' }));
    expect(incompatible.markdown).not.toContain('Write one failing test');

    const missingRole = compileKandownWork({
      ...base,
      columns: [{ name: 'Done', meta: { role: 'terminal' as const } }],
      skills: [loaded.value],
    });
    expect(missingRole.diagnostics).toContainEqual(expect.objectContaining({ code: 'missing_skill_role' }));
  });
});
