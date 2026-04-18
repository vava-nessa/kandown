/**
 * @file Markdown parser utilities
 * @description Parses Kandown task markdown into typed structures, builds board
 * columns from task frontmatter, extracts editable subtasks, reinjects them on
 * save, and performs lightweight cached task-content search for the web UI.
 *
 * 📖 These helpers keep the markdown files as the source of truth while giving
 * React components compact, typed data that is cheap to render and search.
 *
 * @functions
 *  → parseSimpleYaml — parses the limited frontmatter shape used by Kandown
 *  → parseTaskFile — parses a task markdown file and frontmatter
 *  → taskToBoardTask — converts a parsed task into compact board metadata
 *  → buildColumnsFromTasks — groups parsed task files by configured columns
 *  → extractSubtasks — separates editable subtasks from task body content
 *  → injectSubtasks — writes edited subtasks back into the task body
 *  → searchTaskContent — returns contextual matches for cached task content
 *
 * @exports parseSimpleYaml, parseTaskFile, taskToBoardTask, buildColumnsFromTasks, extractSubtasks, injectSubtasks, searchTaskContent
 * @see src/lib/types.ts
 */

import type {
  ParsedTask,
  Subtask,
  BoardTask,
  Column,
  Priority,
  TaskFrontmatter,
  OwnerType,
  SearchMatch,
  SearchMatchSection,
  TaskContent,
} from './types';
import { DEFAULT_COLUMNS } from './types';

