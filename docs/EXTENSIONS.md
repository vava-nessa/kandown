# Extensions

> A task is a Markdown file. An extension is a small module that adds a way to
> see it, move it, or react to it, without ever becoming a second source of
> truth.

This is the reference for kandown's extension system. Read it before adding a
contribution point, writing an extension, or touching anything under the
`plugins.*` frontmatter namespace. The architectural decision behind it lives in
[`adr/0002-extensions-system.md`](adr/0002-extensions-system.md); the project
invariants it must not break are in [`ARCHITECTURE.md`](ARCHITECTURE.md).

📖 **Status:** the engine, CLI surface and daemon API shipped in t273. The web
runtime shipped in t274: Settings management/store, authoritative managed moves,
typed drawer fields, batched card badges, collapsible web panels, full
project-local standalone rendering and persistent quarantine. The canonical
`burndown` example exercises every contribution point.

---

## Table of contents

1. [Philosophy](#philosophy)
2. [Mental model](#mental-model)
3. [Anatomy of an extension](#anatomy-of-an-extension)
4. [The manifest](#the-manifest)
5. [Contribution points](#contribution-points)
   - [field](#field)
   - [webPanel](#webpanel)
   - [command](#command)
   - [gate](#gate)
   - [sync](#sync)
6. [Lifecycle events](#lifecycle-events)
7. [The data model: `plugins.*` opaque frontmatter](#the-data-model-plugins-opaque-frontmatter)
8. [Runtimes: where extension code executes](#runtimes-where-extension-code-executes)
9. [Isolation and resilience](#isolation-and-resilience)
10. [Security model](#security-model)
11. [Distribution and the community store](#distribution-and-the-community-store)
12. [Install and enable lifecycle](#install-and-enable-lifecycle)
13. [Authoring extensions (for agents and humans)](#authoring-extensions-for-agents-and-humans)
14. [Versioning and compatibility](#versioning-and-compatibility)
15. [Invariants extension authors must respect](#invariants-extension-authors-must-respect)
16. [Roadmap](#roadmap)

---

## Philosophy

kandown's whole architecture rests on one sentence: **a task is a Markdown
file, and everything else is a view over a directory of them**. There is no
database, no index, no cache that has to be invalidated. The extension system is
designed to add capability without punching a hole in that sentence.

Three principles follow, and every design choice below derives from them:

1. **Extensions are views, not owners.** An extension may read tasks and may
   store its own data alongside them, but it never becomes the source of truth
   for task state. Task state stays in the core frontmatter fields.
2. **Extension data is opaque to the core.** Everything an extension persists
   lives under a reserved `plugins.<id>.*` namespace that the parser and
   serializer round-trip without interpreting. The core never drops, renames or
   rewrites it.
3. **A broken extension must never break kandown.** Every contribution point is
   wrapped at the boundary. An extension that throws on load is disabled; one
   that throws while rendering is quarantined; the board keeps working.

The result is that extensions are **forward-compatible by construction**: a core
parser change cannot silently destroy extension data, because the core does not
claim to understand it. This is the same property that already makes the
round-trip robust, extended to third-party code.

---

## Mental model

kandown has three user surfaces (web, CLI, TUI), but only the **web** surface is
the primary home for extensions. The CLI and TUI are deliberately frozen to core
functionality and exist as fallback surfaces (SSH, agent loops, quick commands),
but they can host one contribution point: the `command`. So an extension
declares which surfaces it touches, and each surface has its own runtime.

An extension is **declarative at the edges and dynamic in the middle**:

- The **manifest** declares what the extension contributes (fields, panels,
  commands, gates) plus metadata for the store gallery. This is display data; it
  lets the UI and the store describe an extension without running its code.
- The **code** is the source of truth at runtime: it registers contributions
  through the `KandownExtensionAPI` and subscribes to lifecycle events.

This is closer to VS Code (contribution points + activation) than to pi (pure
lifecycle hooks), because kandown has multiple surfaces and a manifest describes
them cleanly. It borrows from pi the jiti runtime (TypeScript without a build
step) and the global/project install split.

---

## Anatomy of an extension

```
kandown-burndown/
├── manifest.json          # metadata + contribution declarations (display)
├── index.js               # Node entry: fields, gates, commands, sync (bundled)
├── web.js                 # Web entry: React panels/views (bundled, optional)
├── styles.css             # optional panel styles
├── README.md
└── examples/              # screenshots / demo tasks
```

During development the entries can be `.ts` files loaded directly via jiti (no
build). For distribution they are bundled (`index.js`, `web.js`) and attached to
a GitHub release, the Obsidian model.

A single-file extension is also valid: just `manifest.json` + `index.ts`.

---

## The manifest

```json
{
  "id": "burndown",
  "name": "Burndown",
  "version": "1.0.0",
  "apiVersion": 1,
  "minKandownVersion": "0.43.0",
  "author": "vava",
  "description": "Story points and a burndown chart panel.",
  "homepage": "https://github.com/vava/kandown-burndown",
  "permissions": [
    "read:tasks",
    "write:field:plugins.burndown.*"
  ],
  "contributes": {
    "fields": ["points"],
    "webPanels": ["chart"],
    "commands": ["burndown"],
    "gates": ["task:beforeMove"]
  },
  "agent": {
    "summary": "Require story points before terminal status.",
    "guide": "guide.md",
    "source": "https://github.com/vava/kandown-burndown#agent-guide"
  }
}
```

| Field | Purpose |
|---|---|
| `id` | Unique, kebab-case. Becomes the `plugins.<id>` namespace and the install dir name. |
| `name`, `author`, `description`, `homepage` | Store gallery display. |
| `version` | Semver of the extension itself. |
| `apiVersion` | The extension API version this targets (currently `1`). Breaking changes bump this. |
| `minKandownVersion` | Refuses to load on older kandown installs. |
| `permissions` | Capabilities the extension may use. Enforced at runtime (see [Security](#security-model)). |
| `contributes` | Display-only list of contribution ids, so the gallery and the settings panel can describe the extension without executing it. The runtime registrations in code are authoritative. |
| `agent` | Optional concise `kandown work` summary, safe relative guide path, and source link. The full guide is loaded only by `kandown extension guide <id>`. |

📖 `contributes` is intentionally not enforced: it is a hint for humans and the
UI. The code is what actually registers contributions. Keeping them in sync is
the author's responsibility, surfaced by `kandown extension doctor`.

---

## Contribution points

An extension contributes through the `KandownExtensionAPI` (`kd`) it receives:

```typescript
import type { KandownExtensionAPI } from "kandown";

export default function (kd: KandownExtensionAPI) {
  kd.contributeField({ key: "points", label: "Story points", type: "number" });
  kd.contributeWebPanel({ id: "chart", title: "Burndown", entry: "./web.js" });
  kd.contributeCommand("burndown", { description: "Print the burndown chart", handler });
  kd.contributeGate({ on: "task:beforeMove", to: "Done", handler });
  kd.on("task:afterMove", async (event, ctx) => { /* ... */ });
}
```

### field

A custom task field. Stored under `plugins.<id>.<key>`. The web UI renders an
editor in the task drawer and an optional badge on the card.

```typescript
kd.contributeField({
  key: "points",
  label: "Story points",
  type: "number",            // "string" | "number" | "boolean" | "date" | "select"
  options: undefined,         // for "select": [{ value, label }]
  badge: (value) => value ? `🔺 ${value}` : null,   // optional card badge
});
```

- The field is the safest contribution point: it only reads and writes the
  extension's own opaque namespace, never core frontmatter.
- Writes go through `field:beforeSet` validation, then through the core mutation
  path (never a direct serializer call).

### webPanel

A panel in the web UI Drawer, rendered by a bundled React component. Read-mostly:
it observes the board and renders. Mutations are emitted as intents that the core
applies (see [Runtimes](#runtimes-where-extension-code-executes)).

```typescript
kd.contributeWebPanel({
  id: "chart",
  title: "Burndown",
  entry: "./web.js",          // bundled ES module exporting a React component
});
```

- The panel is mounted as a collapsible task-editor section inside its own
  `ErrorBoundary` (see [Isolation](#isolation-and-resilience)). A render crash
  shows a retryable placeholder, never a broken editor or board.
- The self-contained bundle exports `panels: { [id]: Component }` or one default
  component. It receives a frozen task, scoped field/read/refresh API and the
  host React runtime as `ui`, so it never needs a second React copy.
- Panel source is fetched through the authenticated bridge, then imported from a
  Blob URL. Relative imports must be bundled into `web.js`.
- The component receives a **scoped API**, not the raw store or daemon token.

### command

A CLI/TUI command, `kandown <name>`. Runs in the Node runtime, synchronously
loadable, offline, instant. Respects the invariant that task commands never touch
the network.

```typescript
kd.contributeCommand("burndown", {
  description: "Print the burndown chart",
  handler: async (args, ctx) => {
    const tasks = await ctx.board.readAll();
    // print...
  },
});
```

- This is the only contribution point that also surfaces in the frozen CLI/TUI.
  It is additive: it adds commands, it never changes core commands.

### gate

A transition policy, generalizing the dependency gate from
[`dependencies.ts`](../src/lib/dependencies.ts). Runs wherever a task moves (web
store, CLI, TUI), from one shared implementation.

```typescript
kd.contributeGate({
  on: "task:beforeMove",
  to: "Done",
  handler: async (event, ctx) => {
    const points = ctx.task.plugins?.burndown?.points;
    if (!points) return { block: true, reason: "A task needs points before Done." };
  },
});
```

- Gates compose with the core dependency gate and with other extensions' gates.
  A move is allowed only if every gate abstains or permits.
- Fail policy: a throwing gate is treated as **fail-open** (no objection) and
  logged; after repeated failures the extension is quarantined. See
  [Isolation](#isolation-and-resilience).

### sync

A background watcher reacting to file changes: notify Slack, push to Jira, mirror
to GitHub. Long-lived, runs in the daemon in server mode. Declared, not called
per event, to keep the watcher lifecycle owned by the core.

```typescript
kd.contributeSync({
  on: "task:afterMove",
  to: "Done",
  handler: async (event, ctx) => {
    await ctx.fetch("https://hooks.slack.com/...", { method: "POST", body: ... });
  },
});
```

- The most powerful and the most dangerous contribution point. It has network
  access and runs persistently, so it is gated behind `permissions` and the trust
  model. Phase 2.

---

## Lifecycle events

Extension handlers subscribe with `kd.on(event, handler)`. Events mirror the
"file is truth" model: they fire around file mutations, not around UI gestures.

| Event | When | Can block? |
|---|---|---|
| `board:load` | Board parsed and ready to render | no |
| `task:beforeCreate` | Before a task file is written | yes |
| `task:afterCreate` | After the file exists | no |
| `task:beforeMove` | Before a status change (gates run here) | yes |
| `task:afterMove` | After the status change (syncs run here) | no |
| `task:beforeArchive` / `task:afterArchive` | Around archiving | before: yes |
| `task:beforeDelete` | Before a task file is removed | yes |
| `field:beforeSet` | Before an extension field write | yes |
| `card:render` | A card is about to render (inject badges) | no |
| `panel:render` | A web panel mounts | no |
| `command:<name>` | A contributed command is invoked | no |

`before*` handlers return `{ block: true, reason }` to veto. The core renders
the reason to the active surface (toast, status line, CLI error).

---

## The data model: `plugins.*` opaque frontmatter

Every extension persists its data under a reserved top-level key, `plugins`, keyed
by extension id:

```yaml
---
title: Refactor parser
status: In Progress
depends_on: [t42]
plugins:
  burndown:
    points: 5
    assignee: vava
---
```

Rules:

- **Reserved namespace.** `plugins` is owned by the extension system. Core code
  never reads, writes or renames anything under it.
- **Round-trip guaranteed.** The parser preserves it; the serializer writes it
  back byte-stably. This is invariant #1 from `ARCHITECTURE.md`, extended.
- **One key per extension.** `plugins.<id>` is the only place an extension may
  write. Cross-extension data sharing happens through events, not through each
  other's namespace.

⚠️ **Serializer hardening is a P0 dependency.** As of this writing,
`serializeTaskFile` (`src/lib/serializer.ts`) only round-trips scalars, arrays
and multi-line strings. It silently drops nested objects because there is no
branch for `typeof v === "object"`. That means the nested shape above would be
**destroyed on the next save**. P0 must do one of:

1. **(Target)** Harden the serializer to emit proper YAML mappings for object
   values under `plugins.*`, with round-trip tests. Best long-term UX, keeps the
   file human-readable and diffable.
2. **(Interim)** Constrain extension values to dotted-scalar keys
   (`plugins.burndown.points: 5`), which the current serializer already
   round-trips with zero changes, at the cost of no nested structures.

Either way, the contract for authors is unchanged: write only under
`plugins.<id>.*`, and the core guarantees the round-trip.

---

## Runtimes: where extension code executes

kandown is multi-surface, so the runtime an extension code path uses depends on
the surface it serves. This is the **hybrid model**.

| Contribution | Runtime | Authoritative? | Available in standalone mode? |
|---|---|---|---|
| `field` (read/write) | Node; browser FSA adapter standalone | yes (writes frontmatter) | yes, project-local |
| `gate` | Node | **yes, single implementation** | fail-open; core dependency gate stays active |
| `sync` | Node (daemon, long-lived) | yes | no (needs network + a process) |
| `command` | Node direct (jiti) | n/a | no browser command runtime |
| card badge | Node server; browser registration standalone | no (render only) | yes, project-local |
| `webPanel`, `webView` | Browser bundled ES module | no (render only) | yes, project-local |

Two invariants shape this table:

- **Single mutation authority.** Authoritative logic (gates, field validation,
  sync triggers) runs once, in Node. The browser never re-implements a gate. In
  server mode the daemon is the authority; the web UI emits intents
  (`createTask`, `moveTask`, `setField`) that the core applies. This preserves
  the "one rule, one implementation" invariant.
- **Standalone mode stays render-capable.** When there is no daemon, web panels
  still render; authoritative features that need a process (sync) degrade. The
  board itself never depends on an extension.

Node-side code is loaded with [jiti](https://github.com/unjs/jiti), so authors
write TypeScript with no build step during development. Browser-side code is a
bundled ES module the web app imports dynamically.

---

## Isolation and resilience

"A broken extension must never break kandown" is enforced per contribution.

### Health states

Every installed extension has one health state:

| State | Meaning |
|---|---|
| `enabled` | Loaded, healthy, active. |
| `disabled` | The user turned it off from settings. |
| `quarantined` | Crashed repeatedly; auto-disabled for safety. |
| `errored` | Threw on load; never mounted. |

Only `enabled` extensions run. The others are visible in settings with their
reason and a `Retry` action. Node health persists under the user-local
`~/.kandown/project-state/<project-hash>/extensions/` directory; standalone
browser health persists in origin-local storage keyed by project plus source
fingerprint. Restarting cannot silently revive a crashing extension. Enable or
Retry clears the record. The core **never depends** on an extension being loaded.

### Fail policies

| Contribution | On throw | Outcome |
|---|---|---|
| factory (load) | caught | `errored`, excluded entirely |
| `webPanel` render | `ErrorBoundary` | placeholder shown; panel disabled after N fails |
| `gate` | caught, logged | treated as **no objection** (fail-open); `quarantined` after 3 fails |
| `field` write | schema validation first, then try/catch | write rolled back, logged |
| `command` | try/catch | clean error message, non-zero exit |
| `sync` | caught | watcher stopped, `quarantined` |

📖 No exception thrown by an extension is allowed to surface as a kandown crash.
Everything is caught at the boundary. kandown already ships
[`ErrorBoundary.tsx`](../src/components/ErrorBoundary.tsx) and
[`globalErrors.ts`](../src/lib/globalErrors.ts); per-panel boundaries extend
them.

---

## Security model

Extensions are third-party code, and kandown runs them with real privileges. The
model is **opt-in by default, scoped at runtime, isolated on failure**.

1. **Restricted mode is the default.** Community extensions are disabled until
   the user explicitly enables them in settings (the Obsidian model). A fresh
   kandown install runs zero community extensions.
2. **Project-local extensions require local trust.** Anything under
   `.kandown/extensions/` (committed to a repo) loads only after explicit local
   approval. Node stores trust outside the repository under
   `~/.kandown/project-state/<project-hash>/extensions/`. Standalone stores a
   project and source fingerprint in browser-local storage and asks again when
   the code changes. Committed `trust.json` or `enabled.json` files are ignored,
   so a cloned repo cannot grant its own execution permission.
3. **Scoped API, never raw credentials.** Extension code receives a `kd` API
   object and a per-call `ctx`. It never receives the daemon API token or a
   handle to the React store. The core proxies every permitted call. This is the
   cheap insurance that makes the ErrorBoundary-only web sandbox acceptable: even
   if a panel runs in the same JS realm, it cannot read the token to exfiltrate.
4. **Declared permissions, enforced at runtime.** The manifest lists
   `permissions` (`read:tasks`, `write:field:plugins.<id>.*`, `net:*`, ...). A
   call outside the declared set is rejected and logged.
5. **No direct filesystem from the browser.** Web panels reach data through the
   daemon API (server mode) or the File System Access bridge (standalone), never
   through direct fs calls.

📖 A future hardening pass may move untrusted web panels into a sandboxed iframe
with a `postMessage` bridge. That decision is deferred; the scoped API already
removes the highest-value attack (token theft). See ADR 0002.

---

## Distribution and the community store

The store is **community-curated and PR-driven**, with a low-friction submission
flow. There is no proprietary backend.

### Source of truth

A public GitHub repo, `kandown/community-extensions`, holds an index:

```json
[
  {
    "id": "burndown",
    "name": "Burndown",
    "author": "vava",
    "description": "Story points and a burndown chart panel.",
    "repo": "vava/kandown-burndown",
    "lastUpdate": "2026-07-27",
    "minKandownVersion": "0.43.0"
  }
]
```

Curation happens by PR review, exactly like `obsidianmd/obsidian-releases`. Zero
custom infrastructure, fully versioned, auditable.

### Submission

Two paths, both ending in the same index:

- **GitHub PR.** Author forks the repo, adds an entry to `extensions.json`,
  opens a PR.
- **kandown.dev form.** A "Submit extension" form on the website fills the entry
  from a repo URL and opens the PR automatically (a small serverless function
  commits to a branch). This lowers the barrier for non-GitFlow authors.

### Install channels

| Channel | How | Audience |
|---|---|---|
| **Gallery one-click** | Web UI settings fetch `extensions.json`, show the gallery, install on click | everyone |
| **Paste-URL** | User pastes `https://github.com/vava/kandown-burndown`; kandown fetches the manifest from the repo/release and installs | early adopters, private extensions |
| **npm** | `kandown install npm:@scope/name` | power users, CI |

### Bundle format

A GitHub release with these assets (the Obsidian release model):

- `manifest.json`
- `index.js` (Node entry, bundled)
- `web.js` (web entry, bundled, optional)
- `styles.css` (optional)

One-click and paste-URL fetch the latest release assets and unpack them into the
install location.

---

## Install and enable lifecycle

```
install   → files land in the location, state = disabled (restricted mode)
enable    → user opts in (or auto if already unrestricted), state = enabled
load      → factory runs in the right runtime, contributions register
run       → handlers fire on events
throw     → fail policy applies; state moves to errored / quarantined
disable   → user turns it off; contributions unregistered
uninstall → files removed, plugins.<id>.* data kept on tasks (user can purge)
```

📖 Uninstalling an extension does **not** delete the `plugins.<id>.*` data
already written on tasks. The data is opaque to the core and harmless; removing
it silently would be destructive. A separate `kandown extension purge <id>`
command cleans it up on demand.

### Locations

| Scope | Path | Committed? |
|---|---|---|
| Global | `~/.kandown/extensions/<id>/` | no (personal to the machine) |
| Project | `.kandown/extensions/<id>/` | yes (shared via git) |

Global extensions apply everywhere; project extensions apply only in that
project, after local trust approval. Enable, trust and quarantine state is
machine-local and never committed with extension source.

---

## Authoring extensions (for agents and humans)

📖 The step-by-step, copy-paste guide lives in
[`EXTENSIONS-AUTHORING.md`](EXTENSIONS-AUTHORING.md). The summary below is the
short version; read the guide to actually build one.

The goal is that a coding agent (pi, claude, codex) can produce a working
kandown extension as easily as it produces a pi extension. The `kandown plugin`
command surface exists for exactly that loop, and four levers make it work:

1. **Scaffold.** `kandown plugin create <id> --kind field|panel|gate|sync|command|full`
   generates a manifest, an `index.ts`, an optional `web.tsx`, an `AGENT.md` and
   a README, all already valid. It prints the full authoring brief to stdout,
   which is what lands in an agent's context.
2. **Contract.** That brief, [`EXTENSIONS-AGENT.md`](EXTENSIONS-AGENT.md), is
   **generated from `src/lib/extensions/types.ts`**, so the document an agent
   reads can never drift from the runtime it compiles against.
3. **Verdict.** `kandown plugin check <id> --json` loads the plugin against a
   synthetic in-memory board, exercises every contribution it registered, and
   returns `{ ok, checks: [{ id, status, message, fix }] }`. The `fix` field is
   written as an instruction, so an agent can iterate to green unattended.
4. **Hot reload.** `kandown plugin dev <id>` watches the directory, rebuilds the
   browser bundles, re-runs the checks and pushes a reload to every open board,
   the pi `/reload` loop without the manual step.

`kandown plugin create <id> --from "<what it should do>"` closes the circle: it
scaffolds, then hands the brief plus the working order to the coding agent
already installed on the machine. kandown never calls a model itself; it supplies
the loop, the agent supplies the code.

Agents are especially good at filling a JSON manifest from a schema, so the
manifest ships with a published JSON Schema that drives both editor validation
and agent generation.

> `plugin check` **executes** the plugin. That is the point (a gate that throws
> is only visible when it runs), but it means checking an untrusted third-party
> plugin runs its code with your privileges. Read it first, exactly as you would
> before `enable`.

### Canonical example

`examples/extensions/burndown/` in this repo is the reference extension. It
exercises every contribution point: a `points` field, a burndown `webPanel`, a
`kandown burndown` command, and a "no Done without points" gate. Any future
author copies it and adapts. It is kandown's `snake.ts`.

---

## Versioning and compatibility

- **`apiVersion`** tracks the extension API itself. Breaking changes bump it. An
  extension declaring `apiVersion: 2` does not load on a kandown that only
  supports `1`, and vice versa, with a clear notice.
- **`minKandownVersion`** is a semver gate. Older kandown refuses to load the
  extension rather than failing at runtime.
- The `plugins.<id>.*` data format is owned by the extension. The extension is
  responsible for migrating its own data across its own versions; the core only
  guarantees it round-trips whatever bytes are there.

---

## Invariants extension authors must respect

Break these and something breaks quietly, which is the expensive kind.

1. **Write data only under `plugins.<id>.*`.** Never touch core frontmatter
   (`title`, `status`, `depends_on`, ...). The core is the source of truth for
   task state; the extension is a view.
2. **Never call the core serializer directly.** Emit intents (`setField`,
   `moveTask`) and let the core apply them. Direct writes risk breaking the
   round-trip.
3. **Never block the board thread synchronously.** Long work is async and
   abort-aware (`ctx.signal`).
4. **Declare your permissions and stay within them.** Undeclared capabilities are
   rejected.
5. **Handle your own errors.** The core catches as a last resort, but persistent
   failure means quarantine.
6. **Do not create a second source of truth.** No index, no cache, no side
   database that mirrors task state. If you need derived data, compute it on
   `board:load` and keep it in memory only.

These mirror the project invariants in [`ARCHITECTURE.md`](ARCHITECTURE.md); the
extension system is bound by the same rules as the core.

---

## Roadmap

| Phase | Scope | Target release |
|---|---|---|
| **P0** | `@kandown/extension-api` types, manifest + JSON Schema, scaffold, `plugins.*` opaque frontmatter (serializer hardening), isolation primitives (health states, ErrorBoundary per panel), canonical `burndown` example | 0.43 |
| **P1** | Contribution points `field` + `webPanel` + `command`, install (gallery + paste-URL), trust prompt, restricted mode | 0.44 |
| **P2** | `gate` (generalize the dependency gate), `sync` (watcher + webhooks), permission enforcement | 0.45 |
| **P3** | kandown.dev submit form + PR automation, gallery search and stats | 0.46+ |

P0 and P1 alone deliver a usable, safe extension system. Everything after is
enrichment.
