/**
 * @file Workflow package validation and pure loading
 * @description Validates raw version 1 workflow manifests, resolves complete
 * data-only packages from caller-provided file maps, and validates already
 * loaded packages without throwing. Path policy is platform-neutral and rejects
 * traversal, absolute paths, Windows separators, undeclared files, and runtime
 * payload declarations before a future Node or browser adapter persists data.
 *
 * @functions
 *  → isSafeWorkflowPath: checks a portable relative package path
 *  → validateWorkflowManifest: validates unknown manifest input
 *  → loadWorkflowPackage: resolves and validates a source-file map
 *  → validateWorkflowPackage: validates an unknown loaded package
 *
 * @exports isSafeWorkflowPath, validateWorkflowManifest, loadWorkflowPackage, validateWorkflowPackage
 * @see src/lib/workflows/types.ts
 */

import type {
  LoadedWorkflowPackage,
  LoadedWorkflowTaskTemplate,
  WorkflowAttribution,
  WorkflowBoardPresetFile,
  WorkflowBoardRole,
  WorkflowFormatError,
  WorkflowManifest,
  WorkflowResult,
  WorkflowSourceFiles,
  WorkflowTaskTemplateManifest,
  WorkflowTextFile,
} from './types';

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVERISH = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ROLES = new Set<string>([
  'backlog',
  'ready',
  'active',
  'review',
  'terminal',
  'custom',
]);
const MANIFEST_FIELDS = new Set([
  'formatVersion',
  'id',
  'name',
  'version',
  'author',
  'description',
  'summary',
  'minKandownVersion',
  'requiredRoles',
  'protocol',
  'guide',
  'boardPreset',
  'taskTemplates',
  'attribution',
  'provenance',
]);
const TEMPLATE_FIELDS = new Set(['id', 'name', 'description', 'file', 'default']);
const ATTRIBUTION_FIELDS = new Set(['name', 'url', 'note', 'license']);
const PROVENANCE_FIELDS = new Set(['sourceId', 'sourceVersion', 'repository', 'ref', 'forkedAt']);
const PACKAGE_FIELDS = new Set(['manifest', 'protocol', 'guide', 'boardPreset', 'taskTemplates']);
const TEXT_FILE_FIELDS = new Set(['path', 'content']);
const BOARD_FILE_FIELDS = new Set(['path', 'content', 'value']);
const LOADED_TEMPLATE_FIELDS = new Set(['id', 'name', 'description', 'file', 'default', 'content']);
const EXECUTABLE_KEYS = new Set([
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
const EXECUTABLE_FILE = /\.(?:cjs|cmd|com|exe|js|jsx|mjs|ps1|sh|ts|tsx)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWorkflowBoardRole(value: unknown): value is WorkflowBoardRole {
  return typeof value === 'string' && ROLES.has(value);
}

function failure<T>(errors: WorkflowFormatError[]): WorkflowResult<T> {
  return { ok: false, errors };
}

function addError(
  errors: WorkflowFormatError[],
  code: WorkflowFormatError['code'],
  path: string,
  message: string,
): void {
  errors.push({ code, path, message });
}

function executableKey(key: string): boolean {
  return EXECUTABLE_KEYS.has(key.toLowerCase());
}

function checkKnownFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: WorkflowFormatError[],
): void {
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) continue;
    addError(
      errors,
      executableKey(key) ? 'executable_payload' : 'unknown_field',
      `${path}.${key}`,
      executableKey(key)
        ? `Executable payload declaration "${key}" is not allowed`
        : `Unknown field "${key}"`,
    );
  }
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: WorkflowFormatError[],
): string {
  const raw = value[key];
  if (typeof raw !== 'string') {
    addError(errors, raw === undefined ? 'missing_field' : 'invalid_type', `${path}.${key}`, `Expected ${key} to be a string`);
    return '';
  }
  if (!raw.trim()) addError(errors, 'invalid_value', `${path}.${key}`, `${key} must not be empty`);
  return raw;
}

