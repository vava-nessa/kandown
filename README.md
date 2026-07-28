<p align="center">
  <img src="logo.svg" width="140" height="140" alt="Kandown logo">
</p>

<h1 align="center">Kandown</h1>

<p align="center">
  <strong>Too Many Ideas, Not Enough Agents.</strong><br>
  A local-first Kanban board where every task is a Markdown file you own forever.<br>
  Zero backend · Zero database · No account · Built for working alongside AI agents
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/kandown"><img src="https://img.shields.io/npm/v/kandown?color=cb3837&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/kandown"><img src="https://img.shields.io/npm/dm/kandown?color=blue" alt="npm downloads"></a>
  <a href="https://www.reddit.com/r/kandown/"><img src="https://img.shields.io/badge/Reddit-r%2Fkandown-FF4500?logo=reddit&logoColor=white" alt="Reddit r/kandown"></a>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
  <img src="https://img.shields.io/badge/local--first-100%25-orange" alt="100% local-first">
</p>

<p align="center">
  <a href="https://kandown.dev"><strong>kandown.dev</strong></a> ·
  <a href="https://kandown.dev/docs">Documentation</a> ·
  <a href="https://kandown.dev/extensions">Extensions</a> ·
  <a href="https://kandown.dev/changelogs">Changelog</a> ·
  <a href="https://www.reddit.com/r/kandown/">Reddit (r/kandown)</a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#for-ai-agents">For AI agents</a> ·
  <a href="#cli-reference">CLI</a> ·
  <a href="#features">Features</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## What it is

Kandown drops a `tasks/` folder into your project and gives you three ways to work
with it: a polished web board, a full terminal UI, and a scriptable CLI. All three
read and write the same plain Markdown files.

- **Your data is just files.** One `.md` per task, versioned in git, readable by any
  editor, any script, any AI agent. Nothing to export, nothing to lose.
- **Agents are first-class users**, not an integration. Claude Code, Codex, Gemini
  CLI, Goose, Aider and OpenCode all drive the board directly.
- **Fully offline.** No account, no cloud, no telemetry. The web UI is one
  self-contained HTML file you can open anywhere.

---

## Quick start

```bash
npm install -g kandown     # Node.js 18+
cd my-project
kandown init
kandown
```

`kandown init` creates two folders at your project root:

```
tasks/                # your tasks — the source of truth
├── t1.md             # one Markdown file per task
└── archive/          # archived tasks live here

.kandown/             # config + web UI + agent docs
├── kandown.json      # columns, theme, notifications, agents
├── kandown.html      # the web app, one self-contained file
├── instructions.md   # optional: your project's agent instructions
└── AGENT*.md         # agent reference, kept in sync with the CLI
```

`kandown` then starts a small local daemon and opens both a **web board** in your
browser and a **terminal UI** in your shell. The daemon outlives the TUI, so the
browser keeps working after you quit — stop it with `d` in the TUI or
`kandown daemon stop`.

Tasks live at your project root rather than inside `.kandown/` so that config and
data stay cleanly separated. Upgrading from an older layout? The CLI moves them for
you on first run.

---

## For AI agents

This is the part that makes kandown different, so it is worth two minutes.

### One command for context

```bash
kandown work
```

That prints, as plain Markdown on stdout:

1. **The agent rules** — served from the installed CLI, so they are never a stale
   copy frozen into your repo at init time.
2. **Your project instructions** — optional, from `.kandown/instructions.md`. Stack
   quirks, "always use pnpm", commit-message language, token-efficiency
   preferences.
3. **A live board digest** — column counts, tasks per column with blocked-by
   annotations, and a computed **next actionable task** (unblocked, closest to done,
   highest priority).

One call, full context. `kandown init` adds a single line to your `AGENTS.md` /
`CLAUDE.md` pointing at it — no block of rules copied in to go stale.

The Settings page has an **Agent → `kandown work` output** configurator: toggle each
block, switch to a concise token-efficient mode, hide digest fields, see an
estimated token count, or take full control with a raw template using
`{{baseRules}}`, `{{projectInstructions}}` and `{{boardDigest}}`.

