/**
 * @file Home-directory pnpm workspace detection
 * @description Detects the silent footgun where a `pnpm-workspace.yaml` +
 * `package.json` (+ `node_modules`) exist at the user's home directory root,
 * making pnpm treat `~/` as the workspace root for every project below it.
 *
 * 📖 Why this matters: pnpm walks UP the directory tree and stops at the
 * FIRST `pnpm-workspace.yaml` it finds. If that file lives in `~/` (created
 * by hand, by a rogue agent, or by a leftover global-install experiment),
 * every project under the home dir inherits the home workspace root:
 * `pnpm dev` can hang while scanning the whole home graph, `pnpm install`
 * may target the wrong virtual store, and the project's own lockfile can
 * fall out of sync. The project itself looks perfectly normal, which is
 * what makes this so hard to debug.
 *
 * @functions
 *   → detectHomeWorkspace — check home dir for workspace markers, return
 *     the list of marker paths found (empty = no workspace)
 *
 * @exports detectHomeWorkspace
 * @see src/cli/commands/project.ts (cmdDoctor, where the report is printed)
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * 📖 Marker files that, combined, prove a pnpm workspace is rooted at the
 * home directory. `package.json` + `pnpm-workspace.yaml` are the pnpm
 * workspace definition; `node_modules` is the consequence. At least two of
 * the three must be present to avoid false positives (e.g. a lone stray
 * file that pnpm would simply ignore).
 */
const HOME_WORKSPACE_MARKERS = ['package.json', 'pnpm-workspace.yaml', 'node_modules'];

/**
 * Detect whether the user's home directory accidentally acts as a pnpm
 * workspace root.
 *
 * 📖 A single stray marker is not enough to call it a workspace — pnpm
 * would simply ignore a lone `package.json`. At least two of the three
 * markers must be present before this returns anything.
 *
 * @param home - Optional explicit home directory (used by tests to pin a
 *   fake home without touching the real one). Defaults to `os.homedir()`.
 * @returns Absolute paths of the workspace markers found in `home`.
 *   Empty array means no home workspace is detected.
 */
export function detectHomeWorkspace(home: string = homedir()): string[] {
  const markers = HOME_WORKSPACE_MARKERS.map((f) => join(home, f)).filter(existsSync);
  return markers.length >= 2 ? markers : [];
}
