# Changelog

## 0.1.1 — 2026-04-19 — "Release Pipeline"

- Added pre-release warning banner in README.
- Fixed `package.json` bin path and repository URL normalization (`npm pkg fix`).
- Added GitHub Actions workflow for automated npm publishing on version tags.
- Added version name system and changelog-in-commit-body requirement to bump instructions.

## 0.1.0 — 2026-04-19 — "Pre-Alpha"

First release. File-based Kanban engine backed by plain markdown — zero backend, zero database, no account, AI-agent friendly.

### Core

- Task files (`tasks/*.md`) are the single source of truth — title, status, order, priority, tags, assignee, subtasks, notes, and completion reports all live in one markdown file per task.
- Board columns derived from task frontmatter `status` field, with custom columns stored in `kandown.json`.
- Unknown task statuses appear as temporary columns in the UI until explicitly added to settings.
- Drag-and-drop between columns with optimistic file writes and automatic rollback on failure.
- Reorder tasks within a column by drag.
- Task drawer for editing title, metadata fields, subtasks, and body content with 150ms debounced autosave.
- Subtask progress tracking on board cards (checkbox count).
- Guarded card deletion — hover trash icon, first click arms, second click confirms.
- Keyboard shortcut `⌘⌫` / `Ctrl+Backspace` to delete current task from the drawer after confirmation.

### Web Application

- Single-file web app (`kandown.html`) built with React 19, Vite, Tailwind CSS, and Zustand.
- Uses the browser File System Access API — no server needed, works offline.
- Board view and list view, toggled with `⌘1` / `⌘2`.
- Command palette (`⌘K`) for quick actions and task search.
- Content search across titles, IDs, task body, subtasks, tags, assignee, and priority with highlighted preview snippets on cards.
- Owner type filtering (human vs AI-agent tasks).
- Filter bar with search input, active chips, and clear action.
- Recent projects stored in IndexedDB for quick reopening.
- Animated task counts with spring transitions.

### Appearance

- Project-level theme modes: `auto` (follows system), `light`, `dark`.
- 5 built-in skins: Kandown (default), Graphite, Sage, Cobalt, Rose — all using shadcn-compatible CSS tokens.
- 5 font presets: Inter, System, Serif, Mono, Rounded.
- Column color accents with expanded translucent backgrounds including black variants.
- Cards blend into colored columns (50% white in light mode, 50% black in dark mode).
- Tabler icons on board column headers for status visual scanning.

### Settings

- Dense settings sidebar with search, compact controls, and contextual hover help.
- Configurable task metadata fields (priority, assignee, tags, due date, owner type, tools) — disabled fields hide across drawer, cards, list view, and filters.
- Configurable notifications: browser alerts, in-page sound cues, status-change alerts, debounced edit alerts, subtask-completion alerts.

### Internationalization

- 33+ languages supported, including: English, French, Chinese, Japanese, Korean, Spanish, Portuguese, German, Italian, Russian, Arabic, Hindi, Thai, Malay, Tamil, Telugu, and more.
- Localized UI labels, settings descriptions, and filter controls.

### CLI

- `npx kandown init` — scaffolds `.kandown/` with web app, config, templates, and AI-agent documentation.
- `npx kandown` — starts a zero-dependency local HTTP server + opens the browser + launches the board TUI.
- `npx kandown board` — interactive kanban board TUI only (Ink / React for terminals).
- `npx kandown update` — replaces installed `kandown.html` with latest package build.
- `npx kandown settings` — terminal settings editor for `kandown.json`.
- Automatic port fallback from 2048 to 2060, or `--port <n>` for a specific port.
- `--path`, `--force`, `--no-agents` init flags.

### Board TUI

- Full-screen terminal kanban built with Ink — renders the same columns and tasks as the web UI.
- Vim-style navigation (`h/j/k/l`) and arrow keys.
- Task detail view with scrollable content (`Enter`).
- Agent picker (`a` key) — auto-detects installed AI agents (Claude Code, Codex, Gemini CLI, Goose, Aider, OpenCode).
- Sets task to "In Progress" and injects system prompt from `AGENT_KANDOWN_COMPACT.md`.
- tmux integration: opens agent in a split pane if inside tmux, otherwise hands over the terminal.

### AI-Agent Integration

- `AGENT_KANDOWN.md` — full agent instructions shipped with `kandown init`, teaches AI agents how to create, move, and complete tasks.
- `AGENT_KANDOWN_COMPACT.md` — condensed version injected into CLI agent prompts.
- Task files designed for AI readability — one file per task, frontmatter-based state, no index synchronization needed.

### Infrastructure

- GitHub Actions workflow for automated npm publishing on version tags (`v*`).
- Annotated release tags with version names.
- Changelog-based GitHub Releases.