### Scriptable, composable, offline

```bash
kandown list --json | jq '.[] | select(.priority=="P1")'
ID=$(kandown create "Refactor auth middleware" -p P1 -t backend)
kandown move "$ID" Done
kandown commit -m "tasks: add auth refactor"
```

**Output contract:** stdout carries data only — ids, JSON, tables. Everything
decorative (`✓ Created…`, warnings, errors) goes to stderr. So `$(kandown create
…)` captures exactly one id, and `--json | jq` never chokes on a checkmark. Exit
code `0` on success, non-zero on failure.

**No network, ever.** The task commands and `kandown daemon` never contact the npm
registry, so they stay instant and work offline — ideal for CI and for agents in a
loop.

### MCP

```bash
kandown mcp                          # stdio MCP server
claude mcp add kandown -- kandown mcp
```

### Launching agents from the board

Press `a` on any task in the terminal UI. One key does both halves of the job:
it writes `assignee: <agent>` into the task file, then starts that agent on the
task. The board, the web view and the markdown agree immediately, and the next
`a` on the same task relaunches the same agent without asking again.

The picker only lists agents whose binary is actually on this machine, each with
the path it resolved to, so you always know which install is about to run:

```
ASSIGN & LAUNCH  t42

1 › Claude Code  (~/.local/bin/claude)
2   OpenAI Codex  (/opt/homebrew/bin/codex)
3   OpenCode  (~/.nvm/versions/node/v25.2.1/bin/opencode)
```

| Agent | Binary | Launch mode |
|---|---|---|
| Claude Code | `claude` | interactive session |
| OpenAI Codex | `codex` | interactive session |
| Gemini CLI | `gemini` | `--prompt-interactive` |
| Goose | `goose` | `run --text`, non-interactive |
| Aider | `aider` | `--message` initial prompt |
| OpenCode | `opencode` | TUI, `--prompt` initial message |
| Cursor | `cursor` | IDE opens the project (paste prompt) |
| Pi | `pi` | interactive session |
| GitHub Copilot CLI | `copilot` | `--interactive` prompt |
| Amazon Q Developer | `q` | `q chat`, interactive |
| Auggie (Augment) | `auggie` | interactive session |
| Amp | `amp` | `-x` execute, non-interactive |
| Factory Droid | `droid` | `droid exec`, non-interactive |
| Cline | `cline` | `cline task`, non-interactive |
| Crush · OpenClaw · Kimi · Qwen · Mistral Vibe · Grok · OpenHands · Perplexity · Agy | | interactive session |

