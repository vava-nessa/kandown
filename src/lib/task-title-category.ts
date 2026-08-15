/**
 * @file Helper for task category extraction and title formatting
 * @description Provides the canonical way to read a task's category (frontmatter
 * `category:` field first, legacy leading bracket in the title as fallback) and
 * title parsing utilities. The category became a first-class frontmatter field
 * in 0.53.0; the bracket-in-title form still exists on legacy files and is
 * accepted everywhere so nothing breaks before migration completes.
 *
 * @functions
 *  → taskCategory — canonical category: frontmatter field, else title bracket
 *  → parseTaskTitle — splits title into bracket tag and clean title
 *
 * @exports taskCategory, parseTaskTitle
 */

export interface ParsedTitle {
  category: string | null;
  rawCategory: string | null;
  cleanTitle: string;
}

/**
 * 📖 The canonical category of a task: the frontmatter `category:` field when
 * present, falling back to a leading bracket in the title for legacy files
 * that predate the field. Returns `null` when neither exists. Every reader
 * (web grouping, drawer chip, TUI rows, filename builder) goes through this
 * so the fallback chain lives in exactly one place.
 */
export function taskCategory(frontmatter: { category?: unknown; title?: string }): string | null {
  if (typeof frontmatter.category === 'string' && frontmatter.category.trim()) {
    return frontmatter.category.trim();
  }
  return parseTaskTitle(frontmatter.title ?? '').category;
}

/**
 * 📖 Extracts only the VERY FIRST bracket tag at the start of a title string if present.
 * E.g. "[FABLE_CLEANUP] [UI] Refactor header" -> category: "FABLE_CLEANUP", cleanTitle: "[UI] Refactor header"
 */
export function parseTaskTitle(title: string): ParsedTitle {
  // 📖 Defensive: a malformed task file can carry a non-string title (e.g.
  // `title: [WEB] x` parses as a YAML inline array). Never crash the board
  // over one bad file; treat it as an uncategorized, bracket-free title.
  if (typeof title !== 'string' || !title) return { category: null, rawCategory: null, cleanTitle: typeof title === 'string' ? title : '' };

  const match = title.match(/^\[([^\]]+)\]\s*/);
  if (!match) {
    return { category: null, rawCategory: null, cleanTitle: title };
  }

  return {
    category: match[1],
    rawCategory: match[0].trim(),
    cleanTitle: title.slice(match[0].length),
  };
}
