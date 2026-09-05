/**
 * @file Zustand store slice: agent chat sidebar (t308)
 * @description Sidebar open state, the project's chat session index, the live
 * per-session chat folds, and the SSE lifecycle that feeds them. Kandown never
 * stores conversations: harnesses persist their own transcripts, this slice
 * only folds the streamed events into renderable chat state and keeps the thin
 * index the SessionSwitcher lists.
 *
 * 📖 SSE transport: GET /api/agent/sessions/:id/events streams the same JSON
 * events the board watcher receives on /api/events, so the connection follows
 * the exact pattern of src/lib/watcher.ts: an EventSource with the daemon token
 * passed as `?token=` (EventSource cannot send headers). The stream REPLAYS
 * buffered history on connect, so reconnecting after a sidebar reopen is safe.
 *
 * 📖 Stop: POST /api/agent/sessions/:id/stop has no helper in filesystem.ts
 * (frozen for this task), so the slice performs the POST itself with the same
 * auth the shared rawApiFetch uses: the `X-Kandown-Token` header from
 * window.__KANDOWN_TOKEN__. Never throws; failures surface as toasts.
 *
 * @functions
 *  → createAgentChatSlice: sidebar state, session index, SSE lifecycle, sends,
 *    the t310 interactive skill flow (chat skills list, activeSkill chip,
 *    answersRequested form trigger, sendAnswers / dismissAnswers) and the
 *    [show: tXXX] directive flow (presence marker + canonical openDrawer call
 *    once a turn carrying the directive completes)
 *
 * @exports AgentChatSlice, createAgentChatSlice, createInitialAgentChatState
 * @see src/lib/agent-chat-events.ts: the pure event fold this slice feeds
 * @see src/lib/agent-chat-skills.ts: question parse + answer formatting
 * @see src/lib/store/types.ts: AgentChatState shape
 */

import type { StateCreator } from 'zustand';
import {
  createAgentSession,
  sendAgentSessionMessage,
  listSessionIndex,
  forgetSessionIndex,
  fetchAgentHarnesses,
  serverListWorkflowSkills,
} from '../filesystem';
import type { SessionIndexEntryPayload, AgentSessionPayload } from '../types';
import {
  applyChatEvent,
  appendUserMessage,
  createChatFoldState,
  removeChatEntry,
  isAgentChatEvent,
  type AgentChatEvent,
  type ChatFoldState,
} from '../agent-chat-events';
import { formatAnswers, parseNumberedQuestions } from '../agent-chat-skills';
import { findShowDirective } from '../task-links';
import type { State, AgentChatStartInput, AgentChatState, ChatSkillButton } from './types';

/** 📖 Live EventSource per session id. Module state, not store state: the UI
 * never renders it, and EventSource instances must survive store snapshots. */
const agentEventSources = new Map<string, EventSource>();

function daemonToken(): string | null {
  return typeof window !== 'undefined' && typeof window.__KANDOWN_TOKEN__ === 'string'
    ? window.__KANDOWN_TOKEN__
   : null;
}

/**
 * 📖 POST helper for the two routes filesystem.ts does not cover (stop, and
 * nothing else after resume was folded into createAgentSession locally).
 * Mirrors rawApiFetch's transport: JSON body + token header, never throws.
 */
