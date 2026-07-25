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
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
  <img src="https://img.shields.io/badge/local--first-100%25-orange" alt="100% local-first">
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

Press `a` on any task in the terminal UI to hand it to an agent:

| Agent | Binary | Launch mode |
|---|---|---|
| Claude Code | `claude` | interactive session |
| OpenAI Codex | `codex` | interactive session |
| Gemini CLI | `gemini` | `-p` initial prompt |
| Goose | `goose` | `run --text`, non-interactive |
| Aider | `aider` | `--message` initial prompt |
| OpenCode | `opencode` | TUI, context written to `/tmp` |

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
| `kandown assign <id> [name]` | Assign, or unassign by omitting the name |
| `kandown commit [-m msg]` | `git add tasks/ .kandown/kandown.json` + commit |
| `kandown export` / `import` | JSON / CSV out, Trello JSON or Markdown in |

### Daemon & maintenance

| Command | Description |
|---|---|
| `kandown daemon status\|start\|stop` | Manage this project's web daemon |
| `kandown daemon refresh-all` | Restart outdated daemons on the current CLI version |
| `kandown projects` | List every open kandown project on this machine |
| `kandown update` | Update the CLI and the project's `kandown.html` |

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

### Appearance

**38 built-in themes** (Vercel, Linear, Claude, Apple, Stripe, Catppuccin, Dracula,
Nord, Terminal, Synthwave and more) plus custom themes defined in JSON · light /
dark / auto · tokenised radius, shadows, density and motion · 5 font stacks ·
animated WebGL background · **48 languages** · browser and sound notifications.

### Terminal UI

Keyboard-driven and mouse-aware, works over SSH with no browser.

| Key | Action |
|---|---|
| `j`/`k`, `h`/`l` | Navigate tasks / columns |
| `n` · `e` · `m` | New task · edit in `$EDITOR` · move |
| `/` · `f` | Fuzzy search · cycle filters |
| `a` · `g` | Launch an agent · send to agent hook |
| `x` · `D` | Archive · delete |
| `d` · `r` · `?` | Toggle daemon · reload · cheatsheet |

Drag a task with the mouse to move it between columns.

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

Contributions are welcome.

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

The short version: **`bin/*.js` are build output, not source** — edit `src/cli/`
instead. Every source file carries a JSDoc `@file` / `@description` header, `CODEMAP.md`
is generated from them on every commit, and CI fails if either drifts.

| Script | Description |
|---|---|
| `pnpm dev` | Vite dev server for the web UI |
| `pnpm dev:app` | Full build, then launch the CLI |
| `pnpm dev:cli` | Watch-mode build of the CLI bundles |
| `pnpm build` | Version inject → agent-doc sync → typecheck → web → CLI |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm codemap` | Regenerate `CODEMAP.md` / `CODEMAP.json` |

---

## License

[MIT](LICENSE) © 2026 [Vanessa Depraute](https://vanessadepraute.dev) —
GitHub: [vava-nessa](https://github.com/vava-nessa)
