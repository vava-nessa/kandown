/**
 * @file Column color picker menu dropdown
 * @description 3-dot dropdown menu for selecting column background tint color.
 *
 * @exports ColumnColorMenu
 * @see src/components/Column.tsx
 * @see src/components/ListView.tsx
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { COLOR_SWATCHES } from '../lib/columnUtils';
import type { ColumnColor } from '../lib/types';

interface ColumnColorMenuProps {
  columnName: string;
  currentColor: ColumnColor;
  onSelect: (color: ColumnColor) => void;
}

export function ColumnColorMenu({ currentColor, onSelect }: ColumnColorMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        className="w-5 h-5 inline-flex items-center justify-center text-fg-muted hover:bg-bg-3 hover:text-fg rounded-[4px] transition-colors"
        title={t('column.columnColor')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-60">
          <circle cx="3" cy="2" r="1.2" fill="currentColor" />
          <circle cx="9" cy="2" r="1.2" fill="currentColor" />
          <circle cx="3" cy="6" r="1.2" fill="currentColor" />
          <circle cx="9" cy="6" r="1.2" fill="currentColor" />
          <circle cx="3" cy="10" r="1.2" fill="currentColor" />
          <circle cx="9" cy="10" r="1.2" fill="currentColor" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 bg-bg-2 border border-border rounded-[6px] shadow-lg p-1.5 z-50 min-w-[152px]"
            style={{ transformOrigin: 'top right' }}
          >
            <div className="text-[11px] text-fg-muted px-1.5 pb-1.5 font-medium">{t('column.color')}</div>
            <div className="grid grid-cols-5 gap-1">
              {COLOR_SWATCHES.map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(key);
                    setOpen(false);
                  }}
                  title={label}
                  className={`w-6 h-6 rounded-[4px] flex items-center justify-center transition-all ${
                    currentColor === key ? 'ring-2 ring-offset-1 ring-offset-bg-2 ring-fg' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: color }}
                >
                  {currentColor === key && (
                    <svg width="10" height="10" viewBox="0 0 10 10" className="text-white">
                      <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
