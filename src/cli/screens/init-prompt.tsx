/**
 * @file TUI "create project" confirmation screen
 * @description Shown when `kandown` is launched inside a directory that does
 * not yet have a `.kandown/` config. The user confirms before the CLI
 * scaffolds the project, starts the daemon, and opens the browser.
 *
 * 📖 Lives under `src/cli/screens/` so it builds with the TUI bundle and can
 * `import { doInit }` from `./lib/init.js` without a circular dependency on
 * the screen router.
 */

import { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';

interface InitPromptProps {
  kandownDir: string;
  onConfirm: () => void;
}

export function InitPrompt({ kandownDir, onConfirm }: InitPromptProps) {
  const [pressed, setPressed] = useState(false);
  const { exit } = useApp();

  useInput((_input, key) => {
    if (key.return) {
      setPressed(true);
      onConfirm();
    } else if (key.escape) {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="yellow">
      <Text bold color="yellow">
        No .kandown/ project found
      </Text>
      <Text>
        {`Create one at ${kandownDir} and start the web daemon?`}
      </Text>
      <Text dimColor>{'Press Enter to create, Esc to quit.'}</Text>
      <Box marginTop={1}>
        <Text inverse={!pressed} color={pressed ? 'gray' : 'green'}>
          {` Create (Enter) `}
        </Text>
        <Text>  </Text>
        <Text inverse={pressed} color={pressed ? 'red' : 'gray'}>
          {` Quit (Esc) `}
        </Text>
      </Box>
    </Box>
  );
}
