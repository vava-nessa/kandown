/**
 * @file Plugin scaffolding templates
 * @description Generates a ready-to-run plugin directory for `kandown plugin
 * create`. Unlike the older generic stub, each `--kind` emits a plugin that is
 * already valid, already declares exactly the permissions it uses, and already
 * passes `kandown plugin check`. That matters because the first thing an AI
 * agent does with a scaffold is run the checker: a stub that fails out of the
 * box teaches the agent to distrust the signal.
 *
 * 📖 Every scaffold also writes `AGENT.md` and points `manifest.agent.guide` at
 * it, so `kandown plugin guide <id>` keeps working once the plugin is installed
 * somewhere else. The kind-specific guidance is intentionally short: the full
 * contract is the generated brief in `agent-brief.ts`.
 *
 * @functions
 *  → scaffoldPlugin — write a plugin directory for one kind
 *  → PLUGIN_KINDS — the supported `--kind` values
 * @exports PLUGIN_KINDS, PluginKind, ScaffoldResult, scaffoldPlugin
 * @see src/cli/lib/plugin-cli.ts
 * @see src/lib/extensions/agent-brief.ts
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Supported scaffold shapes. `full` wires one of everything. */
export const PLUGIN_KINDS = ['field', 'panel', 'gate', 'sync', 'command', 'full'] as const;
export type PluginKind = (typeof PLUGIN_KINDS)[number];

export interface ScaffoldResult {
  dir: string;
  files: string[];
  kind: PluginKind;
}

/** True when `id` is a legal extension id (mirrors `parseManifest`). */
export function isValidPluginId(id: string): boolean {
  return /^[a-z][a-z0-9-]{0,63}$/.test(id);
}