function fileContent(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: WorkflowFormatError[],
): string {
  const raw = value[key];
  if (typeof raw !== 'string') {
    addError(errors, raw === undefined ? 'missing_field' : 'invalid_type', `${path}.${key}`, `Expected ${key} to be a string`);
    return '';
  }
  return raw;
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: WorkflowFormatError[],
): string | undefined {
  const raw = value[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !raw.trim()) {
    addError(errors, 'invalid_type', `${path}.${key}`, `Expected ${key} to be a non-empty string`);
    return undefined;
  }
  return raw;
}

/**
 * Checks the common package path policy without relying on Node's `path` API.
 * Paths use forward slashes, contain no empty, dot, or parent segments, and
 * cannot be POSIX, URL, UNC, or drive-letter absolute paths.
 */
export function isSafeWorkflowPath(path: string): boolean {
  if (!path || path.includes('\\') || path.includes('\0')) return false;
  if (path.startsWith('/') || path.startsWith('//') || /^[A-Za-z]:/.test(path)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) return false;
  const segments = path.split('/');
  return segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..');
}

function validatePath(
  path: string,
  fieldPath: string,
  expected: 'protocol' | 'guide' | 'board' | 'template',
  errors: WorkflowFormatError[],
): void {
  if (!isSafeWorkflowPath(path)) {
    addError(errors, 'unsafe_path', fieldPath, `Path "${path}" is not a safe relative package path`);
    return;
  }
  const valid = expected === 'protocol'
    ? path === 'protocol.md'
    : expected === 'guide'
      ? path === 'guide.md'
      : expected === 'board'
        ? path === 'board.json'
        : /^templates\/[^/]+\.md$/.test(path);
  if (!valid) {
    addError(errors, 'invalid_value', fieldPath, `Path "${path}" does not match the workflow ${expected} location`);
  }
}

function validateTaskTemplates(raw: unknown, errors: WorkflowFormatError[]): WorkflowTaskTemplateManifest[] {
  if (!Array.isArray(raw)) {
    addError(errors, raw === undefined ? 'missing_field' : 'invalid_type', 'manifest.taskTemplates', 'taskTemplates must be an array');
    return [];
  }

  const templates: WorkflowTaskTemplateManifest[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  let defaultCount = 0;

  raw.forEach((item, index) => {
    const path = `manifest.taskTemplates[${index}]`;
    if (!isRecord(item)) {
      addError(errors, 'invalid_type', path, 'Task template must be an object');
      return;
    }
    checkKnownFields(item, TEMPLATE_FIELDS, path, errors);
    const id = requiredString(item, 'id', path, errors);
    const name = requiredString(item, 'name', path, errors);
    const description = requiredString(item, 'description', path, errors);
    const file = requiredString(item, 'file', path, errors);
    const defaultValue = item.default;
    if (defaultValue !== undefined && typeof defaultValue !== 'boolean') {
      addError(errors, 'invalid_type', `${path}.default`, 'default must be a boolean when present');
    }
    if (id && !KEBAB_CASE.test(id)) addError(errors, 'invalid_value', `${path}.id`, 'Template id must be kebab-case');
    if (id && ids.has(id)) addError(errors, 'duplicate_id', `${path}.id`, `Duplicate task template id "${id}"`);
    if (id) ids.add(id);
    if (file) validatePath(file, `${path}.file`, 'template', errors);
    if (file && paths.has(file)) addError(errors, 'duplicate_id', `${path}.file`, `Duplicate task template file "${file}"`);
    if (file) paths.add(file);
    if (defaultValue === true) defaultCount += 1;
    templates.push({
      id,
      name,
      description,
      file,
      ...(typeof defaultValue === 'boolean' ? { default: defaultValue } : {}),
    });
  });

  if (defaultCount > 1) {
    addError(errors, 'duplicate_default', 'manifest.taskTemplates', 'At most one task template may be the default');
  }
  return templates;
}

function validateAttribution(raw: unknown, errors: WorkflowFormatError[]): WorkflowAttribution[] {
  if (!Array.isArray(raw)) {
    addError(errors, raw === undefined ? 'missing_field' : 'invalid_type', 'manifest.attribution', 'attribution must be an array');
    return [];
  }
  return raw.flatMap((item, index) => {
    const path = `manifest.attribution[${index}]`;
    if (!isRecord(item)) {
      addError(errors, 'invalid_type', path, 'Attribution must be an object');
      return [];
    }
    checkKnownFields(item, ATTRIBUTION_FIELDS, path, errors);
    const name = requiredString(item, 'name', path, errors);
    const url = requiredString(item, 'url', path, errors);
    const note = optionalString(item, 'note', path, errors);
    const license = optionalString(item, 'license', path, errors);
    return [{ name, url, ...(note ? { note } : {}), ...(license ? { license } : {}) }];
  });
}

function validateProvenance(raw: unknown, errors: WorkflowFormatError[]): WorkflowManifest['provenance'] {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    addError(errors, 'invalid_type', 'manifest.provenance', 'provenance must be an object');
    return undefined;
  }
  checkKnownFields(raw, PROVENANCE_FIELDS, 'manifest.provenance', errors);
  const sourceId = requiredString(raw, 'sourceId', 'manifest.provenance', errors);
  const sourceVersion = requiredString(raw, 'sourceVersion', 'manifest.provenance', errors);
  const repository = optionalString(raw, 'repository', 'manifest.provenance', errors);
  const ref = optionalString(raw, 'ref', 'manifest.provenance', errors);
  const forkedAt = optionalString(raw, 'forkedAt', 'manifest.provenance', errors);
  if (sourceId && !KEBAB_CASE.test(sourceId)) addError(errors, 'invalid_value', 'manifest.provenance.sourceId', 'sourceId must be kebab-case');
  if (sourceVersion && !SEMVERISH.test(sourceVersion)) addError(errors, 'invalid_value', 'manifest.provenance.sourceVersion', 'sourceVersion must be semver-like');
  return { sourceId, sourceVersion, ...(repository ? { repository } : {}), ...(ref ? { ref } : {}), ...(forkedAt ? { forkedAt } : {}) };
}

