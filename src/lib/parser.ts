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
import { taskTimestamp } from './task-meta';

/**
 * 📖 A small recursive YAML-subset parser. Handles flat scalars, inline arrays
 * (`[a, b]`), block scalars (`key: |`) and nested mappings (indented blocks).
 * Nested support exists so the opaque `plugins.<id>.*` extension namespace can
 * live inside task frontmatter and round-trip through `serializeTaskFile`.
 * Scalars stay strings on read; typed coercion (numbers, booleans, dates) is
 * the extension layer's job, keeping the core parser pure and regression-free.
 * See docs/EXTENSIONS.md § "The data model".
 */
export function parseSimpleYaml(yaml: string): Record<string, unknown> {
  if (!yaml || typeof yaml !== 'string') return {};
  return readMapping(yaml.split('\n'), 0, 0).value;
}

function leadingSpaces(line: string): number {
  let n = 0;
  while (line[n] === ' ') n++;
  return n;
}

function nextContentIndent(lines: string[], from: number): number | null {
  for (let i = from; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (l.trim() === '') continue;
    return leadingSpaces(l);
  }
  return null;
}

function unquoteScalar(raw: string): string {
  return raw.replace(/^["']|["']$/g, '');
}

function parseInlineArray(raw: string): string[] {
  return raw
    .slice(1, -1)
    .split(',')
    .map(s => (s && typeof s === 'string') ? s.trim().replace(/^["']|["']$/g, '') : '')
    .filter(Boolean);
}

/** 📖 Reads a `key: |` block scalar by auto-detecting the indent of its first
 *  content line (real-YAML style), so 2-space and 4-space blocks both dedent
 *  correctly and the field round-trips byte-stably. */
function readBlockScalar(lines: string[], start: number): { value: string; next: number } {
  let probe = start;
  while (probe < lines.length && (lines[probe] ?? '').trim() === '') probe++;
  if (probe >= lines.length) return { value: '', next: start };
  const indent = leadingSpaces(lines[probe] ?? '');
  if (indent <= 0) return { value: '', next: start };
  const block: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') { block.push(''); i++; continue; }
    if (leadingSpaces(line) < indent) break;
    block.push(line.slice(indent));
    i++;
  }
  while (block.length > 0 && block[block.length - 1] === '') block.pop();
  return { value: block.join('\n'), next: i };
}

/** 📖 Reads a mapping whose entries sit at column `indent`. Returns the parsed
 *  object and the index of the first line that dedented out of this mapping,
 *  so callers can resume their own loop. Nested mappings recurse. */
function readMapping(lines: string[], start: number, indent: number): { value: Record<string, unknown>; next: number } {
  const obj: Record<string, unknown> = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') { i++; continue; }
    const ind = leadingSpaces(line);
    if (ind < indent) break;              // dedented: this mapping is finished
    if (ind > indent) { i++; continue; }  // orphan deeper line, skip defensively
    const m = line.match(/^(\s*)([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[2]!;
    const rawVal = (m[3] ?? '').trim();
    if (rawVal === '|') {
      const { value, next } = readBlockScalar(lines, i + 1);
      obj[key] = value;
      i = next;
      continue;
    }
    if (rawVal === '') {
      const childIndent = nextContentIndent(lines, i + 1);
      if (childIndent !== null && childIndent > indent) {
        const { value, next } = readMapping(lines, i + 1, childIndent);
        obj[key] = value;
        i = next;
        continue;
      }
      obj[key] = '';
      i++;
      continue;
    }
    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      obj[key] = parseInlineArray(rawVal);
      i++;
      continue;
    }
    obj[key] = unquoteScalar(rawVal);
    i++;
  }
  return { value: obj, next: i };
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

  // 📖 Expose the raw frontmatter to the card so the metadata block can render
  // every key (priority, assignee, tags, due, ownerType, tools, plus any custom
  // field the user adds) without the card knowing the field list up-front.
  // Structural fields (id, title, status, order, created, archived) and the
  // heavy `report` body are dropped here so they don't pollute the metadata view.
  // 📖 `updated` joins the structural set: it is machine-written on every save
  // (src/lib/task-meta.ts), so leaving it in `metadata` would print a raw ISO
  // timestamp in the card's metadata block on every card. It is surfaced as the
  // dedicated `updatedAt` field below instead, which the TUI Age column reads.
  const { id: _id, title: _title, status: _status, order: _order, created: _created, updated: _updated, archived: _archived, report: _report, ...metadata } = frontmatter;

  return {
    id: frontmatter.id || '',
    title: frontmatter.title || frontmatter.id || 'Untitled task',
    checked: /done|termin|closed|complet/i.test(status),
    tags,
    assignee: typeof frontmatter.assignee === 'string' && frontmatter.assignee ? frontmatter.assignee : null,
    priority: normalizePriority(frontmatter.priority),
    ownerType: normalizeOwnerType(frontmatter.ownerType),
    progress: total > 0 ? { done, total } : null,
    // 📖 Effective last-activity epoch ms — `updated` when present, `created`
    // otherwise, null on a task carrying neither. Resolved once here so every
    // consumer (Age column, age sort) agrees on the same fallback chain.
    updatedAt: taskTimestamp(frontmatter),
    dependsOn: Array.isArray(frontmatter.depends_on)
      ? frontmatter.depends_on.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
      : [],
    frontmatter: metadata,
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
    // 📖 Archived tasks are hidden from the active board — they live in the
    // dedicated archive view (see extractArchivedTasks).
    .filter(task => !isArchived(task))
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

/** True when a task carries the archived flag in its frontmatter.
 * Accepts both boolean true and the string "true" because parseSimpleYaml keeps
 * scalar values as strings. String() normalizes both forms safely. */
function isArchived(task: ParsedTask): boolean {
  return String(task.frontmatter.archived) === 'true';
}

/**
 * Returns the compact board metadata for every archived task, sorted by id.
 * Used to populate the dedicated archive view (separate from the active board).
 */
export function extractArchivedTasks(tasks: ParsedTask[]): BoardTask[] {
  return [...tasks]
    .filter(task => Boolean(task.frontmatter.id) && isArchived(task))
    .sort((a, b) => a.frontmatter.id.localeCompare(b.frontmatter.id, undefined, { numeric: true }))
    .map(taskToBoardTask);
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
    const m = line.match(/^\s*-\s+\[([ xX])\]\s*(.*)$/);
    if (m && inSubtaskSection) {
      const text = m[2]?.trim() ?? '';
      subtasks.push({ done: (m[1]?.toLowerCase() ?? '') === 'x', text });
      continue;
    }
    const descMatch = line.match(/^\s*\[DESC\]\s?(.*)$/);
    if (descMatch && subtasks.length > 0) {
      const subtask = subtasks[subtasks.length - 1];
      const nextLine = descMatch[1] ?? '';
      subtask.description = subtask.description === undefined
        ? nextLine
        : `${subtask.description}\n${nextLine}`;
      continue;
    }
    const reportMatch = line.match(/^\s*\[REPORT\]\s?(.*)$/);
    if (reportMatch && subtasks.length > 0) {
      const subtask = subtasks[subtasks.length - 1];
      const nextLine = reportMatch[1] ?? '';
      subtask.report = subtask.report === undefined
        ? nextLine
        : `${subtask.report}\n${nextLine}`;
      continue;
    }
    // 📖 Legacy format (pre-canonical): `description:` / `report:` indented under a
    // subtask, before the [DESC]/[REPORT] markers were introduced. Recognizing
    // them here attaches the notes to the subtask so they survive a save — and
    // since injectSubtasks writes the canonical [DESC]/[REPORT] form, the file
    // auto-migrates on the first open+save. Only matched while inside the
    // subtask section to avoid swallowing body prose that happens to start with
    // "report:" or "description:".
    const legacyDescMatch = line.match(/^\s+description:\s*(.+)$/);
    if (legacyDescMatch && inSubtaskSection && subtasks.length > 0) {
      const subtask = subtasks[subtasks.length - 1];
      const nextLine = legacyDescMatch[1].trim();
      subtask.description = subtask.description
        ? `${subtask.description}\n${nextLine}`
        : nextLine;
      continue;
    }
    const legacyReportMatch = line.match(/^\s+report:\s*(.+)$/);
    if (legacyReportMatch && inSubtaskSection && subtasks.length > 0) {
      const subtask = subtasks[subtasks.length - 1];
      const nextLine = legacyReportMatch[1].trim();
      subtask.report = subtask.report
        ? `${subtask.report}\n${nextLine}`
        : nextLine;
      continue;
    }
    kept.push(line);
  }

  return { subtasks, bodyWithoutSubtasks: kept.join('\n') };
}

export function injectSubtasks(body: string, subtasks: Subtask[]): string {
  const safeBody = typeof body === 'string' ? body : '';
  const safeSubtasks = Array.isArray(subtasks) ? subtasks : [];
  const lines = safeBody.split('\n');
  let subtaskHeaderIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s+(subtasks?|sous[- ]t[âa]ches?|crit[èe]res?)/i.test(lines[i] ?? '')) {
      subtaskHeaderIdx = i;
      break;
    }
  }

  const detailLines = (marker: 'DESC' | 'REPORT', value: string | undefined): string[] => {
    if (typeof value !== 'string' || value.length === 0) return [];
    return value
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => `  [${marker}] ${line}`);
  };
  const subtaskLines = safeSubtasks.flatMap(subtask => [
    `- [${subtask.done ? 'x' : ' '}] ${(subtask.text ?? '').replace(/\r?\n/g, ' ')}`,
    ...detailLines('DESC', subtask.description),
    ...detailLines('REPORT', subtask.report),
  ]);

  if (subtaskHeaderIdx === -1) {
    if (subtaskLines.length === 0) return safeBody;
    const prefix = safeBody.trimEnd();
    return `${prefix ? `${prefix}\n\n` : ''}## Subtasks\n\n${subtaskLines.join('\n')}\n`;
  }

  let sectionEndIdx = subtaskHeaderIdx + 1;
  while (sectionEndIdx < lines.length && !/^#{1,6}\s+/.test(lines[sectionEndIdx] ?? '')) {
    sectionEndIdx++;
  }

  // 📖 extractSubtasks removes checklist/detail marker lines but deliberately
  // leaves unrelated prose in the section. Preserve that prose when rebuilding
  // the checklist so opening and saving a task cannot erase hand-written notes.
  const preservedSectionLines = lines
    .slice(subtaskHeaderIdx + 1, sectionEndIdx)
    .filter(line => (
      !/^\s*-\s+\[([ xX])\]\s*/.test(line) &&
      !/^\s*\[(DESC|REPORT)\]\s?/i.test(line) &&
      !/^\s+(description|report):\s*/i.test(line)
    ));
  while (preservedSectionLines[0]?.trim() === '') preservedSectionLines.shift();
  while (preservedSectionLines[preservedSectionLines.length - 1]?.trim() === '') preservedSectionLines.pop();

  const suffixLines = lines.slice(sectionEndIdx);
  while (suffixLines[0]?.trim() === '') suffixLines.shift();

  if (subtaskLines.length === 0 && preservedSectionLines.length === 0) {
    const prefix = lines.slice(0, subtaskHeaderIdx).join('\n').trimEnd();
    const suffix = suffixLines.join('\n');
    return `${prefix}${prefix && suffix ? '\n\n' : ''}${suffix}`;
  }

  const before = lines.slice(0, subtaskHeaderIdx + 1).join('\n');
  const sectionParts = subtaskLines.length > 0
    ? [subtaskLines.join('\n'), ...(preservedSectionLines.length > 0 ? [preservedSectionLines.join('\n')] : [])]
    : [preservedSectionLines.join('\n')];
  const section = sectionParts.filter(Boolean).join('\n\n');
  const suffix = suffixLines.join('\n');
  return `${before}\n\n${section}${suffix ? `\n\n${suffix}` : ''}`;
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
