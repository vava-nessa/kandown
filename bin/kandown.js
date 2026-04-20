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
 *  → cmdInit — installs `.kandown`
 *  → cmdUpdate — refreshes installed kandown.html
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
} from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, '..');
// 📖 Default localhost range for the zero-config `kandown` web UI server.
const DEFAULT_SERVE_PORT = 2048;
const MAX_SERVE_PORT = 2060;

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
  log(`
${c.bold}kandown${c.reset} ${c.dim}· file-based kanban backed by markdown${c.reset}

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

**IMPORTANT:** Before touching any task files, you MUST read \`AGENT_KANDOWN.md\`.

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
  const agentKandownDest = join(cwd, 'AGENT_KANDOWN.md');
  if (!existsSync(agentKandownDest)) {
    copyFileSync(agentKandownSrc, agentKandownDest);
    success('AGENT_KANDOWN.md (at project root)');
  } else {
    info('AGENT_KANDOWN.md already exists at project root (kept)');
  }

  const compactSrc = join(templatesDir, 'AGENT_KANDOWN_COMPACT.md');
  const compactDest = join(cwd, 'AGENT_KANDOWN_COMPACT.md');
  if (existsSync(compactSrc) && !existsSync(compactDest)) {
    copyFileSync(compactSrc, compactDest);
    success('AGENT_KANDOWN_COMPACT.md (at project root)');
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

function writeText(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
  });
  res.end(body);
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

function handleApi(req, res) {
  writeText(res, 501, 'Not Implemented', apiHeaders());
}

function serveApp(res, kandownDir) {
  const htmlPath = join(kandownDir, 'kandown.html');
  if (!existsSync(htmlPath)) {
    writeText(res, 404, 'kandown.html not found');
    return;
  }

  try {
    const html = readFileSync(htmlPath, 'utf8');
    const injected = html.replace(
      '</head>',
      `<script>window.__KANDOWN_ROOT__ = ${JSON.stringify(kandownDir)};</script>\n</head>`,
    );
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
    if (requestUrl.pathname.startsWith('/api/')) return handleApi(req, res, requestUrl, kandownDir);
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
  const startPort = preferredPort ?? DEFAULT_SERVE_PORT;
  const endPort = preferredPort ?? MAX_SERVE_PORT;

  for (let port = startPort; port <= endPort; port++) {
    const server = createServeServer(kandownDir);
    try {
      await listen(server, port);
      return { server, port };
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
    }
  }

  const range = preferredPort === null
    ? `${DEFAULT_SERVE_PORT}-${MAX_SERVE_PORT}`
    : String(preferredPort);
  err(`No free port available in ${c.bold}${range}${c.reset}.`);
  process.exit(1);
}

/**
 * 📖 Starts the local web UI server, opens it in the browser, then hands the
 * terminal to the board TUI. The server intentionally stays in this process so
 * the browser can keep talking to localhost while the terminal board is active.
 */
async function cmdServe(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);

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
 * 📖 Opens a file path in the system default browser/app.
 * Non-blocking — spawns the opener and returns immediately.
 * macOS: open, Linux: xdg-open, Windows: start (via cmd.exe).
 */
function openInBrowser(filePath) {
  const opener = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', filePath] : [filePath];
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

  try {
    const { run } = await import(new URL('./tui.js', import.meta.url).href);
    await run(screen, kandownDir);
  } catch (e) {
    err(`Failed to launch TUI: ${e.message}`);
    process.exit(1);
  }
}

const [cmd, ...rest] = process.argv.slice(2);

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
