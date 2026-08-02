/**
 * @file Workflow package public API
 * @description Re-exports the pure version 1 workflow package contracts,
 * validation and source-map loader APIs, plus portable Markdown capsule import
 * and export. Consumers can depend on this entry without importing filesystem,
 * DOM, React, or Node modules.
 *
 * @exports Workflow package types, validateWorkflowManifest, validateWorkflowPackage, loadWorkflowPackage, isSafeWorkflowPath, WORKFLOW_CAPSULE_MAX_BYTES, exportWorkflowCapsule, importWorkflowCapsule
 */

export type {
  LoadedWorkflowPackage,
  LoadedWorkflowTaskTemplate,
  WorkflowAttribution,
  WorkflowBoardPresetFile,
  WorkflowBoardRole,
  WorkflowErrorCode,
  WorkflowFormatError,
  WorkflowManifest,
  WorkflowProvenance,
  WorkflowResult,
  WorkflowSourceFiles,
  WorkflowTaskTemplateManifest,
  WorkflowTextFile,
} from './types';
export {
  isSafeWorkflowPath,
  loadWorkflowPackage,
  validateWorkflowManifest,
  validateWorkflowPackage,
} from './validation';
export {
  WORKFLOW_CAPSULE_MAX_BYTES,
  exportWorkflowCapsule,
  importWorkflowCapsule,
} from './capsule';
export { loadWorkflowSkill } from './skills';
export type { WorkflowSkillManifest, LoadedWorkflowSkill } from './skills';
