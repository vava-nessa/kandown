# Agent instructions

You are working on **kandown itself**: a file-based Kanban engine backed by plain
Markdown, installed into other projects with `npx kandown init`.

*(If you are working on a project that merely **uses** kandown, you want
`kandown work`, not this file.)*

---

## Read this in order

| # | Read | When |
|---|---|---|
| 1 | **This file** | Always: the hard rules are below |
| 2 | [`CODEMAP.md`](CODEMAP.md) | To find the file that owns a concern |
| 3 | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Before any non-trivial change |
| 4 | `AGENT_KANDOWN.md` | Any task, backlog or board work |
| 5 | [`docs/RELEASE.md`](docs/RELEASE.md) | On "bump" / cutting a release |
| 6 | [`README.md`](README.md) | For the user-facing feature surface |
| 7 | [`docs/EXTENSIONS.md`](docs/EXTENSIONS.md) | Before touching the extension/plugin system, or anything under `plugins.*` |
| 8 | [`docs/EXTENSIONS-AUTHORING.md`](docs/EXTENSIONS-AUTHORING.md) | When building or scaffolding an extension |

Then run **`kandown work`**: it prints the current agent rules plus a live board
digest and the next actionable task.

Look a symbol up in `CODEMAP.json` instead of grepping. Ask what depends on what
with `graphify query "<question>"` (see
[Architecture § the dependency graph](docs/ARCHITECTURE.md#the-dependency-graph)).

## Change fan-out checklist

Some interfaces intentionally mirror the same feature. Before editing one file
in a row, inspect every surface listed and keep policy in a shared module.

| Concern | Surfaces to inspect | Shared owner |
|---|---|---|
| Task editor UI | `TaskWorkspace.tsx` (desktop), `Drawer.tsx` (mobile) | shared components such as `TaskExtensionSurface.tsx` |
| Zustand board actions | `src/lib/store.ts`, `src/lib/store/boardSlice.ts` | filesystem and domain helpers under `src/lib/` |
| Local API behavior | `src/cli/lib/server.ts`, `vite.config.ts`, `src/lib/demoBackend.ts` | shared coordinators under `src/cli/lib/` or `src/lib/` |
| Generated outputs | `bin/*`, `.kandown/kandown.html`, `CODEMAP.*`, `CHANGELOG.md` | source, build scripts and release files listed below |

The detailed rationale lives in
[Architecture § interface adapters and mirrors](docs/ARCHITECTURE.md#interface-adapters-and-mirrors).

## Review authority

Vava's explicit decisions and the active task's `Decisions` / `Out of scope`
sections are authoritative. A reviewer may find bugs inside that contract, but
must not silently turn an accepted risk or deferred feature into a blocker. List
such observations separately as non-blocking follow-up work. Ask vava before
expanding scope, changing a settled architecture decision or reverting verified
behavior.

---

## Hard rules

### 1. Never edit a generated file

They are committed because they ship. Editing them appears to work, and the next
`pnpm build` silently erases it.

| Never edit | Edit instead |
|---|---|
| `bin/kandown.js` | `src/cli/cli.ts` |
| `bin/tui.js` | `src/cli/tui.tsx` |
| `src/lib/version.ts` | `package.json` (version field) |
| `AGENT_KANDOWN.md` (root) | `templates/AGENT_KANDOWN.md`, then `pnpm sync:agent` |
| `CODEMAP.md`, `CODEMAP.json` | the JSDoc headers, then `pnpm codemap` |
| `CHANGELOG.md` | `changelogs/v<version>.md`, then `pnpm changelog` |

`CODEMAP.md` flags each of these inline, at the moment you go looking for it.

### 2. Every source file carries a JSDoc header

`@file`, `@description`, and `@functions` / `@exports` where they help. This is not
decoration: `CODEMAP.md` is built from these headers, and `pnpm codemap:check` (run
in CI) **fails** when a file has no `@description`. Coverage is at 100%; keep it
there.

Write the header *after* the feature works, not before. Explain **why** and **when
it runs**, not just what it is. Use `📖` to open explanatory comments, matching the
surrounding files.

### 3. Keep kandown tasks up to date, as you work

Not at the end. Check off subtasks with a `report:` line as you complete them, move
the task to the right column, and write a real completion report. `AGENT_KANDOWN.md`
has the full protocol. The task file *is* the work log; if the user opens it, it
should show exactly where things stand.

### 4. UI text is authored in English

English is the source of truth in `src/lib/i18n/locales/`. Translate *from* it,
never into it. "Translate all" means: diff each locale against English, fill the
missing keys, repeat for every language.

### 5. One changelog file per release, and name the release yourself

On a **bump**, the release notes go in a **new file**: `changelogs/v<version>.md`,
headed exactly

```markdown
# <version> - <YYYY-MM-DD> - "<name>"
```

Never append to `CHANGELOG.md`: it is a generated index, rebuilt from
`changelogs/` by `pnpm changelog` and staged automatically by the pre-commit
hook. CI runs `pnpm changelog:check` and fails on drift.

**Choose the release name yourself and do not ask for confirmation.** One to
three words describing the largest change ("Two Views", "TUI Agents", "Motion
Polish"). The project owner has explicitly delegated this: stopping a release to
validate a label is a wasted round trip. Only use a name verbatim if one was
given to you.

`docs/RELEASE.md` has the full runbook: increment, mandatory pre-bump manual
test, build, commit body, tag, push.

### 6. Do not introduce a second source of truth

Task state lives in `tasks/*.md` and nowhere else: no index, no cache, no manifest.
The dependency gate, the parser and the daemon module each exist once and are shared
by all three interfaces. See
[Architecture § invariants](docs/ARCHITECTURE.md#invariants) for the full list.

### 7. Never use em-dashes (—) in any content

Em-dashes (`—`, U+2014, tiret cadratin) are an AI tell. They do not appear in human
writing and they make every sentence that uses them read as autogenerated. In **all**
content you author for this project (docs, README, website copy, JSDoc, code comments,
commit messages, UI strings, CHANGELOG entries, changelog files, task descriptions)
replace them with a comma, colon, semicolon, parenthesis or a rewording.

Same goes for en-dashes (`–`, U+2013) when used as a pause.

**Do not** save em-dashes to disk. Writing one and then "fixing the prose later" is
not a workflow; the prose is the deliverable.

### 8. The extension system has a spec; read it before extending

kandown has an extension system (custom fields, web panels, CLI commands, gates,
sync). Before adding a contribution point, writing an extension, or touching
anything under the `plugins.*` frontmatter namespace, read
[`docs/EXTENSIONS.md`](docs/EXTENSIONS.md) and
[`docs/adr/0002-extensions-system.md`](docs/adr/0002-extensions-system.md).

Two non-negotiables from that spec:

- Extension data lives **only** under `plugins.<id>.*`, opaque to the core. Never
  add a second file or a side index for extension state (that is rule #6 again).
- A broken extension must never break the core. Every contribution point is
  wrapped at the boundary: an extension that throws on load is disabled, one that
  throws while rendering is quarantined. Preserve that when you add a point.

The serializer must round-trip nested objects under `plugins.*` before the nested
data shape ships (see the spec's data-model section).

---

## Working on the UI

Launch or reuse the dev server through **Herdr** in the `kandown` space
(`workspace_id: wE`), tab **`dev-server`**:

```bash
herdr tab list                                    # does it already exist?
herdr tab create --workspace wE --cwd <path> --label "dev-server" --focus
herdr pane send-text <PANE_ID> "pnpm dev:app"
herdr pane send-keys <PANE_ID> "Enter"
```

Then **always give vava a clickable URL** (`http://localhost:5176/`) so she can test
as you go.

---

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server for the web UI (syncs the agent doc first) |
| `pnpm dev:app` | Full build, then launch the CLI, the realistic dev loop |
| `pnpm dev:cli` | Watch-mode build of the CLI/TUI bundles |
| `pnpm build` | inject version, then sync agent doc, typecheck, web, CLI |
| `pnpm verify` | Run the complete local quality gate before commit or push |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm codemap` | Regenerate `CODEMAP.md` / `CODEMAP.json` |
| `pnpm codemap:check` | Fail if the codemap is stale or a file lacks `@description` |
| `pnpm changelog` | Rebuild `CHANGELOG.md` from `changelogs/` |
| `pnpm changelog:check` | Fail if the changelog index is stale |
| `pnpm sync:agent` | Propagate `templates/AGENT_KANDOWN.md` to the project root |

Git hooks install themselves on `pnpm install` (`core.hooksPath` → `.githooks/`):
pre-commit regenerates and stages the codemap **and the changelog index**,
post-commit refreshes the local graphify graph. Neither can fail a commit.

**The codemap and `CHANGELOG.md` showing up in your commit is expected, do not
report it.** The pre-commit hook stages `CODEMAP.md` / `CODEMAP.json` /
`CHANGELOG.md` itself, so they appear in commits that never touched them,
sometimes describing source changes still sitting uncommitted in the working tree.
This is intended, it is not a mistake, and the project owner set the hooks up
deliberately. Commit and move on: no warning, no caveat, no paragraph explaining
it.
