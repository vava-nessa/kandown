/**
 * @file Workflow skill package tests
 * @description Locks data-only skill validation, compatibility filtering,
 * semantic role diagnostics, and optional chat button metadata for additive
 * workflow guidance.
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

describe('skill chat metadata', () => {
  function manifestWith(chat: unknown): Record<string, string> {
    const manifest: Record<string, unknown> = {
      formatVersion: 1,
      id: 'test-driven',
      name: 'Test Driven',
      version: '1.0.0',
      description: 'Focused test-first loops.',
      instructions: 'instructions.md',
    };
    if (chat !== undefined) manifest.chat = chat;
    return {
      'manifest.json': JSON.stringify(manifest),
      'instructions.md': 'Write one failing test before implementation.',
    };
  }

  it('parses a valid chat declaration and applies interactive and autoApply defaults', () => {
    const result = loadWorkflowSkill(manifestWith({ button: { label: 'Refine' }, scope: 'task' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.chat).toEqual({ button: { label: 'Refine' }, scope: 'task', interactive: false, autoApply: false });
  });

  it('keeps explicit icon and flags', () => {
    const result = loadWorkflowSkill(manifestWith({
      button: { label: 'Grill me', icon: 'help' },
      scope: 'board',
      interactive: true,
      autoApply: true,
    }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.chat?.button).toEqual({ label: 'Grill me', icon: 'help' });
      expect(result.value.chat?.scope).toBe('board');
      expect(result.value.chat?.interactive).toBe(true);
      expect(result.value.chat?.autoApply).toBe(true);
    }
  });

  it('accepts labels up to 40 characters', () => {
    const edge = loadWorkflowSkill(manifestWith({ button: { label: 'x'.repeat(40) }, scope: 'task' }));
    expect(edge.ok).toBe(true);
    const over = loadWorkflowSkill(manifestWith({ button: { label: 'x'.repeat(41) }, scope: 'task' }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errors).toContainEqual(expect.objectContaining({ code: 'invalid_value', path: 'manifest.chat.button.label' }));
  });

  it('rejects a missing scope', () => {
    const result = loadWorkflowSkill(manifestWith({ button: { label: 'Refine' } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ code: 'missing_field', path: 'manifest.chat.scope' }));
  });

  it('rejects an empty or oversized label', () => {
    for (const label of ['', '   ']) {
      const result = loadWorkflowSkill(manifestWith({ button: { label }, scope: 'task' }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ code: 'invalid_value', path: 'manifest.chat.button.label' }));
    }
    const missing = loadWorkflowSkill(manifestWith({ button: {}, scope: 'task' }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors).toContainEqual(expect.objectContaining({ code: 'missing_field', path: 'manifest.chat.button.label' }));
  });

  it('rejects bad types on chat, button, scope, and boolean flags', () => {
    const chatString = loadWorkflowSkill(manifestWith('nope'));
    expect(chatString.ok).toBe(false);
    if (!chatString.ok) expect(chatString.errors).toContainEqual(expect.objectContaining({ code: 'invalid_type', path: 'manifest.chat' }));

    const buttonString = loadWorkflowSkill(manifestWith({ button: 'nope', scope: 'task' }));
    expect(buttonString.ok).toBe(false);
    if (!buttonString.ok) expect(buttonString.errors).toContainEqual(expect.objectContaining({ code: 'invalid_type', path: 'manifest.chat.button' }));

    const badScope = loadWorkflowSkill(manifestWith({ button: { label: 'X' }, scope: 'project' }));
    expect(badScope.ok).toBe(false);
    if (!badScope.ok) expect(badScope.errors).toContainEqual(expect.objectContaining({ code: 'invalid_value', path: 'manifest.chat.scope' }));

    const badFlag = loadWorkflowSkill(manifestWith({ button: { label: 'X' }, scope: 'task', interactive: 'yes' }));
    expect(badFlag.ok).toBe(false);
    if (!badFlag.ok) expect(badFlag.errors).toContainEqual(expect.objectContaining({ code: 'invalid_type', path: 'manifest.chat.interactive' }));

    const badIcon = loadWorkflowSkill(manifestWith({ button: { label: 'X', icon: 7 }, scope: 'task' }));
    expect(badIcon.ok).toBe(false);
    if (!badIcon.ok) expect(badIcon.errors).toContainEqual(expect.objectContaining({ code: 'invalid_value', path: 'manifest.chat.button.icon' }));
  });

  it('rejects unknown chat and button fields', () => {
    const unknownChatField = loadWorkflowSkill(manifestWith({ button: { label: 'X' }, scope: 'task', surprise: 1 }));
    expect(unknownChatField.ok).toBe(false);
    if (!unknownChatField.ok) expect(unknownChatField.errors).toContainEqual(expect.objectContaining({ code: 'unknown_field', path: 'manifest.chat.surprise' }));

    const unknownButtonField = loadWorkflowSkill(manifestWith({ button: { label: 'X', href: 'https://example.com' }, scope: 'task' }));
    expect(unknownButtonField.ok).toBe(false);
    if (!unknownButtonField.ok) expect(unknownButtonField.errors).toContainEqual(expect.objectContaining({ code: 'unknown_field', path: 'manifest.chat.button.href' }));
  });

  it('validates manifests without chat exactly as before', () => {
    const without = loadWorkflowSkill(manifestWith(undefined));
    expect(without.ok).toBe(true);
    if (without.ok) expect(without.value.chat).toBeUndefined();
  });
});
