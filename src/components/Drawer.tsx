/**
 * @file Task drawer editor
 * @description Full-height task detail editor for title, metadata, subtasks,
 * description body, save/close, autosave metadata, and deletion.
 *
 * 📖 The drawer edits the parsed task detail file and syncs lightweight board
 * metadata back into `board.md`, keeping the index cheap while preserving rich
 * task context in `tasks/<id>.md`.
 * 📖 Destructive keyboard deletion uses Cmd/Ctrl+Backspace instead of a naked
 * Delete key so normal text editing inside title, description, and subtask
 * fields remains predictable.
 * 📖 Optional metadata rows read `config.fields`; disabled fields stay hidden
 * even when old task files still contain matching frontmatter values.
 *
 * @functions
 *  → Drawer — task editor panel with keyboard shortcuts and autosave
 *  → FieldRow — aligned metadata row used by the drawer form
 *
 * @exports Drawer
 * @see src/lib/store.ts
 * @see src/components/SubtaskItem.tsx
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icons';
import { KbdButton } from './KbdButton';
import { SubtaskItem } from './SubtaskItem';
import { useStore } from '../lib/store';
import type { Priority, OwnerType } from '../lib/types';

export function Drawer() {
  const { t } = useTranslation();
  const drawerTaskId = useStore(s => s.drawerTaskId);
  const drawerData = useStore(s => s.drawerData);
  const columns = useStore(s => s.columns);
  const closeDrawer = useStore(s => s.closeDrawer);
  const saveDrawer = useStore(s => s.saveDrawer);
  const saveDrawerMetadata = useStore(s => s.saveDrawerMetadata);
  const deleteTask = useStore(s => s.deleteTask);
  const updateDrawerData = useStore(s => s.updateDrawerData);
  const fields = useStore(s => s.config.fields);

  const [focusedSubtaskIdx, setFocusedSubtaskIdx] = useState<number | null>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const isOpen = !!drawerTaskId && !!drawerData;

  const handleDelete = useCallback(async () => {
    if (!drawerTaskId) return;
    if (!confirm(`${t('common.delete')} ${drawerTaskId.toUpperCase()}?`)) return;
    await deleteTask(drawerTaskId);
    safeCloseDrawer();
  }, [safeCloseDrawer, deleteTask, drawerTaskId, t]);

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

  const safeCloseDrawer = useCallback(async () => {
    await flushAutoSave();
    closeDrawer();
  }, [flushAutoSave, closeDrawer]);

  // Get current column for status display
  const currentCol = drawerTaskId
    ? columns.find(c => c.tasks.some(t => t.id === drawerTaskId))?.name
    : null;

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => titleInputRef.current?.focus(), 250);
    }
  }, [isOpen]);

  // Auto-resize title
  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.style.height = 'auto';
      titleInputRef.current.style.height = titleInputRef.current.scrollHeight + 'px';
    }
  }, [drawerData?.frontmatter.title]);

  // Auto-resize body
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.style.height = 'auto';
      bodyRef.current.style.height = Math.max(180, bodyRef.current.scrollHeight) + 'px';
    }
  }, [drawerData?.body]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        void handleClose();
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
  }, [isOpen, handleClose, handleDelete]);

  if (!drawerData) return null;

  const total = drawerData.subtasks.length;
  const done = drawerData.subtasks.filter(s => s.done).length;

  const updateField = <K extends keyof typeof drawerData.frontmatter>(
    key: K,
    value: (typeof drawerData.frontmatter)[K]
  ) => {
    updateDrawerData(d => ({
      ...d,
      frontmatter: { ...d.frontmatter, [key]: value },
    }));
    triggerAutoSave();
  };

  const toggleSubtask = (i: number) => {
    updateDrawerData(d => ({
      ...d,
      subtasks: d.subtasks.map((s, idx) => (idx === i ? { ...s, done: !s.done } : s)),
    }));
    triggerAutoSave();
  };

  const changeSubtask = (i: number, text: string) => {
    updateDrawerData(d => ({
      ...d,
      subtasks: d.subtasks.map((s, idx) => (idx === i ? { ...s, text } : s)),
    }));
    triggerAutoSave();
  };

  const removeSubtask = (i: number) => {
    updateDrawerData(d => ({
      ...d,
      subtasks: d.subtasks.filter((_, idx) => idx !== i),
    }));
    setFocusedSubtaskIdx(Math.max(0, i - 1));
    triggerAutoSave();
  };

  const addSubtask = () => {
    updateDrawerData(d => ({
      ...d,
      subtasks: [...d.subtasks, { done: false, text: '' }],
    }));
    setFocusedSubtaskIdx(drawerData.subtasks.length);
    triggerAutoSave();
  };

  const insertSubtaskAfter = (i: number) => {
    updateDrawerData(d => ({
      ...d,
      subtasks: [
        ...d.subtasks.slice(0, i + 1),
        { done: false, text: '' },
        ...d.subtasks.slice(i + 1),
      ],
    }));
    setFocusedSubtaskIdx(i + 1);
    triggerAutoSave();
  };

  const handleDescriptionChange = (i: number, description: string) => {
    updateDrawerData(d => ({
      ...d,
      subtasks: d.subtasks.map((s, idx) => (idx === i ? { ...s, description } : s)),
    }));
    triggerAutoSave();
  };

  const handleReportChange = (i: number, report: string) => {
    updateDrawerData(d => ({
      ...d,
      subtasks: d.subtasks.map((s, idx) => (idx === i ? { ...s, report } : s)),
    }));
    triggerAutoSave();
  };

  const tagsValue = Array.isArray(drawerData.frontmatter.tags)
    ? drawerData.frontmatter.tags.join(', ')
    : '';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0 }}
            onClick={handleClose}
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
                  {total > 0 && (
                    <span className="text-[12px] text-fg-muted tabular-nums">
                      {done}/{total} {t('drawer.doneSubtasks')}
                    </span>
                  )}
                </div>
                <KbdButton
                  variant="icon"
                  icon="X"
                  onClick={handleClose}
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

                {(fields.priority || fields.assignee || fields.tags || fields.dueDate || fields.ownerType || fields.tools) && (
                  <div className="flex flex-col gap-0.5">
                    {fields.priority && (
                      <FieldRow label={t('drawer.priority')}>
                        <select
                          value={(drawerData.frontmatter.priority as string) || ''}
                          onChange={e => updateField('priority', e.target.value as Priority)}
                          className="field-input w-full"
                        >
                          <option value="">{t('drawer.noPriority')}</option>
                          <option value="P1">{t('drawer.urgentP1')}</option>
                          <option value="P2">{t('drawer.highP2')}</option>
                          <option value="P3">{t('drawer.mediumP3')}</option>
                          <option value="P4">{t('drawer.lowP4')}</option>
                        </select>
                      </FieldRow>
                    )}
                    {fields.assignee && (
                      <FieldRow label={t('drawer.assignee')}>
                        <input
                          type="text"
                          value={(drawerData.frontmatter.assignee as string) || ''}
                          onChange={e => updateField('assignee', e.target.value.replace(/^@/, ''))}
                          placeholder={t('drawer.assigneePlaceholder')}
                          className="field-input w-full"
                        />
                      </FieldRow>
                    )}
                    {fields.tags && (
                      <FieldRow label={t('drawer.tags')}>
                        <input
                          type="text"
                          value={tagsValue}
                          onChange={e => {
                            const arr = e.target.value
                              .split(',')
                              .map(s => s.trim().replace(/^#/, ''))
                              .filter(Boolean);
                            updateField('tags', arr);
                          }}
                          placeholder={t('drawer.tagsPlaceholder')}
                          className="field-input w-full"
                        />
                      </FieldRow>
                    )}
                    {fields.dueDate && (
                      <FieldRow label={t('drawer.dueDate')}>
                        <input
                          type="date"
                          value={(drawerData.frontmatter.due as string) || ''}
                          onChange={e => updateField('due', e.target.value)}
                          className="field-input w-full"
                        />
                      </FieldRow>
                    )}
                    {fields.ownerType && (
                      <FieldRow label={t('drawer.owner')}>
                        <select
                          value={(drawerData.frontmatter.ownerType as OwnerType) || ''}
                          onChange={e => updateField('ownerType', e.target.value as OwnerType)}
                          className="field-input w-full"
                        >
                          <option value="">{t('drawer.unset')}</option>
                          <option value="human">{t('drawer.human')}</option>
                          <option value="ai">{t('drawer.ai')}</option>
                        </select>
                      </FieldRow>
                    )}
                    {fields.tools && (
                      <FieldRow label={t('drawer.tools')}>
                        <input
                          type="text"
                          value={(drawerData.frontmatter.tools as string) || ''}
                          onChange={e => updateField('tools', e.target.value)}
                          placeholder={t('drawer.toolsPlaceholder')}
                          className="field-input w-full"
                        />
                      </FieldRow>
                    )}
                  </div>
                )}

                <div className="h-px bg-border -mx-5" />

                {/* Description + Report (2 columns) */}
                <div className="grid grid-cols-[7fr_3fr] gap-4 -mx-5 px-5">
                  {/* Description (left) */}
                  <div>
                    <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                      {t('drawer.description')}
                    </div>
                    <textarea
                      ref={bodyRef}
                      value={drawerData.body}
                      onChange={e =>
                        updateDrawerData(d => ({ ...d, body: e.target.value }))
                      }
                      placeholder={t('drawer.descriptionPlaceholder')}
                      className="w-full min-h-[180px] bg-bg-2 border border-border rounded-[6px] px-3 py-2.5 text-fg text-[14px] leading-relaxed font-sans outline-none focus:border-border-focus focus:bg-bg-3 transition-colors resize-none placeholder:text-fg-faint"
                    />
                  </div>

                  {/* Report (right) */}
                  <div>
                    <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                      {t('drawer.report')}
                    </div>
                    <div className="min-h-[180px] text-fg text-[14px] leading-relaxed font-sans whitespace-pre-wrap overflow-y-auto">
                      {drawerData.frontmatter.report || (
                        <span className="text-fg-faint italic">{t('drawer.reportPlaceholder')}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border -mx-5" />

                {/* Subtasks */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted">
                      {t('drawer.subtasks')}
                    </span>
                    {total > 0 && (
                      <span className="text-[12px] text-fg-faint tabular-nums">
                        {done}/{total}
                      </span>
                    )}
                  </div>
                  {total > 0 && (
                    <div className="mb-2 h-[3px] bg-bg-2 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: done === total ? '#30a46c' : '#a1a1a1',
                        }}
                        initial={false}
                        animate={{
                          width: total > 0 ? `${(done / total) * 100}%` : '0%',
                        }}
                        transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                      />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <AnimatePresence initial={false}>
                      {drawerData.subtasks.map((s, i) => (
                        <SubtaskItem
                          key={i}
                          subtask={s}
                          index={i}
                          autoFocus={focusedSubtaskIdx === i}
                          onToggle={toggleSubtask}
                          onChange={changeSubtask}
                          onRemove={removeSubtask}
                          onEnterAtEnd={insertSubtaskAfter}
                          onDescriptionChange={handleDescriptionChange}
                          onReportChange={handleReportChange}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                  <KbdButton
                    variant="ghost"
                    icon="Plus"
                    label={t('drawer.addSubtask')}
                    onClick={addSubtask}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border rounded-b-2xl">
              <KbdButton
                variant="danger"
                icon="Trash"
                label={t('drawer.deleteTask')}
                shortcut="⌘⌫"
                onClick={handleDelete}
              />
              <div className="flex items-center gap-2">
                <KbdButton
                  variant="secondary"
                  label={t('drawer.cancel')}
                  shortcut="Esc"
                  onClick={handleClose}
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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3 text-[13.5px]">
      <span className="text-fg-muted">{label}</span>
      <div>{children}</div>
    </div>
  );
}
