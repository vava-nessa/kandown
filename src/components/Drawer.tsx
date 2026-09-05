/**
 * @file Task drawer editor
 * @description Full-height task detail editor for title, description, subtasks,
 * report, save/close, autosave, and deletion.
 *
 * 📖 The drawer edits the parsed task file and writes changes back into
 * frontmatter, keeping `tasks/<id>.md` as the single source of truth for board
 * state and rich task context.
 * 📖 Destructive keyboard deletion uses Cmd/Ctrl+Backspace instead of a naked
 * Delete key so normal text editing inside title and description remains
 * predictable.
 * 📖 Layout keeps the writing surface focused: title, dependencies,
 * DESCRIPTION, editable SUBTASKS, then REPORT. Subtasks remain markdown-backed
 * checklist items so agents and the UI share the same source of truth.
 * 📖 Live agent edits (t309): while an agent session edits the open task
 * (`agent_edit_started` board events), the editor locks to read-only
 * (title, category, description, subtasks, report, dependencies), shows the
 * session's blob avatar in the header and renders the DiffOverlay live-diff
 * panel under the title. Unlocks on `agent_edit_ended`.
 *
 * @functions
 *  → Drawer — task editor panel with keyboard shortcuts and autosave
 *
 * @exports Drawer
 * @see src/lib/store.ts
 * @see src/components/SubtaskEditor.tsx
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { IconMessage } from '@tabler/icons-react';
import { KbdButton } from './KbdButton';
import { SubtaskEditor } from './SubtaskEditor';
import { BlockNoteMarkdownEditor } from './ui/BlockNoteMarkdownEditor';
import { DependenciesHeaderMenu } from './DependenciesHeaderMenu';
import { TaskExtensionSurface } from './TaskExtensionSurface';
import { AgentBlobatar } from './agent/Blobatar';
import { DiffOverlay } from './agent/DiffOverlay';
import { parseTaskTitle } from '../lib/task-title-category';
import { CategoryChip } from './CategoryChip';
import { useStore } from '../lib/store';
import { buildTaskUrl } from '../lib/task-url';
import type { Subtask } from '../lib/types';
import { terminalStatus } from '../lib/dependencies';

export function Drawer() {
  const { t } = useTranslation();
  const drawerTaskId = useStore(s => s.drawerTaskId);
  const drawerData = useStore(s => s.drawerData);
  const columns = useStore(s => s.columns);
  const config = useStore(s => s.config);
  const projectName = useStore(s => s.projectName);
  const toast = useStore(s => s.toast);
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

  // 📖 Live agent edit (t309): when a session is editing the open task, the
  // editor locks to read-only and shows the live diff + the session blob.
  const editLockSession = useStore(s => (s.drawerTaskId ? s.agentEdits.edits[s.drawerTaskId] : undefined));
  const editLocked = editLockSession !== undefined;

  const isTaskArchived = String(drawerData?.frontmatter.archived) === 'true';
  const updateDrawerData = useStore(s => s.updateDrawerData);

  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const isOpen = !!drawerTaskId && !!drawerData;
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [isEditingCategory, setIsEditingCategory] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

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
  }, [hasUnsavedDrawerEdits, lastSaveError, forceCloseDrawer, handleClose]);

  const safeCloseDrawer = useCallback(async () => {
    await flushAutoSave();
    closeDrawer();
  }, [flushAutoSave, closeDrawer]);

  const handleDelete = useCallback(async () => {
    if (!drawerTaskId) return;
    if (!confirm(`${t('common.delete')} ${drawerTaskId.toUpperCase()}?`)) return;
    await deleteTask(drawerTaskId);
    await safeCloseDrawer();
  }, [safeCloseDrawer, deleteTask, drawerTaskId, t]);

  const handleArchiveToggle = useCallback(async () => {
    if (!drawerTaskId) return;
    if (isTaskArchived) {
      await unarchiveTask(drawerTaskId);
    } else {
      await flushAutoSave();
      await archiveTask(drawerTaskId);
    }
  }, [drawerTaskId, isTaskArchived, archiveTask, unarchiveTask, flushAutoSave]);

  const currentCol = drawerTaskId
    ? columns.find(c => c.tasks.some(t => t.id === drawerTaskId))?.name
    : null;

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

  const depResolution = useMemo(() => {
    const map = new Map<string, { exists: boolean; resolved: boolean }>();
    const terminal = terminalStatus(config).toLowerCase();
    for (const col of columns) {
      for (const t of col.tasks) {
        const isArch = t.frontmatter && (t.frontmatter.archived === true || t.frontmatter.archived === 'true');
        map.set(t.id, {
          exists: true,
          resolved: isArch || col.name.toLowerCase() === terminal,
        });
      }
    }
    for (const col of columns) {
      for (const t of col.tasks) {
        const deps = Array.isArray(t.frontmatter.depends_on) ? t.frontmatter.depends_on : [];
        for (const d of deps) {
          if (typeof d !== 'string' || !d.trim()) continue;
          if (!map.has(d)) map.set(d, { exists: false, resolved: true });
        }
      }
    }
    return map;
  }, [columns, config]);

  useEffect(() => {
    if (isOpen && !isDesktop) {
      setTimeout(() => titleInputRef.current?.focus(), 250);
    }
  }, [isOpen, isDesktop]);

  // Auto-resize title
  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.style.height = 'auto';
      titleInputRef.current.style.height = titleInputRef.current.scrollHeight + 'px';
    }
  }, [drawerData?.frontmatter.title]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen || isDesktop) return;
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
  }, [isOpen, isDesktop, handleProtectedClose, handleClose, handleDelete]);

  const handleSubtasksChange = useCallback((subtasks: Subtask[]) => {
    // 📖 Live agent edit (t309): read-only lock while a session edits the task.
    if (editLocked) return;
    updateDrawerData(data => ({ ...data, subtasks }));
    markDrawerDirty();
    triggerAutoSave();
  }, [editLocked, markDrawerDirty, triggerAutoSave, updateDrawerData]);

  if (!drawerData || isDesktop) return null;

  const updateField = <K extends keyof typeof drawerData.frontmatter>(
    key: K,
    value: (typeof drawerData.frontmatter)[K]
  ) => {
    // 📖 Live agent edit (t309): single choke point for every frontmatter
    // field (title, category, report, dependencies): no writes while locked.
    if (editLocked) return;
    updateDrawerData(d => ({
      ...d,
      frontmatter: { ...d.frontmatter, [key]: value },
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
    ? drawerData.frontmatter.depends_on.filter((d): d is string => typeof d === 'string')
    : [];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0 }}
            onClick={handleProtectedClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[100]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-[10vh] pointer-events-none"
          >
            <div className="w-[80vw] max-w-[1200px] h-[80vh] pointer-events-auto flex flex-col glass rounded-2xl shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border rounded-t-2xl flex-wrap gap-y-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono text-[12.5px] text-fg-muted px-1.5 py-0.5 bg-bg-2 border border-border rounded-[4px]">
                    {drawerTaskId?.toUpperCase()}
                  </span>

                  {/* 📖 Live agent edit (t309): session blob + read-only notice
                      while an agent owns this task. */}
                  {editLockSession && <AgentBlobatar sessionId={editLockSession.sessionId} size={20} />}
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

                  {currentCol && (
                    <span className="text-[12.5px] text-fg-dim">· {currentCol}</span>
                  )}
                  {drawerData.subtasks.length > 0 && (
                    <span className="text-[12px] text-fg-muted tabular-nums">
                      {drawerData.subtasks.filter(subtask => subtask.done).length}/{drawerData.subtasks.length} {t('drawer.doneSubtasks')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyTaskUrl}
                    className="text-[12.5px] text-fg-muted underline underline-offset-2 hover:text-fg"
                    title="Copy task URL"
                  >
                    Copy URL
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
                  variant="icon"
                  icon="X"
                  onClick={handleProtectedClose}
                  title={t('drawer.close')}
                />
              </div>

            {/* Body */}
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
                  className="w-full bg-transparent border-none outline-none text-fg text-[22px] font-semibold tracking-tight leading-tight resize-none placeholder:text-fg-faint read-only:opacity-90"
                />

                <div className="h-px bg-border -mx-5" />

                {/* 📖 Live agent edit (t309): live diff of the agent's writes,
                    refresh-free. Self-hiding while the task has no diff yet. */}
                {drawerTaskId && <DiffOverlay taskId={drawerTaskId} />}

                {/* Description (full width) */}
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                    {t('drawer.description')}
                  </div>
                  <BlockNoteMarkdownEditor
                    value={drawerData.body}
                    readOnly={editLocked}
                    onChange={val => {
                      if (editLocked) return;
                      updateDrawerData(d => ({ ...d, body: val }));
                      markDrawerDirty();
                      triggerAutoSave();
                    }}
                    placeholder={t('drawer.descriptionPlaceholder')}
                    minHeight="280px"
                  />
                </div>

                <div className="h-px bg-border -mx-5" />

                <SubtaskEditor
                  subtasks={drawerData.subtasks}
                  onSubtasksChange={handleSubtasksChange}
                />

                <div className="h-px bg-border -mx-5" />

                {/* Report (full width, below subtasks) */}
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                    {t('drawer.report')}
                  </div>
                  <BlockNoteMarkdownEditor
                    value={drawerData.frontmatter.report as string || ''}
                    readOnly={editLocked}
                    onChange={val => updateField('report', val)}
                    placeholder={t('drawer.reportPlaceholder')}
                    minHeight="180px"
                  />
                </div>

                {drawerTaskId && (
                  <TaskExtensionSurface taskId={drawerTaskId} frontmatter={drawerData.frontmatter} />
                )}
              </div>
            </div>

            {/* Footer */}
            {/* 📖 Save-error banner (t110): persists in the footer until the user
             * retries successfully or discards. */}
            {lastSaveError && (
              <div className="flex items-center gap-2 px-4 py-2 bg-danger/10 border-t border-danger/30">
                <span className="text-danger text-[12px] flex-1 truncate" title={lastSaveError}>{lastSaveError}</span>
                <KbdButton
                  variant="primary"
                  label="Retry save"
                  onClick={saveDrawer}
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border rounded-b-2xl">
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
                {/* 📖 "Ask the agent" (t308): opens the chat sidebar with this
                 * task as the pre-compiled context. Mobile parity with the
                 * TaskWorkspace footer action. */}
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
