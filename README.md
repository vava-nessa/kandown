# Kandown

A file-based Kanban engine backed by plain markdown. Zero backend, zero database, AI-agent friendly.

## Why

Most kanban tools trap your data in their cloud. `kandown` is the opposite: everything lives as markdown in your repo, diff-able with git, readable in any text editor, and parseable by AI agents.

The architecture splits index from details: `board.md` is a lightweight index (under 1k tokens even with 100+ tasks), and each task has its own file in `tasks/`. This means AI agents read a cheap index first and only fetch full task details on demand, instead of ingesting your entire backlog.

## Install & Use

If Kandown is published on npm:

```bash
cd my-project
npx kandown init
```

This creates a `.kandown/` directory with:

```
.kandown/
├── kandown.html       # the engine (single file, no deps)
├── board.md          # task index and state
├── tasks/            # per-task markdown files
├── AGENT.md          # conventions for AI agents
└── README.md
```

It also appends a reference to `AGENTS.md` / `CLAUDE.md` (or creates one) so your AI tools know where to look.

To use the board: Open `.kandown/kandown.html` in Chrome, Edge, Brave, or Opera. Select the `.kandown/` folder when prompted. You're done!

## Features

- **File-over-app**: Plain markdown on disk, git-diffable, editable without the app.
- **AI-agent optimized**: Lightweight index separate from full task details, owner type tracking.
- **Owner type filtering**: Filter board by human tasks vs AI tasks.
- **Modern UI & UX**:
  - Drag & drop between columns with smooth spring physics.
  - Subtasks with live animated progress bars.
  - Command palette (⌘K) with fuzzy task search and quick actions.
  - Board & list views (⌘1 / ⌘2).
  - Density toggle (compact/comfortable).
  - Glassmorphism on drawer and palette, subtle grid + noise overlay, priority edge indicator.
  - Layout animations using Motion, stagger entrance of columns.
- **Robust Architecture**:
  - Multi-projects remembered via IndexedDB (up to 10 recent projects).
  - Optimistic UI with automatic rollback on write failures.
  - Built with React 19, Motion 12, Tailwind 3, Vite 6, Zustand 5.
- **Zero install**, zero backend, zero account.

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `⌘K` | Command palette |
| `⌘1` / `⌘2` | Board / list view |
| `N` | New task |
| `R` | Reload |
| `/` | Focus search |
| `Esc` | Close drawer |
| `⌘S` | Save current task |

## CLI

```bash
npx kandown init              # create .kandown/ here
npx kandown init --path docs/tasks
npx kandown init --no-agents  # skip AGENTS.md integration
npx kandown update            # update kandown.html to latest version
```

## Browser Support

Requires the File System Access API. Supported in Chrome, Edge, Brave, and Opera. Firefox and Safari don't support it yet.

## Format

### board.md

```markdown
---
kanban: v1
columns: [Backlog, Todo, In Progress, Done]
---

# Project Kanban

## Todo

- [ ] **[t-001]** Short title (2/4) → [details](tasks/t-001.md) `#backend` `#p1` `@chacha`
```

### tasks/t-xxx.md

```markdown
---
id: t-001
title: Full task title
status: Todo
priority: P1
tags: [backend, security]
assignee: chacha
created: 2026-04-10
---

# Task title

## Context

Background, links, decisions.

## Subtasks

- [ ] First step
- [x] Second step

## Notes

Additional information.
```

## Development

If you'd like to work on Kandown itself, here's how the repository is structured:

```text
kandown/
├── bin/kandown.js          # CLI for `npx kandown init`
├── src/
│   ├── components/         # React components (Card, Drawer, CommandPalette, etc.)
│   ├── lib/                # Parser, serializer, filesystem, Zustand store
│   ├── hooks/
│   ├── styles/globals.css
│   ├── App.tsx
│   └── main.tsx
├── templates/              # board.md, AGENT.md, README.md, tasks/t-001.md
├── dist/index.html         # Pre-built artifact
├── package.json
└── ...
```

### Local Setup

```bash
# Install dependencies
pnpm install

# Start development server with hot reload
pnpm dev

# Build the project (regenerates dist/index.html)
pnpm build
```

### Publishing

```bash
# 1. IMPORTANT: Always build before publishing to generate the latest single-file app
pnpm build

# 2. Login to npm
npm login

# 3. Publish
npm publish --access public
```

*Note: The `.npmignore` ensures that only `dist/`, `bin/`, `templates/`, `README.md`, and `LICENSE` are published to the registry, keeping the package clean and small.*

## License

MIT
