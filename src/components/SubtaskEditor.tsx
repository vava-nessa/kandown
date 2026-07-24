/**
 * @file Subtask editor section
 * @description Reusable checklist editor rendered below a task description in
 * both the mobile drawer and desktop workspace. It keeps the interaction model
 * (toggle, edit, add, remove, expand details, and keyboard insertion) in one
 * place while the parent owns persistence through the Zustand drawer state.
 *
 * 📖 Subtasks are deliberately edited as a plain `Subtask[]`; the parent marks
 * the drawer dirty and schedules the existing markdown autosave after each
 * change. This keeps the UI responsive without creating a second persistence
 * path or hiding the task-file format from the store.
 *
 * @functions
 *  → SubtaskEditor — checklist section with progress and add controls
 *
 * @exports SubtaskEditor
 * @see src/components/SubtaskItem.tsx
 * @see src/lib/parser.ts
 */

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { KbdButton } from './KbdButton';
import { SubtaskItem } from './SubtaskItem';
import type { Subtask } from '../lib/types';

interface SubtaskEditorProps {
  subtasks: Subtask[];
  onSubtasksChange: (subtasks: Subtask[]) => void;
}

export function SubtaskEditor({ subtasks, onSubtasksChange }: SubtaskEditorProps) {
  const { t } = useTranslation();
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const total = subtasks.length;
  const done = subtasks.filter(subtask => subtask.done).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  // 📖 Clear the one-shot autofocus flag after the new row has mounted. If it
  // stayed true, later parent renders could unexpectedly steal focus again.
  useEffect(() => {
    if (focusedIndex === null) return;
    const frame = window.requestAnimationFrame(() => setFocusedIndex(null));
    return () => window.cancelAnimationFrame(frame);
  }, [focusedIndex]);

  const updateAt = useCallback((index: number, update: (subtask: Subtask) => Subtask) => {
    if (index < 0 || index >= subtasks.length) return;
    onSubtasksChange(subtasks.map((subtask, currentIndex) => (
      currentIndex === index ? update(subtask) : subtask
    )));
  }, [onSubtasksChange, subtasks]);

  const toggleSubtask = useCallback((index: number) => {
    updateAt(index, subtask => ({ ...subtask, done: !subtask.done }));
  }, [updateAt]);

  const changeSubtask = useCallback((index: number, text: string) => {
    updateAt(index, subtask => ({ ...subtask, text }));
  }, [updateAt]);

  const changeDescription = useCallback((index: number, description: string) => {
    updateAt(index, subtask => ({ ...subtask, description }));
  }, [updateAt]);

  const changeReport = useCallback((index: number, report: string) => {
    updateAt(index, subtask => ({ ...subtask, report }));
  }, [updateAt]);

  const removeSubtask = useCallback((index: number) => {
    if (index < 0 || index >= subtasks.length) return;
    const next = subtasks.filter((_, currentIndex) => currentIndex !== index);
    onSubtasksChange(next);
    setFocusedIndex(next.length > 0 ? Math.min(index, next.length - 1) : null);
  }, [onSubtasksChange, subtasks]);

  const insertSubtaskAfter = useCallback((index: number) => {
    if (index < -1 || index >= subtasks.length) return;
    const insertionIndex = index + 1;
    const next = [
      ...subtasks.slice(0, insertionIndex),
      { done: false, text: '' },
      ...subtasks.slice(insertionIndex),
    ];
    onSubtasksChange(next);
    setFocusedIndex(insertionIndex);
  }, [onSubtasksChange, subtasks]);

  const addSubtask = useCallback(() => {
    const next = [...subtasks, { done: false, text: '' }];
    onSubtasksChange(next);
    setFocusedIndex(next.length - 1);
  }, [onSubtasksChange, subtasks]);

  return (
    <section aria-labelledby="kandown-subtasks-heading">
      <div className="flex items-center gap-2 mb-2">
        <span
          id="kandown-subtasks-heading"
          className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted"
        >
          {t('drawer.subtasks')}
        </span>
        <span className="text-[12px] text-fg-faint tabular-nums" aria-live="polite">
          {done}/{total}
        </span>
      </div>

      {total > 0 && (
        <div
          className="mb-2 h-[3px] overflow-hidden rounded-full bg-bg-2"
          role="progressbar"
          aria-label={t('drawer.subtasksProgress', { done, total })}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: done === total ? '#30a46c' : '#a1a1a1' }}
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          />
        </div>
      )}

      <div className="flex flex-col rounded-lg border border-border bg-bg/30 px-1 py-1">
        <AnimatePresence initial={false}>
          {subtasks.map((subtask, index) => (
            <SubtaskItem
              key={index}
              subtask={subtask}
              index={index}
              autoFocus={focusedIndex === index}
              onToggle={toggleSubtask}
              onChange={changeSubtask}
              onRemove={removeSubtask}
              onEnterAtEnd={insertSubtaskAfter}
              onDescriptionChange={changeDescription}
              onReportChange={changeReport}
            />
          ))}
        </AnimatePresence>
        {total === 0 && (
          <p className="px-2.5 py-2 text-[12.5px] text-fg-muted">
            {t('subtask.empty')}
          </p>
        )}
      </div>

      <KbdButton
        variant="ghost"
        icon="Plus"
        label={t('drawer.addSubtask')}
        onClick={addSubtask}
        className="mt-1"
      />
    </section>
  );
}

export type { SubtaskEditorProps };
