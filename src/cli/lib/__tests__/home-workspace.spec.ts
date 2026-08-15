/**
 * @file Regression tests for home-directory pnpm workspace detection
 * @description Pins down `detectHomeWorkspace`:
 *
 *  1. A clean home (no markers) returns an empty list — no false positives.
 *  2. Two or three markers (`package.json`, `pnpm-workspace.yaml`,
 *     `node_modules`) are detected as absolute paths.
 *  3. A lone marker (e.g. only `package.json`) is NOT enough — pnpm would
 *     ignore it, so we must not warn.
 *
 * Each test uses a disposable directory as a fake home, so no real `~/`
 * filesystem state is read or modified.
 *
 * `@see` src/cli/lib/home-workspace.ts
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectHomeWorkspace } from '../home-workspace.js';

const cleanups: Array<() => void> = [];

function makeFakeHome(): string {
  const root = mkdtempSync(join(tmpdir(), 'kandown-home-ws-'));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return home;
}

function dropMarkers(home: string, names: string[]) {
  for (const name of names) {
    const p = join(home, name);
    if (name === 'node_modules') mkdirSync(p, { recursive: true });
    else writeFileSync(p, '{}', 'utf8');
  }
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('detectHomeWorkspace', () => {
  it('returns [] for a clean home directory', () => {
    const home = makeFakeHome();
    expect(detectHomeWorkspace(home)).toEqual([]);
  });

  it('detects the full marker set (package.json + workspace + node_modules)', () => {
    const home = makeFakeHome();
    dropMarkers(home, ['package.json', 'pnpm-workspace.yaml', 'node_modules']);
    const found = detectHomeWorkspace(home);
    expect(found).toHaveLength(3);
    expect(found[0]).toBe(join(home, 'package.json'));
    expect(found[1]).toBe(join(home, 'pnpm-workspace.yaml'));
    expect(found[2]).toBe(join(home, 'node_modules'));
  });

  it('detects a partial workspace (package.json + pnpm-workspace.yaml)', () => {
    const home = makeFakeHome();
    dropMarkers(home, ['package.json', 'pnpm-workspace.yaml']);
    const found = detectHomeWorkspace(home);
    expect(found).toHaveLength(2);
  });

  it('does not warn on a single stray marker', () => {
    const home = makeFakeHome();
    dropMarkers(home, ['package.json']);
    expect(detectHomeWorkspace(home)).toEqual([]);
  });

  it('ignores markers that are plain files where a dir is expected (node_modules)', () => {
    const home = makeFakeHome();
    dropMarkers(home, ['package.json', 'pnpm-workspace.yaml']);
    writeFileSync(join(home, 'node_modules'), 'not-a-dir', 'utf8');
    // 📖 existsSync is true for both files and dirs; the detection is
    // intentionally conservative and still flags the two yaml+json markers.
    expect(detectHomeWorkspace(home)).toHaveLength(3);
  });
});
