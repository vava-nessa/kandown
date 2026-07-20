#!/usr/bin/env node
/**
 * @file Kandown CLI entrypoint
 * @description Implements `kandown`, `kandown board`, `kandown init`,
 * `kandown update`, and `kandown settings` for serving the local web UI,
 * launching the terminal board, installing templates, and managing project
 * configuration.
 *
 * 📖 The CLI is intentionally dependency-light: it copies built artifacts and
 * markdown templates, then wires agent docs into the host project when possible.
 *
 * @functions
 *  → help — prints CLI usage
 *  → copyRecursive — copies template directories
 *  → findAgentsFile — finds existing AI-agent instruction files
 *  → appendAgentReference — injects a Kandown task-management reference
 *  → createAgentsFileIfMissing — creates AGENTS.md when none exists
 *  → parseArgs — parses shared CLI flags
 *  → resolveKandownBin — resolves the global kandown binary path for respawn
 *  → semverGt — compares two semver strings
 *  → checkForUpdate — non-blocking auto-updater with lock file and graceful fallback
 *  → getProjectRoot — returns the project root (parent of .kandown/)
 *  → getTasksDir — returns the project-root tasks/ path
 *  → migrateTasksToTopLevel — silently moves legacy .kandown/tasks/ → ./tasks/
 *  → cmdInit — installs `.kandown` and top-level `tasks/`
 *  → cmdUpdate — refreshes installed kandown.html
 *  → injectServerRoot — injects the CLI server root into single-file HTML
 *  → createServeServer — creates the local zero-dependency HTTP server
 *  → readDaemonMetadata — reads per-project daemon status metadata
 *  → startDaemon — starts/reconnects the per-project web daemon
 *  → stopDaemon — stops the per-project web daemon
 *  → cmdDaemon — daemon lifecycle command router
 *  → cmdServe — starts/reconnects the daemon, opens web UI, and launches the board TUI
 *  → main — dispatches CLI commands
 *
 * @exports none
 */
/* eslint-disable no-console */
// 📖 DEV=false prevents Ink from loading react-devtools-core (CJS-only, breaks ESM).
// Must be set BEFORE any imports because ESM hoists all import statements.
process.env.DEV = 'false';
// 📖 Polyfill browser globals that some bundled modules expect.
if (typeof globalThis.self === 'undefined') Object.defineProperty(globalThis, 'self', { value: globalThis });
if (typeof globalThis.window === 'undefined') Object.defineProperty(globalThis, 'window', { value: globalThis });
// 📖 Make require() available in this ESM module so bundled __require() shims work.
// tsup's __require checks `typeof require !== "undefined"` — this makes it truthy.
import { createRequire } from 'node:module';
globalThis.require = createRequire(import.meta.url);

import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  renameSync,
  rmSync,
  openSync,
  writeSync,
  closeSync,
} from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { randomBytes } from 'node:crypto';
import { watch as watchFs } from 'chokidar';

// 📖 Global safety net: a stray exception or unhandled rejection prints a clean
// one-liner instead of a raw stack trace. The daemon (KANDOWN_DAEMON=1) logs
// and keeps serving — a single bad request must not take the web UI down.
// Set KANDOWN_DEBUG=1 to get the full stack.
function handleFatal(kind, e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`\x1b[31m✗\x1b[0m kandown ${kind}: ${msg}`);
  if (process.env.KANDOWN_DEBUG && e instanceof Error) console.error(e.stack);
  if (process.env.KANDOWN_DAEMON !== '1') process.exit(1);
}
process.on('uncaughtException', (e) => handleFatal('crashed', e));
process.on('unhandledRejection', (e) => handleFatal('internal error', e));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, '..');
// 📖 Default localhost range for the zero-config `kandown` web UI server.
// 📖 Single source of truth for the daemon port range. Each kandown project
// gets its own daemon on the first free port in this range, so multiple
// projects can run in parallel (A=2048, B=2050, C=2051, ...).
const START_PORT_RANGE = 2048;
const END_PORT_RANGE = 2150;
const DAEMON_FILE = 'daemon.json';

/**
 * 📖 Ports that Chromium/Firefox/Safari refuse to load (net::ERR_UNSAFE_PORT).
 * These are reserved for well-known services (NFS, ssh, smtp, X11, ...).
 * Browsers block navigation to them with no recourse, so a daemon listening
 * on one of these appears dead in the browser even though it serves fine via
 * curl. We MUST skip them when allocating ports. The most common victim in
 * our 2048+ range is 2049 (NFS), which silently broke the 2nd concurrent
 * kandown project. Sourced from Chromium's net/base/port_util.cc restricted
 * ports list (stable, updated rarely).
 */
const BROWSER_UNSAFE_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77,
  79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123,
  135, 139, 143, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 993, 995, 1720, 1723, 2049, 3659,
  4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080,
]);
function isBrowserUnsafePort(port) {
  return BROWSER_UNSAFE_PORTS.has(port);
}

// 📖 Get current CLI version from package.json at PKG_ROOT
function getCurrentVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
    return pkg.version;
  } catch { return null; }
}

/**
 * 📖 Resolves the kandown binary path for respawning after an update.
 * Tries, in order: npm global bin → pnpm global bin → process.execPath fallback.
 * @returns {string|null} Absolute path to the kandown binary, or null.
 */
function resolveKandownBin() {
  try {
    const npmBin = String(execSync('npm config get prefix 2>/dev/null', {
      timeout: 3000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    })).trim();
    if (existsSync(join(npmBin, 'bin', 'kandown'))) return join(npmBin, 'bin', 'kandown');
  } catch { /* npm not available */ }
  try {
    const pnpmBin = String(execSync('pnpm config get prefix 2>/dev/null', {
      timeout: 3000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    })).trim();
    if (existsSync(join(pnpmBin, 'bin', 'kandown'))) return join(pnpmBin, 'bin', 'kandown');
  } catch { /* pnpm not available */ }
  return null;
}

/**
 * 📖 Compares two semver strings (major.minor.patch, optional -prerelease).
 * Prerelease-safe: "0.18.0-beta.1" no longer parses as NaN — the numeric
 * triple is compared first, and on a tie a release outranks a prerelease.
 * @returns {number} 1 if a > b, -1 if a < b, 0 if equal.
 */
function semverGt(a, b) {
  const parse = (v) => {
    const [core, ...pre] = String(v).replace(/^v/, '').split('-');
    return { nums: core.split('.').map(n => Number(n) || 0), pre: pre.length > 0 };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((pa.nums[i] || 0) > (pb.nums[i] || 0)) return 1;
    if ((pa.nums[i] || 0) < (pb.nums[i] || 0)) return -1;
  }
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && !pb.pre) return -1;
  return 0;
}

/**
 * 📖 Update-check throttle: remembers the last successful registry check in a
 * small cache file next to the package. The network check runs at most once
 * per 24h — `kandown` stays fast (and fully offline-silent) the rest of the
 * time. Cache write failures are ignored (read-only installs just check more
 * often, which is the pre-throttle behavior).
 */
const UPDATE_CHECK_CACHE = join(PKG_ROOT, '.update-check.json');
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function updateCheckedRecently() {
  try {
    const raw = JSON.parse(readFileSync(UPDATE_CHECK_CACHE, 'utf8'));
    return Number.isFinite(raw?.lastCheck) && Date.now() - raw.lastCheck < UPDATE_CHECK_INTERVAL_MS;
  } catch {
    return false;
  }
}

function rememberUpdateCheck() {
  try {
    writeFileSync(UPDATE_CHECK_CACHE, JSON.stringify({ lastCheck: Date.now() }), 'utf8');
  } catch { /* read-only install — check again next time */ }
}

/**
 * 📖 Check npm for a newer version and auto-update if outdated.
 *
 * Design principles:
 * - 🚀 Non-blocking: spawns npm check as a background child process.
 * - 🔒 Lock file: prevents concurrent update races when multiple kandown
 *   instances start simultaneously.
 * - 🛡️ Resilient: if the update fails for any reason (network, permissions,
 *   npm registry downtime), the current version continues normally.
 * - 🔄 Respawn: after a successful update, re-spawns the CLI with the same
 *   arguments so the user gets the new version immediately.
 * - 📦 Package manager agnostic: tries npm, then pnpm, for both the update
 *   and the binary resolution.
 *
 * Only activates when running from an installed npm package
 * (not local dev source, where `src/` exists in PKG_ROOT).
 */
async function checkForUpdate(argv = process.argv) {
  // 📖 Local dev — skip entirely
  if (existsSync(join(PKG_ROOT, 'src'))) return;

  // 📖 Opt-out for CI / controlled environments.
  if (process.env.KANDOWN_NO_UPDATE === '1') return;

  // 📖 Script context (piped/captured output): never surprise-update — a
  // respawn mid-pipeline would interleave output from two versions.
  if (!process.stdout.isTTY) return;

  // 📖 Throttle: the registry round-trip runs at most once per 24h, so the
  // command stays instant (and silent offline) the rest of the time.
  if (updateCheckedRecently()) return;

  const current = getCurrentVersion();
  if (!current) return;

  // 📖 Skip if a lock file exists — another kandown instance is already updating.
  // The lock auto-expires after 60 seconds to handle stale locks from crashed processes.
  const lockFile = join(PKG_ROOT, '.update.lock');
  const now = Date.now();
  try {
    if (existsSync(lockFile)) {
      const lockAge = now - statSync(lockFile).mtimeMs;
      if (lockAge < 60_000) return; // another process is handling the update
      unlinkSync(lockFile); // stale lock — remove it
    }
  } catch { /* ignore lock errors */ }

  // 📖 Step 1: Check latest version on npm registry (non-blocking).
  // We use `npm view` in a spawned child process with a short timeout.
  const latest = await new Promise((resolve) => {
    const child = spawn('npm', ['view', 'kandown', 'version'], {
      timeout: 6000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      // 📖 Detach so we can kill cleanly on timeout
      detached: false,
    });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', () => {}); // silence stderr
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code !== 0) return resolve(null);
      const v = stdout.trim().replace(/^"|"$/g, '');
      resolve(v || null);
    });
  });

  // 📖 A successful registry answer (even "up to date") arms the 24h throttle.
  // Offline / registry-down does NOT — we retry on the next interactive run.
  if (latest) rememberUpdateCheck();

  if (!latest || semverGt(current, latest) >= 0) return; // up to date or offline

  tuiDone('⚡', `Update available: ${c.dim}kandown ${current}${c.reset} → ${c.green}${latest}${c.reset}`);

  // 📖 Step 2: Create lock file to prevent concurrent updates.
  try { writeFileSync(lockFile, `${process.pid}\n${now}`, 'utf8'); } catch { /* ignore */ }

  // 📖 Step 3: Run the update via npm or pnpm with animated progress.
  tuiProgress(`Updating to ${latest}…`, 25);

  const updateOk = await new Promise((resolve) => {
    const tryInstall = (cmd) => {
      return new Promise((res) => {
        const child = spawn(cmd, ['install', '-g', 'kandown'], {
          timeout: 45000,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
          detached: false,
        });
        child.stderr.on('data', () => {}); // silence npm noise
        child.stdout.on('data', () => {});
        child.on('error', () => res(false));
        child.on('close', (code) => res(code === 0));
      });
    };
    tryInstall('npm').then((ok) => {
      if (ok) resolve(true);
      else tryInstall('pnpm').then(resolve);
    });
  });

  // 📖 Clean up lock file regardless of outcome.
  try { if (existsSync(lockFile)) unlinkSync(lockFile); } catch { /* ignore */ }

  if (!updateOk) {
    tuiDone('✗', `${c.yellow}Auto-update failed${c.reset} — continuing with current version`);
    log(`  Run ${c.cyan}npm install -g kandown${c.reset} to upgrade manually`);
    log('');
    return;
  }

  // 📖 Step 4: Verify the update actually landed.
  const postVersion = await new Promise((resolve) => {
    const child = spawn('npm', ['view', 'kandown', 'version'], {
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', () => {});
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code !== 0) return resolve(null);
      resolve(stdout.trim().replace(/^"|"$/g, '') || null);
    });
  });

  if (!postVersion || semverGt(postVersion, latest) < 0) {
    tuiDone('✗', `${c.yellow}Update did not apply${c.reset} — continuing with current version`);
    log(`  Run ${c.cyan}npm install -g kandown${c.reset} to upgrade manually`);
    log('');
    return;
  }

  tuiDone('✓', `${c.green}Updated to v${postVersion}${c.reset} — restarting…`);
  printBreakingChangeNotices(current, postVersion);
  log('');

  // 📖 Step 5: Respawn with the new version.
  // Pass --no-update-check to the child so it doesn't try to update again.
  const bin = resolveKandownBin();
  const childArgs = ['--no-update-check', ...argv.slice(2)];

  if (bin) {
    const child = spawn(bin, childArgs, {
      detached: true,
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.unref();
  } else {
    // 📖 Fallback: re-use the current binary path (works for npx).
    const child = spawn(process.argv[0], [process.argv[1], ...childArgs], {
      detached: true,
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.unref();
  }

  process.exit(0);
}

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

/**
 * 📖 One-time migration notices shown right after a successful auto-update,
 * when the jump crosses a release that changed user-facing behavior (i.e.
 * `fromVersion < notice.version <= toVersion`). Keeps upgraders from being
 * silently surprised by a removed command or a changed convention — full
 * details always live in CHANGELOG.md. Add an entry here for any future
 * breaking release; harmless no-op for anyone already past that version.
 */
const BREAKING_CHANGE_NOTICES = [
  {
    version: '0.18.0',
    lines: [
      `${c.yellow}⚠ Breaking change in v0.18.0:${c.reset}`,
      `  ${c.dim}•${c.reset} ${c.cyan}kandown shell <cmd>${c.reset} is gone — commands are now top-level: ${c.cyan}kandown list/show/create/move/assign/commit${c.reset}`,
      `  ${c.dim}•${c.reset} ${c.cyan}kandown init${c.reset} now injects one line into AGENTS.md/CLAUDE.md pointing agents at ${c.cyan}kandown work${c.reset} — existing projects keep their old block until you re-run ${c.cyan}kandown init${c.reset}`,
      `  ${c.dim}•${c.reset} New: ${c.cyan}kandown work${c.reset} prints the agent rules + a live board digest — the recommended way to brief an AI agent`,
      `  ${c.dim}Full changelog:${c.reset} https://github.com/vava-nessa/kandown/blob/main/CHANGELOG.md`,
    ],
  },
];

function printBreakingChangeNotices(fromVersion, toVersion) {
  for (const notice of BREAKING_CHANGE_NOTICES) {
    if (semverGt(fromVersion, notice.version) < 0 && semverGt(toVersion, notice.version) >= 0) {
      log('');
      for (const line of notice.lines) log(line);
    }
  }
}

/**
 * 📖 Version-seen tracker: catches breaking-change notices for upgrades that
 * DON'T go through checkForUpdate's own auto-update flow — a manual
 * `npm install -g kandown`, pnpm/yarn/bun global installs, or any future
 * package manager. Records the last version this install printed notices for
 * in a small cache file next to the package; on the next interactive launch,
 * any BREAKING_CHANGE_NOTICES entry crossed since then is shown once.
 * TTY-only and skipped for scripted commands — never fires in a script/CI.
 * First run after this mechanism ships has no prior cache, so it seeds
 * silently rather than guessing; the checkForUpdate path covers that specific
 * transition for auto-updaters, and every version from here on is covered.
 */
function getChangelogForVersion(version) {
  const changelogPath = join(PKG_ROOT, 'CHANGELOG.md');
  if (!existsSync(changelogPath)) return null;
  try {
    const text = readFileSync(changelogPath, 'utf8');
    const escapedVer = version.replace(/\./g, '\\.');
    const regex = new RegExp(`##\\s+${escapedVer}[\\s\\S]*?(?=\\n##\\s+|$)`, 'i');
    const match = text.match(regex);
    if (!match) return null;
    return match[0].trim();
  } catch {
    return null;
  }
}

function printVersionChangelog(version) {
  const section = getChangelogForVersion(version);
  if (!section) return;
  const lines = section.split('\n');
  log('');
  log(`  ${c.bold}${c.cyan}${lines[0].replace(/^##\s+/, '📋 Release ')}${c.reset}`);
  log(`  ${c.dim}${'─'.repeat(55)}${c.reset}`);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('- **')) {
      log(`    ${c.green}•${c.reset} ${line.slice(2)}`);
    } else {
      log(`      ${c.dim}${line}${c.reset}`);
    }
  }
  log('');
}

const VERSION_SEEN_CACHE = join(PKG_ROOT, '.version-seen.json');

function checkVersionSeenNotices() {
  if (!process.stdout.isTTY) return;
  const current = getCurrentVersion();
  if (!current) return;

  let lastSeen = null;
  try {
    const raw = JSON.parse(readFileSync(VERSION_SEEN_CACHE, 'utf8'));
    if (typeof raw?.lastSeen === 'string') lastSeen = raw.lastSeen;
  } catch { /* first run, or corrupted cache — treat as unknown */ }

  if (lastSeen && lastSeen !== current) {
    printVersionChangelog(current);
    printBreakingChangeNotices(lastSeen, current);
  }
  if (lastSeen !== current) {
    try { writeFileSync(VERSION_SEEN_CACHE, JSON.stringify({ lastSeen: current })); } catch { /* best-effort */ }
  }
}

/**
 * 📖 Atomic write (M6): write to a sibling temp file then rename over the
 * target. A crash/kill mid-write can no longer leave a truncated task file or
 * a corrupted kandown.json — rename is atomic on the same filesystem.
 */
function atomicWriteFileSync(path, content) {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, content, 'utf8');
    renameSync(tmp, path);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* nothing to clean */ }
    throw e;
  }
}

