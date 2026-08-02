/**
 * @file Shared domain types
 * @description Defines the board, task, config, filter, search, and appearance
 * contracts shared by the Kandown web UI, CLI, TUI, and persistence adapters.
 *
 * 📖 Keep cross-module contracts here so parser, serializer, store, React, and
 * Node entry points agree on the same task-file-backed domain model.
 *
 * @exports Priority, OwnerType, Subtask, TaskProgress, BoardTask, Column, ParsedBoard, TaskFrontmatter, ParsedTask, MoveTaskResult, SearchMatchSection, SearchMatch, TaskContent, Density, ViewMode, ThemeMode, SkinId, FontId, NotificationSoundId, Filters, ColumnRole, ColumnAgentMeta, WorkflowSelectionConfig, TaskTrackingCadence, WorkOutputDetailMode, TuiConfig, AgentsConfig, KandownConfig, DEFAULT_COLUMNS, DEFAULT_WORK_OUTPUT, DEFAULT_COLUMN_META, DEFAULT_CONFIG
 * @see src/lib/parser.ts
 * @see src/lib/store.ts
 */

export type Priority = 'P1' | 'P2' | 'P3' | 'P4' | '';

export type OwnerType = 'human' | 'ai' | '';

export interface Subtask {
  done: boolean;
  text: string;
  description?: string;
  report?: string;
}

export interface TaskProgress {
  done: number;
  total: number;
}

/** 📖 One detected AI agent, as returned by the `/api/agents` backend route.
 *  The browser cannot run `which` itself, so the daemon (or the Vite dev
 *  middleware, both Node) performs detection and hands this JSON to the web
 *  UI. Mirrors `AgentDetectionJSON` in src/cli/lib/agents.ts — keep them in
 *  sync. */
export interface DetectedAgent {
  id: string;
  name: string;
  bin: string;
  /** Whether the binary was found in $PATH by the backend's `which` check. */
  installed: boolean;
  /** 📖 Absolute path the binary resolved to, or null when not installed. The
   *  TUI picker prints it under each agent name; the web UI can surface it to
   *  answer "which install of this tool would actually run?". */
  binPath: string | null;
  interactive: boolean;
  description: string;
  aliases: string[];
  preferred?: boolean;
}

export interface BoardTask {
  id: string;
  title: string;
  checked: boolean;
  tags: string[];
  assignee: string | null;
  priority: Priority | null;
  ownerType: OwnerType;
  progress: TaskProgress | null;
  /** 📖 Effective last-activity moment as epoch ms, resolved by
   * `taskTimestamp` from `updated` → `created` → null. Drives the TUI list
   * view's `Age` column and its age sort. Null when the task file carries
   * neither timestamp. */
  updatedAt: number | null;
  /** 📖 Other task ids this task is blocked by. Surfaced as a `↪N` chip on
   * the card (N = unresolved dependency count) and as a "Blocked by" panel
   * in the task drawer. The store enforces a gate on terminal status
   * transitions based on this. */
  dependsOn: string[];
  /** 📖 Raw frontmatter metadata (structural fields + report already filtered
   * out by taskToBoardTask). The card's metadata block iterates over this to
   * render every key generically — no hardcoded field list. */
  frontmatter: Record<string, unknown>;
}

export interface Column {
  name: string;
  tasks: BoardTask[];
}

export interface ParsedBoard {
  frontmatter: Record<string, unknown> | null;
  title: string;
  columns: Column[];
}

