/**
 * @file tsup build config for the CLI TUI
 * @description Bundles src/cli/tui.tsx → bin/tui.js as ESM.
 *
 * 📖 Run with: pnpm build:cli
 *
 * Key decisions:
 * - noExternal: array of patterns — bundle everything by default
 * - options.external — exceptions that must NOT be bundled:
 *   - Node.js built-ins (assert, module, fs, crypto, etc.) → use __require() shim
 *   - signal-exit → ESM import from Ink; must be a regular dep so Node finds it
 *   - react-devtools-core → keep bundled (handled by self→globalThis define)
 * - DEV=false in bin/kandown.js stops Ink from loading react-devtools-core
 * - globalThis.require = createRequire() makes __require() shim work in ESM
 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { tui: 'src/cli/tui.tsx' },
  format: ['esm'],
  outDir: 'bin',
  clean: false,
  target: 'node18',
  splitting: false,
  sourcemap: false,
  dts: false,
  noExternal: [/.*/],
  tsconfig: 'tsconfig.cli.json',
  esbuildOptions(options) {
    options.jsx = 'automatic';
    // Node.js built-ins and packages that use CJS require() inside IIFEs
    options.external = [
      // Node.js built-ins
      'assert', 'buffer', 'events', 'fs', 'path', 'os', 'util', 'url', 'zlib',
      'crypto', 'stream', 'net', 'tls', 'http', 'https', 'module',
      'readline', 'tty', 'child_process', 'perf_hooks',
      // utf-8-validate and bufferutil are optional native deps of ws
      'utf-8-validate', 'bufferutil',
      // Packages with CJS require() inside webpack IIFEs (must be regular deps)
      'signal-exit',
    ];
    // 📖 React devtools-core uses 'self' (browser global) inside a CJS UMD bundle.
    // tsup bundles it but can't transform the webpack UniversalModuleDefinition.
    // The self→globalThis define patches it for Node.js ESM compatibility.
    options.define = { ...options.define, self: 'globalThis' };
  },
});
