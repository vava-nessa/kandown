#!/usr/bin/env node
/**
 * @file CODEMAP generator — turns JSDoc file headers into a navigable index
 * @description Walks the source tree, reads the leading JSDoc block of every file,
 * and emits two artefacts committed alongside the code: `CODEMAP.md` (an annotated
 * tree an agent or a human reads to orient themselves) and `CODEMAP.json` (the same
 * data plus `@functions` / `@exports`, for tools that want to look a symbol up
 * without grepping).
 *
 * 📖 Why this exists. Kandown already documents itself well — nearly every file
 * carries an `@file` / `@description` header. The problem was never missing
 * documentation, it was that the documentation was locked inside 144 separate
 * files with no index and no guarantee of freshness. This script aggregates it and
 * `--check` freezes it: CI and the pre-commit hook fail when the map drifts from
 * the code, so the index cannot silently rot.
 *
 * 📖 Determinism is a hard requirement. The output contains no timestamp, no
 * version and no absolute path — identical input always produces byte-identical
 * output. That is what lets `--check` compare a fresh render against the committed
 * file and treat any difference as a real drift rather than noise.
 *
 * 📖 Two rules keep the map short enough to actually be read:
 *  - Generated bundles (`bin/*.js`, `src/lib/version.ts`) are listed but never
 *    expanded, and are flagged loudly with the source they are built from. This is
 *    the map's most important job: `bin/kandown.js` is 2 500 lines of generated
 *    output that looks exactly like handwritten source, and editing it is silently
 *    undone by the next build.
 *  - The 48 i18n locale files collapse to a single line.
 *
 * @functions
 *  → walk — recursively collect source files, honouring IGNORED_DIRS
 *  → extractHeader — parse the leading JSDoc block into {file, description, functions, exports}
 *  → firstSentence — trim a description down to its first sentence, extension-safe
 *  → buildModel — assemble the ordered, path-keyed model both outputs render from
 *  → renderMarkdown — render CODEMAP.md from the model
 *  → renderJson — render CODEMAP.json from the model
 *  → main — write both files, or verify them under --check
 *
 * @exports (none — CLI entrypoint)
 * @see AGENTS.md for the read order this file sits in
 * @see docs/ARCHITECTURE.md for the prose companion to this generated map
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// � Roots to scan, in the order they appear in CODEMAP.md.
const SCAN_ROOTS = ['bin', 'src', 'scripts', 'apps'];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', 'target']);

/**
 * 📖 Files that are build output, not source. Editing them appears to work and is
 * then erased by the next `pnpm build` — which is exactly why they are called out
 * in the map instead of quietly omitted. `source` is where the real code lives.
 */
const GENERATED = {
  'bin/kandown.js': { source: 'src/cli/cli.ts', by: 'tsup' },
  'bin/tui.js': { source: 'src/cli/tui.tsx', by: 'tsup' },
  'src/lib/version.ts': { source: 'package.json', by: 'scripts/inject-version.js' },
  'apps/desktop/src/main.js': { source: 'apps/desktop/src/main.ts', by: 'tsc (apps/desktop dev/build scripts)' },
};

/**
 * 📖 Directories collapsed to one summary line. Listing 48 near-identical locale
 * files would bury everything else without telling a reader anything.
 */
const COLLAPSED = {
  'src/lib/i18n/locales': 'Translation catalogues, one JSON-like module per language. English is the source of truth; all others are translated from it.',
};

/**
 * 📖 Files exempt from the `@description` coverage requirement: generated output
 * (owned by its generator) and ambient type declarations (nothing to describe).
 */
function isExempt(relPath) {
  return relPath in GENERATED || relPath.endsWith('.d.ts');
}

/** 📖 Friendly section titles. Unlisted directories fall back to their path. */
const AREA_LABELS = {
  'bin': 'Published CLI entrypoints — GENERATED, never edit',
  'scripts': 'Build & maintenance scripts',
  'src': 'Web app root',
  'src/cli': 'CLI + terminal UI (source of the bin/ bundles)',
  'src/cli/commands': 'One-shot CLI commands',
  'src/cli/components': 'Shared Ink components',
  'src/cli/hooks': 'Ink hooks',
  'src/cli/lib': 'CLI core — daemon, server, config, board access, MCP',
  'src/cli/screens': 'Full-screen TUI views',
  'src/cli/screens/board': 'Board view internals',
  'src/components': 'Web UI components',
  'src/components/settings': 'Settings page sections',
  'src/components/ui': 'Primitive UI components',
  'src/hooks': 'Web React hooks',
  'src/lib': 'Shared core — parser, serializer, store, theme, i18n',
  'src/lib/i18n': 'Internationalisation setup',
  'src/lib/store': 'Zustand store slices',
  'src/lib/themes': 'Theme presets (one module per theme)',
  'src/types': 'Ambient type declarations',
  'apps': 'Workspace apps — each is a self-contained product surface',
  'apps/desktop': 'Tauri 2.x wrapper around the system kandown CLI (slice 1+)',
};

