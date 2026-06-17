# Changelog

## 0.11.1 — 2026-06-17 — "TUI Category Cards"

- **Changed**: TUI board now renders tasks with a `[category]` bracket tag or `#hashtag` in their title as a **3-line dark-gray block**: task ID on line 1, category on line 2, clean title on line 3. Tasks without a category render as a single line, unchanged. A separator line (`───`) is inserted between all tasks for improved readability.
- **Added**: New `CategoryTaskRow` component for the 3-line category block; `SingleTaskRow` preserves the original single-line layout for untagged tasks.
- **Added**: `getTitleCategory()` helper — extracts bracket tags and hashtags from task titles to determine which row type to use.
- **Changed**: `KanbanColumn` now dynamically selects the row component per task and injects separator lines automatically.
- **Changed**: Dragging state colors (`yellow` background) now apply to the entire `CategoryTaskRow` block consistently.

## 0.11.0 — 2026-06-16 — "Lean Drawer"

- **Removed**: The subtask editor in the task drawer (add/remove/check subtasks and the per-subtask description/report fields). The subtask data model is untouched — tasks still keep their `- [ ]` / `- [x]` checklist in the .md file, and the per-card progress bar on the board still shows `done/total`. Editing subtasks just happens in the task file directly now, not in the drawer.
- **Changed**: The drawer body is now strictly stacked: title → DESCRIPTION (full width) → REPORT (full width, below description). The previous side-by-side 7/3 grid is gone, so each editor gets full room to breathe and feels closer to a writing surface than a form.
- **Removed**: The header subtask count chip (`done/total doneSubtasks`) — no more subtasks in the drawer header.
- **Removed**: The `focusedSubtaskIdx` state and the `toggleSubtask` / `changeSubtask` / `removeSubtask` / `addSubtask` / `insertSubtaskAfter` / `handleDescriptionChange` / `handleReportChange` handlers — all dead code now that the subtask editor is gone. The `SubtaskItem` import is gone too (the component file is left in the tree since the data model still uses `Subtask`).

## 0.10.1 — 2026-06-16 — "Clean Drawer"

- **Removed**: The metadata edit block (Priority, Assignee, Tags, Due, Owner, Tools) at the top of the task editor drawer. The drawer is now strictly title + description + report + subtasks. Frontmatter metadata is still managed in the task `.md` file directly, or surfaced on the board via the per-card "Show metadata" toggle. The unused `FieldRow` helper, the `tagsValue` derived string, the `Priority`/`OwnerType` type imports, and the `fields` selector are gone too.

## 0.10.0 — 2026-06-16 — "Linear Look"

- **Changed**: The board got a full Linear-style relook — pure black background in dark mode, off-white in light, with a refined two-layer dot grid (the "taches") that adapts to the theme. Default columns are now neutral; any per-column tints you set via the 3-dot menu use a restrained 6% opacity.
- **Changed**: The default "kandown" skin is rebuilt around Linear tokens — pure black background (`0 0% 0%`), cards at `0 0% 6%` with very subtle borders in dark; off-white background with white cards in light. The 4 colored skins (Graphite, Sage, Cobalt, Rose) were also retuned to match — darker bases, more restrained hues.
- **Changed**: Cards and card stacks are now `rounded-lg` with a lighter, hand-tuned shadow that lifts on hover. No more heavy `shadow-sm/md` defaults.
- **Changed**: Column headers are tighter and more refined — smaller icons, lighter typography, more breathing room. The Add task button at the bottom of each column blends in better.
- **Removed**: The SVG noise-overlay grain (Board + EmptyState + CSS) — it was making the board feel noisy and the CSS class is gone.
- **Fixed**: The `class="dark"` attribute was hardcoded in `index.html`, blocking the `theme: "auto"` mode from working. The hardcoded class is removed so the OS preference drives the theme.
- **Fixed**: `kandown.json` is now set to `theme: "auto"` and `columnColors: {}` by default, so a fresh install starts in Linear neutral mode without the previously-saved saturated column tints.

## 0.9.0 — 2026-06-16 — "Archive & Markdown"

