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
  <img src="https://img.shields.io/badge/languages-48-purple" alt="48 languages">
  <img src="https://img.shields.io/badge/local--first-100%25-orange" alt="100% local-first">
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-features">Features</a> ·
  <a href="#-cli-commands">CLI</a> ·
  <a href="#-board-tui">Board TUI</a> ·
  <a href="#-ai-agent-integration">AI Agents</a> ·
  <a href="#-keyboard-shortcuts">Shortcuts</a> ·
  <a href="#-development">Development</a>
</p>

---

## 🚀 Quick Start

### 1. Install globally

```bash
npm i -g kandown
```

### 2. Initialize in any project

```bash
cd my-project
kandown init
```

### 3. Launch your board

```bash
kandown
```

> That's it. A local web UI opens in your browser, and an interactive board TUI appears in your terminal. All your data stays in `.kandown/` as plain markdown — versioned with git, readable by humans and AI agents alike.

---

## 💡 Why Kandown?

Most kanban tools trap your data in their cloud. Kandown does the opposite.

| Traditional Kanban | Kandown |
|---|---|
| ☁️ Cloud-hosted, needs an account | 📁 100% local, no account |
| 🔒 Proprietary data format | 📝 Plain Markdown + JSON |
| 💰 Paid plans for teams | 🆓 Free & open-source (MIT) |
| 🤖 No AI integration | 🤖 AI-agent native (Claude, Codex, Gemini…) |
| 🔄 Requires sync/internet | 📂 Git-diffable, offline-first |
| 🏗️ Backend, database, infra | 🚫 Zero backend, zero dependencies |

**Your tasks are just `.md` files.** Move them, `grep` them, edit them in Vim, let an AI agent process them — they're yours.

---

## 📦 What Gets Installed

Running `kandown init` creates a `.kandown/` folder in your project:

```
.kandown/
├── kandown.html      ← Single-file web app (opens in any browser)
├── kandown.json      ← Project preferences, columns, appearance
├── tasks/            ← One markdown file per task (source of truth)
├── AGENT.md          ← AI-agent quick reference
└── README.md         ← Project-local user guide
```

It also copies `AGENT_KANDOWN.md` to the project root and wires it into your `AGENTS.md` / `CLAUDE.md` so AI agents know how to manage your board automatically.

---

## ✨ Features

### Board & Views

| Feature | Description |
|---|---|
| 🗂️ Board view | Horizontal kanban with drag-and-drop between columns |
| 📋 List view | Dense table-like view with the same filters & search |
| 🔍 Content search | Search titles, body, subtasks, tags, assignee, priority — with highlighted previews |
| ⌨️ Command palette | `⌘K` / `Ctrl+K` for quick actions and task lookup |
| 🏷️ Custom columns | Add, rename, delete columns — unknown statuses appear as temp columns |
| 🗑️ Guarded deletion | Double-click the trash icon to delete — no accidental losses |

### Task Management

| Feature | Description |
|---|---|
| ✏️ Rich task drawer | Edit title, metadata, subtasks, and body via WYSIWYG markdown editor |
| ☑️ Subtasks | Full checklist support with progress tracking on cards |
| 📊 Metadata fields | Priority, assignee, tags, due date, owner type — toggle each on/off |
| 👤 Owner filtering | Separate human tasks from AI-agent tasks |
| ⚡ External-change detection | Warns when a file was modified outside the app (Reload / Overwrite / Cancel) |

### Appearance & UX

| Feature | Description |
|---|---|
| 🎨 5 built-in skins | Kandown, Graphite, Sage, Cobalt, Rose |
| 🌗 Theme modes | Auto, Light, Dark |
| 🔤 5 font stacks | Inter, System, Serif, Mono, Rounded |
| 🌊 Animated backgrounds | WebGL fluid simulation (LiquidEther) |
| 🔔 Notifications | Browser + in-page sound alerts for status changes, edits, subtask completions |
| 🌍 48 languages | Full i18n support |
| 📌 Recent projects | Stored in IndexedDB for quick reopening |

---

## 🖥️ CLI Commands

### Usage

```bash
# If installed globally (recommended):
kandown [command] [options]

# Or with npx (no install needed):
npx kandown [command] [options]
```

### Commands

| Command | Description |
|---|---|
| `kandown` | Launch web UI + board TUI (recommended daily workflow) |
| `kandown init` | Initialize Kandown in the current project |
| `kandown board` | Open the board TUI only (no browser) |
| `kandown settings` | Open the terminal settings editor |
| `kandown update` | Update `kandown.html` to the latest version |
| `kandown help` | Print CLI help |

### Init Options

| Flag | Description |
|---|---|
| `--path <dir>` | Install `.kandown` at a custom location |
| `--force` | Overwrite existing installation |
| `--no-agents` | Skip AI agent docs setup |

