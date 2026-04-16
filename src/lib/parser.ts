import type { ParsedBoard, ParsedTask, Subtask, BoardTask, Column, Priority, TaskFrontmatter } from './types';

export function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  yaml.split('\n').forEach(line => {
    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) return;
    const key = m[1];
    let val: string | string[] = m[2].trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      const arr = val
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      obj[key] = arr;
    } else {
      obj[key] = val.replace(/^["']|["']$/g, '');
    }
  });
  return obj;
}

export function parseBoard(md: string): ParsedBoard {
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

    if (/^#\s+/.test(line)) {
      result.title = line.replace(/^#\s+/, '').trim();
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      currentColumn = { name: h2Match[1].trim(), tasks: [] };
      result.columns.push(currentColumn);
      continue;
    }

    const taskMatch = line.match(/^-\s+\[([ xX])\]\s+\*\*\[([^\]]+)\]\*\*\s+(.+)$/);
    if (taskMatch && currentColumn) {
      const checked = taskMatch[1].toLowerCase() === 'x';
      const id = taskMatch[2].trim();
      const rest = taskMatch[3];
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

      const metaRegex = /`([@#][^`]+)`/g;
      let m: RegExpExecArray | null;
      while ((m = metaRegex.exec(rest)) !== null) {
        const token = m[1];
        if (token.startsWith('@')) assignee = token.slice(1);
        else if (/^#p\d+$/i.test(token)) priority = token.slice(1).toUpperCase() as Priority;
        else if (token.startsWith('#')) tags.push(token.slice(1));
      }

      const progMatch = rest.match(/\((\d+)\/(\d+)\)/);
      const progress = progMatch
        ? { done: parseInt(progMatch[1], 10), total: parseInt(progMatch[2], 10) }
        : null;

      const task: BoardTask = { id, title, checked, tags, assignee, priority, progress };
      currentColumn.tasks.push(task);
    }
  }

  return result;
}

export function parseTaskFile(md: string): ParsedTask {
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
      subtasks.push({ done: m[1].toLowerCase() === 'x', text: m[2].trim() });
      continue;
    }
    kept.push(line);
  }

  return { subtasks, bodyWithoutSubtasks: kept.join('\n') };
}

export function injectSubtasks(body: string, subtasks: Subtask[]): string {
  if (!subtasks.length) return body;

  const lines = body.split('\n');
  let subtaskHeaderIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s+(subtasks?|sous[- ]t[âa]ches?|crit[èe]res?)/i.test(lines[i])) {
      subtaskHeaderIdx = i;
      break;
    }
  }

  const subtaskLines = subtasks.map(s => `- [${s.done ? 'x' : ' '}] ${s.text}`);

  if (subtaskHeaderIdx === -1) {
    const trimmed = body.trimEnd();
    return trimmed + '\n\n## Subtasks\n\n' + subtaskLines.join('\n') + '\n';
  }

  const before = lines.slice(0, subtaskHeaderIdx + 1);
  let j = subtaskHeaderIdx + 1;
  while (j < lines.length && lines[j].trim() === '') j++;
  let k = j;
  while (k < lines.length && !/^#{1,6}\s+/.test(lines[k])) k++;
  const after = lines.slice(k);
  return (
    before.join('\n') +
    '\n\n' +
    subtaskLines.join('\n') +
    '\n' +
    (after.length ? '\n' + after.join('\n') : '')
  );
}
