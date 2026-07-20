/**
 * @file Task drawer editor
 * @description Full-height task detail editor for title, description, report,
 * save/close, autosave, and deletion.
 *
 * 📖 The drawer edits the parsed task file and writes changes back into
 * frontmatter, keeping `tasks/<id>.md` as the single source of truth for board
 * state and rich task context.
 * 📖 Destructive keyboard deletion uses Cmd/Ctrl+Backspace instead of a naked
 * Delete key so normal text editing inside title and description remains
 * predictable.
 * 📖 Layout is intentionally minimal: title on top, then DESCRIPTION (full
 * width), then REPORT (full width, below description). No subtask editor, no
 * frontmatter metadata fields — those are managed in the task file directly
 * or via the per-card metadata block on the board.
 *
 * @functions
 *  → Drawer — task editor panel with keyboard shortcuts and autosave
 *
 * @exports Drawer
 * @see src/lib/store.ts
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { KbdButton } from './KbdButton';
import { BlockNoteMarkdownEditor } from './ui/BlockNoteMarkdownEditor';
import { useStore } from '../lib/store';
import { buildTaskUrl } from '../lib/task-url';

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
  const hasUnsavedDrawerEdits = useStore(s => s.hasUnsavedDrawerEdits);
  const lastSaveError = useStore(s => s.lastSaveError);
  const markDrawerDirty = useStore(s => s.markDrawerDirty);
  const forceCloseDrawer = useStore(s => s.forceCloseDrawer);

  // 📖 archived flag is read as either boolean or the string "true" (parseSimpleYaml
  // keeps scalars as strings). Computed early so handlers and JSX share it.
  const isTaskArchived = String(drawerData?.frontmatter.archived) === 'true';
  const updateDrawerData = useStore(s => s.updateDrawerData);

  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const isOpen = !!drawerTaskId && !!drawerData;
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);

  // 📖 Desktop task editing is now handled by TaskWorkspace. Keep this modal
  // mounted only on small screens so mobile keeps the familiar full-screen
  // overlay while desktop gets the split-pane workspace below the header.
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

  /**
   * 📖 Close guard (t110): if there are unsaved edits OR a known save error,
   * prompt before discarding. Choosing "discard" stashes the edits into the
   * recovery buffer (via forceCloseDrawer) so they can be restored when the
   * same task is reopened; choosing "cancel" keeps the drawer open.
   */
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

  // 📖 Archive/restore toggle. Flushes pending autosave first so no edit is
  // lost when the file is moved to tasks/archive/.
  const handleArchiveToggle = useCallback(async () => {
    if (!drawerTaskId) return;
    if (isTaskArchived) {
      await unarchiveTask(drawerTaskId);
    } else {
      await flushAutoSave();
      await archiveTask(drawerTaskId);
    }
  }, [drawerTaskId, isTaskArchived, archiveTask, unarchiveTask, flushAutoSave]);

  // Get current column for status display
  const currentCol = drawerTaskId
    ? columns.find(c => c.tasks.some(t => t.id === drawerTaskId))?.name
    : null;

  // 📖 Agent hook button is only rendered when the daemon is configured with
  // KANDOWN_AGENT_HOOK_URL. The button is intentionally in the footer next to
  // the destructive actions — sending a task to an agent is a "go" action, not
  // an edit, so it deserves a visible slot.
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

  // 📖 Build a depId → { exists, resolved } map for the dependency chips.
  // "Resolved" = in terminal status OR archived OR unknown (typos never
  // block — see src/lib/dependencies.ts for the rationale).
  const depResolution = useMemo(() => {
    const map = new Map<string, { exists: boolean; resolved: boolean }>();
    const terminal = (config.board.columns[config.board.columns.length - 1] || 'Done').toLowerCase();
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
  }, [columns, config.board.columns]);

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

  if (!drawerData || isDesktop) return null;

  const updateField = <K extends keyof typeof drawerData.frontmatter>(
    key: K,
    value: (typeof drawerData.frontmatter)[K]
  ) => {
    updateDrawerData(d => ({
      ...d,
      frontmatter: { ...d.frontmatter, [key]: value },
    }));
    markDrawerDirty();
    triggerAutoSave();
  };

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
              <div className="flex items-center justify-between px-5 py-3 border-b border-border rounded-t-2xl">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[12.5px] text-fg-muted px-1.5 py-0.5 bg-bg-2 border border-border rounded-[4px]">
                    {drawerTaskId?.toUpperCase()}
                  </span>
                  {currentCol && (
                    <span className="text-[12.5px] text-fg-dim">· {currentCol}</span>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyTaskUrl}
                    className="text-[12.5px] text-fg-muted underline underline-offset-2 hover:text-fg"
                    title="Copy task URL"
                  >
                    Copy URL
                  </button>
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
                {/* Title */}
                <textarea
                  ref={titleInputRef}
                  value={(drawerData.frontmatter.title as string) || ''}
                  onChange={e => updateField('title', e.target.value)}
                  placeholder={t('drawer.taskTitle')}
                  rows={1}
                  className="w-full bg-transparent border-none outline-none text-fg text-[22px] font-semibold tracking-tight leading-tight resize-none placeholder:text-fg-faint"
                />

                <div className="h-px bg-border -mx-5" />

                {/* Dependencies — task ids this one is blocked by. Comma-
                 * separated input with chip rendering. Editable in place; the
                 * store enforces the terminal-status gate on save/move. */}
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                    {t('dependencies.label')}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(Array.isArray(drawerData.frontmatter.depends_on)
                      ? drawerData.frontmatter.depends_on.filter((d): d is string => typeof d === 'string')
                      : []
                    ).map((depId, i) => {
                      const isResolved = depResolution.get(depId)?.resolved ?? false;
                      const exists = depResolution.get(depId)?.exists ?? true;
                      return (
                        <span
                          key={i}
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
                              ).filter((_, idx) => idx !== i);
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
                        ? drawerData.frontmatter.depends_on.filter((d): d is string => typeof d === 'string')
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

                {/* Description (full width) */}
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                    {t('drawer.description')}
                  </div>
                  <BlockNoteMarkdownEditor
                    value={drawerData.body}
                    onChange={val => {
                      updateDrawerData(d => ({ ...d, body: val }));
                      markDrawerDirty();
                    }}
                    placeholder={t('drawer.descriptionPlaceholder')}
                    minHeight="280px"
                  />
                </div>

                <div className="h-px bg-border -mx-5" />

                {/* Report (full width, below description) */}
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                    {t('drawer.report')}
                  </div>
                  <BlockNoteMarkdownEditor
                    value={drawerData.frontmatter.report as string || ''}
                    onChange={val => updateField('report', val)}
                    placeholder={t('drawer.reportPlaceholder')}
                    minHeight="180px"
                  />
                </div>
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
