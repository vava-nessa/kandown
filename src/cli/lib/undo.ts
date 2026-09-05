/**
 * @file Read-only reader for the undo journal
 * @description Exposes the contents of `.kandown/.undo/log.json` to callers
 * that must LOOK at the journal without owning its writes. The journal is
 * written by `pushUndo` (private) and consumed by `undoLastAction`, both in
 * `board-reader.ts`; this module deliberately lives beside it instead of
 * inside it so the write path keeps a single owner, while any reader (the
 * `kandown undo` command today, a future MCP or TUI surface tomorrow) can
 * answer "what would the next undo revert?" BEFORE performing it.
 *
 * 📖 Why this exists at all: the journal is the safety net for Yolo-mode agent
 * runs. A `move` written by a scripted agent must be reversible without git
 * (`.kandown/` is git-ignored by `kandown init`), and an undo can only be
 * trusted if the caller can show what it is about to revert first.
 *
 * 📖 The on-disk format is the shared contract, not an exported type:
 * `pushUndo` stores entries newest-first (`unshift`), caps the list at 50 and
 * swallows its own failures. This reader mirrors that shape with its own
 * narrowing guards rather than importing the private type, and treats a
 * missing, unreadable or corrupted file as an empty journal: a broken safety
 * net must stay silent, exactly like the writer it mirrors. The log file
 * itself remains the single source of truth; no index, no cache.
 *
 * @functions
 *  → isUndoRecord: narrowing guard for one journal entry
 *  → listUndoRecords: the validated journal, most recent entry first
 *
 * @exports UndoRecord, listUndoRecords
 * @see src/cli/lib/board-reader.ts: the only writer of the journal
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 📖 One entry of the undo journal, mirroring the private shape `pushUndo`
 * writes in board-reader.ts. `previousContent` is `null` for a `create`
 * (there was no file before), `newContent` is `null` for a `delete` (there is
 * no file after); `undoLastAction` branches on exactly those nulls.
 */
export interface UndoRecord {
  type: 'move' | 'create' | 'delete' | 'archive';
  taskId: string;
  path: string;
  previousContent: string | null;
  newContent: string | null;
  timestamp: number;
}

/** 📖 True for `string | null`, the shape of both content fields. */
function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

/**
 * 📖 Narrowing guard for one journal entry. Every field is checked because the
 * file is hand-editable and written by concurrent processes: a truncated or
 * partially written entry must be skipped by the reader, never crash it.
 */
function isUndoRecord(value: unknown): value is UndoRecord {
  if (typeof value !== 'object' || value === null) return false;
  // 📖 Safe: the typeof check above already excluded null and primitives.
  const record = value as Record<string, unknown>;
  const { type, taskId, path, previousContent, newContent, timestamp } = record;
  if (type !== 'move' && type !== 'create' && type !== 'delete' && type !== 'archive') return false;
  if (typeof taskId !== 'string' || taskId.length === 0) return false;
  if (typeof path !== 'string' || path.length === 0) return false;
  if (!isStringOrNull(previousContent) || !isStringOrNull(newContent)) return false;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return false;
  return true;
}

/**
 * 📖 Reads the undo journal and returns its valid entries, most recent first
 * (the order `pushUndo` maintains on disk). Never throws: a missing directory,
 * a missing file, invalid JSON, a non-array root or malformed entries all come
 * back as an empty list (or a filtered list), so callers can peek at the
 * journal without a try/catch of their own.
 */
export function listUndoRecords(kandownDir: string): UndoRecord[] {
  const logPath = join(kandownDir, '.undo', 'log.json');
  if (!existsSync(logPath)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(logPath, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isUndoRecord);
}
