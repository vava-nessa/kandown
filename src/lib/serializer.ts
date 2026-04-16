import type { Column, TaskFrontmatter } from './types';

export function serializeBoard(title: string, columns: Column[]): string {
  const lines: string[] = [];
  const colNames = columns.map(c => c.name);
  lines.push('---');
  lines.push('kanban: v1');
  lines.push(`columns: [${colNames.join(', ')}]`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${title}`);
  lines.push('');

  for (const col of columns) {
    lines.push(`## ${col.name}`);
    lines.push('');
    if (col.tasks.length === 0) {
      lines.push('');
      continue;
    }
    for (const t of col.tasks) {
      const box = t.checked ? 'x' : ' ';
      const meta: string[] = [];
      for (const tag of t.tags || []) meta.push(`\`#${tag}\``);
      if (t.priority) meta.push(`\`#${t.priority.toLowerCase()}\``);
      if (t.assignee) meta.push(`\`@${t.assignee}\``);
      const metaStr = meta.length ? ' ' + meta.join(' ') : '';
      const progStr = t.progress ? ` (${t.progress.done}/${t.progress.total})` : '';
      lines.push(`- [${box}] **[${t.id}]** ${t.title}${progStr} → [détails](tasks/${t.id}.md)${metaStr}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function serializeTaskFile(frontmatter: TaskFrontmatter, body: string): string {
  const lines: string[] = ['---'];
  for (const [k, v] of Object.entries(frontmatter)) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}: [${v.join(', ')}]`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---');
  lines.push('');
  lines.push(body.trim());
  lines.push('');
  return lines.join('\n');
}
