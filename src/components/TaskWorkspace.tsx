/**
 * @file Desktop opened-task workspace
 * @description Replaces the desktop task modal with a split workspace: a
 * grouped task navigator on the left and the existing task editor surface on
 * the right, including the shared markdown-backed subtask editor, while mobile
 * keeps using the original modal drawer.
 *
 * 📖 The workspace deliberately reuses the drawer store state and save actions
 * instead of creating a second editing model. That keeps autosave, conflict
 * detection, URL deep-links, archive/delete actions, and task-file persistence
 * aligned with the existing drawer behavior.
 * 📖 Task switching is guarded when the current editor has unsaved changes so
 * quick navigation does not silently throw away draft text.
 * 📖 The left navigator has two grouping modes, switched by a small segmented
 * control and persisted in localStorage (`kandown:tasklist-group`):
 *    - `status` (default): one section per board column, collapse state kept
 *      in `collapsedSections`.
 *    - `category`: one section per category, case insensitive, with an
 *      "Uncategorized" fallback group. The category comes from the
 *      frontmatter `category:` field, falling back to a legacy leading
 *      `[CATEGORY]` title tag. Tasks inside a
 *      category are sorted by board column order, then priority. Opening a
 *      task auto-expands its own category and collapses the others, then
 *      scrolls it into view. Collapse state is tracked separately per mode.
 * 📖 Live agent edits (t309): while an agent session edits the open task
 *    (`agent_edit_started` board events), the editor locks to read-only
 *    (title, category, description, subtasks, report, dependencies), shows
 *    the session's blob avatar in the header and renders the DiffOverlay
 *    live-diff panel under the title. Unlocks on `agent_edit_ended`.
 *
 * @functions
 *  → TaskWorkspace — desktop split-pane task editor with grouped navigation
 *  → TaskSection, collapsible group of sidebar task rows (status or category)
 *
 * @exports TaskWorkspace
 * @see src/components/Drawer.tsx
 * @see src/components/SubtaskEditor.tsx
 * @see src/lib/task-title-category.ts
 * @see src/lib/store.ts
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconMessage } from '@tabler/icons-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icons';
import { KbdButton } from './KbdButton';
import { ListRow } from './ListRow';
import { SubtaskEditor } from './SubtaskEditor';
import { BlockNoteMarkdownEditor } from './ui/BlockNoteMarkdownEditor';
import { DependenciesHeaderMenu } from './DependenciesHeaderMenu';
import { TaskExtensionSurface } from './TaskExtensionSurface';
import { AgentBlobatar } from './agent/Blobatar';
import { AgentPresenceBadge } from './agent/AgentPresenceBadge';
import { DiffOverlay } from './agent/DiffOverlay';
import { parseTaskTitle } from '../lib/task-title-category';
import { categoryColor, categoryIcon } from '../lib/category-color';
import { CategoryChip } from './CategoryChip';
import { useStore } from '../lib/store';
import { buildTaskUrl } from '../lib/task-url';
import type { BoardTask, Subtask } from '../lib/types';
import { terminalStatus } from '../lib/dependencies';

/** 📖 Grouping mode of the "All tasks" sidebar navigator. `status` is the
 * historical behavior (one section per board column); `category` groups by
 * the frontmatter `category:` field, falling back to a legacy leading
 * `[CATEGORY]` title tag. Persisted as `kandown:tasklist-group`. */
type GroupMode = 'status' | 'category';

/** 📖 Rank for sorting tasks by priority inside a category group, P1 first. */
const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3, '': 4 };

function ToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex transition-transform ${collapsed ? '-rotate-90' : ''}`}
    >
      <Icon.ChevronDown size={13} />
    </span>
  );
}

/** 📖 A sidebar row plus the board column it belongs to, used to sort and
 * label tasks in category mode (status chip + board column order). */
interface SidebarTask {
  task: BoardTask;
  columnName: string;
}

/** 📖 A category group in the sidebar: normalized key (uppercase, `''` for
 * uncategorized), display label, and tasks each tagged with their board
 * column for sorting and the per-row status chip. */
interface CategoryGroup {
  key: string;
  label: string | null;
  tasks: SidebarTask[];
}

interface TaskSectionProps {
  /** Section header label. Column name in status mode, `[CATEGORY]` or the
   * uncategorized label in category mode. */
  title: string;
  /** Number of tasks in this section, shown in the count badge. */
  count: number;
  tasks: SidebarTask[];
  collapsed: boolean;
  activeTaskId: string | null;
  onToggle: (name: string) => void;
  onSelectTask: (taskId: string) => void;
  /** Category-mode styling: mono accent title, per-row status chip, and a
   * `data-category` attribute so the reveal logic can scroll to it. */
  categoryMode?: boolean;
  /** Normalized category key (uppercase, `''` for uncategorized). Only set
   * in category mode, used for the `data-category` scroll target. */
  dataKey?: string;
}
/** 📖 Category chip in the "All tasks" sidebar: a colored hash chip when
 * `ui.categoryChips` is on (via the shared CategoryChip), the plain mono
 * accent label otherwise. Uncategorized stays neutral. */
function CategoryHeaderLabel({ dataKey, title }: { dataKey: string; title: string }) {
  const categoryChips = useStore(s => s.config.ui.categoryChips !== false);
  if (!categoryChips || !dataKey) {
    return (
      <span className="truncate font-mono text-[12px] uppercase font-semibold text-accent-foreground">
        {title}
      </span>
    );
  }
  return <CategoryChip category={dataKey} />;
}

function TaskSection({
  title,
  count,
  tasks,
  collapsed,
  activeTaskId,
  onToggle,
  onSelectTask,
  categoryMode = false,
  dataKey,
}: TaskSectionProps) {
  return (
    <section
      data-category={categoryMode ? dataKey : undefined}
      className="overflow-hidden rounded-lg border border-border/60 bg-card/40 shadow-none"
    >
      <button
        type="button"
        onClick={() => onToggle(categoryMode ? (dataKey ?? title) : title)}
        className="flex w-full items-center justify-between gap-2.5 border-b border-border/40 bg-bg-1/60 px-3 py-2 text-left hover:bg-bg-2 transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ToggleIcon collapsed={collapsed} />
          {categoryMode ? (
            <CategoryHeaderLabel dataKey={dataKey ?? ''} title={title} />
          ) : (
            <span className="truncate text-[12.5px] font-semibold text-fg">{title}</span>
          )}
        </span>
        <span className="rounded-full border border-border/60 bg-bg px-2 py-0.5 font-mono text-[10.5px] text-fg-muted">
          {count}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden bg-bg/30"
          >
            {tasks.length === 0 ? (
              <div className="px-3 py-3 text-[11.5px] text-fg-muted">No tasks in this group.</div>
            ) : (
              <div className="divide-y divide-border/30">
                {tasks.map(({ task, columnName }) => (
                  <ListRow
                    key={task.id}
                    task={task}
                    columnName={columnName}
                    statusLabel={categoryMode ? columnName : undefined}
                    isActive={task.id === activeTaskId}
                    onSelect={onSelectTask}
                    inline
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function TaskWorkspace() {
  const { t } = useTranslation();
  const drawerTaskId = useStore(s => s.drawerTaskId);
  const drawerData = useStore(s => s.drawerData);
  const columns = useStore(s => s.columns);
  const config = useStore(s => s.config);
  const projectName = useStore(s => s.projectName);
  const toast = useStore(s => s.toast);
  const openDrawer = useStore(s => s.openDrawer);
  const closeDrawer = useStore(s => s.closeDrawer);
  const saveDrawer = useStore(s => s.saveDrawer);
  const saveDrawerMetadata = useStore(s => s.saveDrawerMetadata);
  const deleteTask = useStore(s => s.deleteTask);
  const archiveTask = useStore(s => s.archiveTask);
  const unarchiveTask = useStore(s => s.unarchiveTask);
  const agentHook = useStore(s => s.agentHook);
  const sendTaskToAgent = useStore(s => s.sendTaskToAgent);
  const openSidebar = useStore(s => s.openSidebar);
  const hasUnsavedDrawerEdits = useStore(s => s.hasUnsavedDrawerEdits);
  const lastSaveError = useStore(s => s.lastSaveError);
  const markDrawerDirty = useStore(s => s.markDrawerDirty);
  const forceCloseDrawer = useStore(s => s.forceCloseDrawer);
  const updateDrawerData = useStore(s => s.updateDrawerData);

  // 📖 Live agent edit (t309): when a session is editing the open task, the
  // editor locks to read-only and shows the live diff + the session blob.
  const editLockSession = useStore(s => (s.drawerTaskId ? s.agentEdits.edits[s.drawerTaskId] : undefined));
  const editLocked = editLockSession !== undefined;

  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const sidebarListRef = useRef<HTMLDivElement>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const [collapsedCategorySections, setCollapsedCategorySections] = useState<Set<string>>(() => new Set());
  const [groupMode, setGroupMode] = useState<GroupMode>(() =>
    localStorage.getItem('kandown:tasklist-group') === 'category' ? 'category' : 'status'
  );
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [isEditingCategory, setIsEditingCategory] = useState(false);

  // 📖 Persist the sidebar grouping mode across reloads, same pattern as
  // `kandown:view` / `kandown:density` in the store's uiSlice.
  useEffect(() => {
    localStorage.setItem('kandown:tasklist-group', groupMode);
  }, [groupMode]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const isTaskArchived = String(drawerData?.frontmatter.archived) === 'true';
  const isOpen = !!drawerTaskId && !!drawerData;

  const currentCol = drawerTaskId
    ? columns.find(c => c.tasks.some(task => task.id === drawerTaskId))?.name
    : null;

  // 📖 Board column order as a lookup map. The store keeps `columns` in visual
  // board order, so the array index is the status rank used by the category
  // mode sort (tasks grouped by status, then priority inside the same status).
  const columnIndex = useMemo(() => {
    const map = new Map<string, number>();
    columns.forEach((col, i) => map.set(col.name.toLowerCase(), i));
    return map;
  }, [columns]);

  // 📖 Group every board task by its category: the frontmatter `category:`
  // field first, legacy leading `[BRACKET]` title tag as fallback.
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const groups = new Map<string, CategoryGroup>();
    for (const col of columns) {
      for (const task of col.tasks) {
        const raw = task.category ?? parseTaskTitle(task.title).category;
        const key = raw ? raw.trim().toUpperCase() : '';
        let group = groups.get(key);
        if (!group) {
          group = { key, label: raw, tasks: [] };
          groups.set(key, group);
        }
        group.tasks.push({ task, columnName: col.name });
      }
    }
    for (const group of groups.values()) {
      group.tasks.sort((a, b) => {
        const rankA = columnIndex.get(a.columnName.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
        const rankB = columnIndex.get(b.columnName.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) return rankA - rankB;
        return (PRIORITY_ORDER[a.task.priority ?? ''] ?? 4) - (PRIORITY_ORDER[b.task.priority ?? ''] ?? 4);
      });
    }
    const list = [...groups.values()];
    list.sort((a, b) => {
      if (!a.key) return 1;
      if (!b.key) return -1;
      return (a.label ?? '').localeCompare(b.label ?? '', undefined, { sensitivity: 'base' });
    });
    return list;
  }, [columns, columnIndex]);

  // 📖 Normalized category of the task currently open in the editor, `''` for
  // uncategorized, `null` when no task is open. Drives the auto-reveal.
  const activeCategory = useMemo(() => {
    if (!drawerTaskId) return null;
    for (const col of columns) {
      const task = col.tasks.find(candidate => candidate.id === drawerTaskId);
      if (task) {
        const raw = task.category ?? parseTaskTitle(task.title).category;
        return raw ? raw.trim().toUpperCase() : '';
      }
    }
    return null;
  }, [columns, drawerTaskId]);

  // 📖 Keep the latest category groups in a ref so the auto-reveal effect can
  // read them without re-running when tasks change (editing a title would
  // otherwise collapse every section on each keystroke).
  const categoryGroupsRef = useRef(categoryGroups);
  categoryGroupsRef.current = categoryGroups;

  // 📖 Category mode: whenever the open task changes, expand its own category
  // (or the uncategorized group) and collapse every other one, then scroll it
  // into view. Status mode and manual collapse state are left untouched.
  useEffect(() => {
    if (groupMode !== 'category') return;
    if (activeCategory === null) return;
    setCollapsedCategorySections(() => {
      const keys = categoryGroupsRef.current.map(group => group.key);
      return new Set(keys.filter(key => key !== activeCategory));
    });
    const frame = requestAnimationFrame(() => {
      const target = sidebarListRef.current?.querySelector(
        `[data-category="${CSS.escape(activeCategory)}"]`
      );
      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [groupMode, activeCategory]);

  const depResolution = useMemo(() => {
    const map = new Map<string, { exists: boolean; resolved: boolean }>();
    const terminal = terminalStatus(config).toLowerCase();
    for (const col of columns) {
      for (const task of col.tasks) {
        const archived = task.frontmatter.archived === true || task.frontmatter.archived === 'true';
        map.set(task.id, {
          exists: true,
          resolved: archived || col.name.toLowerCase() === terminal,
        });
      }
    }
    for (const col of columns) {
      for (const task of col.tasks) {
        const deps = Array.isArray(task.frontmatter.depends_on) ? task.frontmatter.depends_on : [];
        for (const depId of deps) {
          if (typeof depId !== 'string' || !depId.trim()) continue;
          if (!map.has(depId)) map.set(depId, { exists: false, resolved: true });
        }
      }
    }
    return map;
  }, [columns, config]);

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      saveDrawerMetadata().finally(() => {
        isSavingRef.current = false;
      });
    }, 150);
  }, [saveDrawerMetadata]);

  const flushAutoSave = useCallback(async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
    if (isSavingRef.current) {
      await new Promise(resolve => {
        const check = setInterval(() => {
          if (!isSavingRef.current) {
            clearInterval(check);
            resolve(undefined);
          }
        }, 20);
      });
    }
  }, []);

  const handleClose = useCallback(async () => {
    await flushAutoSave();
    await saveDrawer();
  }, [flushAutoSave, saveDrawer]);

  const handleProtectedClose = useCallback(async () => {
    if (hasUnsavedDrawerEdits || lastSaveError) {
      const msg = lastSaveError
        ? `${lastSaveError}\n\nDiscard your unsaved edits? They will be kept as a draft you can restore.`
        : 'You have unsaved edits. Discard them? They will be kept as a draft you can restore.';
      if (!confirm(msg)) return;
      forceCloseDrawer();
      return;
    }
    await handleClose();
  }, [forceCloseDrawer, handleClose, hasUnsavedDrawerEdits, lastSaveError]);

  const safeCloseDrawer = useCallback(async () => {
    await flushAutoSave();
    closeDrawer();
  }, [closeDrawer, flushAutoSave]);

  const handleDelete = useCallback(async () => {
    if (!drawerTaskId) return;
    if (!confirm(`${t('common.delete')} ${drawerTaskId.toUpperCase()}?`)) return;
    await deleteTask(drawerTaskId);
    await safeCloseDrawer();
  }, [deleteTask, drawerTaskId, safeCloseDrawer, t]);

  const handleArchiveToggle = useCallback(async () => {
    if (!drawerTaskId) return;
    if (isTaskArchived) {
      await unarchiveTask(drawerTaskId);
    } else {
      await flushAutoSave();
      await archiveTask(drawerTaskId);
    }
  }, [archiveTask, drawerTaskId, flushAutoSave, isTaskArchived, unarchiveTask]);

  const handleSendToAgent = useCallback(() => {
    if (!drawerTaskId) return;
    void sendTaskToAgent(drawerTaskId);
  }, [drawerTaskId, sendTaskToAgent]);

  const handleCopyTaskUrl = useCallback(async () => {
    if (!drawerTaskId) return;
    const url = new URL(buildTaskUrl(drawerTaskId, projectName), window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast('Task URL copied', 'success');
    } catch {
      toast(url, 'info', 8000);
    }
  }, [drawerTaskId, projectName, toast]);

  const handleSelectTask = useCallback(async (taskId: string) => {
    if (taskId === drawerTaskId) return;
    await flushAutoSave();
    if (hasUnsavedDrawerEdits || lastSaveError) {
      const shouldDiscard = confirm('Switch tasks and discard current unsaved edits? They will be kept as a draft you can restore.');
      if (!shouldDiscard) return;
      forceCloseDrawer();
    }
    await openDrawer(taskId, { replace: true });
  }, [drawerTaskId, flushAutoSave, forceCloseDrawer, hasUnsavedDrawerEdits, lastSaveError, openDrawer]);

  const toggleSection = useCallback((name: string) => {
    setCollapsedSections(current => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleCategorySection = useCallback((name: string) => {
    setCollapsedCategorySections(current => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => titleInputRef.current?.focus(), 160);
    }
  }, [isOpen, drawerTaskId]);

  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.style.height = 'auto';
      titleInputRef.current.style.height = `${titleInputRef.current.scrollHeight}px`;
    }
  }, [drawerData?.frontmatter.title]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        void handleProtectedClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void handleClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
        e.preventDefault();
        void handleDelete();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose, handleDelete, handleProtectedClose, isOpen]);

  const handleSubtasksChange = useCallback((subtasks: Subtask[]) => {
    // 📖 Live agent edit (t309): read-only lock while a session edits the task.
    if (editLocked) return;
    updateDrawerData(data => ({ ...data, subtasks }));
    markDrawerDirty();
    triggerAutoSave();
  }, [editLocked, markDrawerDirty, triggerAutoSave, updateDrawerData]);

  if (!drawerData || !isDesktop) return null;

  const updateField = <K extends keyof typeof drawerData.frontmatter>(
    key: K,
    value: (typeof drawerData.frontmatter)[K]
  ) => {
    // 📖 Live agent edit (t309): single choke point for every frontmatter
    // field (title, category, report, dependencies): no writes while locked.
    if (editLocked) return;
    updateDrawerData(data => ({
      ...data,
      frontmatter: { ...data.frontmatter, [key]: value },
    }));
    markDrawerDirty();
    triggerAutoSave();
  };

  const rawTitle = (drawerData.frontmatter.title as string) || '';
  // 📖 The category is a first-class frontmatter field since 0.53.0. Legacy
  // files that predate the field carry it as a leading `[BRACKET]` in the
  // title; the fallback keeps those files editable without a migration step.
  const parsedTitle = parseTaskTitle(rawTitle);
  const displayCategory =
    (drawerData.frontmatter.category || '').trim() || parsedTitle.category || '';

  const handleCleanTitleChange = (newCleanTitle: string) => {
    // 📖 The title is clean prose; the category lives in its own field, so a
    // title edit never touches it and never rewrites the filename.
    updateField('title', newCleanTitle);
    // 📖 Guard: on a legacy file the category sits in the title bracket. A
    // title edit would drop it silently, so the bracket is migrated into the
    // `category:` field before it disappears.
    if (parsedTitle.category) {
      updateField('category', parsedTitle.category);
    }
  };

  const handleCategorySubmit = (newCat: string) => {
    // 📖 Upper-cased on save so the chip, the grouping key and the filename
    // segment all agree (the filename normalizes further to ASCII anyway).
    updateField('category', newCat.trim().toUpperCase() || '');
    // 📖 A legacy title still carrying its `[BRACKET]` is migrated on edit:
    // the bracket is stripped so it cannot keep feeding the fallback and
    // resurrect a cleared category on the next reload.
    if (parsedTitle.category) {
      updateField('title', parsedTitle.cleanTitle.trim());
    }
    setIsEditingCategory(false);
  };

  const currentDependsOn = Array.isArray(drawerData.frontmatter.depends_on)
    ? drawerData.frontmatter.depends_on.filter((depId): depId is string => typeof depId === 'string')
    : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className={`hidden md:flex flex-1 min-h-0 gap-5 p-5 ${config.ui.background === 'solid' ? 'board-bg' : ''}`}
    >
      <aside className="flex h-full w-1/4 min-w-[260px] max-w-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-xl shadow-xl">
        <div className="space-y-2 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted">
              {t('taskWorkspace.allTasks')}
            </div>
            <div className="flex items-center gap-0.5 rounded-md border border-border-strong p-0.5">
              {(['status', 'category'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={groupMode === mode}
                  onClick={() => setGroupMode(mode)}
                  className={`h-5 rounded px-2 text-[11px] font-medium transition-colors ${
                    groupMode === mode
                      ? 'bg-bg-hover text-fg'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {mode === 'status' ? t('taskWorkspace.groupByStatus') : t('taskWorkspace.groupByCategory')}
                </button>
              ))}
            </div>
          </div>
          <div className="text-[12.5px] text-fg-faint">
            {groupMode === 'status' ? t('taskWorkspace.switchHint') : t('taskWorkspace.switchHintCategory')}
          </div>
        </div>
        <div ref={sidebarListRef} className="flex-1 space-y-3 overflow-y-auto p-3">
          {groupMode === 'status' ? (
            columns.map(column => (
              <TaskSection
                key={column.name}
                title={column.name}
                count={column.tasks.length}
                tasks={column.tasks.map(task => ({ task, columnName: column.name }))}
                collapsed={collapsedSections.has(column.name)}
                activeTaskId={drawerTaskId}
                onToggle={toggleSection}
                onSelectTask={(taskId) => { void handleSelectTask(taskId); }}
              />
            ))
          ) : categoryGroups.length === 0 ? (
            <div className="px-3 py-3 text-[11.5px] text-fg-muted">No tasks.</div>
          ) : (
            categoryGroups.map(group => (
              <TaskSection
                key={group.key || '__uncategorized__'}
                title={group.label ? `[${group.label}]` : t('taskWorkspace.uncategorized')}
                count={group.tasks.length}
                tasks={group.tasks}
                collapsed={collapsedCategorySections.has(group.key)}
                activeTaskId={drawerTaskId}
                onToggle={toggleCategorySection}
                onSelectTask={(taskId) => { void handleSelectTask(taskId); }}
                categoryMode
                dataKey={group.key}
              />
            ))
          )}
        </div>
      </aside>

      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card/75 backdrop-blur-xl shadow-2xl">
        {/* 📖 `relative`: the chat presence floating blob (AgentPresenceBadge)
            anchors to this header, hovering over the panel just below it. */}
        <div className="relative flex items-center justify-between gap-3 border-b border-border px-5 py-3 flex-wrap">
          <div className="flex min-w-0 items-center gap-2.5 flex-wrap">
            <span className="font-mono text-[12.5px] text-fg-muted px-1.5 py-0.5 bg-bg-2 border border-border rounded-[4px]">
              {drawerTaskId?.toUpperCase()}
            </span>

            {/* 📖 Live agent edit (t309): session blob + read-only notice while
                an agent owns this task. */}
            {editLockSession && <AgentBlobatar sessionId={editLockSession.sessionId} size={20} />}
            {/* 📖 Chat presence: the session blob while an active chat session
                pointed here with [show: tXXX] (non-locking). */}
            <AgentPresenceBadge taskId={drawerTaskId} />
            {editLocked && (
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-300">
                {t('agentEdits.editorLocked', 'An agent is editing this task. Fields are read-only until it finishes.')}
              </span>
            )}

            {/* Category Tag on header line */}
            {isEditingCategory ? (
              <input
                type="text"
                autoFocus
                defaultValue={displayCategory}
                placeholder="CATEGORY"
                onBlur={e => handleCategorySubmit(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCategorySubmit(e.currentTarget.value);
                  if (e.key === 'Escape') setIsEditingCategory(false);
                }}
                className="font-mono text-[12px] uppercase px-1.5 py-0.5 bg-accent/15 border border-accent/40 rounded text-accent-foreground font-semibold outline-none w-28"
              />
            ) : displayCategory ? (
              <CategoryChip category={displayCategory} onClick={editLocked ? undefined : () => setIsEditingCategory(true)} />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingCategory(true)}
                disabled={editLocked}
                className="text-[11.5px] text-fg-faint hover:text-fg-muted border border-dashed border-border px-1.5 py-0.5 rounded transition-colors disabled:pointer-events-none disabled:opacity-50"
                title="Add category tag"
              >
                + Category
              </button>
            )}

            {currentCol && <span className="text-[12.5px] text-fg-dim">· {currentCol}</span>}
            {drawerData.subtasks.length > 0 && (
              <span className="text-[12px] text-fg-muted tabular-nums">
                {drawerData.subtasks.filter(subtask => subtask.done).length}/{drawerData.subtasks.length} {t('drawer.doneSubtasks')}
              </span>
            )}
            <button
              type="button"
              onClick={handleCopyTaskUrl}
              className="text-[12.5px] text-fg-muted underline underline-offset-2 hover:text-fg"
              title={t('taskWorkspace.copyUrl')}
            >
              {t('taskWorkspace.copyUrl')}
            </button>

            {/* Compact Header Dependencies Hoverable Menu */}
            <DependenciesHeaderMenu
              currentTaskId={drawerTaskId || ''}
              dependsOn={currentDependsOn}
              depResolution={depResolution}
              onUpdateDependencies={nextDeps => {
                updateField('depends_on', nextDeps.length > 0 ? nextDeps : undefined);
              }}
            />
          </div>
          <KbdButton
            variant="secondary"
            icon="ArrowLeft"
            label={t('taskWorkspace.backToCards')}
            onClick={handleProtectedClose}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-5">
            {/* Naked Title Input */}
            <textarea
              ref={titleInputRef}
              value={parsedTitle.cleanTitle}
              onChange={e => handleCleanTitleChange(e.target.value)}
              readOnly={editLocked}
              placeholder={t('drawer.taskTitle')}
              rows={1}
              className="w-full bg-transparent border-none outline-none text-fg text-[24px] font-semibold tracking-tight leading-tight resize-none placeholder:text-fg-faint read-only:opacity-90"
            />

            <div className="h-px bg-border -mx-5" />

            {/* 📖 Live agent edit (t309): live diff of the agent's writes,
                refresh-free. Self-hiding while the task has no diff yet. */}
            {drawerTaskId && <DiffOverlay taskId={drawerTaskId} />}

            <div data-task-section="description" className="scroll-mt-3">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                {t('drawer.description')}
              </div>
              <BlockNoteMarkdownEditor
                value={drawerData.body}
                readOnly={editLocked}
                onChange={val => {
                  if (editLocked) return;
                  updateDrawerData(data => ({ ...data, body: val }));
                  markDrawerDirty();
                  triggerAutoSave();
                }}
                placeholder={t('drawer.descriptionPlaceholder')}
                minHeight="280px"
              />
            </div>

            <div className="h-px bg-border -mx-5" />

            {/* 📖 data-task-section: the chat [show:] directive anchor target. */}
            <div data-task-section="subtasks" className="scroll-mt-3">
              <SubtaskEditor
                subtasks={drawerData.subtasks}
                onSubtasksChange={handleSubtasksChange}
              />
            </div>

            <div className="h-px bg-border -mx-5" />

            <div data-task-section="report" className="scroll-mt-3">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                {t('drawer.report')}
              </div>
              <BlockNoteMarkdownEditor
                value={drawerData.frontmatter.report as string || ''}
                readOnly={editLocked}
                onChange={value => updateField('report', value)}
                placeholder={t('drawer.reportPlaceholder')}
                minHeight="200px"
              />
            </div>

            {drawerTaskId && (
              <TaskExtensionSurface taskId={drawerTaskId} frontmatter={drawerData.frontmatter} />
            )}
          </div>
        </div>

        {lastSaveError && (
          <div className="flex items-center gap-2 border-t border-danger/30 bg-danger/10 px-4 py-2">
            <span className="flex-1 truncate text-[12px] text-danger" title={lastSaveError}>{lastSaveError}</span>
            <KbdButton variant="primary" label="Retry save" onClick={saveDrawer} />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <KbdButton
              variant="danger"
              icon="Trash"
              label={t('drawer.deleteTask')}
              shortcut="⌘⌫"
              onClick={handleDelete}
            />
            <KbdButton
              variant="secondary"
              icon={isTaskArchived ? 'ArchiveRestore' : 'Archive'}
              label={t(isTaskArchived ? 'drawer.restore' : 'drawer.archive')}
              onClick={handleArchiveToggle}
            />
            {agentHook && (
              <KbdButton
                variant="secondary"
                icon="Arrow"
                label={`${t('drawer.sendToAgent')} · ${agentHook.label}`}
                onClick={handleSendToAgent}
                title={t('drawer.sendToAgentTitle')}
              />
            )}
            {/* 📖 "Ask the agent" (t308): opens the chat sidebar with this task
             * as the pre-compiled context. Always available; the sidebar itself
             * explains the daemon requirement when there is none. */}
            <button
              type="button"
              onClick={() => { if (drawerTaskId) openSidebar(drawerTaskId); }}
              title={t('agentChat.askAgentTitle', 'Open the agent chat with this task as context')}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-[13px] font-semibold text-fg shadow-sm transition-colors hover:border-border-strong hover:bg-bg-2"
            >
              <IconMessage size={14} stroke={1.8} />
              <span>{t('agentChat.askAgent', 'Ask the agent')}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {hasUnsavedDrawerEdits && (
              <span className="text-[11px] text-amber-600 dark:text-amber-300" title="Unsaved edits kept as a draft if you close">
                ● unsaved
              </span>
            )}
            <KbdButton
              variant="secondary"
              label={t('drawer.cancel')}
              shortcut="Esc"
              onClick={handleProtectedClose}
            />
            <KbdButton
              variant="primary"
              label={t('drawer.saveClose')}
              shortcut="⌘S"
              onClick={saveDrawer}
            />
          </div>
        </div>
      </main>
    </motion.div>
  );
}