export interface TaskFrontmatter {
  id: string;
  title: string;
  status?: string;
  order?: number | string;
  priority?: string;
  tags?: string[];
  assignee?: string;
  created?: string;
  /** 📖 ISO 8601 UTC instant (second precision) of the last mutation, stamped
   * by `stampUpdated` on every write path — CLI, MCP and web alike. Powers the
   * TUI list view's `Age` column. Preferred over the file mtime because mtime
   * does not survive a `git clone`. Absent on tasks created before the field
   * existed; readers fall back to `created`. See src/lib/task-meta.ts. */
  updated?: string;
  due?: string;
  ownerType?: OwnerType;
  tools?: string;
  report?: string;
  /** 📖 Other task ids this one is blocked by. Moving the task to the
   * terminal board column (last entry of `config.board.columns`, default
   * "Done") is rejected while any dependency is not yet in the terminal
   * status. Other transitions stay free — the gate is only on the final
   * hop, matching how GitHub / Linear / Jira treat blocking relations. */
  depends_on?: string[];
  /** When true the task is archived: hidden from the active board and stored
   * under `tasks/archive/` at the project root. The flag is the source of
   * truth; the file location mirrors it. Set/toggled by the archive/unarchive
   * actions. */
  archived?: boolean;
  [k: string]: unknown;
}

export interface ParsedTask {
  frontmatter: TaskFrontmatter;
  body: string;
}

/** Result returned by the authoritative managed-backend move operation. */
export type MoveTaskResult =
  | { ok: true; from: string; to: string; failedIds: string[] }
  | {
      ok: false;
      kind: 'dependency' | 'extension' | 'not-found' | 'invalid-target' | 'write';
      reason: string;
      blockedBy?: string[];
    };

export type SearchMatchSection = 'title' | 'subtasks' | 'context' | 'notes' | 'whatWasDone' | 'tags' | 'assignee' | 'priority';
export interface SearchMatch {
  section: SearchMatchSection;
  snippet: string;
  keyword: string;
}

export interface TaskContent {
  frontmatter: TaskFrontmatter;
  subtasks: Subtask[];
  body: string;
}

export type Density = 'compact' | 'comfortable';
export type ViewMode = 'board' | 'list';
export type ThemeMode = 'auto' | 'light' | 'dark';
export type SkinId = string;
export type FontId = 'inter' | 'system' | 'serif' | 'mono' | 'rounded';
export type BackgroundId = 'solid' | 'static-gradient';
export type NotificationSoundId = 'soft' | 'chime' | 'ping' | 'pop';

export type TokenName =
  | 'background'
  | 'foreground'
  | 'card'
  | 'card-foreground'
  | 'popover'
  | 'popover-foreground'
  | 'primary'
  | 'primary-foreground'
  | 'secondary'
  | 'secondary-foreground'
  | 'muted'
  | 'muted-foreground'
  | 'accent'
  | 'accent-foreground'
  | 'destructive'
  | 'destructive-foreground'
  | 'border'
  | 'border-strong'
  | 'border-focus'
  | 'input'
  | 'ring'
  | 'success'
  | 'warning'
  | 'grid'
  | 'grid-strong'
  | 'glass'
  | 'glass-border'
  // 📖 Code-block tokens, mode-aware: `code-bg` is light in light mode and
  // dark in dark mode so the bundled Shiki palette (github-light / github-dark)
  // always renders with high contrast. `code-fg` is the fallback for the
  // theoretical case where Shiki fails to load. `code-inline-bg` /
  // `code-inline-fg` style single-backtick `code` spans in body prose.
  // `code-block-border` separates the block from the surrounding card on
  // themes where `code-bg` is close to `card`.
  | 'code-bg'
  | 'code-fg'
  | 'code-inline-bg'
  | 'code-inline-fg'
  | 'code-block-border';

export type ThemeTokens = Record<TokenName, string>;

export interface ThemeAppearance {
  radius: string;
  borderWidth?: string;
  shadows: 'none' | 'soft' | 'elevated' | 'dramatic';
  density: 'compact' | 'comfortable' | 'relaxed';
  glass: boolean;
  motion: 'none' | 'subtle' | 'playful';
  /** 📖 Backdrop blur amount (px) when glass is on. Defaults to 20. */
  glassIntensity?: number;
  /** 📖 Optional per-level shadow overrides — when set, used instead of the
   * level-derived value (see `getShadowValue` in src/lib/theme.ts). Lets
   * contributors ship a curated theme with bespoke shadow colors that don't
   * fit the four built-in levels. */
  shadowCard?: string;
  shadowPopover?: string;
  shadowDrawer?: string;
}

