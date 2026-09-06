/**
 * @file Task filename slugs and id resolution
 * @description Owns the whole relationship between a task id and the name of the
 * file that holds it, for every surface (CLI, daemon, TUI, web File System
 * Access, desktop). It exists because that relationship stopped being the
 * identity function: a task file may now be named `t232.md` (legacy, still
 * valid forever) or `t232_remove_dead_code.md` (descriptive, the default for
 * newly created tasks), and both must resolve to the id `t232`.
 *
 * The descriptive part is decoration and is never read as data. The canonical id
 * lives in the task's `id:` frontmatter and in the frontmatter only, so a rename
 * can never invalidate a `depends_on`, a `[[t232]]` link, a deep link or a git
 * branch name. This is also what keeps the slug compatible with configurable id
 * formats such as `BUG-001`: the resolver never parses the id, it matches it.
 *
 * Nothing here touches the filesystem. Callers pass the directory listing they
 * already have, which is why `resolveTaskFilename` can be shared by the Node
 * `readdirSync` path and the browser `FileSystemDirectoryHandle` path instead of
 * being written twice with two different sets of bugs. No index, no cache and no
 * manifest is ever persisted: the mapping is derived from `tasks/` on demand.
 *
 * Slugs are deliberately ASCII-only. A title that yields nothing printable in
 * ASCII (CJK, Cyrillic, emoji-only, punctuation-only) falls back to the bare
 * `<id>.md`, which is always correct. Allowing non-ASCII would invite the
 * macOS NFD / Linux NFC filename mismatch, a class of "file not found" bug that
 * only ever reproduces on someone else's machine.
 *
 * @functions
 *  → slugifyTitle — turn a task title into at most three lowercase ASCII words
 *  → categorySegmentFromTitle — the bracket category as a filename segment, if any
 *  → categorySegmentFromFrontmatter — the category segment from frontmatter (field first, legacy bracket fallback)
 *  → normalizeCategorySegment — turn raw bracket content into a safe filename chunk
 *  → buildTaskFilename — compose the on-disk filename for a new task
 *  → isTaskFilename — recognize a task Markdown file, rejecting unsafe names
 *  → parseTaskFilename — split a filename into its id candidates and slug
 *  → taskIdFromFilename — the canonical id a file on disk claims
 *  → resolveTaskFilename — pick the file that answers to an id, flagging collisions
 *  → hasDescriptiveSlug — whether a filename already carries a slug
 *  → hasCategorySegment — whether a filename already carries a category segment
 *
 * @exports SLUG_MAX_WORDS, SLUG_MAX_LENGTH, CATEGORY_MAX_LENGTH,
 *          slugifyTitle, categorySegmentFromTitle, categorySegmentFromFrontmatter,
 *          normalizeCategorySegment,
 *          buildTaskFilename, isTaskFilename, parseTaskFilename,
 *          taskIdFromFilename, resolveTaskFilename, hasDescriptiveSlug,
 *          hasCategorySegment, ParsedTaskFilename, TaskFilenameMatch
 * @see docs/ARCHITECTURE.md — invariants: the id is not the filename
 */

import { parseTaskTitle, taskCategory } from './task-title-category';

/** 📖 How many words of the title end up in the filename. Three reads at a glance; four starts to wrap in a git status. */
export const SLUG_MAX_WORDS = 3;

/**
 * 📖 Hard cap on the slug in characters, so `<id>_<slug>.md` stays far below the
 * 255-byte filename limit even with a long configurable id prefix and a deep
 * path. Words are truncated individually first, this is the final guard.
 */
export const SLUG_MAX_LENGTH = 48;

/** 📖 Per-word cap. One pathological identifier in a title must not eat the whole budget. */
const SLUG_MAX_WORD_LENGTH = 20;

/** 📖 Hard cap on the bracket-category segment in characters, smaller than the
 * slug cap on purpose: categories are short codes (`UI`, `BILLING`, `FABLE_CLEANUP`),
 * not prose, and an oversized one usually means a typo the user did not mean to
 * keep. */
export const CATEGORY_MAX_LENGTH = 32;

/** 📖 The class a category segment must satisfy to land in a filename: ASCII
 * alphanumerics, underscores, dashes. Uppercase by construction. Empty after
 * normalization means "no category in the filename". */
const CATEGORY_LIKE = /^[A-Z0-9_-]+$/;

/** 📖 Separator between the id and the slug, and between slug words. Underscore, not dash, because a configurable id may itself contain a dash (`BUG-001`). */
const SLUG_SEPARATOR = '_';

