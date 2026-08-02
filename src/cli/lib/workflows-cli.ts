/**
 * @file Workflow package CLI and Node persistence adapter
 * @description Discovers built-in and project-local data-only workflows, exposes
 * list/show/use/validate/pack/import commands, and persists imported capsules
 * without executing package content. Board presets are previewed only; applying
 * one requires a separate explicit confirmation path.
 *
 * @functions
 *  → listWorkflowPackages: discover and validate available workflows
 *  → loadWorkflowById: load one local or built-in workflow
 *  → cmdWorkflow: dispatch workflow CLI subcommands
 *
 * @exports WorkflowPackageSummary, listWorkflowPackages, loadWorkflowById, cmdWorkflow
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  exportWorkflowCapsule,
  importWorkflowCapsule,
  loadWorkflowPackage,
  type LoadedWorkflowPackage,
  type WorkflowSourceFiles,
} from '../../lib/workflows/index.js';
import { atomicWriteFileSync } from './atomic-write.js';
import { ensureKandownDir, err, info, log, success, taskParseArgs } from './cli-shared.js';
import { loadConfig, saveConfig } from './config.js';
import { getCurrentVersion, PKG_ROOT, semverGt } from './updater.js';
import { findTaskPath, listTaskIds, readBoard, readTask } from './board-reader.js';
import { serializeTaskFile } from '../../lib/serializer.js';
import { stampUpdated } from '../../lib/task-meta.js';
import type { ColumnAgentMeta, ColumnRole } from '../../lib/types.js';
import { resolveColumnNamesByRole } from '../../lib/config.js';

export interface WorkflowPackageSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  source: 'built-in' | 'local' | 'store';
  active: boolean;
  valid: boolean;
  errors: string[];
}

export interface BoardPresetPreview {
  workflowId: string;
  currentColumns: string[];
  targetColumns: string[];
  statusMapping: Record<string, string>;
  taskMoves: Array<{ from: string; to: string; count: number }>;
  preservedColumns: string[];
}

function sourceFiles(directory: string, prefix = ''): WorkflowSourceFiles {
  const files: Record<string, string> = {};
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (statSync(absolute).isDirectory()) Object.assign(files, sourceFiles(absolute, relative));
    else files[relative] = readFileSync(absolute, 'utf8');
  }
  return files;
}

function workflowRoots(kandownDir: string): Array<{ directory: string; source: 'built-in' | 'local' }> {
  return [
    { directory: join(kandownDir, 'workflows'), source: 'local' },
    { directory: join(PKG_ROOT, 'templates', 'workflows'), source: 'built-in' },
  ];
}

function installedStoreIds(kandownDir: string): Set<string> {
  try {
    const raw = JSON.parse(readFileSync(join(kandownDir, 'workflow-installs.json'), 'utf8')) as { installs?: Record<string, unknown> };
    return new Set(Object.keys(raw.installs ?? {}));
  } catch { return new Set(); }
}

function workflowDirectory(kandownDir: string, id: string): { directory: string; source: 'built-in' | 'local' } | null {
  return workflowRoots(kandownDir)
    .map(root => ({ directory: join(root.directory, id), source: root.source }))
    .find(item => existsSync(join(item.directory, 'manifest.json'))) ?? null;
}

function packageDirectories(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(root, entry.name, 'manifest.json')))
    .map(entry => join(root, entry.name));
}

function compatibilityError(workflow: LoadedWorkflowPackage): string | null {
  const minimum = workflow.manifest.minKandownVersion;
  if (!minimum || semverGt(minimum, getCurrentVersion()) <= 0) return null;
  return `Requires Kandown ${minimum} or newer; running ${getCurrentVersion()}.`;
}

/** Lists local packages first, so a local fork shadows a built-in with the same id. */
export function listWorkflowPackages(kandownDir: string): WorkflowPackageSummary[] {
  const active = loadConfig(kandownDir).workflow.active;
  const summaries = new Map<string, WorkflowPackageSummary>();
  for (const root of workflowRoots(kandownDir)) {
    for (const directory of packageDirectories(root.directory)) {
      let rawId = basename(directory);
      let name = rawId;
      let version = 'unknown';
      let description = '';
      let valid = false;
      let errors: string[] = [];
      try {
        const result = loadWorkflowPackage(sourceFiles(directory));
        if (result.ok) {
          rawId = result.value.manifest.id;
          name = result.value.manifest.name;
          version = result.value.manifest.version;
          description = result.value.manifest.description;
          const incompatible = compatibilityError(result.value);
          valid = !incompatible;
          if (incompatible) errors = [incompatible];
        } else errors = result.errors.map(item => `${item.path}: ${item.message}`);
      } catch (error) {
        errors = [error instanceof Error ? error.message : String(error)];
      }
      const source = root.source === 'local' && installedStoreIds(kandownDir).has(rawId) ? 'store' : root.source;
      if (!summaries.has(rawId)) summaries.set(rawId, {
        id: rawId, name, version, description, source,
        active: rawId === active, valid, errors,
      });
    }
  }
  return [...summaries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Loads a local shadow or packaged built-in by id. */
export function loadWorkflowById(kandownDir: string, id: string): LoadedWorkflowPackage {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Workflow id must be kebab-case.');
  for (const root of workflowRoots(kandownDir)) {
    const directory = join(root.directory, id);
    if (!existsSync(join(directory, 'manifest.json'))) continue;
    const result = loadWorkflowPackage(sourceFiles(directory));
    if (!result.ok) throw new Error(result.errors.map(item => `${item.path}: ${item.message}`).join('; '));
    const incompatible = compatibilityError(result.value);
    if (incompatible) throw new Error(incompatible);
    return result.value;
  }
  throw new Error(`Workflow "${id}" is not installed.`);
}

export function missingWorkflowRoles(kandownDir: string, workflow: LoadedWorkflowPackage): ColumnRole[] {
  const config = loadConfig(kandownDir);
  return workflow.manifest.requiredRoles.filter(role => resolveColumnNamesByRole(config, role).length === 0);
}

/** Creates an editable local fork while retaining immutable source provenance. */
export function forkWorkflow(kandownDir: string, id: string): LoadedWorkflowPackage {
  const source = loadWorkflowById(kandownDir, id);
  const forkId = `${id}-local`;
  const fork: LoadedWorkflowPackage = {
    ...source,
    manifest: {
      ...source.manifest,
      id: forkId,
      name: `${source.manifest.name} Local`,
      version: `${source.manifest.version}+local.1`,
      provenance: {
        sourceId: source.manifest.id,
        sourceVersion: source.manifest.version,
        ...(source.manifest.provenance?.repository ? { repository: source.manifest.provenance.repository } : {}),
        ...(source.manifest.provenance?.ref ? { ref: source.manifest.provenance.ref } : {}),
        forkedAt: new Date().toISOString(),
      },
    },
  };
  writeWorkflowPackage(kandownDir, fork);
  return fork;
}

/** Updates one declared Markdown source in a local fork, then validates the whole package. */
export function updateLocalWorkflowFile(kandownDir: string, id: string, path: string, content: string): LoadedWorkflowPackage {
  const located = workflowDirectory(kandownDir, id);
  if (!located || located.source !== 'local') throw new Error('Only local workflows are editable. Fork this workflow first.');
  if (installedStoreIds(kandownDir).has(id)) throw new Error('Store workflows are immutable. Fork this workflow first.');
  const current = loadWorkflowById(kandownDir, id);
  const declared = new Set([
    current.manifest.protocol, current.manifest.guide,
    ...current.manifest.taskTemplates.map(template => template.file),
  ].filter((item): item is string => Boolean(item)));
  if (!declared.has(path) || !path.endsWith('.md') || path.includes('..')) throw new Error('File is not an editable declared Markdown source.');
  const nextFiles = { ...sourceFiles(located.directory), [path]: content };
  const validated = loadWorkflowPackage(nextFiles);
  if (!validated.ok) throw new Error(validated.errors.map(item => `${item.path}: ${item.message}`).join('; '));
  atomicWriteFileSync(join(located.directory, path), content);
  return validated.value;
}

function presetColumns(workflow: LoadedWorkflowPackage): Array<{ name: string; role: ColumnRole; instructions?: string }> {
  const columns = workflow.boardPreset?.value.columns;
  if (!Array.isArray(columns)) throw new Error('Workflow has no valid board preset columns.');
  return columns.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`board.columns[${index}] must be an object.`);
    const item = raw as Record<string, unknown>;
    if (typeof item.name !== 'string' || !item.name.trim()) throw new Error(`board.columns[${index}].name is required.`);
    const roles: ColumnRole[] = ['backlog', 'ready', 'active', 'review', 'terminal', 'custom'];
    if (!roles.includes(item.role as ColumnRole)) throw new Error(`board.columns[${index}].role is invalid.`);
    return { name: item.name.trim(), role: item.role as ColumnRole, ...(typeof item.instructions === 'string' ? { instructions: item.instructions } : {}) };
  });
}

