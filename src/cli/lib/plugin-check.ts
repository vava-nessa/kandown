/**
 * @file Plugin validator
 * @description The closed feedback loop that lets an AI agent author a plugin
 * without a human in the middle. It loads the plugin against a synthetic board,
 * exercises every contribution it registered, and returns a structured verdict
 * where each failing check carries a `fix` sentence written to be actionable by
 * a model, not just readable by a person.
 *
 * 📖 Nothing here touches the real board. The host is built over an in-memory
 * `HostEnvironment` holding three synthetic tasks, so a gate that rewrites
 * frontmatter or a sync that hammers `setField` is observed rather than obeyed.
 * That is also what makes the checker safe to run on an untrusted plugin: it
 * loads in inspect mode, which skips the trust gate, but the plugin can only
 * reach a fake board through it.
 *
 * 📖 The panel check imports the *bundled* module through a data URL and renders
 * every exported component with a stub React runtime. It cannot prove a panel
 * looks right, but it catches the four failures that actually happen: no export,
 * wrong export shape, a throw on first render, and a bundled second React copy.
 *
 * @functions
 *  → checkPlugin — run every check for one plugin id
 *  → formatCheckReport — render a human-readable report
 * @exports CheckStatus, PluginCheck, PluginCheckReport, checkPlugin, formatCheckReport
 * @see src/cli/lib/plugin-build.ts
 * @see src/lib/extensions/host.ts
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { ExtensionHost, type HostEnvironment } from '../../lib/extensions/host';
import { discoverExtensions } from '../../lib/extensions/loader';
import { isAllowed } from '../../lib/extensions/permissions';
import { setField } from '../../lib/extensions/namespace';
import { parseTaskFile } from '../../lib/parser';
import { serializeTaskFile } from '../../lib/serializer';
import type { TaskLike } from '../../lib/extensions/types';
import { getCurrentVersion } from './updater';
import { loadConfig } from './config';
import { c } from './cli-shared';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface PluginCheck {
  id: string;
  status: CheckStatus;
  message: string;
  /** Present on `fail` and `warn`: what to change, phrased as an instruction. */
  fix?: string;
}

export interface PluginCheckReport {
  ok: boolean;
  id: string;
  dir: string | null;
  checks: PluginCheck[];
}

/** Three synthetic tasks: one per column shape a gate is likely to care about. */
function syntheticTasks(): TaskLike[] {
  const make = (id: string, title: string, status: string): TaskLike => ({
    id,
    frontmatter: { id, title, status, created: '2026-01-01', priority: 'P2' },
    plugins: undefined,
  });
  return [
    make('check-1', 'Synthetic backlog task', 'Backlog'),
    make('check-2', 'Synthetic active task', 'In Progress'),
    make('check-3', 'Synthetic finished task', 'Done'),
  ];
}

/** A stub React runtime: enough for a panel to render once and be observed. */
function stubUi(): Record<string, unknown> {
  const noop = () => undefined;
  return {
    createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
    Fragment: Symbol('Fragment'),
    useState: <T>(initial: T) => [typeof initial === 'function' ? (initial as () => T)() : initial, noop],
    // 📖 Effects run so a panel that explodes on mount is caught, but their
    // async results are dropped: the checker asserts "does not throw", not
    // "renders the right numbers".
    useEffect: (effect: () => unknown) => { try { effect(); } catch { /* reported by the caller */ } },
    useLayoutEffect: (effect: () => unknown) => { try { effect(); } catch { /* idem */ } },
    useMemo: <T>(factory: () => T) => factory(),
    useCallback: <T>(callback: T) => callback,
    useRef: <T>(initial: T) => ({ current: initial }),
    useReducer: <S>(_reducer: unknown, initial: S) => [initial, noop],
    useId: () => 'check-id',
    memo: <T>(component: T) => component,
  };
}

function check(id: string, status: CheckStatus, message: string, fix?: string): PluginCheck {
  return fix ? { id, status, message, fix } : { id, status, message };
}

