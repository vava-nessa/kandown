# Architecture

The prose companion to [`CODEMAP.md`](../CODEMAP.md). The codemap tells you *what
each file is*; this document tells you *why the pieces fit together the way they
do*, and it is written by hand — nothing here is generated.

Read this once before your first non-trivial change. It is the fastest way to avoid
the three mistakes that cost the most time in this repo: editing a generated file,
adding a second source of truth, and putting logic in one interface that the other
two then have to reimplement.

---

## The one-sentence model

**A task is a Markdown file. Everything else is a view over a directory of them.**

There is no database, no index, no cache that has to be invalidated. The web UI,
the terminal UI and the CLI are three renderers over the same `tasks/*.md`
directory, and any of them may be replaced without the data noticing.

Every design decision below follows from that sentence. When something feels
awkward, check whether the proposed fix would introduce a second source of truth —
if it would, it is the wrong fix.

---

## What lives on disk

```
your-project/
├── tasks/                  ← the source of truth
│   ├── t1.md               ← one file per task: YAML frontmatter + Markdown body
│   └── archive/
│       └── t99.md          ← archived tasks; archiving MOVES the file
└── .kandown/
    ├── kandown.json        ← project config: columns, theme, notifications, agents
    ├── kandown.html        ← the web UI, one self-contained file
    ├── kandown_work.md     ← optional, project-specific agent instructions
    ├── workflows/          ← optional, project-local workflow packages
    ├── skills/             ← optional, project-local data-only skill packages
    ├── daemon.json         ← runtime: PID, port, URL, API token   (gitignored)
    └── daemon.lock         ← runtime: start-up mutex              (gitignored)
```

Two rules about this layout carry real weight:

**Tasks live at the project root, not inside `.kandown/`.** Config and data are
separate so the data directory is obvious, greppable and diffable, and so a user can
delete `.kandown/` without losing work. Older installs had them nested; the CLI
migrates them on first run.

**Archiving moves the file.** `tasks/t99.md` → `tasks/archive/t99.md`, and the
frontmatter flag moves with it. The folder and the flag must always agree — code
that writes one without the other creates a task that the two interfaces disagree
about. This has been a source of bugs; keep them in lockstep.

---

## The three entry points

| Entry point | Built from | What it is |
|---|---|---|
| `bin/kandown.js` | `src/cli/cli.ts` | The CLI: `init`, `work`, task commands, `daemon`, `doctor`, `mcp` |
| `bin/tui.js` | `src/cli/tui.tsx` | The terminal UI, an Ink (React-for-the-terminal) app |
| `.kandown/kandown.html` | `src/main.tsx` → `src/App.tsx` | The web UI, inlined into a single file by Vite |

