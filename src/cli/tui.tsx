/**
 * @file TUI entry point
 * @description Launches the full-screen terminal UI using Ink (React for CLI).
 * Uses the alternate screen buffer so the original terminal content is restored on exit,
 * exactly like vim, htop, or any well-behaved fullscreen TUI.
 *
 * 📖 Called by bin/kandown.js when the user runs `kandown settings` (or future commands
 * like `kandown board`). The `run()` function is the public API.
 *
 * @functions
 *  → run — enters alternate screen buffer, renders the TUI, restores on exit
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
 */
export async function run(screen: string, kandownDir: string): Promise<void> {
  // 📖 Guard: Ink requires a real TTY with raw mode support
  if (!process.stdin.isTTY) {
    throw new Error(
      'kandown TUI requires an interactive terminal. Run this command directly in your terminal.',
    );
  }

  // 📖 Enter alternate screen buffer — terminal content is preserved and restored on exit
  process.stdout.write('\x1b[?1049h\x1b[H');

  const instance = render(<App screen={screen} kandownDir={kandownDir} />, {
    exitOnCtrlC: true,
  });

  try {
    await instance.waitUntilExit();
  } finally {
    // 📖 Leave alternate screen buffer — original terminal is restored
    process.stdout.write('\x1b[?1049l');
  }
}