### Serve Options

| Flag | Description |
|---|---|
| `--port <number>` | Use a specific port (default: auto-scan 2048–2060) |

---

## 📟 Board TUI

The board TUI is a full-screen terminal kanban built with [Ink](https://github.com/vadimdemedes/ink). Same columns and tasks as the web UI — plus the ability to launch AI agents on any task.

```
  KANDOWN  tmux  My Project
  ──────────────────────────────────────────────────────────────
  Backlog (3)   │ Todo (2)     │ In Progress  │ Review (1) │ Done
  ──────────────│──────────────│──────────────│────────────│──────
  ▸ t9         │ t16         │ (empty)      │ t18       │ ...
    t10        │ t7          │              │
    t11        │              │
```

### TUI Navigation

| Key | Action |
|---|---|
| `h` / `l` or `←` / `→` | Move between columns |
| `j` / `k` or `↑` / `↓` | Move between tasks |
| `Enter` | Open task detail (scrollable) |
| `a` | Launch AI agent picker |
| `r` | Reload files from disk |
| `q` / `Esc` | Quit or go back |

---

## 🤖 AI Agent Integration

Press `a` in the board TUI to launch an AI agent on the selected task. Kandown auto-detects installed agents and builds a context-rich prompt from `AGENT_KANDOWN.md` + the task file.

### Supported Agents

| Agent | Binary | Launch mode |
|---|---|---|
| **Claude Code** | `claude` | Interactive session with initial prompt |
| **OpenAI Codex** | `codex` | Interactive session |
| **Gemini CLI** | `gemini` | `-p` flag for initial prompt |
| **Goose** | `goose` | `run --text` for non-interactive |
| **Aider** | `aider` | `--message` for initial prompt |
| **OpenCode** | `opencode` | TUI, context written to `/tmp` |

### How it works

1. Selecting an agent sets the task status to **In Progress**
2. A system prompt is built from `AGENT_KANDOWN.md` + the task file
3. Context is written to `/tmp/kandown-<id>-context.md`
4. **In tmux**: opens in a 50%-wide split pane (TUI stays visible)
5. **Without tmux**: exits TUI and hands the terminal to the agent

> **Tip:** AI agents can also edit task files directly — Kandown detects external changes and syncs automatically.

---

## ⌨️ Keyboard Shortcuts

### Web UI

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘1` / `Ctrl+1` | Board view |
| `⌘2` / `Ctrl+2` | List view |
| `N` | New task |
| `R` | Reload from disk |
| `/` | Focus search |
| `Esc` | Close drawer / palette |
| `⌘S` / `Ctrl+S` | Save task in drawer |
| `⌘⌫` / `Ctrl+Backspace` | Delete task (with confirmation) |

---

## 📄 Data Model

### Task files — `tasks/<id>.md`

Each task is a standalone markdown file with YAML frontmatter:

```markdown
---
id: t1
title: Implement user auth
status: Todo
order: 0
priority: P1
tags: [backend, security]
assignee: chacha
created: 2026-04-10
ownerType: human
---

# Implement user auth

## Context
Why this task exists and what it solves.

## Subtasks
- [ ] Set up OAuth provider
- [x] Create user model
- [ ] Add session middleware

## Notes
Extra details, links, decisions.
```

### Configuration — `kandown.json`

<details>
<summary>Full default configuration</summary>

```json
{
  "ui": {
    "language": "en",
    "theme": "auto",
    "skin": "kandown",
    "font": "inter"
  },
  "agent": {
    "suggestFollowUp": false,
    "maxSuggestions": 3
  },
  "board": {
    "taskPrefix": "t",
    "defaultPriority": "P3",
    "defaultOwnerType": "human"
  },
  "fields": {
    "priority": false,
    "assignee": false,
    "tags": false,
    "dueDate": false,
    "ownerType": false,
    "tools": false
  },
  "notifications": {
    "browser": false,
    "sound": false,
    "soundId": "soft",
    "statusChanges": true,
    "taskEdits": true,
    "subtaskCompletions": true,
    "editDebounceMs": 2000
  }
}
```

</details>

| Section | Key options |
|---|---|
| `ui` | Language (48 locales), theme mode, skin, font |
| `board` | Task ID prefix, default priority/owner |
| `fields` | Toggle visibility of priority, assignee, tags, due date, owner type |
| `notifications` | Browser alerts, sound cues, debounce timing |

Disabled fields are hidden from cards, list view, the task drawer, and metadata filters.

---

## 🌐 Browser Support

| Browser | Supported |
|---|---|
| Chrome | ✅ |
| Edge | ✅ |
| Brave | ✅ |
| Opera | ✅ |
| Firefox | ❌ (no File System Access API) |
| Safari | ❌ (no File System Access API) |

> **Server mode** (`kandown` CLI command) works in all browsers — it proxies file operations through a local REST API, bypassing the File System Access API requirement.

---

## 🎨 Appearance

### Skins

| Skin | Description |
|---|---|
| `kandown` | Crisp neutral default |
| `graphite` | Soft gray surfaces |
| `sage` | Calm green-gray planning palette |
| `cobalt` | Cool blue accent, restrained surfaces |
| `rose` | Warm ink with rose accent |

### Theme Modes

| Mode | Behavior |
|---|---|
| `auto` | Follows system `prefers-color-scheme` |
| `light` | Force light theme |
| `dark` | Force dark theme |

### Fonts

| Font | Stack |
|---|---|
| `inter` | Inter-first sans stack |
| `system` | Native platform sans stack |
| `serif` | Editorial serif stack |
| `mono` | Monospace stack |
| `rounded` | Rounded system stack |

---

## 🛠️ Development

### Setup

```bash
git clone https://github.com/vava-nessa/kandown.git
cd kandown
pnpm install
pnpm dev          # Web UI at localhost:5173
```

### Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Vite dev server for the web UI |
| `pnpm dev:cli` | Watch-mode build for the CLI TUI |
| `pnpm build` | Full build: typecheck → web app → CLI TUI |
| `pnpm build:cli` | One-shot CLI TUI build |
| `pnpm preview` | Preview the Vite production build |
| `pnpm typecheck` | TypeScript check without emitting |

### Dev Workflow (CLI / TUI)

```bash
# Terminal 1 — watch and rebuild on save
pnpm dev:cli

# Terminal 2 — test the board TUI
node bin/kandown.js board

# Or full experience (web server + browser + TUI):
node bin/kandown.js --port 3000
```

### Build Output

| File | Purpose |
|---|---|
| `dist/index.html` | Single-file web app → copied as `kandown.html` |
| `bin/tui.js` | Bundled Ink TUI → used by `kandown board` and `kandown settings` |

---

## 🏗️ Architecture

<details>
<summary>Project structure</summary>

```
kandown/
├── bin/
│   ├── kandown.js          # CLI entrypoint (hand-rolled, no deps)
│   └── tui.js              # Generated TUI bundle (tsup)
├── src/
│   ├── App.tsx             # Web app shell + global shortcuts
│   ├── main.tsx            # React/Vite browser entrypoint
│   ├── cli/                # Ink terminal UI source
│   │   ├── tui.tsx         # Ink entrypoint (alternate screen buffer)
│   │   ├── app.tsx         # TUI screen router
│   │   ├── lib/            # Node-side helpers (config, board, agents, launcher)
│   │   └── screens/        # board.tsx, agent-picker.tsx, settings.tsx
│   ├── components/         # React UI components (web)
│   ├── hooks/              # React hooks
│   ├── lib/                # Domain model, parser, serializer, store, theme, i18n
│   └── styles/             # Tailwind layers + CSS tokens
├── templates/              # Files copied by `kandown init`
├── dist/index.html         # Generated single-file web app
├── vite.config.ts
├── tsup.config.ts
└── package.json
```

</details>

<details>
<summary>Runtime flow</summary>

1. `main.tsx` mounts the React app
2. `App` renders header + board / list / settings / empty state
3. User selects a folder → File System Access API (or server mode)
4. `filesystem.ts` resolves `.kandown/`, `tasks/`, `kandown.json`
5. `store.ts` loads config, applies theme, scans tasks, saves recent project handles
6. `parser.ts` converts task markdown into typed data
7. Mutations flow back through store → `serializer.ts` → `filesystem.ts`

</details>

<details>
<summary>Key modules</summary>

| Module | Role |
|---|---|
| `src/lib/store.ts` | Zustand state machine — project loading, board mutations, drawer, search, config |
| `src/lib/filesystem.ts` | File System Access API + IndexedDB helpers |
| `src/lib/parser.ts` | Markdown parsing, subtask extraction, content search |
| `src/lib/serializer.ts` | Markdown serialization |
| `src/lib/theme.ts` | Theme engine — skins, fonts, CSS variables |
| `src/lib/watcher.ts` | 500ms polling watcher with SHA-256 hashing for external change detection |
| `src/lib/i18n/index.ts` | 48-locale translation system |

</details>

---

## 📐 Design Constraints

- **Local-first, backend-free** — no servers, no sync vendors
- **Markdown is the canonical data format** — always human-readable
- **Task files are the single source of truth** — no index files to sync
- **Single-file web app** — `kandown.html` bundles everything
- **Project config in `kandown.json`** — columns, appearance, fields, notifications
- **Browser state in IndexedDB** — only for convenience (recent project handles)

---

## 📜 License

[MIT](LICENSE) — use it, fork it, ship it.