/** Newest mtime among a set of paths, or 0 when none exist. */
function newestMtime(paths: string[]): number {
  let newest = 0;
  for (const path of paths) {
    try {
      newest = Math.max(newest, statSync(path).mtimeMs);
    } catch {
      // A missing source simply does not participate in the freshness check.
    }
  }
  return newest;
}

/**
 * 📖 A deliberately shallow source scan. It cannot prove which permissions a
 * plugin needs (that would require running every branch), but the four call
 * shapes below cover essentially all real usage, and reporting a *declared but
 * unused* permission is just as valuable: over-declaring is the habit that makes
 * a permission model meaningless.
 */
function scanPermissionUsage(source: string): { needs: string[]; uses: Record<string, boolean> } {
  const usesRead = /\.board\s*\.\s*(readAll|read)\s*\(/.test(source);
  const usesWrite = /\.setField\s*\(/.test(source);
  const usesFetch = /\.fetch\s*(\?\.)?\s*\(/.test(source);
  const needs: string[] = [];
  if (usesRead) needs.push('read:tasks');
  if (usesFetch) needs.push('net:*');
  return { needs, uses: { read: usesRead, write: usesWrite, fetch: usesFetch } };
}

/** Runs the full check suite for one plugin. Never throws. */
export async function checkPlugin(kandownDir: string, projectDir: string, id: string): Promise<PluginCheckReport> {
  const checks: PluginCheck[] = [];
  const discovered = discoverExtensions(projectDir);
  const found = discovered.find((entry) => (
    entry.manifestResult.ok ? entry.manifestResult.manifest.id === id : basename(entry.dir) === id
  ));

  if (!found) {
    return {
      ok: false,
      id,
      dir: null,
      checks: [check(
        'discovery',
        'fail',
        `no plugin "${id}" found under .kandown/extensions/ or ~/.kandown/extensions/`,
        `Create it with "kandown plugin create ${id}", or check the directory name.`,
      )],
    };
  }
  const dir = found.dir;

  // 1. manifest ------------------------------------------------------------
  if (!found.manifestResult.ok) {
    return {
      ok: false,
      id,
      dir,
      checks: [check(
        'manifest',
        'fail',
        found.manifestResult.error,
        'Fix manifest.json. Required: id (kebab-case), name, version, apiVersion (1).',
      )],
    };
  }
  const manifest = found.manifestResult.manifest;
  checks.push(check('manifest', 'pass', `manifest.json is valid (v${manifest.version}, apiVersion ${manifest.apiVersion})`));

  if (basename(dir) !== manifest.id) {
    checks.push(check(
      'manifest-dir',
      'warn',
      `directory is "${basename(dir)}" but the manifest id is "${manifest.id}"`,
      `Rename the directory to "${manifest.id}" so install and purge target the same namespace.`,
    ));
  }

  // 2. load the entry against a synthetic board ----------------------------
  const tasks = syntheticTasks();
  const writes: Array<{ taskId: string; key: string; value: unknown }> = [];
  const logs: string[] = [];
  const env: HostEnvironment = {
    projectDir,
    kandownVersion: getCurrentVersion(),
    config: loadConfig(kandownDir) as { extensions?: { restricted?: boolean } },
    readAll: async () => tasks,
    read: async (taskId) => tasks.find((task) => task.id === taskId) ?? null,
    applyField: async (taskId, extId, key, value) => {
      if (extId !== manifest.id) throw new Error(`refused a write to plugins.${extId}.*`);
      writes.push({ taskId, key, value });
    },
    log: {
      info: (message) => logs.push(message),
      warn: (message) => logs.push(`[warn] ${message}`),
      error: (message) => logs.push(`[error] ${message}`),
    },
  };

  const host = new ExtensionHost(env);
  await host.loadAll({ only: manifest.id, inspect: true });
  const loaded = host.get(manifest.id);

  if (!loaded || loaded.health !== 'enabled') {
    checks.push(check(
      'entry',
      'fail',
      loaded?.error ?? 'the plugin did not load',
      'The default export of index.ts must be a function receiving the kd API, and must not throw while registering.',
    ));
    return { ok: false, id: manifest.id, dir, checks };
  }
  checks.push(check('entry', 'pass', 'index loaded and the factory ran'));

  // 3. contributions -------------------------------------------------------
  const summary = host.installedSummary().find((entry) => entry.id === manifest.id);
  const counts = {
    fields: summary?.fields.length ?? 0,
    panels: summary?.panels.length ?? 0,
    commands: summary?.commands.length ?? 0,
    gates: summary?.gates ?? 0,
    syncs: summary?.syncs ?? 0,
  };
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    checks.push(check(
      'contributions',
      'fail',
      'the factory registered nothing',
      'Call at least one of contributeField, contributeWebPanel, contributeCommand, contributeGate or contributeSync.',
    ));
  } else {
    checks.push(check(
      'contributions',
      'pass',
      `${counts.fields} field(s), ${counts.panels} panel(s), ${counts.commands} command(s), ${counts.gates} gate(s), ${counts.syncs} sync(s)`,
    ));
  }

  // 4. permissions ---------------------------------------------------------
  const sources = ['index.ts', 'index.tsx', 'index.js', 'index.mjs']
    .map((name) => join(dir, name))
    .filter((path) => existsSync(path));
  const sourceText = sources.map((path) => readFileSync(path, 'utf8')).join('\n');
  const declared = manifest.permissions ?? [];
  const usage = scanPermissionUsage(sourceText);
  const missing: string[] = [];
  for (const permission of usage.needs) {
    if (!isAllowed(declared, permission)) missing.push(permission);
  }
  // 📖 A registered field needs the write permission even when the plugin never
  // calls `setField` itself: editing it in the drawer goes through
  // `host.setFieldValue`, which enforces the same permission on the user's
  // behalf. Without this, every field-only plugin would be told to drop the one
  // permission that makes its field editable.
  const needsWrite = usage.uses.write || counts.fields > 0;
  if (needsWrite && !declared.some((entry) => entry === '*' || entry.startsWith(`write:field:plugins.${manifest.id}.`))) {
    missing.push(`write:field:plugins.${manifest.id}.*`);
  }
  const unused = declared.filter((permission) => {
    if (permission === '*') return false;
    if (permission === 'read:tasks') return !usage.uses.read;
    if (permission.startsWith('net:')) return !usage.uses.fetch;
    if (permission.startsWith('write:field:')) return !needsWrite;
    return false;
  });

  if (missing.length > 0) {
    checks.push(check(
      'permissions',
      'fail',
      `code calls capabilities the manifest does not declare: ${missing.join(', ')}`,
      `Add ${JSON.stringify(missing)} to "permissions" in manifest.json.`,
    ));
  } else if (unused.length > 0) {
    checks.push(check(
      'permissions',
      'warn',
      `declared but never used: ${unused.join(', ')}`,
      `Remove ${JSON.stringify(unused)} from "permissions"; an over-broad declaration makes the model meaningless.`,
    ));
  } else if (declared.includes('*')) {
    checks.push(check(
      'permissions',
      'warn',
      'the manifest declares "*"',
      'Replace "*" with the exact permissions used: read:tasks, write:field:plugins.<id>.*, net:*.',
    ));
  } else {
    checks.push(check('permissions', 'pass', declared.length > 0 ? `declares ${declared.join(', ')}` : 'needs no permission'));
  }

  // 5. bundle freshness ----------------------------------------------------
  const bundleTargets: Array<{ stem: string; sources: string[] }> = [{ stem: 'index', sources: sources.filter((path) => extname(path) === '.ts' || extname(path) === '.tsx') }];
  for (const panel of summary?.panels ?? []) {
    const stem = basename(panel.entry.replace(/^\.\//, ''), '.js');
    if (bundleTargets.some((target) => target.stem === stem)) continue;
    bundleTargets.push({
      stem,
      sources: ['.tsx', '.ts', '.jsx'].map((extension) => join(dir, `${stem}${extension}`)).filter((path) => existsSync(path)),
    });
  }

  const staleBundles: string[] = [];
  const missingBundles: string[] = [];
  for (const target of bundleTargets) {
    const out = join(dir, `${target.stem}.js`);
    if (!existsSync(out)) {
      if (target.sources.length > 0 || target.stem !== 'index') missingBundles.push(`${target.stem}.js`);
      continue;
    }
    if (target.sources.length > 0 && statSync(out).mtimeMs < newestMtime(target.sources)) {
      staleBundles.push(`${target.stem}.js`);
    }
  }
  if (missingBundles.length > 0) {
    checks.push(check(
      'bundle',
      'fail',
      `missing browser bundle(s): ${missingBundles.join(', ')}`,
      `Run "kandown plugin build ${manifest.id}". The web UI can only execute bundled JavaScript.`,
    ));
  } else if (staleBundles.length > 0) {
    checks.push(check(
      'bundle',
      'warn',
      `bundle(s) older than their source: ${staleBundles.join(', ')}`,
      `Run "kandown plugin build ${manifest.id}" so the browser sees your latest changes.`,
    ));
  } else {
    checks.push(check('bundle', 'pass', bundleTargets.length > 0 ? 'browser bundles are present and current' : 'nothing to bundle'));
  }

  // 6. panels --------------------------------------------------------------
  if ((summary?.panels.length ?? 0) === 0) {
    checks.push(check('panel', 'skip', 'no web panel declared'));
  } else {
    for (const panel of summary?.panels ?? []) {
      const entry = panel.entry.replace(/^\.\//, '');
      const out = join(dir, entry);
      if (!existsSync(out)) {
        checks.push(check(
          `panel:${panel.id}`,
          'fail',
          `declared entry ${panel.entry} does not exist`,
          `Run "kandown plugin build ${manifest.id}", or point entry at the bundle it produces.`,
        ));
        continue;
      }
      const source = readFileSync(out, 'utf8');
      if (/from\s*["']react["']/.test(source)) {
        checks.push(check(
          `panel:${panel.id}`,
          'fail',
          'the panel bundle imports react',
          'Delete the React import and use the "ui" prop (ui.createElement, ui.useState, ui.useEffect).',
        ));
        continue;
      }
      try {
        const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`) as {
          default?: unknown;
          panels?: Record<string, unknown>;
        };
        const component = module.panels?.[panel.id] ?? module.default;
        if (typeof component !== 'function') {
          checks.push(check(
            `panel:${panel.id}`,
            'fail',
            `the module exports no component for panel "${panel.id}"`,
            `Export it as "export const panels = { ${panel.id}: Component }" or as the default export.`,
          ));
          continue;
        }
        (component as (props: unknown) => unknown)({
          task: tasks[0],
          api: {
            readField: () => undefined,
            readAllTasks: async () => tasks,
            setField: async () => undefined,
            refresh: async () => undefined,
          },
          ui: stubUi(),
        });
        checks.push(check(`panel:${panel.id}`, 'pass', 'panel module renders once without throwing'));
      } catch (error) {
        checks.push(check(
          `panel:${panel.id}`,
          'fail',
          `panel failed to load or render: ${error instanceof Error ? error.message : String(error)}`,
          'Keep the module self-contained and side-effect free at import time; three render failures quarantine the plugin.',
        ));
      }
    }
  }

  // 7. runtime dispatch ----------------------------------------------------
  if (counts.gates === 0 && counts.syncs === 0 && counts.commands === 0) {
    checks.push(check('runtime', 'skip', 'no gate, sync or command to exercise'));
  } else {
    const failuresBefore = host.get(manifest.id)?.failures ?? 0;
    for (const task of tasks) {
      for (const to of ['Todo', 'In Progress', 'Done']) {
        await host.runGates({ type: 'task:beforeMove', task, from: String(task.frontmatter.status ?? ''), to });
      }
    }
    for (const task of tasks) {
      host.dispatchSync({ type: 'task:afterMove', task, from: 'In Progress', to: 'Done' });
      host.dispatchLifecycle({ type: 'task:afterMove', task, from: 'In Progress', to: 'Done' });
    }
    const commandErrors: string[] = [];
    for (const name of summary?.commands ?? []) {
      try {
        await host.runCommand(name, '');
      } catch (error) {
        commandErrors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // Syncs are fire and forget; give their microtasks a turn before reading health.
    await new Promise((resolve) => setTimeout(resolve, 25));
    const after = host.get(manifest.id);
    const newFailures = (after?.failures ?? 0) - failuresBefore;

    if (commandErrors.length > 0) {
      // 📖 A denied capability is by far the most common throw, and "handle your
      // errors" would send the author looking in the wrong file. Name the
      // permission instead, since that is the actual edit to make.
      const denied = commandErrors
        .map((entry) => /permission denied: (\S+)/.exec(entry)?.[1])
        .filter((permission): permission is string => Boolean(permission));
      checks.push(check(
        'runtime',
        'fail',
        `contributed command threw: ${commandErrors.join('; ')}`,
        denied.length > 0
          ? `Declare ${JSON.stringify([...new Set(denied)])} in "permissions" in manifest.json.`
          : 'Handle your own errors inside the command handler and report them with ctx.log.error.',
      ));
    } else if (newFailures > 0 || after?.health === 'quarantined') {
      checks.push(check(
        'runtime',
        'fail',
        `${newFailures} handler failure(s) against a synthetic board: ${after?.error ?? 'see logs'}`,
        'A throwing gate fails open and a throwing sync is swallowed. Guard your handlers and log with ctx.log.warn.',
      ));
    } else {
      checks.push(check(
        'runtime',
        'pass',
        `gates, syncs and commands ran clean on 3 synthetic tasks (${writes.length} field write(s))`,
      ));
    }
  }

  // 8. namespace round-trip ------------------------------------------------
  if (writes.length === 0) {
    checks.push(check('roundtrip', 'skip', 'the plugin wrote no field during the run'));
  } else {
    const problems: string[] = [];
    for (const write of writes) {
      const frontmatter = setField({ id: 'check-1', title: 'Round trip', status: 'Todo' }, manifest.id, write.key, write.value);
      const reparsed = parseTaskFile(serializeTaskFile(frontmatter as never, 'body')).frontmatter as Record<string, unknown>;
      const namespace = (reparsed.plugins as Record<string, Record<string, unknown>> | undefined)?.[manifest.id];
      if (!namespace || !(write.key in namespace)) {
        problems.push(`${write.key} disappeared through the serializer`);
        continue;
      }
      if (String(namespace[write.key]) !== String(write.value)) {
        problems.push(`${write.key}: wrote ${JSON.stringify(write.value)}, read back ${JSON.stringify(namespace[write.key])}`);
      }
    }
    if (problems.length > 0) {
      checks.push(check(
        'roundtrip',
        'fail',
        problems.join('; '),
        'Store plain JSON scalars or plain objects under plugins.<id>.*; class instances, undefined and functions do not survive the file.',
      ));
    } else {
      checks.push(check('roundtrip', 'pass', `${writes.length} field write(s) survive the frontmatter round-trip`));
    }
  }

  return {
    ok: checks.every((entry) => entry.status !== 'fail'),
    id: manifest.id,
    dir,
    checks,
  };
}

const MARK: Record<CheckStatus, string> = {
  pass: `${c.green}✓${c.reset}`,
  fail: `${c.red}✗${c.reset}`,
  warn: `${c.yellow}!${c.reset}`,
  skip: `${c.dim}-${c.reset}`,
};

/** Renders a report for a terminal, with the fix lines an agent should act on. */
export function formatCheckReport(report: PluginCheckReport): string {
  const lines: string[] = [];
  for (const entry of report.checks) {
    lines.push(`${MARK[entry.status]} ${c.bold}${entry.id.padEnd(14)}${c.reset} ${entry.message}`);
    if (entry.fix) lines.push(`  ${c.dim}↳ fix: ${entry.fix}${c.reset}`);
  }
  const failed = report.checks.filter((entry) => entry.status === 'fail').length;
  const warned = report.checks.filter((entry) => entry.status === 'warn').length;
  lines.push('');
  lines.push(report.ok
    ? `${c.green}${report.id} passes${c.reset}${warned > 0 ? ` ${c.dim}(${warned} warning(s))${c.reset}` : ''}`
    : `${c.red}${report.id} fails ${failed} check(s)${c.reset}`);
  return lines.join('\n');
}
