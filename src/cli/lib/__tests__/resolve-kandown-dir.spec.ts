/**
 * @file Regression tests for resolveKandownDir boundary rules
 * @description Pins down the three behaviors that prevent bare `kandown`
 * from silently attaching to a foreign project:
 *
 *  1. The upward walk does not cross the current git repository root.
 *  2. `$HOME` itself is never accepted as a project root unless the walk
 *     STARTED there, so a personal home board still works when you
 *     deliberately run `kandown` from `~`, but never from a random
 *     subdirectory under it.
 *  3. The walk stops at the filesystem root, never loops or throws.
 *
 * Each test fakes both the home directory and the project markers with a
 * disposable directory tree so no real `~/.kandown/` is touched.
 *
 * `@see` src/cli/lib/cli-shared.ts (resolveKandownDir)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface FakeHome {
  root: string;
  home: string;
  cleanup: () => void;
}

function makeFakeHome(): FakeHome {
  const root = mkdtempSync(join(tmpdir(), 'kandown-resolve-'));
  // 📖 Layout: <root>/<home>/... where <home> pretends to be the user's
  // $HOME. Inside we can drop `.kandown/kandown.json`, `.git`, or deeper
  // cwd fixtures without touching the real filesystem.
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  return {
    root,
    home,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function ensureProject(dir: string) {
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.kandown'), { recursive: true });
  writeFileSync(join(dir, '.kandown', 'kandown.json'), '{}');
}

function ensureGitRoot(dir: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.git'), 'gitdir: fake\n');
}

describe('resolveKandownDir boundaries', () => {
  let home: FakeHome;
  let resolveDir: typeof import('../cli-shared.js').resolveKandownDir;

  beforeEach(async () => {
    home = makeFakeHome();
    // 📖 `vi.doMock` is NOT hoisted, so it runs at beforeEach time and
    // lets us pin the per-test fake home. The resolver is then dynamically
    // imported so it picks up the patched `node:os` for this test only.
    vi.doMock('node:os', async (importOriginal) => {
      const mod = await importOriginal<typeof import('node:os')>();
      return { ...mod, homedir: () => home.home };
    });
    ({ resolveKandownDir: resolveDir } = await import('../cli-shared.js'));
  });

  afterEach(() => {
    home.cleanup();
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it('starts at $HOME still resolves the home board', () => {
    // 📖 The board lives in <$HOME>/.kandown/ — exactly what the resolver
    // builds its candidate path from.
    ensureProject(home.home);

    const resolved = resolveDir('.kandown', home.home);
    expect(resolved).toBe(join(home.home, '.kandown'));
    expect(existsSync(join(resolved, 'kandown.json'))).toBe(true);
  });

  it('walks up but stops at the git repository root', () => {
    // 📖 Layout:
    //   <home>/repo/.git           ← repo boundary
    //   <home>/repo/.kandown/...   ← project at repo root (must be found)
    //   <home>/repo/src/           ← cwd
    //   <home>/other/.kandown/...  ← a project that must NOT leak in
    ensureGitRoot(join(home.home, 'repo'));
    ensureProject(join(home.home, 'repo'));
    ensureProject(join(home.home, 'other'));

    const resolved = resolveDir('.kandown', join(home.home, 'repo', 'src'));
    expect(resolved).toBe(join(home.home, 'repo', '.kandown'));
  });

  it('never picks up $HOME .kandown from a subdirectory of $HOME', () => {
    // 📖 Home board at $HOME, no git repo anywhere, cwd inside $HOME.
    // The walk must not attach to the home board from below.
    ensureProject(join(home.home, '.kandown'));
    const cwd = join(home.home, 'Documents', 'work');
    mkdirSync(cwd, { recursive: true });

    const resolved = resolveDir('.kandown', cwd);
    expect(resolved).toBe(join(cwd, '.kandown'));
  });

  it('stops at the filesystem root and returns the cwd fallback', () => {
    // 📖 Empty tree: no .kandown anywhere -> walks all the way up then
    // returns the fallback. Must not throw.
    const resolved = resolveDir('.kandown', home.root);
    expect(resolved).toBe(join(home.root, '.kandown'));
  });

  it('still finds a project at the exact git root', () => {
    ensureGitRoot(join(home.home, 'repo'));
    ensureProject(join(home.home, 'repo'));

    const resolved = resolveDir('.kandown', join(home.home, 'repo'));
    expect(resolved).toBe(join(home.home, 'repo', '.kandown'));
  });
});
