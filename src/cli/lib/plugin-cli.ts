/**
 * @file `kandown plugin` command surface
 * @description The agent-first façade over the extension system. `kandown
 * extension` remains the administrative view (list, enable, install); `kandown
 * plugin` is the authoring loop: scaffold, bundle, validate, watch, publish.
 *
 * 📖 The design bet, borrowed from Pi ("ask the agent to build one") and from
 * the DeepSeek harness (documentation generated from the extension points), is
 * that an AI agent can write a plugin unattended if and only if two things are
 * true: the contract it reads cannot drift from the runtime, and every failure
 * comes back as a structured, actionable verdict. `plugin create` prints the
 * generated brief; `plugin check --json` returns that verdict. Nothing here
 * calls a model: kandown supplies the loop, the agent supplies the code.
 *
 * @functions
 *  → cmdPlugin — the `kandown plugin <subcommand>` entrypoint
 *  → resolvePluginDir — locate an installed plugin directory by id
 * @exports cmdPlugin
 * @see src/cli/lib/plugin-scaffold.ts
 * @see src/cli/lib/plugin-check.ts
 * @see docs/EXTENSIONS-AGENT.md
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { EXTENSION_AGENT_BRIEF } from '../../lib/extensions/agent-brief';
import { discoverExtensions } from '../../lib/extensions/loader';
import { buildAgentCommand, detectInstalledAgents, getAgentById, type AgentDef } from './agents';
import { buildPlugin } from './plugin-build';
import { checkPlugin, formatCheckReport } from './plugin-check';
import { runPluginDev } from './plugin-dev';
import { PLUGIN_KINDS, isValidPluginId, scaffoldPlugin, type PluginKind } from './plugin-scaffold';
import { cmdExtension } from './extensions-cli';
import { getProjectRoot } from './board-reader';
import { c, log, info, success, err, ensureKandownDir, taskParseArgs, stringFlag } from './cli-shared';

const USAGE = `${c.cyan}kandown plugin${c.reset} ${c.dim}<create|build|check|dev|brief|publish|list|enable|disable|install|guide|purge>${c.reset}

  ${c.bold}create${c.reset} <id> [--kind ${PLUGIN_KINDS.join('|')}] [--from "<what it should do>"] [--agent <id>]
  ${c.bold}build${c.reset}  <id>            bundle index.ts and web.tsx for the browser
  ${c.bold}check${c.reset}  <id> [--json]   validate against a synthetic board
  ${c.bold}dev${c.reset}    <id>            watch, rebuild, revalidate, hot reload
  ${c.bold}brief${c.reset}                  print the full authoring contract
  ${c.bold}publish${c.reset} <id>           verify, then print the store entry`;

/** Finds an installed plugin directory by id, project first then global. */
function resolvePluginDir(projectDir: string, id: string): string | null {
  const found = discoverExtensions(projectDir).find((entry) => (
    entry.manifestResult.ok ? entry.manifestResult.manifest.id === id : basename(entry.dir) === id
  ));
  return found?.dir ?? null;
}

/**
 * 📖 The prompt handed to a coding agent by `--from`. It is deliberately a
 * complete working order rather than a hint: the brief, the exact files, the
 * loop to run, and the definition of done. An agent that stops before
 * `plugin check` passes has not finished the job.
 */
function buildAgentPrompt(id: string, dir: string, kind: PluginKind, description: string): string {
  return `${EXTENSION_AGENT_BRIEF}

---

# Your assignment

A plugin scaffold already exists. Turn it into this:

> ${description}

Files to edit, all under \`${dir}\`:

- \`index.ts\`, the Node entry (scaffolded as \`--kind ${kind}\`)
- \`manifest.json\`, keep \`permissions\` exactly matching what the code calls
- \`web.tsx\` if the plugin renders a panel
- \`README.md\` and \`AGENT.md\`, keep them truthful

Then run this loop until it is green, from the project root:

\`\`\`bash
kandown plugin build ${id}
kandown plugin check ${id} --json
\`\`\`

\`check\` returns \`{ ok, checks: [{ id, status, message, fix }] }\`. For every
check whose status is \`fail\`, apply its \`fix\` and run the loop again. You are
done when \`ok\` is true. Do not edit anything outside \`${dir}\`, and never write
task frontmatter outside \`plugins.${id}.*\`.`;
}

