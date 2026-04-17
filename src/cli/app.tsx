/**
 * @file TUI screen router
 * @description Routes to the correct screen based on the `screen` prop.
 * Currently supports "settings". Future screens: "board", "task".
 *
 * 📖 This is the top-level component rendered by tui.tsx inside the alternate
 * screen buffer. Each screen gets the kandownDir path to access project files.
 *
 * @functions
 *  → App — main router component
 *
 * @exports App
 * @see src/cli/tui.tsx — entry point that renders this component
 */

import { Box, Text } from 'ink';
import { Settings } from './screens/settings.js';

interface AppProps {
  screen: string;
  kandownDir: string;
}

export function App({ screen, kandownDir }: AppProps) {
  switch (screen) {
    case 'settings':
      return <Settings kandownDir={kandownDir} />;
    default:
      return (
        <Box padding={2}>
          <Text color="red" bold>
            Unknown screen: {screen}
          </Text>
        </Box>
      );
  }
}