// 📖 Output contract (M2): stdout carries DATA ONLY (ids, JSON, tables, help)
// so `$(kandown create ...)` and `| jq` pipelines stay clean. Every
// decoration — status lines, warnings, errors, progress — goes to stderr.
/** Data output → stdout. Use ONLY for content the command was asked to produce. */
const out = (msg) => console.log(msg);
/** Decoration output → stderr (status, hints, banners). */
const log = (msg) => console.error(msg);
const success = (msg) => log(`${c.green}✓${c.reset} ${msg}`);
const info = (msg) => log(`${c.cyan}→${c.reset} ${msg}`);
const warn = (msg) => log(`${c.yellow}⚠${c.reset} ${msg}`);
const err = (msg) => log(`${c.red}✗${c.reset} ${msg}`);

// ─── TUI spinner & progress bar ─────────────────────────────────────────────
// 📖 Lightweight terminal animation helpers for the auto-updater.
// Uses ANSI escape codes (carriage return + clear line) to redraw in-place.
// Only animate when stdout is a TTY; otherwise fall back to plain text.

const _SP_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let _spTimer = null;
let _spIdx = 0;
// 📖 Animations are decorations → stderr, and only when stderr is a TTY.
const _isTTY = process.stderr.isTTY;

function _tuiClear() {
  process.stderr.write('\r\x1b[K');
}

/**
 * 📖 Start a time-estimated progress bar + spinner.
 * Shows a filling bar with percentage based on elapsed time.
 * Caps at 95% until the caller calls tuiDone().
 */
function tuiProgress(text, estimateSec = 25, barWidth = 15) {
  if (_spTimer) clearInterval(_spTimer);
  _spIdx = 0;
  _tuiClear();
  if (!_isTTY) { process.stderr.write(`  ${text}\n`); return; }
  const start = Date.now();
  _spTimer = setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;
    const pct = Math.min(Math.round((elapsed / estimateSec) * 100), 95);
    const filled = Math.round(barWidth * pct / 100);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    process.stderr.write(`\r\x1b[K${_SP_FRAMES[_spIdx % _SP_FRAMES.length]} ${text} ${bar} ${pct}%`);
    _spIdx++;
  }, 120);
}

/** Stop the current animation and print a final status line. */
function tuiDone(symbol, text) {
  if (_spTimer) { clearInterval(_spTimer); _spTimer = null; }
  if (_isTTY) {
    _tuiClear();
    process.stderr.write(`${symbol} ${text}\n`);
  } else {
    log(`${symbol} ${text}`);
  }
}

function help() {
  const v = getCurrentVersion() ?? '?';
  out(`
${c.bold}kandown${c.reset} ${c.dim}· file-based kanban backed by markdown${c.reset}
${c.dim}v${v}${c.reset}

${c.bold}Usage:${c.reset}
  npx kandown [command]

${c.bold}Commands:${c.reset}
  ${c.cyan}(none)${c.reset}      Start local web UI server + open the board TUI
  ${c.cyan}board${c.reset}       Open the interactive kanban board in the terminal
  ${c.cyan}init${c.reset}        Initialize .kandown/ in the current directory
  ${c.cyan}settings${c.reset}    Open the settings TUI
  ${c.cyan}daemon${c.reset}      Manage the per-project web daemon (start|stop|status)
  ${c.cyan}update${c.reset}      Update kandown.html to the latest version
  ${c.cyan}list${c.reset}        List tasks ${c.dim}(-s status, -a assignee, -t tag, -p priority, --json)${c.reset}
  ${c.cyan}show${c.reset}        Print a task's raw file content
  ${c.cyan}create${c.reset}      Create a task ${c.dim}(-p priority, -a assignee, -t tag, --to status)${c.reset}
  ${c.cyan}move${c.reset}        Move a task to a column (or "archived")
  ${c.cyan}assign${c.reset}      Assign / unassign a task
  ${c.cyan}commit${c.reset}      git add + commit the task files
  ${c.cyan}tasks${c.reset}       Full help for the commands above
  ${c.cyan}work${c.reset}        ${c.bold}For AI agents:${c.reset} print the agent rules + live board digest
  ${c.cyan}help${c.reset}        Show this help

${c.bold}Options:${c.reset}
  ${c.cyan}--port <n>${c.reset}  Preferred local HTTP port for ${c.cyan}kandown${c.reset} (default: ${START_PORT_RANGE}, auto-increments to ${END_PORT_RANGE})

${c.bold}Examples:${c.reset}
  ${c.dim}$${c.reset} npx kandown              ${c.dim}# local web server + board TUI${c.reset}
  ${c.dim}$${c.reset} npx kandown --port 3000  ${c.dim}# use a specific web UI port${c.reset}
  ${c.dim}$${c.reset} npx kandown board        ${c.dim}# board TUI only${c.reset}
  ${c.dim}$${c.reset} npx kandown daemon stop  ${c.dim}# stop this project's web daemon${c.reset}
  ${c.dim}$${c.reset} npx kandown init
  ${c.dim}$${c.reset} npx kandown init --path docs/kanban
  ${c.dim}$${c.reset} npx kandown init --no-agents
  ${c.dim}$${c.reset} npx kandown work         ${c.dim}# what an AI agent should run first${c.reset}
  ${c.dim}$${c.reset} npx kandown list --json
  ${c.dim}$${c.reset} npx kandown create "Refactor auth" -p P1
  ${c.dim}$${c.reset} npx kandown commit -m "tasks: refactor auth"
`);
}

/**
 * 📖 Resilient recursive copy used by `kandown init` (t113).
 * Returns the list of per-entry error messages; an empty array means a fully
 * clean copy. A partially-failed init no longer leaves the user with no clue
 * about what went wrong — the caller reports each failure.
 */
function copyRecursive(src, dest, errors = []) {
  if (!existsSync(src)) return errors;
  try {
    mkdirSync(dest, { recursive: true });
  } catch (e) {
    errors.push(`Failed to create directory ${dest}: ${e.message}`);
    return errors;
  }
  let entries;
  try {
    entries = readdirSync(src);
  } catch (e) {
    errors.push(`Failed to read ${src}: ${e.message}`);
    return errors;
  }
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    try {
      if (statSync(srcPath).isDirectory()) {
        copyRecursive(srcPath, destPath, errors);
      } else {
        copyFileSync(srcPath, destPath);
      }
    } catch (e) {
      // 📖 One unreadable / unwritable file shouldn't abort the whole init —
      // record the error and keep copying the rest (t113).
      errors.push(`Failed to copy ${srcPath}: ${e.message}`);
    }
  }
  return errors;
}

function findAgentsFile(cwd) {
  const candidates = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.github/copilot-instructions.md'];
  for (const cand of candidates) {
    const p = join(cwd, cand);
    if (existsSync(p)) return cand;
  }
  return null;
}

function appendAgentReference(cwd, agentsFile, kandownPath) {
  const filePath = join(cwd, agentsFile);
  const marker = '<!-- kandown:agent-ref -->';
  let existing;
  try {
    existing = readFileSync(filePath, 'utf8');
  } catch (e) {
    // 📖 TOCTOU: file existed at the check but vanished or became unreadable.
    // Warn and skip rather than crashing init (t113).
    warn(`Could not read ${agentsFile} (${e.message}); skipping agent reference.`);
    return false;
  }

  if (existing.includes(marker)) {
    info(`${agentsFile} already references the kandown (skipped)`);
    return false;
  }

  const ref = `

${marker}
## Task management

This project uses **kandown** for task management. **Always run \`kandown work\` when starting a new task** — it prints the current rules and board state, kept in sync with the installed CLI version. (Tasks live in \`./tasks/*.md\`.)
`;

  try {
    writeFileSync(filePath, existing + ref, 'utf8');
    return true;
  } catch (e) {
    warn(`Could not append agent reference to ${agentsFile} (${e.message}).`);
    return false;
  }
}

function createAgentsFileIfMissing(cwd, kandownPath) {
  const agentsPath = join(cwd, 'AGENTS.md');
  if (existsSync(agentsPath)) return false;

  const content = `# Agent instructions

<!-- kandown:agent-ref -->
## Task management

This project uses **kandown** for task management. **Always run \`kandown work\` when starting a new task** — it prints the current rules and board state, kept in sync with the installed CLI version. (Tasks live in \`./tasks/*.md\`.)
`;
  writeFileSync(agentsPath, content, 'utf8');
  return true;
}

function parseArgs(argv) {
  const args = { path: '.kandown', noAgents: false, force: false, port: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--path') args.path = argv[++i];
    else if (a === '--port') args.port = argv[++i];
    else if (a === '--no-agents') args.noAgents = true;
    else if (a === '--force' || a === '-f') args.force = true;
  }
  return args;
}

/**
 * 📖 Returns the absolute path of the project root (parent of the kandown
 * config dir). Tasks live at the project root in `./tasks/`, not inside
 * `.kandown/tasks/`. Used by every code path that touches task files.
 * @param {string} kandownDir absolute path to the kandown config dir
 * @returns {string} absolute path to the project root
 */
function getProjectRoot(kandownDir) {
  return dirname(kandownDir);
}

/**
 * 📖 Returns the absolute path of the tasks directory at the project root.
 * Mirrors the File System Access layout: `./tasks/` is a sibling of `.kandown/`.
 * @param {string} kandownDir absolute path to the kandown config dir
 * @returns {string} absolute path to `./tasks/`
 */
function getTasksDir(kandownDir) {
  return join(getProjectRoot(kandownDir), 'tasks');
}

/**
 * 📖 Silently migrates task files from the legacy `.kandown/tasks/` location
 * to the new top-level `./tasks/` location. Idempotent: returns
 * `{ moved, cleanedUp }` describing what was done (or nothing).
 *
 * Rules:
 *  - Never throw — failures are logged and skipped so a single bad file
 *    doesn't block the rest of the migration.
 *
 * @param {string} kandownDir absolute path to the kandown config dir
 * @returns {{ moved: number, cleanedUp: boolean, skipped: boolean }}
 */