function validateRoles(raw: unknown, errors: WorkflowFormatError[]): WorkflowBoardRole[] {
  if (!Array.isArray(raw)) {
    addError(errors, raw === undefined ? 'missing_field' : 'invalid_type', 'manifest.requiredRoles', 'requiredRoles must be an array');
    return [];
  }
  const roles: WorkflowBoardRole[] = [];
  const seen = new Set<string>();
  raw.forEach((role, index) => {
    const path = `manifest.requiredRoles[${index}]`;
    if (!isWorkflowBoardRole(role)) {
      addError(errors, 'invalid_value', path, `Unknown board role "${String(role)}"`);
      return;
    }
    if (seen.has(role)) {
      addError(errors, 'duplicate_id', path, `Duplicate required role "${role}"`);
      return;
    }
    seen.add(role);
    roles.push(role);
  });
  return roles;
}

/** Validates unknown JSON data and returns a normalized version 1 manifest. */
export function validateWorkflowManifest(raw: unknown): WorkflowResult<WorkflowManifest> {
  const errors: WorkflowFormatError[] = [];
  if (!isRecord(raw)) {
    addError(errors, 'invalid_type', 'manifest', 'Workflow manifest must be an object');
    return failure(errors);
  }

  checkKnownFields(raw, MANIFEST_FIELDS, 'manifest', errors);
  if (raw.formatVersion !== 1) {
    addError(
      errors,
      raw.formatVersion === undefined ? 'missing_field' : 'invalid_value',
      'manifest.formatVersion',
      'formatVersion must be 1',
    );
  }
  const id = requiredString(raw, 'id', 'manifest', errors);
  const name = requiredString(raw, 'name', 'manifest', errors);
  const version = requiredString(raw, 'version', 'manifest', errors);
  const author = requiredString(raw, 'author', 'manifest', errors);
  const description = requiredString(raw, 'description', 'manifest', errors);
  const summary = requiredString(raw, 'summary', 'manifest', errors);
  const minKandownVersion = optionalString(raw, 'minKandownVersion', 'manifest', errors);
  const protocol = requiredString(raw, 'protocol', 'manifest', errors);
  const guide = optionalString(raw, 'guide', 'manifest', errors);
  const boardPreset = optionalString(raw, 'boardPreset', 'manifest', errors);
  const requiredRoles = validateRoles(raw.requiredRoles, errors);
  const taskTemplates = validateTaskTemplates(raw.taskTemplates, errors);
  const attribution = validateAttribution(raw.attribution, errors);
  const provenance = validateProvenance(raw.provenance, errors);

  if (id && !KEBAB_CASE.test(id)) addError(errors, 'invalid_value', 'manifest.id', 'Workflow id must be kebab-case');
  if (version && !SEMVERISH.test(version)) addError(errors, 'invalid_value', 'manifest.version', 'Workflow version must be semver-like');
  if (minKandownVersion && !SEMVERISH.test(minKandownVersion)) {
    addError(errors, 'invalid_value', 'manifest.minKandownVersion', 'Minimum Kandown version must be semver-like');
  }
  if (protocol) validatePath(protocol, 'manifest.protocol', 'protocol', errors);
  if (guide) validatePath(guide, 'manifest.guide', 'guide', errors);
  if (boardPreset) validatePath(boardPreset, 'manifest.boardPreset', 'board', errors);

  if (errors.length > 0) return failure(errors);
  return {
    ok: true,
    value: {
      formatVersion: 1,
      id,
      name,
      version,
      author,
      description,
      summary,
      ...(minKandownVersion ? { minKandownVersion } : {}),
      requiredRoles,
      protocol,
      ...(guide ? { guide } : {}),
      ...(boardPreset ? { boardPreset } : {}),
      taskTemplates,
      attribution,
      ...(provenance ? { provenance } : {}),
    },
  };
}

