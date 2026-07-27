/**
 * @file Vitest configuration
 * @description Runs the in-process unit suite (`src/lib/__tests__`,
 * `src/cli/lib/__tests__`) under Node ESM, with the project root set so
 * imports work the same way they do at runtime (`src/lib/foo` and
 * `src/cli/lib/foo`, matching `tsconfig.json`). Coverage goes to
 * `node_modules/.cache/vitest/coverage/` — gitignored, regenerated on
 * every run.
 *
 * 📖 Kandown has two product layers (web + CLI) and Vitest defaults are
 * web-shaped. This file pins to Node, sets `include` to the project's
 * well-defined test folders, and leaves `environment: 'node'` so the CLI
 * helpers don't need a JSDOM shim. Add `environment: 'jsdom'` to a
 * per-file comment if a future component suite needs it.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/lib/__tests__/**/*.spec.ts',
      'src/cli/lib/__tests__/**/*.spec.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'node_modules/.cache/vitest/coverage',
      include: ['src/lib/**/*.ts', 'src/cli/lib/**/*.ts'],
      // Skip generated code and platform-specific shims.
      exclude: [
        '**/__tests__/**',
        'src/lib/version.ts',
      ],
    },
  },
});
