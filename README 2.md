# kandown

A file-based kanban engine backed by plain markdown. Zero backend, zero database, AI-agent friendly.

## Why

Most kanban tools trap your data in their cloud. `kandown` is the opposite: everything lives as markdown in your repo, diff-able with git, readable in any text editor, and parseable by AI agents.

The architecture splits index from details: `board.md` is a lightweight index (under 1k tokens even with 100+ tasks), and each task has its own file in `tasks/`. This means AI agents read a cheap index first and only fetch full task details on demand, instead of ingesting your entire backlog.

## Install

```bash
cd my-project
npx kandown init
```

This creates a `.kanban/` directory with:

```
.kanban/
├── kanban.html       # the engine (single file, no deps)
├── board.md          # task index and state
├── tasks/            # per-task markdown files
├── AGENT.md          # conventions for AI agents
└── README.md
```

It also appends a reference to `AGENTS.md` / `CLAUDE.md` (or creates one) so your AI tools know where to look.

## Use

Open `.kanban/kanban.html` in Chrome, Edge, Brave or Opera. Select the `.kanban/` folder when prompted. You're done.

## Features

- **File-over-app**: plain markdown on disk, git-diffable, editable without the app
- **AI-agent optimized**: lightweight index separate from full task details
- **Drag & drop** between columns with smooth spring physics
- **Subtasks** with live progress bars
- **Command palette** (⌘K) for fuzzy task search and quick actions
- **Board & list views** (⌘1 / ⌘2)
- **Recent projects** remembered via IndexedDB
- **Optimistic UI** with automatic rollback on write failures
- **Zero install**, zero backend, zero account

## Keyboard shortcuts

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
npx kandown init              # create .kanban/ here
npx kandown init --path docs/tasks
npx kandown init --no-agents  # skip AGENTS.md integration
npx kandown update            # update kanban.html to latest version
```

## Browser support

Requires the File System Access API. Chrome, Edge, Brave, Opera. Firefox and Safari don't support it yet.

## Format

### board.md

```markdown
---
kanban: v1
columns: [Backlog, Todo, In Progress, Done]
---

# Project Kanban

## Todo

- [ ] **[t-001]** Short title (2/4) → [détails](tasks/t-001.md) `#backend` `#p1` `@chacha`
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

## License

MIT
