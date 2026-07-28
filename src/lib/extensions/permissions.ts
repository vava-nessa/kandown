/**
 * @file Extension permission model
 * @description A tiny capability matcher. Extensions declare `permissions` in
 * their manifest (e.g. `read:tasks`, `write:field:plugins.burndown.*`,
 * `net:*`); the host asks `isAllowed` before proxying a privileged call.
 *
 * 📖 Even with the ErrorBoundary-only web sandbox, a scoped permission model is
 * cheap insurance: an extension cannot call `fetch` or write another extension's
 * namespace unless it declared the matching permission. Wildcards (`net:*`,
 * `*`) are supported. See docs/EXTENSIONS.md § "Security model".
 *
 * @functions
 *  → isAllowed: does a declared list cover a requested permission?
 * @exports isAllowed
 */

/** True when `declared` covers `permission` (exact, prefix wildcard, or global). */
export function isAllowed(declared: string[] | undefined, permission: string): boolean {
  if (!declared || declared.length === 0) return false;
  for (const entry of declared) {
    if (entry === permission) return true;
    if (entry === '*') return true;
    // `net:*` covers `net:https://...`; `write:field:plugins.burndown.*`
    // covers every key in that extension namespace.
    if (entry.endsWith('*') && permission.startsWith(entry.slice(0, -1))) return true;
  }
  return false;
}
