/**
 * @file Hover preview card for chat task references
 * @description Round 11 of vava's chat feedback: task mentions in the agent
 * chat stay clickable AND gain a hover preview. Hovering a task chip (assistant
 * markdown, `task:` links rendered by MarkdownContent) or a context card
 * (user @mentions rendered by agent/ContextCards) opens a small fixed popover
 * anchored above the hovered element, showing the task's title, a mono meta
 * line (status, category, priority) and the task body, written small. The
 * popover body is the scroll container (max 260px): long task files are read
 * inside the preview, not by opening the drawer.
 *
 * 📖 Content loading: `useTaskPreviewContent` resolves one task through the
 * canonical `readTaskFile`, exactly like drawerSlice.openDrawer does, so it
 * works in server mode AND standalone (File System Access). The same valid-mode
 * guard applies: without a directory handle and without a managed server the
 * fetch is never started and the preview reports unavailable. Results live in a
 * module-level Map cache (one load per task id per page session, in-flight
 * requests deduplicated); read failures never throw, they settle as
 * 'unavailable' and the popover says so quietly.
 *
 * 📖 Hover lifecycle: the pointer must be able to travel from the trigger onto
 * the popover, so closing is deferred by a 250ms grace timer that either
 * surface cancels on enter and re-arms on leave. Opening waits 300ms so a
 * pointer passing over a chip does not flash a card. The popover also closes
 * immediately on Escape and on any scroll outside itself (captured at document
 * level, which covers the message list container; the preview's own scrollable
 * body is excluded so reading a long task never dismisses the card). Rendering
 * is portaled to document.body with position:fixed, so no chat overflow
 * clipping applies.
 *
 * @functions
 *  → useGracefulClose: shared 250ms deferred-close timer (schedule/cancel/now)
 *  → useTaskPreviewContent: cached, failure-tolerant task content loader
 *  → loadTaskPreviewEntry: deduplicated read + cache write (module scope)
 *  → optionalText: unknown-to-string narrowing for frontmatter fields
 *  → isPlaceholderTask: detects readTaskFile's empty placeholder (missing file)
 *  → TaskPreviewPopover: the portaled fixed preview card
 *  → TaskReferenceChip: the clickable mono task pill with hover preview
 *
 * @exports TaskReferenceChip, TaskPreviewPopover, useTaskPreviewContent,
 * TaskPreview, TaskPreviewState, useGracefulClose
 * @see src/components/agent/MarkdownContent.tsx: mounts TaskReferenceChip
 * @see src/components/agent/ContextCards.tsx: mounts TaskPreviewPopover
 * @see src/lib/store/drawerSlice.ts: the openDrawer read pattern mirrored here
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconArrowUpRight } from '@tabler/icons-react';
import { readTaskFile, isServerMode } from '../../lib/filesystem';
import { useStore } from '../../lib/store';
import type { ParsedTask } from '../../lib/types';

/** 📖 Delay before hovering opens the preview: a pointer flying across several
 * chips must not flash a card for each one. */
const HOVER_OPEN_DELAY_MS = 300;

/** 📖 Grace period after the pointer leaves the chip or the popover: crossing
 * the 6px gap between them, or a short detour, must not close the preview. */
const CLOSE_GRACE_MS = 250;

const POPOVER_WIDTH = 300;
const POPOVER_MAX_HEIGHT = 260;
const POPOVER_GAP = 6;
const POPOVER_Z_INDEX = 50;
const VIEWPORT_MARGIN = 8;

/** 📖 One settled preview in the module cache. 'unavailable' is cached too
 * (the file is genuinely missing), but transient read errors are not: see
 * loadTaskPreviewEntry. */
type TaskPreviewCacheEntry = { kind: 'ready'; preview: TaskPreview } | { kind: 'unavailable' };

/** 📖 The small slice of a task the preview renders. */
export interface TaskPreview {
  title: string;
  status: string | null;
  category: string | null;
  priority: string | null;
  body: string;
}

export type TaskPreviewState = 'loading' | 'ready' | 'unavailable';

/** 📖 Module cache: one load per task id per page session. */
const previewCache = new Map<string, TaskPreviewCacheEntry>();

/** 📖 In-flight reads, so hovering the same task from two chips at once never
 * issues two filesystem calls. */
const inFlightPreviews = new Map<string, Promise<TaskPreviewCacheEntry>>();

/** 📖 Static at module scope: a 120ms fade is decorative, users with
 * reduced-motion enabled get the popover without the appearance animation. */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

/**
 * 📖 Shared deferred-close timer for hover surfaces. The parent schedules a
 * close when the pointer leaves its trigger and cancels it when the pointer
 * enters the popover (and vice versa). `closeNow` bypasses the grace period
 * (Escape, scroll). The timer is cleared on unmount.
 */
