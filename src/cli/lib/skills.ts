/**
 * @file Node workflow skill discovery
 * @description Discovers immutable built-in, global, and project data-only
 * Markdown skill packages with deterministic override precedence. Legacy flat
 * Markdown skills remain readable while package validation supplies metadata,
 * compatibility, and structured diagnostics to the compiler and Settings.
 *
 * @functions
 *  → listWorkflowSkills: discover every effective skill and validation state
 *  → loadConfiguredWorkflowSkills: resolve configured ids for the compiler
 *
 * @exports WorkflowSkillSource, WorkflowSkillListing, listWorkflowSkills, loadConfiguredWorkflowSkills
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { KandownWorkDiagnostic, KandownWorkSkill } from '../../lib/kandown-work.js';
import { loadWorkflowSkill, type LoadedWorkflowSkill, type WorkflowSourceFiles } from '../../lib/workflows/index.js';
import { PKG_ROOT } from './updater.js';

export type WorkflowSkillSource = 'built-in' | 'global' | 'project';

export interface WorkflowSkillListing {
  id: string;
  name: string;
  version: string;
  description: string;
  source: WorkflowSkillSource;
  content: string;
  compatibleWorkflows?: string[];
  requiredRoles?: LoadedWorkflowSkill['requiredRoles'];
  valid: boolean;
  errors: string[];
}

function readSourceFiles(directory: string, prefix = ''): WorkflowSourceFiles {
  const files: Record<string, string> = {};
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (statSync(absolute).isDirectory()) Object.assign(files, readSourceFiles(absolute, relative));
    else files[relative] = readFileSync(absolute, 'utf8');
  }
  return files;
}

function packageListing(directory: string, source: WorkflowSkillSource): WorkflowSkillListing {
  const fallbackId = directory.split('/').at(-1) ?? 'invalid-skill';
  const result = loadWorkflowSkill(readSourceFiles(directory));
  if (!result.ok) return {
    id: fallbackId,
    name: fallbackId,
    version: '0.0.0',
    description: 'Invalid skill package',
    source,
    content: '',
    valid: false,
    errors: result.errors.map(error => `${error.path}: ${error.message}`),
  };
  return { ...result.value, source, valid: true, errors: [] };
}

/** Discovers effective skills with project overrides winning over global and built-in packages. */
export function listWorkflowSkills(kandownDir: string): WorkflowSkillListing[] {
  const found = new Map<string, WorkflowSkillListing>();
  for (const location of [
    { directory: join(PKG_ROOT, 'templates', 'skills'), source: 'built-in' as const },
    { directory: join(homedir(), '.kandown', 'skills'), source: 'global' as const },
    { directory: join(kandownDir, 'skills'), source: 'project' as const },
  ]) {
    if (!existsSync(location.directory)) continue;
    for (const name of readdirSync(location.directory).sort()) {
      const absolute = join(location.directory, name);
      if (statSync(absolute).isDirectory() && existsSync(join(absolute, 'manifest.json'))) {
        const listing = packageListing(absolute, location.source);
        found.set(listing.id, listing);
      } else if (statSync(absolute).isFile() && /^[a-z0-9-]+\.md$/.test(name)) {
        const id = name.slice(0, -3);
        found.set(id, {
          id, name: id, version: '0.0.0', description: 'Legacy Markdown skill',
          source: location.source, content: readFileSync(absolute, 'utf8'), valid: true, errors: [],
        });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Resolves configured skill ids and preserves missing or invalid packages as diagnostics. */
export function loadConfiguredWorkflowSkills(
  kandownDir: string,
  ids: string[],
): { skills: KandownWorkSkill[]; diagnostics: KandownWorkDiagnostic[] } {
  const installed = new Map(listWorkflowSkills(kandownDir).map(item => [item.id, item]));
  const skills: KandownWorkSkill[] = [];
  const diagnostics: KandownWorkDiagnostic[] = [];
  for (const id of ids) {
    const item = installed.get(id);
    if (!item) {
      diagnostics.push({ code: 'missing_skill', severity: 'warning', message: `Configured skill "${id}" is not installed.` });
      continue;
    }
    if (!item.valid) {
      diagnostics.push({ code: 'invalid_skill', severity: 'error', message: `Skill "${id}" is invalid: ${item.errors.join('; ')}` });
      continue;
    }
    skills.push({
      id: item.id,
      name: item.name,
      content: item.content,
      ...(item.compatibleWorkflows ? { compatibleWorkflows: item.compatibleWorkflows } : {}),
      ...(item.requiredRoles ? { requiredRoles: item.requiredRoles } : {}),
    });
  }
  return { skills, diagnostics };
}
