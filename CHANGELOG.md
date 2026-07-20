# Changelog

## 0.21.4 — 2026-07-20 — "Favicons & App Icons"

- **Added**: **Official Favicon Suite from `logo.svg`** — generated multi-format favicons (`favicon.svg`, inline base64 SVG data URI, `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png`, `favicon-96x96.png`), `apple-touch-icon.png` (180x180), `android-chrome-192x192.png`, `android-chrome-512x512.png`, and Web Manifests (`manifest.json`, `site.webmanifest`).
- **Added**: **Daemon Static Asset Handler** — added `serveStaticAsset` in `bin/kandown.js` so web daemons serve app favicons and manifests directly.

## 0.21.3 — 2026-07-20 — "Editor Text Colors & Highlights"

- **Fixed**: **Editor Text & Highlight Color Persistence** — enabled `textColor` and `backgroundColor` specs in BlockNote schema (`src/components/ui/BlockNoteMarkdownEditor.tsx`) so inline text colors and background highlights added in the web task description editor serialize to HTML inline tags and persist cleanly across reloads and markdown round-trips.

## 0.21.2 — 2026-07-20 — "Pre-Bump Manual Validation"

- **Added**: **Mandatory Pre-Bump Testing Rule in `AGENTS.md`** — formal rule requiring agents to manually launch and test `kandown` CLI and web daemon before executing a release bump to catch runtime errors.
- **Fixed**: **Closing brace syntax in `cmdProjects`** — resolved missing `}` in `cmdProjects` that caused a `SyntaxError` on CLI startup.

## 0.21.1 — 2026-07-20 — "CLI Live Changelog"

- **Added**: **CLI Live Changelog Display** — the CLI automatically parses and displays formatted release changelogs from `CHANGELOG.md` directly in the terminal during auto-updates, `kandown update`, and version notice popups.
- **Added**: **Release Guidelines in `AGENTS.md`** — mandatory rule requiring every release to include a comprehensive, detailed English changelog in `CHANGELOG.md` and attached to the release commit body.
- **Changed**: Included `CHANGELOG.md` in published npm package `files` array so terminal displays have access to release notes in production installs.

## 0.21.0 — 2026-07-20 — "Fable Features & Integrated MCP"

- **Added**: **Integrated MCP Server (`kandown mcp`)** — stdio JSON-RPC 2.0 server for MCP hosts (Claude Desktop, VSCode, Glama, etc.) exposing `list_tasks`, `get_task`, `create_task`, `move_task`, `update_task`, `add_report`, `list_columns`.
- **Added**: **Full TUI CRUD & Workflow (`kandown board`)** — interactive creation (`n` with inline syntax), editing in `$EDITOR` (`e`), archiving (`x`), deletion with prompt (`D`), fuzzy search (`/`), filter cycling (`f`), cheatsheet modal overlay (`?`), and undo (`u`).
- **Added**: **Diagnostic command `kandown doctor [--fix]`** — checks CLI/HTML version alignment, daemon liveness, port status, `kandown.json` validity, frontmatter syntax, and auto-resolves duplicate task files.
- **Added**: **Multi-project Manager (`kandown projects`)** — scans active localhost daemons (ports 2048-2150) and lists running instances with PID, port, and project paths (`--json` supported).
- **Added**: **Real-Time SSE (`GET /api/events`)** — Server-Sent Events endpoint backed by `chokidar` file watcher for instant live updates in the web UI when agents or CLI edit task files.
- **Added**: **Quick-Add Inline Parser** — parse `#tag`, `@assignee`, `p1-p4`, `due:date`, `+t12` directly from title strings across web UI, TUI, and `kandown create`.
- **Added**: **Web Multi-Selection & Floating Action Bar (`BulkActionBar`)** — select multiple tasks with `Cmd`/`Ctrl`/`Shift` click or checkboxes to bulk move or delete tasks in one click.
- **Added**: **WIP Limits & Visual Indicators** — column limits (`board.wipLimits`) with warning badges when limits are exceeded.
- **Added**: **Swimlanes & Group By Selector** — filter bar dropdown to group board tasks by Priority, Assignee, or Epic.
- **Added**: **Épics (`epic: <id>`) & Task Templates** — frontmatter `epic` tracking with card badges, and `.kandown/templates/*.md` card template loading.
- **Added**: **Due Dates & Calendar View** — overdue and upcoming due-date summary banner in ListView.
- **Added**: **Import & Export (`kandown export` / `kandown import`)** — export board to JSON or CSV, and import from Trello JSON exports or Markdown headers.
- **Added**: **Git Task Timeline API (`GET /api/git/history`)** — endpoint serving task modification history (`git log --follow`).
- **Added**: **Outgoing Webhooks (`notifications.webhookUrl`)** — POST JSON notifications on status changes to Slack, Discord, or n8n.
- **Added**: **Enriched Agent Context & Config** — `readAgentDoc` automatically injects recent task git commits into agent instructions, and `agent.extraArgs` is configurable in Web & CLI Settings.
- **Changed**: TUI move context menu proposes the next column to the right by default for natural left-to-right Kanban flow.

