import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../lib/store';

export function Toaster() {
  const toasts = useStore(s => s.toasts);

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className={`glass px-3.5 py-2 rounded-[6px] text-[13px] font-medium shadow-[0_8px_32px_rgba(0,0,0,0.6)] pointer-events-auto ${
              t.type === 'error'
                ? 'text-danger border-danger/30'
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