- **Added**: Archive folder and view — tasks can now be archived via a button in the drawer, which moves the file to `.kandown/tasks/archive/`, sets `archived: true` in the frontmatter, and hides it from the active board. A new header button toggles a dedicated Archive view listing all archived tasks with a one-click Restore action.
- **Added**: `archive` and `restore` actions on the store, plus matching CLI server endpoints (`POST /api/tasks/:id/archive` and `…/unarchive`) and dev-mode vite middleware routes so the feature works in browser and server modes.
- **Changed**: Unified markdown editor across the drawer — the task Report field and all subtask descriptions/reports now use the same BlockNote editor as the task description body, with the same slash menu, block types, and markdown round-trip guarantees. Wysimark and its `marked`-based preview have been removed entirely.
- **Removed**: `src/components/ui/MarkdownEditor.tsx` (Wysimark), all wysimark CSS rules, and the `@wysimark/react` + `marked` dependencies.
- **Fixed**: Legacy subtask `report:` / `description:` indented lines are now recognized by `extractSubtasks` and migrated to the canonical `[REPORT]` / `[DESC]` markers on the first open+save. Previously these lines were silently dropped on save, causing silent loss of subtask reports in older task files.
- **Fixed**: YAML block scalar serializer no longer pads truly empty lines with two spaces, so the frontmatter `report: |` block stays byte-stable across open/save round-trips (no cosmetic git diff noise).

## 0.8.0 — 2026-06-04 — "Project Daemon"

- **Added**: Per-project web daemon — `kandown` now starts/reconnects a background server by default so the browser keeps working after quitting the TUI.
- **Added**: `kandown daemon start|stop|status` commands for explicit daemon lifecycle control.
- **Added**: TUI daemon status and `d` shortcut to start/stop the current project's web daemon without leaving the board.
- **Changed**: The board TUI has a more colorful, user-friendly header, column accents, daemon status pill, and clearer status/hint area.
- **Changed**: New `.kandown/` installs ignore daemon runtime metadata via `.kandown/.gitignore`.
- **Fixed**: Restarting the daemon from the TUI preserves the last custom port used by the project.

## 0.7.5 — 2026-06-04 — "TUI Drag"

- **Added**: Real terminal drag-and-drop in the TUI board — press a task, drag over another column, and release to move it.
- **Fixed**: TUI rendering now uses Ink's managed alternate screen with a fixed-height root frame, preventing duplicated/glitchy scrollback redraws.
- **Fixed**: TUI mouse control sequences are now written through Ink's stdout helper and button-motion tracking is enabled for drag events.
- **Changed**: TUI board mouse handling now follows the Herdr-style press → drag → hover target → release commit flow while keeping click menus and keyboard moves as fallbacks.

## 0.7.4 — 2026-06-04 — "Move Sync"

- **Fixed**: Web drag-and-drop in CLI server mode now persists task moves to `tasks/*.md` instead of only updating optimistic UI state.
- **Fixed**: Web ↔ TUI sync after task moves — moved tasks now keep their new status after server polling reloads the board.
- **Changed**: Column order persistence now uses the shared filesystem adapter in both browser File System Access mode and CLI REST server mode.

## 0.7.3 — 2026-06-04 — "Port Reclaim"

- **Added**: Stale process detection — when `kandown` detects its preferred port (2048) is already occupied by another kandown process for the same project, it automatically kills the zombie and reclaims the port instead of silently moving to 2049.
- **Added**: Cross-project awareness — if the port is occupied by a kandown from a *different* project, the port is skipped and the next available port is used (no interference between projects).
- **Added**: Non-kandown processes on the target port are left untouched — only kandown zombies are auto-cleaned.
- **Changed**: `listenOnAvailablePort()` now includes a `detectStaleKandown()` pre-check that inspects the process command line and working directory before attempting to listen.

## 0.7.2 — 2026-06-04 — "Live Sync"

- **Fixed**: CLI TUI watcher — `persistent: true` removed (obsolete in chokidar v4, could prevent events), `stabilityThreshold` 50→25ms, `alwaysStat: true` added for reliable change detection.
- **Fixed**: CLI TUI polling fallback tightened from 500ms to 300ms for faster external change detection.
- **Fixed**: Web app `reloadBoard()` was a dead no-op in local File System Access API mode — `if (!isServerMode()) return;` blocked all watcher-driven refreshes. Added full local-mode path that reads from `FileSystemDirectoryHandle` and rebuilds the board.
- **Fixed**: Web app server mode (when served via `npx kandown`) had no file watcher at all — `setupWatcher()` was never called. Added REST API polling every 2 seconds so the board stays in sync with external edits.
- **Changed**: Browser-side `FileWatcher` polling interval 500→300ms, debounce delay 200→150ms for snappier sync.
- **Changed**: `openServerProject()` now calls `setupWatcher()` to activate server-mode polling on open.

