<p align="center">
  <img src="logo.svg" width="128" height="128" alt="Kandown logo">
</p>

# Kandown

A file-based Kanban engine backed by plain markdown. Zero backend, zero database, no account, AI-agent friendly.

Kandown installs a self-contained web app into a project folder. The app reads and writes local markdown files through the browser File System Access API, so your board stays in your repo, remains git-diffable, and can be edited by humans or AI agents without a hosted service.

## Why

Most kanban tools trap your data in their cloud. Kandown does the opposite: all state lives in `.kandown/` as markdown and JSON.

The core architecture splits the board index from task details:

- `board.md` is the lightweight index: columns, task ids, titles, progress, and small metadata.
- `tasks/<id>.md` stores the full task context: frontmatter, subtasks, notes, and completion reports.
- `kandown.json` stores project preferences such as theme mode, skin, font, agent behavior, and enabled fields.

That split matters for AI tools. Agents can read `board.md` first, identify the task they need, and only open the specific task file when deeper context is required. The result is less context noise, faster task triage, and fewer accidental edits outside the relevant task.

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
├── board.md          # task index and board state
├── kandown.json      # project preferences and appearance
├── tasks/            # per-task markdown files
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
- **AI-agent optimized**: Cheap board index plus detail files on demand.
- **Board and list views**: Toggle with `⌘1` / `⌘2`.
- **Column status icons**: Board columns use Tabler icons beside titles so states like Backlog, In Progress, Review, and Done are easier to scan.
- **Column color accents**: Columns can use expanded translucent background colors, including black variants.
- **Drag and drop**: Move cards between columns with optimistic file writes.
- **Guarded card deletion**: Hover a card and click the trash icon twice to delete a task without opening the drawer.
- **Task drawer**: Edit title, enabled metadata fields, subtasks, and body content.
- **Content search**: Search titles, ids, task body, subtasks, tags, assignee, and priority with highlighted previews.
- **Command palette**: `⌘K` / `Ctrl+K` for task search and quick actions.
- **Owner type filtering**: Separate human tasks from AI-agent tasks.
- **Dense settings**: Sidebar search, compact setting controls, and hover help explain project options.
- **Appearance system**: Project-level `auto` / `light` / `dark`, backgrounds, built-in skins, and local font presets.
- **Recent projects**: Stored in IndexedDB so local handles can be reopened quickly.
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
npx kandown init
npx kandown init --path docs/tasks
npx kandown init --no-agents
npx kandown init --force
npx kandown update
npx kandown settings
```

### Commands

| Command | Purpose |
|---|---|
| `init` | Create `.kandown/`, copy templates, copy the built web app, and install agent docs. |
| `update` | Replace an installed `kandown.html` with the current package build. |
| `settings` | Open the Ink-based terminal settings editor for `kandown.json`. |
| `help` | Print CLI help. |

## Project Architecture

```text
kandown/
├── bin/
│   ├── kandown.js        # npm CLI entrypoint
│   └── tui.js            # generated TUI bundle from tsup
├── src/
│   ├── App.tsx           # web app shell and global shortcuts
│   ├── main.tsx          # React/Vite browser entrypoint
│   ├── cli/              # Ink terminal UI source
│   ├── components/       # React UI components
│   ├── hooks/            # small React hooks
│   ├── lib/              # domain model, parser, serializer, store, theme, filesystem
│   ├── logo.svg          # source logo asset
│   └── styles/           # Tailwind layers and shadcn-compatible CSS tokens
├── templates/            # files copied by `kandown init`
├── dist/index.html       # generated single-file web app
├── tailwind.config.js
├── vite.config.ts
├── tsup.config.ts
└── package.json
```

## Runtime Flow

1. `main.tsx` mounts `App`.
2. `App` renders the header and either `EmptyState`, `Board`, `ListView`, or `SettingsPage`.
3. The user selects a folder with the File System Access API.
4. `filesystem.ts` resolves or creates `.kandown/`, `board.md`, `tasks/`, and `kandown.json`.
5. `store.ts` loads config, applies appearance tokens, parses `board.md`, and keeps recent project handles in IndexedDB.
6. `parser.ts` converts markdown into typed board/task data.
7. React components render the board/list/drawer.
8. Mutations go back through store actions, then through `serializer.ts` and `filesystem.ts`.

## Data Model

### `board.md`

`board.md` is the fast index. It should stay small even when the project has many tasks.

```markdown
---
kanban: v1
columns: [Backlog, Todo, In Progress, Done]
---

# Project Kanban

## Todo

- [ ] **[t-001]** Short title (2/4) → [détails](tasks/t-001.md) `#backend` `#p1` `@chacha`
```

Task-line metadata:

| Element | Meaning |
|---|---|
| `- [ ]` / `- [x]` | Completion checkbox |
| `**[t-001]**` | Task id |
| `Short title` | Board title |
| `(2/4)` | Subtask progress |
| `tasks/t-001.md` | Detail file |
| `` `#backend` `` | Tag |
| `` `#p1` `` | Priority |
| `` `@chacha` `` | Assignee |
| `` `human` `` / `` `ai` `` | Owner type |

### `tasks/<id>.md`

Task files store rich context.

```markdown
---
id: t-001
title: Full task title
status: Todo
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
  }
}
```

Disabled fields are hidden from the task drawer, cards, list view, and metadata filters. `board.defaultPriority` only applies when `fields.priority` is enabled, and `board.defaultOwnerType` only applies when `fields.ownerType` is enabled.

## Appearance Architecture

Kandown uses shadcn-compatible CSS variables without depending on shadcn components. The app keeps its own source components, while Tailwind aliases point at token variables.

Important pieces:

