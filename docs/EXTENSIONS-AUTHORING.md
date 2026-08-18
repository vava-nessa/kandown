# Authoring kandown extensions

> A 10-minute guide to writing, testing and shipping a kandown extension. If you
> want the why behind the design, read [`EXTENSIONS.md`](EXTENSIONS.md) first;
> this document is the how.

A kandown extension is a directory with a `manifest.json` and a Node entry
(`index.ts` or `index.js`) that registers **contributions** on the `kd` API.
kandown loads it with jiti, so you write TypeScript with no build step. Three
working examples live in [`examples/extensions/`](../examples/extensions):
`burndown` (field + badge + panel + gate + command), `labels` (select field +
badge + gate) and `webhook-sync` (sync + net permission).

---

## Quick start

```bash
kandown plugin create my-ext --kind full   # scaffold + print the authoring brief
kandown plugin dev my-ext                  # watch: build, check, hot reload
```

That is the whole loop. `plugin dev` trusts and enables the plugin, bundles the
browser entries, validates them and pushes a reload to every open board on each
save. Leave it running while you edit.

If you prefer the steps one at a time:

```bash
kandown plugin create my-ext --kind field  # field | panel | gate | sync | command | full
kandown plugin build my-ext                # index.ts -> index.js, web.tsx -> web.js
kandown plugin check my-ext --json         # structured verdict, exit 1 on failure
kandown plugin enable my-ext               # trust + enable
kandown plugin list                        # see it enabled
```

`kandown extension <sub>` still works and remains the administrative view;
`kandown plugin <sub>` is the authoring surface and aliases the shared
subcommands (`list`, `enable`, `disable`, `install`, `guide`, `purge`).

### Why `build` is not optional

Node loads `index.ts` directly through jiti, so the CLI sees your TypeScript
immediately. The **browser cannot**: it imports `index.js` and every panel entry
through a Blob URL, which can neither run TypeScript nor resolve a sibling file.
A plugin that works in the CLI and does nothing in the board is almost always an
unbuilt bundle, which is why `plugin check` reports a missing or stale one as a
first-class failure.

Full standalone rendering applies to project-local extensions under
`.kandown/extensions/`; browser sandboxing cannot access global extensions under
`~/.kandown`. Before executing a project-local browser bundle, Kandown asks for
local approval and fingerprints its manifest and source. Any source change
requires approval again; repository state files cannot bypass it.

### Letting an agent write it

```bash
kandown plugin create sprint-velocity --kind panel \
  --from "show a burndown chart of remaining story points for the current sprint"
```

This scaffolds the plugin, then launches the coding agent already installed on
your machine (`--agent claude|codex|pi|...` to pick one) with the complete
authoring contract, the file list and the loop to run until `plugin check`
passes. Without an agent installed it prints the working order for you to paste.

`kandown plugin brief` prints that same contract on its own. It is generated from
`src/lib/extensions/types.ts`, so it cannot go stale.

---

## The manifest

`manifest.json` is metadata plus display hints. The `id` is kebab-case and
becomes both the `plugins.<id>` namespace and the install directory name.

```json
{
  "id": "my-ext",
  "name": "My Extension",
  "version": "1.0.0",
  "apiVersion": 1,
  "minKandownVersion": "0.42.0",
  "author": "you",
  "description": "What it does, in one line.",
  "homepage": "https://github.com/you/kandown-my-ext",
  "permissions": ["read:tasks", "write:field:plugins.my-ext.*"],
  "contributes": { "fields": ["note"], "commands": ["my-ext"] }
}
```

| Field | Required | Purpose |
|---|---|---|
| `id` | yes | kebab-case; the `plugins.<id>` namespace + install dir |
| `name`, `version` | yes | display + your own semver |
| `apiVersion` | yes | the API version (currently `1`) |
| `minKandownVersion` | no | refuses to load on older kandown |
| `author`, `description`, `homepage` | no | store gallery + settings display |
| `permissions` | no | capabilities the host enforces at runtime |
| `main` | no | Node entry; defaults to `./index.js` then `./index.ts` |
| `contributes` | no | display-only list for the gallery and settings |