/**
 * 📖 What the part before the first underscore must look like for that
 * underscore to count as a slug boundary: alphanumerics and dashes, containing
 * at least one digit (`t232`, `BUG-001`, `EPIC-14`).
 *
 * This guard is the backward-compatibility contract. Without it, a project that
 * already names its files `bug_login.md` with `id: bug_login` would suddenly see
 * that task's id become `bug`, silently breaking every `depends_on` pointing at
 * it. Requiring a digit means a hand-written descriptive filename keeps its
 * whole basename as its id, and only ids that were actually allocated by
 * Kandown are split.
 */
const ID_LIKE = /^(?=.*\d)[A-Za-z0-9-]+$/;

/**
 * 📖 Letters that Unicode decomposition does not split into base + accent, so
 * NFKD alone would drop them and silently shorten the word ("Sønderborg" →
 * "snderborg"). Kept small on purpose: this is a filename, not a transliteration
 * engine.
 */
const TRANSLITERATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ß/g, 'ss'],
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
  [/ø/g, 'o'],
  [/å/g, 'a'],
  [/ð/g, 'd'],
  [/þ/g, 'th'],
  [/ł/g, 'l'],
  [/đ/g, 'd'],
  [/ħ/g, 'h'],
  [/ı/g, 'i'],
  [/ŋ/g, 'n'],
];

/**
 * 📖 Deterministic filename ordering, on purpose not `localeCompare`: collation
 * disagrees about punctuation across locales and ICU versions, so `t232_a.md`
 * versus `t232_a_b.md` could resolve differently on two machines looking at the
 * same folder. Code-unit order is boring, portable, and puts `.md` before `_`,
 * which makes the shortest claimant win a tie.
 */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 📖 Dropped so the three surviving words are the ones that carry meaning:
 * "Remove the dead code from the repo" → `remove_dead_code`, not `remove_the_dead`.
 * English and French, because those are the two languages this board is written
 * in. Stop words are only removed when something is left afterwards.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
  // English
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'in',
  'into', 'is', 'it', 'its', 'of', 'on', 'onto', 'or', 'our', 'that', 'the',
  'their', 'then', 'there', 'this', 'to', 'we', 'when', 'with', 'without',
  // French
  'au', 'aux', 'avec', 'ce', 'ces', 'dans', 'de', 'des', 'du', 'en', 'et',
  'il', 'la', 'le', 'les', 'leur', 'ne', 'ou', 'par', 'pas', 'pour', 'que',
  'qui', 'sa', 'sans', 'se', 'ses', 'son', 'sur', 'un', 'une', 'y',
]);

export interface ParsedTaskFilename {
  /** The basename with `.md` removed. Also the legacy full-form id, and the id of any file with no slug. */
  base: string;
  /** The part before the first separator, when the name carries a slug. `null` for `t232.md`. */
  idPrefix: string | null;
  /** The descriptive part after the first separator. `null` for `t232.md`. */
  slug: string | null;
  /**
   * Every id this file answers to, most specific first. `t232_remove_dead_code.md`
   * answers to both `t232_remove_dead_code` (a legacy id that happens to contain
   * underscores) and `t232`. Order is the match priority.
   */
  candidateIds: string[];
  /**
   * The bracket-category segment, when the filename carries one. `null` for
   * `t232.md` and `t232_remove_dead_code.md`; a value like `UI` for
   * `t232_UI_fix_login.md`. Always uppercase ASCII.
   */
  category: string | null;
}

export interface TaskFilenameMatch {
  /** The filename to read or write, including `.md`. */
  filename: string;
  /** The id the caller asked for, echoed back for logging. */
  id: string;
  /** The descriptive part, or `null` for a bare `<id>.md`. */
  slug: string | null;
  /** True when the id was matched on the full basename rather than on the slug prefix. */
  exact: boolean;
  /**
   * Other files that also claim this id. Non-empty means the folder is
   * ambiguous (`t232.md` plus `t232_a.md`, or two different slugs for one id):
   * the pick stays deterministic, but every surface must tell the user, because
   * otherwise a write lands in a file they are not looking at.
   */
  ambiguousWith: string[];
}

/**
 * 📖 Turns raw bracket content (`UI`, `Fable Cleanup`, `R&D`) into the form a
 * filename wants: uppercase ASCII, internal whitespace as underscore, anything
 * else dropped. Returns `null` when the result is empty so callers can use a
 * single nullish check to decide whether to emit a category segment at all.
 */