function migrateTasksToTopLevel(kandownDir) {
  const oldDir = join(kandownDir, 'tasks');
  const newDir = getTasksDir(kandownDir);
  const result = { moved: 0, cleanedUp: false, skipped: false };

  if (!existsSync(oldDir)) return result;

  // 📖 Check FIRST whether the legacy dir actually has anything to migrate
  // (top-level .md files or an archive/ subfolder with .md files). A stray
  // empty `.kandown/tasks/` — common on old/incomplete installs — has
  // nothing worth protecting, so it should just get cleaned up regardless
  // of what's in `./tasks/`, instead of being misreported as a "conflict".
  const oldMdFiles = readdirSync(oldDir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.md'));
  const oldArchiveDir = join(oldDir, 'archive');
  const oldArchiveHasMd = existsSync(oldArchiveDir)
    && readdirSync(oldArchiveDir, { withFileTypes: true }).some(e => e.isFile() && e.name.endsWith('.md'));

  if (oldMdFiles.length === 0 && !oldArchiveHasMd) {
    return cleanupLegacyTasksDir(kandownDir, result);
  }

  if (!existsSync(newDir)) mkdirSync(newDir, { recursive: true });

  // 📖 If the new location already has any .md file, don't touch anything.
  // The user is in a hybrid state and we should not clobber their work.
  const existingNew = existsSync(newDir)
    ? readdirSync(newDir).filter(n => n.endsWith('.md'))
    : [];
  if (existingNew.length > 0) {
    result.skipped = true;
    return result;
  }

  for (const entry of oldMdFiles) {
    try {
      renameSync(join(oldDir, entry.name), join(newDir, entry.name));
      result.moved += 1;
    } catch (e) {
      warn(`migrate: could not move ${entry.name} (${e.code ?? e.message})`);
    }
  }

  return migrateArchive(kandownDir, result);
}

/**
 * 📖 Helper that moves the legacy `archive/` subfolder to the new location.
 * Called from migrateTasksToTopLevel after the active files have been moved.
 */
function migrateArchive(kandownDir, result) {
  const oldArchive = join(kandownDir, 'tasks', 'archive');
  const newArchive = join(getTasksDir(kandownDir), 'archive');
  if (!existsSync(oldArchive)) return cleanupLegacyTasksDir(kandownDir, result);

  if (!existsSync(newArchive)) mkdirSync(newArchive, { recursive: true });
  for (const entry of readdirSync(oldArchive, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        renameSync(join(oldArchive, entry.name), join(newArchive, entry.name));
        result.moved += 1;
      } catch (e) {
        warn(`migrate: could not move archive/${entry.name} (${e.code ?? e.message})`);
      }
    }
  }

  return cleanupLegacyTasksDir(kandownDir, result);
}

/**
 * 📖 Removes the legacy `.kandown/tasks/` directory only if it is empty.
 * Preserves any leftover non-md files (e.g. `.scratch/` notes) so we never
 * delete user data the migration didn't move.
 */
function cleanupLegacyTasksDir(kandownDir, result) {
  const oldDir = join(kandownDir, 'tasks');
  if (!existsSync(oldDir)) return result;
  const remaining = readdirSync(oldDir);
  if (remaining.length === 0) {
    try {
      // 📖 fs.rmSync requires { recursive: true } to remove a directory at
      // all — even an already-confirmed-empty one — or it throws EISDIR.
      // `remaining.length === 0` just verified above makes this safe.
      rmSync(oldDir, { recursive: true });
      result.cleanedUp = true;
    } catch { /* directory not empty or platform limitation — leave it */ }
  }
  return result;
}

/**
 * @returns {{ kandownDir: string, alreadyExisted: boolean }} — resolves the
 * kandown directory and auto-inits it if it doesn't exist (no prompt, silent init).
 * Also performs a one-time silent migration of tasks from `.kandown/tasks/` to
 * the project root `./tasks/` on first access of a legacy project.
 */
function ensureKandownDir(rawArgs) {
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const kandownDir = resolve(cwd, args.path);

  if (existsSync(kandownDir)) {
    // 📖 Silent one-time migration: move any legacy `.kandown/tasks/*.md` to
    // the project-root `./tasks/`. Idempotent — safe to call on every startup.
    const migration = migrateTasksToTopLevel(kandownDir);
    if (migration.moved > 0) {
      success(`Migrated ${migration.moved} task${migration.moved === 1 ? '' : 's'} from .kandown/tasks/ to ./tasks/`);
      if (migration.cleanedUp) info('Removed empty .kandown/tasks/ folder');
    } else if (migration.skipped) {
      info('Both .kandown/tasks/ and ./tasks/ have files — leaving both in place');
    }
    return { kandownDir, alreadyExisted: true };
  }

  log('');
  info(`No .kandown/ found — auto-installing...`);
  doInit(args, cwd, args.path, kandownDir);
  return { kandownDir, alreadyExisted: false };
}

/**
 * Performs the actual init work. Returns on error (does not exit).
 * @returns {boolean} true if init succeeded, false otherwise.
 */
function doInit(args, cwd, kandownPath, kandownDir) {
  mkdirSync(kandownDir, { recursive: true });

  const htmlSrc = join(PKG_ROOT, 'dist', 'index.html');
  const htmlDest = join(kandownDir, 'kandown.html');
  if (!existsSync(htmlSrc)) {
    err(`Missing build output at ${htmlSrc}. Did you run 'npm run build'?`);
    return false;
  }
  copyFileSync(htmlSrc, htmlDest);
  success('kandown.html');

  // 📖 AGENT.md and AGENT_KANDOWN.md are intentionally NOT copied into new
  // projects anymore. Both `kandown work` and the TUI's agent launcher (`a`)
  // now read the rules straight from this package's templates/AGENT_KANDOWN.md
  // at call time — a per-project copy would only go stale the moment the
  // package updates, with nothing to keep it in sync. Existing projects with
  // an old copy are left alone (never auto-deleted); customization now goes
  // in `.kandown/instructions.md` / `~/.kandown/instructions.md` instead.
  const templatesDir = join(PKG_ROOT, 'templates');
  if (!existsSync(join(kandownDir, 'README.md'))) {
    copyFileSync(join(templatesDir, 'README.md'), join(kandownDir, 'README.md'));
    success('README.md');
  }

  // 📖 Tasks live at the project root in `./tasks/`, not inside `.kandown/`.
  // This keeps config separate from data and follows the user-facing convention.
  const tasksSrc = join(templatesDir, 'tasks');
  const tasksDest = getTasksDir(kandownDir);
  if (!existsSync(tasksDest)) {
    mkdirSync(tasksDest, { recursive: true });
    // 📖 copyRecursive now returns an errors[] array — report any partial
    // failures instead of letting them crash the whole init (t113).
    const copyErrors = copyRecursive(tasksSrc, tasksDest);
    if (copyErrors.length > 0) {
      warn(`Some task template files could not be copied:`);
      for (const msg of copyErrors) warn(`  - ${msg}`);
    }
    success('./tasks/ (with welcome example)');
  } else {
    info('./tasks/ already exists (kept)');
  }

  if (!existsSync(join(kandownDir, 'kandown.json'))) {
    copyFileSync(join(templatesDir, 'kandown.json'), join(kandownDir, 'kandown.json'));
    success('kandown.json');
  } else {
    info('kandown.json already exists (kept)');
  }

  const kandownGitignore = join(kandownDir, '.gitignore');
  if (!existsSync(kandownGitignore)) {
    writeFileSync(kandownGitignore, `${DAEMON_FILE}\n`, 'utf8');
    success('.gitignore (daemon runtime metadata ignored)');
  }

  if (!args.noAgents) {
    log('');
    const existingAgents = findAgentsFile(cwd);
    if (existingAgents) {
      const added = appendAgentReference(cwd, existingAgents, kandownPath);
      if (added) success(`Appended kandown reference to ${c.bold}${existingAgents}${c.reset}`);
    } else {
      const created = createAgentsFileIfMissing(cwd, kandownPath);
      if (created) success(`Created ${c.bold}AGENTS.md${c.reset} with kandown reference`);
    }
  }

  const hasGit = existsSync(join(cwd, '.git'));
  if (!hasGit) {
    log('');
    warn(`No git repository detected in ${c.bold}${cwd}${c.reset}.`);
    info(`  Tip: Run ${c.cyan}git init${c.reset} and track ${c.bold}./tasks/${c.reset} for git history & portability!`);
  }

  return true;
}

function cmdInit(rawArgs) {
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const kandownPath = args.path;
  const kandownDir = resolve(cwd, kandownPath);

  if (existsSync(join(cwd, '.kandown', 'board.md'))) {
    err(`Kandown already initialized in this directory. To reinitialize, remove the .kandown folder first.`);
    process.exit(1);
  }

  log('');
  info(`Installing kandown in ${c.bold}${kandownPath}/${c.reset}`);
  log('');

  if (existsSync(kandownDir) && !args.force) {
    err(`Directory ${c.bold}${kandownPath}/${c.reset} already exists.`);
    log(`  Use ${c.cyan}--force${c.reset} to overwrite or ${c.cyan}--path <dir>${c.reset} for another location.`);
    process.exit(1);
  }

  if (!doInit(args, cwd, kandownPath, kandownDir)) process.exit(1);

  log('');
  log(`${c.green}${c.bold}Done.${c.reset}`);
  log('');
  log(`  ${c.dim}Layout:${c.reset}`);
  log(`  ${c.dim}└─${c.reset} ${c.bold}.kandown/${c.reset}     — config, web UI, agent docs`);
  log(`  ${c.dim}└─${c.reset} ${c.bold}tasks/${c.reset}          — task files (source of truth)`);
  log('');
  log(`  ${c.dim}Next steps:${c.reset}`);
  log(`  ${c.cyan}1.${c.reset} Open ${c.bold}${kandownPath}/kandown.html${c.reset} in Chrome/Edge/Brave`);
  log(`  ${c.cyan}2.${c.reset} Select the ${c.bold}project root${c.reset} (the parent of ${c.bold}${kandownPath}/${c.reset})`);
  log(`  ${c.cyan}3.${c.reset} Start creating tasks. Press ${c.cyan}⌘K${c.reset} for the command palette`);
  log('');
  log(`  ${c.dim}macOS:${c.reset}   open ${kandownPath}/kandown.html`);
  log(`  ${c.dim}Linux:${c.reset}   xdg-open ${kandownPath}/kandown.html`);
  log(`  ${c.dim}Windows:${c.reset} start ${kandownPath}/kandown.html`);
  log('');
}

function cmdUpdate(rawArgs) {
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const kandownDir = resolve(cwd, args.path);
  const htmlDest = join(kandownDir, 'kandown.html');

  if (!existsSync(htmlDest)) {
    err(`No kandown.html found at ${c.bold}${htmlDest}${c.reset}`);
    log(`  Run ${c.cyan}npx kandown init${c.reset} first.`);
    process.exit(1);
  }

  const htmlSrc = join(PKG_ROOT, 'dist', 'index.html');
  if (!existsSync(htmlSrc)) {
    err(`Missing build output. Did you run 'npm run build'?`);
    process.exit(1);
  }
  copyFileSync(htmlSrc, htmlDest);
  success(`Updated ${args.path}/kandown.html`);
}

/* ═════════════ One-shot task commands ═════════════ */
/**
 * 📖 Self-contained minimal YAML frontmatter parser/writer for the one-shot task
 * commands. The web app uses a richer schema (parseSimpleYaml) in the
 * browser; the CLI keeps its own because it can't import the browser bundle
 * and these commands only need to round-trip a known small set of scalar
 * fields (status, priority, assignee, tags, ownerType, depends_on, etc.).
 *
 * Quirk: tags and depends_on are emitted as inline YAML arrays
 * `[a, b, c]` because list-as-block-scalar is harder to round-trip cleanly
 * and shell tools downstream (jq, awk, grep) parse the inline form
 * trivially.
 */

function parseFrontmatter(content) {
  const out = { frontmatter: {}, body: content || '' };
  if (!content || !content.startsWith('---\n')) return out;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    out.body = content;
    return out;
  }
  const yaml = content.slice(4, end);
  out.body = content.slice(end + 5).replace(/^\n+/, '');

  const lines = yaml.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    const blockMatch = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*\|\s*$/);
    if (blockMatch) {
      const key = blockMatch[1];
      const valLines = [];
      i++;
      while (i < lines.length && (lines[i].startsWith(' ') || lines[i] === '')) {
        if (lines[i].startsWith('  ')) {
          valLines.push(lines[i].slice(2));
        } else if (lines[i].startsWith(' ')) {
          valLines.push(lines[i].slice(1));
        } else {
          valLines.push(lines[i]);
        }
        i++;
      }
      out.frontmatter[key] = valLines.join('\n');
      continue;
    }

    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    let val = (m[2] || '').trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else if (val === 'true' || val === 'false') {
      val = val === 'true';
    } else if (val === 'null' || val === '') {
      val = null;
    } else if (/^-?\d+(\.\d+)?$/.test(val)) {
      val = Number(val);
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    out.frontmatter[key] = val;
    i++;
  }
  return out;
}

