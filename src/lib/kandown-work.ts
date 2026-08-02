/**
 * @file Pure Kandown Work compiler
 * @description Compiles the immutable Kandown safety core, project column
 * semantics, extensions, workflow, tracking policy, skills, user instructions,
 * and task or board context into one deterministic agent instruction document.
 * Runtime adapters supply all files and commands, so CLI, launcher, and Settings
 * can render the exact same output without duplicating policy.
 *
 * @functions
 *  → estimateTokenCount: estimates model-neutral token usage for UI budgets
 *  → kandownWorkStats: returns characters, words, and estimated tokens
 *  → compileKandownWork: compiles the nine ordered instruction layers
 *
 * @exports KandownWorkDiagnostic, KandownWorkExtension, KandownWorkSkill, KandownWorkInput, KandownWorkStats, CompiledKandownWork, estimateTokenCount, kandownWorkStats, compileKandownWork
 */

import type { ColumnAgentMeta, TaskTrackingCadence, WorkOutputDetailMode } from './types';
import type { LoadedWorkflowPackage, WorkflowBoardRole } from './workflows';

export interface KandownWorkDiagnostic {
  code: 'missing_column_role' | 'unresolved_placeholder' | 'incompatible_skill' | 'missing_skill_role' | 'missing_skill' | 'invalid_skill';
  severity: 'warning' | 'error';
  message: string;
  role?: WorkflowBoardRole;
}

export interface KandownWorkExtension { id: string; name: string; summary: string }
export interface KandownWorkSkill {
  id: string;
  name: string;
  content: string;
  compatibleWorkflows?: string[];
  requiredRoles?: WorkflowBoardRole[];
}

export interface KandownWorkInput {
  detailMode: WorkOutputDetailMode;
  trackingCadence: TaskTrackingCadence;
  columns: Array<{ name: string; meta: ColumnAgentMeta }>;
  availableCommands: string[];
  workflow: LoadedWorkflowPackage;
  extensions?: KandownWorkExtension[];
  skills?: KandownWorkSkill[];
  globalInstructions?: string;
  projectInstructions?: string;
  context: { kind: 'task' | 'board'; markdown: string };
}

export interface CompiledKandownWork {
  markdown: string;
  diagnostics: KandownWorkDiagnostic[];
  stats: KandownWorkStats;
}

export interface KandownWorkStats {
  characters: number;
  words: number;
  estimatedTokens: number;
}

/**
 * Estimates tokens without binding Kandown to one model tokenizer. ASCII words
 * average four characters per token, non-ASCII text averages two, and visible
 * punctuation counts separately. The UI labels this value as an estimate.
 */
export function estimateTokenCount(text: string): number {
  const pieces = text.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
  return pieces.reduce((total, piece) => {
    if (/^[\p{L}\p{N}_]+$/u.test(piece)) {
      const divisor = /^[\x00-\x7F]+$/.test(piece) ? 4 : 2;
      return total + Math.max(1, Math.ceil(piece.length / divisor));
    }
    return total + 1;
  }, 0);
}

/** Returns portable size statistics for any Kandown Work source. */
export function kandownWorkStats(text: string): KandownWorkStats {
  return {
    characters: text.length,
    words: text.trim() ? text.trim().split(/\s+/u).length : 0,
    estimatedTokens: estimateTokenCount(text),
  };
}

const CORE: Record<WorkOutputDetailMode, string[]> = {
  caveman: [
    'Task Markdown is truth. Read the target task first.',
    'Respect dependencies, decisions, and out of scope.',
    'Track progress, preserve user data, and prove completion before terminal status.',
  ],
  standard: [
    'Task Markdown files are the only source of task truth.',
    'Read the targeted task before working and respect dependencies and blockers.',
    'Do not invent scope or silently change recorded decisions or out of scope.',
    'Record progress at the active cadence and preserve all user-authored data.',
    'Provide reproducible evidence before moving work to a terminal column.',
    'Use only commands listed as available in this document.',
  ],
  complete: [
    'Task Markdown files are the only source of task truth. Do not create an index, cache, or parallel task state.',
    'Read the targeted task, its acceptance criteria, dependencies, blockers, decisions, and out of scope before changing anything.',
    'Do not invent scope, silently reverse a human decision, or turn deferred work into a completion blocker.',
    'Keep the task file faithful to real progress at the active tracking cadence, including discoveries and blockers.',
    'Preserve user-authored task data and make every migration or destructive action explicit.',
    'Before terminal status, satisfy acceptance criteria and record reproducible verification evidence and a useful completion report.',
    'Use only commands listed as available in this document. Never assume a Kandown command exists.',
  ],
};

