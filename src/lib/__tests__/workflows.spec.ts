/**
 * @file Workflow package format and capsule tests
 * @description Locks the pure version 1 workflow contract across valid source
 * folders, malformed manifests, portable path security, duplicate template
 * declarations, loaded-package validation, Markdown capsule round trips, strict
 * section parsing, data-only enforcement, and the conservative capsule size cap.
 */

import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_CAPSULE_MAX_BYTES,
  exportWorkflowCapsule,
  importWorkflowCapsule,
  isSafeWorkflowPath,
  loadWorkflowPackage,
  validateWorkflowManifest,
  validateWorkflowPackage,
  type WorkflowManifest,
  type WorkflowSourceFiles,
} from '../workflows';

function manifest(overrides: Partial<WorkflowManifest> = {}): WorkflowManifest {
  return {
    formatVersion: 1,
    id: 'guided-feature',
    name: 'Guided Feature',
    version: '1.2.0-beta.1',
    author: 'Kandown',
    description: 'Plan and deliver one reviewed feature.',
    summary: 'A review-oriented feature workflow.',
    minKandownVersion: '0.46.0',
    requiredRoles: ['backlog', 'ready', 'active', 'review', 'terminal'],
    protocol: 'protocol.md',
    guide: 'guide.md',
    boardPreset: 'board.json',
    taskTemplates: [
      {
        id: 'feature',
        name: 'Feature',
        description: 'A feature task with acceptance criteria.',
        file: 'templates/feature.md',
        default: true,
      },
      {
        id: 'bug-fix',
        name: 'Bug Fix',
        description: 'A focused defect task.',
        file: 'templates/bug-fix.md',
      },
    ],
    attribution: [
      {
        name: 'AI Dev Tasks',
        url: 'https://github.com/snarktank/ai-dev-tasks',
        note: 'Inspired the planning and review loop.',
        license: 'MIT',
      },
    ],
    ...overrides,
  };
}

function files(manifestValue: WorkflowManifest = manifest()): WorkflowSourceFiles {
  return {
    'manifest.json': JSON.stringify(manifestValue),
    'protocol.md': '# Protocol\n\nWork one task at a time.\n\n<!-- kandown:end -->',
    'guide.md': '# Guide\n\nAsk before changing scope.',
    'board.json': JSON.stringify({
      columns: [
        { name: 'Ideas', role: 'backlog' },
        { name: 'Ready', role: 'ready' },
        { name: 'Building', role: 'active' },
        { name: 'Review', role: 'review' },
        { name: 'Done', role: 'terminal' },
      ],
      priorities: ['P1', 'P2', 'P3'],
    }),
    'templates/feature.md': '# Feature\n\n## Acceptance criteria',
    'templates/bug-fix.md': '# Bug Fix\n\n## Reproduction',
  };
}

function errorCodes(result: ReturnType<typeof validateWorkflowManifest>): string[] {
  return result.ok ? [] : result.errors.map(error => error.code);
}

describe('workflow source package', () => {
  it('loads a valid complete package and resolves every declared file', () => {
    const result = loadWorkflowPackage(files());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.manifest.id).toBe('guided-feature');
    expect(result.value.protocol.path).toBe('protocol.md');
    expect(result.value.guide?.content).toContain('changing scope');
    expect(result.value.boardPreset?.value).toMatchObject({
      columns: expect.arrayContaining([{ name: 'Ideas', role: 'backlog' }]),
    });
    expect(result.value.taskTemplates.map(template => [template.id, template.file, template.default])).toEqual([
      ['feature', 'templates/feature.md', true],
      ['bug-fix', 'templates/bug-fix.md', undefined],
    ]);
  });

  it('returns typed errors for a malformed manifest instead of throwing', () => {
    const result = validateWorkflowManifest({
      formatVersion: 2,
      id: 'Not Kebab',
      name: '',
      version: 'latest',
      author: 'Kandown',
      description: 'Description',
      requiredRoles: ['moving'],
      protocol: 'protocol.md',
      taskTemplates: 'feature.md',
      attribution: null,
      main: './index.js',
    });

    expect(result.ok).toBe(false);
    expect(errorCodes(result)).toEqual(expect.arrayContaining([
      'executable_payload',
      'invalid_value',
      'missing_field',
      'invalid_type',
    ]));
    if (!result.ok) expect(result.errors.every(error => error.path && error.message)).toBe(true);
  });

  it.each([
    '/protocol.md',
    '../protocol.md',
    'docs/../../protocol.md',
    'C:\\protocol.md',
    '\\\\server\\protocol.md',
    'file:protocol.md',
    './protocol.md',
  ])('rejects unsafe relative path %s', path => {
    expect(isSafeWorkflowPath(path)).toBe(false);
  });

  it('rejects traversal in manifest references and source-map keys', () => {
    const badProtocol = validateWorkflowManifest(manifest({ protocol: '../protocol.md' }));
    expect(badProtocol.ok).toBe(false);
    if (!badProtocol.ok) expect(badProtocol.errors).toContainEqual(expect.objectContaining({ code: 'unsafe_path' }));

    const badTemplate = validateWorkflowManifest(manifest({
      taskTemplates: [{
        id: 'feature',
        name: 'Feature',
        description: 'Feature task.',
        file: 'templates/../feature.md',
      }],
    }));
    expect(badTemplate.ok).toBe(false);
    if (!badTemplate.ok) expect(badTemplate.errors).toContainEqual(expect.objectContaining({ code: 'unsafe_path' }));

    const badFiles = loadWorkflowPackage({ ...files(), '../escape.md': 'nope' });
    expect(badFiles.ok).toBe(false);
    if (!badFiles.ok) expect(badFiles.errors).toContainEqual(expect.objectContaining({ code: 'unsafe_path' }));
  });

  it('rejects duplicate template ids, files, and defaults', () => {
    const duplicate = validateWorkflowManifest(manifest({
      taskTemplates: [
        { id: 'feature', name: 'One', description: 'One.', file: 'templates/feature.md', default: true },
        { id: 'feature', name: 'Two', description: 'Two.', file: 'templates/feature.md', default: true },
      ],
    }));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.errors.filter(error => error.code === 'duplicate_id')).toHaveLength(2);
      expect(duplicate.errors).toContainEqual(expect.objectContaining({ code: 'duplicate_default' }));
    }
  });

  it('rejects undeclared and executable files plus executable board declarations', () => {
    const undeclared = loadWorkflowPackage({ ...files(), 'notes.md': 'not declared' });
    expect(undeclared.ok).toBe(false);
    if (!undeclared.ok) expect(undeclared.errors).toContainEqual(expect.objectContaining({ code: 'unknown_file' }));

    const executable = loadWorkflowPackage({ ...files(), 'run.js': 'alert(1)' });
    expect(executable.ok).toBe(false);
    if (!executable.ok) expect(executable.errors).toContainEqual(expect.objectContaining({ code: 'executable_payload' }));

    const executableBoard = loadWorkflowPackage({
      ...files(),
      'board.json': JSON.stringify({ columns: [], scripts: { install: './run.sh' } }),
    });
    expect(executableBoard.ok).toBe(false);
    if (!executableBoard.ok) expect(executableBoard.errors).toContainEqual(expect.objectContaining({ code: 'executable_payload' }));
  });

  it('validates a complete loaded package and rejects manifest binding drift', () => {
    const loaded = loadWorkflowPackage(files());
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(validateWorkflowPackage(loaded.value)).toEqual(loaded);

    const drifted = {
      ...loaded.value,
      protocol: { ...loaded.value.protocol, path: 'other.md' },
    };
    const result = validateWorkflowPackage(drifted);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ code: 'invalid_value' }));
  });
});

