/**
 * @file Kandown Project Initializer Module
 * @description Creates .kandown/ configuration, copies singlefile HTML bundle,
 * initializes project-root ./tasks/ with welcome templates, and creates AGENT_KANDOWN.md.
 */

import { existsSync, readFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from './atomic-write';
import { getTasksDir } from './board-reader';
import { PKG_ROOT } from './updater';

function copyRecursive(src: string, dest: string): string[] {
  const errors: string[] = [];
  try {
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
    const entries = readdirSync(src);
    for (const entry of entries) {
      const srcPath = join(src, entry);
      const destPath = join(dest, entry);
      try {
        if (statSync(srcPath).isDirectory()) {
          errors.push(...copyRecursive(srcPath, destPath));
        } else if (!existsSync(destPath)) {
          copyFileSync(srcPath, destPath);
        }
      } catch (error) {
        errors.push(`${entry}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    errors.push(`${src}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return errors;
}

export function syncKandownAgentDoc(kandownDir: string): boolean {
  const source = join(PKG_ROOT, 'templates', 'AGENT_KANDOWN.md');
  const target = join(kandownDir, 'AGENT_KANDOWN.md');
  if (!existsSync(source)) return false;
  try {
    const expected = readFileSync(source, 'utf8');
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (existing === null || !existing.includes('# Kandown')) {
      atomicWriteFileSync(target, expected.endsWith('\n') ? expected : `${expected}\n`);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

/**
 * 📖 Runtime state that lives inside `.kandown/` but belongs to one machine, not
 * to the repository. Without this file every project picks up a rotating set of
 * untracked leftovers (`daemon.json` changes on every launch) and, worse, is
 * tempted to commit extension trust — which the loader deliberately ignores
 * anyway, so that a cloned repo cannot grant itself execution permission.
 *
 * 📖 Written on init and never rewritten afterwards: a project that has tuned
 * its own ignore list owns it from that point on.
 */
const KANDOWN_GITIGNORE = `daemon.json
daemon.lock
.undo/

# Local extension state. Which extensions you enabled and which you trusted is a
# per-machine decision, and a committed copy is ignored at load time anyway
# (see docs/EXTENSIONS.md).
extensions/enabled.json
extensions/trust.json
`;

function writeKandownGitignore(kandownDir: string): void {
  const path = join(kandownDir, '.gitignore');
  if (existsSync(path)) return;
  try {
    atomicWriteFileSync(path, KANDOWN_GITIGNORE);
  } catch {
    // 📖 Non-fatal: a missing ignore file is untidy, never broken.
  }
}

export function doInit(kandownDir: string): boolean {
  try {
    mkdirSync(kandownDir, { recursive: true });

    const htmlSrc = join(PKG_ROOT, 'dist', 'index.html');
    const htmlDest = join(kandownDir, 'kandown.html');
    if (existsSync(htmlSrc)) {
      copyFileSync(htmlSrc, htmlDest);
    }

    syncKandownAgentDoc(kandownDir);
    writeKandownGitignore(kandownDir);

    const templatesDir = join(PKG_ROOT, 'templates');
    if (existsSync(templatesDir)) {
      if (!existsSync(join(kandownDir, 'README.md')) && existsSync(join(templatesDir, 'README.md'))) {
        copyFileSync(join(templatesDir, 'README.md'), join(kandownDir, 'README.md'));
      }

      if (!existsSync(join(kandownDir, 'AGENT.md')) && existsSync(join(templatesDir, 'AGENT.md'))) {
        copyFileSync(join(templatesDir, 'AGENT.md'), join(kandownDir, 'AGENT.md'));
      }

      const tasksSrc = join(templatesDir, 'tasks');
      const tasksDest = getTasksDir(kandownDir);
      if (!existsSync(tasksDest) && existsSync(tasksSrc)) {
        copyRecursive(tasksSrc, tasksDest);
      }

      if (!existsSync(join(kandownDir, 'kandown.json')) && existsSync(join(templatesDir, 'kandown.json'))) {
        copyFileSync(join(templatesDir, 'kandown.json'), join(kandownDir, 'kandown.json'));
      }

      // 📖 agents.json: the committed team agent catalog (aliases + extra args +
      // cascade prefs). Seeded from the template so a fresh project shares the
      // same launch commands as the rest of the team. Not overwritten if it
      // already exists (idempotent re-init).
      if (!existsSync(join(kandownDir, 'agents.json')) && existsSync(join(templatesDir, 'agents.json'))) {
        copyFileSync(join(templatesDir, 'agents.json'), join(kandownDir, 'agents.json'));
      }
    }
    return true;
  } catch (error) {
    console.error(`Init failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
