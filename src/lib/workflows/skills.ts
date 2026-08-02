/**
 * @file Data-only workflow skill packages
 * @description Validates additive Markdown skill manifests with optional
 * workflow compatibility and semantic column-role requirements. Skills contain
 * no runtime code and reuse the workflow result and error contracts.
 *
 * @functions
 *  → loadWorkflowSkill: validate a manifest and its declared Markdown file
 *
 * @exports WorkflowSkillManifest, LoadedWorkflowSkill, loadWorkflowSkill
 */

import type { WorkflowBoardRole, WorkflowFormatError, WorkflowResult, WorkflowSourceFiles } from './types';

export interface WorkflowSkillManifest {
  formatVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  instructions: string;
  compatibleWorkflows?: string[];
  requiredRoles?: WorkflowBoardRole[];
}

export interface LoadedWorkflowSkill extends WorkflowSkillManifest { content: string }

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ROLES = new Set<WorkflowBoardRole>(['backlog', 'ready', 'active', 'review', 'terminal', 'custom']);

function fail(errors: WorkflowFormatError[]): WorkflowResult<LoadedWorkflowSkill> { return { ok: false, errors }; }
function addError(errors: WorkflowFormatError[], code: WorkflowFormatError['code'], path: string, message: string): void { errors.push({ code, path, message }); }

/** Validates one source map containing manifest.json and one declared Markdown file. */
export function loadWorkflowSkill(files: WorkflowSourceFiles): WorkflowResult<LoadedWorkflowSkill> {
  const errors: WorkflowFormatError[] = [];
  let raw: unknown;
  try { raw = JSON.parse(files['manifest.json'] ?? ''); }
  catch { return fail([{ code: 'malformed_json', path: 'manifest.json', message: 'Skill manifest must contain valid JSON' }]); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail([{ code: 'invalid_type', path: 'manifest', message: 'Skill manifest must be an object' }]);
  const item = raw as Record<string, unknown>;
  const allowed = new Set(['formatVersion', 'id', 'name', 'version', 'description', 'instructions', 'compatibleWorkflows', 'requiredRoles']);
  for (const key of Object.keys(item)) if (!allowed.has(key)) addError(errors, 'unknown_field', `manifest.${key}`, `Unknown skill field "${key}"`);
  const string = (key: string): string => {
    const value = item[key];
    if (typeof value !== 'string' || !value.trim()) { addError(errors, value === undefined ? 'missing_field' : 'invalid_value', `manifest.${key}`, `${key} must be a non-empty string`); return ''; }
    return value;
  };
  const id = string('id');
  const name = string('name');
  const version = string('version');
  const description = string('description');
  const instructions = string('instructions');
  if (item.formatVersion !== 1) addError(errors, 'invalid_value', 'manifest.formatVersion', 'formatVersion must be 1');
  if (id && !ID.test(id)) addError(errors, 'invalid_value', 'manifest.id', 'Skill id must be kebab-case');
  if (version && !VERSION.test(version)) addError(errors, 'invalid_value', 'manifest.version', 'Skill version must be semver-like');
  if (instructions && (!/^([a-zA-Z0-9._-]+)\.md$/.test(instructions) || instructions.includes('..'))) addError(errors, 'unsafe_path', 'manifest.instructions', 'Skill instructions must be a safe root Markdown path');
  const compatibleWorkflows = item.compatibleWorkflows === undefined ? undefined : Array.isArray(item.compatibleWorkflows) && item.compatibleWorkflows.every(value => typeof value === 'string' && ID.test(value)) ? [...new Set(item.compatibleWorkflows as string[])] : undefined;
  if (item.compatibleWorkflows !== undefined && !compatibleWorkflows) addError(errors, 'invalid_type', 'manifest.compatibleWorkflows', 'compatibleWorkflows must contain kebab-case ids');
  const requiredRoles = item.requiredRoles === undefined ? undefined : Array.isArray(item.requiredRoles) && item.requiredRoles.every(value => ROLES.has(value as WorkflowBoardRole)) ? [...new Set(item.requiredRoles as WorkflowBoardRole[])] : undefined;
  if (item.requiredRoles !== undefined && !requiredRoles) addError(errors, 'invalid_type', 'manifest.requiredRoles', 'requiredRoles contains an unknown role');
  const expected = new Set(['manifest.json', instructions]);
  for (const path of Object.keys(files)) if (!expected.has(path)) addError(errors, 'unknown_file', path, `Undeclared skill file "${path}"`);
  const content = files[instructions];
  if (instructions && typeof content !== 'string') addError(errors, 'missing_file', instructions, `Missing skill instructions "${instructions}"`);
  if (errors.length) return fail(errors);
  return { ok: true, value: { formatVersion: 1, id, name, version, description, instructions, ...(compatibleWorkflows ? { compatibleWorkflows } : {}), ...(requiredRoles ? { requiredRoles } : {}), content } };
}