export function normalizeCategorySegment(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const ascii = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!ascii) return null;
  if (ascii.length > CATEGORY_MAX_LENGTH) {
    // � Multi-word categories should keep every word, so the cap is applied by
    // dropping trailing whole segments first rather than slicing in the middle
    // of a word: `[SUPER LONG THING THAT WENT ON TOO LONG]` keeps
    // `SUPER_LONG_THING`, not `SUPER_LONG_THIN`.
    const segments = ascii.slice(0, CATEGORY_MAX_LENGTH).replace(/_[^_]*$/, '');
    return segments.length >= 2 ? segments : ascii.slice(0, CATEGORY_MAX_LENGTH);
  }
  return CATEGORY_LIKE.test(ascii) ? ascii : null;
}

/**
 * 📖 The bracket category embedded in a title, normalized to the form a filename
 * wants. Reads only the first bracket to stay consistent with `parseTaskTitle`.
 * `null` when the title has no leading bracket or the bracket yields nothing
 * usable (punctuation-only, emoji-only). Legacy helper: new code should derive
 * the category from the frontmatter via `categorySegmentFromFrontmatter`, which
 * falls back to this function for files that predate the `category:` field.
 */
export function categorySegmentFromTitle(title: string): string | null {
  if (typeof title !== 'string' || !title.trim()) return null;
  return normalizeCategorySegment(parseTaskTitle(title).category);
}

/**
 * 📖 The category segment a task's frontmatter wants in its filename. Reads the
 * first-class `category:` field, falling back to a legacy leading bracket in the
 * title, then normalizes to the filename form (uppercase ASCII). `null` when
 * neither yields anything usable, so the file stays a clean `<id>_<slug>.md`.
 */
export function categorySegmentFromFrontmatter(frontmatter: {
  category?: unknown;
  title?: string;
}): string | null {
  return normalizeCategorySegment(taskCategory(frontmatter));
}

/**
 * 📖 Turns a task title into the descriptive part of its filename: at most
 * `maxWords` lowercase ASCII words joined by `_`. Returns an empty string when
 * the title yields nothing usable, and the caller must then fall back to the
 * bare id: an empty slug is a normal outcome, not an error.
 *
 * A leading bracket category (`[UI] Fix the button`) is stripped first, since it
 * is metadata rather than a description of the goal. The category itself ends
 * up in the filename as a separate segment (`t232_UI_fix_the_button.md`), chosen
 * by `buildTaskFilename` rather than this function, so this stays a pure prose
 * normalizer.
 */
export function slugifyTitle(title: string, maxWords: number = SLUG_MAX_WORDS): string {
  if (typeof title !== 'string' || !title.trim()) return '';
  if (!Number.isFinite(maxWords) || maxWords < 1) return '';

  // 📖 `[UI] Fix the button` describes where, not what. Keep the what.
  const { cleanTitle } = parseTaskTitle(title);
  let text = cleanTitle.trim() || title;

  for (const [pattern, replacement] of TRANSLITERATIONS) text = text.replace(pattern, replacement);

  const ascii = text
    .normalize('NFKD')
    // 📖 Strip the combining marks NFKD just separated out, so `é` became `e`.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // 📖 Everything that is not a safe filename character becomes a word break.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (!ascii) return '';

  const words = ascii.split(' ').filter(Boolean).map(w => w.slice(0, SLUG_MAX_WORD_LENGTH));
  const meaningful = words.filter(w => !STOP_WORDS.has(w));
  // 📖 A title made only of stop words ("For the record") still deserves a slug.
  const chosen = (meaningful.length ? meaningful : words).slice(0, Math.floor(maxWords));

  let slug = chosen.join(SLUG_SEPARATOR);
  if (slug.length > SLUG_MAX_LENGTH) {
    slug = slug.slice(0, SLUG_MAX_LENGTH).replace(/_+[^_]*$/, '');
    // 📖 A single word longer than the cap leaves nothing after trimming the last fragment.
    if (!slug) slug = chosen[0].slice(0, SLUG_MAX_LENGTH);
  }
  return slug.replace(/^_+|_+$/g, '');
}