function findExecutableDeclaration(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findExecutableDeclaration(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (executableKey(key)) return `${path}.${key}`;
    const found = findExecutableDeclaration(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function parseBoardPreset(path: string, content: string, errors: WorkflowFormatError[]): WorkflowBoardPresetFile | undefined {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    addError(errors, 'malformed_json', path, 'Board preset must contain valid JSON');
    return undefined;
  }
  if (!isRecord(value)) {
    addError(errors, 'invalid_type', path, 'Board preset root must be an object');
    return undefined;
  }
  const executable = findExecutableDeclaration(value, path);
  if (executable) {
    addError(errors, 'executable_payload', executable, 'Board presets cannot declare executable payloads');
    return undefined;
  }
  if (!Array.isArray(value.columns) || value.columns.length === 0) {
    addError(errors, 'invalid_type', `${path}.columns`, 'Board preset columns must be a non-empty array');
    return undefined;
  }
  const names = new Set<string>();
  value.columns.forEach((rawColumn, index) => {
    const columnPath = `${path}.columns[${index}]`;
    if (!isRecord(rawColumn)) {
      addError(errors, 'invalid_type', columnPath, 'Board preset column must be an object');
      return;
    }
    const name = rawColumn.name;
    if (typeof name !== 'string' || !name.trim()) addError(errors, 'invalid_value', `${columnPath}.name`, 'Column name must be a non-empty string');
    else if (names.has(name.toLocaleLowerCase())) addError(errors, 'duplicate_id', `${columnPath}.name`, `Duplicate board column name "${name}"`);
    else names.add(name.toLocaleLowerCase());
    if (!isWorkflowBoardRole(rawColumn.role)) addError(errors, 'invalid_value', `${columnPath}.role`, `Unknown board role "${String(rawColumn.role)}"`);
    if (rawColumn.instructions !== undefined && typeof rawColumn.instructions !== 'string') addError(errors, 'invalid_type', `${columnPath}.instructions`, 'Column instructions must be a string');
  });
  if (value.priorities !== undefined && (!Array.isArray(value.priorities) || !value.priorities.every(priority => typeof priority === 'string' && priority.trim()))) {
    addError(errors, 'invalid_type', `${path}.priorities`, 'Board preset priorities must be an array of non-empty strings');
  }
  if (errors.length > 0) return undefined;
  return { path, content, value };
}

function sourceFilesFromUnknown(raw: unknown, errors: WorkflowFormatError[]): WorkflowSourceFiles | null {
  if (!isRecord(raw)) {
    addError(errors, 'invalid_type', 'files', 'Workflow source files must be an object map');
    return null;
  }
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(raw)) {
    if (!isSafeWorkflowPath(path)) {
      addError(errors, 'unsafe_path', `files.${path}`, `Source path "${path}" is unsafe`);
      continue;
    }
    if (EXECUTABLE_FILE.test(path)) {
      addError(errors, 'executable_payload', `files.${path}`, `Executable source file "${path}" is not allowed`);
      continue;
    }
    if (typeof content !== 'string') {
      addError(errors, 'invalid_type', `files.${path}`, 'Source file content must be a string');
      continue;
    }
    files[path] = content;
  }
  return files;
}

/**
 * Loads a complete workflow from a caller-provided file map. The caller owns I/O;
 * this function only parses, validates, resolves references, and rejects files
 * outside the version 1 source-folder contract.
 */
export function loadWorkflowPackage(rawFiles: unknown): WorkflowResult<LoadedWorkflowPackage> {
  const errors: WorkflowFormatError[] = [];
  const files = sourceFilesFromUnknown(rawFiles, errors);
  if (!files) return failure(errors);
  const manifestSource = files['manifest.json'];
  if (manifestSource === undefined) {
    addError(errors, 'missing_file', 'files.manifest.json', 'Workflow package requires manifest.json');
    return failure(errors);
  }

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(manifestSource);
  } catch {
    addError(errors, 'malformed_json', 'files.manifest.json', 'manifest.json must contain valid JSON');
    return failure(errors);
  }
  const manifestResult = validateWorkflowManifest(rawManifest);
  if (!manifestResult.ok) errors.push(...manifestResult.errors);
  if (!manifestResult.ok) return failure(errors);
  const manifest = manifestResult.value;

  const expectedPaths = new Set(['manifest.json', manifest.protocol]);
  if (manifest.guide) expectedPaths.add(manifest.guide);
  if (manifest.boardPreset) expectedPaths.add(manifest.boardPreset);
  for (const template of manifest.taskTemplates) expectedPaths.add(template.file);

  for (const path of expectedPaths) {
    if (files[path] === undefined) addError(errors, 'missing_file', `files.${path}`, `Referenced file "${path}" is missing`);
  }
  for (const path of Object.keys(files)) {
    if (!expectedPaths.has(path)) addError(errors, 'unknown_file', `files.${path}`, `File "${path}" is not declared by the manifest`);
  }
  if (errors.length > 0) return failure(errors);

  const protocol: WorkflowTextFile = { path: manifest.protocol, content: files[manifest.protocol] ?? '' };
  const guide: WorkflowTextFile | undefined = manifest.guide
    ? { path: manifest.guide, content: files[manifest.guide] ?? '' }
    : undefined;
  const boardPreset = manifest.boardPreset
    ? parseBoardPreset(manifest.boardPreset, files[manifest.boardPreset] ?? '', errors)
    : undefined;
  if (boardPreset) {
    const presetRoles = new Set((boardPreset.value.columns as Array<Record<string, unknown>>).map(column => column.role));
    for (const role of manifest.requiredRoles) {
      if (!presetRoles.has(role)) addError(errors, 'missing_field', `${manifest.boardPreset}.columns`, `Board preset does not provide required role "${role}"`);
    }
  }
  const taskTemplates: LoadedWorkflowTaskTemplate[] = manifest.taskTemplates.map(template => ({
    ...template,
    content: files[template.file] ?? '',
  }));
  if (errors.length > 0) return failure(errors);

  return {
    ok: true,
    value: {
      manifest,
      protocol,
      ...(guide ? { guide } : {}),
      ...(boardPreset ? { boardPreset } : {}),
      taskTemplates,
    },
  };
}

