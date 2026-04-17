import { motion } from 'motion/react';
import { useRef, useEffect } from 'react';
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
}

export function SubtaskItem({
  subtask,
  index,
  autoFocus,
  onToggle,
  onChange,
  onRemove,
  onEnterAtEnd,
}: SubtaskItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0.35, 1] }}
      className="group flex items-center gap-2 px-1.5 py-1 rounded-[4px] hover:bg-bg-2 transition-colors"
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
        onClick={() => onRemove(index)}
        className="opacity-0 group-hover:opacity-100 text-fg-muted hover:text-danger px-1.5 py-0.5 rounded-[3px] hover:bg-bg-3 transition-all"
      >
        <Icon.X size={12} />
      </button>
    </motion.div>
  );
}