## 0.7.1 — 2026-06-04 — "Mouse v2"

- **Fixed**: Complete rewrite of mouse support — no more stdin interception (fragile with Ink). Mouse sequences are now detected directly inside Ink's `useInput` handler.
- **Fixed**: Context menu now renders INLINE within the column, directly under the task that was clicked — not at a calculated global offset.
- **Fixed**: Mouse click detection now correctly accounts for Ink stripping the ESC prefix from sequences.
- **Added**: `m` key opens context menu on the focused task (full keyboard support for all mouse features).
- **Added**: `useMouseMode()` hook — simply enables terminal mouse tracking via ANSI codes, no stdin interception.
- **Added**: `parseMouseInput()` — parses SGR mouse coordinates from Ink's useInput `input` string.
- **Added**: `InlineContextMenu` component — compact 2-line menu rendered inside the column flow.
- **Changed**: Menu options navigable with j/k + Enter (same as all other TUI interactions).
- **Changed**: Header hint updates dynamically: shows mode-specific instructions (browse, context-menu, move-target).
- **Changed**: Version displayed in TUI header (auto-read from package.json).

## 0.7.0 — 2026-06-04 — "Mouse & Move"

- **Added**: Full mouse support in the TUI board — click on tasks, menus, and move placeholders using SGR extended mouse mode (\x1b[?1006h) with X10 fallback.
- **Added**: Context menu on task click — small, sober popup with "Open task" and "Move task" options (keyboard + mouse).
- **Added**: Move-task flow — select "Move task" from context menu, then click a yellow ↓ placeholder in any other column to move the task there (drag-and-drop alternative for TUI).
- **Added**: `useMouse` React hook (`src/cli/hooks/use-mouse.ts`) — enables terminal mouse tracking, parses SGR/X10 click events, passes keyboard data through to Ink.
- **Added**: `TaskContextMenu` component (`src/cli/components/task-context-menu.tsx`) — reusable inline popup with j/k/Enter/Escape + click support.
- **Added**: Version number displayed in TUI header next to KANDOWN logo (auto-read from package.json on every launch).
- **Added**: Move-target placeholder component with yellow highlight, keyboard navigation (←/→), and click-to-move.
- **Added**: Click-outside-to-cancel for context menu and move mode.
- **Changed**: Board header hint dynamically updates based on current mode (browse, context-menu, move-target).
- **Changed**: Board screen refactored to 5 modes: browse, detail, agent-picker, context-menu, move-target.

## 0.6.1 — 2026-06-04 — "Server Mode Fixes"

- **Fixed**: Dark/light mode toggle was broken in CLI server mode — `updateConfig` and `loadConfig` silently returned when `dirHandle` was null.
- **Fixed**: Settings button appeared to quit the project in server mode — `SettingsPage` refused to render without a `dirHandle`.
- **Fixed**: Server-mode project name displayed `.kandown` instead of the actual project name (`kandown`).
- **Changed**: Dev server default port moved from 5173 to 5176.

## 0.6.0 — 2026-06-03 — "Auto-Updater v2"

- **Added**: Non-blocking auto-updater using async `spawn` instead of `execSync` — CLI no longer freezes during update checks.
- **Added**: Lock file (`.update.lock`) with 60s auto-expiry to prevent concurrent update races.
- **Added**: pnpm fallback — tries `pnpm install -g` if `npm install -g` fails.
- **Added**: Post-install version verification — confirms the update actually landed before respawning.
- **Added**: `--no-update-check` flag — respawned children skip the update loop.
- **Added**: `resolveKandownBin()` — resolves the global kandown binary across npm/pnpm installs.
- **Added**: `semverGt()` — proper semver comparison replacing string equality checks.
- **Changed**: Graceful fallback on every failure point — update failure never crashes the CLI, current version continues normally.
- **Changed**: Removed dead code (unused `isMacos` variable, unnecessary `--experimental-vm-modules` injection).
- **Fixed**: Respawn logic now works for both global installs and npx.

## 0.5.0 — 2026-06-03 — "Minor Update"

- **Added**: Graph visualization output directory with cache, metadata, and an HTML viewer.
- **Added**: DESIGN_IMPROVEMENTS.md documentation file.
- **Audit**: Source code analysis audit added.
- **Chore**: Refreshed generated graph output.

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
