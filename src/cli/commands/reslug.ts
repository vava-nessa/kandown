/**
 * @file `kandown reslug` command
 * @description Renames task files so their name says what they are:
 * `tasks/t232.md` becomes `tasks/t232_remove_dead_code.md`. It exists because
 * the slug is deliberately frozen at creation (editing a title never touches
 * the filesystem), so bringing an old task, or a whole legacy project, in line
 * with the convention has to be an explicit user action.
 *
 * Two safety properties matter more than the feature itself:
 *
 *  1. **`git mv` when possible.** The entire point of descriptive filenames is
 *     readable diffs, so the rename must be recorded as a rename. A plain
 *     `fs.rename` on a tracked file shows up as a delete plus an add until git
 *     guesses the similarity, which is exactly the noise this is meant to remove.
 *  2. **`--dry-run` first.** A bulk rename of every task in a repo deserves a
 *     preview, and the preview must touch nothing at all.
 *
 * The task id never changes, which is why this is safe: `depends_on`, `[[t232]]`
 * links, deep links and branch names all reference the id in the frontmatter,
 * never the filename.
 *
 * @functions
 *  → cmdReslug — the `kandown reslug [id] [--all] [--dry-run] [--force] [--no-git]` handler
 *
 * @exports cmdReslug
 * @see src/lib/task-filename.ts — the shared slug and resolution policy
 * @see tasks/t292.md
 */

