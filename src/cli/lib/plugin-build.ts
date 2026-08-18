/**
 * @file Plugin bundler
 * @description Turns a plugin's TypeScript sources into the self-contained
 * JavaScript the browser can execute. Node loads `index.ts` directly through
 * jiti, but the web runtime imports `index.js` and every panel entry through a
 * Blob URL, and a Blob module can neither resolve sibling files nor run
 * TypeScript. Without this step a plugin works in the CLI and silently does
 * nothing in the board, which is the single most confusing failure in the whole
 * extension system.
 *
 * 📖 Bundling rules that are not negotiable:
 *   - `react` and `react-dom` are external. Panels receive the host React
 *     runtime as the `ui` prop; a second copy breaks hooks. A bundle that
 *     imports React is reported as an error, not a warning.
 *   - `kandown` is external. Extensions import types from it, and `import type`
 *     is erased, but a value import must not drag the CLI into the bundle.
 *   - Node builtins stay external so an index.ts that uses `node:fs` still
 *     builds; it simply will not run in standalone mode, which is the author's
 *     choice to make.
 *
 * @functions
 *  → buildPlugin — bundle index and panel entries for one plugin directory
 * @exports PluginBuildOutput, PluginBuildResult, buildPlugin
 * @see src/cli/lib/plugin-check.ts
 * @see src/lib/extensions/browser-runtime.ts
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

/** One emitted bundle. */
export interface PluginBuildOutput {
  entry: string;
  out: string;
  bytes: number;
}

export interface PluginBuildResult {
  ok: boolean;
  outputs: PluginBuildOutput[];
  errors: string[];
  warnings: string[];
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.jsx', '.mts'];

/** Source extensions esbuild should compile, in resolution order. */
function findSource(dir: string, stem: string): string | null {
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = join(dir, `${stem}${extension}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * 📖 Entry discovery is convention based and deliberately narrow: `index` plus
 * anything named `web*`. Guessing from the panel declarations would mean
 * executing the plugin before it compiles, which is exactly backwards.
 */
function discoverEntries(dir: string): Array<{ stem: string; source: string }> {
  const entries: Array<{ stem: string; source: string }> = [];
  const index = findSource(dir, 'index');
  if (index) entries.push({ stem: 'index', source: index });

  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return entries;
  }
  for (const name of names.sort()) {
    const extension = extname(name);
    if (!SOURCE_EXTENSIONS.includes(extension)) continue;
    const stem = basename(name, extension);
    if (!stem.startsWith('web')) continue;
    if (entries.some((entry) => entry.stem === stem)) continue;
    entries.push({ stem, source: join(dir, name) });
  }
  return entries;
}

/**
 * 📖 esbuild is imported lazily so the rest of the CLI never pays for it and so
 * a broken optional install degrades into a clear message instead of a stack
 * trace at startup.
 */
async function loadEsbuild(): Promise<typeof import('esbuild') | null> {
  try {
    return await import('esbuild');
  } catch {
    return null;
  }
}

/** Bundles every entry of a plugin directory. Never throws on user error. */
export async function buildPlugin(dir: string): Promise<PluginBuildResult> {
  const result: PluginBuildResult = { ok: true, outputs: [], errors: [], warnings: [] };
  const entries = discoverEntries(dir);
  if (entries.length === 0) {
    return { ...result, ok: false, errors: ['no TypeScript entry found (expected index.ts or web.tsx)'] };
  }

  const esbuild = await loadEsbuild();
  if (!esbuild) {
    return {
      ...result,
      ok: false,
      errors: ['esbuild is unavailable; reinstall kandown or run "npm install esbuild" in this project'],
    };
  }

  for (const entry of entries) {
    const out = join(dir, `${entry.stem}.js`);
    try {
      const built = await esbuild.build({
        entryPoints: [entry.source],
        outfile: out,
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        target: 'es2022',
        // 📖 `neutral` keeps the output browser-safe; these stay external so a
        // Node-flavoured plugin still compiles and a panel never ships React.
        external: ['react', 'react-dom', 'react/jsx-runtime', 'kandown', 'node:*'],
        jsx: 'automatic',
        legalComments: 'none',
        logLevel: 'silent',
        write: true,
      });
      for (const warning of built.warnings) result.warnings.push(`${entry.stem}: ${warning.text}`);

      const source = readFileSync(out, 'utf8');
      // 📖 An externalised React import survives in the output as a bare
      // specifier the Blob loader cannot resolve, so the panel would fail at
      // import time with an opaque browser error. Catch it here instead.
      if (/from\s*["']react(?:-dom|\/jsx-runtime)?["']/.test(source)) {
        result.errors.push(
          `${entry.stem}: bundle imports react; panels must use the "ui" prop instead of importing React`,
        );
        result.ok = false;
      }
      result.outputs.push({ entry: entry.source, out, bytes: Buffer.byteLength(source) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${entry.stem}: ${message.replace(/\n+/g, ' ').trim()}`);
      result.ok = false;
    }
  }

  return result;
}
