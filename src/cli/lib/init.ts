/**
 * @file Kandown Project Initializer Module
 * @description Creates .kandown/ configuration, copies singlefile HTML bundle,
 * initializes project-root ./tasks/ with welcome templates, and creates AGENT_KANDOWN.md.
 */

import { existsSync, readFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from './atomic-write';
import { getTasksDir } from './board-reader';
import { PKG_ROOT } from './updater';

function copyRecursive(src: string, dest: string): string[] {
  const errors: string[] = [];
  try {
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
    const entries = readdirSync(src);
    for (const entry of entries) {
      const srcPath = join(src, entry);
      const destPath = join(dest, entry);
      try {
        if (statSync(srcPath).isDirectory()) {
          errors.push(...copyRecursive(srcPath, destPath));
        } else if (!existsSync(destPath)) {
          copyFileSync(srcPath, destPath);
        }
      } catch (error) {
        errors.push(`${entry}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    errors.push(`${src}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return errors;
}

export function syncKandownAgentDoc(kandownDir: string): boolean {
  const source = join(PKG_ROOT, 'templates', 'AGENT_KANDOWN.md');
  const target = join(kandownDir, 'AGENT_KANDOWN.md');
  if (!existsSync(source)) return false;
  try {
    const expected = readFileSync(source, 'utf8');
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (existing === null || !existing.includes('# Kandown')) {
      atomicWriteFileSync(target, expected.endsWith('\n') ? expected : `${expected}\n`);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export function doInit(kandownDir: string): boolean {
  try {
    mkdirSync(kandownDir, { recursive: true });

    const htmlSrc = join(PKG_ROOT, 'dist', 'index.html');
    const htmlDest = join(kandownDir, 'kandown.html');
    if (existsSync(htmlSrc)) {
      copyFileSync(htmlSrc, htmlDest);
    }

    syncKandownAgentDoc(kandownDir);

    const templatesDir = join(PKG_ROOT, 'templates');
    if (existsSync(templatesDir)) {
      if (!existsSync(join(kandownDir, 'README.md')) && existsSync(join(templatesDir, 'README.md'))) {
        copyFileSync(join(templatesDir, 'README.md'), join(kandownDir, 'README.md'));
      }

      if (!existsSync(join(kandownDir, 'AGENT.md')) && existsSync(join(templatesDir, 'AGENT.md'))) {
        copyFileSync(join(templatesDir, 'AGENT.md'), join(kandownDir, 'AGENT.md'));
      }

      const tasksSrc = join(templatesDir, 'tasks');
      const tasksDest = getTasksDir(kandownDir);
      if (!existsSync(tasksDest) && existsSync(tasksSrc)) {
        copyRecursive(tasksSrc, tasksDest);
      }

      if (!existsSync(join(kandownDir, 'kandown.json')) && existsSync(join(templatesDir, 'kandown.json'))) {
        copyFileSync(join(templatesDir, 'kandown.json'), join(kandownDir, 'kandown.json'));
      }
    }
    return true;
  } catch (error) {
    console.error(`Init failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
