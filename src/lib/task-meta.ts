/**
 * @file Task recency metadata
 * @description Owns the `updated:` frontmatter field — the single source of
 * truth for "when did this task last change" — and the compact relative-age
 * formatting the TUI list view renders in its `Age` column.
 *
 * 📖 Why a frontmatter field and not the file mtime? Because mtime is not
 * durable. `git clone`, `git checkout` and most CI restores rewrite every task
 * file's mtime to the moment of the checkout, so an mtime-based age column
 * shows the same value for every task on a fresh machine — exactly when you
 * most need to know what moved recently. `updated:` travels inside the file,
 * so it survives clones, and it shows up in `git diff` as a real signal.
 *
 * 📖 Who writes it: every mutation path stamps it through `stampUpdated`, so
 * the field cannot silently go stale. The CLI stamps in `board-reader.ts`,
 * `commands/tasks.ts` and `lib/mcp.ts`; the web stamps in `lib/filesystem.ts`.
 * `serializeTaskFile` is deliberately left pure — stamping there would make
 * every parser round-trip test time-dependent and would touch tasks that were
 * only re-read, never edited.
 *
 * 📖 Reading it back: always go through `taskTimestamp`, which walks the
 * fallback chain `updated → created → the mtime you pass in`. Tasks written
 * before this field existed only have `created`, and that must keep working.
 *
 * @functions
 *  → nowStamp — current UTC instant, second precision, no milliseconds
 *  → stampUpdated — returns a copy of the frontmatter with `updated` set to now
 *  → taskTimestamp — resolves a task's effective "last activity" epoch ms
 *  → formatAge — epoch ms → compact ≤5 char label (`3s`, `12min`, `4h`, `2d`, `4y`)
 *  → formatAgeOf — convenience: frontmatter → age label, `—` when unknown
 *
 * @exports nowStamp, stampUpdated, taskTimestamp, formatAge, formatAgeOf
 * @see src/lib/types.ts — TaskFrontmatter.updated
 * @see src/cli/screens/board/list-view.tsx — renders the Age column
 */

import type { TaskFrontmatter } from './types';

/**
 * 📖 `2026-07-26T08:14:49Z` — ISO 8601 UTC trimmed to whole seconds.
 *
 * Milliseconds are dropped on purpose: they add three characters of git diff
 * noise to every single task write and nothing in kandown reads below second
 * resolution. UTC (not local time) so a task edited on a laptop in Paris and a
 * CI box in us-east sorts correctly against each other.
 */
export function nowStamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * 📖 Returns a **copy** of `frontmatter` with `updated` set to now.
 *
 * Immutable by design: several call sites build the next frontmatter by
 * spreading the previous one, and an in-place mutation there would also stamp
 * the object still held by the caller's undo snapshot.
 *
 * Call this on the frontmatter you are about to serialize, never on the one you
 * just parsed for reading.
 */
export function stampUpdated<T extends Partial<TaskFrontmatter>>(frontmatter: T): T {
  return { ...frontmatter, updated: nowStamp() };
}

/**
 * 📖 Resolves the task's effective "last activity" moment as epoch ms.
 *
 * Fallback chain, most to least trustworthy:
 *  1. `updated:` — written by every mutation, exact.
 *  2. `created:` — a date-only string on legacy tasks; parses as UTC midnight,
 *     which is off by up to a day but still ranks tasks correctly by week.
 *  3. `mtimeMs` — the caller's `statSync().mtimeMs`, used only when the file
 *     carries neither field. Unreliable after a clone (see the file header),
 *     but better than showing nothing.
 *
 * Returns `null` when nothing resolves to a valid date, so callers render a
 * placeholder rather than `NaN` or a 1970 timestamp.
 */
export function taskTimestamp(
  frontmatter: Partial<TaskFrontmatter> | null | undefined,
  mtimeMs?: number,
): number | null {
  for (const raw of [frontmatter?.updated, frontmatter?.created]) {
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const parsed = Date.parse(raw.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof mtimeMs === 'number' && Number.isFinite(mtimeMs) && mtimeMs > 0) return mtimeMs;
  return null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * 📖 Compact relative age, taskwarrior style — never wider than 5 columns so
 * the list layout can hard-reserve the space.
 *
 * `12s` · `47min` · `3h` · `5d` · `2w` · `7mo` · `4y`
 *
 * A future timestamp (clock skew, a hand-edited `updated:` in tomorrow's date)
 * clamps to `0s` instead of rendering a negative age. Pass `now` to make tests
 * deterministic.
 */
export function formatAge(timestampMs: number | null, now: number = Date.now()): string {
  if (timestampMs === null || !Number.isFinite(timestampMs)) return '—';
  const delta = Math.max(0, now - timestampMs);
  if (delta < MINUTE) return `${Math.floor(delta / 1000)}s`;
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}min`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  if (delta < WEEK) return `${Math.floor(delta / DAY)}d`;
  if (delta < MONTH) return `${Math.floor(delta / WEEK)}w`;
  if (delta < YEAR) return `${Math.floor(delta / MONTH)}mo`;
  return `${Math.floor(delta / YEAR)}y`;
}

/** 📖 `taskTimestamp` + `formatAge` in one call — what the Age column renders. */
export function formatAgeOf(
  frontmatter: Partial<TaskFrontmatter> | null | undefined,
  mtimeMs?: number,
  now: number = Date.now(),
): string {
  return formatAge(taskTimestamp(frontmatter, mtimeMs), now);
}
