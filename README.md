<p align="center">
  <img src="logo.svg" width="128" height="128" alt="Kandown logo">
</p>

# Kandown

A file-based Kanban engine backed by plain markdown. Zero backend, zero database, no account, AI-agent friendly.

Kandown installs a self-contained web app into a project folder. The app reads and writes local markdown files through the browser File System Access API, so your board stays in your repo, remains git-diffable, and can be edited by humans or AI agents without a hosted service.

## Why

Most kanban tools trap your data in their cloud. Kandown does the opposite: all state lives in `.kandown/` as markdown and JSON.

The core architecture keeps task state in the task files themselves:

- `tasks/<id>.md` stores the full task context and board state: title, status, order, metadata, subtasks, notes, and completion reports.
- `kandown.json` stores project preferences such as board columns, theme mode, skin, font, agent behavior, notifications, and enabled fields.

That task-first model matters for AI tools. Moving or completing a task means editing one markdown file, not synchronizing an index and a detail file.

## Install & Use

If Kandown is published on npm:

```bash
cd my-project
npx kandown init
```

This creates:

```text
.kandown/
├── kandown.html      # single-file web app, built from dist/index.html
├── kandown.json      # project preferences, columns, notifications, and appearance
├── tasks/            # per-task markdown files and board state
├── AGENT.md          # short AI-agent rules
└── README.md         # user-facing project-local guide
```

It also copies `AGENT_KANDOWN.md` to the project root and adds a reference to `AGENTS.md` / `CLAUDE.md` when possible, so AI tools know how to work with the board.

To use the board:

1. Open `.kandown/kandown.html` in Chrome, Edge, Brave, or Opera.
2. Select the project folder when prompted.
3. Grant read/write permission.

Firefox and Safari do not currently support the required File System Access API.

## Features

- **File-over-app**: Markdown and JSON are the source of truth.
- **Zero backend**: No server, database, login, or sync vendor.
- **AI-agent optimized**: Task files are the single source of truth.
- **Board and list views**: Toggle with `⌘1` / `⌘2`.
- **Column status icons**: Board columns use Tabler icons beside titles so states like Backlog, In Progress, Review, and Done are easier to scan.
- **Column color accents**: Columns can use expanded translucent background colors, including black variants.
- **Custom columns**: Add, rename, and delete columns from the board; unknown task statuses appear as temporary columns until added to settings.
- **Drag and drop**: Move cards between columns with optimistic file writes.
- **Guarded card deletion**: Hover a card and click the trash icon twice to delete a task without opening the drawer.
- **Task drawer**: Edit title, enabled metadata fields, subtasks, and body content via a WYSIWYG markdown editor (Wysimark).
- **Content search**: Search titles, ids, task body, subtasks, tags, assignee, and priority with highlighted previews.
- **Command palette**: `⌘K` / `Ctrl+K` for task search and quick actions.
- **Owner type filtering**: Separate human tasks from AI-agent tasks.
- **Dense settings**: Sidebar search, compact setting controls, and hover help explain project options.
- **Configurable notifications**: Chrome permission, status-change alerts, debounced task-edit alerts, subtask-completion alerts, and in-page sound cues.
- **External-change detection**: Warns when a task file is modified outside the app and offers Reload / Overwrite / Cancel choices via ConflictModal.
- **Appearance system**: Project-level `auto` / `light` / `dark`, built-in skins, fonts, animated WebGL backgrounds (LiquidEther fluid simulation), and local font presets.
- **Recent projects**: Stored in IndexedDB so local handles can be reopened quickly.
- **i18n**: 48 languages supported.
- **Single-file publish artifact**: Vite bundles the web UI into `dist/index.html`.

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘1` / `Ctrl+1` | Board view |
| `⌘2` / `Ctrl+2` | List view |
| `N` | New task |
| `R` | Reload files from disk |
| `/` | Focus task search |
| `Esc` | Cancel the drawer or close the command palette |
| `⌘S` / `Ctrl+S` | Save current task in the drawer |
| `⌘⌫` / `Ctrl+Backspace` | Delete current task in the drawer after confirmation |

## CLI

```bash
# Start the local HTTP web UI + open the interactive board TUI (recommended)
npx kandown
npx kandown --port 3000