/** Prints the create result, then hands off to an agent when `--from` is set. */
async function delegateToAgent(
  kandownDir: string,
  id: string,
  dir: string,
  kind: PluginKind,
  description: string,
  requestedAgent: string | null,
): Promise<void> {
  const prompt = buildAgentPrompt(id, dir, kind, description);
  const agent: AgentDef | undefined = requestedAgent
    ? getAgentById(requestedAgent, kandownDir)
    : detectInstalledAgents(kandownDir)[0];

  if (!agent) {
    err(requestedAgent ? `Unknown or missing agent: ${requestedAgent}` : 'No coding agent CLI detected on this machine.');
    info('Paste the working order below into your agent instead:');
    log('');
    log(prompt);
    return;
  }

  const [binary, ...args] = buildAgentCommand(agent, {
    systemPrompt: prompt,
    taskPrompt: `Build the "${id}" kandown plugin described above, then make "kandown plugin check ${id}" pass.`,
    kandownDir,
    taskId: id,
  });
  success(`Handing "${id}" to ${agent.name}`);
  await new Promise<void>((resolve) => {
    const child = spawn(binary, args, { stdio: 'inherit', env: process.env });
    child.on('error', (error) => {
      err(`Could not launch ${agent.name}: ${error.message}`);
      resolve();
    });
    child.on('close', () => resolve());
  });
}

