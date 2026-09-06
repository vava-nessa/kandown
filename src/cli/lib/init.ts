/**
 * @file Kandown Project Initializer Module
 * @description Creates .kandown/ configuration, copies singlefile HTML bundle,
 * initializes project-root ./tasks/ with welcome templates, seeds the committed
 * agent catalog (`.kandown/agents.json`), and installs the managed
 * `kandown work` bootstrap line without generated instruction copies.
 *
 * @functions
 *  → doInit: create/refresh `.kandown/` for a project (idempotent)
 *
 * @see src/cli/lib/agents-config.ts - the agent catalog written on init
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from './atomic-write';
import { getTasksDir } from './board-reader';
import { PKG_ROOT } from './updater';
import { ensureAgentBootstrap, migrateAgentInstructions } from './agent-migration';
import { defaultAgentsConfig, saveAgentsConfig } from './agents-config';

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

/**
 * 📖 Runtime state that lives inside `.kandown/` but belongs to one machine, not
 * to the repository. Without this file every project picks up a rotating set of
 * untracked leftovers (`daemon.json` changes on every launch) and, worse, is
 * tempted to commit extension trust, which the loader deliberately ignores
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

/**
 * 📖 Seeds `.kandown/agents.json`, the committed team agent catalog (binaries,
 * aliases, per-agent extra args, cascade prefs) that `kandown init` leaves for
 * the project to commit.
 *
 * 📖 Generated from `defaultAgentsConfig()` rather than copied from a template
 * file on purpose: the built-in registry in `agents.ts` is the single source of
 * truth for which agents kandown knows about, and a hand-maintained
 * `templates/agents.json` silently rotted behind it (it still listed 8 agents
 * when the registry had 23). Writing it from code means a fresh project always
 * gets the current catalog.
 *
 * 📖 Never overwritten: re-running `init` on a project that already tuned its
 * catalog must be a no-op. Non-fatal on failure, the merged catalog falls back
 * to the built-ins when the file is missing.
 */
function writeAgentsCatalog(kandownDir: string): void {
  const path = join(kandownDir, 'agents.json');
  if (existsSync(path)) return;
  try {
    saveAgentsConfig(kandownDir, defaultAgentsConfig());
  } catch {
    // 📖 Non-fatal: without the file, loadCatalog serves the built-in defaults.
  }
}

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

    migrateAgentInstructions(kandownDir);
    ensureAgentBootstrap(join(kandownDir, '..'));
    writeKandownGitignore(kandownDir);

    const templatesDir = join(PKG_ROOT, 'templates');
    if (existsSync(templatesDir)) {
      if (!existsSync(join(kandownDir, 'README.md')) && existsSync(join(templatesDir, 'README.md'))) {
        copyFileSync(join(templatesDir, 'README.md'), join(kandownDir, 'README.md'));
      }

      const tasksSrc = join(templatesDir, 'tasks');
      const tasksDest = getTasksDir(kandownDir);
      if (!existsSync(tasksDest) && existsSync(tasksSrc)) {
        copyRecursive(tasksSrc, tasksDest);
      }

      if (!existsSync(join(kandownDir, 'kandown.json')) && existsSync(join(templatesDir, 'kandown.json'))) {
        copyFileSync(join(templatesDir, 'kandown.json'), join(kandownDir, 'kandown.json'));
      }
    }

    writeAgentsCatalog(kandownDir);
    return true;
  } catch (error) {
    console.error(`Init failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
