import { motion } from 'motion/react';
import { useStore } from '../lib/store';
import { supportsFileSystemAccess } from '../lib/filesystem';

export function EmptyState() {
  const openFolder = useStore(s => s.openFolder);
  const recentProjects = useStore(s => s.recentProjects);
  const openRecentProject = useStore(s => s.openRecentProject);

  if (!supportsFileSystemAccess()) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-10 text-center">
        <div className="text-[20px] font-semibold tracking-tight text-fg">Unsupported browser</div>
        <div className="text-[13px] text-fg-dim max-w-[440px] leading-relaxed">
          This engine requires the <code className="font-mono text-[11.5px] px-1.5 py-0.5 bg-bg-2 border border-border rounded-[3px]">File System Access API</code>.
          Use Chrome, Edge, Brave or Opera. Firefox and Safari don't support it yet.
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col items-center justify-center gap-5 px-10 py-16 text-center board-bg relative"
    >
      <div className="noise-overlay" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="text-[24px] font-semibold tracking-tight text-fg"
      >
        File-based kanban
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-[13.5px] text-fg-dim max-w-[480px] leading-relaxed"
      >
        Select a folder containing <code className="font-mono text-[11.5px] px-1.5 py-0.5 bg-bg-2 border border-border rounded-[3px]">board.md</code>{' '}
        and a <code className="font-mono text-[11.5px] px-1.5 py-0.5 bg-bg-2 border border-border rounded-[3px]">tasks/</code> sub-directory.
        The engine reads and writes plain markdown on disk. No database. No backend. No account.
      </motion.div>
      <motion.button
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        onClick={openFolder}
        className="btn-primary"
      >
        Select folder
      </motion.button>

      {recentProjects.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mt-4 flex flex-col items-center gap-2"
        >
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint">
            Recent
          </div>
          <div className="flex flex-col gap-1 min-w-[220px]">
            {recentProjects.slice(0, 5).map(p => (
              <button
                key={p.id}
                onClick={() => openRecentProject(p)}
                className="px-3 py-1.5 text-[12.5px] text-fg-dim hover:text-fg hover:bg-bg-2 rounded-[6px] transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      <div className="mt-2 text-[11px] text-fg-muted">
        Chrome · Edge · Brave · Opera only
      </div>
    </motion.div>
  );
}