/** `my-plugin` → `myPlugin`, for identifiers inside generated code. */
function camel(id: string): string {
  return id.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

/** `my-plugin` → `My plugin`, for human-facing labels. */
function title(id: string): string {
  const spaced = id.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface Parts {
  /** Registration statements placed inside the factory body. */
  body: string[];
  /** Permission strings the generated code actually needs. */
  permissions: string[];
  /** Display-only manifest hints. */
  contributes: {
    fields?: string[];
    webPanels?: string[];
    commands?: string[];
    gates?: string[];
    syncs?: string[];
  };
  /** Whether a `web.tsx` panel module is needed. */
  web: boolean;
  /** One-line description of what the scaffold does. */
  summary: string;
}

function fieldPart(id: string): Parts {
  return {
    body: [
      `  // 📖 A number field stored at plugins.${id}.points. The badge renders on`,
      `  // the card; returning null hides it for tasks that never set a value.`,
      `  kd.contributeField({`,
      `    key: 'points',`,
      `    label: 'Story points',`,
      `    type: 'number',`,
      `    badge: (value) => (typeof value === 'number' && value > 0 ? \`🔺 \${value}\` : null),`,
      `  });`,
    ],
    permissions: [`write:field:plugins.${id}.*`],
    contributes: { fields: ['points'] },
    web: false,
    summary: `Adds a "Story points" field on every task, stored under plugins.${id}.points.`,
  };
}

function panelPart(id: string): Parts {
  return {
    body: [
      `  // 📖 The panel is declared here and implemented in web.tsx. \`entry\` must`,
      `  // point at the bundled web.js that \`kandown plugin build\` produces.`,
      `  kd.contributeWebPanel({`,
      `    id: 'overview',`,
      `    title: '${title(id)}',`,
      `    entry: './web.js',`,
      `  });`,
    ],
    // 📖 A panel needs no permission: the browser hands it a task snapshot and
    // a scoped api, and every privileged call still goes through the host.
    permissions: [],
    contributes: { webPanels: ['overview'] },
    web: true,
    summary: `Adds an "${title(id)}" panel to the task editor.`,
  };
}

function gatePart(id: string): Parts {
  return {
    body: [
      `  // 📖 Gates compose: the move happens only when every gate abstains or`,
      `  // permits. Return nothing to abstain, never throw (a throw fails open).`,
      `  kd.contributeGate({`,
      `    id: '${id}-requires-report',`,
      `    on: 'task:beforeMove',`,
      `    to: 'Done',`,
      `    handler: (event) => {`,
      `      const body = String(event.task.frontmatter.title ?? '');`,
      `      if (!body.trim()) return { block: true, reason: 'A task needs a title before Done.' };`,
      `      return undefined;`,
      `    },`,
      `  });`,
    ],
    permissions: [],
    contributes: { gates: [`${id}-requires-report`] },
    web: false,
    summary: 'Blocks a move to Done when the task has no title.',
  };
}

function syncPart(id: string): Parts {
  return {
    body: [
      `  // 📖 Syncs are fire and forget: they run after the file is written and`,
      `  // their failures never block the board. \`ctx.fetch\` exists only because`,
      `  // this manifest declares a net: permission.`,
      `  kd.contributeSync({`,
      `    id: '${id}-notify',`,
      `    on: 'task:afterMove',`,
      `    to: 'Done',`,
      `    handler: async (event, ctx) => {`,
      `      const url = process.env.${camel(id).toUpperCase()}_WEBHOOK;`,
      `      if (!url || !ctx.fetch) return;`,
      `      await ctx.fetch(url, {`,
      `        method: 'POST',`,
      `        headers: { 'Content-Type': 'application/json' },`,
      `        body: JSON.stringify({ id: event.task.id, to: event.to }),`,
      `      });`,
      `    },`,
      `  });`,
    ],
    permissions: ['net:*'],
    contributes: { syncs: [`${id}-notify`] },
    web: false,
    summary: 'Posts a webhook every time a task lands in Done.',
  };
}

function commandPart(id: string): Parts {
  return {
    body: [
      `  // 📖 Surfaces as \`kandown ${id}\`. Contributed commands are additive and`,
      `  // can never shadow a core command.`,
      `  kd.contributeCommand('${id}', {`,
      `    description: 'Summarise the board.',`,
      `    handler: async (_args, ctx) => {`,
      `      const tasks = await ctx.board.readAll();`,
      `      ctx.log.info(\`${id}: \${tasks.length} task(s) on the board\`);`,
      `    },`,
      `  });`,
    ],
    permissions: ['read:tasks'],
    contributes: { commands: [id] },
    web: false,
    summary: `Adds the \`kandown ${id}\` command.`,
  };
}

function partsFor(kind: PluginKind, id: string): Parts {
  switch (kind) {
    case 'field': return fieldPart(id);
    case 'panel': return panelPart(id);
    case 'gate': return gatePart(id);
    case 'sync': return syncPart(id);
    case 'command': return commandPart(id);
    case 'full': return mergeParts(id, [fieldPart(id), panelPart(id), gatePart(id), commandPart(id)]);
  }
}

/** Concatenates several parts into one plugin, deduping permissions. */
function mergeParts(id: string, parts: Parts[]): Parts {
  const body: string[] = [];
  const permissions = new Set<string>();
  const contributes: Parts['contributes'] = {};
  for (const part of parts) {
    if (body.length > 0) body.push('');
    body.push(...part.body);
    for (const permission of part.permissions) permissions.add(permission);
    for (const [key, values] of Object.entries(part.contributes)) {
      const bucket = key as keyof Parts['contributes'];
      contributes[bucket] = [...(contributes[bucket] ?? []), ...(values ?? [])];
    }
  }
  return {
    body,
    permissions: [...permissions],
    contributes,
    web: parts.some((part) => part.web),
    summary: `Field, panel, gate and command for ${id}.`,
  };
}

function indexSource(id: string, parts: Parts): string {
  return `/**
 * @file ${id} plugin entry
 * @description ${parts.summary}
 *
 * 📖 Loaded by kandown through jiti, so this TypeScript runs with no build step
 * during development. Run \`kandown plugin build ${id}\` before sharing it: the
 * browser can only execute the bundled index.js.
 */

import type { KandownExtensionAPI } from 'kandown';

export default function (kd: KandownExtensionAPI) {
${parts.body.join('\n')}
}
`;
}

function webSource(id: string): string {
  return `/**
 * @file ${id} panel module
 * @description The browser half of the plugin. Bundled to web.js by
 * \`kandown plugin build ${id}\` and imported through a Blob URL, so it must stay
 * self-contained.
 *
 * 📖 Never import React here. The host passes its own React runtime as \`ui\`;
 * a second copy in the bundle breaks hooks and blanks the panel.
 */

/** Props kandown passes to every panel. */
interface PanelProps {
  task: { id: string; frontmatter: Record<string, unknown> };
  api: {
    readField(key: string): unknown;
    readAllTasks(): Promise<Array<{ id: string; frontmatter: Record<string, unknown> }>>;
    setField(key: string, value: unknown): Promise<void>;
    refresh(): Promise<void>;
  };
  ui: {
    createElement: (...args: unknown[]) => unknown;
    useState: <T>(initial: T) => [T, (next: T) => void];
    useEffect: (effect: () => void, deps: unknown[]) => void;
  };
}

function Overview({ task, api, ui }: PanelProps) {
  const [total, setTotal] = ui.useState(0);

  ui.useEffect(() => {
    void api.readAllTasks().then((tasks) => setTotal(tasks.length));
  }, [api]);

  return ui.createElement(
    'div',
    { style: { display: 'grid', gap: '4px', fontSize: '13px' } },
    ui.createElement('div', { key: 'id' }, 'Task: ' + task.id),
    ui.createElement('div', { key: 'total' }, 'Board size: ' + total),
  );
}

export const panels = { overview: Overview };
`;
}

function agentSource(id: string, kind: PluginKind, parts: Parts): string {
  return `# ${id} plugin

${parts.summary}

## Layout

- \`index.ts\`, the Node entry. Registers every contribution.
${parts.web ? '- `web.tsx`, the panel component. Bundled to `web.js`.\n' : ''}- \`manifest.json\`, identity and permissions.

## Working on it

\`\`\`bash
kandown plugin check ${id} --json   # structured verdict, fix every failing check
kandown plugin dev ${id}            # watch, rebuild, hot reload the web UI
\`\`\`

Scaffolded as \`--kind ${kind}\`. Data lives only under \`plugins.${id}.*\`.
Run \`kandown plugin brief\` for the full authoring contract.
`;
}

/**
 * 📖 Writes the plugin directory. Refuses to touch an existing directory so a
 * mistyped id can never overwrite work in progress.
 */
export function scaffoldPlugin(projectDir: string, id: string, kind: PluginKind): ScaffoldResult {
  if (!isValidPluginId(id)) {
    throw new Error('plugin id must be kebab-case (lowercase letters, digits, hyphens)');
  }
  const dir = join(projectDir, '.kandown', 'extensions', id);
  if (existsSync(dir)) throw new Error(`already exists: ${dir}`);
  const parts = partsFor(kind, id);
  mkdirSync(dir, { recursive: true });

  const manifest = {
    id,
    name: title(id),
    version: '0.1.0',
    apiVersion: 1,
    description: parts.summary,
    permissions: parts.permissions,
    contributes: parts.contributes,
    agent: {
      summary: parts.summary,
      guide: 'AGENT.md',
    },
  };

  const files: string[] = [];
  const write = (name: string, content: string) => {
    writeFileSync(join(dir, name), content, 'utf8');
    files.push(name);
  };

  write('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  write('index.ts', indexSource(id, parts));
  if (parts.web) write('web.tsx', webSource(id));
  write('AGENT.md', agentSource(id, kind, parts));
  write('README.md', `# ${title(id)}\n\n${parts.summary}\n\nEnable it with \`kandown plugin enable ${id}\`.\n`);

  return { dir, files, kind };
}
