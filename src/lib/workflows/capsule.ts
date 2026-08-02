/**
 * @file Portable Markdown workflow capsules
 * @description Exports and imports a complete workflow package as one readable
 * Markdown document with YAML frontmatter and length-delimited Kandown sections.
 * Length-delimited raw sections preserve arbitrary Markdown, including Kandown
 * tag examples, while strict section names and package validation keep capsules
 * data-only and portable across future Node and browser loaders.
 *
 * 📖 Capsule input is capped at 1 MiB of UTF-8. This conservative limit is large
 * enough for instruction and template Markdown while preventing an import action
 * from parsing an unexpectedly large pasted or downloaded document.
 *
 * @functions
 *  → exportWorkflowCapsule: validates and serializes a loaded workflow package
 *  → importWorkflowCapsule: parses and validates a Markdown capsule
 *
 * @exports WORKFLOW_CAPSULE_MAX_BYTES, exportWorkflowCapsule, importWorkflowCapsule
 * @see src/lib/workflows/validation.ts
 */

import type {
  LoadedWorkflowPackage,
  WorkflowFormatError,
  WorkflowResult,
} from './types';
import {
  isSafeWorkflowPath,
  loadWorkflowPackage,
  validateWorkflowPackage,
} from './validation';

/** Maximum accepted capsule size measured as UTF-8 bytes. */
export const WORKFLOW_CAPSULE_MAX_BYTES = 1_048_576;

type CapsuleSectionKind = 'manifest' | 'protocol' | 'guide' | 'board' | 'template';

interface CapsuleSection {
  kind: CapsuleSectionKind;
  path: string;
  content: string;
}

interface CapsuleFrontmatter {
  kind: 'kandown-workflow-capsule';
  capsuleVersion: 1;
  formatVersion: 1;
  id: string;
}

const CAPSULE_FIELDS = new Set(['kind', 'capsuleVersion', 'formatVersion', 'id']);
const SECTION_KINDS = new Set<string>(['manifest', 'protocol', 'guide', 'board', 'template']);
const EXECUTABLE_FIELDS = new Set([
  'bin',
  'command',
  'commands',
  'entry',
  'entrypoint',
  'executable',
  'hooks',
  'main',
  'module',
  'permissions',
  'runtime',
  'script',
  'scripts',
]);
const SECTION_OPEN = /^<!-- kandown:section kind=([a-z]+) path=([^ ]+) chars=(\d+) -->\n/;
const SECTION_CLOSE = '\n<!-- kandown:end -->';

function isCapsuleSectionKind(value: string): value is CapsuleSectionKind {
  return SECTION_KINDS.has(value);
}

function addError(
  errors: WorkflowFormatError[],
  code: WorkflowFormatError['code'],
  path: string,
  message: string,
): void {
  errors.push({ code, path, message });
}

function failure<T>(errors: WorkflowFormatError[]): WorkflowResult<T> {
  return { ok: false, errors };
}

