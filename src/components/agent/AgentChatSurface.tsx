/**
 * @file Agent chat surface (t337)
 * @description The conversation body itself, extracted from the old overlay
 * ChatSidebar so two shells can render the exact same chat: the full-page
 * agent view on desktop (AgentPage) and the fullscreen mobile overlay
 * (ChatSidebar). Owns the daemon guard states, the git advisory banner, the
 * stick-to-bottom scroll behavior with its jump-to-bottom pill, the t310
 * skill surface (pill buttons, interactive answer form, pick-a-task flow)
 * and the BeautifulUI PromptBar with the harness/model/permission cluster.
 *
 * 📖 Harness selection for NEW conversations, the per-harness persisted model
 * pick (localStorage, empty key = harness default) and the daemon model
 * catalog fetch all live here: they are composer concerns, not shell
 * concerns. `active` gates the catalog fetch, since this component is always
 * mounted while its shell may be hidden.
 *
 * @functions
 *  → loadStoredModel / persistModel: per-harness model pick persistence
 *  → AgentChatSurface: the chat body (guard, messages, composer)
 *
 * @exports AgentChatSurface
 * @see src/components/agent/AgentPage.tsx: desktop full-page shell
 * @see src/components/agent/ChatSidebar.tsx: mobile overlay shell
 * @see src/lib/store/agentChatSlice.ts: state + SSE lifecycle
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { IconArrowDown } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import { MOTION } from '../../lib/motion-presets';
import { matchAgent } from '../../lib/agent-aliases';
import { fetchAgentModels } from '../../lib/filesystem';
import { MessageList } from './MessageList';
import { PromptBar } from './PromptBar';
import { ModelPickerMenu } from './ModelPickerMenu';
import type { ModelEntry } from './ModelPickerMenu';
import { SkillButtons } from './SkillButtons';
import { AnswerForm } from './AnswerForm';
import { DaemonGuardCard } from './DaemonGuardCard';
import { GitInitBanner } from './GitInitBanner';
import type { ChatSkillButton } from '../../lib/store/types';

/** 📖 Fallback catalog while the daemon has not answered (and in demo mode,
 * where there is no daemon). The real menu comes from GET /api/agent/models:
 * baseline plus live ACP discovery (t324), so an installed harness shows the
 * model ids it can actually run. These strings only ever fill the gap, they
 * never restrict: the picker always ends with a free-text custom row. */
const MODEL_SUGGESTIONS: Record<string, string[]> = {
  claude: ['opus', 'sonnet', 'haiku'],
  codex: ['gpt-5.6', 'gpt-5.5'],
  gemini: ['gemini-3.8-flash'],
};

/** 📖 localStorage key prefix for the per-harness model pick (round 4). */
const MODEL_STORAGE_PREFIX = 'kandown.model.';

/** 📖 Reads one harness's persisted model pick, or the empty string. Storage
 * failures (private mode, quota) degrade to "no pick", never an error. */
function loadStoredModel(harnessId: string): string {
  try {
    return window.localStorage.getItem(`${MODEL_STORAGE_PREFIX}${harnessId}`) ?? '';
  } catch {
    return '';
  }
}

/** 📖 Persists one harness's model pick ("" removes it: harness default).
 * Storage failures degrade to "the pick does not survive the page". */
function persistModel(harnessId: string, model: string): void {
  try {
    if (model) window.localStorage.setItem(`${MODEL_STORAGE_PREFIX}${harnessId}`, model);
    else window.localStorage.removeItem(`${MODEL_STORAGE_PREFIX}${harnessId}`);
  } catch {
    // 📖 Storage unavailable: the pick just does not survive the page.
  }
}

/** 📖 Harness id → the vendor credited for its no-slash catalog ids (claude's
 * "opus" is an Anthropic model, codex's bare ids are OpenAI's). Drives the
 * model picker's provider grouping and glyph. */
const HARNESS_VENDOR: Record<string, string> = {
  claude: 'anthropic',
  codex: 'openai',
  gemini: 'google',
};

interface AgentChatSurfaceProps {
  /** 📖 Whether the hosting shell is currently visible. Gates the model
   * catalog fetch and resets an unfinished pick-a-task flow when the shell
   * goes away, so reopening always shows a fresh composer. */
  active: boolean;
}

