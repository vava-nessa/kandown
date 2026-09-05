/**
 * @file Node workflow skill discovery tests
 * @description Verifies bundled skill discovery plus missing configured skill
 * diagnostics without relying on network or executable package content. Also
 * locks chat metadata carriage and the agent session skill resolution rules
 * (built-ins always qualify, others only when configured, invalid never).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSkillSessionPrompt, findSessionSkill, listWorkflowSkills, loadConfiguredWorkflowSkills } from '../skills';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'kandown-skills-'));
  roots.push(root);
  const kandownDir = join(root, '.kandown');
  mkdirSync(kandownDir, { recursive: true });
  return kandownDir;
}

function writeProjectSkill(kandownDir: string, id: string, configured: boolean): void {
  const directory = join(kandownDir, 'skills', id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
    formatVersion: 1,
    id,
    name: id,
    version: '1.0.0',
    description: `${id} skill`,
    instructions: 'instructions.md',
    chat: { button: { label: id }, scope: 'task' },
  }));
  writeFileSync(join(directory, 'instructions.md'), `${id} instructions`);
}

describe('Node workflow skill discovery', () => {
  it('discovers the five valid built-in packages', () => {
    const skills = listWorkflowSkills(project());
    expect(skills.map(skill => skill.id)).toEqual(['code-review', 'grill-me', 'refine', 'release-readiness', 'test-driven']);
    expect(skills.every(skill => skill.valid && skill.source === 'built-in')).toBe(true);
  });

  it('carries chat metadata from the built-in manifests', () => {
    const skills = listWorkflowSkills(project());
    const grill = skills.find(skill => skill.id === 'grill-me');
    expect(grill?.chat).toEqual({
      button: { label: 'Grill me' },
      scope: 'task',
      interactive: true,
      autoApply: false,
    });
    const refine = skills.find(skill => skill.id === 'refine');
    expect(refine?.chat).toEqual({
      button: { label: 'Refine' },
      scope: 'task',
      interactive: false,
      autoApply: false,
    });
    const codeReview = skills.find(skill => skill.id === 'code-review');
    expect(codeReview?.chat).toBeUndefined();
  });

  it('returns a structured diagnostic for a missing configured skill', () => {
    const result = loadConfiguredWorkflowSkills(project(), ['code-review', 'does-not-exist']);
    expect(result.skills.map(skill => skill.id)).toEqual(['code-review']);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'missing_skill' }));
  });
});

describe('session skill resolution', () => {
  it('resolves built-in skills without configuration', () => {
    const kandownDir = project();
    const skill = findSessionSkill(kandownDir, 'refine', []);
    expect(skill?.id).toBe('refine');
    expect(skill?.valid).toBe(true);
  });

  it('resolves configured project skills and rejects unconfigured ones', () => {
    const kandownDir = project();
    writeProjectSkill(kandownDir, 'my-skill', true);
    expect(findSessionSkill(kandownDir, 'my-skill', ['my-skill'])?.id).toBe('my-skill');
    expect(findSessionSkill(kandownDir, 'my-skill', [])).toBeUndefined();
  });

  it('rejects unknown and invalid skills', () => {
    const kandownDir = project();
    expect(findSessionSkill(kandownDir, 'does-not-exist', ['does-not-exist'])).toBeUndefined();
    const invalid = join(kandownDir, 'skills', 'broken');
    mkdirSync(invalid, { recursive: true });
    writeFileSync(join(invalid, 'manifest.json'), '{ not json');
    expect(findSessionSkill(kandownDir, 'broken', ['broken'])).toBeUndefined();
  });

  it('appends the skill section and the interactive directive to the prompt', () => {
    const kandownDir = project();
    const grill = findSessionSkill(kandownDir, 'grill-me', []);
    if (!grill) throw new Error('grill-me fixture missing.');
    const prompt = buildSkillSessionPrompt('COMPILED DOC', grill);
    expect(prompt).toBe(
      'COMPILED DOC\n\n---\n\n# Skill: grill-me\n\n' +
      grill.content.trim() +
      "\n\nFollow this skill's process: produce only what its first step asks for (the numbered questions), then stop and wait for the user's answers.",
    );
  });

  it('appends the apply directive to non-interactive skills and plain skills alike', () => {
    const kandownDir = project();
    const refine = findSessionSkill(kandownDir, 'refine', []);
    const codeReview = findSessionSkill(kandownDir, 'code-review', []);
    if (!refine || !codeReview) throw new Error('Built-in fixtures missing.');
    expect(buildSkillSessionPrompt('DOC', refine).endsWith('\n\nApply this skill to the context above now.')).toBe(true);
    expect(buildSkillSessionPrompt('DOC', codeReview).endsWith('\n\nApply this skill to the context above now.')).toBe(true);
  });
});