/** `kandown plugin <subcommand>` entrypoint. */
export async function cmdPlugin(rawArgs: string[]): Promise<void> {
  const args = taskParseArgs(rawArgs);
  const sub = args.positional[0];
  const json = args.flags.json === true;

  if (!sub) {
    log(USAGE);
    return;
  }

  // 📖 Administrative subcommands are the extension system's, not the authoring
  // loop's. Aliasing rather than reimplementing keeps one code path for trust,
  // health and the community store.
  if (['list', 'ls', 'enable', 'disable', 'install', 'purge', 'guide'].includes(sub)) {
    await cmdExtension(rawArgs);
    return;
  }

  if (sub === 'brief') {
    log(EXTENSION_AGENT_BRIEF);
    return;
  }

  const { kandownDir } = ensureKandownDir(rawArgs);
  const projectDir = getProjectRoot(kandownDir);

  switch (sub) {
    case 'create': {
      const id = args.positional[1];
      if (!id) { err('Usage: kandown plugin create <kebab-id> [--kind field|panel|gate|sync|command|full]'); process.exitCode = 1; return; }
      if (!isValidPluginId(id)) { err('The id must be kebab-case (lowercase letters, digits, hyphens).'); process.exitCode = 1; return; }

      const requestedKind = stringFlag(args.flags, 'kind') ?? 'full';
      if (!PLUGIN_KINDS.includes(requestedKind as PluginKind)) {
        err(`Unknown --kind "${requestedKind}". Use one of: ${PLUGIN_KINDS.join(', ')}`);
        process.exitCode = 1;
        return;
      }
      const kind = requestedKind as PluginKind;

      let created;
      try {
        created = scaffoldPlugin(projectDir, id, kind);
      } catch (error) {
        err(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
      }

      if (json) {
        log(JSON.stringify({ ok: true, id, dir: created.dir, kind, files: created.files, brief: EXTENSION_AGENT_BRIEF }, null, 2));
      } else {
        // 📖 The brief goes to stdout before anything else: when an agent runs
        // this command, stdout is the only channel that lands in its context.
        log(EXTENSION_AGENT_BRIEF);
        log('');
        log(`${c.bold}Scaffolded ${id}${c.reset} (--kind ${kind}) at ${created.dir}`);
        for (const file of created.files) log(`  ${c.dim}+${c.reset} ${file}`);
        log('');
        log(`${c.bold}Next${c.reset}`);
        log(`  1. edit ${join(created.dir, 'index.ts')}`);
        log(`  2. ${c.cyan}kandown plugin build ${id}${c.reset}`);
        log(`  3. ${c.cyan}kandown plugin check ${id} --json${c.reset}   ${c.dim}fix every "fail", repeat${c.reset}`);
        log(`  4. ${c.cyan}kandown plugin dev ${id}${c.reset}            ${c.dim}watch and hot reload the board${c.reset}`);
      }

      const description = stringFlag(args.flags, 'from');
      if (description) {
        log('');
        await delegateToAgent(kandownDir, id, created.dir, kind, description, stringFlag(args.flags, 'agent'));
      }
      return;
    }

    case 'build': {
      const id = args.positional[1];
      if (!id) { err('Usage: kandown plugin build <id>'); process.exitCode = 1; return; }
      const dir = resolvePluginDir(projectDir, id);
      if (!dir) { err(`No plugin "${id}" found. Create it with: kandown plugin create ${id}`); process.exitCode = 1; return; }

      const result = await buildPlugin(dir);
      if (json) {
        log(JSON.stringify(result, null, 2));
      } else {
        for (const warning of result.warnings) info(warning);
        for (const output of result.outputs) {
          success(`${basename(output.out)} ${c.dim}${(output.bytes / 1024).toFixed(1)}kb${c.reset}`);
        }
        for (const error of result.errors) err(error);
      }
      if (!result.ok) process.exitCode = 1;
      return;
    }

    case 'check': {
      const id = args.positional[1];
      if (!id) { err('Usage: kandown plugin check <id> [--json]'); process.exitCode = 1; return; }
      const report = await checkPlugin(kandownDir, projectDir, id);
      log(json ? JSON.stringify(report, null, 2) : formatCheckReport(report));
      if (!report.ok) process.exitCode = 1;
      return;
    }

    case 'dev': {
      const id = args.positional[1];
      if (!id) { err('Usage: kandown plugin dev <id>'); process.exitCode = 1; return; }
      const dir = resolvePluginDir(projectDir, id);
      if (!dir) { err(`No plugin "${id}" found. Create it with: kandown plugin create ${id}`); process.exitCode = 1; return; }
      await runPluginDev(kandownDir, projectDir, id, dir);
      return;
    }

    case 'publish': {
      const id = args.positional[1];
      if (!id) { err('Usage: kandown plugin publish <id>'); process.exitCode = 1; return; }
      const dir = resolvePluginDir(projectDir, id);
      if (!dir) { err(`No plugin "${id}" found.`); process.exitCode = 1; return; }

      const build = await buildPlugin(dir);
      for (const error of build.errors) err(error);
      const report = await checkPlugin(kandownDir, projectDir, id);
      if (!build.ok || !report.ok) {
        log(formatCheckReport(report));
        err('Fix the failing checks before publishing.');
        process.exitCode = 1;
        return;
      }

      const manifestPath = join(dir, 'manifest.json');
      const manifest = existsSync(manifestPath)
        ? JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
        : {};
      const entry = {
        id: manifest.id ?? id,
        name: manifest.name ?? id,
        author: manifest.author ?? 'you',
        repo: 'you/kandown-' + id,
        description: manifest.description ?? '',
        minKandownVersion: manifest.minKandownVersion ?? undefined,
        tags: [],
      };

      if (json) {
        log(JSON.stringify({ ok: true, id, entry, assets: ['manifest.json', 'index.js'] }, null, 2));
        return;
      }
      success(`${id} passes every check and is ready to publish`);
      log('');
      log(`${c.bold}1.${c.reset} push ${dir} to a public repo, with the built assets committed:`);
      log(`   ${c.dim}manifest.json, index.js, web.js (when it has a panel), README.md${c.reset}`);
      log(`${c.bold}2.${c.reset} open a PR on registry/extensions.json in the kandown repo, adding:`);
      log('');
      log(JSON.stringify(entry, null, 2));
      log('');
      log(`${c.bold}3.${c.reset} users then install it with ${c.cyan}kandown plugin install <repo-url>${c.reset}`);
      return;
    }

    default:
      err(`Unknown plugin subcommand: ${sub}`);
      log(USAGE);
      process.exitCode = 1;
  }
}
