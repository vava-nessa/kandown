/**
 * @file Node workflow skill discovery tests
 * @description Verifies bundled skill discovery plus missing configured skill
 * diagnostics without relying on network or executable package content.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listWorkflowSkills, loadConfiguredWorkflowSkills } from '../skills';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'kandown-skills-'));
  roots.push(root);
  const kandownDir = join(root, '.kandown');
  mkdirSync(kandownDir, { recursive: true });
  return kandownDir;
}

describe('Node workflow skill discovery', () => {
  it('discovers the three valid built-in packages', () => {
    const skills = listWorkflowSkills(project());
    expect(skills.map(skill => skill.id)).toEqual(['code-review', 'release-readiness', 'test-driven']);
    expect(skills.every(skill => skill.valid && skill.source === 'built-in')).toBe(true);
  });

  it('returns a structured diagnostic for a missing configured skill', () => {
    const result = loadConfiguredWorkflowSkills(project(), ['code-review', 'does-not-exist']);
    expect(result.skills.map(skill => skill.id)).toEqual(['code-review']);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'missing_skill' }));
  });
});
