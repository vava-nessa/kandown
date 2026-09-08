/**
 * @file Agent chat overlay (t308, reworked by t337)
 * @description Mobile-only fullscreen chat overlay (<768px), mirroring the
 * Drawer pattern. Since t337 the desktop chat is the full-page agent view
 * (AgentPage): openSidebar routes desktop to that page and only mobile keeps
 * this overlay, so the component renders nothing at 768px and above. The
 * conversation body itself (guard states, messages, composer, skills) lives
 * in the shared AgentChatSurface; this shell only owns the scrim, the
 * fullscreen container and the minimal header (title, new chat, close).
 *
 * 📖 Mounted once in App.tsx, outside the board layout, like Drawer and
 * CommandPalette, so it overlays every view and a board crash never takes
 * the conversation down. Gated by the `agent.useAgents` config flag.
 *
 * @functions
 *  → ChatSidebar: the mobile fullscreen agent chat overlay
 *
 * @exports ChatSidebar
 * @see src/components/agent/AgentChatSurface.tsx: the conversation body
 * @see src/components/agent/AgentPage.tsx: the desktop full-page shell
 * @see src/lib/store/agentChatSlice.ts
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { IconMessage, IconPlus, IconX } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import { MOTION } from '../../lib/motion-presets';
import { AgentChatSurface } from './AgentChatSurface';

export function ChatSidebar() {
  const { t } = useTranslation();
  const sidebarOpen = useStore(s => s.agentChat.sidebarOpen);
  const sessions = useStore(s => s.agentChat.sessions);
  const activeSessionId = useStore(s => s.agentChat.activeSessionId);
  const closeSidebar = useStore(s => s.closeSidebar);
  const newConversation = useStore(s => s.newConversation);

  // 📖 Mobile detection mirrors Drawer.tsx: same 768px breakpoint, same
  // fullscreen-overlay treatment below it. Desktop never sees this overlay:
  // the agent lives on its own full page since t337.
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const activeTitle = sessions.find(entry => entry.id === activeSessionId)?.title;

  return (
    <AnimatePresence>
      {sidebarOpen && !isDesktop && (
        <>
          {/* 📖 Mobile scrim: tap to dismiss, like the Drawer. */}
          <motion.div
            {...MOTION.fade}
            onClick={closeSidebar}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-[4px]"
          />
          <motion.aside
            {...MOTION.fade}
            role="complementary"
            aria-label={t('agentChat.title', 'Agent')}
            className="bui fixed inset-0 z-[101] flex flex-col bg-bg shadow-[0_0_48px_rgba(0,0,0,0.25)]"
          >
            {/* 📖 Minimal mobile header: the conversation list lives in the
             * rail (behind this overlay), so the header only offers the new
             * chat action and the close. */}
            <div className="flex flex-none items-center gap-2 border-b border-border px-3 py-2.5">
              <IconMessage size={14} stroke={1.8} className="flex-none text-fg-muted" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
                {activeTitle ?? t('agentChat.sessionUntitled', 'Untitled conversation')}
              </span>
              <button
                type="button"
                onClick={newConversation}
                className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-bg-2 hover:text-fg"
                title={t('agentChat.newChat', 'New chat')}
                aria-label={t('agentChat.newChat', 'New chat')}
              >
                <IconPlus size={14} stroke={1.8} />
              </button>
              <button
                type="button"
                onClick={closeSidebar}
                className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-bg-2 hover:text-fg"
                title={t('common.close', 'Close')}
                aria-label={t('common.close', 'Close')}
              >
                <IconX size={14} stroke={1.8} />
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 flex-col">
              <AgentChatSurface active={sidebarOpen} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
