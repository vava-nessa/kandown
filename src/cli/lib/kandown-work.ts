/**
 * @file Node adapter for the Kandown Work compiler
 * @description Loads the selected built-in or project-local workflow, user
 * instructions, active skill Markdown, task context, and board digest before
 * delegating policy rendering to the shared pure compiler.
 *
 * @functions
 *  → compileProjectKandownWork: loads project inputs and compiles exact output
 *
 * @exports compileProjectKandownWork
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { compileKandownWork } from '../../lib/kandown-work.js';
import { loadWorkflowPackage, type LoadedWorkflowPackage, type WorkflowSourceFiles } from '../../lib/workflows/index.js';
import { loadConfig } from './config.js';
import { getProjectRoot, listTaskIds, readBoard, readTask } from './board-reader.js';
import { PKG_ROOT } from './updater.js';
import { ensureAgentBootstrap, migrateAgentInstructions } from './agent-migration.js';
import { discoverExtensions } from '../../lib/extensions/loader.js';
import { loadEnabled, loadFailureState } from '../../lib/extensions/state.js';
import { loadProjectTrust } from '../../lib/extensions/trust.js';
import { isRestricted } from '../../lib/extensions/trust.js';
import { resolveDependencyStatus, terminalStatus, unresolvedDependencyIds } from '../../lib/dependencies.js';
import { loadConfiguredWorkflowSkills } from './skills.js';
import { countBareTaskFilenames } from '../commands/reslug.js';
import type { KandownConfig, ParsedTask } from '../../lib/types.js';

const AVAILABLE_COMMANDS = [
  'kandown work [task-id]', 'kandown list [--json]', 'kandown show <id>',
  'kandown create <title>', 'kandown move <id> <status>',
  'kandown assign <id> [agent]', 'kandown commit',
  'kandown reslug <id>|--all [--dry-run]',
];

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

function loadSelectedWorkflow(kandownDir: string, id: string): LoadedWorkflowPackage {
  const candidates = [join(kandownDir, 'workflows', id), join(PKG_ROOT, 'templates', 'workflows', id)];
  const directory = candidates.find(candidate => existsSync(join(candidate, 'manifest.json')));
  if (!directory) throw new Error(`Selected workflow "${id}" is not installed.`);
  const result = loadWorkflowPackage(readSourceFiles(directory));
  if (!result.ok) throw new Error(`Workflow "${id}" is invalid: ${result.errors.map(error => error.message).join('; ')}`);
  return result.value;
}

function readOptional(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  try { return readFileSync(path, 'utf8'); } catch { return undefined; }
}

function loadExtensionGuidance(kandownDir: string, config: KandownConfig) {
  const projectRoot = getProjectRoot(kandownDir);
  const enabled = loadEnabled(projectRoot);
  const trusted = loadProjectTrust(projectRoot);
  const failed = loadFailureState(projectRoot);
  return discoverExtensions(projectRoot).flatMap(item => {
    if (!item.manifestResult.ok) return [];
    const manifest = item.manifestResult.manifest;
    if (!manifest.agent?.summary || (isRestricted(config) && !enabled.has(manifest.id))) return [];
    if (item.source === 'project' && !trusted.has(manifest.id)) return [];
    if ((failed.get(manifest.id)?.failures ?? 0) >= 3) return [];
    return [{ id: manifest.id, name: manifest.name, summary: manifest.agent.summary }];
  });
}

function boardDigest(kandownDir: string, config: KandownConfig): string {
  const board = readBoard(kandownDir);
  const total = board.columns.reduce((sum, column) => sum + column.tasks.length, 0);
  const tasks = listTaskIds(kandownDir).map(id => readTask(kandownDir, id));
  const dependencyStatus = resolveDependencyStatus(tasks, config);
  const detail = config.agent.workOutput.boardDigest;
  const lines = [`Tasks total: ${total}`];
  for (const column of board.columns) {
    const header = detail.showColumnCounts ? `- **${column.name}** (${column.tasks.length})` : `- **${column.name}**`;
    if (!detail.showTasks || column.tasks.length === 0) { lines.push(`${header}: ${column.tasks.length ? 'tasks hidden' : 'empty'}`); continue; }
    const rendered = column.tasks.slice(0, 12).map(task => {
      const parsed = tasks.find(item => item.frontmatter.id === task.id);
      const resolution = dependencyStatus.get(task.id);
      const blocked = parsed ? unresolvedDependencyIds(parsed, dependencyStatus) : [];
      return [
        `${task.id} ${task.title}`,
        detail.showPriority && parsed?.frontmatter.priority ? `[${parsed.frontmatter.priority}]` : '',
        detail.showAssignee && parsed?.frontmatter.assignee ? `@${parsed.frontmatter.assignee}` : '',
        detail.showBlockedBy && blocked.length ? `(blocked by ${blocked.join(', ')})` : '',
      ].filter(Boolean).join(' ');
    });
    lines.push(`${header}: ${rendered.join(', ')}${column.tasks.length > 12 ? `, and ${column.tasks.length - 12} more` : ''}`);
  }
  if (detail.showNextActionable) {
    const terminal = terminalStatus(config).toLocaleLowerCase();
    const priority = (task: ParsedTask) => Number.parseInt(String(task.frontmatter.priority ?? 'P9').slice(1), 10) || 9;
    const next = tasks
      .filter(task => String(task.frontmatter.status ?? '').toLocaleLowerCase() !== terminal && unresolvedDependencyIds(task, dependencyStatus).length === 0)
      .sort((a, b) => {
        const aColumn = config.board.columns.indexOf(String(a.frontmatter.status ?? ''));
        const bColumn = config.board.columns.indexOf(String(b.frontmatter.status ?? ''));
        return bColumn - aColumn || priority(a) - priority(b) || String(a.frontmatter.id).localeCompare(String(b.frontmatter.id), undefined, { numeric: true });
      })[0];
    lines.push(`\nNext actionable: ${next ? `${next.frontmatter.id} ${next.frontmatter.title}` : 'none'}`);
  }
  // 📖 Descriptive filenames are opt-in for tasks that already exist, so the
  // agent is told to *offer* the rename and never to run it unprompted. Framed
  // as an instruction rather than a statistic, because a bare count in a board
  // digest reads as noise and gets ignored.
  const bare = countBareTaskFilenames(kandownDir);
  if (bare > 0) {
    lines.push(`\nFilenames: ${bare} task file${bare === 1 ? ' is' : 's are'} still named after the id alone (\`t232.md\`). Descriptive names (\`t232_remove_dead_code.md\`) make git diffs and file lists readable, and the task id does not change. Offer the user \`kandown reslug --all --dry-run\` to preview it, then \`kandown reslug --all\`. Do not rename anything without being asked.`);
  }
  return lines.join('\n');
}

/** Loads runtime inputs and returns the shared compiler's exact Markdown. */
export function compileProjectKandownWork(kandownDir: string, taskId?: string) {
  for (const event of migrateAgentInstructions(kandownDir)) {
    const output = event.severity === 'warning' ? console.warn : console.error;
    output(`[kandown] ${event.message}`);
  }
  ensureAgentBootstrap(getProjectRoot(kandownDir));
  const config = loadConfig(kandownDir);
  const workflow = loadSelectedWorkflow(kandownDir, config.workflow.active);
  const columns = config.board.columns.map(name => ({
    name,
    meta: config.board.columnMeta[name] ?? { role: 'custom' as const },
  }));
  const context = taskId
    ? { kind: 'task' as const, markdown: (() => {
        const task = readTask(kandownDir, taskId);
        return `**${task.frontmatter.id} ${task.frontmatter.title}**\n\nStatus: ${task.frontmatter.status}\nPriority: ${task.frontmatter.priority ?? 'unset'}\nDependencies: ${task.frontmatter.depends_on?.join(', ') || 'none'}\n\n${task.body.trim()}`;
      })() }
    : { kind: 'board' as const, markdown: boardDigest(kandownDir, config) };
  const configuredSkills = loadConfiguredWorkflowSkills(kandownDir, config.workflow.skills);
  const compiled = compileKandownWork({
    detailMode: config.agent.workOutput.detailMode,
    trackingCadence: config.workflow.trackingCadence,
    columns, availableCommands: AVAILABLE_COMMANDS, workflow,
    extensions: loadExtensionGuidance(kandownDir, config),
    skills: configuredSkills.skills,
    globalInstructions: readOptional(join(homedir(), '.kandown', 'kandown_work.md')),
    projectInstructions: readOptional(join(kandownDir, 'kandown_work.md')),
    context,
  });
  return { ...compiled, diagnostics: [...configuredSkills.diagnostics, ...compiled.diagnostics] };
}
