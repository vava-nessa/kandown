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
import './styles/globals.css';

initI18n('en');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
