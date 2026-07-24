/**
 * @file TUI screen router
 * @description Routes to the correct screen based on the `screen` prop and
 * wraps every screen in a fixed-height fullscreen frame.
 *
 * 📖 The fullscreen frame is intentional: Ink treats output shorter than the
 * viewport as log-style output and appends a trailing newline. By keeping the
 * root output at terminal height, Kandown behaves like OpenCode/vim/htop: one
 * stable alternate-screen surface with no duplicated scrollback redraws.
 *
 * @functions
 *  → getTerminalRows — returns a safe terminal row count
 *  → useTerminalRows — tracks terminal resize events for fullscreen layout
 *  → App — main router component
 *
 * @exports App
 * @see src/cli/tui.tsx — entry point that renders this component
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Box, Text } from 'ink';
import { Settings } from './screens/settings.js';
import { Board } from './screens/board.js';
import { InitPrompt } from './screens/init-prompt.js';
import { doInit } from './lib/init.js';
import { startProjectDaemon } from './lib/daemon.js';
import { openBrowser } from './lib/browser.js';

interface AppProps {
  screen: string;
  kandownDir: string;
  version?: string;
  /** 📖 False when `.kandown/kandown.json` didn't exist at TUI launch — shows
   * the create-project confirmation screen instead of routing straight in. */
  projectExists?: boolean;
}

function getTerminalRows(): number {
  const rows = process.stdout.rows;
  return typeof rows === 'number' && Number.isFinite(rows) && rows > 0 ? rows : 24;
}

function useTerminalRows(): number {
  const [rows, setRows] = useState(getTerminalRows);

  useEffect(() => {
    const handleResize = () => setRows(getTerminalRows());
    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return rows;
}

export function App({ screen, kandownDir, version, projectExists = true }: AppProps) {
  const rows = useTerminalRows();
  const [created, setCreated] = useState(false);

  let content: ReactNode;
  if (!projectExists && !created) {
    content = (
      <InitPrompt
        kandownDir={kandownDir}
        onConfirm={() => {
          if (!doInit(kandownDir)) {
            throw new Error(`Could not create project at ${kandownDir}`);
          }
          setCreated(true);
          // 📖 Best-effort: mirrors the CLI's own bare `kandown` flow. Failures
          // here never block the TUI — the user can still work from the board.
          void startProjectDaemon(kandownDir)
            .then(status => {
              if (status.metadata?.url) openBrowser(status.metadata.url);
            })
            .catch(() => {});
        }}
      />
    );
  } else {
    switch (screen) {
      case 'settings':
        content = <Settings kandownDir={kandownDir} version={version} />;
        break;
      case 'board':
        content = <Board kandownDir={kandownDir} version={version} />;
        break;
      default:
        content = (
          <Box padding={2}>
            <Text color="red" bold>
              Unknown screen: {screen}
            </Text>
          </Box>
        );
    }
  }

  return (
    <Box flexDirection="column" height={rows} overflow="hidden">
      {content}
    </Box>
  );
}
