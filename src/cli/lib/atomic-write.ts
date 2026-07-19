/**
 * @file Atomic file write helper
 * @description Crash-safe file writes for the CLI: write to a sibling temp
 * file, then rename over the target. Rename is atomic on the same filesystem,
 * so a kill/crash mid-write can never leave a truncated task file or a
 * corrupted kandown.json behind (FABLE_CLI M6).
 *
 * @functions
 *  → atomicWriteFileSync — write content to path atomically
 *
 * @exports atomicWriteFileSync
 */

import { renameSync, unlinkSync, writeFileSync } from 'node:fs';

/** 📖 Write `content` to `path` via temp-file + rename so readers never see a partial file. */
export function atomicWriteFileSync(path: string, content: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, content, 'utf8');
    renameSync(tmp, path);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* nothing to clean */ }
    throw e;
  }
}
