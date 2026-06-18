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
  rmdirSync,
} from 'node:fs';
import { spawnSync, spawn, execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, '..');
// 📖 Default localhost range for the zero-config `kandown` web UI server.
const DEFAULT_SERVE_PORT = 2048;
const MAX_SERVE_PORT = 2060;
const START_PORT_RANGE = 2048;
const END_PORT_RANGE = 2060;
const DAEMON_FILE = 'daemon.json';

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
 * 📖 Compares two semver strings (major.minor.patch).
 * @returns {number} 1 if a > b, -1 if a < b, 0 if equal.
 */
function semverGt(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
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

  if (!latest || semverGt(current, latest) >= 0) return; // up to date or offline

  log('');
  log(`${c.yellow}⚡ Update available:${c.reset} kandown ${c.dim}${current}${c.reset} → ${c.green}${latest}${c.reset}`);
  info('Auto-updating…');

  // 📖 Step 2: Create lock file to prevent concurrent updates.
  try { writeFileSync(lockFile, `${process.pid}\n${now}`, 'utf8'); } catch { /* ignore */ }

  // 📖 Step 3: Run the update via npm or pnpm.
  // Try npm first, fall back to pnpm.
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
    warn('Auto-update failed — continuing with current version');
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
    // Install claimed success but version didn't change — probably a permissions issue.
    warn('Update did not apply — continuing with current version');
    log(`  Run ${c.cyan}npm install -g kandown${c.reset} to upgrade manually`);
    log('');
    return;
  }

  success(`Updated to v${postVersion} — restarting…`);
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

const log = (msg) => console.log(msg);
const success = (msg) => log(`${c.green}✓${c.reset} ${msg}`);
const info = (msg) => log(`${c.cyan}→${c.reset} ${msg}`);
const warn = (msg) => log(`${c.yellow}⚠${c.reset} ${msg}`);
const err = (msg) => log(`${c.red}✗${c.reset} ${msg}`);

function help() {
  const v = getCurrentVersion() ?? '?';
  log(`
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
  ${c.cyan}shell${c.reset}       Run shellable task commands (list/show/create/move/assign/commit)
  ${c.cyan}help${c.reset}        Show this help

${c.bold}Options:${c.reset}
  ${c.cyan}--port <n>${c.reset}  Preferred local HTTP port for ${c.cyan}kandown${c.reset} (default: ${DEFAULT_SERVE_PORT}-${MAX_SERVE_PORT})

${c.bold}Examples:${c.reset}
  ${c.dim}$${c.reset} npx kandown              ${c.dim}# local web server + board TUI${c.reset}
  ${c.dim}$${c.reset} npx kandown --port 3000  ${c.dim}# use a specific web UI port${c.reset}
  ${c.dim}$${c.reset} npx kandown board        ${c.dim}# board TUI only${c.reset}
  ${c.dim}$${c.reset} npx kandown daemon stop  ${c.dim}# stop this project's web daemon${c.reset}
  ${c.dim}$${c.reset} npx kandown init
  ${c.dim}$${c.reset} npx kandown init --path docs/kanban
  ${c.dim}$${c.reset} npx kandown init --no-agents
  ${c.dim}$${c.reset} npx kandown shell list --json
  ${c.dim}$${c.reset} npx kandown shell create "Refactor auth" -p P1
  ${c.dim}$${c.reset} npx kandown shell commit -m "tasks: refactor auth"
`);
}

function copyRecursive(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
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
  const existing = readFileSync(filePath, 'utf8');

  if (existing.includes(marker)) {
    info(`${agentsFile} already references the kandown (skipped)`);
    return false;
  }

  const ref = `

${marker}
## Task management

**IMPORTANT:** Before touching any task files, you MUST read \`${kandownPath}/AGENT_KANDOWN.md\`.

This project uses a file-based kanban:
- **Tasks live in \`./tasks/t-xxx.md\`** at the project root — each task file owns its status
- **Config lives in \`${kandownPath}/kandown.json\`** (columns, appearance, agent settings)
- **Completion workflow:** set task frontmatter \`status: Done\` + write the completion report
`;

  writeFileSync(filePath, existing + ref, 'utf8');
  return true;
}

