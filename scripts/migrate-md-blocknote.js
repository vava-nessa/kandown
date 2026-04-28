#!/usr/bin/env node
/**
 * @file One-shot migration: normalize .md task bodies for BlockNote idempotence
 * @description Reads every task .md file, passes the body through BlockNote's
 * parse → serialize pipeline, and writes back if the result differs.
 * Run this ONCE before merging the BlockNote integration, then commit the
 * result as a single isolated migration commit.
 *
 * Run: node scripts/migrate-md-blocknote.js [--dry-run]
 *
 * 📖 After running, all task bodies will be in BlockNote's canonical format.
 * Future saves from BlockNote will produce bit-identical output, so git will
 * never show diff noise for tasks the user hasn't actually edited.
 *
 * 📖 This script requires a DOM environment (window/document).
 * It is NOT wired into pnpm build — it's a one-shot tool run manually once.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── CLI ──────────────────────────────────────────────────────────────────────

const isDryRun = process.argv.includes('--dry-run');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitMarkdown(content) {
  let rest = content;
  let frontmatter = '';
  if (rest.startsWith('---')) {
    const end = rest.indexOf('\n---', 3);
    if (end !== -1) {
      frontmatter = rest.slice(0, end + 4);
      rest = rest.slice(end + 4).replace(/^\n/, '');
    }
  }
  let h1title = '';
  const h1Match = rest.match(/^# .+\n?/);
  if (h1Match) {
    h1title = h1Match[0];
    rest = rest.slice(h1title.length).replace(/^\n/, '');
  }
  return { frontmatter, h1title, body: rest };
}

function reassembleMarkdown({ frontmatter, h1title, body }) {
  const parts = [];
  if (frontmatter) parts.push(frontmatter);
  if (h1title) {
    if (parts.length) parts.push('\n');
    parts.push(h1title);
  }
  if (body) {
    if (parts.length) parts.push('\n');
    parts.push(body);
  }
  return parts.join('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const projectRoot = resolve(import.meta.dirname, '..');

const fileSets = [
  join(projectRoot, '.kandown', 'tasks'),
  join(projectRoot, 'templates', 'tasks'),
];

const mdFiles = [];
for (const dir of fileSets) {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.endsWith('.md')) mdFiles.push(join(dir, entry));
    }
  } catch { /* skip missing dirs */ }
}

if (mdFiles.length === 0) {
  console.log('migrate-md-blocknote: no task files found');
  process.exit(0);
}

if (typeof window === 'undefined' || typeof document === 'undefined') {
  console.error('migrate-md-blocknote: requires a DOM environment.');
  console.error('  This script cannot run in plain Node.js because BlockNote');
  console.error('  requires ProseMirror which depends on the DOM.');
  console.error('');
  console.error('  To run: open index.html in a browser and run this in the console,');
  console.error('  or use a DOM shim like happy-dom / jsdom with a loader.');
  process.exit(1);
}

// Dynamic import to avoid Node.js import errors at the top level
const { BlockNoteEditor, defaultBlockSpecs, defaultStyleSpecs, defaultInlineContentSpecs, BlockNoteSchema } =
  await import('@blocknote/core');

const { audio, file, video, table, toggleListItem, ...markdownBlockSpecs } = defaultBlockSpecs;
const { underline, textColor, backgroundColor, ...markdownStyleSpecs } = defaultStyleSpecs;

const markdownSchema = BlockNoteSchema.create({
  blockSpecs: markdownBlockSpecs,
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: markdownStyleSpecs,
});

const editor = BlockNoteEditor.create({ schema: markdownSchema });

let changed = 0;
let skipped = 0;

for (const filePath of mdFiles) {
  const original = readFileSync(filePath, 'utf8');
  const { frontmatter, h1title, body } = splitMarkdown(original);

  if (!body.trim()) { skipped++; continue; }

  const blocks = editor.tryParseMarkdownToBlocks(body);
  const normalizedBody = editor.blocksToMarkdownLossy(blocks);

  if (normalizedBody === body) { skipped++; continue; }

  const normalized = reassembleMarkdown({ frontmatter, h1title, body: normalizedBody });
  const relPath = filePath.replace(projectRoot + '/', '');

  if (isDryRun) {
    console.log(`  ~ ${relPath} (would update)`);
  } else {
    writeFileSync(filePath, normalized, 'utf8');
    console.log(`  ✓ ${relPath}`);
  }
  changed++;
}

console.log('');
if (isDryRun) {
  console.log(`migrate-md-blocknote (dry-run): ${changed} files would be updated, ${skipped} already idempotent`);
} else {
  console.log(`migrate-md-blocknote: ${changed} files updated, ${skipped} already idempotent`);
  if (changed > 0) {
    console.log('');
    console.log('Next step: commit these changes as a single migration commit:');
    console.log('  git add .kandown/tasks/ templates/tasks/');
    console.log('  git commit -m "chore(tasks): normalize markdown for BlockNote idempotence"');
  }
}
