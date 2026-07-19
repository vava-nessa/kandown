<p align="center">
  <img src="logo.svg" width="140" height="140" alt="Kandown logo">
</p>

<h1 align="center">Kandown</h1>

<p align="center">
  <strong>File-based Kanban board backed by plain Markdown.</strong><br>
  Zero backend · Zero database · No account · AI-agent friendly
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/kandown"><img src="https://img.shields.io/npm/v/kandown?color=cb3837&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/kandown"><img src="https://img.shields.io/npm/dm/kandown?color=blue" alt="npm downloads"></a>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
  <img src="https://img.shields.io/badge/local--first-100%25-orange" alt="100% local-first">
</p>

---

## Description

Kandown is a **local-first Kanban board** where your tasks live as plain Markdown files. No cloud, no account, no vendor lock-in — just a `.kandown/` folder in your project that you own forever.

- **Your data is portable** — tasks are `.md` files versioned with git, readable by any text editor or AI agent
- **AI-agent friendly** — Claude, Codex, Gemini, Goose, Aider, and OpenCode can read and update tasks directly
- **Dual interface** — a polished web UI + a full terminal TUI, both running entirely offline
- **Single-file deployment** — `kandown.html` is a self-contained app you can open in any browser

---

## Installation

```bash
npm install -g kandown
```

**Requirements:** Node.js 18+

---

## Usage

### Initialize in any project

```bash
cd my-project
kandown init
```

This creates two folders at your project root:

```
.kandown/             # config + web UI + agent docs
├── kandown.html      # Single-file web app
├── kandown.json      # Project config (columns, appearance)
├── AGENT.md          # AI-agent quick reference
└── AGENT_KANDOWN.md  # Full agent reference

tasks/                # Task files (source of truth)
├── t1.md             # One .md file per task
└── archive/          # Archived tasks live here
```

> **Layout note:** tasks live at the project root in `./tasks/`, not inside
> `.kandown/`. This keeps config and data cleanly separated. If you're
> upgrading from an older version with tasks in `.kandown/tasks/`, the CLI
> will move them automatically the first time you run it — nothing to do.

### Launch the board

```bash
kandown
```

This starts a per-project local web daemon, then opens:
- A **web UI** in your browser (board view, list view, task editor)
- A **terminal TUI** for keyboard-driven workflow (works over SSH, no browser needed)

The web daemon stays alive after you quit the TUI so the browser keeps working. Stop or restart it anytime from the TUI with `d`, or from the CLI with `kandown daemon stop`.

### CLI Commands

| Command | Description |
|---|---|
| `kandown` | Launch web UI + board TUI |
| `kandown init` | Initialize in current project |
| `kandown board` | TUI only (no browser) |
| `kandown settings` | Terminal settings editor |
| `kandown daemon status` | Show this project's web daemon status |
| `kandown daemon start` | Start/reconnect this project's web daemon |
| `kandown daemon stop` | Stop this project's web daemon |
| `kandown update` | Update `kandown.html` to latest |
| `kandown shell <cmd>` | Scriptable, one-shot task commands (see below) |
| `kandown help` | CLI help |

### Shell commands (scriptable, agent-friendly)

`kandown shell` is a one-shot, non-interactive interface to the board — built for scripts, CI, and AI agents. Every command auto-inits `.kandown/` on first use, same as the interactive CLI.

| Command | Description |
|---|---|
| `kandown shell list` | List tasks — `[-s status] [-a assignee] [-t tag] [-p priority] [--archived] [--json]` |
| `kandown shell show <id>` | Print a task file's raw content |
| `kandown shell create "title"` | Create a task — `[-p priority] [-a assignee] [-t tag ...] [--to status] [--id custom-id] [--json]` |
| `kandown shell move <id> <status>` | Move a task — `<status>` is a column name or `"archived"` |
| `kandown shell assign <id> [name]` | Assign a task (omit name to unassign) |
| `kandown shell commit [-m "message"]` | `git add tasks/ .kandown/kandown.json` + `git commit` |

```bash
kandown shell list --json | jq '.[] | select(.priority=="P1")'
kandown shell create "Refactor auth middleware" -p P1 -t backend
kandown shell move t42 Done
kandown shell assign t42 alice
kandown shell commit -m "tasks: add auth refactor"
```

**Output contract:** stdout carries data only (task ids, JSON, tables) — everything decorative (`✓ Created…`, warnings, errors) goes to stderr. This keeps `ID=$(kandown shell create "...")` and `kandown shell list --json | jq ...` clean and composable. Exit code `0` on success, non-zero on error — safe to check in scripts.

**No update checks:** `kandown shell` and `kandown daemon` never touch the npm registry, so they stay fast and fully offline-capable — ideal for CI and for AI agents driving the board directly.

---

## Environment variables

