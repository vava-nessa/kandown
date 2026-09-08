/**
 * @file Agent right panel space (t337)
 * @description The retractable panel column next to the chat on the agent
 * page, in the spirit of the code-harness side panels: a tab strip at the
 * top, one conversation's content below. The panel is a generic space meant
 * to grow new usages, so everything is driven by a small registry: a new
 * panel joins by adding a member to AgentPanelTab (store/types.ts) and one
 * entry in AGENT_PANEL_REGISTRY. Which tabs are open, and which is showing,
 * is stored per conversation (agentPanel slice), so switching conversations
 * restores that conversation's own layout.
 *
 * 📖 **User-resizable width (request #9).** A thin separator on the panel's
 * left edge can be dragged (pointer capture) or keyboard-driven (arrows,
 * Home/End) to change the panel width between 320 and 560px, always capped
 * at 50vw so the chat column never collapses on narrow windows. The picked
 * width persists in localStorage (`kandown:agent-panel-width`) and is read
 * once at mount; the value lives entirely here (component state + storage),
 * not in the store, because it is page geometry shared by every
 * conversation, not per-conversation panel layout.
 *
 * @functions
 *  → AgentPanelSpace: the tab strip + active tab content for the current
 *    conversation, sized by the resizable width; renders null when the
 *    panel is closed or tab-less
 *
 * @exports AgentPanelSpace
 * @see src/components/agent/AgentPanelTask.tsx
 * @see src/components/agent/AgentPanelChanges.tsx
 * @see src/lib/store/agentPanelSlice.ts: the per-conversation tab state
 */

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconFileDiff, IconNotes, IconX } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import type { AgentPanelTab } from '../../lib/store/types';
import { AGENT_PANEL_DRAFT_KEY } from '../../lib/store/agentPanelSlice';
import { AgentPanelTask } from './AgentPanelTask';
import { AgentPanelChanges } from './AgentPanelChanges';

/** 📖 Width the panel ships with, also the double-click reset target: the
 * previous fixed layout was exactly `min(400px, 38vw)`. */
const DEFAULT_AGENT_PANEL_WIDTH = 400;

const MIN_AGENT_PANEL_WIDTH = 320;
const MAX_AGENT_PANEL_WIDTH = 560;

/** 📖 Hard viewport cap: the panel may never take more than half the
 * window, whatever the stored or dragged width, so the chat column keeps
 * at least half the space. Enforced both in JS (at drag/keyboard time)
 * and in CSS (`clamp` in the inline width) for window resizes after the fact. */
const MAX_VIEWPORT_SHARE = 0.5;

/** 📖 localStorage key for the persisted width, following the
 * `kandown:<preference>` convention (`kandown:view`, `kandown:density`). */
const AGENT_PANEL_WIDTH_STORAGE_KEY = 'kandown:agent-panel-width';

const KEYBOARD_RESIZE_STEP = 16;
const KEYBOARD_RESIZE_LARGE_STEP = 48;

/** 📖 Clamp a raw width into the absolute [min, max] band. The live 50vw
 * cap is applied by callers that know the current window size. */
function clampToBand(width: number): number {
  return Math.min(MAX_AGENT_PANEL_WIDTH, Math.max(MIN_AGENT_PANEL_WIDTH, width));
}

/** 📖 Widest the panel may be right now: the absolute max, or half the
 * window when that window is too narrow to allow the full 560px. Never
 * below the min, so a very small window still gets MIN px of panel. */
function widestAllowedWidth(): number {
  if (typeof window === 'undefined') return MAX_AGENT_PANEL_WIDTH;
  return Math.max(MIN_AGENT_PANEL_WIDTH, Math.floor(window.innerWidth * MAX_VIEWPORT_SHARE));
}

/** 📖 Read the persisted width at mount, guarded like the other kandown
 * localStorage reads (githubStars.ts): storage may be unavailable or hold
 * garbage, and then we fall back to the default instead of crashing. */
function readStoredWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_AGENT_PANEL_WIDTH;
  try {
    const raw = window.localStorage.getItem(AGENT_PANEL_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_AGENT_PANEL_WIDTH;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampToBand(Math.round(parsed)) : DEFAULT_AGENT_PANEL_WIDTH;
  } catch {
    return DEFAULT_AGENT_PANEL_WIDTH;
  }
}

