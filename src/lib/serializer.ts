/**
 * @file Markdown serializer utilities
 * @description Converts task frontmatter/body data back into Kandown's plain
 * markdown task file format.
 *
 * 📖 Task files are the single source of truth. Board columns are derived from
 * task frontmatter and are never serialized into a separate index.
 *
 * @functions
 *  → serializeTaskFile — writes task frontmatter and body markdown
 *
 * @exports serializeTaskFile
 * @see src/lib/parser.ts
 * @see src/lib/types.ts
 */

import type { TaskFrontmatter } from './types';

export function serializeTaskFile(frontmatter: TaskFrontmatter, body: string): string {
  const lines: string[] = ['---'];
  if (frontmatter && typeof frontmatter === 'object') {
    for (const [k, v] of Object.entries(frontmatter)) {
      if (v === null || v === undefined || v === '') continue;
      if (Array.isArray(v)) {
        if (v.length === 0) continue;
        lines.push(`${k}: [${v.join(', ')}]`);
      } else if (typeof v === 'string' && v.includes('\n')) {
        lines.push(`${k}: |`);
        lines.push(...v.split('\n').map(line => `  ${line}`));
      } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        lines.push(`${k}: ${v}`);
      }
    }
  }
  lines.push('---');
  lines.push('');
  lines.push((body ?? '').trim());
  lines.push('');
  return lines.join('\n');
}
