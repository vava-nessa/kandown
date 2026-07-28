# Authoring kandown extensions

> A 10-minute guide to writing, testing and shipping a kandown extension. If you
> want the why behind the design, read [`EXTENSIONS.md`](EXTENSIONS.md) first;
> this document is the how.

A kandown extension is a directory with a `manifest.json` and a Node entry
(`index.ts` or `index.js`) that registers **contributions** on the `kd` API.
kandown loads it with jiti, so you write TypeScript with no build step. Three
working examples live in [`examples/extensions/`](../examples/extensions):
`burndown` (field + gate + command), `labels` (select field + badge + gate) and
`webhook-sync` (sync + net permission).

---

## Quick start

```bash
kandown extension create my-ext       # scaffolds .kandown/extensions/my-ext/
kandown extension enable my-ext       # trust + enable it
kandown extension list                # see it enabled
```

Edit `index.ts`, save, re-run any command: jiti reloads on each invocation, so
there is no reload step during development. Your extension is ready.

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

### field — a custom task field

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

### command — a CLI command

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

### gate — a transition policy

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

### sync — react to an event (notify, push)

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

### webPanel — a panel in the web drawer

Declares a bundled React component. (Panel mounting lands with the web UI, task
t274; the contribution point is part of the API today.)

```typescript
kd.contributeWebPanel({
  id: 'chart',
  title: 'Burndown',
  entry: './web.js',                    // bundled ES module exporting a React component
});
```

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
kandown extension list          # health + contributions; errors show here
kandown extension enable my-ext
kandown my-ext                  # run your contributed command
```

Common pitfalls:

- **`id` not kebab-case** → manifest rejected. Use lowercase, digits, hyphens.
- **Forgot `permissions`** → `ctx.fetch`/`setField` silently unavailable. Declare them.
- **Disabled on first install** → restricted mode is on by default; `enable` it.
- **Throwing in a handler** → fail-open for gates, logged for syncs; 3 strikes quarantines the extension.

---

## Publishing

The store is community-curated, the Obsidian model.

1. Put your extension in a public Git repo (e.g. `you/kandown-my-ext`).
2. Tag a release with the bundle assets: `manifest.json`, `index.js` (bundled),
   optional `web.js` and `styles.css`.
3. Open a PR against `kandown/community-extensions` adding an entry to
   `extensions.json`:

   ```json
   { "id": "my-ext", "name": "My Extension", "author": "you",
     "repo": "you/kandown-my-ext", "description": "...",
     "minKandownVersion": "0.42.0" }
   ```

Users then install with one click from the web gallery, or:

```bash
kandown extension install https://github.com/you/kandown-my-ext
```

(One-click and paste-URL install are wired with the web UI, task t274.)

---

## Reference examples

| Extension | Shows |
|---|---|
| [`examples/extensions/burndown`](../examples/extensions/burndown) | number field, badge, gate, command |
| [`examples/extensions/labels`](../examples/extensions/labels) | select field, custom badge, gate composition |
| [`examples/extensions/webhook-sync`](../examples/extensions/webhook-sync) | sync, `net:*` permission, fetch |

Copy whichever is closest to what you want to build.
