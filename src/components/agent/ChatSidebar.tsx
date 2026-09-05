/**
 * @file Agent chat sidebar (t308)
 * @description The web UI half of the kandown agent chat: a fixed right sidebar
 * on desktop (collapsible, ~400px) and a fullscreen overlay on mobile (<768px),
 * mirroring the Drawer pattern. Owns the scroll behavior (stick to bottom while
 * streaming, jump-to-bottom pill when the user scrolls up), the session
 * switcher, the harness selector for NEW conversations, the permission mode
 * chip, the usage badge, the daemon guard card when there is no daemon, and
 * the t310 skill surface: chat skill pill buttons plus the interactive answer
 * form, both mounted above the PromptBar. Round 3 adds the stale-auth banner
 * (daemon restarted: reload to reconnect) in place of the daemon card, the
 * pick-a-task flow when a task-scoped skill launches with no preselected
 * task, and the shared skill launch handler the PromptBar slash-token picker
 * reuses. The header also hosts the t311
 * autopilot controls (start/kill switch + run totals) as a third compact row.
 *
 * 📖 Mounted once in App.tsx, outside the board layout, like Drawer and
 * CommandPalette, so it overlays every view and a board crash never takes the
 * conversation down.
 *
 * @functions
 *  → ChatSidebar: the agent chat sidebar
 *
 * @exports ChatSidebar
 * @see src/lib/store/agentChatSlice.ts
 * @see src/components/agent/MessageList.tsx
 * @see src/components/agent/SkillButtons.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { IconArrowDown, IconX } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import { MOTION } from '../../lib/motion-presets';
import { matchAgent } from '../../lib/agent-aliases';
import { SessionSwitcher } from './SessionSwitcher';
import { MessageList } from './MessageList';
import { PromptBar } from './PromptBar';
import { SkillButtons } from './SkillButtons';
import { AnswerForm } from './AnswerForm';
import { UsageBadge } from './UsageBadge';
import { DaemonGuardCard } from './DaemonGuardCard';
import { GitInitBanner } from './GitInitBanner';
import { AutopilotControls } from './AutopilotControls';
import type { ChatSkillButton } from '../../lib/store/types';

export function ChatSidebar() {
  const { t } = useTranslation();
  const sidebarOpen = useStore(s => s.agentChat.sidebarOpen);
  const sessions = useStore(s => s.agentChat.sessions);
  const activeSessionId = useStore(s => s.agentChat.activeSessionId);
  const live = useStore(s => s.agentChat.live);
  const guard = useStore(s => s.agentChat.guard);
  const permissionMode = useStore(s => s.agentChat.permissionModeSnapshot ?? s.config.agent.permissionMode);
  const preContextTaskId = useStore(s => s.agentChat.preContextTaskId);
  const gitWarning = useStore(s => s.agentChat.gitWarning);
  const harnesses = useStore(s => s.agentChat.harnesses);
  const chatSkills = useStore(s => s.agentChat.chatSkills);
  const activeSkill = useStore(s => s.agentChat.activeSkill);
  const answersRequested = useStore(s => s.agentChat.answersRequested);
  const skillQuestions = useStore(s => s.agentChat.skillQuestions);
  const columns = useStore(s => s.columns);
  const closeSidebar = useStore(s => s.closeSidebar);
  const newConversation = useStore(s => s.newConversation);
  const resumeSession = useStore(s => s.resumeSession);
  const startSession = useStore(s => s.startSession);
  const sendMessage = useStore(s => s.sendMessage);
  const sendAnswers = useStore(s => s.sendAnswers);
  const dismissAnswers = useStore(s => s.dismissAnswers);
  const stopSession = useStore(s => s.stopSession);
  const forgetSession = useStore(s => s.forgetSession);
  const starting = useStore(s => s.agentChat.starting);
  const sending = useStore(s => s.agentChat.sending);
  // 📖 Local dismissal only: the banner comes back for the next session that
  // reports the advisory, which is the right lifetime for a safety reminder.
  const [gitBannerDismissed, setGitBannerDismissed] = useState(false);
  // 📖 Feature 3: a task-scoped skill launched without a task context parks
  // here and the PromptBar renders its pick-a-task menu until one is chosen
  // (or Esc dismisses). Null means no pending pick.
  const [pendingSkill, setPendingSkill] = useState<{ skill: ChatSkillButton } | null>(null);
  // 📖 Closing the sidebar cancels an unfinished pick: reopening must show a
  // fresh composer, not a stale "pick a task" menu from the previous visit.
  useEffect(() => {
    if (!sidebarOpen) setPendingSkill(null);
  }, [sidebarOpen]);

  // 📖 Tasks available to pick from: the disabled state of task-scoped skill
  // buttons only makes sense when the board has nothing to offer at all.
  const boardTaskCount = useStore(s => s.columns.reduce((total, column) => total + column.tasks.length, 0));

  // 📖 Mobile detection mirrors Drawer.tsx: same 768px breakpoint, same
  // fullscreen-overlay treatment below it.
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // 📖 Harness selection for NEW conversations: first installed harness by
  // default, refined to the pre-contextualized task's assignee when it resolves
  // to an installed harness (e.g. a card assigned to "claude" preselects Claude).
  const [selectedHarness, setSelectedHarness] = useState<string | null>(null);
  const installedHarnesses = useMemo(() => harnesses.filter(harness => harness.installed), [harnesses]);
  const taskAssignee = useMemo(() => {
    if (!preContextTaskId) return null;
    for (const column of columns) {
      const task = column.tasks.find(item => item.id === preContextTaskId);
      if (task) return task.assignee;
    }
    return null;
  }, [columns, preContextTaskId]);
  useEffect(() => {
    if (selectedHarness && installedHarnesses.some(harness => harness.id === selectedHarness)) return;
    const assigneeMatch = taskAssignee ? matchAgent(taskAssignee): null;
    const preferred = assigneeMatch
      ? installedHarnesses.find(harness => harness.id === assigneeMatch.id)
     : undefined;
    setSelectedHarness((preferred ?? installedHarnesses[0])?.id ?? null);
  }, [installedHarnesses, taskAssignee, selectedHarness]);

  const activeLive = activeSessionId ? live[activeSessionId]: undefined;
  const fold = activeLive?.fold;
  const turnActive = fold?.turnActive ?? false;

  // 📖 Working indicator window: the send POST is in flight (between the user's
  // send and the first event), or the turn already started but has produced no
  // renderable output yet (no text, no thinking, no tools: the fold lazily
  // creates the assistant entry, so its emptiness is the "nothing yet" signal).
  const lastEntry = fold?.messages.length ? fold.messages[fold.messages.length - 1] : undefined;
  const turnJustStarted = turnActive
    && lastEntry !== undefined
    && lastEntry.kind === 'assistant'
    && lastEntry.streaming
    && lastEntry.text.length === 0
    && lastEntry.thinking.length === 0
    && lastEntry.tools.length === 0;
  const waiting = sending || turnJustStarted;

  // 📖 Stick-to-bottom: follow the stream unless the user scrolled up, in which
  // case show the jump-to-bottom pill instead of yanking the scroll position.
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 80;
    stickToBottomRef.current = atBottom;
    setShowJump(!atBottom);
  }, []);
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    stickToBottomRef.current = true;
    setShowJump(false);
  }, []);
  const messageCount = fold?.messages.length ?? 0;
  const lastMessage = fold?.messages[messageCount - 1];
  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom('auto');
  }, [messageCount, lastMessage, scrollToBottom]);

  // 📖 Round 3: @task mentions ride along as structured ids so the daemon can
  // inline the integral task files; the visible text is sent untouched.
  const handleSend = useCallback((text: string, mentionedTaskIds: string[]) => {
    if (activeSessionId) {
      void sendMessage(text, mentionedTaskIds);
      return;
    }
    // 📖 Lazy start: no session yet, so the first message opens one with the
    // pre-contextualized task baked into the daemon-compiled prompt.
    if (!selectedHarness) return;
    void startSession({
      harnessId: selectedHarness,
      ...(preContextTaskId ? { taskId: preContextTaskId }: {}),
      ...(mentionedTaskIds.length > 0 ? { mentionedTaskIds } : {}),
      message: text,
    });
  }, [activeSessionId, sendMessage, selectedHarness, preContextTaskId, startSession]);

  // 📖 t310: a skill button always starts a NEW session whose daemon-compiled
  // prompt folds the skill instructions in; the same harness selector the
  // plain prompt uses picks the runner. Round 3: a task-scoped skill with no
  // preselected task no longer dead-ends: the PromptBar opens its pick-a-task
  // menu and the launch happens once a task is chosen.
  const handleLaunchSkill = useCallback((skill: ChatSkillButton) => {
    if (!selectedHarness) return;
    if (skill.scope === 'task' && !preContextTaskId) {
      if (boardTaskCount === 0) return;
      setPendingSkill({ skill });
      return;
    }
    void startSession({
      harnessId: selectedHarness,
      ...(preContextTaskId ? { taskId: preContextTaskId }: {}),
      skillId: skill.skillId,
      label: skill.label,
      interactive: skill.interactive,
    });
  }, [selectedHarness, preContextTaskId, boardTaskCount, startSession]);

  /** 📖 The pick-a-task menu resolved: launch the parked skill on the chosen
   * task and clear the pending state in the same breath. */
  const handlePickTask = useCallback((taskId: string) => {
    const parked = pendingSkill;
    setPendingSkill(null);
    if (!parked || !selectedHarness) return;
    void startSession({
      harnessId: selectedHarness,
      taskId,
      skillId: parked.skill.skillId,
      label: parked.skill.label,
      interactive: parked.skill.interactive,
    });
  }, [pendingSkill, selectedHarness, startSession]);

  /** 📖 Esc in the pick-a-task menu: forget the parked skill, nothing launched. */
  const handleDismissPickTask = useCallback(() => {
    setPendingSkill(null);
  }, []);

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <>
          {/* 📖 Mobile scrim: tap to dismiss, like the Drawer. */}
          {!isDesktop && (
            <motion.div
              {...MOTION.fade}
              onClick={closeSidebar}
              className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-[4px]"
            />
          )}
          <motion.aside
            {...MOTION.fade}
            role="complementary"
            aria-label={t('agentChat.title', 'Agent')}
            className={`fixed z-[101] flex flex-col border-border bg-bg shadow-[0_0_48px_rgba(0,0,0,0.25)] ${
              isDesktop
                ? 'bottom-0 right-0 top-[64px] w-[400px] border-l'
               : 'inset-0'
            }`}
          >
            {/* Header: switcher + usage, then harness selector + permission chip */}
            <div className="flex flex-none flex-col gap-2 border-b border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <SessionSwitcher
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  onResume={entry => void resumeSession(entry)}
                  onForget={id => void forgetSession(id)}
                  onNew={newConversation}
                />
                {activeSessionId && fold && <UsageBadge totals={fold.totals} />}
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
              <div className="flex items-center gap-2">
                {/* 📖 Harness picker applies to the NEXT new conversation; a
                 * live session is already bound to its harness. */}
                <select
                  value={selectedHarness ?? ''}
                  onChange={e => setSelectedHarness(e.target.value)}
                  disabled={installedHarnesses.length === 0}
                  title={t('agentChat.harnessLabel', 'Harness for new chats')}
                  className="h-6 min-w-0 max-w-[160px] flex-none rounded-md border border-border bg-bg-1 px-1.5 text-[11.5px] text-fg-muted outline-none transition-colors hover:text-fg focus:border-border-focus disabled:opacity-50"
                >
                  {installedHarnesses.length === 0 && (
                    <option value="">{t('agentChat.noHarness', 'No harness installed')}</option>
                  )}
                  {installedHarnesses.map(harness => (
                    <option key={harness.id} value={harness.id}>{harness.name}</option>
                  ))}
                </select>
                <span
                  className="inline-flex items-center rounded-full border border-border bg-bg-2 px-2 py-0.5 text-[10.5px] text-fg-muted"
                  title={t('settings.permissionMode', 'Permission mode')}
                >
                  {permissionMode === 'accept-edits'
                    ? t('settings.acceptEdits', 'Accept edits')
                   : t('settings.yolo', 'Yolo')}
                </span>
              </div>
              {/* 📖 t311: autopilot row: play/stop toggle (kill-switch styling
               * while running) + compact run totals. Third compact header row
               * so it never squeezes the switcher; it disables itself when
               * the daemon guard reports no daemon. */}
              <AutopilotControls />
            </div>

            {guard === 'no-daemon' ? (
              <DaemonGuardCard />
            ): guard === 'stale-auth' ? (
              /* 📖 Round 3: the daemon restarted and minted a fresh token, so
               * this page's copy went stale. A reload re-handshakes; the old
               * "start the daemon" card would simply be wrong here. */
              <div className="mx-3 mt-2 flex-none rounded-[8px] border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
                <p className="text-[12.5px] font-medium text-fg">
                  {t('agentChat.staleAuthTitle', 'The daemon restarted')}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">
                  {t('agentChat.staleAuthBody', 'Reload this page to reconnect.')}
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-2 px-2.5 py-1.5 text-[12px] text-fg transition-colors hover:border-border-strong"
                >
                  {t('agentChat.reload', 'Reload')}
                </button>
              </div>
            ): (
              <>
                {gitWarning && !gitBannerDismissed && (
                  <GitInitBanner className="mx-3 mt-2 flex-none" onDismiss={() => setGitBannerDismissed(true)} />
                )}
                {/* Messages */}
                <div
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className="relative flex flex-1 flex-col overflow-y-auto"
                >
                  <MessageList
                    messages={fold?.messages ?? []}
                    // 📖 The "edited ..." line summarizes the LIVE turn only:
                    // the fold keeps the paths across turns, the UI shows the
                    // recent tail while the agent is actually working.
                    changedFiles={turnActive ? (fold?.changedFiles ?? []): []}
                    preContextTaskId={preContextTaskId}
                    waiting={waiting}
                  />
                </div>
                {/* Jump to bottom pill */}
                <AnimatePresence>
                  {showJump && (
                    <motion.button
                      {...MOTION.fade}
                      type="button"
                      onClick={() => scrollToBottom()}
                      className="absolute bottom-[76px] left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-bg-2 text-fg shadow-md transition-colors hover:text-fg hover:brightness-95"
                      aria-label={t('agentChat.jumpToBottom', 'Jump to latest')}
                      title={t('agentChat.jumpToBottom', 'Jump to latest')}
                    >
                      <IconArrowDown size={14} stroke={1.8} />
                    </motion.button>
                  )}
                </AnimatePresence>
                {/* 📖 t310: interactive skill answer form first, then the
                 * skill pill row, then the composer. Each renders null when
                 * there is nothing to show, so the prompt area stays quiet. */}
                {answersRequested && skillQuestions.length > 0 && (
                  <AnswerForm
                    questions={skillQuestions}
                    sending={sending}
                    onSend={answers => void sendAnswers(answers)}
                    onSkip={dismissAnswers}
                  />
                )}
                <SkillButtons
                  skills={chatSkills}
                  disabled={starting || installedHarnesses.length === 0}
                  // 📖 Feature 3: the prop reads "a task-scoped launch can go
                  // ahead". That is true with a preselected task, and round 3
                  // also opens the pick-a-task menu when the board has tasks
                  // to offer; only a genuinely empty board disables the
                  // buttons now.
                  hasTaskContext={preContextTaskId !== null || boardTaskCount > 0}
                  activeSkillLabel={activeSkill?.label ?? null}
                  onLaunch={handleLaunchSkill}
                />
                <PromptBar
                  // 📖 The harness picker only gates NEW sessions: follow-ups on
                  // an active conversation are always sendable when the daemon
                  // is there (this branch already excludes 'no-daemon').
                  disabled={activeSessionId === null && installedHarnesses.length === 0}
                  turnActive={turnActive}
                  sending={sending}
                  onSend={handleSend}
                  onStop={() => { if (activeSessionId) void stopSession(activeSessionId); }}
                  onLaunchSkill={handleLaunchSkill}
                  pickTaskMode={pendingSkill !== null}
                  pickTaskLabel={pendingSkill?.skill.label ?? null}
                  onPickTask={handlePickTask}
                  onDismissPickTask={handleDismissPickTask}
                />
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