Both files in `bin/` are **tsup bundles committed to the repository** because they
ship in the npm package. They look exactly like handwritten source and they are
not. Editing them appears to work, and the next `pnpm build` silently erases the
change — see [Generated files](#generated-files) for the full list.

`kandown` with no argument starts the daemon, opens the browser and launches the
TUI, so a user typically has two of the three running at once against the same
directory. That is the constraint that shapes everything below: **any interface may
change a file at any time, and the others must notice.**

---

## How a change flows

### Web UI, server mode (the normal case)

```
browser  ──HTTP──►  daemon (src/cli/lib/server.ts)  ──fs──►  tasks/*.md
   ▲                                                              │
   └──────────────── SSE /api/events ◄──── chokidar watcher ◄──────┘
```

The store mutates optimistically — the UI updates immediately, then persists, then
rolls back if the write fails. `src/lib/store/boardSlice.ts` documents which state
each action restores on failure; preserve that pattern when you add a mutation,
because a board that flickers back on every drag feels broken even when it is
correct.

The daemon binds to `127.0.0.1` only and mints a random per-project API token at
startup, stored in the gitignored `.kandown/daemon.json` and injected into the page
it serves. Every route except the read-only `GET /api/daemon` identity check
requires it, so an unrelated browser tab cannot reach your tasks by scanning
localhost ports.

### Web UI, standalone mode

Opening `kandown.html` directly with no daemon works too: the app falls back to the
File System Access API and talks to the folder the user picks. `isServerMode()` in
`src/lib/filesystem.ts` is the switch — it checks for `window.__KANDOWN_ROOT__`,
which only the daemon injects.

**Every filesystem operation must work in both modes.** That is why access is
funnelled through `src/lib/filesystem.ts` instead of being called directly from
components.

### CLI and TUI

Both go straight to disk through `src/cli/lib/board-reader.ts` — no daemon, no
network, no update check. This is deliberate: `kandown list --json` in a CI job or
an agent loop must be instant and work offline.

The TUI additionally runs its own watcher (`src/cli/lib/file-watcher.ts`) so it
redraws when the web UI or an agent edits a file underneath it.

---

## The shared core

These modules are pure — no I/O, no React, no Node built-ins — which is what lets
all three interfaces share them, and what makes them trivial to unit test.

| Module | Responsibility |
|---|---|
| `src/lib/parser.ts` | Markdown + frontmatter → structured task |
| `src/lib/serializer.ts` | Structured task → Markdown + frontmatter |
| `src/lib/dependencies.ts` | `depends_on` resolution and the terminal-column gate |
| `src/lib/types.ts` | The shared task and config types |

**`parseTaskFile` and `serializeTaskFile` must round-trip.** Anything the
serializer can write, the parser must read back identically. This is not a style
preference: the CLI reads a file, applies one change and writes the whole file
back, so any field the parser fails to understand is silently destroyed on the next
`kandown move`. That bug shipped once — an older hand-rolled YAML parser could not
read the multi-line `report:` blocks its own serializer produced, so every move
erased the agent reports on that task. Both sides now come from these modules, and
they are the highest-value target for the test suite.

**One gate, not three.** The `depends_on` rule — you cannot move a task to the
terminal column while a dependency is unresolved — lives in `dependencies.ts` and
is called from the web store, the TUI and the CLI. If you find yourself
reimplementing it, you are creating the fourth copy of a rule that used to have
three.

---

## The daemon

One daemon per project, not one per machine. Each `.kandown/` owns its own
`daemon.json` with the PID, port, URL, project path and CLI version; ports are
allocated by scanning upward from a base port.

Three lessons are baked into `src/cli/lib/daemon.ts` and worth knowing before you
touch it:

- **A failed health check does not mean a dead process.** `getDaemonStatus` reports
  `running: false` when `/api/daemon` does not answer, which is correct for the
  caller — but `stopDaemon` must still SIGTERM the PID from the metadata, and must
  only delete the metadata once the process is actually gone. Deleting it first
  orphans a live process and blocks its port permanently, with no way left to find
  it.
- **Two simultaneous launches race.** A lock file guards the spawn, because both
  processes would otherwise see "not running", both spawn, and the second would
  overwrite the first's metadata.
- **Never guess global state.** The TUI only ever trusts the current project's
  metadata, after validating the PID *and* confirming the process on that port
  identifies as this project's daemon.

---

## The build pipeline

```
pnpm build
  ├─ scripts/inject-version.js      package.json version  →  src/lib/version.ts
  ├─ tsc -b                         typecheck
  ├─ vite build                     src/  →  dist/index.html   (single inlined file)
  └─ tsup                           src/cli/cli.ts   →  bin/kandown.js
                                    src/cli/tui.tsx  →  bin/tui.js
```

`dist/index.html` is copied to `.kandown/kandown.html` by `kandown init`, and
refreshed by the daemon whenever the project's copy is older than the installed CLI
— which is why a user's board updates when they update the package.

### Generated files

Committed, because they ship — but never edited by hand:

| File | Generated from | By |
|---|---|---|
| `bin/kandown.js` | `src/cli/cli.ts` | tsup |
| `bin/tui.js` | `src/cli/tui.tsx` | tsup |
| `src/lib/version.ts` | `package.json` | `scripts/inject-version.js` |
| `CODEMAP.md`, `CODEMAP.json` | every JSDoc `@description` | `scripts/build-codemap.js` |

`CODEMAP.md` marks each of these inline, so the warning is in front of you at the
moment you are looking for the file rather than buried in a document you might not
have read.

### Single sources of truth

| Concern | Owner | Everything else |
|---|---|---|
| Version number | `package.json` | derived at build (web) or read at runtime (CLI) |
| Agent instructions | `src/lib/kandown-work.ts` | compiled by CLI, launcher, and Settings preview |
| Board columns | `.kandown/kandown.json` → `board.columns` | read by all three interfaces |
| Task state | `tasks/*.md` | there is no index — do not add one |

### Interface adapters and mirrors

Kandown has three execution environments: the packaged daemon, Vite development
and the in-memory website demo. Their adapters differ, but domain policy must not.
A local API change therefore needs inspection in `src/cli/lib/server.ts`,
`vite.config.ts` and `src/lib/demoBackend.ts`; reusable behavior belongs in a
shared coordinator rather than three copied implementations.

The web UI also has two task editor shells. `TaskWorkspace.tsx` owns the desktop
route and `Drawer.tsx` owns compact layouts. Shared editor behavior belongs in a
component mounted by both shells. Likewise, `src/lib/store.ts` is the active
Zustand store while `src/lib/store/boardSlice.ts` mirrors board actions during the
store split. Until that migration finishes, behavior changes must stay aligned in
both files and domain logic should move into shared helpers whenever possible.

This fan-out is summarized in `AGENTS.md` so an agent sees it before coding. The
architecture remains the authority for why those seams exist.

---

## The documentation system

Three layers, each answering a different question, each maintained differently.

| Layer | Question | Kept fresh by |
|---|---|---|
| JSDoc file headers | "what is this file?" | written by hand, enforced at 100% |
| [`CODEMAP.md`](../CODEMAP.md) / `.json` | "where do I go?" | generated, pre-commit + CI |
| This document | "why is it like this?" | written by hand |

### The codemap

`scripts/build-codemap.js` reads the leading JSDoc block of every source file and
emits `CODEMAP.md` (a tree with one summary line per file) and `CODEMAP.json` (the
same, plus `@functions` and `@exports` for symbol lookup without grepping).

It is deterministic — no timestamp, no version, no absolute path — so identical
input always produces byte-identical output. That is what makes `--check` mean
something: any difference is real drift, never noise.

```bash
pnpm codemap         # regenerate
pnpm codemap:check   # fail if stale, or if any file lacks @description
```

Two mechanisms keep it honest, with deliberately different strictness:

- **`.githooks/pre-commit`** regenerates and stages the map on every commit, so it
  can never lag the code. A missing `@description` only *warns* here — blocking a
  work-in-progress commit over a docstring is how hooks end up disabled.
- **CI (`.github/workflows/ci.yml`)** runs the same script with `--check` and
  *fails*. Hooks can be skipped; the branch protection cannot.

Hooks install themselves from `scripts/install-hooks.js` on `pnpm install`, by
pointing `core.hooksPath` at the tracked `.githooks/` directory. No husky, no new
dependency, and the hooks show up in review like any other file.

### The dependency graph

The codemap is flat: it tells you what a file is, not what breaks if you change it.
[graphify](https://github.com/vava-nessa) covers that second question by building
an AST-derived graph of the codebase.

```bash
graphify query "what reads kandown.json?"
graphify path "board-reader" "parser"
graphify explain "daemon"
```

`graphify-out/` is **gitignored on purpose.** It is a large generated JSON that
would conflict on every merge, and it costs nothing to rebuild — so it is a local
query index, not a committed artefact. `.githooks/post-commit` refreshes it
incrementally after each commit using AST extraction only: deterministic, no LLM,
no network, no token cost. If graphify is not installed the hook exits quietly, and
it never fails a commit.

To bootstrap the graph the first time, run `/graphify` once; after that the hook
maintains it. Set `KANDOWN_NO_GRAPHIFY=1` to opt out.

---

## Invariants

Break any of these and something downstream breaks quietly, which is the expensive
kind.

1. **`parseTaskFile` ↔ `serializeTaskFile` round-trip.** Preserve fields you do not
   understand rather than dropping them.
2. **One rule, one implementation.** The dependency gate, the parser and the daemon
   module each exist once and are called from all three interfaces.
3. **Filesystem access goes through `src/lib/filesystem.ts`** so it works in both
   server and standalone mode.
4. **The archive folder and the archive flag always agree.**
5. **Task commands and `daemon` never touch the network.** No update check, no
   registry call — they must stay instant and offline-capable for CI and agents.
6. **stdout is data, stderr is decoration.** `ID=$(kandown create "…")` must capture
   exactly one id, and `kandown list --json | jq` must never see a checkmark.
7. **UI strings are authored in English** in `src/lib/i18n/locales/`, and every
   other language is translated from it.
8. **Never edit a generated file.** See the table above.

---

## Extensions

kandown has an extension system: custom task fields, web panels, CLI commands,
transition gates and sync integrations. It is designed so a broken or malicious
extension cannot break the core. The full reference is
[`EXTENSIONS.md`](EXTENSIONS.md), and the decision behind it is
[`adr/0002-extensions-system.md`](adr/0002-extensions-system.md).

Two things carry from here into the extension design:

- **Extension data is opaque to the core.** It lives under a reserved
  `plugins.<id>.*` frontmatter namespace that the parser and serializer
  round-trip without interpreting. This is invariant #1 (the round-trip) extended
  to third-party data, and it is why extensions are forward-compatible by
  construction.
- **One gate, still one implementation.** Managed web moves send an intent to
  the Node move coordinator, which composes the dependency gate with extension
  gates before writing status/order. Standalone keeps the pure dependency gate
  and explicitly degrades extension gates open because no authoritative Node
  runtime exists.
- **Repository code cannot authorize itself.** Project-local extension source
  may be committed, but trust, enablement and quarantine state are user-local.
  Node keys state by canonical project path; standalone keys browser storage by
  project and source fingerprint, requiring approval again after code changes.
- **One browser snapshot, not one request per card.** The daemon executes badge
  functions for all tasks in one pass and returns browser-safe field/panel defs
  plus grouped badges. Project-local standalone mode activates the same bundled
  `index.js` registration through File System Access and Blob imports. Panels
  receive frozen task snapshots and a scoped API inside per-panel boundaries.

Because extensions persist data inside the task file, they inherit every
invariant above for free, and they add one of their own: a failing extension is
isolated (disabled or quarantined) and never takes the board down with it.

---

## Where to go next

| You want to | Go to |
|---|---|
| Find the file that owns something | [`CODEMAP.md`](../CODEMAP.md) |
| Look a symbol up | `CODEMAP.json` |
| Know what depends on what | `graphify query "…"` |
| Cut a release | [`RELEASE.md`](RELEASE.md) |
| Know the project's rules | [`AGENTS.md`](../AGENTS.md) |
| Extend kandown (plugins, fields, panels) | [`EXTENSIONS.md`](EXTENSIONS.md) |
| See what needs doing | `kandown work` |