The catalog is the committed `.kandown/agents.json` — override binaries, add
aliases, pin team-wide `extraArgs`, or declare a fully custom agent with a
[launch mode](#). Run `kandown agents` to see what's installed.

Or point kandown at your own tooling with `KANDOWN_AGENT_HOOK_URL` and let any
IDE, bot or webhook receive tasks.

---

## CLI reference

### Interactive

| Command | Description |
|---|---|
| `kandown` | Web UI + terminal board |
| `kandown init` | Initialize in the current project |
| `kandown board` | Terminal UI only, no browser |
| `kandown settings` | Terminal settings editor |
| `kandown doctor` | Diagnose config, daemon, ports, task frontmatter |
| `kandown help` | Full help |

### Tasks — non-interactive, agent- and CI-friendly

| Command | Description |
|---|---|
| `kandown list` | List tasks — `[-s status] [-a assignee] [-t tag] [-p priority] [--archived] [--json]` |
| `kandown show <id>` | Print a task file's raw content |
| `kandown create "title"` | Create — `[-p priority] [-a assignee] [-t tag …] [--to status] [--id custom-id] [--json]` |
| `kandown move <id> <status>` | Move to a column, or to `archived` |
| `kandown assign <id> [name]` | Assign, or unassign by omitting the name. Use an agent id/alias (`claude`, `codex`, …) and pressing `a` in the TUI launches it directly |
| `kandown run [id]` | **Cascade** — run ready tasks via their assigned agents in dependency order, handing each completion report to the next. Flags: `--dry-run`, `--agent <id>`, `--resume`, `--same-session` |
| `kandown agents` | List detected AI agents + the `.kandown/agents.json` catalog. `kandown agents init` writes a default one |
| `kandown commit [-m msg]` | `git add tasks/ .kandown/kandown.json` + commit |
| `kandown export` / `import` | JSON / CSV out, Trello JSON or Markdown in |

### Daemon & maintenance

| Command | Description |
|---|---|
| `kandown daemon status\|start\|stop` | Manage this project's web daemon |
| `kandown daemon refresh-all` | Restart outdated daemons on the current CLI version |
| `kandown projects` | List every open kandown project on this machine |
| `kandown update` | Update the CLI and the project's `kandown.html` |

### Extensions

| Command | Description |
|---|---|
| `kandown extension list` | Show installed extensions, health and contributions |
| `kandown extension install <path-or-url>` | Install locally or from a GitHub URL |
| `kandown extension enable\|disable <id>` | Trust and toggle one extension |
| `kandown extension create <name>` | Scaffold a project-local extension |
| `kandown extension purge <id>` | Explicitly remove its `plugins.<id>.*` task data |

Browse community extensions at [kandown.dev/extensions](https://kandown.dev/extensions).

### Themes

| Command | Description |
|---|---|
| `kandown theme list` | Show installed community themes |
| `kandown theme install <path-or-github-url>` | Install from a registry entry or a GitHub repo |
| `kandown theme create <kebab-name>` | Scaffold a starter theme JSON in `.kandown/themes/` |
| `kandown theme publish <theme.json> [--github-user <name>]` | Print the prefilled PR URL to propose the theme to the registry |

Browse community themes at [kandown.dev/themes](https://kandown.dev/themes).

---

## Features

### Board & views

Horizontal kanban with drag-and-drop · sectioned list view with filters and search ·
full-text search across titles, bodies, subtasks, tags, assignee and priority ·
command palette (`⌘K`) · freely editable columns · group-by
(priority / assignee / epic) · due-date banner · guarded double-click deletion ·
bulk archive or delete of a whole column.

### Tasks

WYSIWYG Markdown editor · subtask checklists with per-step descriptions, reports and
keyboard reordering · priority, assignee, tags, due date, epic, owner type ·
`depends_on` dependencies with a gate that refuses to close a blocked task ·
human/agent owner filtering · quick-add syntax
(`Fix login p1 #backend @chacha due:friday`) · task templates ·
external-change detection.

### Extensions

Community store with one-click and paste-URL install · restricted mode on by
default · typed fields in both task editors · card badges · collapsible custom
panels inside isolated error boundaries · extension and dependency gates enforced
by one managed move endpoint · full project-local standalone rendering ·
persistent quarantine after repeated failures.

Extension data stays inside the task file under `plugins.<id>.*`; uninstall keeps
that data until an explicit purge. No extension becomes a second source of truth.

### Themes

Community store with the same one-click and paste-URL flow as extensions
(curated claude / linear / notion plus community submissions from
`registry/themes.json`) · single-file install under `.kandown/themes/<id>.json` ·
floating editor with Visual, Advanced, JSON and Publish tabs · live preview via
the surrounding app (changes apply as you tweak) · Download JSON + Propose on
GitHub (zero-backend submission, the button opens a prefilled PR URL) · per-theme
advanced overrides (glass intensity, border width, per-level shadow strings,
display font) for power users.

### Appearance

**1 house theme + a community store** — only `kandown` ships with the package;
curated (claude, linear, notion) and community themes come from
`registry/themes.json` and install as single JSON files under
`.kandown/themes/`. **Floating, draggable, minimizable editor** with Visual,
Advanced, JSON and Publish tabs (Download JSON + Propose on GitHub).
Tokenised radius, shadows, density, motion, glass and border width · custom
shadow overrides per level · 5 font stacks · light / dark / auto ·
animated WebGL background · **48 languages** · browser and sound notifications.

### Terminal UI

Keyboard-driven and mouse-aware, works over SSH with no browser. **Two views over
the same board, swapped with `Tab`** — a dense one-task-per-line **list** (the
default) and the **kanban columns**. The choice is remembered per project in
`.kandown/kandown.json` under `tui`.

```
  ID   Age   Status↑     Pr Who  Dep  Description                        Assignee
 ────────────────────────────────────────────────────────────────────────────────
   t12  3s    Backlog     P2 🤖       Wire up the local daemon           claude
 ▸ t264 12min In Progress P1 🤖  ↪2   Refactor the TUI, list view by     codex
                                      default, Tab toggles views
   t99  4d    Done        P3 👤       Rewrite the README intro           vava
```

The list gives every task a full line, so titles stay readable where five kanban
columns would truncate them to noise. The selected row expands downward to show
its whole title; every other row stays exactly one line. A live detail pane under
the list follows the selection (`z` hides it), and columns drop themselves as the
terminal narrows, description last.

**Click a column header to sort by it**, and click the same header again to
reverse — the active column carries a `↑`/`↓` arrow so you always know what is
driving the order. `s` cycles the four common sorts from the keyboard, `S`
reverses the current one.

**The `Pr` header is a lens, not a sort**: clicking it (or pressing `p`) cycles
through *all → P1 → P2 → P3 → P4 → untriaged*, and the header shows the active
priority in its own colour. It composes with `f`, so "AI-owned P1s" is two
keystrokes. Priority *sorting* stays on the `s` cycle.

`Who` says who the task belongs to: 🤖 for an agent, 👤 for a person, blank when
the file does not say. `Assignee`, pinned to the far right, names the specific
coding agent (or human) on the job — the same value `a` writes when it launches
one. Descriptions are capped at 60 characters so every row keeps the same shape
at any terminal width; the selected row still wraps in place, and the detail pane
always has the full title.

**Every column except `ID` and `Description` can be switched off** in
`kandown settings` → *Terminal UI*, saved to `tui.columns` in
`.kandown/kandown.json`. `Tags` is off by default: it is the widest optional
column and most projects leave it empty, so on by default it mostly reserved
description width to render blanks.

| Key | Action |
|---|---|
| `Tab` | Switch list ⇄ board |
| `j`/`k` | Move the selection |
| `h`/`l` | **List:** move the task between columns · **board:** change column |
| `s` · `S` · `z` | Cycle sort (status, age, priority, id) · reverse it · toggle the detail pane |
| `n` · `e` · `m` | New task · edit in `$EDITOR` · move menu (board) |
| `/` · `f` · `p` | Search id/title/tags/assignee · cycle filters (P1, AI, human, blocked) · priority lens |
| `a` · `g` | Assign to an agent and launch it · send to agent hook |
| `x` · `D` · `u` | Archive · delete · undo |
| `d` · `r` · `?` | Toggle daemon · reload · cheatsheet |
| `Esc` | Clear search and filters, or quit when none is active |

Drag a task with the mouse to move it between columns in the board view; in the
list, click a header to sort, click a row to select, click it again to open, and
scroll with the wheel.

The `Age` column reads the `updated:` frontmatter timestamp, which every kandown
write stamps — CLI, MCP and web alike. It is deliberately not the file mtime:
`git clone` resets mtime, which would make every task on a fresh checkout report
the same age.

### Web shortcuts

`⌘K` palette · `⌘1`/`⌘2` board/list · `N` new · `R` reload · `/` search ·
`⌘S` save · `⌘⌫` delete · `Esc` close.

---

## The data model

One task, one file, no index:

```markdown
---
id: t1
title: Implement user auth
status: Todo
priority: P1
tags: [backend, security]
assignee: chacha
depends_on: [t7]
created: 2026-04-10
---

# Implement user auth

## Context
Why this task exists.

## Subtasks
- [x] Create user model
  report: Added src/models/user.ts with the schema and migrations.
- [ ] Set up OAuth provider
```

| Field | Meaning |
|---|---|
| `status` | Board column, from `board.columns` in `kandown.json` |
| `order` | Sort position within the column |
| `priority` | `P1`–`P4` |
| `tags`, `assignee` | Free-form labels, username or agent name |
| `ownerType` | `human` or `ai` — drives owner filtering |
| `depends_on` | Task ids blocking this one; moving to the terminal column is refused while any is unresolved |
| `report` | Completion summary in Markdown, shown prominently in the UI |

---

## Configuration

### Environment variables

| Variable | Effect |
|---|---|
| `KANDOWN_NO_UPDATE=1` | Disable the background update check (recommended in CI) |
| `KANDOWN_DEBUG=1` | Print full stack traces instead of a one-line summary |
| `KANDOWN_AGENT_HOOK_URL` | Endpoint that receives tasks from "Send to Agent" / TUI `g` |
| `KANDOWN_AGENT_HOOK_LABEL` | Custom label for the agent hook button |
| `KANDOWN_AGENT_HOOK_HEADERS` | JSON object of extra headers for the hook request |

Interactive runs check npm for updates at most once every 24 hours — never for the
task commands, never for `daemon`, never when stdout is not a terminal — and install
silently when one is found.

### Security

The local daemon binds to `127.0.0.1` only and mints a random per-project API token
at startup, stored in the gitignored `.kandown/daemon.json` and injected into the
page it serves. Every route except the read-only `GET /api/daemon` identity check
requires it, so an unrelated browser tab cannot reach your tasks by scanning
localhost ports. Task ids are validated before they touch the filesystem.

---

## Contributing

Contributions are welcome. Join our community on [Reddit (r/kandown)](https://www.reddit.com/r/kandown/) to share ideas, workflows, and feedback!

```bash
git clone https://github.com/vava-nessa/kandown.git
cd kandown
pnpm install          # also installs the git hooks
pnpm dev              # web UI at localhost:5176
```

Before your first change, read — in this order:

| Document | What it gives you |
|---|---|
| [`AGENTS.md`](AGENTS.md) | The project's rules, including which files are generated |
| [`CODEMAP.md`](CODEMAP.md) | Every source file with a one-line summary — generated from JSDoc |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the pieces fit and which invariants not to break |
| [`docs/RELEASE.md`](docs/RELEASE.md) | The release runbook |
| [`CHANGELOG.md`](CHANGELOG.md) | Index of every release — full notes live in [`changelogs/`](changelogs/) |

The short version: **`bin/*.js` are build output, not source** — edit `src/cli/`
instead. Every source file carries a JSDoc `@file` / `@description` header, `CODEMAP.md`
is generated from them on every commit, and CI fails if either drifts.

| Script | Description |
|---|---|
| `pnpm dev` | Vite dev server for the web UI |
| `pnpm dev:app` | Full build, then launch the CLI |
| `pnpm dev:cli` | Watch-mode build of the CLI bundles |
| `pnpm build` | Version inject → agent-doc sync → typecheck → web → CLI |
| `pnpm verify` | Full local gate: types, tests, build, generated docs and diff checks |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm codemap` | Regenerate `CODEMAP.md` / `CODEMAP.json` |
| `pnpm changelog` | Regenerate the `CHANGELOG.md` index from `changelogs/` |

---

## Changelog

Every release has its own file in **[`changelogs/`](changelogs/)** —
[`v0.36.1.md`](changelogs/v0.36.1.md), [`v0.36.0.md`](changelogs/v0.36.0.md), and so
on back to `v0.1.0`. **[`CHANGELOG.md`](CHANGELOG.md)** is the generated index:
every version with its date, release name and change counts.

---

## License

[MIT](LICENSE) © 2026 [Vanessa Depraute](https://vanessadepraute.dev) —
GitHub: [vava-nessa](https://github.com/vava-nessa)
