import type { ParsedBoard, ParsedTask, Subtask, BoardTask, Column, Priority, TaskFrontmatter, OwnerType } from './types';

export function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  if (!yaml || typeof yaml !== 'string') return obj;
  yaml.split('\n').forEach(line => {
    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) return;
    const key = m[1];
    if (!key) return;
    let val: string | string[] = m[2]?.trim() ?? '';
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
  });
  return obj;
}

export function parseBoard(md: string): ParsedBoard {
  if (!md || typeof md !== 'string') {
    return { frontmatter: null, title: 'Project Kanban', columns: [] };
  }
  const lines = md.split('\n');
  const result: ParsedBoard = { frontmatter: null, title: 'Project Kanban', columns: [] };
  let i = 0;

  if (lines[0] && lines[0].trim() === '---') {
    const fmLines: string[] = [];
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') {
      fmLines.push(lines[i]);
      i++;
    }
    i++;
    result.frontmatter = parseSimpleYaml(fmLines.join('\n'));
  }

  let currentColumn: Column | null = null;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (/^#\s+/.test(line)) {
      result.title = line.replace(/^#\s+/, '').trim() || 'Project Kanban';
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      currentColumn = { name: (h2Match[1]?.trim() ?? 'Untitled'), tasks: [] };
      result.columns.push(currentColumn);
      continue;
    }

    const taskMatch = line.match(/^-\s+\[([ xX])\]\s+\*\*\[([^\]]+)\]\*\*\s+(.+)$/);
    if (taskMatch && currentColumn) {
      const checked = (taskMatch[1]?.toLowerCase() ?? '') === 'x';
      const id = (taskMatch[2]?.trim() ?? 'unknown').replace(/^(t-\d+)$/, '$1');
      const rest = taskMatch[3] ?? '';
      let title = rest;

      const arrowIdx = title.indexOf(' →');
      const backtickIdx = title.indexOf(' `');
      const parenIdx = title.search(/\s\(\d+\/\d+\)/);
      let cutAt = -1;
      [arrowIdx, backtickIdx, parenIdx].forEach(idx => {
        if (idx !== -1 && (cutAt === -1 || idx < cutAt)) cutAt = idx;
      });
      if (cutAt !== -1) title = title.slice(0, cutAt).trim();

      const tags: string[] = [];
      let assignee: string | null = null;
      let priority: Priority | null = null;
      let ownerType: OwnerType = '';

      const metaRegex = /`([^`]+)`/g;
      let m: RegExpExecArray | null;
      while ((m = metaRegex.exec(rest)) !== null) {
        const token = m[1];
        if (!token) continue;
        if (token.startsWith('@')) assignee = token.slice(1);
        else if (/^#p\d+$/i.test(token)) priority = token.slice(1).toUpperCase() as Priority;
        else if (token.startsWith('#')) tags.push(token.slice(1));
        else if (/^(human|ai)$/i.test(token)) ownerType = token.toLowerCase() as OwnerType;
      }

      const progMatch = rest.match(/\((\d+)\/(\d+)\)/);
      const progress = progMatch
        ? { done: parseInt(progMatch[1] ?? '0', 10), total: parseInt(progMatch[2] ?? '0', 10) }
        : null;

      const task: BoardTask = { id, title, checked, tags, assignee, priority, ownerType, progress };
      currentColumn.tasks.push(task);
    }
  }

  return result;
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

  const subtaskLines = subtasks.map(s => `- [${s.done ? 'x' : ' '}] ${s.text ?? ''}`);

  if (subtaskHeaderIdx === -1) {
    const trimmed = body.trimEnd();
    return trimmed + '\n\n## Subtasks\n\n' + subtaskLines.join('\n') + '\n';
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
    subtaskLines.join('\n') +
    '\n' +
    (after.length ? '\n' + after.join('\n') : '')
  );
}
