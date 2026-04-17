export type Priority = 'P1' | 'P2' | 'P3' | 'P4' | '';

export type OwnerType = 'human' | 'ai' | '';

export interface Subtask {
  done: boolean;
  text: string;
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
  priority?: string;
  tags?: string[];
  assignee?: string;
  created?: string;
  due?: string;
  ownerType?: OwnerType;
  tools?: string;
  [k: string]: unknown;
}

export interface ParsedTask {
  frontmatter: TaskFrontmatter;
  body: string;
}

export type Density = 'compact' | 'comfortable';
export type ViewMode = 'board' | 'list';

export interface Filters {
  search: string;
  priority: Priority | null;
  tag: string | null;
  assignee: string | null;
  ownerType: OwnerType | null;
}

export interface KandownConfig {
  ui: {
    language: string;
    theme: 'auto' | 'light' | 'dark';
  };
  agent: {
    suggestFollowUp: boolean;
    maxSuggestions: number;
  };
  board: {
    taskPrefix: string;
    defaultPriority: string;
    defaultOwnerType: 'human' | 'ai';
  };
  fields: {
    priority: boolean;
    assignee: boolean;
    tags: boolean;
    dueDate: boolean;
    ownerType: boolean;
  };
}

export const DEFAULT_CONFIG: KandownConfig = {
  ui: { language: 'en', theme: 'auto' },
  agent: { suggestFollowUp: false, maxSuggestions: 3 },
  board: { taskPrefix: 't', defaultPriority: 'P3', defaultOwnerType: 'human' },
  fields: {
    priority: false,
    assignee: false,
    tags: false,
    dueDate: false,
    ownerType: false,
  },
};