function serializeFrontmatter(fm, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fm || {})) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}: [${v.join(', ')}]`);
    } else if (typeof v === 'string' && v.includes('\n')) {
      lines.push(`${k}: |`);
      lines.push(...v.split('\n').map(l => (l === '' ? '' : `  ${l}`)));
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---', '', (body || '').replace(/^\n+/, '').replace(/\n+$/, '') + '\n');
  return lines.join('\n');
}

function readKandownConfig(kandownDir) {
  const configPath = join(kandownDir, 'kandown.json');
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function findTaskFile(kandownDir, id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const tasksDir = getTasksDir(kandownDir);
  const inTasks = join(tasksDir, `${id}.md`);
  if (existsSync(inTasks)) return inTasks;
  const inArchive = join(tasksDir, 'archive', `${id}.md`);
  if (existsSync(inArchive)) return inArchive;
  return null;
}

function listAllTaskIds(kandownDir) {
  const tasksDir = getTasksDir(kandownDir);
  const ids = new Set();
  if (existsSync(tasksDir)) {
    for (const f of readdirSync(tasksDir).filter(f => f.endsWith('.md'))) {
      ids.add(f.replace(/\.md$/, ''));
    }
    const archive = join(tasksDir, 'archive');
    if (existsSync(archive)) {
      for (const f of readdirSync(archive).filter(f => f.endsWith('.md'))) {
        ids.add(f.replace(/\.md$/, ''));
      }
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function nextTaskId(kandownDir) {
  const ids = listAllTaskIds(kandownDir);
  let maxN = 0;
  for (const id of ids) {
    const m = id.match(/^t(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  }
  return 't' + (maxN + 1);
}

function padCell(str, len) {
  const s = String(str);
  // 📖 Only truncate when the string is strictly LONGER than the column —
  // an exact fit must render as-is (`>=` chopped the last char of e.g. the
  // longest task id, displaying "t99" as "t9").
  if (s.length > len) return s.slice(0, Math.max(0, len - 1)) + '…';
  return s + ' '.repeat(len - s.length);
}

function taskParseArgs(argv) {
  // 📖 Minimal flag parser for the task commands. Stops at the first
  // positional arg so `kandown create "Some title with -dash"` works.
  const out = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.flags.json = true;
    else if (a === '--archived') out.flags.archived = true;
    else if (a === '-s' || a === '--status') out.flags.status = argv[++i];
    else if (a === '-a' || a === '--assignee') out.flags.assignee = argv[++i];
    else if (a === '-p' || a === '--priority') out.flags.priority = argv[++i];
    else if (a === '-t' || a === '--tag') out.flags.tags = (out.flags.tags || []).concat([argv[++i]]);
    else if (a === '-d' || a === '--depends-on') out.flags.dependsOn = (out.flags.dependsOn || []).concat([argv[++i]]);
    else if (a === '-m' || a === '--message') out.flags.message = argv[++i];
    else if (a === '--to') out.flags.to = argv[++i];
    else if (a === '--id') out.flags.id = argv[++i];
    else out.positional.push(a);
  }
  return out;
}

function resolveStatusArg(config, status) {
  // 📖 Status can be a configured column name OR the reserved `archived`
  // sentinel. Match is case-insensitive to stay forgiving in scripts.
  if (!status) return null;
  const lower = status.toLowerCase();
  if (lower === 'archived') return 'archived';
  const columns = (config && config.board && config.board.columns) || [];
  for (const c of columns) {
    if (c.toLowerCase() === lower) return c;
  }
  return null;
}

function cmdList(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const config = readKandownConfig(kandownDir);
  const statusFilter = args.flags.status ? resolveStatusArg(config, args.flags.status) : null;
  if (args.flags.status && !statusFilter) {
    err(`Unknown status: ${args.flags.status}`);
    process.exit(1);
  }
  const ids = listAllTaskIds(kandownDir);
  const rows = [];
  for (const id of ids) {
    const path = findTaskFile(kandownDir, id);
    if (!path) continue;
    const parsed = parseFrontmatter(readFileSync(path, 'utf8'));
    const fm = parsed.frontmatter;
    const isArchived = fm.archived === true || fm.archived === 'true' || path.includes('/archive/');
    if (args.flags.archived ? !isArchived : isArchived) continue;
    if (statusFilter && statusFilter !== 'archived' && (fm.status || '').toLowerCase() !== statusFilter.toLowerCase()) continue;
    if (args.flags.assignee && fm.assignee !== args.flags.assignee) continue;
    if (args.flags.priority && (fm.priority || '').toLowerCase() !== args.flags.priority.toLowerCase()) continue;
    if (args.flags.tags && args.flags.tags.length > 0) {
      const taskTags = Array.isArray(fm.tags) ? fm.tags : [];
      const wanted = new Set(args.flags.tags);
      let ok = true;
      for (const t of wanted) { if (!taskTags.includes(t)) { ok = false; break; } }
      if (!ok) continue;
    }
    rows.push({ id, fm, body: parsed.body });
  }

  if (args.flags.json) {
    process.stdout.write(JSON.stringify(rows.map(r => ({
      id: r.id, ...r.fm, archived: r.fm.archived === true || r.fm.archived === 'true',
    })), null, 2) + '\n');
    return;
  }

  if (rows.length === 0) {
    // 📖 Placeholder goes to stderr — an empty result on stdout stays empty
    // so `[ -z "$(kandown list ...)" ]` style checks behave.
    log(c.dim + '(no tasks)' + c.reset);
    return;
  }

  const idW = Math.max(2, ...rows.map(r => r.id.length));
  out(`${c.dim}${padCell('ID', idW)}  ${padCell('STATUS', 14)}  ${padCell('PRI', 4)}  ${padCell('ASSIGNEE', 12)}  TITLE${c.reset}`);
  for (const r of rows) {
    const status = (r.fm.status || 'Backlog') + (r.fm.archived === true || r.fm.archived === 'true' ? ' (archived)' : '');
    const pri = r.fm.priority || '';
    const assignee = r.fm.assignee || '';
    const title = (r.fm.title || '(untitled)').replace(/\n/g, ' ');
    out(`${padCell(r.id, idW)}  ${padCell(status, 14)}  ${padCell(pri, 4)}  ${padCell(assignee, 12)}  ${title}`);
  }
}

function cmdShow(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const id = args.positional[0];
  if (!id) {
    err('Usage: kandown show <id>');
    process.exit(1);
  }
  const path = findTaskFile(kandownDir, id);
  if (!path) {
    err(`Task not found: ${id}`);
    process.exit(1);
  }
  process.stdout.write(readFileSync(path, 'utf8'));
}

/**
 * 📖 Resolves a task id to whether it is in a "blocking" state (i.e. still
 * pending). Used by the move gate. Mirrors the web store's logic: a dep is
 * resolved when it lives in the terminal column OR is archived. Unknown
 * ids and self-references never block.
 */
function depIsResolved(kandownDir, id, terminalLower) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return true; // unknown / invalid → don't block
  const path = findTaskFile(kandownDir, id);
  if (!path) return true; // unknown id → don't block
  const parsed = parseFrontmatter(readFileSync(path, 'utf8'));
  const isArch = parsed.frontmatter.archived === true || parsed.frontmatter.archived === 'true';
  return isArch || (parsed.frontmatter.status || '').toLowerCase() === terminalLower;
}

function parseInlineQuickAdd(rawTitle) {
  let text = (rawTitle || '').trim();
  let priority;
  const tags = [];
  let assignee;
  let due;
  const dependsOn = [];

  text = text.replace(/(?:^|\s)p([1-4])(?:\s|$)/i, (_, level) => {
    priority = `P${level}`;
    return ' ';
  });

  text = text.replace(/(?:^|\s)#([a-zA-Z0-9_-]+)/g, (_, tag) => {
    tags.push(tag.toLowerCase());
    return ' ';
  });

  text = text.replace(/(?:^|\s)@([a-zA-Z0-9_-]+)/g, (_, user) => {
    assignee = user;
    return ' ';
  });

  text = text.replace(/(?:^|\s)due:([^\s]+)/i, (_, dateStr) => {
    due = dateStr;
    return ' ';
  });

  text = text.replace(/(?:^|\s)\+([a-zA-Z0-9_-]+)/g, (_, depId) => {
    dependsOn.push(depId);
    return ' ';
  });

  const title = text.replace(/\s+/g, ' ').trim();
  return { title: title || rawTitle, priority, tags, assignee, due, dependsOn };
}

function cmdCreate(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const rawTitle = args.positional[0];
  if (!rawTitle) {
    err('Usage: kandown create "<title>" [-p priority] [-a assignee] [-t tag ...] [--to status]');
    process.exit(1);
  }
  const config = readKandownConfig(kandownDir);
  const targetStatus = resolveStatusArg(config, args.flags.to) || (config && config.board && config.board.columns ? config.board.columns[0] : 'Backlog');
  const id = args.flags.id || nextTaskId(kandownDir);
  const tasksDir = getTasksDir(kandownDir);
  if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
  const targetPath = join(tasksDir, `${id}.md`);
  if (existsSync(targetPath)) {
    err(`Task already exists: ${id}`);
    process.exit(1);
  }
  const parsedInline = parseInlineQuickAdd(rawTitle);
  const title = parsedInline.title;
  const fm = {
    id,
    title,
    status: targetStatus,
    created: new Date().toISOString().slice(0, 10),
  };
  if (args.flags.priority) fm.priority = args.flags.priority;
  if (args.flags.assignee) fm.assignee = args.flags.assignee;
  if (args.flags.tags && args.flags.tags.length > 0) fm.tags = args.flags.tags;
  if (args.flags.dependsOn && args.flags.dependsOn.length > 0) fm.depends_on = args.flags.dependsOn;
  const content = serializeFrontmatter(fm, '');
  atomicWriteFileSync(targetPath, content);
  process.stderr.write(`${c.green}✓${c.reset} Created ${c.bold}${id}${c.reset} → ${targetStatus}\n`);
  if (args.flags.json) {
    process.stdout.write(JSON.stringify({ id, ...fm }, null, 2) + '\n');
  } else {
    // 📖 Print the id on stdout (last line) so scripts can do
    // `ID=$(kandown create "...")` without parsing the colored status line.
    process.stdout.write(id + '\n');
  }
}

function cmdMove(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const [id, rawStatus] = args.positional;
  const targetStatus = rawStatus || args.flags.to;
  if (!id || !targetStatus) {
    err('Usage: kandown move <id> <status>');
    process.exit(1);
  }
  const config = readKandownConfig(kandownDir);
  const resolved = resolveStatusArg(config, targetStatus);
  if (!resolved) {
    err(`Unknown status: ${targetStatus}`);
    process.exit(1);
  }
  const path = findTaskFile(kandownDir, id);
  if (!path) {
    err(`Task not found: ${id}`);
    process.exit(1);
  }
  // 📖 Terminal-status gate: if the target is the configured terminal column
  // (default: last entry of `board.columns`, "Done"), refuse the move while
  // any `depends_on` is not yet resolved. Mirrors the web store + TUI gate.
  if (config && Array.isArray(config.board.columns) && config.board.columns.length > 0) {
    const terminalLower = (config.board.columns[config.board.columns.length - 1]).toLowerCase();
    if (resolved.toLowerCase() === terminalLower) {
      const parsed = parseFrontmatter(readFileSync(path, 'utf8'));
      const deps = Array.isArray(parsed.frontmatter.depends_on) ? parsed.frontmatter.depends_on : [];
      const blocked = [];
      for (const dep of deps) {
        if (typeof dep !== 'string' || !dep.trim() || dep === id) continue;
        if (!depIsResolved(kandownDir, dep, terminalLower)) blocked.push(dep);
      }
      if (blocked.length > 0) {
        const list = blocked.length === 1 ? blocked[0] : `${blocked.slice(0, -1).join(', ')} and ${blocked[blocked.length - 1]}`;
        err(`Cannot move ${id} to ${resolved}: blocked by ${list}`);
        process.exit(1);
      }
    }
  }
  const parsed = parseFrontmatter(readFileSync(path, 'utf8'));
  parsed.frontmatter.status = resolved;
  if (resolved === 'archived') parsed.frontmatter.archived = true;
  else delete parsed.frontmatter.archived;
  if (resolved === 'archived') {
    const archiveDir = join(getTasksDir(kandownDir), 'archive');
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
    atomicWriteFileSync(join(archiveDir, `${id}.md`), serializeFrontmatter(parsed.frontmatter, parsed.body));
    try { unlinkSync(path); } catch { /* already absent */ }
  } else {
    const normalTasksDir = getTasksDir(kandownDir);
    const normalPath = join(normalTasksDir, `${id}.md`);
    atomicWriteFileSync(normalPath, serializeFrontmatter(parsed.frontmatter, parsed.body));
    if (path !== normalPath) {
      try { unlinkSync(path); } catch { /* already absent */ }
    }
  }
  log(`${c.green}✓${c.reset} ${c.bold}${id}${c.reset} → ${resolved}`);
}

function cmdAssign(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const [id, name] = args.positional;
  if (!id) {
    err('Usage: kandown assign <id> [name]   (omit name to unassign)');
    process.exit(1);
  }
  const path = findTaskFile(kandownDir, id);
  if (!path) {
    err(`Task not found: ${id}`);
    process.exit(1);
  }
  const parsed = parseFrontmatter(readFileSync(path, 'utf8'));
  if (name) parsed.frontmatter.assignee = name;
  else delete parsed.frontmatter.assignee;
  atomicWriteFileSync(path, serializeFrontmatter(parsed.frontmatter, parsed.body));
  log(`${c.green}✓${c.reset} ${c.bold}${id}${c.reset} → ${name ? c.cyan + name : c.dim + '(unassigned)'}${c.reset}`);
}

function cmdCommit(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const projectRoot = getProjectRoot(kandownDir);
  // 📖 Refuse to commit if not inside a git repo — silently failing here would
  // let the user believe they versioned their tasks when they didn't.
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: projectRoot, stdio: 'pipe' });
  } catch {
    err('Not a git repository — kandown commit only stages and commits in a git repo.');
    err('  Run `git init` first or commit manually.');
    process.exit(1);
  }
  const tasksRel = 'tasks';
  const configRel = '.kandown/kandown.json';
  const staged = [];
  for (const rel of [tasksRel, configRel]) {
    const abs = join(projectRoot, rel);
    if (!existsSync(abs)) continue;
    try {
      execSync(`git add -A -- "${rel}"`, { cwd: projectRoot, stdio: 'pipe' });
      staged.push(rel);
    } catch (e) {
      err(`git add failed for ${rel}: ${e.message}`);
      process.exit(1);
    }
  }
  if (staged.length === 0) {
    log(c.dim + 'Nothing to commit.' + c.reset);
    return;
  }
  const message = args.flags.message || `chore(kandown): update tasks`;
  try {
    execSync(`git commit -m ${JSON.stringify(message)}`, { cwd: projectRoot, stdio: 'inherit' });
    success(`Committed ${staged.length} path${staged.length === 1 ? '' : 's'}: ${staged.join(', ')}`);
  } catch (e) {
    // 📖 git commit exits non-zero when there's nothing to commit (after the
    // add). Treat that as a no-op so the user doesn't think they broke
    // anything.
    if (e && e.status === 1) {
      log(c.dim + 'Nothing to commit (working tree clean).' + c.reset);
      return;
    }
    err(`git commit failed: ${e.message}`);
    process.exit(1);
  }
}

/**
 * 📖 Prints the one-shot task-command cheatsheet. Reachable as `kandown tasks`
 * (or `kandown tasks help`) — the commands themselves (list/show/create/move/
 * assign/commit) are top-level, not nested under a "shell" prefix, since
 * they're the most basic operations of the product and scripts/agents should
 * never need to remember a wrapper word to reach them.
 */
function printTaskCommandsHelp() {
  out(`