/** Builds a no-orphan preview by preserving unmatched occupied columns. */
export function previewBoardPreset(kandownDir: string, id: string): BoardPresetPreview {
  const workflow = loadWorkflowById(kandownDir, id);
  const preset = presetColumns(workflow);
  const config = loadConfig(kandownDir);
  const board = readBoard(kandownDir);
  const counts = new Map(board.columns.map(column => [column.name, column.tasks.length]));
  const byRole = new Map(preset.map(column => [column.role, column.name]));
  const targetColumns = preset.map(column => column.name);
  const statusMapping: Record<string, string> = {};
  const preservedColumns: string[] = [];
  for (const current of config.board.columns) {
    const role = config.board.columnMeta[current]?.role ?? 'custom';
    const target = byRole.get(role) ?? (targetColumns.includes(current) ? current : undefined);
    if (target) statusMapping[current] = target;
    else if ((counts.get(current) ?? 0) > 0) {
      statusMapping[current] = current;
      targetColumns.push(current);
      preservedColumns.push(current);
    }
  }
  const taskMoves = Object.entries(statusMapping)
    .filter(([from, to]) => from !== to && (counts.get(from) ?? 0) > 0)
    .map(([from, to]) => ({ from, to, count: counts.get(from) ?? 0 }));
  return { workflowId: id, currentColumns: config.board.columns, targetColumns, statusMapping, taskMoves, preservedColumns };
}

