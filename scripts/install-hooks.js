#!/usr/bin/env node
/**
 * @file Git hook installer
 * @description Points this repository's git at the versioned `.githooks/`
 * directory by setting `core.hooksPath`, and makes sure every hook in it is
 * executable. Runs automatically from the `prepare` npm lifecycle script, so a
 * fresh `pnpm install` is all a contributor needs to get the hooks.
 *
 * 📖 Why `core.hooksPath` and not husky. Hooks living in `.git/hooks` are not
 * versioned, so they drift per machine and are invisible in review. Pointing git
 * at a tracked directory gets the same result with zero dependencies, no
 * postinstall shell scripts, and hooks that show up in the diff like any other
 * file. `prepare` runs on `pnpm install` but not on `npm install kandown`, so this
 * never touches a consumer's repository.
 *
 * 📖 It is deliberately unfailable. Every branch exits 0 — no git binary, not a
 * git repo, a CI checkout, a read-only config. A doc tool must never be the reason
 * an install breaks.
 *
 * @functions
 *  → main — configure core.hooksPath and chmod the hooks
 *
 * @exports (none — lifecycle script)
 * @see .githooks/pre-commit — regenerates and stages CODEMAP.md / CODEMAP.json
 * @see .githooks/post-commit — refreshes the local graphify graph
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, chmodSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_DIR = '.githooks';

function main() {
  // Not a git checkout (tarball install, vendored copy) — nothing to do.
  if (!existsSync(join(ROOT, '.git'))) return;

  const hooksPath = join(ROOT, HOOKS_DIR);
  if (!existsSync(hooksPath)) return;

  try {
    execFileSync('git', ['config', 'core.hooksPath', HOOKS_DIR], { cwd: ROOT, stdio: 'ignore' });
  } catch {
    // No git binary, or a config we are not allowed to write. Non-fatal by design.
    return;
  }

  // 📖 git refuses to run a hook that is not executable, and the bit does not
  // always survive a clone on every platform — so re-apply it every time.
  for (const entry of readdirSync(hooksPath)) {
    const file = join(hooksPath, entry);
    try {
      if (statSync(file).isFile()) chmodSync(file, 0o755);
    } catch {
      /* ignore individual failures */
    }
  }

  console.log(`hooks: core.hooksPath → ${HOOKS_DIR}`);
}

main();
