/**
 * @file Task drawer editor
 * @description Full-height task detail editor for title, metadata, subtasks,
 * description body, save/close, autosave metadata, and deletion.
 *
 * 📖 The drawer edits the parsed task detail file and syncs lightweight board
 * metadata back into `board.md`, keeping the index cheap while preserving rich
 * task context in `tasks/<id>.md`.
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
import { Icon } from './Icons';
import { SubtaskItem } from './SubtaskItem';
import { useStore } from '../lib/store';
import type { Priority, OwnerType } from '../lib/types';

export function Drawer() {
  const drawerTaskId = useStore(s => s.drawerTaskId);
  const drawerData = useStore(s => s.drawerData);
  const columns = useStore(s => s.columns);
  const closeDrawer = useStore(s => s.closeDrawer);
  const saveDrawer = useStore(s => s.saveDrawer);
  const saveDrawerMetadata = useStore(s => s.saveDrawerMetadata);
  const deleteTask = useStore(s => s.deleteTask);
  const updateDrawerData = useStore(s => s.updateDrawerData);

  const [focusedSubtaskIdx, setFocusedSubtaskIdx] = useState<number | null>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOpen = !!drawerTaskId && !!drawerData;

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveDrawerMetadata();
    }, 600);
  }, [saveDrawerMetadata]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

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
        closeDrawer();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveDrawer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeDrawer, saveDrawer]);

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

  const handleDelete = async () => {
    if (!drawerTaskId) return;
    if (!confirm(`Delete ${drawerTaskId.toUpperCase()}?`)) return;
    await deleteTask(drawerTaskId);
    closeDrawer();
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
            transition={{ duration: 0.2 }}
            onClick={closeDrawer}
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[100]"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40, mass: 0.9 }}
            className="fixed top-0 right-0 bottom-0 w-[640px] max-w-[92vw] z-[101] flex flex-col glass"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[12.5px] text-fg-muted px-1.5 py-0.5 bg-bg-2 border border-border rounded-[4px]">
                  {drawerTaskId?.toUpperCase()}
                </span>
                {currentCol && (
                  <span className="text-[12.5px] text-fg-dim">· {currentCol}</span>
                )}
                {total > 0 && (
                  <span className="text-[12px] text-fg-muted tabular-nums">
                    {done}/{total} done
                  </span>
                )}
              </div>
              <button onClick={closeDrawer} className="btn-icon" title="Close (Esc)">
                <Icon.X />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-5">
                {/* Title */}
                <textarea
                  ref={titleInputRef}
                  value={(drawerData.frontmatter.title as string) || ''}
                  onChange={e => updateField('title', e.target.value)}
                  placeholder="Task title"
                  rows={1}
                  className="w-full bg-transparent border-none outline-none text-fg text-[22px] font-semibold tracking-tight leading-tight resize-none placeholder:text-fg-faint"
                />

                {/* Metadata grid */}
                <div className="flex flex-col gap-0.5">
                  <FieldRow label="Priority">
                    <select
                      value={(drawerData.frontmatter.priority as string) || ''}
                      onChange={e => updateField('priority', e.target.value as Priority)}
                      className="field-input w-full"
                    >
                      <option value="">No priority</option>
                      <option value="P1">Urgent · P1</option>
                      <option value="P2">High · P2</option>
                      <option value="P3">Medium · P3</option>
                      <option value="P4">Low · P4</option>
                    </select>
                  </FieldRow>
                  <FieldRow label="Assignee">
                    <input
                      type="text"
                      value={(drawerData.frontmatter.assignee as string) || ''}
                      onChange={e => updateField('assignee', e.target.value.replace(/^@/, ''))}
                      placeholder="username"
                      className="field-input w-full"
                    />
                  </FieldRow>
                  <FieldRow label="Tags">
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
                      placeholder="backend, security, api"
                      className="field-input w-full"
                    />
                  </FieldRow>
                  <FieldRow label="Due date">
                    <input
                      type="date"
                      value={(drawerData.frontmatter.due as string) || ''}
                      onChange={e => updateField('due', e.target.value)}
                      className="field-input w-full"
                    />
                  </FieldRow>
                  <FieldRow label="Owner">
                    <select
                      value={(drawerData.frontmatter.ownerType as OwnerType) || ''}
                      onChange={e => updateField('ownerType', e.target.value as OwnerType)}
                      className="field-input w-full"
                    >
                      <option value="">Unset</option>
                      <option value="human">👤 Human</option>
                      <option value="ai">🤖 AI</option>
                    </select>
                  </FieldRow>
                  <FieldRow label="Tools">
                    <input
                      type="text"
                      value={(drawerData.frontmatter.tools as string) || ''}
                      onChange={e => updateField('tools', e.target.value)}
                      placeholder="filesystem, cli, websearch, browser..."
                      className="field-input w-full"
                    />
                  </FieldRow>
                </div>

                <div className="h-px bg-border -mx-5" />

                {/* Subtasks */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted">
                      Subtasks
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
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                  <button
                    onClick={addSubtask}
                    className="flex items-center gap-2 px-1.5 py-1 mt-1 text-fg-muted hover:text-fg text-[13px] rounded-[4px] hover:bg-bg-2 transition-colors"
                  >
                    <Icon.Plus size={12} />
                    Add subtask
                  </button>
                </div>

                <div className="h-px bg-border -mx-5" />

                {/* Description */}
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                    Description
                  </div>
                  <textarea
                    ref={bodyRef}
                    value={drawerData.body}
                    onChange={e =>
                      updateDrawerData(d => ({ ...d, body: e.target.value }))
                    }
                    placeholder="Write some context, links, decisions..."
                    className="w-full min-h-[180px] bg-bg-2 border border-border rounded-[6px] px-3 py-2.5 text-fg text-[14px] leading-relaxed font-sans outline-none focus:border-border-focus focus:bg-bg-3 transition-colors resize-none placeholder:text-fg-faint"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border">
              <button onClick={handleDelete} className="btn-danger">
                <Icon.Trash size={12} />
                Delete
              </button>
              <div className="flex items-center gap-2">
                <button onClick={closeDrawer} className="btn-secondary">
                  Cancel
                </button>
                <button onClick={saveDrawer} className="btn-primary">
                  Save & Close
                  <span className="kbd ml-1" style={{ color: 'rgba(0,0,0,0.5)', background: 'rgba(0,0,0,0.1)', borderColor: 'rgba(0,0,0,0.15)' }}>⌘S</span>
                </button>
              </div>
            </div>
          </motion.aside>
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
