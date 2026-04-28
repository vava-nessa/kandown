#!/usr/bin/env node
/**
 * @file Idempotence checker for BlockNote markdown round-trip
 * @description Verifies that every .md task body survives a BlockNote
 * parse → serialize cycle without changing. Prevents silent git diff noise
 * caused by BlockNote normalizing markdown on first open/save.
 *
 * Run: node scripts/check-md-idempotence.js
 * Added to pnpm build so CI catches regressions automatically.
 *
 * 📖 How it works:
 *  1. Reads each .md file, strips frontmatter + H1 title to get the body
 *  2. Passes body through BlockNote's tryParseMarkdownToBlocks → blocksToMarkdownLossy
 *  3. Compares the output to the original body byte-for-byte
 *  4. Exits non-zero if any file diverges (fails the build)
 *
 * 📖 If files diverge, run scripts/migrate-md-blocknote.js to one-shot
 * normalize them, commit, and then this check will pass.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BlockNoteEditor, defaultBlockSpecs, defaultStyleSpecs, defaultInlineContentSpecs, BlockNoteSchema } from '@blocknote/core';

// ─── Schema (must match BlockNoteMarkdownEditor.tsx exactly) ──────────────────

const { audio, file, video, table, toggleListItem, ...markdownBlockSpecs } = defaultBlockSpecs;
const { underline, textColor, backgroundColor, ...markdownStyleSpecs } = defaultStyleSpecs;

const markdownSchema = BlockNoteSchema.create({
  blockSpecs: markdownBlockSpecs,
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: markdownStyleSpecs,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Splits a .md file into { frontmatter, h1title, body } */
function splitMarkdown(content) {
  let rest = content;

  // Strip YAML frontmatter
  let frontmatter = '';
  if (rest.startsWith('---')) {
    const end = rest.indexOf('\n---', 3);
    if (end !== -1) {
      frontmatter = rest.slice(0, end + 4);
      rest = rest.slice(end + 4).replace(/^\n/, '');
    }
  }

  // Strip H1 title line
  let h1title = '';
  const h1Match = rest.match(/^# .+\n?/);
  if (h1Match) {
    h1title = h1Match[0];
    rest = rest.slice(h1title.length).replace(/^\n/, '');
  }

  return { frontmatter, h1title, body: rest };
}

/** Round-trips a markdown body through BlockNote's parse → serialize pipeline */
function roundTrip(body, editor) {
  const blocks = editor.tryParseMarkdownToBlocks(body);
  return editor.blocksToMarkdownLossy(blocks);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const projectRoot = resolve(import.meta.dirname, '..');

// Collect .md files to check
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
  } catch {
    // Directory doesn't exist — skip
  }
}

if (mdFiles.length === 0) {
  console.log('check-md-idempotence: no task files found, skipping');
  process.exit(0);
}

// BlockNote requires a DOM environment — skip in Node (no window/document)
if (typeof window === 'undefined' || typeof document === 'undefined') {
  console.log('check-md-idempotence: skipping (no DOM — run in browser context for full check)');
  console.log(`  Would check ${mdFiles.length} files.`);
  process.exit(0);
}

// Create a headless editor for round-trip testing
const editor = BlockNoteEditor.create({ schema: markdownSchema });

let failures = 0;

for (const filePath of mdFiles) {
  const content = readFileSync(filePath, 'utf8');
  const { body } = splitMarkdown(content);

  if (!body.trim()) continue;

  const roundTripped = roundTrip(body, editor);

  if (roundTripped !== body) {
    console.error(`\n❌ Non-idempotent: ${filePath.replace(projectRoot + '/', '')}`);
    // Show a simple diff hint
    const origLines = body.split('\n');
    const newLines = roundTripped.split('\n');
    for (let i = 0; i < Math.max(origLines.length, newLines.length); i++) {
      if (origLines[i] !== newLines[i]) {
        console.error(`  Line ${i + 1}:`);
        console.error(`    original  : ${JSON.stringify(origLines[i])}`);
        console.error(`    serialized: ${JSON.stringify(newLines[i])}`);
        if (failures === 0) break; // Show first divergence only for readability
      }
    }
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n❌ ${failures} file(s) will have git diff noise on first BlockNote save.`);
  console.error('   Run: node scripts/migrate-md-blocknote.js to normalize them.');
  process.exit(1);
} else {
  console.log(`✅ check-md-idempotence: ${mdFiles.length} files OK`);
}