## 0.20.0 — 2026-07-19 — "No More Stale Copies"

- **Changed**: **`kandown init` no longer copies `AGENT.md`/`AGENT_KANDOWN.md` into new projects** — both `kandown work` and the TUI's agent launcher (`a` key) now read the rules straight from the installed package's `templates/AGENT_KANDOWN.md` at call time, so there's no per-project snapshot left to go stale. Existing projects with an old copy are left untouched — nothing is auto-deleted.
- **Changed**: **The TUI's agent launcher now uses the same layered rules as `kandown work`** — base rules from the package, plus optional `~/.kandown/instructions.md` (global) and `.kandown/instructions.md` (project). Previously it read a project-local `AGENT_KANDOWN.md`/`AGENT.md` copy that could silently drift from what `kandown work` printed; the two entry points can no longer disagree.
- **Changed**: **`kandown init`'s injected `AGENTS.md`/`CLAUDE.md` line no longer promises a local fallback file** — dropped "if you can't run the CLI, read `.kandown/AGENT_KANDOWN.md` instead" since that file is no longer shipped and the scenario (an agent that can follow `AGENTS.md` but can't run a shell command) is effectively nonexistent.

## 0.19.1 — 2026-07-19 — "Migration Fixes"

- **Fixed**: **False "conflict" on legacy task migration** — `migrateTasksToTopLevel` reported `.kandown/tasks/` and `./tasks/` as conflicting (and silently left an old install un-migrated) whenever `.kandown/tasks/` existed but was actually empty, even though there was nothing to protect. It now checks the legacy folder's real content first and only defers to the "don't clobber" guard when there's genuinely something to migrate.
- **Fixed**: **Legacy folder cleanup never actually ran** — `cleanupLegacyTasksDir` called `fs.rmSync(dir, { recursive: false })` on an already-confirmed-empty directory, which throws `EISDIR` (Node's `rmSync` requires `recursive: true` to remove a directory at all, even an empty one — introduced by the earlier `rmdirSync` → `rmSync` cleanup in v0.19.0). Found by testing this release's migration fix against kandown's own dev install before shipping.

## 0.19.0 — 2026-07-19 — "Upgrade Notices"

- **Added**: **Breaking-change migration notices** — when an interactive `kandown` command detects it just crossed a release with user-facing changes (starting with v0.18.0's `shell` removal), it prints a one-time notice explaining what changed and how to adapt. Fires right after a successful auto-update, and also via a lightweight version-seen tracker (`.version-seen.json` next to the install) that catches upgrades made outside the auto-updater — manual `npm install -g kandown`, pnpm/yarn/bun, etc. TTY-only and never fires for scripted/one-shot commands.
- **Changed**: **New tagline** — "Too Many Ideas, Not Enough Agents." Kandown helps you queue tasks in an elegant and clever way.
- **Fixed**: A `const` array referencing the CLI's color palette was declared before that palette existed in module load order, which would have crashed every single `kandown` invocation the moment the migration-notice feature above was exercised. Caught by testing before release — moved the declaration after the palette.

## 0.18.0 — 2026-07-19 — "Agent Workflow"

- **Added**: **`kandown work` — the agent entrypoint** — a single command that prints the full agent rules (served fresh from the installed CLI version, never a stale per-project copy) plus a live board digest: column counts, tasks per column with blocked-by annotations, and a computed "next actionable task" (closest to done, unblocked, highest priority). One call gives an AI agent both its rules and its context.
- **Added**: **Layered instructions** — optional `~/.kandown/instructions.md` (applies to every kandown project on this machine) and `.kandown/instructions.md` (this project only) are appended after the base rules in `kandown work` output, letting users customize agent behavior globally or per project without touching the agent file.
- **Changed**: **`kandown init` no longer injects a rules block into `AGENTS.md`/`CLAUDE.md`** — it appends a single line pointing the agent at `kandown work` instead. Removes the drift problem of a rules copy going stale the moment the package updates, and cuts the injected footprint from a paragraph to one line.
- **Changed**: **Task commands promoted to top-level, `shell` prefix removed entirely** — `kandown list/show/create/move/assign/commit` (previously `kandown shell <cmd>`, no alias kept). These are the most basic operations of the product; nesting them under a wrapper word only added friction for the scripts and AI agents they're built for. New `kandown tasks` prints the cheatsheet for this group.
- **Fixed**: internal function names and comments across `bin/kandown.js` no longer reference the removed `shell` wrapper.

## 0.17.2 — 2026-07-19 — "CLI Hardening"

- **Added**: **CLI/daemon hardening pass** — daemon routes now use per-daemon `X-Kandown-Token` auth, remove wildcard CORS, cap request bodies at 10MB, and keep the daemon alive after recoverable fatal handlers.
- **Added**: **Safer persistence** — task, config, board, and daemon metadata writes now use atomic temp-file renames, with a daemon spawn lock to avoid duplicate startup races.
- **Fixed**: **CLI update policy** — update checks are skipped for daemon/shell/non-TTY flows, throttled for 24h, and handle prerelease semver comparisons safely.
- **Fixed**: **stdout/stderr contract** — machine-readable shell output stays clean on stdout while UI decorations and status logs go to stderr.
- **Fixed**: **Board/TUI resilience** — daemon startup, board scrolling, and move-target UX received stability fixes from the FABLE CLI pass.
- **Changed**: **Credits and package metadata** — license, package author, Settings links, and README credits now point to Vanessa Depraute, GitHub `vava-nessa`, and `vanessadepraute.dev`.

## 0.17.1 — 2026-07-08 — "Column Reorder"

- **Fixed**: **Column reorder drag feedback** — dragging a column now shows a clear vertical insertion line between columns, including the final slot after the last column, so the destination is obvious before dropping.
- **Changed**: **Column reorder gesture handling** — normal columns only start reordering from the gripper handle, preventing card drag and column drag from fighting for the same gesture.
- **Changed**: **Column order persistence** — reordered columns are saved from the visible board order, so status-derived columns cannot corrupt config indices.

## 0.17.0 — 2026-07-08 — "Column Reorder"

- **Added**: **Native HTML5 drag-and-drop column reordering** — grip columns by the 6-dot gripper icon (left of column name) and drag to a new position. Columns snap, config updates and persists automatically.
- **Fixed**: **Column drag-and-drop handler signature** — `handleColumnDragOver` now works correctly with HTML5 native drag events (removed unnecessary target index param).

## 0.16.0 — 2026-07-08 — "Compact Mode"

- **Added**: **Compact board density** — column density can now use a space-saving layout where empty columns collapse into a thin strip (100px wide) or stack vertically when multiple consecutive columns are empty. Normal columns keep their full width. In compact mode the empty-column cards show only an icon + name, minimizing wasted space for boards with many columns.
- **Added**: **`isEmptyCompact` column prop** — `Column.tsx` now renders a minimal icon+label placeholder when there are no tasks and the compact density is active.
- **Changed**: **Board layout refactored through `columnGroups`** — the board now groups consecutive empty columns into `compact-single` (one column strip) or `compact-stack` (vertical stack), improving density for task-heavy boards.
- **Removed**: **Task placeholder t119** — removed unfinished placeholder task file.

## 0.15.4 — 2026-07-08 — "Update Animation"

- **Added**: **Animated spinner + progress bar with percentage for the auto-updater** — the `npm install` phase now shows a real-time filling bar (`████░░░ 45%`) with a Braille spinner, giving visual feedback during the 10–30s update. Falls back to plain text when stdout is piped.
- **Fixed**: **Column CSS `group` conflict** — changed `group` to `group/column` to prevent style collisions when columns are nested inside other `group` containers.

## 0.15.3 — 2026-07-08 — "Cosmetic Change"

- **Changed**: **Category tag moved next to task ID in cards** — the `[bracket]` category tag previously displayed below the title now sits inline to the right of the task number (`#102 [optimization]`), keeping the card header compact and scannable.

## 0.15.2 — 2026-07-07 — "Safe Ports"

- **Fixed**: **2nd concurrent project looked dead in the browser** — when running `kandown` in a second project folder, the daemon correctly moved to port **2049**, but Chrome/Firefox/Safari refuse to load it (`net::ERR_UNSAFE_PORT`) because 2049 is the well-known **NFS** port. The server answered fine (curl worked) yet the browser showed an error page. Port allocation now skips every port in the browsers' restricted-ports list (`BROWSER_UNSAFE_PORTS`, sourced from Chromium's `net/base/port_util.cc`), so the 2nd project lands on a browser-loadable port (2050) instead. The default 2048 stays safe and stable for the primary project. `--port <n>` pointing at an unsafe port is now rejected with a clear message.

## 0.15.1 — 2026-07-07 — "Parallel Daemons"

- **Fixed**: **Multi-project daemon port clash** — launching `kandown` from a second project folder no longer kills the first project's web daemon and steals its port. Each project now gets its own daemon on an auto-allocated port (A=2048, B=2049, C=2050, …), so multiple kandown boards can finally run in parallel.
  - Root cause #1: `listenOnAvailablePort()` unconditionally killed whatever kandown sat on the default port — even when it belonged to a *different* project. The preemptive stale check now only reclaims same-project zombies; other-project daemons fall through to the port-scan loop (which already skips them).
  - Root cause #2: the parent↔child startup handshake deleted the freshly-written daemon metadata on any transient HTTP fetch failure. Node's `fetch` (undici) doesn't recover from the initial `ECONNREFUSED` window and reported healthy local daemons as down for seconds, orphaning them with a spurious "Daemon failed to start". `getDaemonStatus()` is now non-destructive on transient fetch failures (metadata is removed only on a *real* conflict), and startup detection uses a dependency-free TCP probe (`net.createConnection`) instead of HTTP.
  - Port range widened 2048–2060 → **2048–2150** (103 slots); startup timeout 5s → 8s.

## 0.15.0 — 2026-07-07 — "Boot Splash"

- **Added**: **Boot splash** — au lancement du projet, le titre `kandown` + badge `v<version>` reste affiché pendant 5 secondes, puis fond en fade-out pour ne laisser que le logo. Le nom du projet ouvert prend ensuite sa place comme titre de page du header, avec une transition douce.
- **Added**: **Document title dynamique** — l'onglet du navigateur reflète désormais le projet courant (`<Projet> · Kandown`) au lieu d'un titre statique.

## 0.14.1 — 2026-07-07 — "Resilience Pass"

- **Added**: **Typed error hierarchy** (`src/lib/errors.ts`) — `KandownError` base with `BrowserNotSupported`, `PermissionDenied`, `DiskFull`, `Corrupted`, `FileRead` subclasses, plus a `Result<T>` discriminated union and `isRetryableError`. One shared vocabulary for the whole web UI.
- **Added**: **Retry with exponential backoff** (`src/lib/retry.ts`) — `withRetry()` wraps fallible async operations and retries only transient failures (disk full, network). Used by every store write path so a user freeing space between attempts recovers automatically.
- **Added**: **React error boundary** (`src/components/ErrorBoundary.tsx`). A top-level boundary catches whole-app crashes with Retry + Copy-report; a granular boundary around the board means a malformed task crashing the render no longer takes down the drawer (unsaved edits stay safe).
- **Added**: **Global error handlers** (`src/lib/globalErrors.ts`) — `window.onerror` + `unhandledrejection` listeners installed before React mount, with throttled toasts (max 3 per 5s, dedup) so a tight rejection loop can't flood the UI.
- **Added**: **Browser support gating** (t100) — `openFolder` checks `supportsFileSystemAccess()` first and shows an actionable toast on Firefox/Safari instead of crashing with `TypeError: showDirectoryPicker is not a function`.
- **Fixed**: **Ghost-task silent corruption** (t102) — `readTaskFileStrict()` returns a typed `TaskReadResult` distinguishing not-found (benign) from permission/corrupted (actionable). `readAllTasks` migrated so unreadable files are dropped + reported via `failedTaskIds` and an "N tasks could not be loaded" warning instead of returning empty ghost tasks.
- **Fixed**: **Store rollback completeness** (t104) — every mutating action now captures `columns` + `taskContents` + `searchMatches` and restores all three on failure. `persistColumnOrder` returns `{ failedIds }` via `Promise.allSettled` and partial-failure callers warn + reload from disk.
- **Fixed**: **Disk full / quota handling** (t105) — filesystem writes map `QuotaExceededError` to a typed `DiskFullError` and close streams in a `finally`. Toast reads "Disk is full — <action> was not saved. Free up space and try again." (8s).
- **Fixed**: **reloadBoard preserves previous state** (t106) — adds `isReloading`, `lastReloadError`, `failedTaskIds` state. Hard failure keeps the previous board visible + warning; partial failure keeps readable tasks and warns.
- **Fixed**: **File watcher silent failures** (t107) — watcher callbacks wrapped in try/catch; per-task reads guarded so one bad file doesn't abort the tick. Auto-disables after 5 consecutive tick failures and emits a `watcherError` event; Header shows an amber banner with "Restart watcher" + "Reload" buttons.
- **Fixed**: **IndexedDB unhandled rejection at startup** (t108) — module-level `listRecentProjects()` has `.catch()`; `openFolder`/`openRecentProject` wrap IDB calls so private browsing never blocks project opening.
- **Fixed**: **Revoked-handle recovery** (t109) — `verifyPermission()` swallows internal throws; `openRecentProject` is transactional (captures + rolls back state) and auto-removes dead entries from recent projects with a clear warning.
- **Fixed**: **Drawer data loss on save failure** (t110) — unsaved edits are stashed into a per-task recovery buffer when the drawer is force-closed, and restored on next open. Close guard prompts before discarding; footer shows "Retry save" + "● unsaved" indicator when there's a pending error.
- **Fixed**: **Silent config corruption** (t111) — `readConfigFileStrict()` distinguishes not-found (silent) from corrupted (warn + back up to `kandown.json.backup`). Null-safe spreading means `"board": null` no longer crashes with `TypeError`. CLI `loadConfig` mirrors the fix and warns to stderr.
- **Fixed**: **`Promise.all` → `Promise.allSettled`** (t116) — `readAllTasks`, `persistColumnOrder`, `renameColumn`, `deleteColumn` all tolerate per-task failures instead of failing the whole batch.
- **Fixed**: **CLI agent launch error handling** (t112) — `board-reader.ts` per-task guards; `launcher.ts` step-by-step guarded launch with task-status rollback if the agent fails to spawn (tmux missing, binary not found). `child.on('error')` no longer crashes the TUI.
- **Fixed**: **CLI `copyRecursive` crash + HTTP error leaks** (t113) — `copyRecursive` returns per-file errors; `appendAgentReference` TOCTOU-safe; `serveApp` 500 no longer leaks paths to HTTP clients; `listenOnAvailablePort` treats `EACCES` like `EADDRINUSE`.
- **Fixed**: **TUI error handling** (t114) — board.tsx adds `boardError` state with a recoverable "Press r to retry, q to quit" view; `openDetail`/`persistConfig` wrapped; empty agent-picker shows a hint instead of an empty box.
- **Added**: **Toast `warning` severity** with longer duration (6s) for actionable messages, rendered in amber.

## 0.14.0 — 2026-06-26 — "Task Groups"

- **Added**: **User preference for default task group state** (`board.stackDefaultState`). Until now, when several tasks shared the same `[bracket]` or `#hashtag` title tag, they always rendered as a single collapsible stack (click to expand). The new setting in **Settings → Board → Task groups** lets users pick:
  - **Collapsed (stacked)** — default, current behavior. One summary card per group with a count and a preview line; click to expand.
  - **Expanded (all visible)** — every task in the group is rendered inline as its own card, identical to how untagged tasks display. Useful when the board is mainly used as a flat list rather than a high-density overview.
  - The active search filter still forces expansion regardless of the setting, so search match highlights always remain visible. Per-stack collapse / expand toggles on click still work in both modes.
- **Added**: **CLI parity** — the same `board.stackDefaultState` setting is now configurable from the TUI settings screen (under the **Board** section), so terminal-only users can toggle it without opening the web UI.
- **Added**: **New `board.stackDefaultState` key in `templates/kandown.json`** so fresh installs (`kandown init`) ship with the field explicitly set to `'collapsed'`. Existing projects without the key inherit `'collapsed'` through the existing deep-merge in `readConfigFile` / `loadConfig` — no migration needed.
- **Added**: **English + French translations** for the new setting: `stackDefaultState` ("Task groups" / "Groupes de tâches"), `stackDefaultStateDesc`, `stackCollapsed` ("Collapsed (stacked)" / "Pliées (empilées)"), `stackExpanded` ("Expanded (all visible)" / "Dépliées (toutes visibles)"). Other locales fall back to English until they're updated.
- **Changed**: **`Column.tsx` now combines the user preference with the search filter** when computing `CardStack`'s `defaultExpanded` prop: `config.board.stackDefaultState === 'expanded' || !!filters.search`. Previously the prop only reflected the search state.


## 0.13.1 — 2026-06-20 — "Transparent Favicon"

- **Fixed**: **Favicon had a solid dark surface that disappeared on dark browser tabs.** The 0.13.0 favicon used a `#0a0a0a` rounded background that blended with Chrome's `#202124` tab strip and Safari's dark chrome, leaving a near-invisible blob. The new \`public/favicon.svg\` has a transparent background and recolors the K via \`@media (prefers-color-scheme: dark)\` so the contrast holds in both light and dark browser themes. The lime slash (\`#cef867\`) is the constant brand element on top. \`favicon-{16,32,48}.png\` and \`favicon.ico\` are regenerated with transparent backgrounds. PWA / OS-launcher icons (apple-touch-icon, android-chrome-192/-512, mstile-150, og-image) keep their dark surface — they live on home screens, app drawers, Windows tiles, and social cards where a solid background is required by the platform.

## 0.13.0 — 2026-06-20 — "TUI Agents"

- **Added**: **Agent hook HTTP for IDE / Electron integration** (`c5ce628`). The CLI daemon now forwards a task to a host process (IDE, Electron main, custom server) over plain HTTP. Wire format is JSON: `{ action, task, context }` POSTed to a URL configured via `KANDOWN_AGENT_HOOK_URL`. The web UI surfaces a "Send to Agent" button in the task drawer; the TUI binds `g` to the same action. Both are strictly opt-in — hidden / no-op unless the env var is set on the daemon.
- **Fixed**: **Agent launch pre-fills the task prompt** (t117, `4ce2281`). Pressing `A` on a task and picking **opencode** previously launched a blank TUI because `opencode [project]` takes a project *path* as its positional, not a message. Now uses `opencode --prompt "<message>"` so the default TUI command opens with the task context already in the composer. Bonus fix: **gemini** now uses `--prompt-interactive` (`-i`) instead of `-p/--prompt` (which Gemini's help describes as non-interactive headless) so the TUI stays interactive after the prompt runs. The tmux split-window path also forwards `KANDOWN_CONTEXT_FILE`/`KANDOWN_TASK_ID`/`KANDOWN_DIR` to the new pane (a tmux pane inherits the *server's* env, not this process's overrides).
- **Added**: **Task `depends_on` with terminal-status gate** (`40c26c6`). New `depends_on: [T-001, T-007]` frontmatter field on tasks. `moveTask(id, "done")` is rejected at the store level if any dependency isn't yet in a terminal status, with a descriptive error that surfaces in both the web and TUI UIs. The web cards show a `↪N` chip on blocked tasks; the TUI mirrors the same chip and blocks drag/drop into the terminal column with an inline `Blocked: tX ← tA, tB` message. The task detail view (web + TUI) lists the raw dependency IDs.
- **Added**: **Shellable CLI task commands** (`506b65f`). `kandown task list`, `kandown task show <id>`, `kandown task create <id>`, `kandown task move <id> <col>`, `kandown task assign <id> <agent>`, and `kandown task commit` — all JSON-stable and pipe-friendly, so agents and shell scripts can drive the board without touching the TUI.
- **Added**: **Keyboard shortcuts cheatsheet modal** (`afaac2c`). Press `?` in the TUI to open a modal listing every keybinding (board navigation, agent launch, daemon control, drag/drop, etc.). Closes on any key.
- **Added**: **Brand refresh — full favicon / app-icon set** (`2469f1b`). The new Kandown mark (white K crossed by a lime `#cef867` diagonal slash on a dark surface) replaces the old single-color QuiverAI favicon. Ships as `favicon.svg` (1.2 KB vector), PNG fallbacks at 16/32/48 px, a multi-size `favicon.ico`, `apple-touch-icon` (180), `android-chrome-192`/`512` (PWA manifest, with `purpose: "any maskable"`), `mstile-150` (Windows tile), and an `og-image` (1200×630) for social previews. The `kandownlogo.png` source is committed at the project root; the cropped/padded version is in `public/`. Vite's single-file build inlines the whole set into the bundle — no extra wiring.
- **Fixed**: **`bin/tui.js` rebuild gap.** Commit `40c26c6` shipped depends_on TUI features in source but didn't rebuild `bin/tui.js`, so v0.12.0 users running the bundled CLI wouldn't have gotten the new `↪N` chips, the `depends on:` detail line, or the move-gate. The `4ce2281` commit's `pnpm build:cli` step regenerates the bundle and closes that gap. No source change is required.

## 0.12.0 — 2026-06-18 — "Top-Level Tasks"

- **Changed**: **Tasks moved to the project root.** Task files (and `./tasks/archive/`) now live at the project root in `./tasks/`, while `.kandown/` only holds config (`kandown.json`), the web UI (`kandown.html`), agent docs (`AGENT.md`, `AGENT_KANDOWN.md`), and daemon runtime metadata. The previous layout (`.kandown/tasks/*.md`) is no longer supported.
- **Added**: Silent one-time migration. The first time a project is opened after this change, any `.kandown/tasks/*.md` is moved to `./tasks/` (plus the `archive/` subfolder). The legacy `.kandown/tasks/` directory is removed if it ends up empty. No user action required — the migration runs in the background on startup and logs a single line to the CLI.
- **Changed**: `kandown init` now creates `tasks/` at the project root instead of inside `.kandown/`. The init banner shows the new layout explicitly.
- **Changed**: The web app (File System Access mode) now asks the user to pick the **project root** (the parent of `.kandown/`) rather than `.kandown/` directly. The app derives both `.kandown/` (config) and `./tasks/` (tasks) from it. Server mode already routes through the CLI REST API, so only the server-side path needed updating.
- **Added**: New `POST /api/migrate-tasks` endpoint and `serverMigrateTasks()` browser helper. The web app calls it on startup in server mode before reading tasks, so the legacy → new layout move happens transparently.
- **Added**: `bin/kandown.js → getProjectRoot(kandownDir)`, `getTasksDir(kandownDir)`, `migrateTasksToTopLevel(kandownDir)`, plus the matching helpers in `src/cli/lib/board-reader.ts` (`getTasksDir`). All previous `kandownDir + 'tasks'` paths are now `getTasksDir(kandownDir)`.
- **Fixed**: `archiveTask` / `unarchiveTask` REST endpoints were referenced in the route handler but never defined (would 404 on every archive action). Implemented them on the new tasks path.
- **Changed**: All 48 i18n locales — `emptyState.selectFolderDesc` now tells the user to pick the project root and references both folders.
- **Changed**: `templates/AGENT.md`, `templates/AGENT_KANDOWN.md`, and `templates/README.md` document the new layout. The legacy `templates/.kandown/tasks/` (empty) is removed; sample tasks already lived at `templates/tasks/` at the top level.
- **Changed**: Default Empty State text and CLI init banner updated to reflect the new layout.

## 0.11.2 — 2026-06-17 — "TUI Category Cards"

- **Fixed**: Category task rows now use a proper dark background (`#222`) instead of the too-light ANSI `gray`. All task text (ID, title) is white for full readability on the dark block. Category tag remains magenta.

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