/**
 * 📖 The filename a newly created task should get. Falls back to `<id>.md`
 * whenever the title produces no usable slug, which keeps every legacy
 * expectation true for non-Latin titles instead of inventing a placeholder.
 *
 * When the task carries a category, that category is added as a separate
 * uppercase segment between the id and the prose slug: `Fix the login button`
 * with `category: UI` → `t232_UI_fix_login_button.md`. The category is
 * taxonomy, not description, so it sits next to the id rather than inside the
 * slug, and the visual hierarchy reads as `id` `CATEGORY` `prose`. A category
 * that yields nothing usable (punctuation-only) is treated as absent, so the
 * file stays a clean `<id>_<slug>.md` rather than carrying an empty trailing
 * underscore.
 *
 * The category argument is the raw value (frontmatter `category:` or a legacy
 * bracket); it is normalized here. When omitted, a leading `[BRACKET]` in the
 * title is used instead, so legacy callers keep working unchanged.
 *
 * Pass `takenFilenames` to keep the result unique: a second task titled the same
 * way gets `t293_fix_login_button_2.md` while the first keeps
 * `t292_fix_login_button.md`, since the id already disambiguates. The parameter
 * exists for the pathological case where the id itself is being reused.
 */
export function buildTaskFilename(
  id: string,
  title?: string | null,
  category?: string | null,
  takenFilenames: readonly string[] = [],
): string {
  const safeId = String(id ?? '').trim();
  if (!safeId) throw new Error('buildTaskFilename requires a task id');
  if (/[\\/]|^\.+$/.test(safeId)) throw new Error(`Unsafe task id for a filename: ${safeId}`);

  // 📖 A slug is only safe on an id the resolver can split back out, i.e. one
  // matching ID_LIKE (`t232`, `BUG-001`). On a digitless custom id
  // (`kandown create --id assignable`) the underscore is not read as a slug
  // boundary, so `assignable_assign_me.md` would claim the id
  // `assignable_assign_me` and the task would be unreachable by its own id
  // forever. Falling back to the bare `<id>.md` keeps decoration from breaking
  // identity, the whole point of the id/filename split.
  const sluggable = ID_LIKE.test(safeId);
  const categorySegment = sluggable
    ? normalizeCategorySegment(category ?? null) ?? categorySegmentFromTitle(title ?? '')
    : null;
  const slug = sluggable ? slugifyTitle(title ?? '') : '';
  // 📖 No category and no slug → bare id; one or the other → single segment;
  // both → category first so the id is always followed by CATEGORY before prose.
  let body: string;
  if (categorySegment && slug) body = `${categorySegment}${SLUG_SEPARATOR}${slug}`;
  else if (categorySegment) body = categorySegment;
  else if (slug) body = slug;
  else body = '';
  const candidate = body ? `${safeId}${SLUG_SEPARATOR}${body}.md` : `${safeId}.md`;
  if (!takenFilenames.length) return candidate;

  const taken = new Set(takenFilenames.map(f => f.toLowerCase()));
  if (!taken.has(candidate.toLowerCase())) return candidate;

  const stem = candidate.slice(0, -3);
  for (let n = 2; n < 1000; n += 1) {
    const next = `${stem}${SLUG_SEPARATOR}${n}.md`;
    if (!taken.has(next.toLowerCase())) return next;
  }
  throw new Error(`Could not find a free filename for task ${safeId}`);
}

/**
 * 📖 True for a Markdown file that could be a task, false for `README.md`-style
 * siblings the scan should ignore and for anything that tries to escape the
 * tasks directory. Hidden files are excluded so editor swap files and
 * `.DS_Store`-adjacent noise never become phantom tasks.
 */
export function isTaskFilename(name: string): boolean {
  if (typeof name !== 'string') return false;
  if (!name.toLowerCase().endsWith('.md')) return false;
  if (name.startsWith('.') || name.includes('/') || name.includes('\\')) return false;
  const base = name.slice(0, -3);
  if (!base || base === '.' || base === '..') return false;
  // 📖 Same character class the id guard has always allowed, applied to the whole basename.
  return /^[A-Za-z0-9._-]+$/.test(base);
}

/**
 * 📖 Splits a task filename into the ids it can answer to. Returns `null` for a
 * name that is not a task file, so callers can use it as the filter for a
 * directory scan.
 */