📖 `contributes` is a hint, not enforced. The runtime registrations in `index.ts`
are authoritative. `kandown extension list` shows what actually loaded.

---

## The entry file

`index.ts` default-exports a factory receiving the `kd` API. `import type` is
erased at runtime by jiti, so the `kandown` package does not need to be
resolvable from your directory.

```typescript
import type { KandownExtensionAPI } from 'kandown';

export default function (kd: KandownExtensionAPI) {
  // register contributions here
}
```

---

## Contribution points

### field: a custom task field

Stored under `plugins.<id>.<key>`. The web drawer renders an editor; an optional
`badge` shows on the card.

```typescript
kd.contributeField({
  key: 'points',
  label: 'Story points',
  type: 'number',                       // 'string' | 'number' | 'boolean' | 'date' | 'select'
  options: undefined,                   // for 'select': [{ value, label }]
  badge: (value) => (value ? `🔺 ${value}` : null),
});
```

📖 Scalars are stored as strings on disk and coerced to `type` on read, so a
`number` field reads back as a number in your handlers.

### command: a CLI command

Surfaces as `kandown <name>`. Additive; it never overrides core commands.

```typescript
kd.contributeCommand('burndown', {
  description: 'Print the burndown.',
  handler: async (_args, ctx) => {
    const tasks = await ctx.board.readAll();
    ctx.log.info(`${tasks.length} task(s)`);
  },
});
```

### gate: a transition policy

Composes with the core dependency gate and other extensions' gates. A move is
allowed only if **every** gate abstains or permits. Return `{ block, reason }`
to veto; the reason is shown to the user.

```typescript
kd.contributeGate({
  on: 'task:beforeMove',
  to: 'Done',                           // optional: restrict to a target status
  handler: async (event) => {
    const points = (event.task.plugins as { my?: { points?: unknown } } | undefined)?.my?.points;
    if (!points) return { block: true, reason: 'Needs points before Done.' };
  },
});
```

📖 A throwing gate is treated as "no objection" (fail-open) and counted toward
quarantine, so one bad gate cannot lock the board.

### sync: react to an event (notify, push)

Fire-and-forget; ideal for webhooks and external pushes. Declare `net:*` to get
`ctx.fetch`.

```typescript
kd.contributeSync({
  on: 'task:afterMove',
  to: 'Done',
  handler: async (event, ctx) => {
    await ctx.fetch?.(process.env.MY_WEBHOOK!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: event.task.id }),
    });
  },
});
```

### webPanel: a panel in the web drawer

Declare the panel in the Node entry:

```typescript
kd.contributeWebPanel({
  id: 'chart',
  title: 'Burndown',
  entry: './web.js',
});
```

The self-contained `web.js` module exports a `panels` map (or one default panel).
Kandown renders each panel inside its own ErrorBoundary and supplies the host
React runtime as `ui`, so the bundle must not include a second React copy:

```javascript
function Chart({ task, api, ui }) {
  const [tasks, setTasks] = ui.useState([]);
  ui.useEffect(() => {
    void api.readAllTasks().then(setTasks);
  }, [api]);
  return ui.createElement('div', null, `${tasks.length} tasks`);
}

export const panels = { chart: Chart };
```

Panel props are deliberately scoped:

- `task`: a frozen read-only task snapshot;
- `api.readField(key)`: read this extension's task namespace;
- `api.readAllTasks()`: read frozen board snapshots;
- `api.setField(key, value)`: write only a registered field owned by this extension;
- `api.refresh()`: request a runtime refresh;
- `ui`: Kandown's React runtime (`createElement`, hooks, Fragment, etc.).

Panel modules load through authenticated fetch followed by Blob import. Bundle
all relative imports into `web.js`; Blob modules cannot resolve sibling source
files. Three consecutive panel failures persist quarantine. Failures one and two
show a retryable inline placeholder without taking down the task editor.

---

## The data model

Your data lives under `plugins.<id>.*` in the task's frontmatter, opaque to the
core and round-tripped byte-stably:

