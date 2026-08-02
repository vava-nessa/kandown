/**
 * @file Browser built-in workflow skill loader
 * @description Loads bundled data-only skill source files through Vite raw
 * imports and validates them with the same pure loader used by the Node runtime.
 *
 * @functions
 *  → listBuiltinWorkflowSkills: returns every valid bundled skill package
 *
 * @exports listBuiltinWorkflowSkills
 */

import { loadWorkflowSkill, type LoadedWorkflowSkill, type WorkflowSourceFiles } from './index';

const RAW_FILES = import.meta.glob('../../../templates/skills/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Returns every bundled skill after pure package validation. */
export function listBuiltinWorkflowSkills(): LoadedWorkflowSkill[] {
  const packages = new Map<string, Record<string, string>>();
  for (const [path, content] of Object.entries(RAW_FILES)) {
    const match = path.match(/templates\/skills\/([^/]+)\/(.+)$/);
    if (!match) continue;
    const [, id, relative] = match;
    const files = packages.get(id) ?? {};
    files[relative] = content;
    packages.set(id, files);
  }
  return [...packages.values()].flatMap(files => {
    const result = loadWorkflowSkill(files as WorkflowSourceFiles);
    return result.ok ? [result.value] : [];
  }).sort((a, b) => a.id.localeCompare(b.id));
}