export function parseTaskFilename(name: string): ParsedTaskFilename | null {
  if (!isTaskFilename(name)) return null;
  const base = name.slice(0, -3);
  const cut = base.indexOf(SLUG_SEPARATOR);
  const idPrefix = cut > 0 ? base.slice(0, cut) : null;
  const slug = idPrefix !== null ? base.slice(cut + 1) : null;
  // � Not a slug boundary when: there is no underscore, it is leading or
  // trailing (`_t232.md`, `t232_.md`), or the prefix does not look like an
  // allocated id (`bug_login.md` stays the single id `bug_login`).
  if (idPrefix === null || cut === base.length - 1 || !ID_LIKE.test(idPrefix)) {
    return { base, idPrefix: null, slug: null, candidateIds: [base], category: null };
  }
  // 📖 The category segment is everything between the id and the slug's first
  // lowercase word. `t232_UI_fix_login_button.md` splits into id `t232`,
  // category `UI` (uppercase ASCII, all caps, no digits to confuse with the
  // id), slug `fix_login_button`. A file that only has a slug has no category.
  let category: string | null = null;
  let slugOnly = slug;
  if (slug) {
    const slugStart = slug.search(/[a-z0-9]/);
    if (slugStart > 0 && /^[A-Z0-9_-]+$/.test(slug.slice(0, slugStart).replace(/_+$/, ''))) {
      const candidate = slug.slice(0, slugStart).replace(/_+$/, '');
      // 📖 A category must contain at least one uppercase letter. A pure-digit
      // segment would collide with the id-starts-with-digit pattern and the
      // resolver already disambiguates those, but it would still feel wrong to
      // label `12345` a category in `t232_12345_fix.md`.
      if (/[A-Z]/.test(candidate)) {
        category = candidate;
        slugOnly = slug.slice(slugStart);
      }
    }
  }
  return {
    base,
    idPrefix,
    slug: slugOnly || null,
    candidateIds: [base, idPrefix],
    category,
  };
}

/**
 * 📖 The canonical id a file on disk claims, for the filename → id direction
 * (listing a directory, reacting to a watcher event). `null` when the name is
 * not a task file. The task's own `id:` frontmatter still wins wherever the file
 * has actually been read; this is the cheap answer for a scan that must not open
 * forty files to draw a board.
 */
export function taskIdFromFilename(name: string): string | null {
  const info = parseTaskFilename(name);
  return info ? info.idPrefix ?? info.base : null;
}

/**
 * 📖 Finds which file in a directory listing holds a given task id, over both
 * the legacy `t232.md` and the descriptive `t232_remove_dead_code.md` forms.
 * Returns `null` when no file claims the id.
 *
 * Priority, in order, so the answer never depends on directory order:
 *   1. an exact basename match (`t232.md`, and legacy ids containing `_`)
 *   2. a slug-prefix match (`t232_*.md`), alphabetically first when several
 *   3. the same two passes again, case-insensitively, for case-insensitive
 *      filesystems and for a hand-typed `T232`
 *
 * Any additional claimant is reported in `ambiguousWith` rather than dropped.
 */
export function resolveTaskFilename(id: string, filenames: readonly string[]): TaskFilenameMatch | null {
  const wanted = String(id ?? '').trim();
  if (!wanted) return null;

  const parsed = filenames
    .map(name => ({ name, info: parseTaskFilename(name) }))
    .filter((entry): entry is { name: string; info: ParsedTaskFilename } => entry.info !== null)
    .sort((a, b) => byCodeUnit(a.name, b.name));

  const pick = (matches: Array<{ name: string; info: ParsedTaskFilename }>, exact: boolean): TaskFilenameMatch | null => {
    if (!matches.length) return null;
    const [best, ...rest] = matches;
    return {
      filename: best.name,
      id: wanted,
      slug: best.info.slug,
      exact,
      ambiguousWith: rest.map(m => m.name),
    };
  };

  const exactMatches = parsed.filter(e => e.info.base === wanted);
  if (exactMatches.length) {
    const others = parsed.filter(e => e.info.base !== wanted && e.info.idPrefix === wanted);
    const match = pick(exactMatches, true)!;
    return { ...match, ambiguousWith: [...match.ambiguousWith, ...others.map(o => o.name)] };
  }

  const prefixMatches = parsed.filter(e => e.info.idPrefix === wanted);
  if (prefixMatches.length) return pick(prefixMatches, false);

  const lower = wanted.toLowerCase();
  const exactCi = parsed.filter(e => e.info.base.toLowerCase() === lower);
  if (exactCi.length) return pick(exactCi, true);

  const prefixCi = parsed.filter(e => e.info.idPrefix?.toLowerCase() === lower);
  if (prefixCi.length) return pick(prefixCi, false);

  return null;
}

/**
 * 📖 Whether a task file already carries a description. Drives the `kandown work`
 * nudge that offers to rename the bare-numbered leftovers, and `reslug --all`.
 */
export function hasDescriptiveSlug(name: string): boolean {
  return parseTaskFilename(name)?.slug != null;
}

/**
 * 📖 Whether a task file already carries a bracket-category segment. The
 * `kandown reslug` command reads this to leave alone files whose category and
 * slug are already both correct: re-deriving from the title costs a rename for
 * no observable change.
 */
export function hasCategorySegment(name: string): boolean {
  return parseTaskFilename(name)?.category != null;
}
