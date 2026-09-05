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
 *  → createAgentChatSlice: sidebar state, session index, SSE lifecycle, sends
 *
 * @exports AgentChatSlice, createAgentChatSlice
 * @see src/lib/agent-chat-events.ts: the pure event fold this slice feeds
 * @see src/lib/store/types.ts: AgentChatState shape
 */

import type { StateCreator } from 'zustand';
import {
  createAgentSession,
  sendAgentSessionMessage,
  listSessionIndex,
  forgetSessionIndex,
  fetchAgentHarnesses,
} from '../filesystem';
import type { SessionIndexEntryPayload, AgentSessionPayload } from '../types';
import {
  applyChatEvent,
  appendUserMessage,
  createChatFoldState,
  removeChatEntry,
  isAgentChatEvent,
  type AgentChatEvent,
} from '../agent-chat-events';
import type { State, AgentChatStartInput, AgentChatState } from './types';

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
    harnesses: [],
    starting: false,
    sending: false,
  };
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
        permissionMode,
      });
      if (!result) {
        set(state => ({ agentChat: { ...state.agentChat, starting: false } }));
        get().toast('Could not start the agent session. Is the kandown daemon running?', 'error');
        return;
      }
      const title = (input.message ?? '').split('\n')[0]?.trim().slice(0, 60)
        || input.taskId
        || result.session.id;
      activateSession(result.session, {
        taskId: input.taskId,
        firstMessage: input.message,
        title,
      });
      set(state => ({ agentChat: { ...state.agentChat, starting: false } }));
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
      set(state => ({ agentChat: { ...state.agentChat, starting: false } }));
    },

    newConversation: () => {
      const { activeSessionId } = get().agentChat;
      if (activeSessionId) closeAgentEventStream(activeSessionId);
      set(state => ({
        agentChat: {
          ...state.agentChat,
          activeSessionId: null,
          preContextTaskId: null,
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
            activeSessionId: state.agentChat.activeSessionId === id ? null: state.agentChat.activeSessionId,
          },
        };
      });
    },

    ingestAgentEvent: (sessionId, event: AgentChatEvent) => {
      set(state => {
        const current = state.agentChat.live[sessionId] ?? { status: 'running', fold: createChatFoldState() };
        const status = event.type === 'session_started'
          ? 'running'
         : event.type === 'stopped'
            ? 'stopped'
           : current.status;
        return {
          agentChat: {
            ...state.agentChat,
            live: {
              ...state.agentChat.live,
              [sessionId]: { status, fold: applyChatEvent(current.fold, event) },
            },
          },
        };
      });
    },
  };
};
