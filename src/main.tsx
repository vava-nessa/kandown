/**
 * @file Browser entry point
 * @description Mounts the Kandown React app into the Vite-provided root node
 * and imports the global Tailwind/CSS-variable theme layer.
 *
 * 📖 Keep this file intentionally boring: app behavior belongs in `App`, while
 * rendering setup and global styles are the only responsibilities here.
 *
 * @functions
 *  → createRoot(...).render — boots the React tree inside StrictMode
 *
 * @exports none
 * @see src/App.tsx
 * @see src/styles/globals.css
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
