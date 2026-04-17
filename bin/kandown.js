#!/usr/bin/env node
/* eslint-disable no-console */

import { fileURLToPath } from 'node:url';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, '..');

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
  npx kandown <command>

${c.bold}Commands:${c.reset}
  ${c.cyan}init${c.reset}        Initialize .kanban/ in the current directory
  ${c.cyan}update${c.reset}      Update kanban.html to the latest version
  ${c.cyan}help${c.reset}        Show this help

${c.bold}Examples:${c.reset}
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

function appendAgentReference(cwd, agentsFile, kanbanPath) {
  const filePath = join(cwd, agentsFile);
  const marker = '<!-- kandown:agent-ref -->';
  const existing = readFileSync(filePath, 'utf8');

  if (existing.includes(marker)) {
    info(`${agentsFile} already references the kanban (skipped)`);
    return false;
  }

  const ref = `

${marker}
## Task management

**IMPORTANT:** Before touching any task files, you MUST read \`AGENT_KANDOWN.md\`.

This project uses a file-based kanban:
- **Start with \`${kanbanPath}/board.md\`** — task index (always lean)
- **Only open \`${kanbanPath}/tasks/t-xxx.md\`** when you need full details on a specific task
- **Completion workflow:** Move task to Done in \`board.md\` + write \`## What was done\` in the task file
`;

  writeFileSync(filePath, existing + ref, 'utf8');
  return true;
}

function createAgentsFileIfMissing(cwd, kanbanPath) {
  const agentsPath = join(cwd, 'AGENTS.md');
  if (existsSync(agentsPath)) return false;

  const content = `# Agent instructions

<!-- kandown:agent-ref -->
## Task management

**IMPORTANT:** Before touching any task files, you MUST read \`AGENT_KANDOWN.md\`.

This project uses a file-based kanban:
- **Start with \`${kanbanPath}/board.md\`** — task index (always lean)
- **Only open \`${kanbanPath}/tasks/t-xxx.md\`** when you need full details on a specific task
- **Completion workflow:** Move task to Done in \`board.md\` + write \`## What was done\` in the task file
`;
  writeFileSync(agentsPath, content, 'utf8');
  return true;
}

function parseArgs(argv) {
  const args = { path: '.kanban', noAgents: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--path' || a === '-p') args.path = argv[++i];
    else if (a === '--no-agents') args.noAgents = true;
    else if (a === '--force' || a === '-f') args.force = true;
  }
  return args;
}

function cmdInit(rawArgs) {
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const kanbanDir = resolve(cwd, args.path);
  const kanbanPath = args.path;

  log('');
  info(`Installing kandown in ${c.bold}${kanbanPath}/${c.reset}`);
  log('');

  if (existsSync(kanbanDir) && !args.force) {
    err(`Directory ${c.bold}${kanbanPath}/${c.reset} already exists.`);
    log(`  Use ${c.cyan}--force${c.reset} to overwrite or ${c.cyan}--path <dir>${c.reset} for another location.`);
    process.exit(1);
  }

  mkdirSync(kanbanDir, { recursive: true });

  // Copy kanban.html from dist
  const htmlSrc = join(PKG_ROOT, 'dist', 'index.html');
  const htmlDest = join(kanbanDir, 'kanban.html');
  if (!existsSync(htmlSrc)) {
    err(`Missing build output at ${htmlSrc}. Did you run 'npm run build'?`);
    process.exit(1);
  }
  copyFileSync(htmlSrc, htmlDest);
  success('kanban.html');

  // Copy templates
  const templatesDir = join(PKG_ROOT, 'templates');
  if (!existsSync(join(kanbanDir, 'board.md'))) {
    copyFileSync(join(templatesDir, 'board.md'), join(kanbanDir, 'board.md'));
    success('board.md');
  } else {
    warn('board.md already exists (kept)');
  }
  if (!existsSync(join(kanbanDir, 'AGENT.md'))) {
    copyFileSync(join(templatesDir, 'AGENT.md'), join(kanbanDir, 'AGENT.md'));
    success('AGENT.md');
  }
  if (!existsSync(join(kanbanDir, 'README.md'))) {
    copyFileSync(join(templatesDir, 'README.md'), join(kanbanDir, 'README.md'));
    success('README.md');
  }

  const tasksSrc = join(templatesDir, 'tasks');
  const tasksDest = join(kanbanDir, 'tasks');
  if (!existsSync(tasksDest)) {
    copyRecursive(tasksSrc, tasksDest);
    success('tasks/ (with welcome example)');
  } else {
    info('tasks/ already exists (kept)');
  }

  // Copy AGENT_KANDOWN.md to project root (not inside .kanban/)
  const agentKandownSrc = join(templatesDir, 'AGENT_KANDOWN.md');
  const agentKandownDest = join(cwd, 'AGENT_KANDOWN.md');
  if (!existsSync(agentKandownDest)) {
    copyFileSync(agentKandownSrc, agentKandownDest);
    success('AGENT_KANDOWN.md (at project root)');
  } else {
    info('AGENT_KANDOWN.md already exists at project root (kept)');
  }

  // Integrate with AGENTS.md / CLAUDE.md
  if (!args.noAgents) {
    log('');
    const existingAgents = findAgentsFile(cwd);
    if (existingAgents) {
      const added = appendAgentReference(cwd, existingAgents, kanbanPath);
      if (added) success(`Appended kanban reference to ${c.bold}${existingAgents}${c.reset}`);
    } else {
      const created = createAgentsFileIfMissing(cwd, kanbanPath);
      if (created) success(`Created ${c.bold}AGENTS.md${c.reset} with kanban reference`);
    }
  }

  log('');
  log(`${c.green}${c.bold}Done.${c.reset}`);
  log('');
  log(`  ${c.dim}Next steps:${c.reset}`);
  log(`  ${c.cyan}1.${c.reset} Open ${c.bold}${kanbanPath}/kanban.html${c.reset} in Chrome/Edge/Brave`);
  log(`  ${c.cyan}2.${c.reset} Select the ${c.bold}${kanbanPath}/${c.reset} folder when prompted`);
  log(`  ${c.cyan}3.${c.reset} Start creating tasks. Press ${c.cyan}⌘K${c.reset} for the command palette`);
  log('');
  log(`  ${c.dim}macOS:${c.reset}   open ${kanbanPath}/kanban.html`);
  log(`  ${c.dim}Linux:${c.reset}   xdg-open ${kanbanPath}/kanban.html`);
  log(`  ${c.dim}Windows:${c.reset} start ${kanbanPath}/kanban.html`);
  log('');
}

function cmdUpdate(rawArgs) {
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const kanbanDir = resolve(cwd, args.path);
  const htmlDest = join(kanbanDir, 'kanban.html');

  if (!existsSync(htmlDest)) {
    err(`No kanban.html found at ${c.bold}${htmlDest}${c.reset}`);
    log(`  Run ${c.cyan}npx kandown init${c.reset} first.`);
    process.exit(1);
  }

  const htmlSrc = join(PKG_ROOT, 'dist', 'index.html');
  if (!existsSync(htmlSrc)) {
    err(`Missing build output. Did you run 'npm run build'?`);
    process.exit(1);
  }
  copyFileSync(htmlSrc, htmlDest);
  success(`Updated ${args.path}/kanban.html`);
}

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case 'init':
    cmdInit(rest);
    break;
  case 'update':
    cmdUpdate(rest);
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    help();
    break;
  default:
    err(`Unknown command: ${cmd}`);
    help();
    process.exit(1);
}