export function AgentChatSurface({ active }: AgentChatSurfaceProps) {
  const { t } = useTranslation();
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
  const startSession = useStore(s => s.startSession);
  const sendMessage = useStore(s => s.sendMessage);
  const sendAnswers = useStore(s => s.sendAnswers);
  const dismissAnswers = useStore(s => s.dismissAnswers);
  const stopSession = useStore(s => s.stopSession);
  const starting = useStore(s => s.agentChat.starting);
  const sending = useStore(s => s.agentChat.sending);
  // 📖 Local dismissal only: the banner comes back for the next session that
  // reports the advisory, which is the right lifetime for a safety reminder.
  const [gitBannerDismissed, setGitBannerDismissed] = useState(false);
  // 📖 Feature 3: a task-scoped skill launched without a task context parks
  // here and the PromptBar renders its pick-a-task menu until one is chosen
  // (or Esc dismisses). Null means no pending pick. An inactive shell clears
  // it so reopening never shows a stale menu from the previous visit.
  const [pendingSkill, setPendingSkill] = useState<{ skill: ChatSkillButton } | null>(null);
  useEffect(() => {
    if (!active) setPendingSkill(null);
  }, [active]);

  // 📖 Tasks available to pick from: the disabled state of task-scoped skill
  // buttons only makes sense when the board has nothing to offer at all.
  const boardTaskCount = useStore(s => s.columns.reduce((total, column) => total + column.tasks.length, 0));

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

  // 📖 Round 4: model for the NEXT new conversation, persisted per harness in
  // localStorage (the BUI model menu now owns the pick; "" = harness default).
  // The state is only the forwarding copy the session-start calls read.
  const [selectedModel, setSelectedModel] = useState('');
  // 📖 A harness switch invalidates the previous pick: prefill from that
  // harness's own persisted slot.
  useEffect(() => {
    setSelectedModel(selectedHarness ? loadStoredModel(selectedHarness) : '');
  }, [selectedHarness]);
  const handleModelChange = useCallback((model: string) => {
    if (selectedHarness) persistModel(selectedHarness, model);
    setSelectedModel(model);
  }, [selectedHarness]);

  // 📖 Real model catalog (t324): fetched per harness from the daemon, which
  // merges its curated baseline with live ACP discovery (the exact model ids
  // the harness account can run, plus the value it currently uses). Demo mode
  // and daemon hiccups fall back to the static suggestions; a failure is
  // never surfaced, a thin menu beats a broken one. Gated on `active`: an
  // idle shell must not spend a daemon round-trip per keystroke of state.
  // t340 fix: the fetch goes through fetchAgentModels (authenticated); the
  // bare window.fetch this used to be never carried the daemon token and
  // 401'd on every request, so the picker never showed a real model.
  const [modelCatalog, setModelCatalog] = useState<ModelEntry[]>([]);
  useEffect(() => {
    // 📖 Clear the previous harness's list first: discovery can take seconds
    // (an ACP handshake), and showing the old harness's models under the new
    // harness's menu made picks point at the wrong backend.
    setModelCatalog([]);
    if (!active || !selectedHarness) return;
    let cancelled = false;
    void fetchAgentModels(selectedHarness).then(models => {
      if (!cancelled && models) setModelCatalog(models);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedHarness, active]);

  // 📖 t340: the FULL catalog goes to the bb-style ModelPickerMenu (search +
  // provider tabs), no client cap: the pi catalog alone spans hundreds of
  // openrouter models and the old 16-entry dropdown made them unreachable.
  // While the daemon has not answered, the static suggestions stand in.
  const modelEntries = useMemo<ModelEntry[]>(() => {
    if (modelCatalog.length > 0) return modelCatalog;
    return (selectedHarness ? MODEL_SUGGESTIONS[selectedHarness] ?? [] : [])
      .map(id => ({ id, name: id }));
  }, [modelCatalog, selectedHarness]);
  const fallbackProvider = selectedHarness ? HARNESS_VENDOR[selectedHarness] ?? selectedHarness : '';

  // 📖 Round 4: delivery control visibility. Only interactive harnesses (pi,
  // ACP agents) can accept a steer/queue choice for follow-ups; one-shot
  // harnesses always resume after the turn, so the control hides there. The
  // active session's harness comes from its session-index entry.
  const activeHarnessId = useMemo(
    () => (activeSessionId ? sessions.find(entry => entry.id === activeSessionId)?.harnessId ?? null : null),
    [activeSessionId, sessions],
  );
  const activeHarnessProtocol = useMemo(
    () => harnesses.find(harness => harness.id === activeHarnessId)?.protocol ?? null,
    [harnesses, activeHarnessId],
  );
  const deliveryEnabled = activeHarnessProtocol === 'pi-rpc' || activeHarnessProtocol === 'acp';

  const activeLive = activeSessionId ? live[activeSessionId]: undefined;
  const fold = activeLive?.fold;
  const turnActive = fold?.turnActive ?? false;

  // 📖 Working indicator window: the send POST is in flight (between the user's
  // send and the first event), or the turn already started but has produced no
  // renderable output yet (no text, no thinking, no tools: the fold lazily
  // creates the assistant entry, so its emptiness is the "nothing yet" signal).
  const messageCount = fold?.messages.length ?? 0;
  const lastEntry = fold?.messages.length ? fold.messages[fold.messages.length - 1] : undefined;
  const turnJustStarted = turnActive
    && lastEntry !== undefined
    && lastEntry.kind === 'assistant'
    && lastEntry.streaming
    && lastEntry.text.length === 0
    && lastEntry.thinking.length === 0
    && lastEntry.tools.length === 0;
  // 📖 Boot phase: a brand-new session whose fold holds only the user's own
  // message. The harness binary boot plus the model's first token can take
  // several seconds, the fold's assistant entry is created lazily on the
  // first delta, and without this the user stares at nothing after Enter
  // (vava's round 9 feedback). A resumed session replays assistant entries
  // instantly, so `every user` stays true only for a genuine boot.
  const sessionStatus = activeSessionId ? live[activeSessionId]?.status : undefined;
  const onlyUserMessages = (fold?.messages ?? []).every(entry => entry.kind === 'user');
  const booting = (starting
    || (activeSessionId !== null
      && (sessionStatus === 'starting' || sessionStatus === 'running')
      && onlyUserMessages
      && !turnActive));
  const waiting = booting || sending || turnJustStarted;

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
  const lastMessage = fold?.messages[fold.messages.length - 1];
  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom('auto');
  }, [messageCount, lastMessage, scrollToBottom]);

  // 📖 Round 3: @task mentions ride along as structured ids so the daemon can
  // inline the integral task files; the visible text is sent untouched.
  // Round 4: the composer's delivery choice rides along for follow-ups on an
  // active interactive session.
  const handleSend = useCallback((text: string, mentionedTaskIds: string[], delivery?: 'steer' | 'queue') => {
    if (activeSessionId) {
      void sendMessage(text, mentionedTaskIds, delivery);
      return;
    }
    // 📖 Lazy start: no session yet, so the first message opens one with the
    // pre-contextualized task baked into the daemon-compiled prompt.
    if (!selectedHarness) return;
    void startSession({
      harnessId: selectedHarness,
      ...(preContextTaskId ? { taskId: preContextTaskId } : {}),
      ...(mentionedTaskIds.length > 0 ? { mentionedTaskIds } : {}),
      ...(selectedModel.trim() ? { model: selectedModel.trim() } : {}),
      message: text,
    });
  }, [activeSessionId, sendMessage, selectedHarness, selectedModel, preContextTaskId, startSession]);

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
      ...(preContextTaskId ? { taskId: preContextTaskId } : {}),
      ...(selectedModel.trim() ? { model: selectedModel.trim() } : {}),
      skillId: skill.skillId,
      label: skill.label,
      interactive: skill.interactive,
    });
  }, [selectedHarness, selectedModel, preContextTaskId, boardTaskCount, startSession]);

  /** 📖 The pick-a-task menu resolved: launch the parked skill on the chosen
   * task and clear the pending state in the same breath. */
  const handlePickTask = useCallback((taskId: string) => {
    const parked = pendingSkill;
    setPendingSkill(null);
    if (!parked || !selectedHarness) return;
    void startSession({
      harnessId: selectedHarness,
      taskId,
      ...(selectedModel.trim() ? { model: selectedModel.trim() } : {}),
      skillId: parked.skill.skillId,
      label: parked.skill.label,
      interactive: parked.skill.interactive,
    });
  }, [pendingSkill, selectedHarness, selectedModel, startSession]);

  /** 📖 Esc in the pick-a-task menu: forget the parked skill, nothing launched. */
  const handleDismissPickTask = useCallback(() => {
    setPendingSkill(null);
  }, []);

  // 📖 Welcome mode (vava, t337 round 2): a conversation with no messages yet
  // renders like a fresh harness page: a big centered greeting with the
  // composer right under it, larger and roomier (the PromptBar's `tall`
  // shape). The first send creates a message and the layout falls back to
  // the classic bottom-anchored chat below. Computed before the guard
  // branches, but only rendered after them: a missing daemon must still win.
  const conversationEmpty = (fold?.messages.length ?? 0) === 0;

  const promptBar = (
    <PromptBar
      // 📖 The harness picker only gates NEW sessions: follow-ups on an
      // active conversation are always sendable when the daemon is there
      // (the guard branch above already excludes 'no-daemon').
      disabled={activeSessionId === null && installedHarnesses.length === 0}
      turnActive={turnActive}
      sending={sending}
      // 📖 Round 4: steer/queue only makes sense for interactive harnesses;
      // one-shot sessions hide the control entirely.
      deliveryEnabled={deliveryEnabled}
      // 📖 Welcome mode asks for the tall composer: more padding, wider
      // gaps, bigger text.
      tall={conversationEmpty}
      onSend={handleSend}
      onStop={() => { if (activeSessionId) void stopSession(activeSessionId); }}
      onLaunchSkill={handleLaunchSkill}
      pickTaskMode={pendingSkill !== null}
      pickTaskLabel={pendingSkill?.skill.label ?? null}
      onPickTask={handlePickTask}
      onDismissPickTask={handleDismissPickTask}
      // 📖 Round 7: the conversation controls ride inside the composer
      // (official BeautifulUI 08 toolbar slot). The harness picker applies
      // to the NEXT new conversation; a live session is already bound to
      // its harness. The model pick moved into the BUI model menu.
      toolbar={
        <>
          <select
            value={selectedHarness ?? ''}
            onChange={e => setSelectedHarness(e.target.value)}
            disabled={installedHarnesses.length === 0}
            title={t('agentChat.harnessLabel', 'Harness for new chats')}
            className="h-6 min-w-0 max-w-[130px] flex-none rounded-md border border-border bg-bg px-1.5 text-[11px] text-fg-muted outline-none transition-colors hover:text-fg focus:border-border-focus disabled:opacity-50"
          >
            {installedHarnesses.length === 0 && (
              <option value="">{t('agentChat.noHarness', 'No harness installed')}</option>
            )}
            {installedHarnesses.map(harness => (
              <option key={harness.id} value={harness.id}>{harness.name}</option>
            ))}
          </select>
          {/* 📖 t340: bb-style model picker (search + provider glyph tabs +
           * full catalog) replacing the 16-entry BUI dropdown. */}
          <ModelPickerMenu
            models={modelEntries}
            value={selectedModel}
            onChange={handleModelChange}
            fallbackProvider={fallbackProvider}
          />
          <span
            className="ml-auto inline-flex flex-none items-center rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] text-fg-muted"
            title={t('settings.permissionMode', 'Permission mode')}
          >
            {permissionMode === 'accept-edits'
              ? t('settings.acceptEdits', 'Accept edits')
             : t('settings.yolo', 'Yolo')}
          </span>
        </>
      }
    />
  );

  if (guard === 'no-daemon') {
    return <DaemonGuardCard />;
  }
  if (guard === 'stale-auth') {
    // 📖 Round 3: the daemon restarted and minted a fresh token, so this
    // page's copy went stale. A reload re-handshakes; the old "start the
    // daemon" card would simply be wrong here.
    return (
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
    );
  }

  if (conversationEmpty) {
    return (
      <>
        {gitWarning && !gitBannerDismissed && (
          <GitInitBanner className="mx-3 mt-2 flex-none" onDismiss={() => setGitBannerDismissed(true)} />
        )}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 px-6 pb-12">
          <h1 className="text-center text-[28px] leading-tight font-semibold tracking-tight text-fg">
            {t('agentChat.welcomeTitle', 'What can I do for you today?')}
          </h1>
          <div className="w-full max-w-[680px]">
            {promptBar}
          </div>
          <SkillButtons
            skills={chatSkills}
            disabled={starting || installedHarnesses.length === 0}
            hasTaskContext={preContextTaskId !== null || boardTaskCount > 0}
            activeSkillLabel={activeSkill?.label ?? null}
            onLaunch={handleLaunchSkill}
          />
        </div>
      </>
    );
  }

  return (
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
          // 📖 The "edited ..." line summarizes the LIVE turn only: the fold
          // keeps the paths across turns, the UI shows the recent tail while
          // the agent is actually working.
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
      {/* 📖 t310: interactive skill answer form first, then the skill pill
       * row, then the composer. Each renders null when there is nothing to
       * show, so the prompt area stays quiet. */}
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
        // 📖 Feature 3: the prop reads "a task-scoped launch can go ahead".
        // That is true with a preselected task, and round 3 also opens the
        // pick-a-task menu when the board has tasks to offer; only a
        // genuinely empty board disables the buttons now.
        hasTaskContext={preContextTaskId !== null || boardTaskCount > 0}
        activeSkillLabel={activeSkill?.label ?? null}
        onLaunch={handleLaunchSkill}
      />
      {promptBar}
    </>
  );
}