${c.bold}kandown${c.reset} ${c.dim}· one-shot task commands (scriptable, agent-friendly)${c.reset}

${c.bold}Commands:${c.reset}
  ${c.cyan}list${c.reset}   [-s status] [-a assignee] [-t tag] [-p priority] [--archived] [--json]
  ${c.cyan}show${c.reset}    <id>
  ${c.cyan}create${c.reset}  "title" [-p priority] [-a assignee] [-t tag ...] [--to status] [--id custom-id] [--json]
  ${c.cyan}move${c.reset}    <id> <status>     (status is a column name or "archived")
  ${c.cyan}assign${c.reset}  <id> [name]       (omit name to unassign)
  ${c.cyan}commit${c.reset}  [-m "message"]   (git add tasks/ + .kandown/kandown.json + git commit)

${c.bold}Examples:${c.reset}
  ${c.dim}$${c.reset} kandown list --json | jq '.[] | select(.priority=="P1")'
  ${c.dim}$${c.reset} kandown create "Refactor auth middleware" -p P1 -t backend
  ${c.dim}$${c.reset} kandown move t42 Done
  ${c.dim}$${c.reset} kandown assign t42 alice
  ${c.dim}$${c.reset} kandown commit -m "tasks: add auth refactor"
`);
}

/* ═════════════ kandown work — agent entrypoint ═════════════ */
/**
 * 📖 `kandown work` replaces the "paste the rules into AGENTS.md/CLAUDE.md"
 * pattern: instead of a stale copy embedded in the project's agent file at
 * init time, the CLI serves the rules fresh on every invocation — always in
 * sync with the installed version — plus a live digest of the board so the
 * agent gets its marching orders and its context in one call.
 *
 * Layering (base → global → project), each optional except the base:
 *   1. Base rules   — templates/AGENT_KANDOWN.md, shipped with the package.
 *   2. Global       — ~/.kandown/instructions.md, applies to every project
 *                     on this machine (team conventions, personal style).
 *   3. Project      — .kandown/instructions.md, this project only.
 * Later layers are appended, not merged — the agent reads all of them.
 */

const PRIORITY_RANK = { P1: 0, P2: 1, P3: 2, P4: 3 };
function priorityRank(p) {
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, p) ? PRIORITY_RANK[p] : 4;
}

/**
 * 📖 Builds the "Current board" section: column counts, tasks per column
 * (with blocked-by annotations), and a "Next actionable task" pick — the
 * task in the most-advanced non-terminal column (closest to done, so
 * in-flight work finishes before new work starts) with no unresolved
 * `depends_on`, tie-broken by priority. Mirrors the same gate logic used by
 * `move`/the TUI/the web store.
 */
function buildBoardDigest(kandownDir) {
  const config = readKandownConfig(kandownDir);
  const columns = (config && config.board && Array.isArray(config.board.columns) && config.board.columns.length > 0)
    ? config.board.columns
    : ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'];
  const terminalCol = columns[columns.length - 1];
  const terminalLower = terminalCol.toLowerCase();

  const rows = [];
  for (const id of listAllTaskIds(kandownDir)) {
    const path = findTaskFile(kandownDir, id);
    if (!path) continue;
    let content;
    try { content = readFileSync(path, 'utf8'); } catch { continue; }
    const parsed = parseFrontmatter(content);
    const fm = parsed.frontmatter;
    const isArchived = fm.archived === true || fm.archived === 'true' || path.includes('/archive/');
    if (isArchived) continue;
    rows.push({ id, fm });
  }

  if (rows.length === 0) {
    return `## Current board\n\n(no tasks yet)`;
  }

  const resolved = new Map();
  for (const r of rows) {
    const isArch = r.fm.archived === true || r.fm.archived === 'true';
    resolved.set(r.id, isArch || (r.fm.status || '').toLowerCase() === terminalLower);
  }

  const byColumn = new Map(columns.map(col => [col, []]));
  for (const r of rows) {
    const status = r.fm.status || columns[0];
    const col = columns.find(c => c.toLowerCase() === String(status).toLowerCase()) || columns[0];
    const deps = Array.isArray(r.fm.depends_on) ? r.fm.depends_on : [];
    const blocked = deps.filter(d => typeof d === 'string' && d.trim() && d !== r.id && !resolved.get(d));
    // 📖 `col` always resolves to one of `columns` (falls back to columns[0]),
    // which the Map was seeded with above — the entry always exists.
    byColumn.get(col).push({ ...r, blocked });
  }

  const lines = ['## Current board', ''];
  lines.push(`**Columns:** ${columns.map(col => `${col} (${(byColumn.get(col) || []).length})`).join(' · ')}`);

  for (const col of columns) {
    const tasks = (byColumn.get(col) || []).sort((a, b) => priorityRank(a.fm.priority) - priorityRank(b.fm.priority));
    if (tasks.length === 0) continue;
    lines.push('', `### ${col}`);
    for (const t of tasks) {
      const pri = t.fm.priority ? `[${t.fm.priority}] ` : '';
      const assignee = t.fm.assignee ? ` (@${t.fm.assignee})` : '';
      const blockedStr = t.blocked.length > 0 ? ` ⛔ blocked by ${t.blocked.join(', ')}` : '';
      lines.push(`- ${t.id} ${pri}${t.fm.title || '(untitled)'}${assignee}${blockedStr}`);
    }
  }

  const actionable = rows.filter(r => {
    const status = r.fm.status || columns[0];
    if (status.toLowerCase() === terminalLower) return false;
    const deps = Array.isArray(r.fm.depends_on) ? r.fm.depends_on : [];
    return !deps.some(d => typeof d === 'string' && d.trim() && d !== r.id && !resolved.get(d));
  });
  const next = actionable.sort((a, b) => {
    const idxA = columns.findIndex(col => col.toLowerCase() === (a.fm.status || columns[0]).toLowerCase());
    const idxB = columns.findIndex(col => col.toLowerCase() === (b.fm.status || columns[0]).toLowerCase());
    if (idxA !== idxB) return idxB - idxA; // most-advanced non-terminal column first
    return priorityRank(a.fm.priority) - priorityRank(b.fm.priority);
  })[0];

  lines.push('', '### Next actionable task');
  lines.push(next
    ? `→ **${next.id}** — ${next.fm.title || '(untitled)'} (${next.fm.priority || 'no priority'}, ${next.fm.status || columns[0]})`
    : 'None — every task is done, archived, or blocked.');

  return lines.join('\n');
}

async function cmdWork(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);

  let baseRules = '';
  try {
    baseRules = readFileSync(join(PKG_ROOT, 'templates', 'AGENT_KANDOWN.md'), 'utf8').trim();
  } catch (e) {
    warn(`Could not read base rules (${e.message})`);
  }

  let globalInstructions = '';
  const globalPath = join(homedir(), '.kandown', 'instructions.md');
  if (existsSync(globalPath)) {
    try { globalInstructions = readFileSync(globalPath, 'utf8').trim(); }
    catch (e) { warn(`Could not read global instructions (${e.message})`); }
  }

  let projectInstructions = '';
  const projectPath = join(kandownDir, 'instructions.md');
  if (existsSync(projectPath)) {
    try { projectInstructions = readFileSync(projectPath, 'utf8').trim(); }
    catch (e) { warn(`Could not read project instructions (${e.message})`); }
  }

  const sections = [baseRules];
  if (globalInstructions) sections.push(`## Global instructions\n\n${globalInstructions}`);
  if (projectInstructions) sections.push(`## Project-specific instructions\n\n${projectInstructions}`);
  sections.push(buildBoardDigest(kandownDir));

  out(sections.filter(Boolean).join('\n\n---\n\n'));
}

function parsePort(value) {
  if (value === null) return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    err(`Invalid port: ${c.bold}${value}${c.reset}`);
    log(`  Use ${c.cyan}--port <1-65535>${c.reset}.`);
    process.exit(1);
  }
  return port;
}

function daemonMetadataPath(kandownDir) {
  return join(kandownDir, DAEMON_FILE);
}

function readDaemonMetadata(kandownDir) {
  const metadataPath = daemonMetadataPath(kandownDir);
  if (!existsSync(metadataPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(metadataPath, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    if (!Number.isInteger(raw.pid) || !Number.isInteger(raw.port)) return null;
    if (typeof raw.url !== 'string' || typeof raw.kandownDir !== 'string') return null;
    return raw;
  } catch {
    return null;
  }
}

function writeDaemonMetadata(kandownDir, metadata) {
  atomicWriteFileSync(daemonMetadataPath(kandownDir), JSON.stringify(metadata, null, 2) + '\n');
}

function removeDaemonMetadata(kandownDir) {
  try {
    if (existsSync(daemonMetadataPath(kandownDir))) unlinkSync(daemonMetadataPath(kandownDir));
  } catch { /* ignore cleanup failure */ }
}

function ensureDaemonGitignore(kandownDir) {
  const gitignorePath = join(kandownDir, '.gitignore');
  // 📖 Runtime files that must never be committed: daemon metadata + spawn lock.
  const runtimeEntries = [DAEMON_FILE, 'daemon.lock'];
  try {
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, runtimeEntries.join('\n') + '\n', 'utf8');
      return;
    }
    const existing = readFileSync(gitignorePath, 'utf8');
    const lines = existing.split(/\r?\n/);
    const missing = runtimeEntries.filter(entry => !lines.includes(entry));
    if (missing.length > 0) {
      writeFileSync(gitignorePath, `${existing.trimEnd()}\n${missing.join('\n')}\n`, 'utf8');
    }
  } catch { /* ignore gitignore best-effort failure */ }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function fetchDaemonInfo(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/daemon`, {
      signal: AbortSignal.timeout(700),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 📖 Fast, dependency-free TCP probe. Returns true the instant a port accepts
 * a connection — i.e. the moment the daemon has actually bound its socket.
 * Used instead of an HTTP fetch to detect startup, because Node's fetch
 * (undici) can fail to recover from the initial ECONNREFUSED window (fetches
 * sent before the server binds) and report a healthy local server as down for
 * seconds, which orphaned freshly-started multi-project daemons. A raw TCP
 * connect has no connection-pool state to poison, so it reliably tracks the
 * real liveness of the socket.
 */
function isPortListening(port, timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function getDaemonStatus(kandownDir) {
  const metadata = readDaemonMetadata(kandownDir);
  if (!metadata) return { running: false, metadata: null };
  if (!isProcessAlive(metadata.pid)) {
    removeDaemonMetadata(kandownDir);
    return { running: false, metadata: null };
  }
  const remote = await fetchDaemonInfo(metadata.port);
  if (!remote) {
    // 📖 Transient fetch failure (server still warming up, undici connection
    // hiccup, high load). The owning process IS alive (checked above), so we
    // must NOT destroy the metadata here — otherwise starting a 2nd kandown
    // project races the just-written metadata and orphans a healthy daemon.
    // Return non-running so callers retry; the metadata stays intact.
    return { running: false, metadata: null };
  }
  if (remote.kandownDir !== kandownDir || remote.pid !== metadata.pid) {
    // 📖 Real conflict: the port is owned by a DIFFERENT kandown (another
    // project, or a reincarnated PID). That is a genuine stale entry — remove.
    removeDaemonMetadata(kandownDir);
    return { running: false, metadata: null };
  }
  return { running: true, metadata };
}

function refreshKandownHtml(kandownDir) {
  const htmlDest = join(kandownDir, 'kandown.html');
  const htmlSrc = join(PKG_ROOT, 'dist', 'index.html');
  if (existsSync(htmlDest) && existsSync(htmlSrc)) {
    copyFileSync(htmlSrc, htmlDest);
    return true;
  }
  return false;
}

async function waitForDaemon(kandownDir, timeoutMs = 8000) {
  // 📖 Detect daemon startup via TCP probe + process liveness rather than HTTP
  // fetch. The freshly spawned child is known to be ours, so once its process
  // is alive AND its port accepts a TCP connection, the daemon is up — no need
  // to wait for an HTTP round-trip that undici may not serve reliably during
  // the bind window. The dir/pid ownership check still happens later via
  // getDaemonStatus() for the status/stop commands.
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const metadata = readDaemonMetadata(kandownDir);
    if (metadata && isProcessAlive(metadata.pid)) {
      if (await isPortListening(metadata.port)) {
        return { running: true, metadata };
      }
    }
    await new Promise(r => setTimeout(r, 120));
  }
  return { running: false, metadata: null };
}

/**
 * 📖 Spawn lock (M7): two `kandown` processes started at the same moment in
 * the same project must not BOTH spawn a daemon (the loser's daemon.json
 * write would orphan the winner's daemon). O_EXCL file creation is the mutex;
 * the loser just waits for the winner's daemon to come up. A lock older than
 * 15s is stale (crashed spawner) and gets stolen.
 */
function acquireDaemonSpawnLock(kandownDir) {
  const lockPath = join(kandownDir, 'daemon.lock');
  try {
    const fd = openSync(lockPath, 'wx');
    writeSync(fd, String(process.pid));
    closeSync(fd);
    return lockPath;
  } catch (e) {
    if (e.code !== 'EEXIST') return null;
    try {
      if (Date.now() - statSync(lockPath).mtimeMs > 15_000) {
        unlinkSync(lockPath);
        return acquireDaemonSpawnLock(kandownDir);
      }
    } catch { /* lock vanished — racing is fine, caller waits */ }
    return null;
  }
}

function releaseDaemonSpawnLock(lockPath) {
  try { unlinkSync(lockPath); } catch { /* already gone */ }
}

async function startDaemon(kandownDir, preferredPort) {
  const current = await getDaemonStatus(kandownDir);
  if (current.running) return current;

  const lock = acquireDaemonSpawnLock(kandownDir);
  if (!lock) {
    // 📖 Another process is spawning the daemon right now — just wait for it.
    return waitForDaemon(kandownDir);
  }

  try {
    // Double-checked: the daemon may have come up while we acquired the lock.
    const recheck = await getDaemonStatus(kandownDir);
    if (recheck.running) return recheck;

    removeDaemonMetadata(kandownDir);
    ensureDaemonGitignore(kandownDir);
    const daemonArgs = [
      process.argv[1],
      '--no-update-check',
      'daemon',
      'run',
      '--path',
      kandownDir,
    ];
    if (preferredPort !== null) daemonArgs.push('--port', String(preferredPort));

    const child = spawn(process.execPath, daemonArgs, {
      cwd: dirname(kandownDir),
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, KANDOWN_DAEMON: '1' },
    });
    child.unref();

    return await waitForDaemon(kandownDir);
  } finally {
    releaseDaemonSpawnLock(lock);
  }
}

/**
 * 📖 Guard against PID reuse before killing: the PID is only "ours" if the
 * daemon API confirms ownership, or — when the API is unreachable (wedged /
 * still starting) — the OS process table shows a kandown process launched for
 * THIS project. Without this, stale metadata left by a crash could point at a
 * recycled PID and stopDaemon would SIGKILL an unrelated process.
 */
async function isOwnedKandownDaemon(pid, port, kandownDir) {
  const remote = await fetchDaemonInfo(port);
  if (remote) return remote.pid === pid && remote.kandownDir === kandownDir;
  try {
    const cmd = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8', timeout: 2000 }).trim();
    return /kandown/.test(cmd) && cmd.includes(kandownDir);
  } catch {
    return false;
  }
}

async function stopDaemon(kandownDir) {
  const metadata = readDaemonMetadata(kandownDir);
  if (!metadata) return false;

  const pid = metadata.pid;
  if (isProcessAlive(pid)) {
    if (!(await isOwnedKandownDaemon(pid, metadata.port, kandownDir))) {
      // Alive PID that isn't our daemon (recycled PID / stale metadata) — never kill.
      removeDaemonMetadata(kandownDir);
      return false;
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch { /* already stopped */ }

    const started = Date.now();
    let killed = false;
    while (Date.now() - started < 2500) {
      if (!isProcessAlive(pid)) {
        killed = true;
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    if (!killed && isProcessAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }

  removeDaemonMetadata(kandownDir);
  return true;
}

/**
 * 📖 API auth token (M5). Generated fresh at every daemon start, stored in
 * daemon.json (CLI/TUI read it there) and injected into the served HTML as
 * `window.__KANDOWN_TOKEN__`. Every API route except `GET /api/daemon`
 * requires it via the `X-Kandown-Token` header — a drive-by web page scanning
 * localhost ports can no longer read or write the task files.
 */
const DAEMON_TOKEN = randomBytes(24).toString('hex');

function apiHeaders() {
  // 📖 No Access-Control-Allow-Origin (M5): the web UI is served same-origin
  // by this daemon, so cross-origin browser access is intentionally blocked.
  // Non-browser clients (CLI, TUI, curl) are unaffected by CORS.
  return {
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Kandown-Token',
  };
}

function handleCors(res) {
  res.writeHead(204, apiHeaders());
  res.end();
}

/**
 * 📖 Token gate for API routes. Returns true when the request carries the
 * daemon token; otherwise answers 401 and returns false.
 */
function requireToken(req, res) {
  const tokenHeader = req.headers['x-kandown-token'];
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const tokenQuery = requestUrl.searchParams.get('token');
  if (tokenHeader === DAEMON_TOKEN || tokenQuery === DAEMON_TOKEN) return true;
  writeJson(res, 401, { error: 'missing or invalid X-Kandown-Token' });
  return false;
}

const sseClients = new Set();

function broadcastSseEvent(eventData) {
  const payload = `data: ${JSON.stringify(eventData)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(':\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 15000);

function writeJson(res, status, body) {
  const headers = { ...apiHeaders(), 'Content-Type': 'application/json' };
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function writeText(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { ...apiHeaders(), 'Content-Type': contentType });
  res.end(body);
}

// 📖 Body size cap: task files and configs are small — anything above 10 MB
// is a bug or abuse, and buffering it would balloon the daemon's memory.
const MAX_BODY_BYTES = 10 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        const e = new Error('Request body too large (max 10 MB)');
        e.statusCode = 413;
        req.destroy();
        reject(e);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * 📖 Resolves the agent hook configuration from environment variables.
 *
 * Strictly opt-in: if KANDOWN_AGENT_HOOK_URL is not set, returns null and no
 * agent-related UI surfaces in the web app. This is the only check the UI
 * uses to decide whether to show the "Send to Agent" button.
 *
 * Env vars (all optional except URL):
 *   - KANDOWN_AGENT_HOOK_URL      target URL (POST receives `{action, task, context}`)
 *   - KANDOWN_AGENT_HOOK_LABEL    button label (default: "Agent")
 *   - KANDOWN_AGENT_HOOK_HEADERS  JSON object of extra headers (default: {})
 *
 * Malformed HEADERS are silently ignored so a typo never disables the hook.
 */
function loadAgentHook() {
  const url = process.env.KANDOWN_AGENT_HOOK_URL;
  if (!url) return null;
  const label = process.env.KANDOWN_AGENT_HOOK_LABEL || 'Agent';
  const headers = {};
  const raw = process.env.KANDOWN_AGENT_HOOK_HEADERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string') headers[k] = v;
        }
      }
    } catch {
      // Malformed JSON — ignore and ship with the default empty headers.
    }
  }
  return { url, label, headers };
}