function utf8Size(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function encodeSection(section: CapsuleSection): string {
  const encodedPath = encodeURIComponent(section.path);
  return `<!-- kandown:section kind=${section.kind} path=${encodedPath} chars=${section.content.length} -->\n${section.content}${SECTION_CLOSE}`;
}

/** Validates a loaded package and writes its canonical Markdown capsule. */
export function exportWorkflowCapsule(rawPackage: unknown): WorkflowResult<string> {
  const packageResult = validateWorkflowPackage(rawPackage);
  if (!packageResult.ok) return packageResult;
  const workflow = packageResult.value;
  const sections: CapsuleSection[] = [
    {
      kind: 'manifest',
      path: 'manifest.json',
      content: JSON.stringify(workflow.manifest, null, 2),
    },
    { kind: 'protocol', path: workflow.protocol.path, content: workflow.protocol.content },
  ];
  if (workflow.guide) sections.push({ kind: 'guide', path: workflow.guide.path, content: workflow.guide.content });
  if (workflow.boardPreset) sections.push({ kind: 'board', path: workflow.boardPreset.path, content: workflow.boardPreset.content });
  for (const template of workflow.taskTemplates) {
    sections.push({ kind: 'template', path: template.file, content: template.content });
  }

  const capsule = [
    '---',
    'kind: "kandown-workflow-capsule"',
    'capsuleVersion: 1',
    'formatVersion: 1',
    `id: ${JSON.stringify(workflow.manifest.id)}`,
    '---',
    '',
    `# Kandown Workflow Capsule: ${workflow.manifest.name}`,
    '',
    '> This file is a data-only Kandown workflow package. Its tagged sections are portable and machine-validated.',
    '',
    sections.map(encodeSection).join('\n\n'),
    '',
  ].join('\n');

  if (utf8Size(capsule) > WORKFLOW_CAPSULE_MAX_BYTES) {
    return failure([{
      code: 'capsule_too_large',
      path: 'capsule',
      message: `Workflow capsule exceeds the ${WORKFLOW_CAPSULE_MAX_BYTES} byte limit`,
    }]);
  }
  return { ok: true, value: capsule };
}

function parseScalar(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseFrontmatter(source: string, errors: WorkflowFormatError[]): { value: CapsuleFrontmatter | null; bodyStart: number } {
  if (!source.startsWith('---\n')) {
    addError(errors, 'malformed_capsule', 'capsule.frontmatter', 'Capsule must start with YAML frontmatter');
    return { value: null, bodyStart: 0 };
  }
  const close = source.indexOf('\n---\n', 4);
  if (close === -1) {
    addError(errors, 'malformed_capsule', 'capsule.frontmatter', 'Capsule frontmatter is not closed');
    return { value: null, bodyStart: 0 };
  }

  const values: Record<string, unknown> = {};
  const lines = source.slice(4, close).split('\n');
  lines.forEach((line, index) => {
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/);
    const path = `capsule.frontmatter.line${index + 2}`;
    if (!match) {
      addError(errors, 'malformed_capsule', path, 'Malformed capsule frontmatter entry');
      return;
    }
    const key = match[1] ?? '';
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      addError(errors, 'duplicate_section', `capsule.frontmatter.${key}`, `Duplicate frontmatter field "${key}"`);
      return;
    }
    if (!CAPSULE_FIELDS.has(key)) {
      addError(
        errors,
        EXECUTABLE_FIELDS.has(key.toLowerCase()) ? 'executable_payload' : 'unknown_field',
        `capsule.frontmatter.${key}`,
        EXECUTABLE_FIELDS.has(key.toLowerCase())
          ? `Executable payload declaration "${key}" is not allowed`
          : `Unknown capsule frontmatter field "${key}"`,
      );
      return;
    }
    values[key] = parseScalar(match[2] ?? '');
  });

  if (values.kind !== 'kandown-workflow-capsule') {
    addError(errors, 'invalid_value', 'capsule.frontmatter.kind', 'kind must be kandown-workflow-capsule');
  }
  if (values.capsuleVersion !== 1) {
    addError(errors, 'invalid_value', 'capsule.frontmatter.capsuleVersion', 'capsuleVersion must be 1');
  }
  if (values.formatVersion !== 1) {
    addError(errors, 'invalid_value', 'capsule.frontmatter.formatVersion', 'formatVersion must be 1');
  }
  if (typeof values.id !== 'string' || !values.id) {
    addError(errors, 'invalid_type', 'capsule.frontmatter.id', 'id must be a non-empty string');
  }
  if (errors.length > 0) return { value: null, bodyStart: close + 5 };
  return {
    value: {
      kind: 'kandown-workflow-capsule',
      capsuleVersion: 1,
      formatVersion: 1,
      id: typeof values.id === 'string' ? values.id : '',
    },
    bodyStart: close + 5,
  };
}

function parseSections(source: string, bodyStart: number, errors: WorkflowFormatError[]): CapsuleSection[] {
  const sections: CapsuleSection[] = [];
  const firstTag = source.indexOf('<!-- kandown:', bodyStart);
  if (firstTag === -1) {
    addError(errors, 'malformed_capsule', 'capsule.sections', 'Capsule contains no Kandown sections');
    return sections;
  }
  const prelude = source.slice(bodyStart, firstTag);
  if (prelude.includes('<!-- kandown:')) {
    addError(errors, 'malformed_capsule', 'capsule.sections', 'Malformed Kandown tag before the first section');
    return sections;
  }

  let cursor = firstTag;
  while (cursor < source.length) {
    const remaining = source.slice(cursor);
    const open = remaining.match(SECTION_OPEN);
    if (!open) {
      addError(errors, 'malformed_capsule', `capsule.sections[${sections.length}]`, 'Malformed Kandown section tag');
      return sections;
    }
    const rawKind = open[1] ?? '';
    if (!isCapsuleSectionKind(rawKind)) {
      addError(errors, 'unknown_section', `capsule.sections[${sections.length}]`, `Unknown Kandown section kind "${rawKind}"`);
      return sections;
    }

    let path: string;
    try {
      path = decodeURIComponent(open[2] ?? '');
    } catch {
      addError(errors, 'malformed_capsule', `capsule.sections[${sections.length}].path`, 'Section path is not valid URI encoding');
      return sections;
    }
    if (!isSafeWorkflowPath(path)) {
      addError(errors, 'unsafe_path', `capsule.sections[${sections.length}].path`, `Section path "${path}" is unsafe`);
      return sections;
    }
    const length = Number(open[3]);
    if (!Number.isSafeInteger(length) || length < 0) {
      addError(errors, 'malformed_capsule', `capsule.sections[${sections.length}].chars`, 'Section character count is invalid');
      return sections;
    }
    const contentStart = cursor + open[0].length;
    const contentEnd = contentStart + length;
    if (contentEnd > source.length) {
      addError(errors, 'malformed_capsule', `capsule.sections[${sections.length}]`, 'Section content is shorter than its declared character count');
      return sections;
    }
    const content = source.slice(contentStart, contentEnd);
    if (!source.startsWith(SECTION_CLOSE, contentEnd)) {
      addError(errors, 'malformed_capsule', `capsule.sections[${sections.length}]`, 'Section closing tag is missing or misplaced');
      return sections;
    }
    sections.push({ kind: rawKind, path, content });
    cursor = contentEnd + SECTION_CLOSE.length;
    if (cursor === source.length) break;
    const next = source.indexOf('<!-- kandown:', cursor);
    if (next === -1) {
      if (source.slice(cursor).trim()) addError(errors, 'malformed_capsule', 'capsule.sections', 'Unexpected content after the final section');
      break;
    }
    if (source.slice(cursor, next).trim()) {
      addError(errors, 'malformed_capsule', 'capsule.sections', 'Only whitespace may appear between Kandown sections');
      return sections;
    }
    cursor = next;
  }
  return sections;
}