describe('workflow Markdown capsule', () => {
  it('round-trips every package field and raw file content', () => {
    const loaded = loadWorkflowPackage(files());
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const exported = exportWorkflowCapsule(loaded.value);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.value).toContain('kind: "kandown-workflow-capsule"');
    expect(exported.value).toContain('<!-- kandown:section kind=protocol');
    expect(exported.value).toContain('# Protocol');

    const imported = importWorkflowCapsule(exported.value);
    expect(imported).toEqual(loaded);
  });

  it('rejects duplicate and unknown sections', () => {
    const loaded = loadWorkflowPackage(files());
    if (!loaded.ok) throw new Error('test fixture failed to load');
    const exported = exportWorkflowCapsule(loaded.value);
    if (!exported.ok) throw new Error('test fixture failed to export');

    const duplicate = `${exported.value.trimEnd()}\n\n<!-- kandown:section kind=protocol path=protocol.md chars=1 -->\nx\n<!-- kandown:end -->\n`;
    const duplicateResult = importWorkflowCapsule(duplicate);
    expect(duplicateResult.ok).toBe(false);
    if (!duplicateResult.ok) expect(duplicateResult.errors).toContainEqual(expect.objectContaining({ code: 'duplicate_section' }));

    const unknown = exported.value.replace('kind=protocol', 'kind=runtime');
    const unknownResult = importWorkflowCapsule(unknown);
    expect(unknownResult.ok).toBe(false);
    if (!unknownResult.ok) expect(unknownResult.errors).toContainEqual(expect.objectContaining({ code: 'unknown_section' }));
  });

  it('rejects malformed tags, unsafe section paths, and frontmatter id drift', () => {
    const loaded = loadWorkflowPackage(files());
    if (!loaded.ok) throw new Error('test fixture failed to load');
    const exported = exportWorkflowCapsule(loaded.value);
    if (!exported.ok) throw new Error('test fixture failed to export');

    const malformed = importWorkflowCapsule(exported.value.replace('<!-- kandown:end -->', '<!-- kandown:stop -->'));
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.errors).toContainEqual(expect.objectContaining({ code: 'malformed_capsule' }));

    const unsafe = importWorkflowCapsule(exported.value.replace('path=protocol.md', 'path=..%2Fprotocol.md'));
    expect(unsafe.ok).toBe(false);
    if (!unsafe.ok) expect(unsafe.errors).toContainEqual(expect.objectContaining({ code: 'unsafe_path' }));

    const drift = importWorkflowCapsule(exported.value.replace('id: "guided-feature"', 'id: "other-workflow"'));
    expect(drift.ok).toBe(false);
    if (!drift.ok) expect(drift.errors).toContainEqual(expect.objectContaining({ code: 'invalid_value' }));
  });

  it('rejects executable declarations and oversized input before parsing', () => {
    const loaded = loadWorkflowPackage(files());
    if (!loaded.ok) throw new Error('test fixture failed to load');
    const exported = exportWorkflowCapsule(loaded.value);
    if (!exported.ok) throw new Error('test fixture failed to export');

    const executable = importWorkflowCapsule(exported.value.replace('capsuleVersion: 1', 'capsuleVersion: 1\nscripts: "./run.js"'));
    expect(executable.ok).toBe(false);
    if (!executable.ok) expect(executable.errors).toContainEqual(expect.objectContaining({ code: 'executable_payload' }));

    const oversized = importWorkflowCapsule('x'.repeat(WORKFLOW_CAPSULE_MAX_BYTES + 1));
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.errors).toEqual([
      expect.objectContaining({ code: 'capsule_too_large' }),
    ]);
  });
});