async function agentApiPost(path: string, body: unknown): Promise<Response | null> {
  const token = daemonToken();
  try {
    return await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Kandown-Token': token }: {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

export interface AgentChatSlice {
  openSidebar: State['openSidebar'];
  closeSidebar: State['closeSidebar'];
  refreshSessions: State['refreshSessions'];
  startSession: State['startSession'];
  resumeSession: State['resumeSession'];
  /** Switches the sidebar to an empty draft: the next send starts a new session. */
  newConversation: State['newConversation'];
  sendMessage: State['sendMessage'];
  /** Interactive skill answers (t310): format + forward as a follow-up. */
  sendAnswers: State['sendAnswers'];
  /** Hides the interactive answer form without sending (t310). */
  dismissAnswers: State['dismissAnswers'];
  stopSession: State['stopSession'];
  forgetSession: State['forgetSession'];
  ingestAgentEvent: State['ingestAgentEvent'];
}

/** 📖 Initial `agentChat` state, seeded into the store by store.ts next to the
 * spread slice (the slice itself only carries the actions). */
export function createInitialAgentChatState(): AgentChatState {
  return {
    sidebarOpen: false,
    sessions: [],
    activeSessionId: null,
    live: {},
    guard: 'unknown',
    permissionModeSnapshot: null,
    preContextTaskId: null,
    gitWarning: null,
    harnesses: [],
    chatSkills: [],
    activeSkill: null,
    showTask: null,
    answersRequested: false,
    skillQuestions: [],
    answersSent: false,
    starting: false,
    sending: false,
  };
}

/** 📖 Text of the last assistant entry in a fold, or the empty string. The
 * interactive skill questions live in the newest assistant turn. */
function lastAssistantText(fold: ChatFoldState): string {
  for (let i = fold.messages.length - 1; i >= 0; i -= 1) {
    const entry = fold.messages[i];
    // 📖 `kind` is a discriminated union field, so this narrows without a cast.
    if (entry.kind === 'assistant') return entry.text;
  }
  return '';
}

export const createAgentChatSlice: StateCreator<State, [], [], AgentChatSlice> = (set, get) => {
  /** 📖 Connects the per-session SSE stream. No-op when already connected;
   * the daemon replays buffered history on connect so this is idempotent. */
  const connectAgentEventStream = (sessionId: string): void => {
    if (typeof window === 'undefined' || agentEventSources.has(sessionId)) return;
    const token = daemonToken();
    const url = token
      ? `/api/agent/sessions/${encodeURIComponent(sessionId)}/events?token=${encodeURIComponent(token)}`
     : `/api/agent/sessions/${encodeURIComponent(sessionId)}/events`;
    try {
      const source = new EventSource(url);
      source.onmessage = (event: MessageEvent<string>) => {
        try {
          const parsed: unknown = JSON.parse(event.data);
          if (isAgentChatEvent(parsed)) {
            get().ingestAgentEvent(sessionId, parsed);
          }
        } catch {
          // Heartbeats and keep-alives are not JSON: ignore.
        }
      };
      // 📖 The server sends `retry: 2000`: on transient drops the browser
      // reconnects itself and the replay makes the fold catch up. Nothing to do
      // in onerror.
      agentEventSources.set(sessionId, source);
    } catch (e) {
      console.warn('[AgentChat] EventSource init failed:', e);
    }
  };

  const closeAgentEventStream = (sessionId: string): void => {
    const source = agentEventSources.get(sessionId);
    if (!source) return;
    source.close();
    agentEventSources.delete(sessionId);
  };

  /** 📖 Shared success path for startSession / resumeSession: installs the live
   * fold, points the sidebar at the session, seeds the index optimistically and
   * opens the stream. The daemon upserts the real index entry right after. */
  const activateSession = (session: AgentSessionPayload, options: { taskId?: string; firstMessage?: string; title: string }): void => {
    // 📖 Only the active session keeps its stream: switching sessions closes
    // the previous EventSource so background turns stop pushing into the page.
    const previousActive = get().agentChat.activeSessionId;
    if (previousActive && previousActive !== session.id) closeAgentEventStream(previousActive);
    let fold = createChatFoldState();
    if (options.firstMessage) {
      fold = appendUserMessage(fold, options.firstMessage).state;
    }
    const now = new Date().toISOString();
    const entry: SessionIndexEntryPayload = {
      id: session.id,
      harnessId: session.harnessId,
      title: options.title,
      createdAt: now,
      updatedAt: now,
      ...(options.taskId ? { taskId: options.taskId }: {}),
    };
    set(state => ({
      agentChat: {
        ...state.agentChat,
        activeSessionId: session.id,
        permissionModeSnapshot: state.config.agent.permissionMode,
        live: { ...state.agentChat.live, [session.id]: { status: session.status, fold } },
        sessions: [entry, ...state.agentChat.sessions.filter(s => s.id !== session.id)],
      },
    }));
    connectAgentEventStream(session.id);
  };

  return {
    openSidebar: (preTaskId) => {
      set(state => ({
        agentChat: {
          ...state.agentChat,
          sidebarOpen: true,
          preContextTaskId: preTaskId ?? state.agentChat.preContextTaskId,
        },
      }));
      // 📖 Index + harness list refresh, plus stream reconnect for the active
      // session (closeSidebar closes the EventSource but keeps the fold).
      void get().refreshSessions();
    },

    closeSidebar: () => {
      const { activeSessionId } = get().agentChat;
      if (activeSessionId) closeAgentEventStream(activeSessionId);
      set(state => ({ agentChat: { ...state.agentChat, sidebarOpen: false } }));
    },

    refreshSessions: async () => {
      const index = await listSessionIndex();
      const sorted = index
        ? [...index].sort((a, b) => (a.updatedAt < b.updatedAt ? 1: a.updatedAt > b.updatedAt ? -1: 0))
       : [];
      set(state => ({
        agentChat: {
          ...state.agentChat,
          sessions: sorted,
          guard: index ? 'available': 'no-daemon',
        },
      }));
      if (sorted.length === 0 && get().agentChat.guard === 'no-daemon') return;

      // 📖 Harness list for the new-conversation selector: fetched once per
      // page life, lazily, only when the sidebar is actually used.
      if (get().agentChat.harnesses.length === 0) {
        const harnesses = await fetchAgentHarnesses();
        if (harnesses) {
          set(state => ({ agentChat: { ...state.agentChat, harnesses } }));
        }
      }

      // 📖 Chat-launchable skills (t310): same lazy once-per-page-life pattern.
      // The daemon only attaches `chat` to valid skills, so its presence gates
      // the projection; a backend without the field simply yields no buttons.
      if (get().agentChat.chatSkills.length === 0) {
        const skills = await serverListWorkflowSkills();
        const chatSkills: ChatSkillButton[] = [];
        for (const skill of skills) {
          const chat = skill.chat;
          if (!chat) continue;
          chatSkills.push({
            skillId: skill.id,
            label: chat.button.label,
            ...(chat.button.icon ? { icon: chat.button.icon } : {}),
            scope: chat.scope,
            interactive: chat.interactive,
          });
        }
        if (chatSkills.length > 0) {
          set(state => ({ agentChat: { ...state.agentChat, chatSkills } }));
        }
      }

      // 📖 Sidebar reopen: reconnect the live stream for the active session.
      const { sidebarOpen, activeSessionId } = get().agentChat;
      if (sidebarOpen && activeSessionId) {
        connectAgentEventStream(activeSessionId);
      }
    },

    startSession: async (input: AgentChatStartInput) => {
      if (get().agentChat.starting) return;
      set(state => ({ agentChat: { ...state.agentChat, starting: true } }));
      // 📖 The permission mode is a project-level setting; the daemon falls
      // back to it too, but we send it explicitly so the snapshot in the
      // sidebar header always matches what the session actually got.
      const permissionMode = get().config.agent.permissionMode;
      const result = await createAgentSession({
        harnessId: input.harnessId,
        ...(input.taskId ? { taskId: input.taskId }: {}),
        ...(input.message ? { message: input.message }: {}),
        ...(input.skillId ? { skillId: input.skillId }: {}),
        permissionMode,
      });
      if (!result) {
        set(state => ({ agentChat: { ...state.agentChat, starting: false } }));
        get().toast('Could not start the agent session. Is the kandown daemon running?', 'error');
        return;
      }
      const title = (input.message ?? '').split('\n')[0]?.trim().slice(0, 60)
        || input.label
        || input.taskId
        || result.session.id;
      activateSession(result.session, {
        taskId: input.taskId,
        firstMessage: input.message,
        title,
      });
      set(state => ({
        agentChat: {
          ...state.agentChat,
          starting: false,
          gitWarning: result.gitWarning ?? null,
          // 📖 t310: remember the launching skill so the UI can show the chip
          // and, for interactive skills, open the answer form when the first
          // turn (the questions) completes. A start without a skill resets the
          // whole skill flow.
          activeSkill: input.skillId
            ? { skillId: input.skillId, label: input.label ?? input.skillId, interactive: input.interactive ?? false }
            : null,
          answersRequested: false,
          skillQuestions: [],
          answersSent: false,
        },
      }));
    },

    resumeSession: async (entry) => {
      const resumeId = entry.harnessSessionId;
      if (!resumeId) {
        get().toast('This conversation has no harness session to resume yet', 'warning');
        return;
      }
      if (get().agentChat.starting) return;
      set(state => ({ agentChat: { ...state.agentChat, starting: true } }));
      const permissionMode = get().config.agent.permissionMode;
      const result = await createAgentSession({
        harnessId: entry.harnessId,
        ...(entry.taskId ? { taskId: entry.taskId }: {}),
        permissionMode,
        resumeSessionId: resumeId,
      });
      if (!result) {
        set(state => ({ agentChat: { ...state.agentChat, starting: false } }));
        get().toast('Could not resume the conversation. Is the kandown daemon running?', 'error');
        return;
      }
      activateSession(result.session, {
        taskId: entry.taskId,
        title: entry.title || result.session.id,
      });
      // 📖 Resume is a context switch: any lingering skill flow belongs to the
      // previous session and must not leak a chip or an answer form into it.
      set(state => ({
        agentChat: {
          ...state.agentChat,
          starting: false,
          activeSkill: null,
          showTask: null,
          answersRequested: false,
          skillQuestions: [],
          answersSent: false,
        },
      }));
    },

    newConversation: () => {
      const { activeSessionId } = get().agentChat;
      if (activeSessionId) closeAgentEventStream(activeSessionId);
      set(state => ({
        agentChat: {
          ...state.agentChat,
          activeSessionId: null,
          preContextTaskId: null,
          activeSkill: null,
          showTask: null,
          answersRequested: false,
          skillQuestions: [],
          answersSent: false,
        },
      }));
    },

    sendMessage: async (text) => {
      const trimmed = text.trim();
      const sessionId = get().agentChat.activeSessionId;
      if (!trimmed || !sessionId || get().agentChat.sending) return;
      const current = get().agentChat.live[sessionId] ?? { status: 'running', fold: createChatFoldState() };
      // 📖 Optimistic append: the bubble shows instantly, the SSE stream brings
      // the answer. On failure the exact entry is rolled back by id.
      const appended = appendUserMessage(current.fold, trimmed);
      set(state => ({
        agentChat: {
          ...state.agentChat,
          sending: true,
          live: { ...state.agentChat.live, [sessionId]: { ...current, fold: appended.state } },
        },
      }));
      const result = await sendAgentSessionMessage(sessionId, trimmed);
      if (result === null || !result.ok) {
        set(state => {
          const live = state.agentChat.live[sessionId];
          if (!live) return {};
          return {
            agentChat: {
              ...state.agentChat,
              sending: false,
              live: { ...state.agentChat.live, [sessionId]: { ...live, fold: removeChatEntry(live.fold, appended.messageId) } },
            },
          };
        });
        get().toast(result?.error || 'Message not delivered. Is the kandown daemon running?', 'error');
        return;
      }
      set(state => ({ agentChat: { ...state.agentChat, sending: false } }));
      // 📖 A follow-up on a finished session resumes it server-side under the
      // same id: make sure the stream is open to see the new turn.
      connectAgentEventStream(sessionId);
    },

    sendAnswers: async (answers) => {
      const agentChat = get().agentChat;
      const sessionId = agentChat.activeSessionId;
      if (!sessionId || agentChat.sending) return;
      // 📖 Questions source of truth: the newest assistant turn (it is the one
      // that asked), falling back to the questions captured at turn_completed
      // when the fold no longer parses (edits, truncation, follow-up noise).
      const live = agentChat.live[sessionId];
      const questions = live
        ? parseNumberedQuestions(lastAssistantText(live.fold))
        : [];
      const effective = questions.length > 0 ? questions : agentChat.skillQuestions;
      const text = formatAnswers(effective, answers);
      // 📖 The form goes away at once but the skill chip stays through the
      // fusion turn; answersSent locks the question phase so a later
      // turn_completed cannot reopen the form.
      set(state => ({
        agentChat: { ...state.agentChat, answersRequested: false, answersSent: true, skillQuestions: [] },
      }));
      await get().sendMessage(text);
    },

    dismissAnswers: () => {
      // 📖 Skipping ends the question phase for good (answersSent): the user
      // chose free-form chat, a later turn_completed must not bring it back.
      set(state => ({
        agentChat: { ...state.agentChat, answersRequested: false, answersSent: true, skillQuestions: [] },
      }));
    },

    stopSession: async (id) => {
      // 📖 Live status flips optimistically so the stop button disables at
      // once; the `stopped` SSE event finalizes the turn when it lands.
      set(state => {
        const live = state.agentChat.live[id];
        if (!live) return {};
        return {
          agentChat: {
            ...state.agentChat,
            live: { ...state.agentChat.live, [id]: { ...live, status: 'stopping' } },
          },
        };
      });
      const res = await agentApiPost(`/api/agent/sessions/${encodeURIComponent(id)}/stop`, {});
      if (!res || !res.ok) {
        set(state => {
          const live = state.agentChat.live[id];
          if (!live || live.status !== 'stopping') return {};
          return {
            agentChat: {
              ...state.agentChat,
              live: { ...state.agentChat.live, [id]: { ...live, status: 'running' } },
            },
          };
        });
        get().toast('Could not stop the session. Is the kandown daemon running?', 'error');
      }
    },

    forgetSession: async (id) => {
      const ok = await forgetSessionIndex(id);
      if (!ok) {
        get().toast('Could not forget the conversation', 'error');
        return;
      }
      closeAgentEventStream(id);
      set(state => {
        const live = { ...state.agentChat.live };
        delete live[id];
        return {
          agentChat: {
            ...state.agentChat,
            sessions: state.agentChat.sessions.filter(entry => entry.id !== id),
            live,
            // 📖 A forgotten session cannot be the active one anymore, so its
            // presence badge would never render; drop it to keep state honest.
            showTask: state.agentChat.showTask?.sessionId === id ? null : state.agentChat.showTask,
            activeSessionId: state.agentChat.activeSessionId === id ? null: state.agentChat.activeSessionId,
          },
        };
      });
    },

    ingestAgentEvent: (sessionId, event: AgentChatEvent) => {
      // 📖 Presence nonce before the fold: if the event bumps it, this very
      // event carried a fresh [show:] directive and the task must open below.
      const previousShowNonce = get().agentChat.showTask?.nonce ?? 0;
      set(state => {
        const current = state.agentChat.live[sessionId] ?? { status: 'running', fold: createChatFoldState() };
        const status = event.type === 'session_started'
          ? 'running'
         : event.type === 'stopped'
            ? 'stopped'
           : current.status;
        const fold = applyChatEvent(current.fold, event);
        // 📖 t310 interactive skills: the FIRST completed turn after a skill
        // start carries the numbered questions. Parse them out of the newest
        // assistant entry and open the answer form; anything after that (the
        // fusion turn, manual messages) is a normal conversation.
        let skillPatch: Partial<AgentChatState> = {};
        const skill = state.agentChat.activeSkill;
        if (
          event.type === 'turn_completed'
          && sessionId === state.agentChat.activeSessionId
          && skill?.interactive
          && !state.agentChat.answersSent
          && !state.agentChat.answersRequested
        ) {
          const questions = parseNumberedQuestions(lastAssistantText(fold));
          if (questions.length > 0) {
            skillPatch = { skillQuestions: questions, answersRequested: true };
          }
        }
        // 📖 [show: tXXX] directive: a completed turn can point the user at a
        // task. Presence is recorded here; the actual openDrawer fires right
        // after the set, so the updater stays side-effect free. The
        // fingerprint (message tail) makes SSE history replays of an already
        // handled turn a no-op, while any fresh directive differs.
        let showTaskPatch: Partial<AgentChatState> = {};
        if (
          event.type === 'turn_completed'
          && sessionId === state.agentChat.activeSessionId
          && current.fold.turnActive
        ) {
          const text = lastAssistantText(fold);
          const fingerprint = `${sessionId}|${text.slice(-160)}`;
          const previous = state.agentChat.showTask;
          if (!previous || previous.fingerprint !== fingerprint) {
            const directive = findShowDirective(text);
            if (directive) {
              showTaskPatch = {
                showTask: {
                  sessionId,
                  taskId: directive.taskId,
                  anchor: directive.anchor,
                  nonce: (previous?.nonce ?? 0) + 1,
                  fingerprint,
                },
              };
            }
          }
        }
        return {
          agentChat: {
            ...state.agentChat,
            ...skillPatch,
            ...showTaskPatch,
            live: {
              ...state.agentChat.live,
              [sessionId]: { status, fold },
            },
          },
        };
      });
      // 📖 Canonical open-task path, identical to clicking the task on the
      // board: the drawer slice loads the file and the workspace (desktop) or
      // the Drawer (mobile) shows it. replace keeps the history clean when a
      // task was already open.
      const presence = get().agentChat.showTask;
      if (presence && presence.nonce !== previousShowNonce) {
        void get().openDrawer(presence.taskId, { replace: true });
      }
    },
  };
};