/** Applies a previously previewable preset while preserving every task status. */
export function applyBoardPreset(kandownDir: string, id: string): BoardPresetPreview {
  const preview = previewBoardPreset(kandownDir, id);
  const preset = presetColumns(loadWorkflowById(kandownDir, id));
  for (const taskId of listTaskIds(kandownDir)) {
    const task = readTask(kandownDir, taskId);
    const from = task.frontmatter.status ?? preview.currentColumns[0];
    const to = preview.statusMapping[from] ?? from;
    if (to === from) continue;
    const path = findTaskPath(kandownDir, taskId);
    if (!path) continue;
    atomicWriteFileSync(path, serializeTaskFile(stampUpdated({ ...task.frontmatter, status: to }), task.body));
  }
  const config = loadConfig(kandownDir);
  const nextMeta: Record<string, ColumnAgentMeta> = {};
  for (const column of preset) nextMeta[column.name] = { role: column.role, ...(column.instructions ? { instructions: column.instructions } : {}) };
  for (const preserved of preview.preservedColumns) nextMeta[preserved] = config.board.columnMeta[preserved] ?? { role: 'custom' };
  config.board.columns = preview.targetColumns;
  config.board.columnMeta = nextMeta;
  saveConfig(kandownDir, config);
  return preview;
}