const TRACKING: Record<TaskTrackingCadence, string> = {
  live: 'Update the task checklist and reports after every meaningful step. Record blockers immediately.',
  balanced: 'Update the task after each completed subtask, phase change, blocker, or important discovery.',
  economy: 'Update the task at start, on blockers, at phase changes, and at completion.',
};

function section(title: string, body: string): string {
  return `## ${title}\n\n${body.trim()}`;
}

/** Compiles all policy layers in their fixed precedence order. */
export function compileKandownWork(input: KandownWorkInput): CompiledKandownWork {
  const diagnostics: KandownWorkDiagnostic[] = [];
  const roleNames = new Map<WorkflowBoardRole, string>();
  for (const column of input.columns) {
    if (!roleNames.has(column.meta.role)) roleNames.set(column.meta.role, column.name);
  }
  const coreRoles: WorkflowBoardRole[] = ['backlog', 'active', 'terminal'];
  for (const role of new Set([...coreRoles, ...input.workflow.manifest.requiredRoles])) {
    if (!roleNames.has(role)) diagnostics.push({
      code: 'missing_column_role', severity: 'error', role,
      message: `${coreRoles.includes(role) ? 'Kandown core' : 'Workflow'} requires a column with role "${role}".`,
    });
  }
  const compatibleSkills = (input.skills ?? []).filter(skill => {
    if (skill.compatibleWorkflows?.length && !skill.compatibleWorkflows.includes(input.workflow.manifest.id)) {
      diagnostics.push({ code: 'incompatible_skill', severity: 'warning', message: `Skill "${skill.id}" is not compatible with workflow "${input.workflow.manifest.id}".` });
      return false;
    }
    const missing = (skill.requiredRoles ?? []).find(role => !roleNames.has(role));
    if (missing) {
      diagnostics.push({ code: 'missing_skill_role', severity: 'error', role: missing, message: `Skill "${skill.id}" requires missing column role "${missing}".` });
      return false;
    }
    return true;
  });

  let protocol = input.workflow.protocol.content.replace(/\{\{trackingPolicy\}\}/g, TRACKING[input.trackingCadence]);
  protocol = protocol.replace(/\{\{column:([a-z]+)\}\}/g, (placeholder, role: WorkflowBoardRole) => {
    const name = roleNames.get(role);
    if (name) return name;
    diagnostics.push({ code: 'unresolved_placeholder', severity: 'error', role, message: `Cannot resolve ${placeholder}.` });
    return `[missing column role: ${role}]`;
  });

  const columnLines = input.columns.map(({ name, meta }) =>
    `- **${name}** (${meta.role})${meta.instructions ? `: ${meta.instructions}` : ''}`,
  );
  const commandLines = input.availableCommands.map(command => `- \`${command}\``);
  const layers = [
    section('Kandown Core', CORE[input.detailMode].map(rule => `- ${rule}`).join('\n')),
    section('Project Columns and Available Commands', `${columnLines.join('\n')}\n\nAvailable commands:\n${commandLines.join('\n') || '- None declared'}`),
  ];
  if (input.extensions?.length) layers.push(section('Active Extensions', input.extensions.map(item => `- **${item.name}** (\`${item.id}\`): ${item.summary}`).join('\n')));
  layers.push(section(`Workflow: ${input.workflow.manifest.name}`, protocol));
  layers.push(section(`Tracking Policy: ${input.trackingCadence}`, TRACKING[input.trackingCadence]));
  if (compatibleSkills.length) layers.push(section('Active Skills', compatibleSkills.map(skill => `### ${skill.name}\n\n${skill.content.trim()}`).join('\n\n')));
  if (input.globalInstructions?.trim()) layers.push(section('Global Instructions', input.globalInstructions));
  if (input.projectInstructions?.trim()) layers.push(section('Project Instructions', input.projectInstructions));
  layers.push(section(input.context.kind === 'task' ? 'Target Task Context' : 'Current Board Digest', input.context.markdown));

  const markdown = `# Kandown Work\n\n${layers.join('\n\n---\n\n')}\n`;
  return { markdown, diagnostics, stats: kandownWorkStats(markdown) };
}
