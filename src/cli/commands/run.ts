/**
 * @file `kandown run` command handler — cascade launcher
 * @description Parses flags, prints the cascade plan (always, so the user sees
 * what is about to happen), then drives the orchestrator in
 * `src/cli/lib/cascade.ts` and prints a per-task summary.
 *
 * 📖 Flags:
 *   `kandown run [taskId]`            run all ready tasks (or a task + its
 *                                     downstream dependents)
 *   `--dry-run`                       plan only, launch nothing
 *   `--agent <id>`                    force one agent for the whole run
 *   `--resume`                        re-include tasks already "In Progress"
 *   `--same-session`                  one agent session drives the whole queue
 *
 * @functions
 *  → cmdRun — the command handler invoked from cli.ts
 *
 * @exports cmdRun
 * @see src/cli/lib/cascade.ts — the engine
 */

import { resolveKandownDir, parseArgs, c, log, info, success, err } from '../lib/cli-shared.js';
import { buildCascadePlan, runCascade, type CascadeOptions } from '../lib/cascade.js';
import { loadCatalog, isAgentInstalled } from '../lib/agents.js';

export async function cmdRun(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  const kandownDir = resolveKandownDir(args.path, process.cwd());

  const opts: CascadeOptions = {
    startTaskId: args.positional[0],
    agentOverride: typeof args.flags['agent'] === 'string' ? args.flags['agent'] : undefined,
    includeInProgress: args.flags['resume'] === true,
    sameSession: args.flags['same-session'] === true,
    dryRun: args.flags['dry-run'] === true,
  };

  // 📖 Validate an explicit --agent against the catalog before we plan, so the
  // error message is helpful instead of every task silently skipping.
  if (opts.agentOverride) {
    const def = loadCatalog(kandownDir).find(a => a.id === opts.agentOverride);
    if (!def) {
      err(`Unknown agent: ${opts.agentOverride}`);
      log(`  Available: ${loadCatalog(kandownDir).map(a => a.id).join(', ')}`);
      process.exit(1);
    }
    if (!isAgentInstalled(def.bin)) {
      err(`Agent ${opts.agentOverride} (${def.bin}) is not installed in your $PATH.`);
      process.exit(1);
    }
  }

  const plan = buildCascadePlan(kandownDir, opts);

  // ── Plan header ────────────────────────────────────────────────────────
  const mode = opts.sameSession ? 'same-session' : 'multi-agent';
  log('');
  log(`${c.bold}Cascade plan${c.reset} ${c.dim}(${mode})${c.reset}`);
  if (opts.startTaskId) log(`${c.dim}scoped to ${opts.startTaskId} + downstream dependents${c.reset}`);
  log('');

  if (plan.order.length === 0) {
    info('No ready tasks with a resolvable agent. Nothing to run.');
    if (plan.blocked.length > 0) {
      log(`${c.dim}  Blocked (unresolved deps): ${plan.blocked.map(t => t.id).join(', ') || '—'}${c.reset}`);
    }
    if (plan.skippedNoAgent.length > 0) {
      log(`${c.dim}  Skipped (no agent): ${plan.skippedNoAgent.map(t => `${t.id}${t.assignee ? `(@${t.assignee})` : ''}`).join(', ')}${c.reset}`);
    }
    log('');
    return;
  }

  for (let i = 0; i < plan.order.length; i++) {
    const t = plan.order[i];
    const agent = opts.agentOverride ?? t.assignee ?? '(preferred)';
    log(`  ${c.cyan}${i + 1}.${c.reset} ${c.bold}${t.id}${c.reset} ${t.title}`);
    log(`     ${c.dim}agent: ${agent} · status: ${t.status}${t.priority ? ` · ${t.priority}` : ''}${t.dependsOn.length ? ` · after ${t.dependsOn.join(',')}` : ''}${c.reset}`);
  }
  if (plan.skippedNoAgent.length > 0) {
    log('');
    log(`${c.dim}Skipping (no agent assigned): ${plan.skippedNoAgent.map(t => t.id).join(', ')}${c.reset}`);
  }
  log('');

  if (opts.dryRun) {
    info('Dry run — nothing launched.');
    return;
  }

  // ── Execute ────────────────────────────────────────────────────────────
  const result = await runCascade(kandownDir, opts);

  log('');
  log(`${c.bold}Cascade result${c.reset} ${c.dim}(${result.mode})${c.reset}`);
  for (const step of result.steps) {
    const mark = step.outcome === 'done' ? `${c.green}✓${c.reset}`
      : step.outcome === 'not-done' ? `${c.yellow}~${c.reset}`
      : step.outcome === 'failed' ? `${c.red}✗${c.reset}`
      : `${c.dim}·${c.reset}`;
    const tail = step.agentId ? ` ${c.dim}via ${step.agentId}${c.reset}` : '';
    const note = step.note ? ` ${c.dim}— ${step.note}${c.reset}` : '';
    log(`  ${mark} ${step.taskId}${tail}${note}`);
  }
  log('');

  if (result.incomplete.length === 0 && result.completed.length > 0) {
    success(`All ${result.completed.length} task(s) reached Done.`);
  } else if (result.completed.length > 0) {
    info(`${result.completed.length} done, ${result.incomplete.length} not done. Chain stopped at the first non-done task.`);
  } else {
    err('No tasks completed.');
  }
}
