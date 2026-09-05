/**
 * @file Pure workflow package contracts
 * @description Defines Kandown's version 1 data-only workflow manifest, loaded
 * package, board-role, source-file, and typed validation result shapes. These
 * contracts intentionally import no filesystem, browser, or runtime APIs so a
 * Node loader and a browser loader can share the same validation foundation.
 *
 * @exports WorkflowBoardRole, WorkflowTaskTemplateManifest, WorkflowAttribution, WorkflowManifest, WorkflowTextFile, WorkflowBoardPresetFile, LoadedWorkflowTaskTemplate, LoadedWorkflowPackage, WorkflowSourceFiles, WorkflowSkillChatScope, WorkflowSkillChatButton, WorkflowSkillChat, WorkflowSkillChatResolved, WorkflowErrorCode, WorkflowFormatError, WorkflowResult
 */

/** Semantic roles let workflows describe intent without fixing column names. */
export type WorkflowBoardRole =
  | 'backlog'
  | 'ready'
  | 'active'
  | 'review'
  | 'terminal'
  | 'custom';

/** A Markdown task template declared by a workflow manifest. */
export interface WorkflowTaskTemplateManifest {
  id: string;
  name: string;
  description: string;
  file: string;
  default?: boolean;
}

/** Credit retained when a workflow adapts an existing method or project. */
export interface WorkflowAttribution {
  name: string;
  url: string;
  note?: string;
  license?: string;
}

/** Origin retained by immutable store installs and editable local forks. */
export interface WorkflowProvenance {
  sourceId: string;
  sourceVersion: string;
  repository?: string;
  ref?: string;
  forkedAt?: string;
}

/** The complete version 1 manifest stored in `manifest.json`. */
export interface WorkflowManifest {
  formatVersion: 1;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  summary: string;
  minKandownVersion?: string;
  requiredRoles: WorkflowBoardRole[];
  protocol: string;
  guide?: string;
  boardPreset?: string;
  taskTemplates: WorkflowTaskTemplateManifest[];
  attribution: WorkflowAttribution[];
  provenance?: WorkflowProvenance;
}

/** A referenced Markdown file after a loader has supplied its contents. */
export interface WorkflowTextFile {
  path: string;
  content: string;
}

/** A board preset retains both its readable JSON source and parsed data. */
export interface WorkflowBoardPresetFile {
  path: string;
  content: string;
  value: Readonly<Record<string, unknown>>;
}

/** A loaded task template combines manifest metadata with Markdown content. */
export interface LoadedWorkflowTaskTemplate extends WorkflowTaskTemplateManifest {
  content: string;
}

/** A fully loaded, validated workflow package with every reference resolved. */
export interface LoadedWorkflowPackage {
  manifest: WorkflowManifest;
  protocol: WorkflowTextFile;
  guide?: WorkflowTextFile;
  boardPreset?: WorkflowBoardPresetFile;
  taskTemplates: LoadedWorkflowTaskTemplate[];
}

/** Portable file map accepted by pure loaders before filesystem integration. */
export type WorkflowSourceFiles = Readonly<Record<string, string>>;

/** Where a chat skill applies: the task it was opened from, or the whole board. */
export type WorkflowSkillChatScope = 'task' | 'board';

/** Button metadata a chat UI renders to trigger the skill. */
export interface WorkflowSkillChatButton {
  /** Button text, 1 to 40 characters. */
  label: string;
  /** Free-form icon hint; the UI maps it and falls back on unknown values. */
  icon?: string;
}

/** Optional chat surface a skill manifest declares for the web chat. */
export interface WorkflowSkillChat {
  button: WorkflowSkillChatButton;
  scope: WorkflowSkillChatScope;
  /** When true the skill asks questions first and waits for answers. */
  interactive?: boolean;
  /** When true the UI may apply the skill result without extra confirmation. */
  autoApply?: boolean;
}

/** Validated chat declaration with the interactive and autoApply defaults applied. */
export interface WorkflowSkillChatResolved {
  button: WorkflowSkillChatButton;
  scope: WorkflowSkillChatScope;
  interactive: boolean;
  autoApply: boolean;
}

/** Stable machine-readable categories returned by every workflow API. */
export type WorkflowErrorCode =
  | 'invalid_type'
  | 'missing_field'
  | 'unknown_field'
  | 'invalid_value'
  | 'unsafe_path'
  | 'duplicate_id'
  | 'duplicate_default'
  | 'missing_file'
  | 'unknown_file'
  | 'malformed_json'
  | 'executable_payload'
  | 'capsule_too_large'
  | 'malformed_capsule'
  | 'duplicate_section'
  | 'unknown_section';

/** A validation failure points to the exact manifest, package, or capsule path. */
export interface WorkflowFormatError {
  code: WorkflowErrorCode;
  path: string;
  message: string;
}

/** Pure APIs report all expected input failures as values and never throw. */
export type WorkflowResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: WorkflowFormatError[] };
