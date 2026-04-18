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
  due?: string;
  ownerType?: OwnerType;
  tools?: string;
  report?: string;
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
export type SkinId = 'kandown' | 'graphite' | 'sage' | 'cobalt' | 'rose';
export type FontId = 'inter' | 'system' | 'serif' | 'mono' | 'rounded';
export type BackgroundId = 'solid' | 'liquid-ether';
export type NotificationSoundId = 'soft' | 'chime' | 'ping' | 'pop';

export interface Filters {
  search: string;
  priority: Priority | null;
  tag: string | null;
  assignee: string | null;
  ownerType: OwnerType | null;
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
  };
  agent: {
    suggestFollowUp: boolean;
    maxSuggestions: number;
  };
  board: {
    columns: string[];
    taskPrefix: string;
    defaultPriority: string;
    defaultOwnerType: 'human' | 'ai';
    columnColors?: Record<string, ColumnColor>;
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
  };
}

export const DEFAULT_COLUMNS = ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'];

export const DEFAULT_CONFIG: KandownConfig = {
  ui: { language: 'en', theme: 'auto', skin: 'kandown', font: 'inter', background: 'solid' },
  agent: { suggestFollowUp: false, maxSuggestions: 3 },
  board: {
    columns: DEFAULT_COLUMNS,
    taskPrefix: 't',
    defaultPriority: 'P3',
    defaultOwnerType: 'human',
    columnColors: {
      backlog: 'red',
      todo: 'blue',
      'in progress': 'orange',
      review: 'violet',
      done: 'green',
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
};
