/**
 * @file Chat session index: the thin per-project record of harness conversations
 * @description Kandown never stores conversations: each harness (claude, codex,
 * pi, ACP) persists its own transcript wherever it keeps its data. What the
 * chat sidebar (t308) needs is a small, per-project listing so it can show
 * past conversations, title them and resume them. This module owns exactly
 * that index: one JSON file per session under
 * `~/.kandown/sessions/<projectHash>/<sessionId>.json`, keyed by the same
 * canonical project hash as extension state (see src/lib/project-hash.ts).
 *
 * 📖 Every read and write is defensive by design: a corrupt or truncated file
 * is skipped, a missing directory yields an empty list, and no function in
 * here ever throws into its caller. The chat must survive a hand-edited or
 * half-written index; the index is disposable, the board is not. Writes go
 * through the atomic writer so an interrupted write can never leave a
 * truncated JSON file behind in the first place.
 *
 * 📖 Security: every function takes the server-side `projectRoot`, never a
 * client-supplied path, and entry ids are sanitized before they become file
 * names, so a malicious id cannot escape the project directory.
 *
 * @functions
 *  → sessionIndexBaseDir: the ~/.kandown/sessions root shared by all projects
 *  → sessionIndexDir: one project's index directory (keyed by project hash)
 *  → upsertSessionIndexEntry: create or replace one session's index file
 *  → patchSessionIndexEntry: merge a partial update into one entry
 *  → forgetSessionIndexEntry: delete one entry (index only, never the runtime)
 *  → listSessionIndexEntries: all entries for a project, newest activity first
 *  → indexEntryForPrompt: derive a display title from a prompt's first line
 *
 * @exports SessionIndexEntry, SessionIndexPatch, sessionIndexBaseDir, sessionIndexDir, upsertSessionIndexEntry, patchSessionIndexEntry, forgetSessionIndexEntry, listSessionIndexEntries, indexEntryForPrompt
 * @see src/cli/lib/agent/agent-runtime.ts: the live sessions this indexes
 * @see src/cli/lib/server.ts: the routes that maintain the index
 */

import { mkdirSync, readFileSync, readdirSync, realpathSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canonicalizeProjectPath, projectHash } from '../../../lib/project-hash.js';
import { atomicWriteFileSync } from '../atomic-write.js';

/** 📖 One indexed conversation. `id` is the kandown session id (`ses_*`);
 *  `harnessSessionId` is the harness' own id, patched in when the harness
 *  reports it, and is what makes resume possible later. Timestamps are ISO. */
export interface SessionIndexEntry {
  id: string;
  harnessId: string;
  harnessSessionId?: string;
  title: string;
  taskId?: string;
  createdAt: string;
  updatedAt: string;
}

/** 📖 Partial update accepted by patchSessionIndexEntry; omitted fields stay
 *  untouched. `updatedAt` defaults to "now" when the caller does not pin it. */
export type SessionIndexPatch = Partial<Pick<SessionIndexEntry, 'harnessSessionId' | 'title' | 'taskId' | 'updatedAt'>>;

/** 📖 Directory root every project's index lives under, regardless of project. */
export function sessionIndexBaseDir(): string {
  return join(homedir(), '.kandown', 'sessions');
}

/** 📖 One project's index directory: the shared base keyed by the same
 *  canonical project hash extension state uses, so the chat sidebar and the
 *  extension host agree on which project "this" is. */
export function sessionIndexDir(projectRoot: string): string {
  const canonicalProject = canonicalizeProjectPath(projectRoot, realpathSync);
  return join(sessionIndexBaseDir(), projectHash(canonicalProject));
}

/** 📖 File name for one entry id. Ids are kandown-generated (`ses_*`) but the
 *  index is on disk, so anything that is not a safe path segment is folded to
 *  `_` before it can reach the filesystem. Returns null for ids that sanitize
 *  to nothing (the caller skips them instead of writing `.json`). */
function entryFileName(id: string): string | null {
  if (typeof id !== 'string') return null;
  const safe = id.replace(/[^A-Za-z0-9._-]/g, '_');
  return safe ? `${safe}.json` : null;
}

