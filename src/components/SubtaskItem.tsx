/**
 * @file Subtask row editor
 * @description Editable row for one markdown checklist item inside the task
 * drawer, with toggle, text edit, enter-to-add, empty-backspace removal,
 * and an expandable panel for per-subtask description and report notes.
 *
 * 📖 Subtasks remain plain markdown checklist lines. Description and report
 * are stored as `[DESC]` and `[REPORT]` markers in the markdown body.
 *
 * @functions
 *  → SubtaskItem — animated editable checklist row with expandable detail panel
 *
 * @exports SubtaskItem
 * @see src/components/Drawer.tsx
 * @see src/lib/parser.ts
 */

import { motion, AnimatePresence } from 'motion/react';
import { useRef, useEffect, useState, useCallback } from 'react';
import { Icon } from './Icons';
import type { Subtask } from '../lib/types';

interface SubtaskItemProps {
  subtask: Subtask;
  index: number;
  autoFocus?: boolean;
  onToggle: (index: number) => void;
  onChange: (index: number, text: string) => void;
  onRemove: (index: number) => void;
  onEnterAtEnd: (index: number) => void;
  onDescriptionChange: (index: number, description: string) => void;
  onReportChange: (index: number, report: string) => void;
}

export function SubtaskItem({
  subtask,
  index,
  autoFocus,
  onToggle,
  onChange,
  onRemove,
  onEnterAtEnd,
  onDescriptionChange,
  onReportChange,
}: SubtaskItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(false);
  const hasStartedTypingRef = useRef(false);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      setExpanded(true);
    }
  }, [autoFocus]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setClosing(false);
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      if (!isHoveredRef.current && !hasStartedTypingRef.current) {
        setExpanded(false);
      }
      setClosing(false);
    }, 3000);
  }, [clearCloseTimer]);

  const handleMouseEnter = () => {
    isHoveredRef.current = true;
    clearCloseTimer();
    setExpanded(true);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    if (container.contains(e.relatedTarget as Node)) return;
    isHoveredRef.current = false;
    clearCloseTimer();
    scheduleClose();
  };

  const handleDescriptionFocus = () => {
    hasStartedTypingRef.current = true;
    clearCloseTimer();
  };

  const hasDetail = !!(subtask.description || subtask.report);
  const showReport = subtask.done || (subtask.report && subtask.report.trim() !== '');

  return (
    <div
      ref={containerRef}
      className="flex flex-col rounded-[6px] hover:bg-bg-3/90 dark:hover:bg-bg-1/80 transition-colors duration-150"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        layout
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.18, ease: [0.32, 0.72, 0.35, 1] }}
        className="group flex items-center gap-2 px-1.5 py-1 transition-colors"
      >
        <button
          onClick={() => onToggle(index)}
          className={`flex items-center justify-center w-[14px] h-[14px] rounded-[3px] border flex-shrink-0 transition-all ${
            subtask.done
              ? 'bg-success border-success'
              : 'border-border-strong hover:border-fg-dim'
          }`}
        >
          {subtask.done && <Icon.Check size={10} className="text-white" strokeWidth={2.5} />}
        </button>
        <input
          ref={inputRef}
          type="text"
          value={subtask.text}
          onChange={e => onChange(index, e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEnterAtEnd(index);
            } else if (e.key === 'Backspace' && subtask.text === '') {
              e.preventDefault();
              onRemove(index);
            }
          }}
          placeholder="Subtask..."
          className={`flex-1 bg-transparent border-none outline-none text-[13.5px] ${
            subtask.done ? 'text-fg-muted line-through' : 'text-fg'
          }`}
        />
        <button
          onClick={() => setExpanded(v => !v)}
          title={expanded ? 'Collapse' : 'Expand'}
          className={`opacity-0 group-hover:opacity-100 px-1 py-0.5 rounded-[3px] transition-all ${
            hasDetail ? 'text-accent' : 'text-fg-muted'
          } hover:bg-bg-3`}
        >
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <Icon.ChevronDown size={12} />
          </motion.div>
        </button>
        <button
          onClick={() => onRemove(index)}
          className="opacity-0 group-hover:opacity-100 text-fg-muted hover:text-danger px-1.5 py-0.5 rounded-[3px] hover:bg-bg-3 transition-all"
        >
          <Icon.X size={12} />
        </button>
      </motion.div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0.35, 1] }}
            className="ml-6 mr-2 mb-1 flex flex-col gap-2"
          >
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wide">
                Description
              </label>
              <textarea
                ref={descRef}
                value={subtask.description ?? ''}
                onChange={e => onDescriptionChange(index, e.target.value)}
                onFocus={handleDescriptionFocus}
                placeholder="Add context, links, or notes for this step..."
                rows={4}
                className="w-full bg-bg-2 border border-border rounded-[4px] px-2 py-1.5 text-[13px] text-fg placeholder:text-fg-faint resize-none outline-none focus:border-border-focus transition-colors"
              />
            </div>
            <AnimatePresence initial={false}>
              {showReport && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col gap-1"
                >
                  <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wide">
                    Report
                    {subtask.done && (
                      <span className="ml-1 text-fg-faint normal-case font-normal tracking-normal">
                        — AI fills this after completing
                      </span>
                    )}
                  </label>
                  <textarea
                    value={subtask.report ?? ''}
                    onChange={e => onReportChange(index, e.target.value)}
                    placeholder="What was done, decisions made, trade-offs..."
                    rows={3}
                    className="w-full bg-bg-2 border border-border rounded-[4px] px-2 py-1.5 text-[13px] text-fg placeholder:text-fg-faint resize-none outline-none focus:border-border-focus transition-colors"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <div className="mt-1 -mx-1">
              <div className="h-[2px] rounded-full overflow-hidden bg-fg-faint/15">
                <div
                  key={`bar-${closing}`}
                  className="h-full bg-accent"
                  style={{
                    width: '100%',
                    animation: closing ? 'subtask-close-countdown 3s linear forwards' : 'none',
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