function validateSectionSet(sections: CapsuleSection[], errors: WorkflowFormatError[]): void {
  const seenPaths = new Set<string>();
  const singletonCounts = new Map<CapsuleSectionKind, number>();
  for (const section of sections) {
    if (seenPaths.has(section.path)) {
      addError(errors, 'duplicate_section', `capsule.sections.${section.path}`, `Duplicate capsule section path "${section.path}"`);
    }
    seenPaths.add(section.path);
    if (section.kind !== 'template') singletonCounts.set(section.kind, (singletonCounts.get(section.kind) ?? 0) + 1);
  }
  for (const kind of ['manifest', 'protocol', 'guide', 'board'] as const) {
    const count = singletonCounts.get(kind) ?? 0;
    if ((kind === 'manifest' || kind === 'protocol') && count === 0) {
      addError(errors, 'missing_file', `capsule.sections.${kind}`, `Capsule requires one ${kind} section`);
    }
    if (count > 1) addError(errors, 'duplicate_section', `capsule.sections.${kind}`, `Capsule contains duplicate ${kind} sections`);
  }

  for (const section of sections) {
    const expected = section.kind === 'manifest'
      ? section.path === 'manifest.json'
      : section.kind === 'protocol'
        ? section.path === 'protocol.md'
        : section.kind === 'guide'
          ? section.path === 'guide.md'
          : section.kind === 'board'
            ? section.path === 'board.json'
            : /^templates\/[^/]+\.md$/.test(section.path);
    if (!expected) addError(errors, 'invalid_value', `capsule.sections.${section.path}`, `Path does not match ${section.kind} section policy`);
  }
}

/** Parses one Markdown capsule and returns a fully loaded workflow package. */
export function importWorkflowCapsule(source: unknown): WorkflowResult<LoadedWorkflowPackage> {
  const errors: WorkflowFormatError[] = [];
  if (typeof source !== 'string') {
    addError(errors, 'invalid_type', 'capsule', 'Workflow capsule must be a string');
    return failure(errors);
  }
  if (utf8Size(source) > WORKFLOW_CAPSULE_MAX_BYTES) {
    addError(errors, 'capsule_too_large', 'capsule', `Workflow capsule exceeds the ${WORKFLOW_CAPSULE_MAX_BYTES} byte limit`);
    return failure(errors);
  }

  const frontmatter = parseFrontmatter(source, errors);
  if (!frontmatter.value) return failure(errors);
  const sections = parseSections(source, frontmatter.bodyStart, errors);
  validateSectionSet(sections, errors);
  if (errors.length > 0) return failure(errors);

  const files: Record<string, string> = {};
  for (const section of sections) files[section.path] = section.content;
  const packageResult = loadWorkflowPackage(files);
  if (!packageResult.ok) return packageResult;
  if (packageResult.value.manifest.id !== frontmatter.value.id) {
    addError(errors, 'invalid_value', 'capsule.frontmatter.id', 'Capsule id does not match manifest id');
  }
  if (packageResult.value.manifest.formatVersion !== frontmatter.value.formatVersion) {
    addError(errors, 'invalid_value', 'capsule.frontmatter.formatVersion', 'Capsule formatVersion does not match the manifest');
  }
  return errors.length > 0 ? failure(errors) : packageResult;
}
