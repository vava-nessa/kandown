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
 *  → cmdInit — installs `.kandown`
 *  → cmdUpdate — refreshes installed kandown.html
 *  → injectServerRoot — injects the CLI server root into single-file HTML
 *  → createServeServer — creates the local zero-dependency HTTP server
 *  → cmdServe — opens the web UI over localhost and launches the board TUI
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
  ${c.cyan}update${c.reset}      Update kandown.html to the latest version
  ${c.cyan}help${c.reset}        Show this help

${c.bold}Options:${c.reset}
  ${c.cyan}--port <n>${c.reset}  Preferred local HTTP port for ${c.cyan}kandown${c.reset} (default: ${DEFAULT_SERVE_PORT}-${MAX_SERVE_PORT})

${c.bold}Examples:${c.reset}
  ${c.dim}$${c.reset} npx kandown              ${c.dim}# local web server + board TUI${c.reset}
  ${c.dim}$${c.reset} npx kandown --port 3000  ${c.dim}# use a specific web UI port${c.reset}
  ${c.dim}$${c.reset} npx kandown board        ${c.dim}# board TUI only${c.reset}
  ${c.dim}$${c.reset} npx kandown init
  ${c.dim}$${c.reset} npx kandown init --path docs/kanban
  ${c.dim}$${c.reset} npx kandown init --no-agents
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
- **Tasks live in \`${kandownPath}/tasks/t-xxx.md\`** — each task file owns its status
- **Columns live in \`${kandownPath}/kandown.json\`** under \`board.columns\`
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
- **Tasks live in \`${kandownPath}/tasks/t-xxx.md\`** — each task file owns its status
- **Columns live in \`${kandownPath}/kandown.json\`** under \`board.columns\`
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
 * @returns {{ kandownDir: string, alreadyExisted: boolean }} — resolves the
 * kandown directory and auto-inits it if it doesn't exist (no prompt, silent init).
 */
function ensureKandownDir(rawArgs) {
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const explicitPath = rawArgs.includes('--path') || rawArgs.includes('-p');
  const kandownDir = resolve(cwd, args.path);

  if (existsSync(kandownDir)) return { kandownDir, alreadyExisted: true };

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

  const tasksSrc = join(templatesDir, 'tasks');
  const tasksDest = join(kandownDir, 'tasks');
  if (!existsSync(tasksDest)) {
    copyRecursive(tasksSrc, tasksDest);
    success('tasks/ (with welcome example)');
  } else {
    info('tasks/ already exists (kept)');
  }

  if (!existsSync(join(kandownDir, 'kandown.json'))) {
    copyFileSync(join(templatesDir, 'kandown.json'), join(kandownDir, 'kandown.json'));
    success('kandown.json');
  } else {
    info('kandown.json already exists (kept)');
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
  log(`  ${c.dim}Next steps:${c.reset}`);
  log(`  ${c.cyan}1.${c.reset} Open ${c.bold}${kandownPath}/kandown.html${c.reset} in Chrome/Edge/Brave`);
  log(`  ${c.cyan}2.${c.reset} Select the ${c.bold}${kandownPath}/${c.reset} folder when prompted`);
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

function getTasks(res, kandownDir) {
  const tasksDir = join(kandownDir, 'tasks');
  if (!existsSync(tasksDir)) {
    writeJson(res, 200, []);
    return;
  }
  try {
    const files = readdirSync(tasksDir).filter(f => f.endsWith('.md'));
    const ids = files.map(f => f.replace(/\.md$/, ''));
    writeJson(res, 200, ids);
  } catch (e) {
    writeJson(res, 500, { error: `Failed to list tasks: ${e.message}` });
  }
}

function getTask(res, kandownDir, id) {
  if (!isValidTaskId(id)) {
    writeText(res, 400, 'Invalid task id');
    return;
  }
  const taskPath = join(kandownDir, 'tasks', `${id}.md`);
  if (!existsSync(taskPath)) {
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
    const tasksDir = join(kandownDir, 'tasks');
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
    const taskPath = join(tasksDir, `${id}.md`);
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
  const taskPath = join(kandownDir, 'tasks', `${id}.md`);
  if (!existsSync(taskPath)) {
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
  }

  writeJson(res, 404, { error: 'Not found' });
}

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

/**
 * 📖 Starts the local web UI server, opens it in the browser, then hands the
 * terminal to the board TUI. The server intentionally stays in this process so
 * the browser can keep talking to localhost while the terminal board is active.
 */
async function cmdServe(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);

  // 📖 Auto-refresh kandown.html if it already exists — ensures CLI upgrades
  // propagate to the web UI without requiring a separate `kandown update`.
  const htmlDest = join(kandownDir, 'kandown.html');
  const htmlSrc = join(PKG_ROOT, 'dist', 'index.html');
  if (existsSync(htmlDest) && existsSync(htmlSrc)) {
    try {
      copyFileSync(htmlSrc, htmlDest);
      info(`Refreshed kandown.html (CLI v${getCurrentVersion()})`);
    } catch (e) {
      warn(`Could not refresh kandown.html: ${e.message}`);
    }
  } else {
    info(`kandown.html not refreshed: dest=${existsSync(htmlDest)}, src=${existsSync(htmlSrc)}, PKG_ROOT=${PKG_ROOT}`);
  }

  const preferredPort = parsePort(parseArgs(rawArgs).port);
  const { server, port } = await listenOnAvailablePort(kandownDir, preferredPort);
  const url = `http://localhost:${port}`;

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  success(`Web UI: ${url}`);
  info(`Project: ${kandownDir}`);
  openInBrowser(url);
  try {
    await cmdTui('board', rawArgs);
  } finally {
    server.close();
  }
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

  case 'update':
    cmdUpdate(rest);
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
