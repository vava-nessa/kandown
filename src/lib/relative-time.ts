/**
 * @file Compact relative time label
 * @description Turns an ISO timestamp into the short "<1m / 5m / 3h / 2d" age
 * label the conversation lists show next to each entry. Deliberately
 * dependency-free and deterministic so any list (rail, panel, switcher) can
 * share the exact same vocabulary.
 *
 * @functions
 *  → relativeTime: compact age label for an ISO instant
 *
 * @exports relativeTime
 */

/** 📖 Compact "now / Xm / Xh / Xd" age of an ISO instant, empty when the
 * timestamp is unparsable (a malformed index entry must not break a list). */
export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return '<1m';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