export function useGracefulClose(onClose: () => void): {
  scheduleClose: () => void;
  cancelClose: () => void;
  closeNow: () => void;
} {
  const timerRef = useRef<number | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const cancelClose = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      closeRef.current();
    }, CLOSE_GRACE_MS);
  }, [cancelClose]);

  const closeNow = useCallback(() => {
    cancelClose();
    closeRef.current();
  }, [cancelClose]);

  return { scheduleClose, cancelClose, closeNow };
}

/** 📖 unknown-to-string narrowing for frontmatter fields: the frontmatter index
 * signature is `unknown`, and empty strings render as noise, so only non-blank
 * strings pass. */
function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** 📖 Type guard over a readTaskFile result: a missing task file comes back as
 * the `emptyTask` placeholder (blank title plus the exact scaffold body), which
 * the preview must report as unavailable instead of showing an empty task. */
function isPlaceholderTask(taskId: string, parsed: ParsedTask): boolean {
  const title = parsed.frontmatter.title;
  const blankTitle = typeof title !== 'string' || title.trim() === '';
  return blankTitle && parsed.body.trim() === `# ${taskId}\n\n## Context\n\n## Subtasks`;
}

/**
 * 📖 Reads one task preview through the canonical readTaskFile (server mode and
 * standalone alike), deduplicated per task id and cached in the module Map.
 * A placeholder result is cached as unavailable; an exception is NOT cached so
 * a transient failure (permission prompt mid-flight) retries on the next hover.
 * Never throws.
 */
function loadTaskPreviewEntry(
  tasksDirHandle: FileSystemDirectoryHandle | null,
  taskId: string,
): Promise<TaskPreviewCacheEntry> {
  const inFlight = inFlightPreviews.get(taskId);
  if (inFlight) return inFlight;
  const promise = (async (): Promise<TaskPreviewCacheEntry> => {
    try {
      const parsed = await readTaskFile(tasksDirHandle, taskId);
      if (isPlaceholderTask(taskId, parsed)) {
        const missing: TaskPreviewCacheEntry = { kind: 'unavailable' };
        previewCache.set(taskId, missing);
        return missing;
      }
      const preview: TaskPreview = {
        title: optionalText(parsed.frontmatter.title) ?? taskId.toUpperCase(),
        status: optionalText(parsed.frontmatter.status),
        category: optionalText(parsed.frontmatter.category),
        priority: optionalText(parsed.frontmatter.priority),
        body: parsed.body,
      };
      const entry: TaskPreviewCacheEntry = { kind: 'ready', preview };
      previewCache.set(taskId, entry);
      return entry;
    } catch {
      return { kind: 'unavailable' };
    } finally {
      inFlightPreviews.delete(taskId);
    }
  })();
  inFlightPreviews.set(taskId, promise);
  return promise;
}

/**
 * 📖 Loads the preview content for one task id (or null when closed). Mirrors
 * drawerSlice.openDrawer's valid-mode guard: no fetch without a directory
 * handle unless a managed server answers. Cached results resolve synchronously
 * on the first effect pass.
 */
