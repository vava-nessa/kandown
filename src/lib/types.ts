export type Priority = 'P1' | 'P2' | 'P3' | 'P4' | '';

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
}
