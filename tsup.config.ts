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
  // 📖 Keep runtime deps external — they're in package.json dependencies
  external: ['react', 'react-dom', 'ink', 'yoga-wasm-web'],
  tsconfig: 'tsconfig.cli.json',
  esbuildOptions(options) {
    // 📖 Use automatic JSX transform (react-jsx) — no need to import React
    options.jsx = 'automatic';
  },
});
