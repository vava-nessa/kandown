#!/usr/bin/env node
/**
 * @file Sync AGENT_KANDOWN.md
 * @description Copies templates/AGENT_KANDOWN.md to project root.
 *             This ensures the installed AGENT_KANDOWN.md always matches the npm package source.
 *             Run manually with: node scripts/sync-agent-kandown.js
 *             Or via: pnpm sync:agent
 */
import { copyFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

const src = join(PKG_ROOT, 'templates', 'AGENT_KANDOWN.md');
const dest = join(PKG_ROOT, 'AGENT_KANDOWN.md');

if (!existsSync(src)) {
  console.error('Source template not found:', src);
  process.exit(1);
}

copyFileSync(src, dest);
console.log('Synced templates/AGENT_KANDOWN.md → AGENT_KANDOWN.md');
