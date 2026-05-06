# Graph Report - /Users/vava/Documents/GitHub/kandown  (2026-05-04)

## Corpus Check
- 77 files · ~264,976 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 363 nodes · 404 edges · 49 communities detected
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Board UI Components|Board UI Components]]
- [[_COMMUNITY_Agent Integration|Agent Integration]]
- [[_COMMUNITY_CLI Screen Router|CLI Screen Router]]
- [[_COMMUNITY_i18n & Store State|i18n & Store State]]
- [[_COMMUNITY_Filesystem API Layer|Filesystem API Layer]]
- [[_COMMUNITY_Theme & Config System|Theme & Config System]]
- [[_COMMUNITY_File Watcher Core|File Watcher Core]]
- [[_COMMUNITY_Notifications System|Notifications System]]
- [[_COMMUNITY_Architecture Overview|Architecture Overview]]
- [[_COMMUNITY_Watcher Implementation|Watcher Implementation]]
- [[_COMMUNITY_Dev Server & Vite|Dev Server & Vite]]
- [[_COMMUNITY_BlockNote Editor|BlockNote Editor]]
- [[_COMMUNITY_Task Grouping|Task Grouping]]
- [[_COMMUNITY_Markdown Pipeline|Markdown Pipeline]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]

## God Nodes (most connected - your core abstractions)
1. `SettingsPage` - 16 edges
2. `useStore (Zustand central state)` - 15 edges
3. `FileWatcher` - 12 edges
4. `FileWatcher` - 10 edges
5. `launchAgent()` - 10 edges
6. `isServerMode()` - 9 edges
7. `apiFetch()` - 9 edges
8. `Board TUI Screen` - 8 edges
9. `Zustand store (central state)` - 8 edges
10. `buildColumnsFromTasks()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `useStore (Zustand central state)` --semantically_similar_to--> `FileWatcher`  [INFERRED] [semantically similar]
  src/lib/store.ts → /Users/vava/Documents/GitHub/kandown/src/lib/watcher.ts
- `useStore (Zustand central state)` --semantically_similar_to--> `buildColumnsFromTasks()`  [INFERRED] [semantically similar]
  src/lib/store.ts → /Users/vava/Documents/GitHub/kandown/src/lib/parser.ts
- `useStore (Zustand central state)` --semantically_similar_to--> `extractSubtasks()`  [INFERRED] [semantically similar]
  src/lib/store.ts → /Users/vava/Documents/GitHub/kandown/src/lib/parser.ts
- `Dev API Server (Express-style)` --conceptually_related_to--> `Node.js Task Reader/Mutator`  [INFERRED]
  vite.config.ts → src/cli/lib/board-reader.ts
- `buildColumnsFromTasks()` --uses--> `Column (board column type)`  [EXTRACTED]
  /Users/vava/Documents/GitHub/kandown/src/lib/parser.ts → src/lib/types.ts

## Hyperedges (group relationships)
- **BlockNote Markdown Idempotence Pipeline** — migrate_md_blocknote_script, check_md_idempotence_script, blocknote [EXTRACTED 1.00]
- **Kandown TUI Architecture** — cli_tui_tsx, cli_app_tsx, settings_screen, board_screen, agent_picker_screen, file_watcher, launcher, board_reader, config_module, alternate_screen_buffer [EXTRACTED 0.95]
- **Kandown Web App Architecture** — main_tsx, app_tsx, zustand_store, i18n_module [EXTRACTED 0.90]
- **Board view hierarchy (Board → Column → Card/CardStack)** — board, column, card, cardstack [EXTRACTED 1.00]
- **Settings UI subsystem (SettingsPage + sub-components)** — settingspage, settingrow, settingdef, settings_section, skinpicker, languagedropdown, settinghelp, aboutversioncard, searchresults [EXTRACTED 1.00]
- **Conflict resolution flow (ConflictModal + store.resolveConflict)** — conflictmodal, store [EXTRACTED 1.00]
- **Task state management pipeline** — types_taskfrontmatter, types_subtask, types_taskcontent, parser_extractsubtasks, parser_injectsubtasks [EXTRACTED 0.85]
- **File watching and notification system** — watcher_filewatcher, watcher_conflicttype, store_usestore, types_kandownconfig [EXTRACTED 0.85]
- **Core UI i18n keys** — i18n_key_drawer, i18n_key_priority, i18n_key_assignee, i18n_key_tags, i18n_key_conflict, i18n_key_settings [EXTRACTED 0.85]
- **i18n Key Structure Across Locales** — i18n_key_app, i18n_key_common, i18n_key_emptyState, i18n_key_header, i18n_key_filterBar, i18n_key_column, i18n_key_card, i18n_key_drawer, i18n_key_subtask, i18n_key_commandPalette, i18n_key_listView, i18n_key_settings, i18n_key_conflict, i18n_key_sectionLabels, i18n_key_toast [EXTRACTED 1.00]
- **Board Column System** — kanban_board_columns, board_view, list_view, mutation_rules [EXTRACTED 0.95]
- **Task Management Features** — task_file_format, task_lifecycle, rich_task_drawer, subtasks, task_metadata_fields [EXTRACTED 0.90]

## Communities

### Community 0 - "Board UI Components"
Cohesion: 0.06
Nodes (36): AboutVersionCard, BACKGROUND_OPTIONS, Board, BrowserNotificationPermission, Card, Card two-click delete (arm-then-confirm), CardStack, Column (+28 more)

### Community 1 - "Agent Integration"
Cohesion: 0.09
Nodes (18): buildPrompt(), getAgentById(), calcColWidth(), pad(), getProjectRoot(), listTaskIds(), moveTaskToColumn(), readAgentDoc() (+10 more)

### Community 2 - "CLI Screen Router"
Cohesion: 0.08
Nodes (31): AgentDef Type, Agent Launch Flow, Agent Picker Overlay, Alternate Screen Buffer (Terminal), Web Application Shell, Node.js Task Reader/Mutator, Board TUI Screen, Chokidar File Watcher (+23 more)

### Community 3 - "i18n & Store State"
Cohesion: 0.11
Nodes (26): conflict (i18n key), owner (i18n key), priority (i18n key), subtasks (i18n key), buildColumnsFromTasks(), extractSubtasks(), injectSubtasks(), normalizeOwnerType() (+18 more)

### Community 4 - "Filesystem API Layer"
Cohesion: 0.14
Nodes (26): apiFetch(), deleteTaskFile(), ensureTasksDir(), getKandownHandle(), getServerRoot(), isServerMode(), listRecentProjects(), listTaskIds() (+18 more)

### Community 5 - "Theme & Config System"
Cohesion: 0.13
Nodes (9): readConfigFile(), applyConfigTheme(), readAllTasks(), readAllTasksServer(), applyProjectTheme(), normalizeFontId(), normalizeSkinId(), normalizeThemeMode() (+1 more)

### Community 6 - "File Watcher Core"
Cohesion: 0.23
Nodes (3): FileWatcher, hashFile(), hashFileSync()

### Community 7 - "Notifications System"
Cohesion: 0.18
Nodes (7): emitKandownNotification(), getBrowserNotificationPermission(), playNotificationSound(), requestBrowserNotificationPermission(), close(), handleKey(), handleRequestNotificationPermission()

### Community 8 - "Architecture Overview"
Cohesion: 0.15
Nodes (14): AI Agent Integration, Board View, Dual Interface (Web UI + TUI), Favicon SVG, i18n System (48 Languages), Kanban Board Columns, Kandown, List View (+6 more)

### Community 9 - "Watcher Implementation"
Cohesion: 0.31
Nodes (3): FileWatcher, readConfigFileText(), readTaskFileText()

### Community 11 - "Dev Server & Vite"
Cohesion: 0.22
Nodes (4): Dev API Server (Express-style), Vite Configuration with Dev API Server, Vite React Plugin, Vite Single File Plugin

### Community 12 - "BlockNote Editor"
Cohesion: 0.67
Nodes (2): BlockNoteMarkdownEditor(), useBlockNoteTheme()

### Community 13 - "Task Grouping"
Cohesion: 0.83
Nodes (3): extractGroupKey(), groupTasksByTag(), toDisplayKey()

### Community 14 - "Markdown Pipeline"
Cohesion: 0.83
Nodes (4): BlockNote Editor, BlockNote Markdown Idempotence, Markdown Idempotence Checker, BlockNote Markdown Migration Script

### Community 15 - "Community 15"
Cohesion: 0.5
Nodes (4): Command Palette, commandPalette (i18n key), drawer (i18n key), settings (i18n key)

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (3): PostCSS Configuration, Tailwind CSS Configuration, Tailwind CSS

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (2): Subtask auto-close timer (3s), SubtaskItem

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (2): Rich Task Drawer, Subtasks

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (1): Three.js Type Declarations

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (1): ConflictVersion

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (1): CommandItem

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): kickerAbout (i18n key)

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (1): aboutDesc (i18n key)

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (1): ColumnColorMenu

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (1): getColumnIcon

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (1): columnIconsByName (icon map)

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (1): ColumnColor

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (1): assignee (i18n key)

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (1): tags (i18n key)

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (1): language (i18n key)

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (1): columns (i18n key)

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (1): notifications (i18n key)

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (1): commandPalette (i18n key)

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (1): listView (i18n key)

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (1): board (i18n key)

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (1): conflict.detected (i18n key)

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (1): app (i18n key)

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (1): common (i18n key)

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (1): emptyState (i18n key)

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (1): header (i18n key)

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (1): filterBar (i18n key)

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (1): column (i18n key)

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (1): card (i18n key)

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (1): subtask (i18n key)

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (1): listView (i18n key)

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (1): sectionLabels (i18n key)

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (1): toast (i18n key)

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (1): Task Metadata Fields

### Community 84 - "Community 84"
Cohesion: 1.0
Nodes (1): Appearance Customization

## Knowledge Gaps
- **94 isolated node(s):** `Tailwind CSS Configuration`, `tsup Build Configuration`, `PostCSS Configuration`, `AGENT_KANDOWN.md Sync Script`, `Three.js Type Declarations` (+89 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `BlockNote Editor`** (4 nodes): `BlockNoteMarkdownEditor()`, `buildBlockNoteTheme()`, `useBlockNoteTheme()`, `BlockNoteMarkdownEditor.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `Subtask auto-close timer (3s)`, `SubtaskItem`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `Rich Task Drawer`, `Subtasks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `Three.js Type Declarations`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `ConflictVersion`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `CommandItem`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `kickerAbout (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `aboutDesc (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `ColumnColorMenu`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `getColumnIcon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `columnIconsByName (icon map)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `ColumnColor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `assignee (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `tags (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `language (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `columns (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `notifications (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `commandPalette (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `listView (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `board (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `conflict.detected (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `app (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `common (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `emptyState (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `header (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `filterBar (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `column (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `card (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `subtask (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `listView (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `sectionLabels (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `toast (i18n key)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `Task Metadata Fields`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `Appearance Customization`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Chokidar File Watcher` connect `CLI Screen Router` to `File Watcher Core`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Why does `Node.js Task Reader/Mutator` connect `CLI Screen Router` to `Dev Server & Vite`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useStore (Zustand central state)` (e.g. with `buildColumnsFromTasks()` and `extractSubtasks()`) actually correct?**
  _`useStore (Zustand central state)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `launchAgent()` (e.g. with `getAgentById()` and `readTask()`) actually correct?**
  _`launchAgent()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Tailwind CSS Configuration`, `tsup Build Configuration`, `PostCSS Configuration` to the rest of the system?**
  _94 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Board UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Agent Integration` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._