# Board TUI only (no browser)
npx kandown board

# Initialize kandown in the current project
npx kandown init
npx kandown init --path docs/tasks
npx kandown init --no-agents
npx kandown init --force

# Other commands
npx kandown update
npx kandown settings
```

### Commands

| Command | Purpose |
|---|---|
| *(none)* | Start a local HTTP server for `.kandown/kandown.html`, open the web UI in your default browser, and launch the board TUI. |
| `board` | Open the interactive kanban board TUI only (no browser). |
| `init` | Create `.kandown/`, copy templates, copy the built web app, and install agent docs. |
| `update` | Replace an installed `kandown.html` with the current package build. |
| `settings` | Open the Ink-based terminal settings editor for `kandown.json`. |
| `help` | Print CLI help. |

The bare `kandown` command uses a zero-dependency Node.js HTTP server. It tries `http://localhost:2048` first, then scans through port `2060` if earlier ports are busy. Use `--port <number>` to request a specific port.

### Board TUI

The board TUI is a full-screen terminal kanban built with [Ink](https://github.com/vadimdemedes/ink). It renders the same columns and tasks as the web UI, and lets you launch an AI agent on any task directly from the terminal.

```
  KANDOWN  tmux  My Project
  ────────────────────────────────────────────────────────────────
  Backlog (3)   │ Todo (2)     │ In Progress  │ Review (1) │ Done
  ──────────────│──────────────│──────────────│────────────│──────
  ▸ t9         │ t16         │ (empty)      │ t18       │ ...
    t10        │ t7         │              │
    t11        │              │
```

**Navigation:**

| Key | Action |
|---|---|
| `h` / `l` or `←` / `→` | Move between columns |
| `j` / `k` or `↑` / `↓` | Move between tasks within a column |
| `Enter` | Open task detail view (scrollable) |
| `a` | Open agent picker for the focused task |
| `r` | Reload task files from disk |
| `q` / `Esc` | Quit (or go back from detail / picker) |

**Agent picker** (`a` key): shows only agents currently installed in your `PATH`. Selecting one:
1. Sets the task frontmatter `status` to **In Progress**.
2. Constructs a system prompt from `AGENT_KANDOWN.md` + the task file.
3. Writes context to `/tmp/kandown-<id>-context.md` for reference.
4. If inside **tmux**: opens the agent in a new 50%-wide right pane (the TUI stays visible).
5. If not in tmux: exits the TUI and hands the terminal to the agent.

**Supported agents** (auto-detected via `which`):

| Agent | Binary | Notes |
|---|---|---|
| Claude Code | `claude` | Interactive session with initial prompt |
| OpenAI Codex | `codex` | Interactive session |
| Gemini CLI | `gemini` | `-p` flag for initial prompt |
| Goose | `goose` | `run --text` for non-interactive |
| Aider | `aider` | `--message` for initial prompt |
| OpenCode | `opencode` | TUI, context written to `/tmp` |

## Project Architecture

```text
kandown/
├── bin/
│   ├── kandown.js          # npm CLI entrypoint (hand-rolled, no deps)
│   └── tui.js              # generated TUI bundle from tsup
├── src/
│   ├── App.tsx             # web app shell and global shortcuts
│   ├── main.tsx            # React/Vite browser entrypoint
│   ├── cli/                # Ink terminal UI source
│   │   ├── tui.tsx         # Ink entrypoint — alternate screen buffer
│   │   ├── app.tsx         # TUI screen router (board, settings)
│   │   ├── lib/
│   │   │   ├── config.ts   # kandown.json reader/writer
│   │   │   ├── board-reader.ts  # Node fs task scanner + moveTaskToColumn
│   │   │   ├── agents.ts   # AI agent registry, detection, prompt builder
│   │   │   └── launcher.ts # Process spawning (tmux / direct exec)
│   │   └── screens/
│   │       ├── board.tsx       # Interactive kanban board TUI
│   │       ├── agent-picker.tsx # Agent selection overlay
│   │       └── settings.tsx    # Settings editor TUI
│   ├── components/         # React UI components (web only)
│   ├── hooks/              # small React hooks
│   ├── lib/                # domain model, parser, serializer, store, theme, filesystem
│   ├── logo.svg
│   └── styles/             # Tailwind layers and CSS tokens
├── templates/              # files copied by `kandown init`
│   ├── AGENT_KANDOWN.md        # full agent instructions (copied to project root)
│   └── AGENT_KANDOWN.md          # agent instructions (single source of truth)
├── dist/index.html         # generated single-file web app
├── tailwind.config.js
├── vite.config.ts
├── tsup.config.ts
└── package.json
```

## Runtime Flow

1. `main.tsx` mounts `App`.
2. `App` renders the header and either `EmptyState`, `Board`, `ListView`, or `SettingsPage`.
3. The user selects a folder with the File System Access API.
4. `filesystem.ts` resolves or creates `.kandown/`, `tasks/`, and `kandown.json`.
5. `store.ts` loads config, applies appearance tokens, scans task files, and keeps recent project handles in IndexedDB.
6. `parser.ts` converts task markdown into typed board/task data.
7. React components render the board/list/drawer.
8. Mutations go back through store actions, then through `serializer.ts` and `filesystem.ts`.

## Data Model

### `tasks/<id>.md`

Task files store rich context and board state.

```markdown
---
id: t1
title: Full task title
status: Todo
order: 0
priority: P1
tags: [backend, security]
assignee: chacha
created: 2026-04-10
ownerType: human
---

# Task title

## Context

Why this task exists.

## Subtasks

- [ ] First step
- [x] Second step

## Notes

Extra details.
```

### `kandown.json`

Project-level preferences:

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

Disabled fields are hidden from the task drawer, cards, list view, and metadata filters. `board.defaultPriority` only applies when `fields.priority` is enabled, and `board.defaultOwnerType` only applies when `fields.ownerType` is enabled.

Notifications are driven by a 500ms polling file watcher that computes SHA-256 hashes of task file content to detect external changes. Status changes fire when task frontmatter `status` changes, task edit notifications fire after `notifications.editDebounceMs` with a minimum 2 second delay, and subtask completion notifications fire when a checklist item flips from open to done. Browser notifications require Chrome permission; sound notifications play inside the open board tab.

## Appearance Architecture

Kandown uses shadcn-compatible CSS variables without depending on shadcn components. The app keeps its own source components, while Tailwind aliases point at token variables.

Important pieces:

- `src/lib/theme.ts` defines skin ids, font ids, token maps, validators, and `applyProjectTheme`.
- `tailwind.config.js` maps `background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `accent`, `destructive`, plus legacy aliases like `bg`, `fg`, and `border`.
- `src/styles/globals.css` provides default CSS variables and shared component classes.
- `src/components/SettingsPage.tsx` exposes mode, skin, and font controls per project.
- `src/components/LiquidEther.tsx` provides an animated WebGL fluid simulation background (GPU-accelerated, available as a background option in appearance settings).

Supported theme modes:

| Value | Behavior |
|---|---|
| `auto` | Follow `prefers-color-scheme`. |
| `light` | Force light tokens. |
| `dark` | Force dark tokens. |

Built-in skins:

| Skin | Intent |
|---|---|
| `kandown` | Crisp neutral default, close to the original UI. |
| `graphite` | Soft gray surfaces. |
| `sage` | Calm green-gray planning palette. |
| `cobalt` | Cool blue accent, restrained surfaces. |
| `rose` | Warm ink with a restrained rose accent. |

Built-in fonts:

| Font | Stack |
|---|---|
| `inter` | Inter-first sans stack. |
| `system` | Native platform sans stack. |
| `serif` | Editorial serif stack. |
| `mono` | Monospace stack. |
| `rounded` | Rounded system stack. |

## Web Modules

### App Shell

| File | Role |
|---|---|
| `src/main.tsx` | Mounts React and global CSS. |
| `src/App.tsx` | Composes the web UI and owns global keyboard shortcuts. |

### Components

| File | Main exports | Description |
|---|---|---|
| `Board.tsx` | `Board` | Horizontal kanban view, filtering, drag state, search-match forwarding. |
| `Column.tsx` | `Column` | One kanban column, Tabler status icon, drop target, create-task button, empty state. |
| `Card.tsx` | `Card` | Task card with progress, metadata, guarded hover deletion, drag handlers, and search previews. |
| `ListView.tsx` | `ListView` | Dense table-like view sharing the same filters/search cache as board view. |
| `Drawer.tsx` | `Drawer` | Task detail editor for title, enabled frontmatter metadata, subtasks, and body content. |
| `MarkdownEditor.tsx` | `MarkdownEditor` | WYSIWYG markdown body editor (Wysimark) for task body content. |
| `SubtaskItem.tsx` | `SubtaskItem` | Editable markdown checklist row. |
| `FilterBar.tsx` | `FilterBar` | Search input, owner filter, active chips, clear action. |
| `CommandPalette.tsx` | `CommandPalette` | Quick actions, task lookup, content search, keyboard navigation. |
| `SettingsPage.tsx` | `SettingsPage` | Dense project settings with sidebar search, compact controls, and contextual hover help. |
| `Header.tsx` | `Header` | Project switcher, view controls, settings link, reload, new task. |
| `EmptyState.tsx` | `EmptyState` | First-run folder picker and recent projects. |
| `Toaster.tsx` | `Toaster` | Animated notification stack. |
| `Icons.tsx` | `Icon` | Local SVG icon set for app chrome; board column status glyphs use `@tabler/icons-react`. |
| `ConflictModal.tsx` | `ConflictModal` | Warns when a task file was modified externally; offers Reload / Overwrite / Cancel. |
| `LiquidEther.tsx` | `LiquidEther` | WebGL fluid simulation background (animated, GPU-accelerated). |

### Store And Domain Logic

| File | Main exports | Description |
|---|---|---|
| `src/lib/types.ts` | `DEFAULT_CONFIG`, domain types | Shared TypeScript contracts for board, tasks, config, filters, search, and appearance. |
| `src/lib/store.ts` | `useStore` | Zustand state machine for project loading, board mutations, drawer editing, search cache, config, and toasts. |
| `src/lib/filesystem.ts` | File and IndexedDB helpers | Browser File System Access API and recent-project persistence. |
| `src/lib/parser.ts` | Markdown parsers/search | Parses board/task markdown, extracts/reinjects subtasks, and searches cached task content. |
| `src/lib/serializer.ts` | Markdown writers | Serializes board and task data back to markdown. |
| `src/lib/theme.ts` | Theme engine | Applies project-level light/dark tokens, skins, and font stacks. |
| `src/lib/i18n/index.ts` | i18n setup | 48-locale translation system with per-project language preference. |
| `src/lib/watcher.ts` | File watcher | 500ms polling watcher with SHA-256 content hashing to detect external file changes and drive reloads/notifications. |
| `src/hooks/useAnimatedNumber.ts` | `useAnimatedNumber` | Spring-animated numeric display for task counts. |

## Important Functions

### `src/lib/store.ts`

| Function/action | Description |
|---|---|
| `openFolder` | Prompts for a project folder, resolves `.kandown`, saves recent project, loads config and board. |
| `openRecentProject` | Reopens an IndexedDB-stored project handle after permission verification. |
| `loadConfig` | Reads `kandown.json`, merges defaults, applies theme tokens. |
| `updateConfig` | Optimistically updates config, applies appearance immediately, writes `kandown.json`. |
| `reloadBoard` | Scans task files, derives columns from task statuses, and eagerly loads task content for small boards. |
| `moveTask` | Optimistically moves a task between columns and writes task frontmatter `status` / `order`, rolling back on failure. |
| `reorderInColumn` | Reorders tasks within one column by writing task frontmatter `order`. |
| `addColumn` / `renameColumn` / `deleteColumn` | Manage `board.columns` in config and update affected task files. |
| `createTask` | Creates a task markdown file with initial frontmatter. |
| `deleteTask` | Deletes the task file and clears cached content/search matches. |
| `openDrawer` | Reads one task detail file and prepares editable drawer state. |
| `saveDrawer` | Writes full task detail content and closes the drawer. |
| `saveDrawerMetadata` | Autosaves task detail content and reloads derived board metadata/progress. |
| `setFilter` | Updates filters and lazily loads task contents for search queries. |
| `loadTaskContents` | Reads task files into the content-search cache. |
| `computeSearchMatches` | Produces per-task search matches for board/list previews. |
| `toast` | Adds transient UI messages. |

### `src/lib/notifications.ts`

| Function | Description |
|---|---|
| `getBrowserNotificationPermission` | Reads browser notification permission and reports unsupported browsers. |
| `requestBrowserNotificationPermission` | Prompts Chrome-compatible browsers from the Settings page. |
| `emitKandownNotification` | Dispatches enabled browser notifications and in-page sound cues. |
| `playNotificationSound` | Plays generated Web Audio cues without external assets. |

### `src/lib/parser.ts`

| Function | Description |
|---|---|
| `parseSimpleYaml` | Parses Kandown's limited frontmatter format. |
| `parseTaskFile` | Splits a task markdown file into frontmatter and body. |
| `taskToBoardTask` | Converts parsed task frontmatter/body into compact card metadata. |
| `buildColumnsFromTasks` | Groups parsed task files into configured and temporary columns. |
| `extractSubtasks` | Pulls markdown checklist lines out of a subtask section. |
| `injectSubtasks` | Writes edited subtasks back into a task body. |
| `searchTaskContent` | Searches title, subtasks, body, tags, assignee, and priority with contextual snippets. |

### `src/lib/filesystem.ts`

| Function | Description |
|---|---|
| `supportsFileSystemAccess` | Detects required browser API support. |
| `pickProjectDirectory` | Prompts for a project folder and opens or creates `.kandown`. |
| `getKandownHandle` | Resolves `.kandown` from a remembered project directory handle. |
| `ensureTasksDir` | Ensures `.kandown/tasks` exists. |
| `readConfigFile` / `writeConfigFile` | Load and save `kandown.json`. |
| `listTaskIds` | Scans `.kandown/tasks/*.md` and returns task IDs. |
| `readTaskFile` / `writeTaskFile` / `deleteTaskFile` | Manage per-task markdown files. |
| `saveRecentProject` / `listRecentProjects` / `removeRecentProject` | Manage recent project handles in IndexedDB. |
| `verifyPermission` | Requests read/write permission for a stored handle. |

### `src/lib/theme.ts`

| Function | Description |
|---|---|
| `normalizeThemeMode` | Validates persisted theme mode. |
| `normalizeSkinId` | Validates persisted skin id. |
| `normalizeFontId` | Validates persisted font id. |
| `applyProjectTheme` | Applies resolved light/dark class, dataset metadata, font stack, and CSS variables. |

## CLI Architecture

The npm CLI lives in `bin/kandown.js`.

| Function | Description |
|---|---|
| `help` | Prints usage and commands. |
| `openInBrowser` | Opens `kandown.html` non-blocking in the system default browser. |
| `findKandownDir` | Locates `.kandown/` walking up from cwd. |
| `copyRecursive` | Copies template directories into `.kandown`. |
| `findAgentsFile` | Detects existing AI-agent instruction files. |
| `appendAgentReference` | Adds a Kandown task-management section to an existing agent file. |
| `createAgentsFileIfMissing` | Creates `AGENTS.md` when no agent instructions exist. |
| `parseArgs` | Parses shared CLI flags such as `--path`, `--force`, and `--port`. |
| `cmdInit` | Installs `.kandown`, templates, config, web app, and agent docs. |
| `cmdUpdate` | Updates `kandown.html` from `dist/index.html`. |
| `createServeServer` | Creates the local HTTP server for the web UI, including placeholder `/api/*` routing. |
| `cmdServe` | Serves `kandown.html` over localhost, injects `window.__KANDOWN_ROOT__`, opens the browser, and launches the board TUI. |
| `cmdTui` | Launches a named TUI screen (`board`, `settings`). |

The terminal UI source lives under `src/cli/` and is bundled into `bin/tui.js` by `tsup`.

| File | Description |
|---|---|
| `src/cli/tui.tsx` | Ink entrypoint — alternate screen buffer, renders the `App` shell. |
| `src/cli/app.tsx` | TUI screen router (`board`, `settings`). |
| `src/cli/lib/config.ts` | Node-side `kandown.json` reader/writer with dot-path accessors. |
| `src/cli/lib/board-reader.ts` | Node fs wrapper around task scanning: `readBoard`, `readTask`, `readAgentDoc`, `moveTaskToColumn`. |
| `src/cli/lib/agents.ts` | Agent registry (claude, codex, gemini, goose, aider, opencode), detection via `which`, `buildPrompt`. |
| `src/cli/lib/launcher.ts` | Process spawning: tmux split-pane or direct exec, auto-moves task to In Progress. |
| `src/cli/screens/board.tsx` | Interactive kanban board TUI — column navigation, task detail, agent picker integration. |
| `src/cli/screens/agent-picker.tsx` | Agent selection overlay component. |
| `src/cli/screens/settings.tsx` | Terminal settings editor for `kandown.json`. |

## Development

```bash
pnpm install
pnpm dev        # web UI (Vite dev server)
pnpm build      # full build: web + CLI
```

### Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start the Vite dev server for the web UI at `localhost:5173`. |
| `pnpm dev:cli` | Watch-mode build for the CLI TUI — rebuilds `bin/tui.js` on every file change. |
| `pnpm build` | Full build: typecheck → Vite web app → CLI TUI bundle. |
| `pnpm build:cli` | Build `src/cli/tui.tsx` into `bin/tui.js` (one-shot). |
| `pnpm preview` | Preview the Vite production build. |
| `pnpm typecheck` | Run TypeScript compiler without emitting files. |

### Developing the Web UI

```bash
pnpm dev
# → open http://localhost:5173
# → select any folder that has a .kandown/ directory when prompted
```

Hot-reload is fully supported. Changes to `src/` reflect immediately in the browser.

### Developing the CLI / Board TUI

The CLI TUI is built with [Ink](https://github.com/vadimdemedes/ink) (React for terminals) and bundled by `tsup`.

**Recommended dev workflow** — two terminals:

```bash
# Terminal 1: watch-rebuild on every save
pnpm dev:cli

# Terminal 2: run the board TUI after each rebuild
node bin/kandown.js board

# Or run the bare command (local web server + browser + board):
node bin/kandown.js

# Use a fixed local web UI port:
node bin/kandown.js --port 3000
```

`pnpm dev:cli` watches all files under `src/cli/` and `src/lib/` (shared parsers). After saving a file, re-run `node bin/kandown.js board` in the second terminal to see the updated TUI.

**Testing a specific screen:**

```bash
# Board TUI (new)
node bin/kandown.js board

# Settings TUI
node bin/kandown.js settings

# Init in a temp project to test installation
mkdir /tmp/test-kandown && cd /tmp/test-kandown
node /path/to/kandown/bin/kandown.js init
node /path/to/kandown/bin/kandown.js
```

**Iterating on the agent picker** — if you don't have any AI agents installed, the picker will show "No agents found". To test the picker UI regardless, temporarily add a dummy agent to the `AGENTS` array in `src/cli/lib/agents.ts` pointing to a binary that exists (e.g. `echo`).

**Testing tmux integration:**

```bash
# Start a tmux session if you're not in one
tmux new-session -s dev

# Then run kandown — the agent picker should offer tmux split-pane launch
node bin/kandown.js board
```

### Build Output

`pnpm build` regenerates:

- `dist/index.html` — single-file web app, copied into target projects as `kandown.html`.
- `bin/tui.js` — bundled Ink TUI, used by `kandown board` and `kandown settings`.

Always build before publishing. The published package is intentionally small and includes only `dist/`, `bin/`, `templates/`, `README.md`, and `LICENSE`.

## Browser Support

Kandown requires the File System Access API. Supported browsers:

- Chrome
- Edge
- Brave
- Opera

Unsupported:

- Firefox
- Safari

## Design Constraints

- The app must remain local-first and backend-free.
- Markdown stays the canonical data format.
- Task files are the canonical source of truth.
- Board columns belong in `kandown.json`.
- UI state that is project-specific belongs in `kandown.json`.
- Browser-only convenience state, such as recent handles, can live in IndexedDB.
- The installed web app should remain a single file.

## Publishing

```bash
pnpm build
npm login
npm publish --access public
```

## License

MIT
