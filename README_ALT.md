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

This creates a `.kandown/` folder with:

```
.kandown/
├── kandown.html      # Single-file web app
├── kandown.json      # Project config (columns, appearance)
├── tasks/            # One .md file per task
└── AGENT.md          # AI-agent quick reference
```

### Launch the board

```bash
kandown
```

This opens:
- A **web UI** in your browser (board view, list view, task editor)
- A **terminal TUI** for keyboard-driven workflow (works over SSH, no browser needed)

### CLI Commands

| Command | Description |
|---|---|
| `kandown` | Launch web UI + board TUI |
| `kandown init` | Initialize in current project |
| `kandown board` | TUI only (no browser) |
| `kandown settings` | Terminal settings editor |
| `kandown update` | Update `kandown.html` to latest |
| `kandown help` | CLI help |

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
pnpm dev          # Web UI at localhost:5173
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

## License

[MIT](LICENSE) — use it, fork it, ship it.

---

<p align="center">
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-features">Features</a> ·
  <a href="#-cli-commands">CLI</a> ·
  <a href="#-ai-agent-integration">AI Agents</a>
</p>
