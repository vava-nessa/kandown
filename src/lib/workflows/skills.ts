/**
 * @file Data-only workflow skill packages
 * @description Validates additive Markdown skill manifests with optional
 * workflow compatibility, optional chat button metadata, and semantic
 * column-role requirements. Skills contain no runtime code and reuse the
 * workflow result and error contracts; a manifest without `chat` validates
 * exactly as one did before chat existed.
 *
 * @functions
 *  → loadWorkflowSkill: validate a manifest and its declared Markdown file
 *  → validateSkillChat: check the optional chat declaration structurally
 *
 * @exports WorkflowSkillManifest, LoadedWorkflowSkill, loadWorkflowSkill
 */

import type { WorkflowBoardRole, WorkflowFormatError, WorkflowResult, WorkflowSkillChatButton, WorkflowSkillChatResolved, WorkflowSourceFiles } from './types';

export interface WorkflowSkillManifest {
  formatVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  instructions: string;
  compatibleWorkflows?: string[];
  requiredRoles?: WorkflowBoardRole[];
  chat?: WorkflowSkillChatResolved;
}

export interface LoadedWorkflowSkill extends WorkflowSkillManifest { content: string }

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ROLES = new Set<WorkflowBoardRole>(['backlog', 'ready', 'active', 'review', 'terminal', 'custom']);
const CHAT_SCOPES = new Set<string>(['task', 'board']);
const CHAT_LABEL_MAX = 40;

function fail(errors: WorkflowFormatError[]): WorkflowResult<LoadedWorkflowSkill> { return { ok: false, errors }; }
function addError(errors: WorkflowFormatError[], code: WorkflowFormatError['code'], path: string, message: string): void { errors.push({ code, path, message }); }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 📖 Validates the optional top-level `chat` object. Every failure reuses the
 *  structured workflow error pipeline, and an absent `chat` produces no errors
 *  at all, which is what keeps older manifests fully backward compatible. On
 *  success the caller parses the same shapes into a resolved declaration with
 *  defaults applied, so the two never drift. */
function validateSkillChat(item: Record<string, unknown>, errors: WorkflowFormatError[]): void {
  const raw = item.chat;
  if (raw === undefined) return;
  if (!isRecord(raw)) { addError(errors, 'invalid_type', 'manifest.chat', 'chat must be an object'); return; }
  const chatAllowed = new Set(['button', 'scope', 'interactive', 'autoApply']);
  for (const key of Object.keys(raw)) if (!chatAllowed.has(key)) addError(errors, 'unknown_field', `manifest.chat.${key}`, `Unknown chat field "${key}"`);
  if (raw.button === undefined) addError(errors, 'missing_field', 'manifest.chat.button', 'chat.button is required');
  else if (!isRecord(raw.button)) addError(errors, 'invalid_type', 'manifest.chat.button', 'chat.button must be an object');
  else {
    const button: Record<string, unknown> = raw.button;
    const buttonAllowed = new Set(['label', 'icon']);
    for (const key of Object.keys(button)) if (!buttonAllowed.has(key)) addError(errors, 'unknown_field', `manifest.chat.button.${key}`, `Unknown chat button field "${key}"`);
    const label = button.label;
    if (label === undefined) addError(errors, 'missing_field', 'manifest.chat.button.label', 'label must be a non-empty string');
    else if (typeof label !== 'string' || !label.trim()) addError(errors, 'invalid_value', 'manifest.chat.button.label', 'label must be a non-empty string');
    else if (label.length > CHAT_LABEL_MAX) addError(errors, 'invalid_value', 'manifest.chat.button.label', `label must be at most ${CHAT_LABEL_MAX} characters`);
    const icon = button.icon;
    if (icon !== undefined && (typeof icon !== 'string' || !icon.trim())) addError(errors, 'invalid_value', 'manifest.chat.button.icon', 'icon must be a non-empty string');
  }
  const scope = raw.scope;
  if (scope === undefined) addError(errors, 'missing_field', 'manifest.chat.scope', 'scope must be "task" or "board"');
  else if (typeof scope !== 'string' || !CHAT_SCOPES.has(scope)) addError(errors, 'invalid_value', 'manifest.chat.scope', 'scope must be "task" or "board"');
  for (const flag of ['interactive', 'autoApply'] as const) {
    if (raw[flag] !== undefined && typeof raw[flag] !== 'boolean') addError(errors, 'invalid_type', `manifest.chat.${flag}`, `${flag} must be a boolean`);
  }
}

/** Parses an already validated chat declaration into its resolved shape. */
function parseSkillChat(item: Record<string, unknown>): WorkflowSkillChatResolved | undefined {
  if (!isRecord(item.chat) || !isRecord(item.chat.button)) return undefined;
  const chat = item.chat;
  const button = chat.button as WorkflowSkillChatButton;
  return {
    button: { label: button.label, ...(typeof button.icon === 'string' ? { icon: button.icon } : {}) },
    scope: chat.scope as WorkflowSkillChatResolved['scope'],
    interactive: chat.interactive === true,
    autoApply: chat.autoApply === true,
  };
}

/** Validates one source map containing manifest.json and one declared Markdown file. */
export function loadWorkflowSkill(files: WorkflowSourceFiles): WorkflowResult<LoadedWorkflowSkill> {
  const errors: WorkflowFormatError[] = [];
  let raw: unknown;
  try { raw = JSON.parse(files['manifest.json'] ?? ''); }
  catch { return fail([{ code: 'malformed_json', path: 'manifest.json', message: 'Skill manifest must contain valid JSON' }]); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail([{ code: 'invalid_type', path: 'manifest', message: 'Skill manifest must be an object' }]);
  const item = raw as Record<string, unknown>;
  const allowed = new Set(['formatVersion', 'id', 'name', 'version', 'description', 'instructions', 'compatibleWorkflows', 'requiredRoles', 'chat']);
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
  validateSkillChat(item, errors);
  const expected = new Set(['manifest.json', instructions]);
  for (const path of Object.keys(files)) if (!expected.has(path)) addError(errors, 'unknown_file', path, `Undeclared skill file "${path}"`);
  const content = files[instructions];
  if (instructions && typeof content !== 'string') addError(errors, 'missing_file', instructions, `Missing skill instructions "${instructions}"`);
  if (errors.length) return fail(errors);
  const chat = parseSkillChat(item);
  return { ok: true, value: { formatVersion: 1, id, name, version, description, instructions, ...(compatibleWorkflows ? { compatibleWorkflows } : {}), ...(requiredRoles ? { requiredRoles } : {}), ...(chat ? { chat } : {}), content } };
}
