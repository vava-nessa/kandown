# Changelog

## 0.4.0 — 2026-05-04 — "CLI Launch Fix"

- **Added**: BlockNote now powers task description editing with a markdown-native schema and anti-pollution guards.
- **Added**: Syntax-highlighted code blocks in the BlockNote editor.
- **Added**: Premium semantic design system updates, refreshed header components, and Cobalt as the default skin.
- **Added**: Tags now render with strikethrough when every task using that tag is Done.
- **Fixed**: `kandown` server mode no longer injects `window.__KANDOWN_ROOT__` into bundled JavaScript when parser strings contain literal `</head>`.
- **Fixed**: Single-file HTML builds now repair escaped regex lookbehind openers from inlined Shiki grammars, preventing browser syntax crashes on launch.
- **Fixed**: Dark-mode readability across UI components and BlockNote code blocks.
- **Changed**: Component styling now consistently uses semantic color variables.
- **Changed**: Embed output was simplified for cleaner markdown.
- **Removed**: Obsolete placeholder project-board tasks.

## 0.3.5 — 2026-04-25 — "Server Mode Task CRUD Fix"

- **Fixed**: Task creation, deletion, drawer save, and board reload now work in server mode (`kandown` CLI) — all mutations go through the REST API instead of requiring `tasksDirHandle`.
- **Changed**: Server-mode store actions no longer require `tasksDirHandle` — they pass `null` to `filesystem.ts` helpers which bypass it when `isServerMode()` is true.
- **Changed**: `moveTask` and `reorderInColumn` skip file persistence in server mode (full reload handles sync).
- **Added**: `readAllTasksServer()` — reads all tasks via the REST API for board reload in server mode.
- **Changed**: README now strongly recommends `npm install -g kandown` over `npx`.

## 0.3.4 — 2026-04-25 — "Browser Ready Check"

- **Fixed**: `openInBrowser()` now waits up to 2s for the server to be ready (via HTTP HEAD probe) before opening the URL, preventing `ERR_UNSAFE_PORT` and race conditions when multiple instances start simultaneously.
- **Fixed**: Port range scan improved — always starts from 2048 when no explicit port is set.

## 0.3.3 — 2026-04-25 — "Auto-update Loop Fix"

- **Fixed**: Auto-update now spawns the newly installed global binary directly (via `npm prefix`), preventing `npx` from re-resolving the old cached version and causing an infinite update loop.
- **Fixed**: `npx kandown` now auto-refreshes `kandown.html` on every serve, so CLI upgrades propagate to the web UI without needing a separate `kandown update`.

## 0.3.0 — 2026-04-25 — "Server Mode"

- **Added**: Full REST API server in `bin/kandown.js` for all file operations (`GET/PUT /api/config`, `/api/board`, `/api/tasks`, `/api/tasks/:id`)
- **Added**: `src/lib/filesystem.ts` server-mode helpers that proxy all file operations to the CLI REST API via `fetch()`
- **Added**: `openServerProject()` store action — auto-loads the project on mount with zero user interaction when served via `npx kandown`
- **Added**: `isServerMode()` detection and `getServerRoot()` path accessor
- **Changed**: Board now renders when `isOpen` is true (server mode) OR `dirHandle` is set (file mode)
- **Changed**: CLI HTTP server routes `/api/*` to `handleApi()` with full CRUD for config, board, and tasks
- **Changed**: EmptyState shows loading spinner during server-mode auto-load, then a passive message (no button needed)
- **Fixed**: Command palette is now exactly centered in the middle of the screen
- **Fixed**: When a new task is created, the title and description are now empty by default, and the editor drawer opens natively focusing the title

## 0.2.3 — 2026-04-20 — "EmptyState Server Mode Fix"

- **Fixed**: When served via `npx kandown`, the web app now detects server mode and shows a contextual "Open this project" button instead of the generic select-folder UI. User grants folder access once, browser remembers it for next time.

## 0.2.2 — 2026-04-20 — "Header Version Badge"

- **Added**: Version badge (`v0.2.2`) displayed in red in the web app header, top-left, next to the logo.

## 0.2.1 — 2026-04-20 — "Auto-Open Fix"

- **Fixed**: `npx kandown` now auto-opens the correct project in the web UI instead of showing the empty "Select a project" screen. The CLI injects `window.__KANDOWN_ROOT__` and the app tries to match it against previously granted folder permissions on mount.

## 0.2.0 — 2026-04-20 — "Version Display + Auto-Update"

- **Added**: `kandown -v` / `--version` flag — prints the current CLI version.
- **Added**: Version displayed in CLI help banner, TUI settings header, and web app Settings "About" section.
- **Added**: Web app Settings now has an "About" section showing current version and a manual update check against the npm registry.
- **Changed**: CLI auto-update now runs before **every** command (not just `kandown` with no args). If a new version is found, runs `npm install -g kandown` and respawns — no prompt, no ask.
- **Changed**: `kandown help` shows the current version in the banner.
- **Added**: Bracket tags (e.g. `[optimization]`) in task titles are now rendered bold next to the task ID on board cards.
- **Added**: `scripts/inject-version.js` — generates `src/lib/version.ts` at build time from `package.json` version. `package.json` is the single source of truth for version.

## 0.1.5 — 2026-04-20 — "Live Reload + Auto-Update"

- **Added**: CLI checks for a newer npm version on startup (non-blocking, background check). Warns if the user is outdated.
- **Added**: Live file watching in the TUI — board auto-reloads when task files or `kandown.json` change. No need to press `r`.
- **Changed**: `npx kandown` now auto-inits `.kandown/` if not found — zero manual setup required.
- **Fixed**: TUI crashed on fresh install with `Cannot find package 'react-devtools-core'`.
- **Fixed**: TUI crashed with `Dynamic require of "assert" is not supported` in Node.js ESM context.
- **Fixed**: `self is not defined` error — added self/window polyfills and `DEV=false` to prevent Ink from loading react-devtools-core.
- Added `chokidar` and `signal-exit` as explicit runtime dependencies.

## 0.1.3 — 2026-04-20 — "CLI Launch Fix"

- **Fixed**: TUI crashed on fresh install with `Cannot find package 'react-devtools-core'` — promoted `react-devtools-core` from optional peer dep to regular dependency so npm installs it for users.

## 0.1.2 — 2026-04-19 — "Zero Deps"

- **Fixed**: `npx kandown init` was hanging because npm had to install 11 runtime dependencies (React, Three.js, Ink, etc.) before running the CLI. All dependencies are now bundled into the CLI binary — the published package has zero runtime deps.
- Moved all dependencies to devDependencies — the web app and TUI are fully pre-built.
- Added auto-bump rule to AGENTS.md for critical bug fixes.

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