/**
 * 📖 Forwards a task to the configured agent hook. Returns a status object
 * the HTTP handler converts to a JSON response. Failures (network, non-2xx,
 * timeout) are surfaced as 502 so the UI can show a useful error.
 */
async function postAgentTask(hook, taskMarkdown, id, kandownDir) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...hook.headers,
      },
      body: JSON.stringify({
        action: 'agent',
        task: { id, content: taskMarkdown },
        context: {
          tasksDir: getTasksDir(kandownDir),
          cwd: getProjectRoot(kandownDir),
          schema: 'kandown',
        },
      }),
      signal: controller.signal,
    });
    const body = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    const message = e && e.name === 'AbortError' ? 'agent hook timed out (8s)' : `agent hook failed: ${e.message}`;
    return { ok: false, status: 502, body: message };
  } finally {
    clearTimeout(timeout);
  }
}

function postTaskToAgent(req, res, kandownDir, id) {
  if (!isValidTaskId(id)) {
    return writeText(res, 400, 'Invalid task id');
  }
  const hook = loadAgentHook();
  if (!hook) {
    return writeJson(res, 501, { error: 'agent hook not configured (set KANDOWN_AGENT_HOOK_URL)' });
  }
  const taskPath = findTaskPath(kandownDir, id);
  if (!taskPath) {
    return writeJson(res, 404, { error: 'task not found' });
  }
  let taskMarkdown;
  try {
    taskMarkdown = readFileSync(taskPath, 'utf8');
  } catch (e) {
    return writeJson(res, 500, { error: `failed to read task: ${e.message}` });
  }
  postAgentTask(hook, taskMarkdown, id, kandownDir).then(result => {
    if (!result.ok) {
      return writeJson(res, 502, { error: result.body || `agent hook returned ${result.status}` });
    }
    return writeJson(res, 200, { ok: true });
  }).catch(e => {
    writeJson(res, 500, { error: e.message });
  });
}

function isValidTaskId(id) {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function getConfig(res, kandownDir) {
  const configPath = join(kandownDir, 'kandown.json');
  if (!existsSync(configPath)) {
    writeJson(res, 404, { error: 'kandown.json not found' });
    return;
  }
  try {
    const content = readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    writeJson(res, 200, config);
  } catch (e) {
    writeJson(res, 500, { error: `Failed to read config: ${e.message}` });
  }
}

/**
 * 📖 Shape validation for kandown.json writes: "is valid JSON" is not enough —
 * a stray `[]` or `null` body would overwrite the config and silently reset
 * every setting on the next load. Requires a plain object, and when `board`
 * or `board.columns` are present they must have the right shape.
 */
function isValidConfigShape(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  if ('board' in parsed) {
    const board = parsed.board;
    if (!board || typeof board !== 'object' || Array.isArray(board)) return false;
    if ('columns' in board) {
      if (!Array.isArray(board.columns)) return false;
      if (!board.columns.every(col => typeof col === 'string' && col.trim().length > 0)) return false;
    }
  }
  return true;
}

function putConfig(req, res, kandownDir) {
  readBody(req).then(body => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return writeJson(res, 400, { error: 'Invalid JSON' });
    }
    if (!isValidConfigShape(parsed)) {
      return writeJson(res, 400, { error: 'Invalid config shape: expected an object (board.columns must be a non-empty string array)' });
    }
    const configPath = join(kandownDir, 'kandown.json');
    atomicWriteFileSync(configPath, body);
    writeJson(res, 200, { ok: true });
  }).catch(e => {
    writeJson(res, e.statusCode || 500, { error: `Failed to read body: ${e.message}` });
  });
}

function getBoard(res, kandownDir) {
  const boardPath = join(kandownDir, 'board.md');
  if (!existsSync(boardPath)) {
    writeText(res, 404, 'board.md not found');
    return;
  }
  try {
    const content = readFileSync(boardPath, 'utf8');
    writeText(res, 200, content);
  } catch (e) {
    writeText(res, 500, `Failed to read board: ${e.message}`);
  }
}

function putBoard(req, res, kandownDir) {
  readBody(req).then(body => {
    const boardPath = join(kandownDir, 'board.md');
    atomicWriteFileSync(boardPath, body);
    writeJson(res, 200, { ok: true });
  }).catch(e => {
    writeJson(res, 500, { error: `Failed to write board: ${e.message}` });
  });
}

/**
 * 📖 Resolves the on-disk path of a task id, searching the active tasks dir
 * first, then the archive subfolder. Returns null when the id exists in
 * neither location. Used by every CRUD handler so archived tasks stay
 * reachable at their real location.
 *
 * Tasks live at the project root in `./tasks/` (sibling of `.kandown/`),
 * not inside `.kandown/tasks/`.
 */
function findTaskPath(kandownDir, id) {
  const tasksDir = getTasksDir(kandownDir);
  const inTasks = join(tasksDir, `${id}.md`);
  if (existsSync(inTasks)) return inTasks;
  const inArchive = join(tasksDir, 'archive', `${id}.md`);
  if (existsSync(inArchive)) return inArchive;
  return null;
}

