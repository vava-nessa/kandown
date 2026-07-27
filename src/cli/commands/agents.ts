/**
 * @file `kandown agents` command handler — agent catalog & detection
 * @description Lists every agent in the merged catalog (built-ins +
 * `.kandown/agents.json`) with a live `which`-installed checkmark, and can
 * seed/refresh the committed catalog file.
 *
 * 📖 Subcommands:
 *   `kandown agents`         list the catalog + install status
 *   `kandown agents init`    write a default `.kandown/agents.json` (no clobber)
 *   `kandown agents scan`    same as the default list, made explicit
 *
 * @functions
 *  → cmdAgents — the command handler invoked from cli.ts
 *
 * @exports cmdAgents
 * @see src/cli/lib/agents.ts — catalog + detection
 * @see src/cli/lib/agents-config.ts — the persisted file
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveKandownDir, parseArgs, c, log, info, success, err } from '../lib/cli-shared.js';
import { loadCatalog, detectInstalledAgents, isAgentInstalled, warmupDetection, getCascadeConfig } from '../lib/agents.js';
import { loadAgentsConfig, saveAgentsConfig, defaultAgentsConfig } from '../lib/agents-config.js';

export function cmdAgents(rawArgs: string[]): void {
  const args = parseArgs(rawArgs);
  const kandownDir = resolveKandownDir(args.path, process.cwd());
  const sub = args.positional[0];

  if (sub === 'init') {
    const target = join(kandownDir, 'agents.json');
    if (existsSync(target)) {
      info(`${c.bold}agents.json${c.reset} already exists at ${target}`);
      return;
    }
    saveAgentsConfig(kandownDir, defaultAgentsConfig());
    success(`Wrote default ${c.bold}agents.json${c.reset} to ${target}`);
    log(`${c.dim}  Commit it so your team shares the same agent catalog + aliases.${c.reset}`);
    return;
  }

  // Default + `scan`: warm the cache, then print the catalog with checkmarks.
  warmupDetection(loadCatalog(kandownDir));
  const catalog = loadCatalog(kandownDir);
  const installed = detectInstalledAgents(kandownDir);
  const cascade = getCascadeConfig(kandownDir);
  const agentsFile = join(kandownDir, 'agents.json');

  log('');
  log(`${c.bold}Agent catalog${c.reset} ${c.dim}(${installed.length}/${catalog.length} installed)${c.reset}`);
  log(`${c.dim}catalog: ${existsSync(agentsFile) ? agentsFile : 'built-in defaults (run `kandown agents init` to commit one)'}${c.reset}`);
  log('');

  for (const a of catalog) {
    const ok = isAgentInstalled(a.bin);
    const mark = ok ? `${c.green}✓${c.reset}` : `${c.dim}·${c.reset}`;
    const interactive = a.interactive ? '' : `${c.dim} (one-shot)${c.reset}`;
    const preferred = cascade.preferred === a.id ? ` ${c.cyan}[preferred]${c.reset}` : '';
    log(`  ${mark} ${c.bold}${a.id.padEnd(10)}${c.reset} ${a.name}${preferred}${interactive}`);
    log(`     ${c.dim}${a.bin}${a.aliases && a.aliases.length ? ` · aliases: ${a.aliases.join(', ')}` : ''}${c.reset}`);
    if (a.extraArgs && a.extraArgs.length) {
      log(`     ${c.dim}extraArgs: ${a.extraArgs.join(' ')}${c.reset}`);
    }
  }

  log('');
  log(`${c.dim}cascade: unassignedBehavior=${cascade.unassignedBehavior} · sameSessionChain=${cascade.sameSessionChain}${c.reset}`);
  log(`${c.dim}assign a task with: kandown assign <id> <agent>   ·   run a chain with: kandown run${c.reset}`);
  log('');
}
