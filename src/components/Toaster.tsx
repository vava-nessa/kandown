/**
 * @file Toast notifications
 * @description Renders transient success, info, and error messages emitted by
 * store actions such as saving, creating, deleting, and permission failures.
 *
 * 📖 Toast lifecycle is owned by the store; this component only animates the
 * current queue and applies the correct visual treatment.
 *
 * @functions
 *  → Toaster — fixed notification stack
 *
 * @exports Toaster
 * @see src/lib/store.ts
 */

import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../lib/store';
import { MOTION } from '../lib/motion-presets';

export function Toaster() {
  const toasts = useStore(s => s.toasts);

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            {...MOTION.toast}
            className={`glass px-3.5 py-2 rounded-[6px] text-[13px] font-medium shadow-[0_8px_32px_rgba(0,0,0,0.6)] pointer-events-auto ${
              t.type === 'error'
                ? 'text-danger border-danger/30'
                : t.type === 'warning'
                ? 'text-amber-600 dark:text-amber-300 border-amber-500/30'
                : t.type === 'info'
                ? 'text-fg'
                : 'text-fg'
            }`}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