export interface ThemeFonts {
  sans?: string;
  display?: string;
  mono?: string;
}

export interface KandownTheme {
  id: string;
  name: string;
  author?: string;
  description?: string;
  base?: string;
  isCustom?: boolean;
  appearance: ThemeAppearance;
  fonts?: ThemeFonts;
  light: ThemeTokens;
  dark: ThemeTokens;
  columnAccents?: Record<string, string>;
}

export type WorkOutputMode = 'blocks' | 'raw';
export type WorkOutputBaseRulesMode = 'verbose' | 'optimized' | 'caveman' | 'full' | 'concise';
export type WorkOutputDetailMode = 'caveman' | 'standard' | 'complete';
export type WorkOutputSectionId = 'baseRules' | 'projectInstructions' | 'boardDigest';
export type TaskTrackingCadence = 'live' | 'balanced' | 'economy';
export type ColumnRole = 'backlog' | 'ready' | 'active' | 'review' | 'terminal' | 'custom';

export interface ColumnAgentMeta {
  role: ColumnRole;
  instructions?: string;
}

export interface WorkflowSelectionConfig {
  active: string;
  skills: string[];
  trackingCadence: TaskTrackingCadence;
}

export interface WorkOutputConfig {
  /** 📖 Canonical instruction density consumed by the workflow compiler. */
  detailMode: WorkOutputDetailMode;
  boardDigest: {
    showColumnCounts: boolean;
    showTasks: boolean;
    showPriority: boolean;
    showAssignee: boolean;
    showBlockedBy: boolean;
    showNextActionable: boolean;
  };
}

export interface Filters {
  search: string;
  priority: Priority | null;
  tag: string | null;
  assignee: string | null;
  ownerType: OwnerType | null;
  groupBy?: 'none' | 'assignee' | 'priority' | 'epic';
}

export type ColumnColor =
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose'
  | 'slate'
  | 'gray'
  | 'zinc'
  | 'black'
  | 'blackTransparent';

export interface TuiConfig {
  defaultView: 'list' | 'board';
  showDetailPane: boolean;
  listSort: 'status' | 'age' | 'priority' | 'id';
  listSortDir: 'asc' | 'desc';
  columns: {
    age: boolean;
    status: boolean;
    priority: boolean;
    owner: boolean;
    deps: boolean;
    tags: boolean;
    assignee: boolean;
  };
}

export interface AgentsConfig {
  preferred?: string;
  extraArgs?: Record<string, string[]>;
}

export interface KandownConfig {
  ui: {
    language: string;
    theme: ThemeMode;
    skin: SkinId;
    font: FontId;
    background: BackgroundId;
    customThemes?: KandownTheme[];
    /** 📖 Per-project flag that gates the onboarding modal. Stored in
     * `.kandown/kandown.json` so each project gets its own "have I already
     * shown the tour to this user" state. Defaults to `false` in
     * `DEFAULT_CONFIG`, so new projects (and projects that never wrote the
     * key) see the tour once on first open. Set to `true` on any dismissal
     * (X, Esc, Next → last step, "Get Started"). The Settings UI can flip
     * it back to `false` to re-open the tour. */
    onboardingCompleted: boolean;
  };
  agent: {
    suggestFollowUp: boolean;
    maxSuggestions: number;
    /** 📖 Project-scoped compiler settings for `kandown work`. The actual
     * editable prose lives in `.kandown/kandown_work.md`. Historical raw-mode,
     * section-order, and core-removal fields are accepted during normalization
     * but never enter this canonical contract or affect the immutable core. */
    workOutput: WorkOutputConfig;
  };
  workflow: WorkflowSelectionConfig;
  board: {
    columns: string[];
    defaultPriority: string;
    defaultOwnerType: 'human' | 'ai';
    columnColors?: Record<string, ColumnColor>;
    wipLimits?: Record<string, number>;
    columnMeta: Record<string, ColumnAgentMeta>;
    /** 📖 Default visual state for groups of tasks sharing the same `[bracket]`
     * or `#hashtag` title tag. `'collapsed'` shows them as a single stacked
     * summary card (click to expand), `'expanded'` always renders the
     * individual cards inline. Search forces `'expanded'` regardless of this
     * value so match highlights stay visible. */
    stackDefaultState: 'collapsed' | 'expanded';
  };
  tui: TuiConfig;
  fields: {
    priority: boolean;
    assignee: boolean;
    tags: boolean;
    dueDate: boolean;
    ownerType: boolean;
    tools: boolean;
  };
  notifications: {
    browser: boolean;
    sound: boolean;
    soundId: NotificationSoundId;
    statusChanges: boolean;
    taskEdits: boolean;
    subtaskCompletions: boolean;
    editDebounceMs: number;
    webhookUrl?: string;
  };
  /** 📖 Extension system settings. `restricted` defaults to true (the Obsidian
   *  model): community/global extensions load disabled until the user enables
   *  them. See docs/EXTENSIONS.md § "Security model". */
  extensions: {
    restricted: boolean;
  };
  agents?: AgentsConfig;
}