- `src/lib/theme.ts` defines skin ids, font ids, token maps, validators, and `applyProjectTheme`.
- `tailwind.config.js` maps `background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `accent`, `destructive`, plus legacy aliases like `bg`, `fg`, and `border`.
- `src/styles/globals.css` provides default CSS variables and shared component classes.
- `src/components/SettingsPage.tsx` exposes mode, skin, and font controls per project.

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
| `SubtaskItem.tsx` | `SubtaskItem` | Editable markdown checklist row. |
| `FilterBar.tsx` | `FilterBar` | Search input, owner filter, active chips, clear action. |
| `CommandPalette.tsx` | `CommandPalette` | Quick actions, task lookup, content search, keyboard navigation. |
| `SettingsPage.tsx` | `SettingsPage` | Dense project settings with sidebar search, compact controls, and contextual hover help. |
| `Header.tsx` | `Header` | Project switcher, view controls, settings link, reload, new task. |
| `EmptyState.tsx` | `EmptyState` | First-run folder picker and recent projects. |
| `Toaster.tsx` | `Toaster` | Animated notification stack. |
| `Icons.tsx` | `Icon` | Local SVG icon set for app chrome; board column status glyphs use `@tabler/icons-react`. |

### Store And Domain Logic

| File | Main exports | Description |
|---|---|---|
| `src/lib/types.ts` | `DEFAULT_CONFIG`, domain types | Shared TypeScript contracts for board, tasks, config, filters, search, and appearance. |
| `src/lib/store.ts` | `useStore` | Zustand state machine for project loading, board mutations, drawer editing, search cache, config, and toasts. |
| `src/lib/filesystem.ts` | File and IndexedDB helpers | Browser File System Access API and recent-project persistence. |
| `src/lib/parser.ts` | Markdown parsers/search | Parses board/task markdown, extracts/reinjects subtasks, and searches cached task content. |
| `src/lib/serializer.ts` | Markdown writers | Serializes board and task data back to markdown. |
| `src/lib/theme.ts` | Theme engine | Applies project-level light/dark tokens, skins, and font stacks. |
| `src/hooks/useAnimatedNumber.ts` | `useAnimatedNumber` | Spring-animated numeric display for task counts. |

## Important Functions

### `src/lib/store.ts`

| Function/action | Description |
|---|---|
| `openFolder` | Prompts for a project folder, resolves `.kandown`, saves recent project, loads config and board. |
| `openRecentProject` | Reopens an IndexedDB-stored project handle after permission verification. |
| `loadConfig` | Reads `kandown.json`, merges defaults, applies theme tokens. |
| `updateConfig` | Optimistically updates config, applies appearance immediately, writes `kandown.json`. |
| `reloadBoard` | Reads and parses `board.md`, then eagerly loads task content for small boards. |
| `moveTask` | Optimistically moves a task between columns and writes `board.md`, rolling back on failure. |
| `reorderInColumn` | Reorders tasks within one column and writes `board.md`. |
| `createTask` | Creates a board entry and matching task detail file. |
| `deleteTask` | Removes task from board, deletes detail file, clears cached content/search matches. |
| `openDrawer` | Reads one task detail file and prepares editable drawer state. |
| `saveDrawer` | Writes full task detail content and closes the drawer. |
| `saveDrawerMetadata` | Autosaves task detail content and syncs board index metadata/progress. |
| `setFilter` | Updates filters and lazily loads task contents for search queries. |
| `loadTaskContents` | Reads task files into the content-search cache. |
| `computeSearchMatches` | Produces per-task search matches for board/list previews. |
| `toast` | Adds transient UI messages. |

### `src/lib/parser.ts`

| Function | Description |
|---|---|
| `parseSimpleYaml` | Parses Kandown's limited frontmatter format. |
| `parseBoard` | Converts `board.md` into columns and board task metadata. |
| `parseTaskFile` | Splits a task markdown file into frontmatter and body. |
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
| `readBoardFile` / `writeBoardFile` | Load and save `board.md`. |
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
| `copyRecursive` | Copies template directories into `.kandown`. |
| `findAgentsFile` | Detects existing AI-agent instruction files. |
| `appendAgentReference` | Adds a Kandown task-management section to an existing agent file. |
| `createAgentsFileIfMissing` | Creates `AGENTS.md` when no agent instructions exist. |
| `parseArgs` | Parses `init` flags. |
| `cmdInit` | Installs `.kandown`, templates, config, web app, and agent docs. |
| `cmdUpdate` | Updates `kandown.html` from `dist/index.html`. |
| `main` | Dispatches CLI commands. |

The terminal UI source lives under `src/cli/` and is bundled into `bin/tui.js` by `tsup`.

| File | Description |
|---|---|
| `src/cli/tui.tsx` | Ink entrypoint for the terminal UI. |
| `src/cli/app.tsx` | TUI app shell. |
| `src/cli/lib/config.ts` | Node-side `kandown.json` reader/writer. |
| `src/cli/screens/settings.tsx` | Terminal settings editor. |

## Development

```bash
pnpm install
pnpm dev
pnpm build
```

### Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start Vite for local web UI development. |
| `pnpm build` | Typecheck, build the single-file web app, and build the CLI TUI. |
| `pnpm build:cli` | Build `src/cli/tui.tsx` into `bin/tui.js`. |
| `pnpm preview` | Preview the Vite production build. |
| `pnpm typecheck` | Run TypeScript without emitting files. |

### Build Output

`pnpm build` regenerates:

- `dist/index.html`: the single-file app copied into installed projects as `kandown.html`.
- `bin/tui.js`: bundled Ink TUI used by `kandown settings`.

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
- `board.md` must remain lightweight enough for AI agents to read first.
- Task details belong in `tasks/<id>.md`.
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
