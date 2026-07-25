/**
 * @file Browser entry point
 * @description Mounts the Kandown React app into the Vite-provided root node,
 * initializes i18n, and imports the global Tailwind/CSS-variable theme layer.
 *
 * 📖 Keep this file intentionally boring: app behavior belongs in `App`, while
 * rendering setup, i18n initialization, and global styles are the only
 * responsibilities here.
 *
 * @functions
 *  → createRoot(...).render — boots the React tree inside StrictMode
 *
 * @exports none
 * @see src/App.tsx
 * @see src/styles/globals.css
 * @see src/lib/i18n/index.ts
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initI18n } from './lib/i18n';
import { setupGlobalErrorHandlers } from './lib/globalErrors';
import './styles/globals.css';

// 📖 Install global error handlers BEFORE React mounts so we catch any failure
// during initial render / hydration. Safe to call early — the module imports
// the store lazily to avoid a circular dependency.
setupGlobalErrorHandlers();
initI18n('en');

/**
 * 📖 Demo build only (`pnpm build:demo`, for the website's `/demo` page).
 *
 * `__KANDOWN_DEMO_BUILD__` is replaced at build time with a literal. In every
 * CLI build it is `false`, so Rollup removes this whole block along with the
 * dynamic import — the demo backend and its seed data never reach the bundle
 * that `npx kandown` downloads.
 *
 * The import is awaited before `createRoot`, so the in-memory API is registered
 * before any component can fire a request at it.
 *
 * @see src/lib/demoBackend.ts
 */
if (__KANDOWN_DEMO_BUILD__) {
  const { installDemoBackend } = await import('./lib/demoBackend');
  installDemoBackend();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
