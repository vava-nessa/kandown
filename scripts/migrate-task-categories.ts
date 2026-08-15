/**
 * @file One-shot migration: legacy title brackets → frontmatter category
 * @description Moves the leading `[CATEGORY]` bracket out of task titles and
 * into the first-class `category:` frontmatter field (introduced in 0.53.0),
 * for every task file in `tasks/` and `tasks/archive/`. Uses the real
 * parser/serializer so the round-trip is byte-safe; filenames are untouched
 * because the normalized category segment is identical. Run against any
 * kandown repo whose tasks still carry bracket titles:
 *
 *   npx tsx scripts/migrate-task-categories.ts [--dry-run]
 *
 * @see src/lib/task-title-category.ts  (the canonical category read helper)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTaskFile } from '../src/lib/parser';
import { serializeTaskFile } from '../src/lib/serializer';
import { parseTaskTitle } from '../src/lib/task-title-category';

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');
const dirs = ['tasks', 'tasks/archive'];

let scanned = 0;
let changed = 0;
let already = 0;

for (const dir of dirs) {
  let names: string[] = [];
  try {
    names = readdirSync(join(root, dir)).filter((n) => n.endsWith('.md'));
  } catch {
    continue; // archive/ may not exist
  }
  for (const name of names) {
    const path = join(root, dir, name);
    const raw = readFileSync(path, 'utf8');
    const parsed = parseTaskFile(raw);
    const fm = parsed.frontmatter;
    scanned++;
    if (typeof fm.category === 'string' && fm.category.trim()) {
      already++;
      continue;
    }
    const { category, cleanTitle } = parseTaskTitle(typeof fm.title === 'string' ? fm.title : '');
    if (!category || !cleanTitle) {
      already++;
      continue;
    }
    const next = serializeTaskFile({ ...fm, title: cleanTitle, category }, parsed.body);
    if (next === raw) {
      already++;
      continue;
    }
    changed++;
    console.log(`  ${path}: [${category}] -> category: ${category}, title: "${cleanTitle}"`);
    if (!dryRun) writeFileSync(path, next);
  }
}

console.log(`\n${dryRun ? 'DRY RUN:' : 'Migrated:'} ${changed} file(s) changed, ${already} already clean, ${scanned} scanned.`);