/** Recursively collect source files under `dir`, relative to ROOT. */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    if (IGNORED_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (SOURCE_EXTENSIONS.some(ext => entry.endsWith(ext))) out.push(abs);
  }
  return out;
}

/**
 * Trim a description to its first sentence.
 *
 * 📖 A naive split on `.` breaks on every `src/lib/parser.ts` in the text. The rule
 * used here is that a sentence ends at `.`/`!`/`?` only when the next non-space
 * character is *not* lowercase, or the string ends — so `.ts is pure` does not
 * qualify, while `.ts. The parser` and `access. 📖 Note` both do. Testing for
 * "not lowercase" rather than "uppercase" matters because these headers routinely
 * open their second sentence with the 📖 marker.
 */
function firstSentence(text) {
  const match = text.match(/^([\s\S]*?[.!?])(\s+(?![a-z])|\s*$)/);
  const sentence = (match ? match[1] : text).replace(/\s+/g, ' ').trim();
  if (sentence.length <= 240) return sentence;
  return sentence.slice(0, 237).replace(/\s+\S*$/, '') + '…';
}

/** Parse the leading JSDoc block of a file into its structured tags. */
function extractHeader(absPath) {
  const content = readFileSync(absPath, 'utf8');
  const lines = content.split('\n');
  // 📖 The header block is not always the literal first thing in the file: CLI
  // scripts open with a shebang and some components with a `"use client";`
  // directive prologue. Strip both before matching so those files are not
  // reported as undocumented.
  const prologue = /^(?:#![^\n]*\n|\s*(?:"[^"]*"|'[^']*');?\s*\n)*/;
  const block = content.replace(prologue, '').match(/^\s*\/\*\*([\s\S]*?)\*\//);
  const result = { lines: lines.length, file: null, description: null, functions: [], exports: null };
  if (!block) return result;

  // Strip the leading ` * ` decoration from every line of the block.
  const body = block[1].split('\n').map(l => l.replace(/^\s*\*\s?/, '')).join('\n');

  // Split into @tag sections, keeping everything before the first tag as preamble.
  const sections = {};
  let current = null;
  for (const line of body.split('\n')) {
    const tag = line.match(/^@(\w+)\s*(.*)$/);
    if (tag) {
      current = tag[1];
      sections[current] = sections[current] ? sections[current] + '\n' + tag[2] : tag[2];
    } else if (current) {
      sections[current] += '\n' + line;
    }
  }

  if (sections.file) result.file = sections.file.replace(/\s+/g, ' ').trim();
  if (sections.description) result.description = firstSentence(sections.description);
  if (sections.exports) {
    const value = sections.exports.replace(/\s+/g, ' ').trim();
    result.exports = /^\(none/i.test(value) ? null : value;
  }
  if (sections.functions) {
    result.functions = sections.functions
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('→'))
      .map(l => {
        const [name, ...rest] = l.slice(1).split('—');
        return { name: name.trim(), summary: rest.join('—').replace(/\s+/g, ' ').trim() || null };
      });
  }
  return result;
}

/** Assemble the ordered model that both renderers consume. */
function buildModel() {
  const files = [];
  const collapsed = [];
  const missing = [];

  for (const root of SCAN_ROOTS) {
    for (const abs of walk(join(ROOT, root))) {
      const relPath = relative(ROOT, abs).split(sep).join('/');
      const dir = dirname(relPath);

      const collapseRoot = Object.keys(COLLAPSED).find(d => dir === d || dir.startsWith(d + '/'));
      if (collapseRoot) {
        let entry = collapsed.find(c => c.dir === collapseRoot);
        if (!entry) collapsed.push((entry = { dir: collapseRoot, count: 0, lines: 0, summary: COLLAPSED[collapseRoot] }));
        entry.count += 1;
        entry.lines += readFileSync(abs, 'utf8').split('\n').length;
        continue;
      }

      const header = extractHeader(abs);
      const generatedFrom = GENERATED[relPath] || null;
      if (!header.description && !isExempt(relPath)) missing.push(relPath);

      files.push({
        path: relPath,
        dir,
        lines: header.lines,
        generatedFrom,
        title: header.file,
        summary: header.description,
        functions: generatedFrom ? [] : header.functions,
        exports: generatedFrom ? null : header.exports,
      });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  collapsed.sort((a, b) => a.dir.localeCompare(b.dir));
  missing.sort();

  // Group by directory, ordered by SCAN_ROOTS then alphabetically within each root.
  const dirs = [...new Set(files.map(f => f.dir))].sort((a, b) => {
    const rootA = SCAN_ROOTS.findIndex(r => a === r || a.startsWith(r + '/'));
    const rootB = SCAN_ROOTS.findIndex(r => b === r || b.startsWith(r + '/'));
    return rootA - rootB || a.localeCompare(b);
  });

  return { files, collapsed, missing, dirs };
}

const HEADER = `<!-- GENERATED by scripts/build-codemap.js — do not edit by hand. -->
<!-- Regenerated and staged automatically by the pre-commit hook. -->

# CODEMAP

An index of every source file in kandown, built from the JSDoc \`@description\`
header each file carries. It answers **"what is this file and where do I go next"**.

## How to use this

| You want to | Use |
|---|---|
| Find the file that owns a concern | This map — scan the summaries |
| Look up a symbol without grepping | \`CODEMAP.json\` (\`@functions\` / \`@exports\` per file) |
| Understand *why* the pieces fit together | [\`docs/ARCHITECTURE.md\`](docs/ARCHITECTURE.md) |
| Know what depends on what | \`graphify query "<question>"\` — see [\`docs/ARCHITECTURE.md\`](docs/ARCHITECTURE.md#the-dependency-graph) |
| Work on a task | \`kandown work\` |

## ⚠️ Files you must never edit

Some committed files are build output. Editing them appears to work, then the next
\`pnpm build\` erases the change. They are marked **GENERATED** below, with the real
source to edit instead.

---
`;

function renderMarkdown(model) {
  const out = [HEADER];

  for (const dir of model.dirs) {
    const label = AREA_LABELS[dir];
    out.push(`## \`${dir}/\`${label ? ` — ${label}` : ''}\n`);

    for (const file of model.files.filter(f => f.dir === dir)) {
      const name = file.path.slice(dir.length + 1);
      if (file.generatedFrom) {
        const { source, by } = file.generatedFrom;
        out.push(`- **\`${name}\`** · ${file.lines} lines · ⚠️ **GENERATED** by ${by} — edit \`${source}\` instead`);
      } else {
        out.push(`- **\`${name}\`** · ${file.lines} lines — ${file.summary || '_no @description_'}`);
      }
    }

    for (const group of model.collapsed.filter(c => c.dir === dir || dirname(c.dir) === dir)) {
      const name = group.dir === dir ? group.dir : group.dir.slice(dir.length + 1);
      out.push(`- **\`${name}/\`** · ${group.count} files · ${group.lines} lines — ${group.summary}`);
    }
    out.push('');
  }

  out.push('---\n');
  out.push('## Coverage\n');
  const eligibleFiles = model.files.filter(f => !isExempt(f.path));
  const documented = eligibleFiles.filter(f => f.summary).length;
  const eligible = eligibleFiles.length;
  out.push(`${documented} of ${eligible} eligible files carry an \`@description\` header.\n`);
  if (model.missing.length) {
    out.push('Missing a header (add one — `--check` fails on these):\n');
    for (const path of model.missing) out.push(`- \`${path}\``);
    out.push('');
  } else {
    out.push('Every eligible file is documented. `scripts/build-codemap.js --check` keeps it that way.\n');
  }

  return out.join('\n');
}

function renderJson(model) {
  return JSON.stringify(
    {
      $comment: 'GENERATED by scripts/build-codemap.js — do not edit by hand.',
      files: model.files.map(f => ({
        path: f.path,
        lines: f.lines,
        ...(f.generatedFrom ? { generated: true, source: f.generatedFrom.source, generatedBy: f.generatedFrom.by } : {}),
        ...(f.title ? { title: f.title } : {}),
        ...(f.summary ? { summary: f.summary } : {}),
        ...(f.functions.length ? { functions: f.functions } : {}),
        ...(f.exports ? { exports: f.exports } : {}),
      })),
      collapsed: model.collapsed,
      undocumented: model.missing,
    },
    null,
    2,
  ) + '\n';
}

function main() {
  const check = process.argv.includes('--check');
  const model = buildModel();

  const targets = [
    { path: join(ROOT, 'CODEMAP.md'), content: renderMarkdown(model) },
    { path: join(ROOT, 'CODEMAP.json'), content: renderJson(model) },
  ];

  if (!check) {
    for (const { path, content } of targets) writeFileSync(path, content, 'utf8');
    const summary = `codemap: ${model.files.length} files indexed`;
    if (model.missing.length) {
      console.error(`${summary} — ⚠️  ${model.missing.length} missing @description:`);
      for (const path of model.missing) console.error(`  ${path}`);
    } else {
      console.log(`${summary}, 100% documented`);
    }
    return;
  }

  const problems = [];
  for (const { path, content } of targets) {
    const name = relative(ROOT, path);
    if (!existsSync(path)) problems.push(`${name} is missing`);
    else if (readFileSync(path, 'utf8') !== content) problems.push(`${name} is out of date`);
  }
  for (const path of model.missing) problems.push(`${path} has no @description header`);

  if (problems.length) {
    console.error('✗ codemap check failed:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nRun `pnpm codemap` and commit the result.');
    process.exit(1);
  }
  console.log(`✓ codemap up to date (${model.files.length} files, 100% documented)`);
}

main();