function validateLoadedTextFile(
  raw: unknown,
  path: string,
  allowed: ReadonlySet<string>,
  errors: WorkflowFormatError[],
): WorkflowTextFile | null {
  if (!isRecord(raw)) {
    addError(errors, 'invalid_type', path, 'Loaded text file must be an object');
    return null;
  }
  checkKnownFields(raw, allowed, path, errors);
  const filePath = requiredString(raw, 'path', path, errors);
  const content = fileContent(raw, 'content', path, errors);
  return { path: filePath, content };
}

/** Validates an unknown fully loaded package and checks every manifest binding. */
export function validateWorkflowPackage(raw: unknown): WorkflowResult<LoadedWorkflowPackage> {
  const errors: WorkflowFormatError[] = [];
  if (!isRecord(raw)) {
    addError(errors, 'invalid_type', 'package', 'Loaded workflow package must be an object');
    return failure(errors);
  }
  checkKnownFields(raw, PACKAGE_FIELDS, 'package', errors);
  const manifestResult = validateWorkflowManifest(raw.manifest);
  if (!manifestResult.ok) errors.push(...manifestResult.errors);
  const protocol = validateLoadedTextFile(raw.protocol, 'package.protocol', TEXT_FILE_FIELDS, errors);
  const guide = raw.guide === undefined ? undefined : validateLoadedTextFile(raw.guide, 'package.guide', TEXT_FILE_FIELDS, errors);

  let boardPreset: WorkflowBoardPresetFile | null | undefined;
  if (raw.boardPreset !== undefined) {
    const boardFile = validateLoadedTextFile(raw.boardPreset, 'package.boardPreset', BOARD_FILE_FIELDS, errors);
    boardPreset = boardFile ? parseBoardPreset(boardFile.path, boardFile.content, errors) ?? null : null;
  }

  const taskTemplates: LoadedWorkflowTaskTemplate[] = [];
  if (!Array.isArray(raw.taskTemplates)) {
    addError(errors, raw.taskTemplates === undefined ? 'missing_field' : 'invalid_type', 'package.taskTemplates', 'Loaded taskTemplates must be an array');
  } else {
    raw.taskTemplates.forEach((item, index) => {
      const path = `package.taskTemplates[${index}]`;
      if (!isRecord(item)) {
        addError(errors, 'invalid_type', path, 'Loaded task template must be an object');
        return;
      }
      checkKnownFields(item, LOADED_TEMPLATE_FIELDS, path, errors);
      const id = requiredString(item, 'id', path, errors);
      const name = requiredString(item, 'name', path, errors);
      const description = requiredString(item, 'description', path, errors);
      const file = requiredString(item, 'file', path, errors);
      const content = fileContent(item, 'content', path, errors);
      const defaultValue = item.default;
      if (defaultValue !== undefined && typeof defaultValue !== 'boolean') {
        addError(errors, 'invalid_type', `${path}.default`, 'default must be a boolean when present');
      }
      taskTemplates.push({ id, name, description, file, content, ...(typeof defaultValue === 'boolean' ? { default: defaultValue } : {}) });
    });
  }

  if (!manifestResult.ok || !protocol) return failure(errors);
  const manifest = manifestResult.value;
  if (protocol.path !== manifest.protocol) addError(errors, 'invalid_value', 'package.protocol.path', 'Protocol path does not match the manifest');
  if (Boolean(guide) !== Boolean(manifest.guide)) addError(errors, 'missing_file', 'package.guide', 'Guide presence does not match the manifest');
  if (guide && guide.path !== manifest.guide) addError(errors, 'invalid_value', 'package.guide.path', 'Guide path does not match the manifest');
  if (Boolean(boardPreset) !== Boolean(manifest.boardPreset)) addError(errors, 'missing_file', 'package.boardPreset', 'Board preset presence does not match the manifest');
  if (boardPreset && boardPreset.path !== manifest.boardPreset) addError(errors, 'invalid_value', 'package.boardPreset.path', 'Board preset path does not match the manifest');

  if (taskTemplates.length !== manifest.taskTemplates.length) {
    addError(errors, 'missing_file', 'package.taskTemplates', 'Loaded task template count does not match the manifest');
  } else {
    manifest.taskTemplates.forEach((declared, index) => {
      const loaded = taskTemplates[index];
      if (!loaded || loaded.id !== declared.id || loaded.file !== declared.file || loaded.name !== declared.name || loaded.description !== declared.description || loaded.default !== declared.default) {
        addError(errors, 'invalid_value', `package.taskTemplates[${index}]`, 'Loaded task template metadata does not match the manifest');
      }
    });
  }

  if (errors.length > 0) return failure(errors);
  return {
    ok: true,
    value: {
      manifest,
      protocol,
      ...(guide ? { guide } : {}),
      ...(boardPreset ? { boardPreset } : {}),
      taskTemplates,
    },
  };
}