| Variable | Effect |
|---|---|
| `KANDOWN_NO_UPDATE=1` | Disable the background auto-update check entirely (recommended for CI) |
| `KANDOWN_DEBUG=1` | Print full stack traces on unexpected errors instead of a one-line summary |
| `KANDOWN_AGENT_HOOK_URL` | POST endpoint that receives tasks sent via the "Send to Agent" button / TUI `g` key |
| `KANDOWN_AGENT_HOOK_LABEL` | Custom label for the agent hook button (default: `Agent`) |
| `KANDOWN_AGENT_HOOK_HEADERS` | JSON object of extra HTTP headers to send with the agent hook request |

Interactive runs of `kandown` check npm for updates at most once every 24 hours (never for `shell`/`daemon`, never when stdout isn't a terminal) and auto-install silently when one is found.

---

## Security notes

- The local web daemon binds to `127.0.0.1` only and issues a random per-project API token on startup (stored in the gitignored `.kandown/daemon.json`, injected into the served page). Every API route except the read-only `GET /api/daemon` identity check requires it — a stray browser tab on another site can't read or write your tasks through it.
- `.kandown/daemon.json` and `.kandown/daemon.lock` are runtime-only files; `kandown init` adds them to `.kandown/.gitignore` automatically.

---

## Features

### Board & Views

| Feature | Description |
|---|---|
| Board view | Horizontal kanban with drag-and-drop |
| List view | Dense table with filters & search |
| Content search | Search titles, body, subtasks, tags, assignee, priority |
| Command palette | `⌘K` / `Ctrl+K` for quick actions |
| Custom columns | Add, rename, delete columns freely |
| Guarded deletion | Double-click to delete — no accidents |

### Task Management

| Feature | Description |
|---|---|
| Rich task drawer | WYSIWYG markdown editor for title, metadata, subtasks, body |
| Subtasks | Full checklist with progress tracking on cards |
| Metadata fields | Priority, assignee, tags, due date, owner type |
| Owner filtering | Filter human vs AI-agent tasks separately |
| External-change detection | Warns when files are modified outside the app |

### Appearance & UX

| Feature | Description |
|---|---|
| 5 built-in skins | Kandown, Graphite, Sage, Cobalt, Rose |
| Theme modes | Auto (system), Light, Dark |
| 5 font stacks | Inter, System, Serif, Mono, Rounded |
| Animated backgrounds | WebGL fluid simulation (LiquidEther) |
| 48 languages | Full i18n support |
| Notifications | Browser + sound alerts for status changes, edits, completions |

### AI Agent Integration

Press `a` in the board TUI to launch an AI agent on any task. Supported agents:

| Agent | Binary | Launch mode |
|---|---|---|
| Claude Code | `claude` | Interactive session |
| OpenAI Codex | `codex` | Interactive session |
| Gemini CLI | `gemini` | `-p` flag for initial prompt |
| Goose | `goose` | `run --text` for non-interactive |
| Aider | `aider` | `--message` for initial prompt |
| OpenCode | `opencode` | TUI, context written to `/tmp` |

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘1` / `Ctrl+1` | Board view |
| `⌘2` / `Ctrl+2` | List view |
| `N` | New task |
| `R` | Reload from disk |
| `/` | Focus search |
| `Esc` | Close drawer / palette |
| `⌘S` / `Ctrl+S` | Save task |
| `⌘⌫` / `Ctrl+Backspace` | Delete task (with confirmation) |

### TUI extras

| Shortcut / gesture | Action |
|---|---|
| `d` | Start/stop the per-project web daemon |
| Mouse drag task | Move a task between columns in the terminal |
| `m` | Open the focused task context menu |
| `r` | Reload board from disk |

### Data Model

Each task is a standalone Markdown file:

```markdown
---
id: t1
title: Implement user auth
status: Todo
priority: P1
tags: [backend, security]
assignee: chacha
created: 2026-04-10
---

# Implement user auth

## Context
Why this task exists.

## Subtasks
- [ ] Set up OAuth provider
- [x] Create user model
- [ ] Add session middleware
```

---

## Contributing

Contributions are welcome! Please read the existing code style and conventions before submitting PRs.

### Development Setup

```bash
git clone https://github.com/vava-nessa/kandown.git
cd kandown
pnpm install
pnpm dev          # Web UI at localhost:5176
```

### Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Vite dev server for web UI |
| `pnpm dev:cli` | Watch-mode build for CLI TUI |
| `pnpm build` | Full build: typecheck → web app → CLI |
| `pnpm build:cli` | CLI TUI build only |
| `pnpm preview` | Preview production build |
| `pnpm typecheck` | TypeScript check |

---

## License & credits

[MIT](LICENSE) © 2026 [Vanessa Depraute](https://vanessadepraute.dev) — GitHub: [vava-nessa](https://github.com/vava-nessa).

Created and maintained by [Vanessa Depraute](https://vanessadepraute.dev).

---

<p align="center">
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-features">Features</a> ·
  <a href="#-cli-commands">CLI</a> ·
  <a href="#-ai-agent-integration">AI Agents</a>
</p>