export function useTaskPreviewContent(taskId: string | null): { state: TaskPreviewState; preview: TaskPreview | null } {
  const tasksDirHandle = useStore(s => s.tasksDirHandle);
  const [entry, setEntry] = useState<TaskPreviewCacheEntry | null>(() =>
    taskId !== null ? previewCache.get(taskId) ?? null : null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (taskId === null) {
      setEntry(null);
      setLoading(false);
      return;
    }
    const cached = previewCache.get(taskId);
    if (cached) {
      setEntry(cached);
      setLoading(false);
      return;
    }
    // 📖 Same guard as openDrawer: never touch the filesystem backend outside
    // the modes where a read can succeed.
    if (tasksDirHandle === null && !isServerMode()) {
      setEntry({ kind: 'unavailable' });
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void loadTaskPreviewEntry(tasksDirHandle, taskId).then(result => {
      if (!active) return;
      setEntry(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [taskId, tasksDirHandle]);

  if (loading || entry === null) return { state: 'loading', preview: null };
  if (entry.kind === 'unavailable') return { state: 'unavailable', preview: null };
  return { state: 'ready', preview: entry.preview };
}

export interface TaskPreviewPopoverProps {
  /** The task whose content the preview shows. */
  taskId: string;
  /** Rect of the hovered trigger, captured at hover time: the popover anchors
   * above it (fixed positioning, so page scroll is irrelevant while open). */
  anchor: DOMRect;
  /** Immediate close (Escape, scroll, parent teardown). */
  onClose: () => void;
  /** The pointer entered the popover: the parent cancels its pending close. */
  onPointerEnter?: () => void;
  /** The pointer left the popover: the parent re-arms its grace timer. */
  onPointerLeave?: () => void;
}

/**
 * 📖 The preview card itself: portaled to document.body, fixed above the anchor
 * (left clamped into the viewport), 300px wide, body capped at 260px and
 * SCROLLABLE so long tasks read in place. Typography is deliberately small:
 * 12.5px title, 10.5px mono meta pills, 11.5px muted body. The appearance fade
 * is dropped for prefers-reduced-motion users.
 */
export function TaskPreviewPopover({ taskId, anchor, onClose, onPointerEnter, onPointerLeave }: TaskPreviewPopoverProps) {
  const { t } = useTranslation();
  const { state, preview } = useTaskPreviewContent(taskId);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // 📖 Escape closes. Scroll closes too: scroll events do not bubble, so the
  // capture-phase document listener is what sees the message list scrolling
  // (the container this popover's trigger lives in). Scrolls INSIDE the popover
  // are excluded: the preview body is the scroll surface, reading a long task
  // must never dismiss the card showing it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      const popover = popoverRef.current;
      if (popover !== null && target instanceof Node && popover.contains(target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const meta = preview ? [preview.status, preview.category, preview.priority].filter(v => v !== null) : [];

  return createPortal(
    <div
      ref={popoverRef}
      role="tooltip"
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      className="w-[300px] max-h-[260px] overflow-y-auto rounded-[10px] border border-border bg-bg-1 p-3 shadow-[var(--shadow-popover)]"
      style={{
        position: 'fixed',
        // 📖 Above the anchor by default; the second term keeps the popover's
        // top edge inside the viewport when the trigger sits near the screen
        // top (height is capped by max-h, so the bound uses that worst case).
        bottom: Math.min(
          window.innerHeight - anchor.top + POPOVER_GAP,
          window.innerHeight - VIEWPORT_MARGIN - POPOVER_MAX_HEIGHT,
        ),
        left: Math.max(VIEWPORT_MARGIN, Math.min(anchor.left, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN)),
        zIndex: POPOVER_Z_INDEX,
        ...(PREFERS_REDUCED_MOTION ? null : { animation: 'fade-in 120ms ease-out both' }),
      }}
    >
      <div className="break-words text-[12.5px] font-medium leading-snug text-fg">
        {preview?.title ?? taskId.toUpperCase()}
      </div>
      {meta.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {meta.map(value => (
            <span
              key={value}
              className="rounded-full border border-border/60 bg-bg-2/50 px-1.5 font-mono text-[10.5px] uppercase leading-[1.6] text-fg-muted"
            >
              {value}
            </span>
          ))}
        </div>
      )}
      {state === 'loading' && (
        <div className="mt-2 font-mono text-[10.5px] text-fg-faint">{t('agentChat.taskPreviewLoading', 'Loading...')}</div>
      )}
      {state === 'unavailable' && (
        <div className="mt-2 font-mono text-[10.5px] text-fg-faint">
          {t('agentChat.taskPreviewUnavailable', 'Content not available')}
        </div>
      )}
      {preview !== null && preview.body.trim() !== '' && (
        <div className="mt-2 whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-fg-muted">
          {preview.body}
        </div>
      )}
    </div>,
    document.body,
  );
}

export interface TaskReferenceChipProps {
  /** Canonical task id (lowercase `t<number>`), shown uppercase. */
  taskId: string;
  /** Opens the task in the app; the click path is unchanged by the hover. */
  onOpenTask?: (taskId: string) => void;
}

/**
 * 📖 The compact mono task pill (same markup MarkdownContent rendered before
 * the hover feature), wrapped with the preview lifecycle: 300ms hover delay
 * opens the popover anchored to the chip's rect, leaving arms the 250ms grace
 * timer, entering the popover cancels it. Click still opens the task through
 * the canonical openDrawer path; the popover closes first (immediate close on
 * scroll/Escape also fires from its own listeners).
 */
export function TaskReferenceChip({ taskId, onOpenTask }: TaskReferenceChipProps) {
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const { scheduleClose, cancelClose, closeNow } = useGracefulClose(() => setAnchor(null));

  useEffect(
    () => () => {
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
    },
    [],
  );

  const handleEnter = useCallback(() => {
    cancelClose();
    if (openTimerRef.current !== null) return; // already opening
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      const rect = chipRef.current?.getBoundingClientRect();
      if (rect) setAnchor(rect);
    }, HOVER_OPEN_DELAY_MS);
  }, [cancelClose]);

  const handleLeave = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    scheduleClose();
  }, [scheduleClose]);

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        onClick={() => onOpenTask?.(taskId)}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        title={taskId.toUpperCase()}
        className="inline-flex items-center gap-0.5 rounded-full border border-accent/40 bg-accent/10 px-1.5 align-baseline font-mono text-[11.5px] font-medium leading-[1.4] text-fg transition-colors hover:border-accent hover:bg-accent/20"
      >
        {taskId.toUpperCase()}
        <IconArrowUpRight size={10} stroke={2} className="text-fg-muted" />
      </button>
      {anchor !== null &&
        createPortal(
          <TaskPreviewPopover
            taskId={taskId}
            anchor={anchor}
            onClose={closeNow}
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
          />,
          document.body,
        )}
    </>
  );
}