function entryPath(projectRoot: string, id: string): string | null {
  const fileName = entryFileName(id);
  return fileName ? join(sessionIndexDir(projectRoot), fileName) : null;
}

/** 📖 Structural guard for JSON read back from disk: anything that does not
 *  fully match the entry shape is treated as corrupt and skipped. */
function isSessionIndexEntry(value: unknown): value is SessionIndexEntry {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id) return false;
  if (typeof item.harnessId !== 'string' || !item.harnessId) return false;
  if (typeof item.title !== 'string') return false;
  if (typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string') return false;
  if (item.harnessSessionId !== undefined && typeof item.harnessSessionId !== 'string') return false;
  if (item.taskId !== undefined && typeof item.taskId !== 'string') return false;
  return true;
}

/** 📖 Reads one entry, or null when the file is missing, corrupt or shaped
 *  wrong. Never throws. */
function readEntry(projectRoot: string, id: string): SessionIndexEntry | null {
  const file = entryPath(projectRoot, id);
  if (!file) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isSessionIndexEntry(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 📖 Creates or replaces one session's index entry. Best-effort: an
 *  unwritable home directory silently skips the write rather than failing a
 *  session the harness is already running. */
export function upsertSessionIndexEntry(projectRoot: string, entry: SessionIndexEntry): void {
  const file = entryPath(projectRoot, entry?.id ?? '');
  if (!file) return;
  try {
    mkdirSync(sessionIndexDir(projectRoot), { recursive: true });
    atomicWriteFileSync(file, `${JSON.stringify(entry, null, 2)}\n`);
  } catch {
    // 📖 Index writes must never break a live chat: disk full or a read-only
    // home degrades to "session not listed", nothing worse.
  }
}

/** 📖 Merges a partial update into one entry. Unknown id or corrupt existing
 *  file is a silent no-op: the runtime session keeps working without an index.
 *  `updatedAt` defaults to now so every visible change reorders the sidebar. */
export function patchSessionIndexEntry(projectRoot: string, id: string, patch: SessionIndexPatch): void {
  if (typeof id !== 'string' || !id) return;
  const existing = readEntry(projectRoot, id);
  if (!existing) return;
  const next: SessionIndexEntry = {
    ...existing,
    ...(patch.harnessSessionId !== undefined ? { harnessSessionId: patch.harnessSessionId } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.taskId !== undefined ? { taskId: patch.taskId } : {}),
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };
  upsertSessionIndexEntry(projectRoot, next);
}

/** 📖 Removes one index entry. Forgetting is an index-only operation: it must
 *  never stop or kill a live runtime session, which is why this module has no
 *  runtime import at all. Missing file is already the desired end state. */
export function forgetSessionIndexEntry(projectRoot: string, id: string): void {
  const file = entryPath(projectRoot, id);
  if (!file) return;
  try {
    unlinkSync(file);
  } catch {
    // 📖 ENOENT means already forgotten; anything else still must not throw.
  }
}

/** 📖 Lists a project's entries, most recently active first. Corrupt files are
 *  skipped, not surfaced: the sidebar shows the healthy entries it can read.
 *  Ties (same updatedAt) fall back to createdAt, then id, so the order is
 *  stable across calls. */
export function listSessionIndexEntries(projectRoot: string): SessionIndexEntry[] {
  const dir = sessionIndexDir(projectRoot);
  let fileNames: string[];
  try {
    fileNames = readdirSync(dir);
  } catch {
    return [];
  }
  const entries: SessionIndexEntry[] = [];
  for (const fileName of fileNames) {
    if (!fileName.endsWith('.json')) continue;
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, fileName), 'utf8'));
      if (isSessionIndexEntry(parsed)) entries.push(parsed);
    } catch {
      continue;
    }
  }
  return entries.sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
    || b.createdAt.localeCompare(a.createdAt)
    || a.id.localeCompare(b.id),
  );
}

/** 📖 Derives a sidebar title from the prompt that started the session: the
 *  first non-empty line, whitespace collapsed, at most 60 characters. Pure
 *  and total: an empty prompt yields an empty string, never a throw. */
export function indexEntryForPrompt(prompt: string): string {
  const firstLine = prompt
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0) ?? '';
  const collapsed = firstLine.replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, 60).trimEnd();
}