export function writeWorkflowPackage(kandownDir: string, workflow: LoadedWorkflowPackage): string {
  const directory = join(kandownDir, 'workflows', workflow.manifest.id);
  if (existsSync(directory)) throw new Error(`Local workflow "${workflow.manifest.id}" already exists.`);
  mkdirSync(join(directory, 'templates'), { recursive: true });
  atomicWriteFileSync(join(directory, 'manifest.json'), `${JSON.stringify(workflow.manifest, null, 2)}\n`);
  atomicWriteFileSync(join(directory, workflow.protocol.path), workflow.protocol.content);
  if (workflow.guide) atomicWriteFileSync(join(directory, workflow.guide.path), workflow.guide.content);
  if (workflow.boardPreset) atomicWriteFileSync(join(directory, workflow.boardPreset.path), workflow.boardPreset.content);
  for (const template of workflow.taskTemplates) atomicWriteFileSync(join(directory, template.file), template.content);
  return directory;
}

/** Replaces a store-installed package after an explicit validated update. */
export function replaceStoreWorkflowPackage(kandownDir: string, workflow: LoadedWorkflowPackage): string {
  if (!installedStoreIds(kandownDir).has(workflow.manifest.id)) throw new Error('Only store-installed workflows can be updated in place.');
  const directory = join(kandownDir, 'workflows', workflow.manifest.id);
  const declared = new Set(['manifest.json', workflow.protocol.path, workflow.guide?.path, workflow.boardPreset?.path, ...workflow.taskTemplates.map(item => item.file)].filter((item): item is string => Boolean(item)));
  if (existsSync(directory)) {
    for (const path of Object.keys(sourceFiles(directory))) if (!declared.has(path)) unlinkSync(join(directory, path));
  } else mkdirSync(join(directory, 'templates'), { recursive: true });
  atomicWriteFileSync(join(directory, 'manifest.json'), `${JSON.stringify(workflow.manifest, null, 2)}\n`);
  atomicWriteFileSync(join(directory, workflow.protocol.path), workflow.protocol.content);
  if (workflow.guide) atomicWriteFileSync(join(directory, workflow.guide.path), workflow.guide.content);
  if (workflow.boardPreset) atomicWriteFileSync(join(directory, workflow.boardPreset.path), workflow.boardPreset.content);
  for (const template of workflow.taskTemplates) {
    mkdirSync(join(directory, 'templates'), { recursive: true });
    atomicWriteFileSync(join(directory, template.file), template.content);
  }
  return directory;
}

