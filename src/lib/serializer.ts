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
      serializeValue(k, v, lines, 0);
    }
  }
  lines.push('---');
  lines.push('');
  lines.push((body ?? '').trim());
  lines.push('');
  return lines.join('\n');
}

/**
 * 📖 Emits one frontmatter entry at the given indent. Scalars, arrays and
 * block scalars serialize exactly as before (byte-stable round-trip); object
 * values recurse as nested mappings so the opaque `plugins.<id>.*` extension
 * namespace survives an open/save cycle. Empty values are omitted, matching
 * the historical behaviour for empty strings and arrays.
 */
function serializeValue(key: string, value: unknown, lines: string[], indent: number): void {
  const pad = ' '.repeat(indent);
  if (value === null || value === undefined || value === '') return;
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    lines.push(`${pad}${key}: [${value.join(', ')}]`);
    return;
  }
  if (typeof value === 'string') {
    if (value.includes('\n')) {
      lines.push(`${pad}${key}: |`);
      // 📖 Preserve truly empty lines in YAML block scalars instead of padding
      // them with spaces, so the file stays byte-stable across round-trips.
      const childPad = ' '.repeat(indent + 2);
      for (const l of value.split('\n')) lines.push(l === '' ? '' : `${childPad}${l}`);
    } else {
      lines.push(`${pad}${key}: ${value}`);
    }
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    lines.push(`${pad}${key}: ${value}`);
    return;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (entries.length === 0) return;
    lines.push(`${pad}${key}:`);
    for (const [ck, cv] of entries) serializeValue(ck, cv, lines, indent + 2);
    return;
  }
}
