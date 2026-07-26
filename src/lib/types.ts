/**
 * @file Shared domain types
 * @description Defines the board, task, config, filter, search, and appearance
 * types used by the Kandown web UI and persistence layer.
 *
 * 📖 Keep cross-module contracts here so parser, serializer, store, and React
 * components agree on the same task-file-backed domain model.
 *
 * @exports Priority, OwnerType, Subtask, TaskProgress, BoardTask, Column, ParsedBoard, TaskFrontmatter, ParsedTask, SearchMatchSection, SearchMatch, TaskContent, Density, ViewMode, ThemeMode, SkinId, FontId, NotificationSoundId, Filters, KandownConfig, DEFAULT_COLUMNS, DEFAULT_CONFIG
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
  | 'glass-border';

export type ThemeTokens = Record<TokenName, string>;

export interface ThemeAppearance {
  radius: string;
  borderWidth?: string;
  shadows: 'none' | 'soft' | 'elevated' | 'dramatic';
  density: 'compact' | 'comfortable' | 'relaxed';
  glass: boolean;
  motion: 'none' | 'subtle' | 'playful';
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
export type WorkOutputSectionId = 'baseRules' | 'projectInstructions' | 'boardDigest';

export interface WorkOutputConfig {
  mode: WorkOutputMode;
  includeBaseRules: boolean;
  baseRulesMode: WorkOutputBaseRulesMode;
  includeProjectInstructions: boolean;
  includeBoardDigest: boolean;
  sectionOrder: WorkOutputSectionId[];
  rawTemplate: string;
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

export interface KandownConfig {
  ui: {
    language: string;
    theme: ThemeMode;
    skin: SkinId;
    font: FontId;
    background: BackgroundId;
    customThemes?: KandownTheme[];
  };
  agent: {
    suggestFollowUp: boolean;
    maxSuggestions: number;
    /** 📖 Project-scoped renderer settings for `kandown work`. The actual
     * editable prose lives in `.kandown/instructions.md`; this config controls
     * which generated blocks are printed and optionally replaces the full
     * output with a raw template using `{{baseRules}}`, `{{projectInstructions}}`,
     * and `{{boardDigest}}` placeholders. */
    workOutput: WorkOutputConfig;
  };
  board: {
    columns: string[];
    defaultPriority: string;
    defaultOwnerType: 'human' | 'ai';
    columnColors?: Record<string, ColumnColor>;
    wipLimits?: Record<string, number>;
    /** 📖 Default visual state for groups of tasks sharing the same `[bracket]`
     * or `#hashtag` title tag. `'collapsed'` shows them as a single stacked
     * summary card (click to expand), `'expanded'` always renders the
     * individual cards inline. Search forces `'expanded'` regardless of this
     * value so match highlights stay visible. */
    stackDefaultState: 'collapsed' | 'expanded';
  };
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
}

export const DEFAULT_COLUMNS = ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'];

export const DEFAULT_WORK_OUTPUT: WorkOutputConfig = {
  mode: 'blocks',
  includeBaseRules: true,
  baseRulesMode: 'full',
  includeProjectInstructions: true,
  includeBoardDigest: true,
  sectionOrder: ['baseRules', 'projectInstructions', 'boardDigest'],
  rawTemplate: '{{baseRules}}\n\n---\n\n{{projectInstructions}}\n\n---\n\n{{boardDigest}}',
  boardDigest: {
    showColumnCounts: true,
    showTasks: true,
    showPriority: true,
    showAssignee: true,
    showBlockedBy: true,
    showNextActionable: true,
  },
};

export const DEFAULT_CONFIG: KandownConfig = {
  ui: { language: 'en', theme: 'auto', skin: 'kandown', font: 'inter', background: 'solid' },
  agent: { suggestFollowUp: false, maxSuggestions: 3, workOutput: DEFAULT_WORK_OUTPUT },
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
    stackDefaultState: 'collapsed',
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
};
