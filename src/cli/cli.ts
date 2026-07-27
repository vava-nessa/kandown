/**
 * @file Main Kandown CLI Entrypoint
 * @description Entrypoint for the kandown command line tool. Dispatches verbs,
 * runs auto-update checks, manages daemon processes, and spawns the Ink TUI & browser.
 *
 * 📖 Command handlers live in ./commands/*.ts, grouped by what they act on
 * (project lifecycle, task CRUD, daemon subcommands); shared arg-parsing,
 * path-resolution, and console helpers live in ./lib/cli-shared.ts. This
 * file only owns verb dispatch (`main`'s switch) and the bare/TUI launch path.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentVersion, checkForUpdate } from './lib/updater';
import { getDaemonStatus, startProjectDaemon } from './lib/daemon';
import { startMcpServer } from './lib/mcp';
import { openBrowser } from './lib/browser';
import {
  c, log, err, parseArgs, splitCommand, resolveKandownDir, ensureKandownDir,
  help, printTaskCommandsHelp, launchTui,
} from './lib/cli-shared';
import { cmdInit, cmdUpdate, cmdDoctor, cmdWork } from './commands/project';
import {
  cmdList, cmdShow, cmdCreate, cmdMove, cmdAssign, cmdCommit,
  cmdExport, cmdProjects, cmdImport,
} from './commands/tasks';
import { cmdDaemon } from './commands/daemon';
import { cmdRun } from './commands/run';
import { cmdAgents } from './commands/agents';

async function cmdTui(screen: 'board' | 'settings', rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  const kandownDir = resolveKandownDir(args.path, process.cwd());
  await launchTui(screen, kandownDir);
}

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 1 && (rawArgs[0] === '--version' || rawArgs[0] === 'version')) {
    log(getCurrentVersion());
    return;
  }

  const { cmd, rest } = splitCommand(rawArgs);

  const skipUpdate = rawArgs.includes('--no-update-check') || process.env.KANDOWN_NO_UPDATE === '1';

  if (!skipUpdate) {
    await checkForUpdate(process.argv);
  }

  switch (cmd) {
    case 'init':
      cmdInit(rest);
      break;

    case 'update':
    case 'upgrade':
      await cmdUpdate(rest);
      break;

    case 'doctor':
      await cmdDoctor(rest);
      break;

    case 'work':
      await cmdWork(rest);
      break;

    case 'board':
      await cmdTui('board', rest);
      break;

    case 'settings':
      await cmdTui('settings', rest);
      break;

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

    case 'run':
      await cmdRun(rest);
      break;

    case 'agents':
      cmdAgents(rest);
      break;

    case 'tasks':
      printTaskCommandsHelp();
      break;

    case 'projects':
      cmdProjects(rest);
      break;

    case 'export':
      cmdExport(rest);
      break;

    case 'import':
      cmdImport(rest);
      break;

    case 'mcp': {
      const { kandownDir } = ensureKandownDir(rest);
      startMcpServer(kandownDir);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
      help();
      break;

    case 'daemon':
      await cmdDaemon(rest);
      break;

    case undefined: {
      const parsed = parseArgs(rest);
      const kandownDir = resolveKandownDir(parsed.path, process.cwd());

      // 📖 Only start the daemon & open the browser if the project already
      // exists. If it doesn't, the TUI shows a confirmation prompt first,
      // it starts the daemon and opens the browser itself once created.
      // The check mirrors the TUI's own gate: a bare `.kandown/` directory
      // without `kandown.json` is a partial init, not a project.
      if (existsSync(join(kandownDir, 'kandown.json'))) {
        let status = await getDaemonStatus(kandownDir);
        if (!status.running) {
          status = await startProjectDaemon(kandownDir);
        }
        if (!parsed.flags['no-open']) {
          const urlToOpen = status.metadata?.url || join(kandownDir, 'kandown.html');
          openBrowser(urlToOpen);
        }
      } else if (!process.stdin.isTTY) {
        err(`No kandown project found at ${c.bold}${kandownDir}${c.reset} — run ${c.cyan}kandown init${c.reset} first.`);
        process.exit(1);
      }

      await launchTui('board', kandownDir);
      break;
    }

    default:
      if (!cmd || cmd.startsWith('-')) {
        help();
        break;
      }
      err(`Unknown command: ${cmd}`);
      help();
      process.exit(1);
  }
}

void main();
