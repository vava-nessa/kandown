/**
 * @file Helper for task title category extraction and title formatting
 * @description Extracts single leading bracket category tags (e.g. `[FABLE_CLEANUP]`)
 * for rendering in header bars and provides title parsing/updating utilities.
 *
 * @functions
 *  → parseTaskTitle — splits title into category tag and clean title
 *  → updateTitleCategory — updates or removes the bracket category tag in title string
 *
 * @exports parseTaskTitle, updateTitleCategory
 */

export interface ParsedTitle {
  category: string | null;
  rawCategory: string | null;
  cleanTitle: string;
}

/**
 * 📖 Extracts only the VERY FIRST bracket tag at the start of a title string if present.
 * E.g. "[FABLE_CLEANUP] [UI] Refactor header" -> category: "FABLE_CLEANUP", cleanTitle: "[UI] Refactor header"
 */
export function parseTaskTitle(title: string): ParsedTitle {
  if (!title) return { category: null, rawCategory: null, cleanTitle: '' };
  
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

/**
 * 📖 Replaces or prepends a category tag onto a full title string.
 * If newCategory is empty/null, removes the leading category tag.
 */
export function updateTitleCategory(fullTitle: string, newCategory: string | null): string {
  const { cleanTitle } = parseTaskTitle(fullTitle);
  const trimmedCat = newCategory?.trim().replace(/^\[|\]$/g, '');
  
  if (!trimmedCat) {
    return cleanTitle;
  }
  
  return `[${trimmedCat}] ${cleanTitle}`;
}