export function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  if (!yaml || typeof yaml !== 'string') return obj;
  const lines = yaml.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (!key) continue;
    let val: string | string[] = m[2]?.trim() ?? '';
    if (val === '|') {
      const block: string[] = [];
      i++;
      while (i < lines.length && (/^\s+/.test(lines[i] ?? '') || (lines[i] ?? '') === '')) {
        block.push((lines[i] ?? '').replace(/^  /, ''));
        i++;
      }
      i--;
      obj[key] = block.join('\n').trimEnd();
      continue;
    }
    if (typeof val !== 'string') val = '';
    if (val.startsWith('[') && val.endsWith(']')) {
      const arr = val
        .slice(1, -1)
        .split(',')
        .map(s => (s && typeof s === 'string') ? s.trim().replace(/^["']|["']$/g, '') : '')
        .filter(Boolean);
      obj[key] = arr;
    } else {
      obj[key] = (typeof val === 'string') ? val.replace(/^["']|["']$/g, '') : val;
    }
  }
  return obj;
}

export function parseTaskFile(md: string): ParsedTask {
  if (!md || typeof md !== 'string') {
    return { frontmatter: { id: '', title: '' } as TaskFrontmatter, body: '' };
  }
  const lines = md.split('\n');
  if (lines[0] && lines[0].trim() === '---') {
    const fmLines: string[] = [];
    let i = 1;
    while (i < lines.length && lines[i].trim() !== '---') {
      fmLines.push(lines[i]);
      i++;
    }
    const body = lines
      .slice(i + 1)
      .join('\n')
      .trimStart();
    const fm = parseSimpleYaml(fmLines.join('\n')) as TaskFrontmatter;
    return { frontmatter: fm, body };
  }
  return { frontmatter: { id: '', title: '' } as TaskFrontmatter, body: md };
}

function normalizeStatus(status: unknown): string {
  const value = typeof status === 'string' ? status.trim() : '';
  return value || 'Backlog';
}

function normalizePriority(priority: unknown): Priority | null {
  if (typeof priority !== 'string') return null;
  const value = priority.toUpperCase();
  return /^(P1|P2|P3|P4)$/.test(value) ? value as Priority : null;
}

function normalizeOwnerType(ownerType: unknown): OwnerType {
  if (typeof ownerType !== 'string') return '';
  const value = ownerType.toLowerCase();
  return value === 'human' || value === 'ai' ? value as OwnerType : '';
}

function taskOrder(task: ParsedTask): number {
  const value = task.frontmatter.order;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function taskToBoardTask(task: ParsedTask): BoardTask {
  const { frontmatter, body } = task;
  const { subtasks } = extractSubtasks(body);
  const done = subtasks.filter(s => s.done).length;
  const total = subtasks.length;
  const status = normalizeStatus(frontmatter.status);
  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    : [];

  return {
    id: frontmatter.id || '',
    title: frontmatter.title || frontmatter.id || 'Untitled task',
    checked: /done|termin|closed|complet/i.test(status),
    tags,
    assignee: typeof frontmatter.assignee === 'string' && frontmatter.assignee ? frontmatter.assignee : null,
    priority: normalizePriority(frontmatter.priority),
    ownerType: normalizeOwnerType(frontmatter.ownerType),
    progress: total > 0 ? { done, total } : null,
  };
}

export function buildColumnsFromTasks(tasks: ParsedTask[], configuredColumns: string[] = DEFAULT_COLUMNS): Column[] {
  const columnNames = configuredColumns.length > 0 ? configuredColumns : DEFAULT_COLUMNS;
  const columnsByName = new Map<string, Column>();
  const configured = columnNames.map(name => ({ name, tasks: [] as BoardTask[] }));
  for (const column of configured) columnsByName.set(column.name.toLowerCase(), column);
  const unknownColumns: Column[] = [];
  const sortedTasks = [...tasks]
    .filter(task => Boolean(task.frontmatter.id))
    .sort((a, b) => {
      const byOrder = taskOrder(a) - taskOrder(b);
      if (byOrder !== 0) return byOrder;
      return a.frontmatter.id.localeCompare(b.frontmatter.id, undefined, { numeric: true });
    });

  for (const task of sortedTasks) {
    const status = normalizeStatus(task.frontmatter.status);
    let column = columnsByName.get(status.toLowerCase());
    if (!column) {
      column = { name: status, tasks: [] };
      columnsByName.set(status.toLowerCase(), column);
      unknownColumns.push(column);
    }
    column.tasks.push(taskToBoardTask(task));
  }

  return [...unknownColumns, ...configured];
}

export function extractSubtasks(body: string): { subtasks: Subtask[]; bodyWithoutSubtasks: string } {
  const subtasks: Subtask[] = [];
  if (!body || typeof body !== 'string') return { subtasks, bodyWithoutSubtasks: body ?? '' };
  const lines = body.split('\n');
  const kept: string[] = [];
  let inSubtaskSection = false;

  for (const line of lines) {
    if (/^#{1,6}\s+(subtasks?|sous[- ]t[âa]ches?|crit[èe]res?)/i.test(line)) {
      inSubtaskSection = true;
      kept.push(line);
      continue;
    }
    if (/^#{1,6}\s+/.test(line) && inSubtaskSection) {
      inSubtaskSection = false;
      kept.push(line);
      continue;
    }
    const m = line.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);
    if (m && inSubtaskSection) {
      const text = m[2]?.trim() ?? '';
      subtasks.push({ done: (m[1]?.toLowerCase() ?? '') === 'x', text });
      continue;
    }
    const descMatch = line.match(/^\s*\[DESC\]\s*(.*)$/);
    if (descMatch && subtasks.length > 0) {
      subtasks[subtasks.length - 1].description = descMatch[1];
      continue;
    }
    const reportMatch = line.match(/^\s*\[REPORT\]\s*(.*)$/);
    if (reportMatch && subtasks.length > 0) {
      subtasks[subtasks.length - 1].report = reportMatch[1];
      continue;
    }
    kept.push(line);
  }

  return { subtasks, bodyWithoutSubtasks: kept.join('\n') };
}

export function injectSubtasks(body: string, subtasks: Subtask[]): string {
  if (!subtasks || subtasks.length === 0) return body ?? '';
  if (!body || typeof body !== 'string') return body ?? '';

  const lines = body.split('\n');
  let subtaskHeaderIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s+(subtasks?|sous[- ]t[âa]ches?|crit[èe]res?)/i.test(lines[i] ?? '')) {
      subtaskHeaderIdx = i;
      break;
    }
  }

  const subtaskLines = subtasks.map(s => {
    const lines: string[] = [];
    lines.push(`- [${s.done ? 'x' : ' '}] ${s.text ?? ''}`);
    if (s.description) lines.push(`  [DESC] ${s.description}`);
    if (s.report) lines.push(`  [REPORT] ${s.report}`);
    return lines.join('\n');
  });
  const combined = subtaskLines.join('\n');

  if (subtaskHeaderIdx === -1) {
    const trimmed = body.trimEnd();
    return trimmed + '\n\n## Subtasks\n\n' + combined + '\n';
  }

  const before = lines.slice(0, subtaskHeaderIdx + 1);
  let j = subtaskHeaderIdx + 1;
  while (j < lines.length && (lines[j]?.trim() ?? '') === '') j++;
  let k = j;
  while (k < lines.length && !/^#{1,6}\s+/.test(lines[k] ?? '')) k++;
  const after = lines.slice(k);
  return (
    before.join('\n') +
    '\n\n' +
    combined +
    '\n' +
    (after.length ? '\n' + after.join('\n') : '')
  );
}

export function searchTaskContent(content: TaskContent, query: string): SearchMatch[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];

  const matches: SearchMatch[] = [];
  const addMatch = (section: SearchMatchSection, value: unknown) => {
    if (typeof value !== 'string') return;
    const normalized = value.toLowerCase();
    const index = normalized.indexOf(keyword);
    if (index === -1) return;
    const start = Math.max(0, index - 32);
    const end = Math.min(value.length, index + keyword.length + 32);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < value.length ? '...' : '';
    matches.push({ section, keyword, snippet: `${prefix}${value.slice(start, end)}${suffix}` });
  };

  addMatch('title', content.frontmatter.title);
  addMatch('assignee', content.frontmatter.assignee);
  addMatch('priority', content.frontmatter.priority);
  addMatch('tags', Array.isArray(content.frontmatter.tags) ? content.frontmatter.tags.join(' ') : '');
  for (const subtask of content.subtasks) addMatch('subtasks', subtask.text);
  addMatch('context', content.body);

  return matches;
}
