/**
 * @file tsup build config for the CLI TUI
 * @description Bundles src/cli/tui.tsx → bin/tui.js as ESM.
 * React and Ink are kept external (they're in dependencies, installed via npm).
 *
 * 📖 Run with: pnpm build:cli
 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { tui: 'src/cli/tui.tsx' },
  format: ['esm'],
  outDir: 'bin',
  // 📖 Don't wipe bin/ — kandown.js lives there and is not built
  clean: false,
  target: 'node18',
  splitting: false,
  sourcemap: false,
  dts: false,
  // 📖 Bundle everything — the npm package ships with zero runtime deps.
  noExternal: [/.*/],
  tsconfig: 'tsconfig.cli.json',
  esbuildOptions(options) {
    // 📖 Use automatic JSX transform (react-jsx) — no need to import React
    options.jsx = 'automatic';
    // 📖 react-devtools-core is an optional peer dep of Ink, never installed at runtime
    options.external = [...(options.external || []), 'react-devtools-core'];
  },
});