/** 📖 Persist the width. Best effort only: private-mode browsers throw on
 * write, and the in-tab width is still correct for the page's life. */
function writeStoredWidth(width: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AGENT_PANEL_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    /* localStorage may be unavailable (private mode); the in-tab width is
       still correct, we just lose the cross-session preference. */
  }
}

/** 📖 Where the active drag started: pointer x, the width at pointerdown,
 * and the 50vw cap frozen at drag start (a mid-drag window resize is not
 * worth replaying; the CSS clamp still guards the rendered width). */
interface DragOrigin {
  pointerX: number;
  startWidth: number;
  maxWidth: number;
}

/** 📖 One entry of the panel registry: label, icon and the content renderer
 * for a tab. The sessionId argument lets a tab scope itself to the active
 * conversation (the task tab reads the drawer store instead, which is the
 * single "task being viewed" signal). */
interface AgentPanelDefinition {
  labelKey: string;
  fallback: string;
  icon: React.ReactNode;
  render: (sessionId: string | null) => React.ReactNode;
}

// 📖 The extension point for future panel usages (vava, t337: "un panel
// espace qui peut servir à plusieurs usages"). Add a tab + an entry here.
const AGENT_PANEL_REGISTRY: Record<AgentPanelTab, AgentPanelDefinition> = {
  task: {
    labelKey: 'agentChat.panelTask',
    fallback: 'Task',
    icon: <IconNotes size={12} stroke={1.8} />,
    render: () => <AgentPanelTask />,
  },
  changes: {
    labelKey: 'agentChat.panelChanges',
    fallback: 'Changes',
    icon: <IconFileDiff size={12} stroke={1.8} />,
    render: sessionId => <AgentPanelChanges sessionId={sessionId} />,
  },
};

