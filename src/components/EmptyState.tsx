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
import { MOTION } from '../lib/motion-presets';
import { LogoSvg } from './LogoSvg';
import HeroGeometric from './HeroGeometric';

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
        <div className="text-[14px] text-fg-dim max-w-[440px] leading-relaxed" dangerouslySetInnerHTML={{ __html: t('emptyState.unsupportedBrowserDesc') }} />
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
    <HeroGeometric className="flex-1 min-h-[calc(100vh-56px)] pt-16">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center justify-start gap-5 text-center relative z-10"
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <LogoSvg className="w-36 h-36 dark:text-white text-black" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-[32px] font-bold tracking-tight text-fg"
        >
          {t('app.name')}
        </motion.div>

        {serverMode ? (
          <>
            <motion.div
              {...MOTION.heroStagger(2)}
              className="text-[15px] text-fg-dim max-w-[480px] leading-relaxed"
            >
              {t('emptyState.serverModeDesc') ?? 'Kandown is running in server mode. The project will load automatically.'}
            </motion.div>
          </>
        ) : (
          <>
            <motion.div
              {...MOTION.heroStagger(2)}
              className="text-[16px] text-fg-dim max-w-[480px] leading-relaxed font-medium"
            >
              {t('app.tagline')}
            </motion.div>
            <motion.div
              {...MOTION.heroStagger(3)}
              className="text-[14.5px] text-fg-dim max-w-[480px] leading-relaxed"
              dangerouslySetInnerHTML={{ __html: t('emptyState.selectFolderDesc') }}
            />
            <motion.div {...MOTION.heroStagger(4)}>
              <KbdButton
                variant="primary"
                label={t('common.selectFolder')}
                onClick={openFolder}
                className="h-11 px-7 text-[16px] shadow-lg shadow-primary/20"
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
            className="mt-6 flex flex-col items-center gap-2"
          >
            <div className="text-[11.5px] font-semibold uppercase tracking-wider text-fg-faint">
              {t('common.recent')}
            </div>
            <div className="flex flex-col gap-1 min-w-[220px]">
              {recentProjects.slice(0, 5).map(p => (
                <button
                  key={p.id}
                  onClick={() => openRecentProject(p)}
                  className="px-3.5 py-1.5 text-[13.5px] text-fg-dim hover:text-fg hover:bg-bg-2/80 rounded-[6px] transition-colors backdrop-blur-sm"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </HeroGeometric>
  );
}

