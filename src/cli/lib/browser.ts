/**
 * @file Cross-platform browser launcher
 * @description Resolves and spawns the platform default browser for the given
 * URL. Shared by the CLI main entry point and the TUI's "create project"
 * prompt so the same command is used everywhere.
 *
 * 📖 Wrapped in a try/catch because some sandboxed environments refuse to
 * spawn detached processes; failure to open the browser is non-fatal because
 * the user can always copy the URL from the daemon log.
 */

import { spawn } from 'node:child_process';

export function openBrowser(target: string): void {
  const cmd = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';
  try {
    spawn(cmd, [target], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* best-effort: opening a browser is a courtesy, not a hard dependency */
  }
}
