/**
 * @file Empty project state
 * @description Renders the first-run project picker, unsupported-browser copy,
 * and recent project shortcuts before a `.kandown` folder is open.
 *
 * 📖 This is the only web surface that directly checks File System Access API
 * support, because no project can be opened without that browser capability.
 *
 * @functions
 *  → LogoSvg — inline Kandown mark for the empty state
 *  → EmptyState — project selection and recent project launcher
 *
 * @exports EmptyState
 * @see src/lib/filesystem.ts
 */

import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import { KbdButton } from './KbdButton';
import { supportsFileSystemAccess, isServerMode } from '../lib/filesystem';

const LogoSvg = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 150 150"
    className={className}
    fill="currentColor"
  >
    <path d="m57.6 64.6 0.1-0.1v-31.3c-0.1-3.5-2.7-5.6-5.7-5.6h-16.3v59.6c0.2-1.3 0.9-2.6 1.7-3.2l20.2-19.4z"/>
    <path d="m87.6 43.8c-3.4 0.1-7.1 1.3-9.9 3.7l-38.5 38.7c-2.1 2.1-3.4 4.8-3.5 7.5v26.7l77.5-76.4v-0.2h-25.6z"/>
    <path d="m108.1 96.4-6 5-22.4-20.8-14.6 14.2 21.1 21.4-5 4.1c-0.6 0.5-0.3 0.9 0.2 0.9h27.6c0.4 0 0.7-0.4 0.7-0.6v-24.8c0-0.7-1.1-0.3-1.6 0.3v0.3z"/>
  </svg>
);

export function EmptyState() {
  const { t } = useTranslation();
  const openFolder = useStore(s => s.openFolder);
  const recentProjects = useStore(s => s.recentProjects);
  const openRecentProject = useStore(s => s.openRecentProject);
  const tryAutoOpenServerProject = useStore(s => s.tryAutoOpenServerProject);

  if (!supportsFileSystemAccess()) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-10 text-center">
        <div className="text-[22px] font-semibold tracking-tight text-fg">{t('emptyState.unsupportedBrowser')}</div>
        <div className="text-[14px] text-fg-dim max-w-[440px] leading-relaxed" dangerouslySetInnerHTML={{ __html: t('emptyState.unsupportedBrowserDesc') }} />
      </div>
    );
  }

  const serverMode = isServerMode();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col items-center justify-start pt-32 gap-5 px-10 text-center board-bg relative"
    >
      <div className="noise-overlay" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <LogoSvg className="w-40 h-40 dark:text-white text-black" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="text-[26px] font-semibold tracking-tight text-fg"
      >
        {t('app.name')}
      </motion.div>

      {serverMode ? (
        <>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-[14.5px] text-fg-dim max-w-[480px] leading-relaxed"
          >
            {t('emptyState.serverModeDesc') ?? 'Kandown is running in server mode. Click below to open your project — the browser will remember your choice for next time.'}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <KbdButton
              variant="primary"
              label={t('emptyState.openThisProject') ?? 'Open this project'}
              onClick={openFolder}
              className="h-10 px-6 text-[16px]"
              iconSize={20}
              icon="Folder"
            />
          </motion.div>
        </>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-[14.5px] text-fg-dim max-w-[480px] leading-relaxed"
          >
            {t('app.tagline')}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-[14.5px] text-fg-dim max-w-[480px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: t('emptyState.selectFolderDesc') }}
          />
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <KbdButton
              variant="primary"
              label={t('common.selectFolder')}
              onClick={openFolder}
              className="h-10 px-6 text-[16px]"
              iconSize={20}
              icon="Folder"
            />
          </motion.div>
        </>
      )}

      {recentProjects.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mt-4 flex flex-col items-center gap-2"
        >
          <div className="text-[11.5px] font-semibold uppercase tracking-wider text-fg-faint">
            {t('common.recent')}
          </div>
          <div className="flex flex-col gap-1 min-w-[220px]">
            {recentProjects.slice(0, 5).map(p => (
              <button
                key={p.id}
                onClick={() => openRecentProject(p)}
                className="px-3 py-1.5 text-[13.5px] text-fg-dim hover:text-fg hover:bg-bg-2 rounded-[6px] transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