function getTasks(res, kandownDir) {
  const tasksDir = getTasksDir(kandownDir);
  const archiveDir = join(tasksDir, 'archive');
  const ids = new Set();
  try {
    if (existsSync(tasksDir)) {
      for (const f of readdirSync(tasksDir).filter(f => f.endsWith('.md'))) {
        ids.add(f.replace(/\.md$/, ''));
      }
    }
    // 📖 Also surface archived tasks so the UI can list them in the archive
    // view. The archived flag in frontmatter (not the folder) is the source of
    // truth for hiding them from the active board.
    if (existsSync(archiveDir)) {
      for (const f of readdirSync(archiveDir).filter(f => f.endsWith('.md'))) {
        ids.add(f.replace(/\.md$/, ''));
      }
    }
    writeJson(res, 200, [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  } catch (e) {
    writeJson(res, 500, { error: `Failed to list tasks: ${e.message}` });
  }
}

function getTask(res, kandownDir, id) {
  if (!isValidTaskId(id)) {
    writeText(res, 400, 'Invalid task id');
    return;
  }
  const taskPath = findTaskPath(kandownDir, id);
  if (!taskPath) {
    writeText(res, 404, 'Task not found');
    return;
  }
  try {
    const content = readFileSync(taskPath, 'utf8');
    writeText(res, 200, content);
  } catch (e) {
    writeText(res, 500, `Failed to read task: ${e.message}`);
  }
}

function putTask(req, res, kandownDir, id) {
  if (!isValidTaskId(id)) {
    writeText(res, 400, 'Invalid task id');
    return;
  }
  readBody(req).then(body => {
    const tasksDir = getTasksDir(kandownDir);
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
    // 📖 Write in place: keep an archived task inside archive/ on save so the
    // file location never drifts from its archived flag.
    const existing = findTaskPath(kandownDir, id);
    const archiveDir = join(tasksDir, 'archive');
    const inArchive = existing && existing.startsWith(archiveDir);
    const targetDir = inArchive ? archiveDir : tasksDir;
    const taskPath = join(targetDir, `${id}.md`);
    atomicWriteFileSync(taskPath, body);
    writeJson(res, 200, { ok: true });
  }).catch(e => {
    writeJson(res, 500, { error: `Failed to write task: ${e.message}` });
  });
}

function deleteTask(res, kandownDir, id) {
  if (!isValidTaskId(id)) {
    writeText(res, 400, 'Invalid task id');
    return;
  }
  const taskPath = findTaskPath(kandownDir, id);
  if (!taskPath) {
    writeJson(res, 404, { error: 'Task not found' });
    return;
  }
  try {
    unlinkSync(taskPath);
    writeJson(res, 200, { ok: true });
  } catch (e) {
    writeJson(res, 500, { error: `Failed to delete task: ${e.message}` });
  }
}

/**
 * 📖 Archives a task: writes the (already flag-updated) content into
 * `tasks/archive/<id>.md` and removes the active `tasks/<id>.md` copy.
 * The body comes pre-flagged from the web client (which knows frontmatter).
 */
function archiveTask(req, res, kandownDir, id) {
  if (!isValidTaskId(id)) {
    writeText(res, 400, 'Invalid task id');
    return;
  }
  readBody(req).then(body => {
    const tasksDir = getTasksDir(kandownDir);
    const archiveDir = join(tasksDir, 'archive');
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
    atomicWriteFileSync(join(archiveDir, `${id}.md`), body);
    try {
      unlinkSync(join(tasksDir, `${id}.md`));
    } catch { /* already absent */ }
    writeJson(res, 200, { ok: true });
  }).catch(e => {
    writeJson(res, 500, { error: `Failed to archive task: ${e.message}` });
  });
}

/**
 * 📖 Unarchives a task: writes the content back into `tasks/<id>.md` and
 * removes the archived copy. Mirror of archiveTask.
 */
function unarchiveTask(req, res, kandownDir, id) {
  if (!isValidTaskId(id)) {
    writeText(res, 400, 'Invalid task id');
    return;
  }
  readBody(req).then(body => {
    const tasksDir = getTasksDir(kandownDir);
    atomicWriteFileSync(join(tasksDir, `${id}.md`), body);
    try {
      unlinkSync(join(tasksDir, 'archive', `${id}.md`));
    } catch { /* already absent */ }
    writeJson(res, 200, { ok: true });
  }).catch(e => {
    writeJson(res, 500, { error: `Failed to unarchive task: ${e.message}` });
  });
}

/**
 * 📖 REST endpoint to trigger the silent one-time task migration. The web
 * client (server mode) can call this on startup to perform the same
 * `.kandown/tasks/` → `./tasks/` move the CLI does on first access.
 * Safe to call multiple times — idempotent.
 */
function postMigrateTasks(res, kandownDir) {
  try {
    const result = migrateTasksToTopLevel(kandownDir);
    writeJson(res, 200, { ok: true, ...result });
  } catch (e) {
    writeJson(res, 500, { error: `Migration failed: ${e.message}` });
  }
}

/**
 * 📖 The single-file Vite bundle can contain literal strings such as
 * `</head>` from HTML parser libraries. Use the last closing head tag so the
 * CLI does not inject server-mode globals into bundled JavaScript text.
 */
function injectServerRoot(html, kandownDir) {
  const marker = '</head>';
  const markerIndex = html.toLowerCase().lastIndexOf(marker);
  const safeRoot = JSON.stringify(kandownDir).replace(/</g, '\\u003c');
  // 📖 The token rides along with the root: same-origin page → full API access;
  // any other page (drive-by localhost scan) never sees it (M5).
  const safeToken = JSON.stringify(DAEMON_TOKEN).replace(/</g, '\\u003c');
  const script = `<script>window.__KANDOWN_ROOT__ = ${safeRoot}; window.__KANDOWN_TOKEN__ = ${safeToken};</script>\n`;

  if (markerIndex === -1) return script + html;

  return html.slice(0, markerIndex) + script + html.slice(markerIndex);
}

function handleApi(req, res, url, kandownDir) {
  const parts = url.pathname.replace('/api/', '').split('/');
  const resource = parts[0];
  const id = parts[1];

  // 📖 Token gate (M5): every API route requires X-Kandown-Token, except
  // GET /api/daemon which stays open — it is the identity endpoint the CLI
  // and sibling daemons use to verify ownership before they have the token,
  // and it never exposes the token itself.
  if (!(resource === 'daemon' && req.method === 'GET')) {
    if (!requireToken(req, res)) return;
  }

  if (resource === 'daemon') {
    if (req.method === 'GET') {
      const hook = loadAgentHook();
      return writeJson(res, 200, {
        ok: true,
        pid: process.pid,
        kandownDir,
        version: getCurrentVersion(),
        startedAt: daemonStartedAt,
        agentHook: hook ? { enabled: true, label: hook.label } : null,
      });
    }
  }

  if (resource === 'events') {
    if (req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('data: {"type":"connected"}\n\n');
      sseClients.add(res);
      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }
  }

  if (resource === 'git' && parts[1] === 'history') {
    const taskId = url.searchParams.get('id');
    if (!taskId) return writeJson(res, 400, { error: 'Missing task id' });
    try {
      const taskPath = findTaskPath(kandownDir, taskId);
      if (!taskPath) return writeJson(res, 404, { error: 'Task not found' });
      const relativePath = relative(getProjectRoot(kandownDir), taskPath);
      const output = execFileSync('git', ['log', '-n', '10', '--follow', '--format=%h|%an|%ar|%s', '--', relativePath], {
        cwd: getProjectRoot(kandownDir),
        encoding: 'utf8',
      }).trim();
      const commits = output ? output.split('\n').map(line => {
        const [hash, author, date, message] = line.split('|');
        return { hash, author, date, message };
      }) : [];
      return writeJson(res, 200, { commits });
    } catch {
      return writeJson(res, 200, { commits: [] });
    }
  }

  if (resource === 'config') {
    if (req.method === 'GET') return getConfig(res, kandownDir);
    if (req.method === 'PUT') return putConfig(req, res, kandownDir);
  }

  if (resource === 'board') {
    if (req.method === 'GET') return getBoard(res, kandownDir);
    if (req.method === 'PUT') return putBoard(req, res, kandownDir);
  }

  if (resource === 'tasks') {
    if (req.method === 'GET' && !id) return getTasks(res, kandownDir);
    if (req.method === 'GET' && id) return getTask(res, kandownDir, id);
    if (req.method === 'PUT' && id) return putTask(req, res, kandownDir, id);
    if (req.method === 'DELETE' && id) return deleteTask(res, kandownDir, id);
    // parts[2] is the sub-resource: 'archive' or 'unarchive'. The body carries
    // the full task file content with the archived flag already toggled.
    if (req.method === 'POST' && id && parts[2] === 'archive') return archiveTask(req, res, kandownDir, id);
    if (req.method === 'POST' && id && parts[2] === 'unarchive') return unarchiveTask(req, res, kandownDir, id);
    if (req.method === 'POST' && id && parts[2] === 'agent') return postTaskToAgent(req, res, kandownDir, id);
  }

  // 📖 Migration endpoint: `POST /api/migrate-tasks` with no id. Idempotent.
  if (resource === 'migrate-tasks' && req.method === 'POST' && !id) {
    return postMigrateTasks(res, kandownDir);
  }

  writeJson(res, 404, { error: 'Not found' });
}

const daemonStartedAt = new Date().toISOString();

function serveApp(res, kandownDir) {
  const htmlPath = join(kandownDir, 'kandown.html');
  if (!existsSync(htmlPath)) {
    writeText(res, 404, 'kandown.html not found');
    return;
  }

  try {
    const html = readFileSync(htmlPath, 'utf8');
    const injected = injectServerRoot(html, kandownDir);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(injected);
  } catch (e) {
    // 📖 Don't leak internal paths / error details to HTTP clients — log the
    // full error server-side, send a generic message to the browser (t113).
    console.error(`[serve] Error serving ${htmlPath}:`, e);
    writeText(res, 500, 'Internal server error — check the terminal where kandown is running.');
  }
}

/**
 * 📖 Creates the local HTTP server used by `kandown` with no arguments.
 * It serves the single-file web app and exposes placeholder API routes for the
 * follow-up REST task, keeping this refactor limited to server bootstrapping.
 */
function createServeServer(kandownDir) {
  try {
    const tasksDir = getTasksDir(kandownDir);
    const configPath = join(kandownDir, 'kandown.json');
    const watcher = watchFs([join(tasksDir, '*.md'), configPath], {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
    });
    watcher.on('all', (_event, filePath) => {
      const taskId = filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/, '') || '';
      broadcastSseEvent({ type: 'change', taskId });
    });
  } catch (e) {
    console.error('[daemon] File watcher init warning:', e.message);
  }

  return createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    if (req.method === 'OPTIONS') return handleCors(res);
    if (requestUrl.pathname === '/') return serveApp(res, kandownDir);
    if (requestUrl.pathname.startsWith('/api/')) {
      return handleApi(req, res, requestUrl, kandownDir);
    }
    return writeText(res, 404, 'Not found');
  });
}

function listen(server, port) {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (e) => {
      server.off('listening', onListening);
      rejectListen(e);
    };
    const onListening = () => {
      server.off('error', onError);
      resolveListen();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function listenOnAvailablePort(kandownDir, preferredPort) {
  const port = preferredPort ?? START_PORT_RANGE;
  const isSinglePort = preferredPort !== null;

  // 📖 Check if the target port is already occupied by a stale kandown process
  // from the SAME project. A stale process is one whose TUI exited but the HTTP
  // server is still alive. We ONLY reclaim same-project daemons here — a daemon
  // belonging to a DIFFERENT project (reason === null) must never be touched;
  // it is handled by the scan loop below (which skips it).
  const staleInfo = detectStaleKandown(port, kandownDir);
  if (staleInfo && staleInfo.reason) {
    warn(staleInfo.reason);
    try {
      process.kill(staleInfo.pid, 'SIGTERM');
      // Give it a moment to clean up
      await new Promise(r => setTimeout(r, 300));
      info(`Reclaimed port ${c.cyan}${port}${c.reset} (killed stale kandown PID ${staleInfo.pid})`);
    } catch {
      // Process already dead
    }
  }

  // If user specified a specific port, only try that one
  if (isSinglePort) {
    if (isBrowserUnsafePort(port)) {
      err(`Port ${c.bold}${port}${c.reset} is reserved for a well-known service and ${c.bold}blocked by all browsers${c.reset} (net::ERR_UNSAFE_PORT).`);
      log(`  Pick another port with ${c.cyan}--port${c.reset}.`);
      process.exit(1);
    }
    const server = createServeServer(kandownDir);
    try {
      await listen(server, port);
      return { server, port };
    } catch (e) {
      if (e.code === 'EADDRINUSE') {
        err(`Port ${c.bold}${port}${c.reset} is in use by another application.`);
        process.exit(1);
      }
      throw e;
    }
  }

  // 📖 Scan range — try ports until one works
  for (let p = START_PORT_RANGE; p <= END_PORT_RANGE; p++) {
    // 📖 Skip browser-blocked ports (e.g. 2049 = NFS). A daemon here would
    // start fine and answer curl, but the browser refuses with
    // net::ERR_UNSAFE_PORT, so the web UI looks dead. Move to the next port.
    if (isBrowserUnsafePort(p)) continue;
    // Skip port if occupied by a stale kandown from a DIFFERENT project
    const stale = detectStaleKandown(p, kandownDir);
    if (stale && !stale.reason) {
      // reason is null → different project, skip this port
      continue;
    }
    if (stale) {
      // Same project — already killed above for the first port, but handle edge case
      try { process.kill(stale.pid, 'SIGTERM'); } catch {}
      await new Promise(r => setTimeout(r, 200));
    }

    const server = createServeServer(kandownDir);
    try {
      await listen(server, p);
      return { server, port: p };
    } catch (e) {
      // 📖 EADDRINUSE → try the next port. EACCES (privileged port / blocked
      // by OS) → also try the next port instead of crashing (t113). Anything
      // else is unexpected and bubbles up.
      if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') throw e;
    }
  }

  err(`No free port available in ${c.bold}${START_PORT_RANGE}-${END_PORT_RANGE}${c.reset}.`);
  process.exit(1);
}

/**
 * 📖 Detects if a port is occupied by a stale/zombie kandown process.
 * A "stale" kandown is one whose TUI has exited but the HTTP server is still alive.
 * Returns { pid, cwd, reason } or null if the port is free or used by something else.
 */
function detectStaleKandown(port, currentKandownDir) {
  let pid;
  try {
    pid = execSync(`lsof -ti :${port} -sTCP:LISTEN`, { encoding: 'utf8', timeout: 2000 }).trim();
  } catch {
    return null; // Port is free
  }
  if (!pid) return null;

  const pids = pid.split('\n').filter(Boolean);
  if (pids.length === 0) return null;
  pid = parseInt(pids[0], 10);
  if (isNaN(pid) || pid === process.pid) return null;

  // Check if it's a kandown process
  let cmdline;
  try {
    cmdline = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8', timeout: 2000 }).trim();
  } catch {
    return null; // Process gone
  }

  if (!/[/\\]kandown\b|^kandown\b|\skandown\b/.test(cmdline)) return null; // Not a kandown process

  // Get the working directory of the existing process
  let cwd;
  try {
    if (process.platform === 'linux') {
      cwd = execSync(`readlink -f /proc/${pid}/cwd`, { encoding: 'utf8', timeout: 2000 }).trim();
    } else {
      // macOS
      cwd = execSync(`lsof -p ${pid} -Fn -a -d cwd 2>/dev/null | grep '^n' | cut -c2-`, { encoding: 'utf8', timeout: 2000, shell: true }).trim();
    }
  } catch {
    cwd = null;
  }

  // 📖 Compare with our project root (parent of .kandown/), not process.cwd().
  // process.cwd() could be a subdirectory; the project root is stable.
  const ourProjectRoot = currentKandownDir ? dirname(currentKandownDir) : process.cwd();
  const isSameProject = cwd && (cwd === ourProjectRoot || cwd === process.cwd());

  // 📖 If it's our own process, skip (we're checking our own port)
  if (pid === process.pid) return null;

  // 📖 Different project — don't touch, just skip the port
  if (!isSameProject) {
    return { pid, cwd: cwd || 'unknown', reason: null };
  }

  // 📖 Same project — stale/zombie or legitimate, kill it either way.
  // The user is explicitly launching kandown, so they want a fresh instance.
  return {
    pid,
    cwd: cwd || 'unknown',
    reason: `${c.yellow}Existing kandown found on port ${c.cyan}${port}${c.yellow} (PID ${pid}, same project). Reconnecting...${c.reset}`,
  };
}

async function cmdDaemon(rawArgs) {
  const [subcommand = 'status', ...rest] = rawArgs;
  const { kandownDir } = ensureKandownDir(rest);
  const preferredPort = parsePort(parseArgs(rest).port);

  if (subcommand === 'run') {
    const { server, port } = await listenOnAvailablePort(kandownDir, preferredPort);
    const url = `http://localhost:${port}`;
    ensureDaemonGitignore(kandownDir);
    writeDaemonMetadata(kandownDir, {
      pid: process.pid,
      port,
      url,
      kandownDir,
      startedAt: daemonStartedAt,
      version: getCurrentVersion(),
      // 📖 Local-only secret (M5): daemon.json is chmod-protected by the
      // user's umask and gitignored; the CLI/TUI read the token here to call
      // the API. Never exposed by GET /api/daemon.
      token: DAEMON_TOKEN,
    });

    const shutdown = () => {
      server.close(() => {
        removeDaemonMetadata(kandownDir);
        process.exit(0);
      });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    await new Promise(() => {});
    return;
  }

  if (subcommand === 'start') {
    refreshKandownHtml(kandownDir);
    const status = await startDaemon(kandownDir, preferredPort);
    if (!status.running || !status.metadata) {
      err('Daemon failed to start');
      process.exit(1);
    }
    success(`Daemon running: ${status.metadata.url}`);
    return;
  }

  if (subcommand === 'stop') {
    const stopped = await stopDaemon(kandownDir);
    if (stopped) success('Daemon stopped');
    else info('Daemon already stopped');
    return;
  }

  if (subcommand === 'status') {
    const status = await getDaemonStatus(kandownDir);
    if (status.running && status.metadata) {
      success(`Daemon ON  ${status.metadata.url}  PID ${status.metadata.pid}`);
    } else {
      info('Daemon OFF');
    }
    return;
  }

  err(`Unknown daemon command: ${subcommand}`);
  log(`  Use ${c.cyan}kandown daemon start|stop|status${c.reset}`);
  process.exit(1);
}

/**
 * 📖 Starts/reconnects the per-project web daemon, opens it in the browser,
 * then hands the terminal to the board TUI. The daemon intentionally survives
 * TUI exit so the web UI keeps working until the user stops it.
 */
async function cmdServe(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);

  try {
    if (refreshKandownHtml(kandownDir)) {
      info(`Refreshed kandown.html (CLI v${getCurrentVersion()})`);
    }
  } catch (e) {
    warn(`Could not refresh kandown.html: ${e.message}`);
  }

  const preferredPort = parsePort(parseArgs(rawArgs).port);
  const status = await startDaemon(kandownDir, preferredPort);
  if (!status.running || !status.metadata) {
    err('Failed to start web daemon');
    process.exit(1);
  }

  success(`Web daemon: ${status.metadata.url}`);
  info(`Project: ${kandownDir}`);
  openInBrowser(status.metadata.url);
  await cmdTui('board', rawArgs);
}

/**
 * 📖 Opens a URL in the system default browser after confirming the server is ready.
 * Non-blocking — spawns the opener and returns immediately.
 * macOS: open, Linux: xdg-open, Windows: start (via cmd.exe).
 */
async function openInBrowser(url) {
  // 📖 Wait for server to be truly ready (up to 2s) before opening browser.
  // This prevents ERR_UNSAFE_PORT and similar race conditions.
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(500) });
      if (res.ok || res.status === 404) break; // server is up (404 means serving HTML)
    } catch { /* server not ready yet */ }
    await new Promise(r => setTimeout(r, 200));
  }

  const opener = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(opener, args, { detached: true, stdio: 'ignore' });
  child.on('error', (e) => warn(`Could not open browser automatically: ${e.message}`));
  child.unref();
}