import { existsSync, renameSync, readFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { c, log, info, success, err, taskParseArgs, ensureKandownDir } from '../lib/cli-shared';
import { getTasksDir, listTaskFilenames, findTaskPath } from '../lib/board-reader';
import { parseTaskFile } from '../../lib/parser';
import type { TaskFrontmatter } from '../../lib/types';
import { buildTaskFilename, hasDescriptiveSlug, taskIdFromFilename } from '../../lib/task-filename';

interface PlannedRename {
  id: string;
  directory: string;
  from: string;
  to: string;
}

/**
 * 📖 True when `path` sits inside a git worktree **and** is tracked by it. Both
 * halves matter: `git mv` fails on an untracked file, and the project may not be
 * a repository at all.
 */
function isTrackedByGit(path: string): boolean {
  const res = spawnSync('git', ['ls-files', '--error-unmatch', '--', basename(path)], {
    cwd: dirname(path),
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  return res.status === 0;
}

/**
 * 📖 Renames one file, preferring `git mv` so history and the diff both follow.
 * Falls back to a plain rename when git is unavailable, the file is untracked,
 * or `git mv` refuses for any reason: the rename is the goal, git is the bonus.
 *
 * `--no-git` forces the plain rename. Worth having: the file content is
 * unchanged, so git detects the rename at 100% similarity when the delete and
 * the add land in the same commit anyway, and some repositories have an index
 * the user would rather not have touched mid-review.
 */
function renameFile(from: string, to: string, useGit: boolean): 'git' | 'fs' {
  if (useGit && isTrackedByGit(from)) {
    const res = spawnSync('git', ['mv', '--', basename(from), basename(to)], {
      cwd: dirname(from),
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    if (res.status === 0) return 'git';
  }
  renameSync(from, to);
  return 'fs';
}

/** 📖 The rename a single file needs, or `null` when it is already correct. */
function planFor(directory: string, filename: string): PlannedRename | null {
  const id = taskIdFromFilename(filename);
  if (!id) return null;
  let frontmatter: TaskFrontmatter | null = null;
  try {
    // 📖 The title comes from the frontmatter through the real parser, never from
    // the current filename, so re-slugging an already-slugged file re-derives it
    // from the actual source of truth. The category is read the same way (field
    // first, legacy title bracket as fallback) so the filename segment follows
    // the same source of truth as the drawer.
    frontmatter = parseTaskFile(readFileSync(join(directory, filename), 'utf8')).frontmatter;
  } catch {
    // 📖 An unreadable or malformed task file is left exactly as it is: a rename
    // is never worth risking on a file we could not parse.
    return null;
  }
  const others = listTaskFilenames(directory).filter(f => f !== filename);
  const target = buildTaskFilename(id, frontmatter.title, frontmatter.category, others);
  if (target === filename) return null;
  return { id, directory, from: filename, to: target };
}

export function cmdReslug(rawArgs: string[]): void {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const all = args.flags.all === true;
  const dryRun = args.flags['dry-run'] === true || args.flags.n === true;
  const force = args.flags.force === true;
  // 📖 The shared parser has no negation support: `--no-git` arrives as its own
  // `no-git` flag, exactly like the existing `--no-update-check`.
  const useGit = args.flags['no-git'] !== true;
  const id = args.positional[0];

  if (!id && !all) {
    err('Usage: kandown reslug <task-id> | kandown reslug --all [--dry-run] [--no-git]');
    info('Renames tasks/t232.md to tasks/t232_remove_dead_code.md. The id never changes.');
    process.exit(1);
  }

  const tasksDir = getTasksDir(kandownDir);
  const archiveDir = join(tasksDir, 'archive');
  const plans: PlannedRename[] = [];

  if (all) {
    for (const directory of [tasksDir, archiveDir]) {
      for (const filename of listTaskFilenames(directory).sort()) {
        // 📖 Without --force, a file that already carries a slug is left alone:
        // the slug is frozen, so re-deriving every one of them from a since-edited
        // title is a surprise, not a fix.
        if (!force && hasDescriptiveSlug(filename)) continue;
        const plan = planFor(directory, filename);
        if (plan) plans.push(plan);
      }
    }
  } else {
    const path = findTaskPath(kandownDir, id);
    if (!path) {
      err(`Task not found: ${id}`);
      process.exit(1);
    }
    const plan = planFor(dirname(path), basename(path));
    if (!plan) {
      info(`${id} already has the right filename: ${basename(path)}`);
      return;
    }
    plans.push(plan);
  }

  if (plans.length === 0) {
    info(all ? 'Every task filename is already descriptive.' : 'Nothing to rename.');
    return;
  }

  for (const plan of plans) {
    const label = plan.directory === archiveDir ? `${c.dim}archive/${c.reset}` : '';
    log(`  ${label}${plan.from} ${c.dim}→${c.reset} ${c.bold}${plan.to}${c.reset}`);
  }

  if (dryRun) {
    info(`Dry run: ${plans.length} file${plans.length === 1 ? '' : 's'} would be renamed, nothing was touched.`);
    return;
  }

  let renamed = 0;
  let viaGit = 0;
  for (const plan of plans) {
    const from = join(plan.directory, plan.from);
    const to = join(plan.directory, plan.to);
    if (existsSync(to)) {
      err(`Skipped ${plan.id}: ${plan.to} already exists`);
      continue;
    }
    try {
      if (renameFile(from, to, useGit) === 'git') viaGit += 1;
      renamed += 1;
    } catch (error) {
      err(`Failed to rename ${plan.from}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  success(`Renamed ${renamed} task file${renamed === 1 ? '' : 's'}${viaGit ? ` (${viaGit} via git mv)` : ''}`);
  if (renamed) {
    // 📖 Reassure the reader that nothing referencing the task just broke.
    info('Task ids are unchanged, so dependencies, links and branch names still resolve.');
  }
}

/**
 * 📖 How many active or archived task files are still bare `<id>.md`. Drives the
 * `kandown work` nudge, which offers the rename instead of performing it.
 */
export function countBareTaskFilenames(kandownDir: string): number {
  const tasksDir = getTasksDir(kandownDir);
  let bare = 0;
  for (const directory of [tasksDir, join(tasksDir, 'archive')]) {
    for (const filename of listTaskFilenames(directory)) {
      if (hasDescriptiveSlug(filename)) continue;
      // 📖 A task whose title yields no ASCII slug is correctly named already;
      // counting it would nag the user about something reslug cannot improve.
      if (planFor(directory, filename)) bare += 1;
    }
  }
  return bare;
}
