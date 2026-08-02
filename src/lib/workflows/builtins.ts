/**
 * @file Browser built-in workflow loader
 * @description Bundles the same readable templates/workflows source packages
 * shipped to the CLI and validates them with the shared pure loader for
 * standalone File System Access mode.
 *
 * @functions
 *  → listBuiltinWorkflowPackages: return every validated bundled package
 *
 * @exports listBuiltinWorkflowPackages
 */

/// <reference types="vite/client" />

import { loadWorkflowPackage } from './validation';
import type { LoadedWorkflowPackage, WorkflowSourceFiles } from './types';

const rawFiles = import.meta.glob('../../../templates/workflows/**/*', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

/** Groups Vite raw imports by workflow directory and validates every package. */
export function listBuiltinWorkflowPackages(): LoadedWorkflowPackage[] {
  const groups = new Map<string, Record<string, string>>();
  for (const [path, content] of Object.entries(rawFiles)) {
    const match = path.match(/templates\/workflows\/([^/]+)\/(.+)$/);
    if (!match) continue;
    const [, id, relative] = match;
    const files = groups.get(id) ?? {};
    files[relative] = content;
    groups.set(id, files);
  }
  return [...groups.values()].map(files => loadWorkflowPackage(files as WorkflowSourceFiles)).flatMap(result => result.ok ? [result.value] : []);
}
