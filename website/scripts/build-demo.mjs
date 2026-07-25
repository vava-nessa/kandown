/**
 * @file website/scripts/build-demo.mjs
 * @description Builds the interactive demo from the real Kandown application
 * and copies it into `public/demo/app/`, where the `/demo` route embeds it.
 *
 * 📖 **Why this is a build step and not a checked-in artifact.** The demo's one
 * job is to be honest: what a visitor drags around must be the same code
 * `npx kandown` runs, at the version this site is describing. A committed bundle
 * would be a snapshot that silently rots — and a demo that misrepresents the
 * product is worse than no demo. So the site cannot be built without rebuilding
 * the app, and a failure here fails the deploy rather than shipping a stale one.
 *
 * 📖 **Where the app comes from.** The parent directory, i.e. this repository's
 * root. Vercel clones the whole repo and only changes the working directory to
 * `website/`, so the CLI sources are present in CI exactly as they are locally.
 * The parent has its own pnpm workspace, so its dependencies are installed
 * separately — that install is the slow part of this script and is skipped when
 * `node_modules` is already there.
 *
 * 📖 **What it writes.** Two things:
 *   - `public/demo/app/` — the chunked demo build (gitignored)
 *   - `src/generated/demo-meta.json` — `{ version, builtAt, available }`, so the
 *     page can state which version is running instead of implying "latest"
 *
 * Usage:
 *   node scripts/build-demo.mjs              # build, fail loudly on error
 *   node scripts/build-demo.mjs --if-missing # skip when already built (dev)
 *
 * Environment:
 *   KANDOWN_DEMO_SKIP=1  — skip entirely and mark the demo unavailable
 *
 * @functions
 *  → main — orchestrates resolve → install → build → copy → stamp
 *  → run — spawns a command, inheriting stdio, rejecting on non-zero exit
 *  → writeMeta — records what was built for the demo page to display
 *
 * @see website/src/routes/demo.tsx
 * @see vite.config.ts (the `demo` mode this script invokes)
 */

import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(websiteDir, '..');
const demoOut = join(websiteDir, 'public', 'demo', 'app');
const metaPath = join(websiteDir, 'src', 'generated', 'demo-meta.json');

const ifMissing = process.argv.includes('--if-missing');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** 📖 Inherit stdio so pnpm's own progress output is the build log — wrapping it adds nothing. */
function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

/**
 * 📖 `available: false` is a first-class outcome, not an error state: the demo
 * page reads this and renders an honest "temporarily unavailable" panel with the
 * install command, rather than an iframe pointed at a 404.
 */
async function writeMeta(meta) {
  await mkdir(dirname(metaPath), { recursive: true });
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

async function main() {
  if (process.env.KANDOWN_DEMO_SKIP === '1') {
    console.log('[demo] KANDOWN_DEMO_SKIP=1 — skipping the demo build.');
    await writeMeta({ available: false, reason: 'skipped', version: null, builtAt: null });
    return;
  }

  if (ifMissing && (await exists(join(demoOut, 'index.html')))) {
    console.log('[demo] Already built — skipping. Delete public/demo/ to force a rebuild.');
    return;
  }

  const rootPackageJson = join(repoRoot, 'package.json');
  if (!(await exists(rootPackageJson))) {
    throw new Error(
      `Cannot find the Kandown app at ${repoRoot}. The demo is built from the CLI sources in ` +
        'the parent directory; the website is not meant to be built outside the repository.',
    );
  }

  const pkg = JSON.parse(await readFile(rootPackageJson, 'utf8'));
  if (pkg.name !== 'kandown') {
    throw new Error(`Expected the parent package to be "kandown", found "${pkg.name}".`);
  }

  // 📖 The parent workspace is independent of this one. Installing it is by far
  // the slowest step, so skip it when the tree is already there — which is the
  // normal case locally and never the case on a cold CI build.
  if (!(await exists(join(repoRoot, 'node_modules')))) {
    console.log('[demo] Installing the app dependencies…');
    await run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], repoRoot);
  }

  console.log(`[demo] Building kandown@${pkg.version} in demo mode…`);
  await run('pnpm', ['run', 'build:demo'], repoRoot);

  const built = join(repoRoot, 'dist-demo');
  if (!(await exists(join(built, 'index.html')))) {
    throw new Error(`The demo build produced no index.html at ${built}.`);
  }

  // 📖 Remove first: a stale chunk left behind from a previous version would be
  // served happily by the CDN and is impossible to notice.
  await rm(demoOut, { recursive: true, force: true });
  await mkdir(dirname(demoOut), { recursive: true });
  await cp(built, demoOut, { recursive: true });

  await writeMeta({
    available: true,
    version: pkg.version,
    builtAt: new Date().toISOString(),
  });

  console.log(`[demo] Ready — kandown@${pkg.version} → public/demo/app/`);
}

main().catch(async (error) => {
  console.error(`[demo] ${error.message}`);
  // 📖 Leave a meta file behind so a `--if-missing` dev run still type-checks,
  // then fail: shipping the site without its demo should be a decision, not an
  // accident.
  if (!(await exists(metaPath))) {
    await writeMeta({ available: false, reason: 'build-failed', version: null, builtAt: null });
  }
  process.exit(1);
});