```yaml
---
title: Ship the thing
status: Done
plugins:
  my-ext:
    points: 5
    note: quick
---
```

Read it from `event.task.plugins` in handlers, or write it with
`ctx.setField(taskId, key, value)` (the host persists it through the serializer,
so the round-trip invariant holds). Never touch core fields (`title`, `status`,
`depends_on`, ...) and never call the serializer directly.

---

## Permissions

Declare what your extension may do. The host rejects calls outside the list.

| Permission | Grants |
|---|---|
| `read:tasks` | `ctx.board.readAll` / `read` |
| `write:field:plugins.<id>.*` | `ctx.setField` for your namespace |
| `net:*` (or `net:<url>`) | `ctx.fetch` |
| `*` | everything (use sparingly) |

---

## Lifecycle events

Subscribe with `kd.on(event, handler)`. They fire around file mutations.

```typescript
kd.on('task:afterCreate', async (event, ctx) => { /* ... */ });
kd.on('board:load', async (_event, ctx) => { /* ... */ });
```

| Event | When |
|---|---|
| `board:load` | board parsed and ready |
| `task:afterCreate` / `task:afterMove` / `task:afterArchive` | after a mutation |

`before*` variants are gates (see above).

---

## Testing your extension

```bash
kandown plugin check my-ext          # readable report, with a fix line per failure
kandown plugin check my-ext --json   # { ok, checks: [{ id, status, message, fix }] }
kandown plugin list                  # health + contributions
kandown my-ext                       # run your contributed command for real
```

`check` runs eight things against a **synthetic in-memory board**: the manifest,
the entry, what it actually registered, permissions declared versus called, the
freshness of every bundle, one render of every panel, a dispatch of every gate,
sync and command, and a frontmatter round-trip of everything it wrote. Your real
tasks are never touched, but your plugin's code does execute.

Common pitfalls:

- **`id` not kebab-case** → manifest rejected. Use lowercase, digits, hyphens.
- **Forgot `permissions`** → `ctx.fetch`/`setField` silently unavailable. Declare them.
- **Disabled on first install** → restricted mode is on by default; `enable` it.
- **Throwing in a handler** → fail-open for gates, logged for syncs; 3 strikes quarantines the extension.

---

## Publishing

The store is community-curated, the Obsidian model. Start with:

```bash
kandown plugin publish my-ext
```

It rebuilds, re-runs every check, refuses to continue while one fails, and then
prints the registry entry to copy plus the exact steps below.

1. Put your extension in a public Git repo (e.g. `you/kandown-my-ext`).
2. Tag a release with the bundle assets: `manifest.json`, `index.js` (bundled),
   optional `web.js` and `styles.css`.
3. Open a PR against `registry/extensions.json` (lives in the kandown repo
   today, ships to `kandown.dev/extensions` at the next build) adding an entry.
   Include a short list of `tags` so the gallery can filter by category:

   ```json
   { "id": "my-ext", "name": "My Extension", "author": "you",
     "repo": "you/kandown-my-ext", "description": "...",
     "minKandownVersion": "0.42.0",
     "tags": ["productivity", "fields"] }
   ```

   The `path` field is optional. When it points to a subdirectory of the repo,
   the daemon fetches the extension files from that subdirectory rather than
   the root; use it to ship several extensions from one repo.

Users browse, filter and install from the website gallery at
**`kandown.dev/extensions`**, or with one click from the web app
(`Settings → Extensions`), or from the CLI:

```bash
kandown extension install https://github.com/you/kandown-my-ext
```

(One-click and paste-URL install land with the web UI, task t274.)

---

## Reference examples

| Extension | Shows |
|---|---|
| [`examples/extensions/burndown`](../examples/extensions/burndown) | number field, badge, web panel, gate, command |
| [`examples/extensions/labels`](../examples/extensions/labels) | select field, custom badge, gate composition |
| [`examples/extensions/webhook-sync`](../examples/extensions/webhook-sync) | sync, `net:*` permission, fetch |

Copy whichever is closest to what you want to build.