/** `kandown workflow <list|show|use|validate|pack|import>` entrypoint. */
export async function cmdWorkflow(rawArgs: string[]): Promise<void> {
  const args = taskParseArgs(rawArgs);
  const sub = args.positional[0];
  const { kandownDir } = ensureKandownDir(rawArgs);
  if (!sub || sub === 'list' || sub === 'ls') {
    for (const item of listWorkflowPackages(kandownDir)) {
      log(`${item.active ? '*' : ' '} ${item.id} ${item.version} [${item.source}]${item.valid ? '' : ' INVALID'}`);
      if (!item.valid) for (const message of item.errors) log(`    ${message}`);
    }
    return;
  }
  try {
    if (sub === 'store') {
      const { fetchWorkflowRegistry } = await import('./workflows-store.js');
      const registry = await fetchWorkflowRegistry();
      if (registry.error) info(`Registry warning: ${registry.error}`);
      if (registry.entries.length === 0) { info('No approved community workflows are published yet.'); return; }
      for (const entry of registry.entries) log(`${entry.id} ${entry.version} by ${entry.author}: ${entry.description ?? entry.name}`);
      return;
    }
    if (sub === 'install') {
      const { fetchWorkflowRegistry, installStoreWorkflow } = await import('./workflows-store.js');
      const id = args.positional[1] ?? '';
      const registry = await fetchWorkflowRegistry();
      const entry = registry.entries.find(item => item.id === id);
      if (!entry) throw new Error(`Workflow ${id} is not present in the approved registry.`);
      const result = await installStoreWorkflow(kandownDir, entry);
      if (!result.ok) throw new Error(result.error ?? 'Install failed.');
      success(`Installed immutable workflow ${id}@${entry.version}.`);
      return;
    }
    if (sub === 'update') {
      const { applyWorkflowUpdate, fetchWorkflowRegistry, previewWorkflowUpdate } = await import('./workflows-store.js');
      const id = args.positional[1] ?? '';
      const registry = await fetchWorkflowRegistry();
      const entry = registry.entries.find(item => item.id === id);
      if (!entry) throw new Error(`Workflow ${id} is not present in the approved registry.`);
      const preview = await previewWorkflowUpdate(kandownDir, entry);
      log(`${preview.currentVersion} -> ${preview.nextVersion}\n\n${preview.diff}`);
      if (args.flags.confirm !== true) { info('Preview only. Re-run with --confirm to apply this validated update.'); return; }
      const result = await applyWorkflowUpdate(kandownDir, entry, true);
      if (!result.ok) throw new Error(result.error ?? 'Update failed.');
      success(`Updated ${id} to ${entry.version}.`);
      return;
    }
    if (sub === 'show') {
      const workflow = loadWorkflowById(kandownDir, args.positional[1] ?? '');
      log(`# ${workflow.manifest.name}\n\n${workflow.manifest.description}\n\nVersion: ${workflow.manifest.version}\nAuthor: ${workflow.manifest.author}\nRequired roles: ${workflow.manifest.requiredRoles.join(', ')}\nTemplates: ${workflow.taskTemplates.map(item => `${item.id}${item.default ? ' (default)' : ''}`).join(', ') || 'none'}\nAttribution: ${workflow.manifest.attribution.map(item => item.name).join(', ') || 'none'}\n\n${workflow.protocol.content}${workflow.guide ? `\n\n---\n\n${workflow.guide.content}` : ''}`);
      return;
    }
    if (sub === 'template') {
      const workflow = loadWorkflowById(kandownDir, args.positional[1] ?? '');
      const templateId = args.positional[2];
      if (!templateId) {
        for (const template of workflow.taskTemplates) log(`${template.id}${template.default ? ' *' : ''}: ${template.name} - ${template.description}`);
        return;
      }
      const template = workflow.taskTemplates.find(item => item.id === templateId);
      if (!template) throw new Error(`Template ${templateId} is not declared by ${workflow.manifest.id}.`);
      log(template.content);
      return;
    }
    if (sub === 'use') {
      const id = args.positional[1] ?? '';
      const workflow = loadWorkflowById(kandownDir, id);
      const missing = missingWorkflowRoles(kandownDir, workflow);
      if (missing.length > 0) throw new Error(`Workflow requires missing column roles: ${missing.join(', ')}.${workflow.boardPreset ? ' Preview its board preset in Settings.' : ''}`);
      const config = loadConfig(kandownDir);
      config.workflow.active = workflow.manifest.id;
      saveConfig(kandownDir, config);
      success(`Using workflow ${workflow.manifest.name}.`);
      if (workflow.boardPreset) info('This workflow includes a board preset. It was not applied automatically. Preview it in Settings.');
      return;
    }
    if (sub === 'validate' || sub === 'pack') {
      const directory = resolve(args.positional[1] ?? '');
      if (!existsSync(join(directory, 'manifest.json'))) throw new Error('Expected a workflow directory containing manifest.json.');
      const result = loadWorkflowPackage(sourceFiles(directory));
      if (!result.ok) throw new Error(result.errors.map(item => `${item.path}: ${item.message}`).join('\n'));
      if (sub === 'validate') { success(`Valid workflow ${result.value.manifest.id}@${result.value.manifest.version}.`); return; }
      const capsule = exportWorkflowCapsule(result.value);
      if (!capsule.ok) throw new Error(capsule.errors.map(item => item.message).join('; '));
      const destination = resolve(String(args.flags.output || `${result.value.manifest.id}.kandown-workflow.md`));
      atomicWriteFileSync(destination, capsule.value);
      success(`Packed ${destination}.`);
      return;
    }
    if (sub === 'import') {
      const capsulePath = resolve(args.positional[1] ?? '');
      const result = importWorkflowCapsule(readFileSync(capsulePath, 'utf8'));
      if (!result.ok) throw new Error(result.errors.map(item => `${item.path}: ${item.message}`).join('\n'));
      success(`Imported ${writeWorkflowPackage(kandownDir, result.value)}.`);
      return;
    }
    throw new Error(`Unknown workflow subcommand: ${sub}`);
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
