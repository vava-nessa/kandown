/**
 * @file Build-time constants
 * @description Ambient declarations for the literals Vite substitutes via
 * `define` at build time. They are not variables — by the time Rollup runs,
 * every reference has been replaced with `true` or `false`, which is what makes
 * the surrounding branch eliminable.
 *
 * @see vite.config.ts
 */

/**
 * 📖 `true` only in the website demo build (`pnpm build:demo`). Guards the
 * import of the in-memory backend in `src/main.tsx`, so that the demo backend
 * and its seed dataset are dropped from the single-file bundle shipped by the
 * CLI.
 *
 * @see src/lib/demoBackend.ts
 */
declare const __KANDOWN_DEMO_BUILD__: boolean;