export function AgentPanelSpace() {
  const { t } = useTranslation();
  const activeSessionId = useStore(s => s.agentChat.activeSessionId);
  const panel = useStore(s => s.agentPanel);
  const closeAgentPanelTab = useStore(s => s.closeAgentPanelTab);
  const setActiveAgentPanelTab = useStore(s => s.setActiveAgentPanelTab);

  // 📖 Resize state. widthRef mirrors `width` so pointerup and keyboard
  // handlers always persist the latest value even if the closure is one
  // render behind a batched pointermove.
  const [width, setWidth] = useState<number>(readStoredWidth);
  const [isDragging, setIsDragging] = useState(false);
  const widthRef = useRef(width);
  const dragOriginRef = useRef<DragOrigin | null>(null);

  const key = activeSessionId ?? AGENT_PANEL_DRAFT_KEY;
  const session = panel.bySession[key];
  const openTabs = session?.openTabs ?? [];
  const activeTab = openTabs.includes(session?.activeTab ?? 'task')
    ? session!.activeTab
    : openTabs[0];

  /** 📖 Single funnel for every width change (drag, keyboard, reset):
   * clamps into the band plus the given viewport cap, updates the ref
   * first so persistence helpers read the fresh value. */
  const setPanelWidth = useCallback((next: number, maxWidth: number): void => {
    const clamped = Math.min(Math.max(next, MIN_AGENT_PANEL_WIDTH), Math.max(MIN_AGENT_PANEL_WIDTH, maxWidth));
    widthRef.current = clamped;
    setWidth(clamped);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (dragOriginRef.current !== null) return;
    // 📖 preventDefault stops the browser from starting a text selection
    // (it suppresses the compatibility mouse events) during the drag.
    e.preventDefault();
    dragOriginRef.current = {
      pointerX: e.clientX,
      startWidth: widthRef.current,
      maxWidth: widestAllowedWidth(),
    };
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* The pointer went away between down and capture; the move/up guards
         make every path a no-op, nothing to recover here. */
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const origin = dragOriginRef.current;
    if (!origin) return;
    // 📖 The handle sits on the panel's LEFT edge: dragging left (clientX
    // decreasing) widens the panel, hence the subtraction.
    setPanelWidth(origin.startWidth + (origin.pointerX - e.clientX), origin.maxWidth);
  };

  /** 📖 Shared end of drag (pointerup and pointercancel): the width is
   * already committed state, only the persistence happens here, once per
   * gesture instead of on every move. */
  const endDrag = (): void => {
    if (dragOriginRef.current === null) return;
    dragOriginRef.current = null;
    setIsDragging(false);
    writeStoredWidth(widthRef.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = e.shiftKey ? KEYBOARD_RESIZE_LARGE_STEP : KEYBOARD_RESIZE_STEP;
    // 📖 Physical mapping: the handle is the panel's left edge, so
    // ArrowLeft moves that edge left and widens the panel, ArrowRight
    // narrows it. Home/End jump to the min/max of the allowed band.
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? step : -step;
      setPanelWidth(widthRef.current + delta, widestAllowedWidth());
      writeStoredWidth(widthRef.current);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setPanelWidth(MIN_AGENT_PANEL_WIDTH, MAX_AGENT_PANEL_WIDTH);
      writeStoredWidth(widthRef.current);
    } else if (e.key === 'End') {
      e.preventDefault();
      // 📖 Same 50vw cap as every other path: a raw max could exceed the
      // effective width on a narrow window.
      setPanelWidth(widestAllowedWidth(), MAX_AGENT_PANEL_WIDTH);
      writeStoredWidth(widthRef.current);
    }
  };

  /** 📖 Double-click restores the original fixed layout width. */
  const handleDoubleClick = (): void => {
    setPanelWidth(DEFAULT_AGENT_PANEL_WIDTH, widestAllowedWidth());
    writeStoredWidth(widthRef.current);
  };

  if (!panel.open || openTabs.length === 0 || !activeTab) return null;

  return (
    <aside
      aria-label={t('agentChat.panelLabel', 'Conversation panel')}
      className="relative flex flex-none flex-col border-l border-border bg-bg-1/30"
      style={{
        width: `clamp(${MIN_AGENT_PANEL_WIDTH}px, min(${width}px, 50vw), ${MAX_AGENT_PANEL_WIDTH}px)`,
      }}
    >
      {/* 📖 Resize handle: a ~6px pointer hit area straddling the left
       * border (3px inside, 3px over the chat column), with a 1px hairline
       * that lights up on hover, focus or drag. The CSS `clamp` on the
       * aside keeps the live 50vw cap even if the window shrinks later. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('agentChat.panelResize', 'Resize panel')}
        aria-valuemin={MIN_AGENT_PANEL_WIDTH}
        aria-valuemax={MAX_AGENT_PANEL_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        onDoubleClick={handleDoubleClick}
        className={`absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize touch-none select-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:content-[''] after:transition-colors ${
          isDragging
            ? 'after:bg-primary'
            : 'after:bg-transparent hover:after:bg-border-strong focus-visible:after:bg-primary/60'
        }`}
      />
      {/* Tab strip: one chip per open tab, close on the active one. */}
      <div className="flex flex-none items-center gap-1 border-b border-border px-2 py-1.5">
        {openTabs.map(tab => {
          const def = AGENT_PANEL_REGISTRY[tab];
          const active = tab === activeTab;
          return (
            <div
              key={tab}
              className={`group flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] transition-colors ${
                active ? 'bg-secondary text-fg' : 'text-fg-muted hover:bg-secondary/60 hover:text-fg'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveAgentPanelTab(tab)}
                className="flex min-w-0 items-center gap-1.5"
                title={t(def.labelKey, def.fallback)}
              >
                {def.icon}
                <span className="truncate">{t(def.labelKey, def.fallback)}</span>
              </button>
              <button
                type="button"
                onClick={() => closeAgentPanelTab(tab)}
                className={`flex-none rounded p-0.5 text-fg-faint transition-opacity hover:text-fg ${
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                title={t('common.close', 'Close')}
                aria-label={`${t('common.close', 'Close')} ${t(def.labelKey, def.fallback)}`}
              >
                <IconX size={11} stroke={2} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {AGENT_PANEL_REGISTRY[activeTab].render(activeSessionId)}
      </div>
    </aside>
  );
}
