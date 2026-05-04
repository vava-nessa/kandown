# Graph Report - /Users/vava/Documents/GitHub/kandown  (2026-05-04)

## Corpus Check
- 77 files · ~264,976 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 746 nodes · 1344 edges · 56 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 127 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_File Watcher System|File Watcher System]]
- [[_COMMUNITY_Filesystem API Layer|Filesystem API Layer]]
- [[_COMMUNITY_CLI Command Router|CLI Command Router]]
- [[_COMMUNITY_Markdown Processing|Markdown Processing]]
- [[_COMMUNITY_Agent Integration|Agent Integration]]
- [[_COMMUNITY_Board UI Components|Board UI Components]]
- [[_COMMUNITY_TUI Rendering Helpers|TUI Rendering Helpers]]
- [[_COMMUNITY_i18n & Store State|i18n & Store State]]
- [[_COMMUNITY_TUI Core Lifecycle|TUI Core Lifecycle]]
- [[_COMMUNITY_TUI Utility Functions|TUI Utility Functions]]
- [[_COMMUNITY_Board TUI Logic|Board TUI Logic]]
- [[_COMMUNITY_ANSI Parser|ANSI Parser]]
- [[_COMMUNITY_Notifications|Notifications]]
- [[_COMMUNITY_TUI Token Processing|TUI Token Processing]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 50|Community 50]]
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
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]

