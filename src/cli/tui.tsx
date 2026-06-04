/**
 * @file TUI entry point
 * @description Launches the fixed-screen terminal UI using Ink (React for CLI).
 * Uses Ink's native alternate-screen support so the original terminal content is
 * restored on exit, exactly like vim, htop, OpenCode, or any well-behaved TUI.
 *
 * 📖 Called by bin/kandown.js when the user runs `kandown settings` (or future commands
 * like `kandown board`). The `run()` function is the public API.
 *
 * @functions
 *  → run — renders the TUI in Ink's managed alternate screen buffer
 *
 * @exports run
 * @see src/cli/app.tsx — screen router
 */

import { render } from 'ink';
import { App } from './app.js';

/**
 * 📖 Launch the fullscreen TUI for a given screen.
 * @param screen — which screen to display ('settings', 'board', etc.)
 * @param kandownDir — absolute path to the .kandown/ directory
 * @param version — current kandown version string (e.g. '0.1.5')
 */
export async function run(screen: string, kandownDir: string, version?: string): Promise<void> {
  // 📖 Guard: Ink requires a real TTY with raw mode support
  if (!process.stdin.isTTY) {
    throw new Error(
      'kandown TUI requires an interactive terminal. Run this command directly in your terminal.',
    );
  }

  const instance = render(<App screen={screen} kandownDir={kandownDir} version={version} />, {
    exitOnCtrlC: true,
    interactive: true,
    alternateScreen: true,
    maxFps: 30,
  });

  await instance.waitUntilExit();
}