function createAgentsFileIfMissing(cwd, kandownPath) {
  const agentsPath = join(cwd, 'AGENTS.md');
  if (existsSync(agentsPath)) return false;

  const content = `# Agent instructions

<!-- kandown:agent-ref -->
## Task management

**IMPORTANT:** Before touching any task files, you MUST read \`AGENT_KANDOWN.md\`.

This project uses a file-based kandown:
- **Tasks live in \`./tasks/t-xxx.md\`** at the project root — each task file owns its status
- **Config lives in \`${kandownPath}/kandown.json\`** (columns, appearance, agent settings)
- **Completion workflow:** set task frontmatter \`status: Done\` + write the completion report
`;
  writeFileSync(agentsPath, content, 'utf8');
  return true;
}

function parseArgs(argv) {
  const args = { path: '.kandown', noAgents: false, force: false, port: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--path' || a === '-p') args.path = argv[++i];
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
 *  - If `./tasks/*.md` already exists, never move anything (avoid clobbering).
 *  - If `.kandown/tasks/` doesn't exist or has no .md files, no-op.
 *  - Move every `.md` file (including those in `archive/`) to `./tasks/`.
 *  - Delete `.kandown/tasks/` only if it's now empty (preserves any non-md
 *    files like `.scratch/` notes the user may have stashed there).
 *  - Never throw — failures are logged and skipped so a single bad file
 *    doesn't block the rest of the migration.
 *
 * @param {string} kandownDir absolute path to the kandown config dir
 * @returns {{ moved: number, cleanedUp: boolean, skipped: boolean }}
 */
function migrateTasksToTopLevel(kandownDir) {
  const projectRoot = getProjectRoot(kandownDir);
  const oldDir = join(kandownDir, 'tasks');
  const newDir = getTasksDir(kandownDir);
  const result = { moved: 0, cleanedUp: false, skipped: false };

  if (!existsSync(oldDir)) return result;
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

  // 📖 If the old location has no .md files either, no migration needed.
  const oldMdFiles = readdirSync(oldDir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.md'));
  if (oldMdFiles.length === 0) {
    // Still try the archive subfolder.
    return migrateArchive(kandownDir, result);
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
      rmdirSync(oldDir);
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
  const explicitPath = rawArgs.includes('--path') || rawArgs.includes('-p');
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

  const templatesDir = join(PKG_ROOT, 'templates');
  if (!existsSync(join(kandownDir, 'AGENT.md'))) {
    copyFileSync(join(templatesDir, 'AGENT.md'), join(kandownDir, 'AGENT.md'));
    success('AGENT.md');
  }
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
    copyRecursive(tasksSrc, tasksDest);
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

  const agentKandownSrc = join(templatesDir, 'AGENT_KANDOWN.md');
  const agentKandownDest = join(kandownDir, 'AGENT_KANDOWN.md');
  if (!existsSync(agentKandownDest)) {
    copyFileSync(agentKandownSrc, agentKandownDest);
    success('AGENT_KANDOWN.md');
  } else {
    info('AGENT_KANDOWN.md already exists (kept)');
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

/* ═════════════ Shellable task commands ═════════════ */
/**
 * 📖 Self-contained minimal YAML frontmatter parser/writer for the CLI shell
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
  for (const line of yaml.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
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

function shellPad(str, len) {
  const s = String(str);
  if (s.length >= len) return s.slice(0, Math.max(0, len - 1)) + (s.length > len ? '…' : '');
  return s + ' '.repeat(len - s.length);
}

function shellParseArgs(argv) {
  // 📖 Minimal flag parser for the shell subcommands. Stops at the first
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

function shellResolveStatus(config, status) {
  // 📖 Status can be a configured column name OR the reserved `archived`
  // sentinel. Match is case-insensitive to keep shell usage forgiving.
  if (!status) return null;
  const lower = status.toLowerCase();
  if (lower === 'archived') return 'archived';
  const columns = (config && config.board && config.board.columns) || [];
  for (const c of columns) {
    if (c.toLowerCase() === lower) return c;
  }
  return null;
}

function shellList(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = shellParseArgs(rawArgs);
  const config = readKandownConfig(kandownDir);
  const statusFilter = args.flags.status ? shellResolveStatus(config, args.flags.status) : null;
  if (args.flags.status && !statusFilter) {
    err(`Unknown status: ${args.flags.status}`);
    process.exit(1);
  }
  if (statusFilter && statusFilter !== 'archived' && config && !(config.board.columns || []).map(c => c.toLowerCase()).includes(statusFilter.toLowerCase())) {
    err(`Status not in board columns: ${statusFilter}`);
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
    log(c.dim + '(no tasks)' + c.reset);
    return;
  }

  const idW = Math.max(2, ...rows.map(r => r.id.length));
  log(`${c.dim}${shellPad('ID', idW)}  ${shellPad('STATUS', 14)}  ${shellPad('PRI', 4)}  ${shellPad('ASSIGNEE', 12)}  TITLE${c.reset}`);
  for (const r of rows) {
    const status = (r.fm.status || 'Backlog') + (r.fm.archived === true || r.fm.archived === 'true' ? ' (archived)' : '');
    const pri = r.fm.priority || '';
    const assignee = r.fm.assignee || '';
    const title = (r.fm.title || '(untitled)').replace(/\n/g, ' ');
    log(`${shellPad(r.id, idW)}  ${shellPad(status, 14)}  ${shellPad(pri, 4)}  ${shellPad(assignee, 12)}  ${title}`);
  }
}

function shellShow(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = shellParseArgs(rawArgs);
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

function shellCreate(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = shellParseArgs(rawArgs);
  const title = args.positional.join(' ').trim();
  if (!title) {
    err('Usage: kandown create "title" [-p priority] [-a assignee] [-t tag] [--to status]');
    process.exit(1);
  }
  const config = readKandownConfig(kandownDir);
  const defaultStatus = (config && config.board && config.board.columns && config.board.columns[0]) || 'Backlog';
  const targetStatus = args.flags.to ? shellResolveStatus(config, args.flags.to) : defaultStatus;
  if (args.flags.to && !targetStatus) {
    err(`Unknown status: ${args.flags.to}`);
    process.exit(1);
  }
  const id = args.flags.id || nextTaskId(kandownDir);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    err(`Invalid task id: ${id}`);
    process.exit(1);
  }
  const tasksDir = getTasksDir(kandownDir);
  if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
  const targetPath = join(tasksDir, `${id}.md`);
  if (existsSync(targetPath)) {
    err(`Task already exists: ${id}`);
    process.exit(1);
  }
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
  writeFileSync(targetPath, content, 'utf8');
  log(`${c.green}✓${c.reset} Created ${c.bold}${id}${c.reset} → ${targetStatus}`);
  if (args.flags.json) {
    process.stdout.write(JSON.stringify({ id, ...fm }, null, 2) + '\n');
  } else {
    // 📖 Print the id on stdout (last line) so scripts can do
    // `ID=$(kandown create "...")` without parsing the colored status line.
    process.stdout.write(id + '\n');
  }
}

function shellMove(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = shellParseArgs(rawArgs);
  const [id, rawStatus] = args.positional;
  const targetStatus = rawStatus || args.flags.to;
  if (!id || !targetStatus) {
    err('Usage: kandown move <id> <status>');
    process.exit(1);
  }
  const config = readKandownConfig(kandownDir);
  const resolved = shellResolveStatus(config, targetStatus);
  if (!resolved) {
    err(`Unknown status: ${targetStatus}`);
    process.exit(1);
  }
  const path = findTaskFile(kandownDir, id);
  if (!path) {
    err(`Task not found: ${id}`);
    process.exit(1);
  }
  const parsed = parseFrontmatter(readFileSync(path, 'utf8'));
  parsed.frontmatter.status = resolved;
  if (resolved === 'archived') parsed.frontmatter.archived = true;
  else delete parsed.frontmatter.archived;
  // 📖 When archiving, move the file to tasks/archive/ to match what the
  // web UI does. Mirrors src/lib/filesystem.ts#archiveTaskFile.
  if (resolved === 'archived') {
    const archiveDir = join(getTasksDir(kandownDir), 'archive');
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
    writeFileSync(join(archiveDir, `${id}.md`), serializeFrontmatter(parsed.frontmatter, parsed.body), 'utf8');
    try { unlinkSync(path); } catch { /* already absent */ }
  } else {
    writeFileSync(path, serializeFrontmatter(parsed.frontmatter, parsed.body), 'utf8');
  }
  log(`${c.green}✓${c.reset} ${c.bold}${id}${c.reset} → ${resolved}`);
}

function shellAssign(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = shellParseArgs(rawArgs);
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
  writeFileSync(path, serializeFrontmatter(parsed.frontmatter, parsed.body), 'utf8');
  log(`${c.green}✓${c.reset} ${c.bold}${id}${c.reset} → ${name ? c.cyan + name : c.dim + '(unassigned)'}${c.reset}`);
}

function shellCommit(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = shellParseArgs(rawArgs);
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

function cmdShell(subcmd, rawArgs) {
  switch (subcmd) {
    case 'list':
    case 'ls':
      shellList(rawArgs);
      return;
    case 'show':
      shellShow(rawArgs);
      return;
    case 'create':
    case 'new':
      shellCreate(rawArgs);
      return;
    case 'move':
      shellMove(rawArgs);
      return;
    case 'assign':
      shellAssign(rawArgs);
      return;
    case 'commit':
      shellCommit(rawArgs);
      return;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      log(`
${c.bold}kandown shell${c.reset} ${c.dim}· task commands (one-shot, scriptable)${c.reset}

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
      return;
    default:
      err(`Unknown shell command: ${subcmd}`);
      log(`  Run ${c.cyan}kandown shell help${c.reset} for the list.`);
      process.exit(1);
  }
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
  writeFileSync(daemonMetadataPath(kandownDir), JSON.stringify(metadata, null, 2) + '\n', 'utf8');
}

function removeDaemonMetadata(kandownDir) {
  try {
    if (existsSync(daemonMetadataPath(kandownDir))) unlinkSync(daemonMetadataPath(kandownDir));
  } catch { /* ignore cleanup failure */ }
}

function ensureDaemonGitignore(kandownDir) {
  const gitignorePath = join(kandownDir, '.gitignore');
  try {
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, `${DAEMON_FILE}\n`, 'utf8');
      return;
    }
    const existing = readFileSync(gitignorePath, 'utf8');
    if (!existing.split(/\r?\n/).includes(DAEMON_FILE)) {
      writeFileSync(gitignorePath, `${existing.trimEnd()}\n${DAEMON_FILE}\n`, 'utf8');
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

async function getDaemonStatus(kandownDir) {
  const metadata = readDaemonMetadata(kandownDir);
  if (!metadata) return { running: false, metadata: null };
  if (!isProcessAlive(metadata.pid)) {
    removeDaemonMetadata(kandownDir);
    return { running: false, metadata: null };
  }
  const remote = await fetchDaemonInfo(metadata.port);
  if (!remote || remote.kandownDir !== kandownDir || remote.pid !== metadata.pid) {
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

async function waitForDaemon(kandownDir, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await getDaemonStatus(kandownDir);
    if (status.running) return status;
    await new Promise(r => setTimeout(r, 150));
  }
  return { running: false, metadata: null };
}

async function startDaemon(kandownDir, preferredPort) {
  const current = await getDaemonStatus(kandownDir);
  if (current.running) return current;

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

  return waitForDaemon(kandownDir);
}

async function stopDaemon(kandownDir) {
  const status = await getDaemonStatus(kandownDir);
  if (!status.running || !status.metadata) {
    removeDaemonMetadata(kandownDir);
    return false;
  }

  try {
    process.kill(status.metadata.pid, 'SIGTERM');
  } catch { /* already stopped */ }

  const started = Date.now();
  while (Date.now() - started < 2500 && isProcessAlive(status.metadata.pid)) {
    await new Promise(r => setTimeout(r, 100));
  }
  removeDaemonMetadata(kandownDir);
  return true;
}

function apiHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function handleCors(res) {
  res.writeHead(204, apiHeaders());
  res.end();
}

function writeJson(res, status, body) {
  const headers = { ...apiHeaders(), 'Content-Type': 'application/json' };
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function writeText(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { ...apiHeaders(), 'Content-Type': contentType });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
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

function putConfig(req, res, kandownDir) {
  readBody(req).then(body => {
    try {
      JSON.parse(body);
      const configPath = join(kandownDir, 'kandown.json');
      writeFileSync(configPath, body, 'utf8');
      writeJson(res, 200, { ok: true });
    } catch (e) {
      writeJson(res, 400, { error: 'Invalid JSON' });
    }
  }).catch(e => {
    writeJson(res, 500, { error: `Failed to read body: ${e.message}` });
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
    writeFileSync(boardPath, body, 'utf8');
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
    writeFileSync(taskPath, body, 'utf8');
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
    writeFileSync(join(archiveDir, `${id}.md`), body, 'utf8');
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
    writeFileSync(join(tasksDir, `${id}.md`), body, 'utf8');
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
  const script = `<script>window.__KANDOWN_ROOT__ = ${safeRoot};</script>\n`;

  if (markerIndex === -1) return script + html;

  return html.slice(0, markerIndex) + script + html.slice(markerIndex);
}

function handleApi(req, res, url, kandownDir) {
  const parts = url.pathname.replace('/api/', '').split('/');
  const resource = parts[0];
  const id = parts[1];

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
    writeText(res, 500, `Failed to serve kandown.html: ${e.message}`);
  }
}

/**
 * 📖 Creates the local HTTP server used by `kandown` with no arguments.
 * It serves the single-file web app and exposes placeholder API routes for the
 * follow-up REST task, keeping this refactor limited to server bootstrapping.
 */
function createServeServer(kandownDir) {
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

  // 📖 Check if the target port is already occupied by a stale kandown process.
  // This happens when the TUI crashes but the HTTP server stays alive.
  const staleInfo = detectStaleKandown(port, kandownDir);
  if (staleInfo) {
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
      if (e.code !== 'EADDRINUSE') throw e;
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

/**
 * 📖 Finds the kandown directory from cwd. Checks .kandown/ and kandown/.
 * Returns the resolved absolute path or null if not found.
 */
function findKandownDir(cwd) {
  const candidates = ['.kandown', 'kandown'];
  for (const dir of candidates) {
    const p = resolve(cwd, dir);
    if (existsSync(p)) return p;
  }
  return null;
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
  log(`kandown v${v}`);
  process.exit(0);
}

// 📖 Skip auto-update if this is a respawned child after an update.
// The parent passes --no-update-check to prevent an infinite update loop.
const skipUpdate = process.argv.slice(2).includes('--no-update-check');

// 📖 Auto-update check runs before EVERY command (except --version).
// Uses a short timeout so startup is not noticeably slower.
if (!skipUpdate) await checkForUpdate(process.argv);

switch (cmd) {
  case 'init':
    cmdInit(rest);
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

  case 'shell': {
    // 📖 Two-level command: `kandown shell <subcmd> [...args]`. Pull the
    // first non-flag arg as the subcommand and forward the rest.
    const [shellSubcmd, ...shellRest] = rest;
    cmdShell(shellSubcmd, shellRest);
    break;
  }

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