// 📖 Launches the fullscreen TUI for a given screen (settings, board, etc.)
async function cmdTui(screen, rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const version = getCurrentVersion();

  try {
    const { run } = await import(new URL('./tui.js', import.meta.url).href);
    await run(screen, kandownDir, version);
  } catch (e) {
    err(`Failed to launch TUI: ${e.message}`);
    process.exit(1);
  }
}

const rawArgs = process.argv.slice(2).filter((a) => a !== '--no-update-check');
const [cmd, ...rest] = rawArgs;

// 📖 Handle --version / -v before any command logic
if (cmd === '--version' || cmd === '-v') {
  const v = getCurrentVersion() ?? 'unknown';
  out(`kandown v${v}`);
  process.exit(0);
}

// 📖 Skip auto-update if this is a respawned child after an update.
// The parent passes --no-update-check to prevent an infinite update loop.
const skipUpdate = process.argv.slice(2).includes('--no-update-check');

// 📖 Update policy (M1): the check only runs for INTERACTIVE commands.
// The one-shot task commands (scripts/agents) and `daemon` (spawned
// children, status probes) must never pay a network round-trip nor risk a
// mid-pipeline respawn. Inside checkForUpdate there are further guards: 24h
// throttle, TTY-only, and the KANDOWN_NO_UPDATE=1 opt-out.
async function cmdDoctor(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const fix = rawArgs.includes('--fix');
  log(`${c.bold}kandown doctor${c.reset} ${c.dim}— environment & board diagnostic${c.reset}\n`);

  let errors = 0;
  let warnings = 0;

  const cliVer = getCurrentVersion();
  log(`  ${c.cyan}CLI Version:${c.reset} ${cliVer}`);

  const configPath = join(kandownDir, 'kandown.json');
  if (existsSync(configPath)) {
    try {
      JSON.parse(readFileSync(configPath, 'utf8'));
      log(`  ${c.green}✓${c.reset} kandown.json valid`);
    } catch (e) {
      log(`  ${c.red}✗${c.reset} kandown.json invalid JSON: ${e.message}`);
      errors++;
    }
  } else {
    log(`  ${c.red}✗${c.reset} kandown.json missing`);
    errors++;
  }

  const daemon = readDaemonMetadata(kandownDir);
  if (daemon) {
    const alive = isProcessAlive(daemon.pid);
    if (alive) {
      log(`  ${c.green}✓${c.reset} Daemon running on port ${daemon.port} (PID ${daemon.pid})`);
    } else {
      log(`  ${c.yellow}⚠${c.reset} Daemon metadata stale (PID ${daemon.pid} dead)`);
      warnings++;
      if (fix) {
        removeDaemonMetadata(kandownDir);
        log(`    ${c.green}└─ Fixed: removed stale daemon.json${c.reset}`);
      }
    }
  } else {
    log(`  ${c.dim}ℹ Daemon not running${c.reset}`);
  }

  const tasksDir = getTasksDir(kandownDir);
  if (existsSync(tasksDir)) {
    const activeFiles = readdirSync(tasksDir).filter(f => f.endsWith('.md'));
    const archiveDir = join(tasksDir, 'archive');
    const archiveFiles = existsSync(archiveDir) ? readdirSync(archiveDir).filter(f => f.endsWith('.md')) : [];

    log(`  ${c.cyan}Tasks:${c.reset} ${activeFiles.length} active, ${archiveFiles.length} archived`);

    const activeSet = new Set(activeFiles);
    const duplicates = archiveFiles.filter(f => activeSet.has(f));
    if (duplicates.length > 0) {
      log(`  ${c.red}✗${c.reset} Found ${duplicates.length} duplicate file(s) in tasks/ and archive/: ${duplicates.join(', ')}`);
      errors++;
      if (fix) {
        for (const dup of duplicates) {
          unlinkSync(join(archiveDir, dup));
        }
        log(`    ${c.green}└─ Fixed: removed duplicate archived files${c.reset}`);
      }
    } else {
      log(`  ${c.green}✓${c.reset} No duplicate task files`);
    }

    let invalidFm = 0;
    for (const f of activeFiles) {
      try {
        const content = readFileSync(join(tasksDir, f), 'utf8');
        parseFrontmatter(content);
      } catch {
        invalidFm++;
      }
    }
    if (invalidFm > 0) {
      log(`  ${c.yellow}⚠${c.reset} ${invalidFm} task file(s) have invalid frontmatter formatting`);
      warnings++;
    } else {
      log(`  ${c.green}✓${c.reset} Task frontmatters valid`);
    }
  }

  log('');
  if (errors === 0 && warnings === 0) {
    success('Everything looks good!');
  } else {
    info(`Doctor summary: ${errors} error(s), ${warnings} warning(s). ${fix ? '' : 'Run with --fix to resolve automatically.'}`);
  }
}

function cmdUndo(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const logPath = join(kandownDir, '.undo', 'log.json');
  if (!existsSync(logPath)) {
    info('No actions to undo');
    return;
  }
  try {
    const list = JSON.parse(readFileSync(logPath, 'utf8'));
    if (!list || list.length === 0) {
      info('No actions to undo');
      return;
    }
    const record = list.shift();
    writeFileSync(logPath, JSON.stringify(list, null, 2), 'utf8');
    if (record.previousContent === null) {
      if (existsSync(record.path)) unlinkSync(record.path);
    } else {
      const dir = dirname(record.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(record.path, record.previousContent, 'utf8');
      if (record.newContent !== null && record.path.includes('/archive/')) {
        const activePath = record.path.replace('/archive/', '/');
        if (existsSync(activePath)) unlinkSync(activePath);
      }
    }
    success(`Undid last action (${record.type} ${record.taskId})`);
  } catch (e) {
    err(`Undo failed: ${e.message}`);
  }
}

async function cmdProjects(rawArgs) {
  const isJson = rawArgs.includes('--json');
  const running = [];

  for (let port = START_PORT_RANGE; port <= END_PORT_RANGE; port++) {
    if (isBrowserUnsafePort(port)) continue;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 200);
      const res = await fetch(`http://127.0.0.1:${port}/api/daemon`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          running.push({ port, pid: data.pid, kandownDir: data.kandownDir, startedAt: data.startedAt, version: data.version });
        }
      }
    } catch {}
  }

  if (isJson) {
    out(JSON.stringify(running, null, 2));
    return;
  }

  if (running.length === 0) {
    info('No active kandown web daemons running on this machine');
    return;
  }

  log(`${c.bold}Active Kandown Daemons (${running.length})${c.reset}\n`);
  for (const d of running) {
    log(`  ${c.green}●${c.reset} Port ${c.cyan}${d.port}${c.reset}  PID ${d.pid}  ${c.dim}${d.kandownDir}${c.reset}`);
  }
function cmdExport(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const isCsv = rawArgs.includes('--csv');
  const board = readBoard(kandownDir);

  if (isCsv) {
    let csv = 'id,title,status,priority,assignee,tags,created\n';
    for (const col of board.columns) {
      for (const t of col.tasks) {
        const task = readTask(kandownDir, t.id);
        const tags = (t.tags || []).join(';');
        csv += `"${t.id}","${t.title.replace(/"/g, '""')}","${col.name}","${t.priority || ''}","${t.assignee || ''}","${tags}","${task.frontmatter.created || ''}"\n`;
      }
    }
    out(csv);
  } else {
    const data = [];
    for (const col of board.columns) {
      for (const t of col.tasks) {
        const task = readTask(kandownDir, t.id);
        data.push({ ...task, status: col.name });
      }
    }
    out(JSON.stringify(data, null, 2));
  }
}

function cmdImport(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const fileIdx = rawArgs.findIndex(a => a.endsWith('.json') || a.endsWith('.md'));
  if (fileIdx === -1 || !existsSync(rawArgs[fileIdx])) {
    err('Usage: kandown import <file.json | file.md>');
    process.exit(1);
  }
  const filePath = rawArgs[fileIdx];
  const content = readFileSync(filePath, 'utf8');
  let count = 0;

  if (filePath.endsWith('.json')) {
    try {
      const parsed = JSON.parse(content);
      const cards = Array.isArray(parsed) ? parsed : (parsed.cards || []);
      for (const c of cards) {
        const title = c.name || c.title || 'Imported Task';
        createTaskInBoard(kandownDir, title, c.status || 'Backlog');
        count++;
      }
    } catch (e) {
      err(`Import failed: ${e.message}`);
      process.exit(1);
    }
  } else {
    const lines = content.split('\n');
    for (const line of lines) {
      const m = line.match(/^#{1,3}\s+(.+)$/);
      if (m) {
        createTaskInBoard(kandownDir, m[1].trim(), 'Backlog');
        count++;
      }
    }
  }

  success(`Imported ${count} tasks into board`);
}

async function cmdUpdate(rawArgs) {
  const current = getCurrentVersion();
  log(`${c.bold}kandown update${c.reset} ${c.dim}— checking version notice & updates…${c.reset}`);
  printVersionChangelog(current);
  await checkForUpdate(['node', 'kandown', ...rawArgs]);
}

const SCRIPTED_COMMANDS = new Set([
  'list', 'ls', 'show', 'create', 'new', 'move', 'assign', 'commit', 'tasks', 'work', 'daemon',
  'doctor', 'undo', 'projects', 'export', 'import',
]);
if (!skipUpdate && !SCRIPTED_COMMANDS.has(cmd)) await checkForUpdate(process.argv);

if (!SCRIPTED_COMMANDS.has(cmd)) checkVersionSeenNotices();

switch (cmd) {
  case 'export':
    cmdExport(rest);
    break;

  case 'import':
    cmdImport(rest);
    break;
  case 'init':
    cmdInit(rest);
    break;

  case 'doctor':
    await cmdDoctor(rest);
    break;

  case 'undo':
    cmdUndo(rest);
    break;

  case 'mcp': {
    const { kandownDir } = ensureKandownDir(rest);
    const { startMcpServer } = await import('../src/cli/lib/mcp.js');
    startMcpServer(kandownDir);
    break;
  }

  case 'projects':
    await cmdProjects(rest);
    break;

  case 'board':
    // 📖 kandown board — open the interactive kanban board TUI only
    await cmdTui('board', rest);
    break;

  case 'settings':
    await cmdTui('settings', rest);
    break;

  case 'daemon':
    await cmdDaemon(rest);
    break;

  case 'update':
    cmdUpdate(rest);
    break;

  // 📖 One-shot task commands — top-level, no "shell" wrapper. These are the
  // most basic operations of the product (list/read/create/move/assign a
  // task, commit the board to git); nesting them under a prefix only added
  // friction for scripts and AI agents, which is exactly who these are for.
  case 'list':
  case 'ls':
    cmdList(rest);
    break;

  case 'show':
    cmdShow(rest);
    break;

  case 'create':
  case 'new':
    cmdCreate(rest);
    break;

  case 'move':
    cmdMove(rest);
    break;

  case 'assign':
    cmdAssign(rest);
    break;

  case 'commit':
    cmdCommit(rest);
    break;

  case 'tasks':
    // 📖 `kandown tasks` — cheatsheet for the commands above (`list help`
    // etc. would collide with real usage, so the index lives on its own verb).
    printTaskCommandsHelp();
    break;

  case 'work':
    // 📖 `kandown work` — the agent entrypoint (rules + live board digest).
    // See cmdWork's doc comment for the full rationale.
    await cmdWork(rest);
    break;

  case 'help':
  case '--help':
  case '-h':
    help();
    break;

  case undefined:
    // 📖 kandown (no args) — serve the web UI over localhost and open the board TUI.
    await cmdServe(rest);
    break;

  default:
    if (cmd.startsWith('-')) {
      await cmdServe([cmd, ...rest]);
      break;
    }
    err(`Unknown command: ${cmd}`);
    help();
    process.exit(1);
}