## God Nodes (most connected - your core abstractions)
1. `push()` - 44 edges
2. `get()` - 38 edges
3. `set()` - 37 edges
4. `has()` - 31 edges
5. `add()` - 20 edges
6. `useStore` - 15 edges
7. `L()` - 14 edges
8. `log()` - 13 edges
9. `cmdServe()` - 12 edges
10. `"node_modules/.pnpm/react-reconciler@0.33.0_react@19.2.5/node_modules/react-reconciler/cjs/react-reconciler.development.js"()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `app` --conceptually_related_to--> `Kandown Favicon SVG`  [INFERRED]
  src/lib/i18n/locales/en.json → public/favicon.svg
- `drawer` --conceptually_related_to--> `TaskFrontmatter`  [INFERRED]
  src/lib/i18n/locales/en.json → src/lib/types.ts
- `cn()` --conceptually_related_to--> `ViewMode`  [INFERRED]
  /Users/vava/Documents/GitHub/kandown/src/lib/utils.ts → src/lib/types.ts
- `cn()` --conceptually_related_to--> `Density`  [INFERRED]
  /Users/vava/Documents/GitHub/kandown/src/lib/utils.ts → src/lib/types.ts
- `syncNotificationSnapshots()` --calls--> `useStore`  [EXTRACTED]
  /Users/vava/Documents/GitHub/kandown/src/lib/store.ts → src/lib/store.ts

## Hyperedges (group relationships)
- **CLI Command System** — kandown_cli, tui_entry_point, tui_screen_router, settings_screen, board_screen, agent_picker [EXTRACTED 1.00]
- **Board TUI Architecture** — board_screen, board_reader, file_watcher, launcher, agent_picker, config_manager [EXTRACTED 1.00]
- **BlockNote Markdown Idempotence Tools** — migrate_md_blocknote_script, check_md_idempotence_script, blocknote_markdown_pipeline [EXTRACTED 1.00]
- **UI Overlay Layer** — conflictmodal, commandpalette, drawer, toaster [EXTRACTED 0.90]
- **Search Highlight System** — card_highlightedtext, commandpalette_highlightedtext, searchtaskcontent, filterbar [EXTRACTED 0.85]
- **Task Editor Chain** — drawer, subtaskitem, column, card [EXTRACTED 0.80]
- **Board rendering pipeline** — board, column, card, cardstack [EXTRACTED 1.00]
- **Drawer editing system** — drawer, subtaskitem, blocknote_markdown_editor, markdown_editor [EXTRACTED 1.00]
- **Store state management** — board, column, card, use_store [EXTRACTED 1.00]
- **i18n Locale Sections** — i18n_app, i18n_settings, i18n_drawer, i18n_conflict, i18n_commandpalette, i18n_subtask, i18n_filterbar, i18n_emptystate, i18n_column, i18n_listview [EXTRACTED 1.00]
- **Board Task Management Functions** — store_movetask, store_createtask, store_savedrawer [EXTRACTED 1.00]
- **Store State Types** — types_kandownconfig, types_taskfrontmatter, types_boardtask, types_column, types_subtask, types_taskcontent, types_filters, types_viewmode, types_density [EXTRACTED 1.00]

## Communities

### Community 1 - "File Watcher System"
Cohesion: 0.07
Nodes (56): isAgentInstalled(), FileWatcher, hashFile(), hashFileSync(), add(), _addIgnoredPath(), _addPathCloser(), _addToNodeFs() (+48 more)

### Community 2 - "Filesystem API Layer"
Cohesion: 0.07
Nodes (37): apiFetch(), deleteTaskFile(), ensureTasksDir(), getKandownHandle(), getServerRoot(), isServerMode(), listRecentProjects(), listTaskIds() (+29 more)

### Community 3 - "CLI Command Router"
Cohesion: 0.11
Nodes (45): handleDeleteClick(), apiHeaders(), appendAgentReference(), checkForUpdate(), cmdInit(), cmdServe(), cmdTui(), cmdUpdate() (+37 more)

### Community 4 - "Markdown Processing"
Cohesion: 0.06
Nodes (44): extractGroupKey(), groupTasksByTag(), toDisplayKey(), reassembleMarkdown(), appendTrailingAnsiTokens(), applyGraphemeMetadata(), areValuesInSameGrapheme(), buildColumnsFromTasks() (+36 more)

### Community 5 - "Agent Integration"
Cohesion: 0.07
Nodes (27): buildPrompt(), getAgentById(), calcColWidth(), pad(), getProjectRoot(), listTaskIds(), moveTaskToColumn(), readAgentDoc() (+19 more)

### Community 6 - "Board UI Components"
Cohesion: 0.09
Nodes (32): BlockNoteMarkdownEditor component, Board, Card, HighlightedText (Card), CardStack component, Collapsible detail panel (SubtaskItem), Column, ColumnColorMenu component (+24 more)

### Community 7 - "TUI Rendering Helpers"
Cohesion: 0.11
Nodes (29): Aa(), ab(), Ba(), bb(), c(), d(), Da(), db() (+21 more)

### Community 8 - "i18n & Store State"
Cohesion: 0.08
Nodes (28): conflict, drawer, settings, subtask, applyConfigTheme(), computeSearchMatches, ConflictState, createTask (+20 more)

### Community 9 - "TUI Core Lifecycle"
Cohesion: 0.1
Nodes (24): applySgrFragments(), applySgrToken2(), clear(), close(), confirmKittySupport(), dispose(), enableKittyProtocol(), getActiveCursor() (+16 more)

### Community 10 - "TUI Utility Functions"
Cohesion: 0.12
Nodes (17): anymatch(), arrify(), autoBind(), constructor(), _exploreDir(), _formatEntry(), _getEntryType(), _includeAsFile() (+9 more)

### Community 11 - "Board TUI Logic"
Cohesion: 0.12
Nodes (17): Board(), buildPrompt(), buildShellCmd(), calcColWidth(), getAgentById(), getProjectRoot(), isInTmux(), launchAgent() (+9 more)

### Community 12 - "ANSI Parser"
Cohesion: 0.18
Nodes (11): createControlParseResult(), createSgrCode(), getSgrFragments(), getSgrPrefix(), isCsiFinalCharacter(), isCsiIntermediateCharacter(), isCsiParameterCharacter(), isSgrParameterCharacter() (+3 more)

### Community 13 - "Notifications"
Cohesion: 0.22
Nodes (10): emitKandownNotification(), getBrowserNotificationPermission(), playNotificationSound(), requestBrowserNotificationPermission(), handleRequestNotificationPermission(), b(), ib(), T() (+2 more)

### Community 14 - "TUI Token Processing"
Cohesion: 0.2
Nodes (10): applyHyperlinkToken(), applyToken(), cliTruncate(), closeHyperlink(), createHasContinuationAheadMap(), discardPendingHyperlink(), getIndexOfNearestSpace(), isPastEndBoundary() (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.2
Nodes (10): ar, de, en, es, fr, ja, ko, languageNames (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (9): baseVisible(), eastAsianWidth(), isDoubleWidthNonRgiEmojiSequence(), isZeroWidthCluster(), stringWidth(), stripAnsi(), trailingHalfwidthWidth(), validate() (+1 more)

### Community 18 - "Community 18"
Cohesion: 0.28
Nodes (9): Agent Picker Overlay, Board Reader, Board TUI Screen, Configuration Manager, File Watcher, Agent Launcher, Settings TUI Screen, TUI Entry Point (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (7): Version Injection Script, PostCSS Configuration, Tailwind CSS Configuration, Tailwind CSS Design System, Vite Configuration with Dev API Server, Web Application Shell, Web Browser Entry Point

### Community 21 - "Community 21"
Cohesion: 0.6
Nodes (5): entryPath(), filterDir(), filterPath(), _hasReadPermissions(), _isntIgnored()

### Community 22 - "Community 22"
Cohesion: 0.4
Nodes (5): createSupportsColor(), envForceColor(), hasFlag(), _supportsColor(), translateLevel()

### Community 23 - "Community 23"
Cohesion: 0.4
Nodes (5): ansiCodesToString(), diffAnsiCodes(), reduceAnsiCodes(), styledCharsToString(), undoAnsiCodes2()

### Community 24 - "Community 24"
Cohesion: 0.5
Nodes (4): awaitExit(), awaitNextRender(), hasPendingConcurrentWork(), waitUntilRenderFlush()

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (4): KanbanColumn(), pad(), TaskRow(), truncate()

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (2): BlockNoteMarkdownEditor(), useBlockNoteTheme()

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (3): Mb(), sa(), za()

### Community 28 - "Community 28"
Cohesion: 0.67
Nodes (3): $a(), na(), Pa()

### Community 30 - "Community 30"
Cohesion: 0.67
Nodes (2): handler(), focus()

### Community 35 - "Community 35"
Cohesion: 0.67
Nodes (3): Kandown CLI Entrypoint, tsup Build Configuration, Bundled TUI Runtime

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (3): BlockNote Markdown Pipeline, Markdown Idempotence Checker, BlockNote Markdown Migration Script

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (3): Kandown Favicon SVG, app, Kandown PWA Manifest

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (2): findSGRSequenceEndIndex(), parseSGRSequence()

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (2): debounce(), debounce2()

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (2): cleanup(), unmount()

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (2): SettingRow, SkinPicker

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (1): Sync Agent Kandown Script

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (1): Three.js Type Declarations

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (1): SearchResults

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (1): ColumnColorMenu

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (1): TaskForm component

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (1): TagInput component

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (1): PrioritySelect component

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (1): AssigneeInput component

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (1): DatePicker component

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (1): OwnerTypeSelect component

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (1): Column color picker (COLOR_SWATCHES)

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (1): Autosave UX pattern

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (1): ThemeMode

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (1): DEFAULT_COLUMNS

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (1): openFolder

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (1): openServerProject

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (1): resolveConflict

### Community 84 - "Community 84"
Cohesion: 1.0
Nodes (1): commandPalette

### Community 85 - "Community 85"
Cohesion: 1.0
Nodes (1): filterBar

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (1): emptyState

### Community 87 - "Community 87"
Cohesion: 1.0
Nodes (1): column

### Community 88 - "Community 88"
Cohesion: 1.0
Nodes (1): listView

## Knowledge Gaps
- **67 isolated node(s):** `tsup Build Configuration`, `Version Injection Script`, `Sync Agent Kandown Script`, `Kandown CLI Entrypoint`, `Web Browser Entry Point` (+62 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 26`** (4 nodes): `BlockNoteMarkdownEditor()`, `buildBlockNoteTheme()`, `useBlockNoteTheme()`, `BlockNoteMarkdownEditor.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (3 nodes): `handler()`, `App.tsx`, `focus()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `findSGRSequenceEndIndex()`, `parseSGRSequence()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `debounce()`, `debounce2()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `cleanup()`, `unmount()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `SettingRow`, `SkinPicker`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `Sync Agent Kandown Script`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `Three.js Type Declarations`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `SearchResults`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `ColumnColorMenu`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `TaskForm component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `TagInput component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `PrioritySelect component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `AssigneeInput component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `DatePicker component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `OwnerTypeSelect component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `Column color picker (COLOR_SWATCHES)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `Autosave UX pattern`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `ThemeMode`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `DEFAULT_COLUMNS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `openFolder`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `openServerProject`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `resolveConflict`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `commandPalette`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (1 nodes): `filterBar`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `emptyState`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `column`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (1 nodes): `listView`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `clear()` connect `TUI Core Lifecycle` to `TUI Runtime Engine`, `File Watcher System`, `Filesystem API Layer`, `CLI Command Router`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `syncNotificationSnapshots()` connect `Filesystem API Layer` to `i18n & Store State`, `TUI Core Lifecycle`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `useStore` connect `i18n & Store State` to `Filesystem API Layer`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `push()` (e.g. with `reassembleMarkdown()` and `serializeTaskFile()`) actually correct?**
  _`push()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `get()` (e.g. with `.on()` and `.handleFsEvent()`) actually correct?**
  _`get()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `set()` (e.g. with `.start()` and `.on()`) actually correct?**
  _`set()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `has()` (e.g. with `.on()` and `.checkTaskContentChange()`) actually correct?**
  _`has()` has 6 INFERRED edges - model-reasoned connections that need verification._