export const DEFAULT_COLUMNS = ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'];

export const DEFAULT_WORK_OUTPUT: WorkOutputConfig = {
  detailMode: 'complete',
  boardDigest: {
    showColumnCounts: true,
    showTasks: true,
    showPriority: true,
    showAssignee: true,
    showBlockedBy: true,
    showNextActionable: true,
  },
};

export const DEFAULT_COLUMN_META: Record<string, ColumnAgentMeta> = {
  Backlog: {
    role: 'backlog',
    instructions: 'Capture unscheduled work here. Keep enough context to decide whether it belongs in this workflow.',
  },
  Todo: {
    role: 'ready',
    instructions: 'Only move work here when its required inputs, acceptance criteria, dependencies, and approvals are ready.',
  },
  'In Progress': {
    role: 'active',
    instructions: 'Execute the current workflow phase, update the checklist as work happens, and record blockers immediately.',
  },
  Review: {
    role: 'review',
    instructions: 'Require completed verification, reproducible evidence, and the workflow-specific review gate before acceptance.',
  },
  Done: {
    role: 'terminal',
    instructions: 'Only accept work whose criteria and required review are satisfied. Preserve the completion report and evidence.',
  },
};

export const DEFAULT_CONFIG: KandownConfig = {
  ui: { language: 'en', theme: 'auto', skin: 'kandown', font: 'inter', background: 'solid', onboardingCompleted: false },
  agent: { suggestFollowUp: false, maxSuggestions: 3, workOutput: DEFAULT_WORK_OUTPUT },
  workflow: { active: 'kandown-standard', skills: [], trackingCadence: 'balanced' },
  board: {
    columns: DEFAULT_COLUMNS,
    defaultPriority: 'P3',
    defaultOwnerType: 'human',
    columnColors: {
      backlog: 'red',
      todo: 'blue',
      'in progress': 'orange',
      review: 'violet',
      done: 'green',
    },
    columnMeta: DEFAULT_COLUMN_META,
    stackDefaultState: 'collapsed',
  },
  tui: {
    defaultView: 'list',
    showDetailPane: true,
    listSort: 'status',
    listSortDir: 'asc',
    columns: {
      age: true,
      status: true,
      priority: true,
      owner: true,
      deps: true,
      tags: false,
      assignee: true,
    },
  },
  fields: {
    priority: false,
    assignee: false,
    tags: false,
    dueDate: false,
    ownerType: false,
    tools: false,
  },
  notifications: {
    browser: false,
    sound: false,
    soundId: 'soft',
    statusChanges: true,
    taskEdits: true,
    subtaskCompletions: true,
    editDebounceMs: 2000,
  },
  extensions: {
    restricted: true,
  },
};
