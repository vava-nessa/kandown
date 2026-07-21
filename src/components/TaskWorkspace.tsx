/**
 * @file Desktop opened-task workspace
 * @description Replaces the desktop task modal with a split workspace: a
 * grouped task navigator on the left and the existing task editor surface on
 * the right, while mobile keeps using the original modal drawer.
 *
 * 📖 The workspace deliberately reuses the drawer store state and save actions
 * instead of creating a second editing model. That keeps autosave, conflict
 * detection, URL deep-links, archive/delete actions, and task-file persistence
 * aligned with the existing drawer behavior.
 * 📖 Task switching is guarded when the current editor has unsaved changes so
 * quick navigation does not silently throw away draft text.
 *
 * @functions
 *  → TaskWorkspace — desktop split-pane task editor with grouped navigation
 *
 * @exports TaskWorkspace
 * @see src/components/Drawer.tsx
 * @see src/lib/store.ts
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icons';
import { KbdButton } from './KbdButton';
import { BlockNoteMarkdownEditor } from './ui/BlockNoteMarkdownEditor';
import { useStore } from '../lib/store';
import { buildTaskUrl } from '../lib/task-url';
import type { BoardTask, Column } from '../lib/types';

const priorityColors: Record<string, string> = {
  P1: '#e5484d',
  P2: '#e9a23b',
  P3: '#3e63dd',
  P4: '#6e6e6e',
};

function taskSummary(task: BoardTask): string {
  const parts = [
    task.priority || null,
    task.assignee ? `@${task.assignee}` : null,
    task.progress ? `${task.progress.done}/${task.progress.total}` : null,
  ].filter((part): part is string => !!part);

  return parts.join(' · ');
}

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

interface TaskSectionProps {
  column: Column;
  collapsed: boolean;
  activeTaskId: string | null;
  onToggle: (name: string) => void;
  onSelectTask: (taskId: string) => void;
}

function TaskSection({ column, collapsed, activeTaskId, onToggle, onSelectTask }: TaskSectionProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-bg/45">
      <button
        type="button"
        onClick={() => onToggle(column.name)}
        className="flex w-full items-center justify-between gap-3 border-b border-border bg-bg-1/70 px-3 py-2.5 text-left hover:bg-bg-2 transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ToggleIcon collapsed={collapsed} />
          <span className="truncate text-[13px] font-semibold text-fg">{column.name}</span>
        </span>
        <span className="rounded-full border border-border bg-bg px-2 py-0.5 font-mono text-[11px] text-fg-muted">
          {column.tasks.length}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden"
          >
            {column.tasks.length === 0 ? (
              <div className="px-3 py-4 text-[12.5px] text-fg-muted">No tasks in this status.</div>
            ) : (
              <div className="py-1.5">
                {column.tasks.map(task => {
                  const active = task.id === activeTaskId;
                  const summary = taskSummary(task);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onSelectTask(task.id)}
                      className={`group flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'bg-accent/15 text-fg'
                          : 'text-fg-muted hover:bg-bg-2 hover:text-fg'
                      }`}
                    >
                      <span className={`mt-0.5 rounded border px-1.5 py-0.5 font-mono text-[11px] ${
                        active ? 'border-accent/40 bg-accent/15 text-accent' : 'border-border bg-bg text-fg-muted'
                      }`}>
                        {task.id.replace(/^t/, '')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] font-medium ${task.checked ? 'line-through opacity-70' : ''}`}>
                          {task.title}
                        </span>
                        {summary && (
                          <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-fg-faint">
                            {task.priority && (
                              <span
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: priorityColors[task.priority] }}
                              />
                            )}
                            {summary}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
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
  const hasUnsavedDrawerEdits = useStore(s => s.hasUnsavedDrawerEdits);
  const lastSaveError = useStore(s => s.lastSaveError);
  const markDrawerDirty = useStore(s => s.markDrawerDirty);
  const forceCloseDrawer = useStore(s => s.forceCloseDrawer);
  const updateDrawerData = useStore(s => s.updateDrawerData);

  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());

  const isTaskArchived = String(drawerData?.frontmatter.archived) === 'true';
  const isOpen = !!drawerTaskId && !!drawerData;

  const currentCol = drawerTaskId
    ? columns.find(c => c.tasks.some(task => task.id === drawerTaskId))?.name
    : null;

  const depResolution = useMemo(() => {
    const map = new Map<string, { exists: boolean; resolved: boolean }>();
    const terminal = (config.board.columns[config.board.columns.length - 1] || 'Done').toLowerCase();
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
  }, [columns, config.board.columns]);

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

  if (!drawerData) return null;

  const updateField = <K extends keyof typeof drawerData.frontmatter>(
    key: K,
    value: (typeof drawerData.frontmatter)[K]
  ) => {
    updateDrawerData(data => ({
      ...data,
      frontmatter: { ...data.frontmatter, [key]: value },
    }));
    markDrawerDirty();
    triggerAutoSave();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className={`hidden md:flex flex-1 min-h-0 gap-5 p-5 ${config.ui.background === 'solid' ? 'board-bg' : ''}`}
    >
      <aside className="flex h-full w-1/4 min-w-[260px] max-w-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-xl shadow-xl">
        <div className="border-b border-border px-4 py-3">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted">
            {t('taskWorkspace.allTasks')}
          </div>
          <div className="mt-1 text-[12.5px] text-fg-faint">
            {t('taskWorkspace.switchHint')}
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {columns.map(column => (
            <TaskSection
              key={column.name}
              column={column}
              collapsed={collapsedSections.has(column.name)}
              activeTaskId={drawerTaskId}
              onToggle={toggleSection}
              onSelectTask={(taskId) => { void handleSelectTask(taskId); }}
            />
          ))}
        </div>
      </aside>

      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card/75 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="font-mono text-[12.5px] text-fg-muted px-1.5 py-0.5 bg-bg-2 border border-border rounded-[4px]">
              {drawerTaskId?.toUpperCase()}
            </span>
            {currentCol && <span className="text-[12.5px] text-fg-dim">· {currentCol}</span>}
            <button
              type="button"
              onClick={handleCopyTaskUrl}
              className="text-[12.5px] text-fg-muted underline underline-offset-2 hover:text-fg"
              title={t('taskWorkspace.copyUrl')}
            >
              {t('taskWorkspace.copyUrl')}
            </button>
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
            <textarea
              ref={titleInputRef}
              value={(drawerData.frontmatter.title as string) || ''}
              onChange={e => updateField('title', e.target.value)}
              placeholder={t('drawer.taskTitle')}
              rows={1}
              className="w-full bg-transparent border-none outline-none text-fg text-[24px] font-semibold tracking-tight leading-tight resize-none placeholder:text-fg-faint"
            />

            <div className="h-px bg-border -mx-5" />

            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                {t('dependencies.label')}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(Array.isArray(drawerData.frontmatter.depends_on)
                  ? drawerData.frontmatter.depends_on.filter((depId): depId is string => typeof depId === 'string')
                  : []
                ).map((depId, index) => {
                  const isResolved = depResolution.get(depId)?.resolved ?? false;
                  const exists = depResolution.get(depId)?.exists ?? true;
                  return (
                    <span
                      key={`${depId}-${index}`}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-mono border ${
                        !exists
                          ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                          : isResolved
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      }`}
                      title={!exists ? t('dependencies.unknown') : isResolved ? t('dependencies.resolved') : t('dependencies.unresolved')}
                    >
                      {depId}
                      <button
                        type="button"
                        aria-label={t('dependencies.remove')}
                        onClick={() => {
                          const next = (Array.isArray(drawerData.frontmatter.depends_on)
                            ? drawerData.frontmatter.depends_on
                            : []
                          ).filter((_, depIndex) => depIndex !== index);
                          updateField('depends_on', next.length > 0 ? next : undefined);
                        }}
                        className="text-current opacity-60 hover:opacity-100"
                      >×</button>
                    </span>
                  );
                })}
              </div>
              <input
                type="text"
                className="w-full bg-bg-2 border border-border rounded px-2 py-1.5 text-[13px] text-fg placeholder:text-fg-faint focus:outline-none focus:border-border-strong"
                placeholder={t('dependencies.addPlaceholder')}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const raw = (e.currentTarget.value || '').trim();
                  if (!raw) return;
                  const cleaned = raw.replace(/^#/, '').trim();
                  const current = Array.isArray(drawerData.frontmatter.depends_on)
                    ? drawerData.frontmatter.depends_on.filter((depId): depId is string => typeof depId === 'string')
                    : [];
                  if (current.includes(cleaned) || cleaned === drawerData.frontmatter.id) {
                    e.currentTarget.value = '';
                    return;
                  }
                  updateField('depends_on', [...current, cleaned]);
                  e.currentTarget.value = '';
                }}
              />
            </div>

            <div className="h-px bg-border -mx-5" />

            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                {t('drawer.description')}
              </div>
              <BlockNoteMarkdownEditor
                value={drawerData.body}
                onChange={value => {
                  updateDrawerData(data => ({ ...data, body: value }));
                  markDrawerDirty();
                  triggerAutoSave();
                }}
                placeholder={t('drawer.descriptionPlaceholder')}
                minHeight="320px"
              />
            </div>

            <div className="h-px bg-border -mx-5" />

            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                {t('drawer.report')}
              </div>
              <BlockNoteMarkdownEditor
                value={drawerData.frontmatter.report as string || ''}
                onChange={value => updateField('report', value)}
                placeholder={t('drawer.reportPlaceholder')}
                minHeight="200px"
              />
            </div>
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
