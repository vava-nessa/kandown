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
import { Trans, useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import { KbdButton } from './KbdButton';
import { supportsFileSystemAccess, isServerMode } from '../lib/filesystem';
import { MOTION } from '../lib/motion-presets';
import { LogoSvg } from './LogoSvg';

export function EmptyState() {
  const { t } = useTranslation();
  const openFolder = useStore(s => s.openFolder);
  const openServerProject = useStore(s => s.openServerProject);
  const loading = useStore(s => s.loading);
  const recentProjects = useStore(s => s.recentProjects);
  const openRecentProject = useStore(s => s.openRecentProject);
  const tryAutoOpenServerProject = useStore(s => s.tryAutoOpenServerProject);

  if (!supportsFileSystemAccess()) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-10 text-center">
        <div className="text-[22px] font-semibold tracking-tight text-fg">{t('emptyState.unsupportedBrowser')}</div>
        <div className="text-[14px] text-fg-dim max-w-[440px] leading-relaxed">
          <Trans i18nKey="emptyState.unsupportedBrowserDesc">
            This engine requires the <code>File System Access API</code>. Use Chrome, Edge, Brave or Opera. Firefox and Safari don't support it yet.
          </Trans>
        </div>
      </div>
    );
  }

  const serverMode = isServerMode();

  if (serverMode && loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-10 text-center">
        <div className="text-[22px] font-semibold tracking-tight text-fg">Chargement…</div>
        <div className="text-[14px] text-fg-dim max-w-[440px] leading-relaxed">
          {t('emptyState.serverModeLoadingDesc') ?? 'Connexion au serveur…'}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col items-center justify-start pt-32 gap-5 px-10 text-center board-bg relative"
    >
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
            {...MOTION.heroStagger(2)}
            className="text-[14.5px] text-fg-dim max-w-[480px] leading-relaxed"
          >
            {t('emptyState.serverModeDesc') ?? 'Kandown is running in server mode. The project will load automatically.'}
          </motion.div>
        </>
      ) : (
        <>
          <motion.div
            {...MOTION.heroStagger(2)}
            className="text-[14.5px] text-fg-dim max-w-[480px] leading-relaxed"
          >
            {t('app.tagline')}
          </motion.div>
          <motion.div
            {...MOTION.heroStagger(3)}
            className="text-[14.5px] text-fg-dim max-w-[480px] leading-relaxed"
          >
            <Trans i18nKey="emptyState.selectFolderDesc">
              Select the <strong>project root</strong> — the folder that contains both <code>.kandown/</code> and <code>tasks/</code>.
            </Trans>
          </motion.div>
          <motion.div {...MOTION.heroStagger(4)}>
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
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, ease: MOTION.fade.transition.ease }}
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
