// bb-plugin-kandown — a BB plugin frontend entry.
//
// @file        app.tsx
// @description The "Kandown" board inside bb. The sidebar row this plugin
//   registers is the kandown button: clicking it switches bb's main area to
//   the kanban board. The board shells out to the kandown CLI via the
//   backend RPC contract in server.ts, so what you see here is always the
//   same data as the kandown web app, TUI and CLI: the Markdown task files
//   in the project's tasks/ folder.
//
//   A "Back to bb" button (ChevronLeft in the toolbar) leaves the board via
//   useBbNavigate().toCompose() — the plugin lives inside bb and never
//   replaces it, so going back is one click or one sidebar click away.
//
//   Layout: a horizontal board of columns (configured in
//   .kandown/kandown.json), cards with id/priority/tags/assignee, native
//   drag & drop between columns, a create/edit dialog, archiving, and an
//   archived section. Everything refreshes on the server's realtime signal,
//   on reconnect, and when the tab becomes visible again (external edits
//   made by kandown or an agent are picked up).
//
// @functions
//   → useKandown — health, boards, selection, board data, mutations
//   → KanbanPage — the navPanel component; toolbar + board + dialog
//   → BoardView / ColumnView / TaskCard — the visual board
//   → TaskDialog — create/edit form with priority, tags, assignee, body
//   → EmptyBoard / LoadingBoard — missing CLI, uninitialized project, remote
//
// @exports default definePluginApp(...) — registers the board nav panel
//
// @see ./server.ts — the RPC contract this page calls

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { definePluginApp, useBbNavigate, useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import type { BoardData, BoardSummary, rpcContract, TaskDetail, TaskRow } from "./server";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const BOARD_CHANGED = "kandown/board-changed";
const SELECTED_KEY = "kandown.selectedProjectId";
const LAUNCHED_CHANNEL = "kandown/launched";

/** Priority → accent color, matching kandown's P0-P3 ladder. */
const PRIORITY_COLORS: Record<string, string> = {
  P0: "#f43f5e",
  P1: "#fb923c",
  P2: "#60a5fa",
  P3: "#94a3b8",
};

type RpcMethod = keyof typeof rpcContract;

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function restoreStatus(status: string): string {
  return status.replace(/ \(archived\)$/, "");
}

// ---------------------------------------------------------------------------
// Data layer
// ---------------------------------------------------------------------------

interface HealthState {
  ok: boolean;
  version: string | null;
  binary: string;
  error: string | null;
}

type TaskDialogState =
  | { mode: "create"; status: string }
  | { mode: "edit"; task: TaskRow };

/** A bb provider (harness) offered by the launch dialog. */
interface HarvestOption {
  providerId: string;
  displayName: string;
  available: boolean;
}

/** A selectable model inside a provider. */
interface HarvestModel {
  id: string;
  displayName: string;
  isDefault: boolean;
}

interface CreateValues {
  title: string;
  status: string;
  priority: string;
  assignee: string;
  tags: string[];
  category: string;
}

interface UpdateValues extends CreateValues {
  body: string;
}

function useKandown() {
  const rpc = useRpc<typeof rpcContract>();
  const [health, setHealth] = useState<HealthState | null>(null);
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_KEY),
  );
  const [board, setBoard] = useState<BoardData | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRef = useRef(selectedProjectId);
  useEffect(() => {
    selectedRef.current = selectedProjectId;
  }, [selectedProjectId]);

  const report = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause));
  }, []);

  const refreshBoards = useCallback(async () => {
    try {
      const [nextHealth, nextBoards] = await Promise.all([
        rpc.call("kd_health"),
        rpc.call("kd_boards"),
      ]);
      setHealth(nextHealth);
      setBoards((nextBoards as { boards: BoardSummary[] }).boards);
    } catch (cause) {
      report(cause);
    }
  }, [rpc, report]);

  const loadBoard = useCallback(
    async (projectId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await rpc.call("kd_load", { projectId, includeArchived });
        setBoard(result as unknown as BoardData);
        localStorage.setItem(SELECTED_KEY, projectId);
      } catch (cause) {
        setBoard(null);
        report(cause);
      } finally {
        setLoading(false);
      }
    },
    [rpc, includeArchived, report],
  );

  /** Fire a mutation against the server; toasts success/error, never throws. */
  const runMutation = useCallback(
    async (method: RpcMethod, args: unknown, successMessage: string): Promise<boolean> => {
      try {
        await rpc.call(method as never, args as never);
        toast.success(successMessage);
        return true;
      } catch (cause) {
        report(cause);
        toast.error(cause instanceof Error ? cause.message : String(cause));
        return false;
      }
    },
    [rpc, report],
  );

  const showTask = useCallback(
    async (projectId: string, id: string): Promise<TaskDetail> =>
      rpc.call("kd_show", { projectId, id }) as unknown as Promise<TaskDetail>,
    [rpc],
  );

  /** Start a task as a bb thread on a provider/model harness; throws on failure. */
  const kdLaunch = useCallback(
    async (
      projectId: string,
      taskId: string,
      providerId?: string,
      model?: string,
    ): Promise<{ threadId: string; title: string }> => {
      const result = (await rpc.call("kd_launch", {
        projectId,
        taskId,
        providerId: providerId !== undefined && providerId !== "" ? providerId : undefined,
        model: model !== undefined && model !== "" ? model : undefined,
      })) as {
        ok: boolean;
        threadId: string;
        title: string;
        error: string | null;
      };
      if (!result.ok || result.threadId === "") {
        throw new Error(result.error ?? "bb did not start the thread");
      }
      return { threadId: result.threadId, title: result.title };
    },
    [rpc],
  );

  // Initial load: health + boards, then select the remembered or first board.
  useEffect(() => {
    void refreshBoards();
  }, [refreshBoards]);

  useEffect(() => {
    if (boards === null) return;
    const remembered =
      boards.find((candidate) => candidate.projectId === selectedProjectId) ?? null;
    const first = boards.find((candidate) => candidate.isKandown && !candidate.remote) ?? null;
    const pick = remembered !== null && remembered.isKandown && !remembered.remote ? remembered : first;
    if (pick !== null && pick.projectId !== selectedProjectId) {
      setSelectedProjectId(pick.projectId);
      void loadBoard(pick.projectId);
    }
  }, [boards, selectedProjectId, loadBoard]);

  // Reload when the archived toggle flips (loadBoard depends on it).
  useEffect(() => {
    if (selectedProjectId !== null) void loadBoard(selectedProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived]);

  // The server broadcasts after every mutation (from this page or `bb kandown`).
  useRealtime(BOARD_CHANGED, () => {
    void refreshBoards();
    const projectId = selectedRef.current;
    if (projectId !== null) void loadBoard(projectId);
  });

  // Reconcile whatever changed while we could not receive signals.
  const connectionState = useRealtimeConnectionState();
  const wasConnected = useRef(false);
  useEffect(() => {
    if (connectionState === "connected" && !wasConnected.current) {
      wasConnected.current = true;
      void refreshBoards();
      const projectId = selectedRef.current;
      if (projectId !== null) void loadBoard(projectId);
    }
  }, [connectionState, refreshBoards, loadBoard]);

  // External edits (kandown TUI, an agent, the web app) land while bb is
  // open elsewhere too: refetch when this tab becomes visible again.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshBoards();
        const projectId = selectedRef.current;
        if (projectId !== null) void loadBoard(projectId);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refreshBoards, loadBoard]);

  return {
    health,
    boards,
    selectedProjectId,
    setSelectedProjectId,
    board,
    includeArchived,
    setIncludeArchived,
    loading,
    error,
    refreshBoards,
    loadBoard,
    runMutation,
    showTask,
    kdLaunch,
    report,
  };
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

/** Dashed box used for loading and empty states (matches bb's own pages). */
function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  archived,
  onEdit,
  onLaunch,
  onArchive,
  onRestore,
  onDragStart,
  onDragEnd,
}: {
  task: TaskRow;
  archived?: boolean;
  onEdit: (task: TaskRow) => void;
  onLaunch?: (task: TaskRow) => void;
  onArchive?: (task: TaskRow) => void;
  onRestore?: (task: TaskRow) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable={!archived}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(task)}
      title={`${task.id} — click to edit`}
      className={cn(
        "group cursor-grab rounded-md border border-border bg-background p-2 shadow-sm transition-shadow hover:border-foreground/25 hover:shadow-md active:cursor-grabbing",
        archived && "cursor-auto opacity-70 hover:border-border hover:shadow-sm",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{task.id}</span>
        {task.priority !== "" ? (
          <span className="text-xs font-semibold" style={{ color: PRIORITY_COLORS[task.priority] ?? undefined }}>
            {task.priority}
          </span>
        ) : null}
        <span className="grow" />
        <span className="hidden items-center gap-0.5 group-hover:flex">
          {!archived && onLaunch !== undefined ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onLaunch(task);
              }}
              className="rounded p-1 text-foreground hover:bg-state-hover"
              title="Start in bb"
              aria-label={`Start ${task.id} in bb`}
            >
              <Icon name="Play" className="size-4" />
            </button>
          ) : null}
          {archived && onRestore !== undefined ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRestore(task);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-state-hover hover:text-foreground"
              title="Restore"
              aria-label={`Restore ${task.id}`}
            >
              <Icon name="ArchiveRestore" className="size-4" />
            </button>
          ) : onArchive !== undefined ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onArchive(task);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-state-hover hover:text-foreground"
              title="Archive"
              aria-label={`Archive ${task.id}`}
            >
              <Icon name="Archive" className="size-4" />
            </button>
          ) : null}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-foreground">{task.title}</p>
      {task.tags.length > 0 || task.assignee !== "" ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {task.tags.map((tag) => (
            <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {tag}
            </span>
          ))}
          {task.assignee !== "" ? (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="UserRound" className="size-3" />
              {task.assignee}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ColumnView({
  name,
  color,
  tasks,
  archived,
  onAdd,
  onEdit,
  onLaunch,
  onArchive,
  onRestore,
  onMove,
  draggingId,
  onDragStart,
  onDragEnd,
}: {
  name: string;
  color: string | null;
  tasks: TaskRow[];
  archived?: boolean;
  onAdd: (column: string) => void;
  onEdit: (task: TaskRow) => void;
  onLaunch: (task: TaskRow) => void;
  onArchive: (task: TaskRow) => void;
  onRestore?: (task: TaskRow) => void;
  onMove: (id: string, column: string) => void;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const [over, setOver] = useState(false);
  const acceptDrop = draggingId !== null && !archived;
  return (
    <div
      className={cn(
        "flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-card",
        over && acceptDrop ? "border-foreground/40" : "border-border",
      )}
      onDragOver={(event) => {
        if (!acceptDrop) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (acceptDrop && draggingId !== null) onMove(draggingId, name);
      }}
    >
      <header className="flex shrink-0 items-center gap-2 px-3 py-2">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color ?? "var(--border)" }} />
        <h2 className="truncate text-sm font-semibold text-foreground">{name}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
        <span className="grow" />
        <button
          type="button"
          onClick={() => onAdd(name)}
          className="rounded p-1 text-muted-foreground hover:bg-state-hover hover:text-foreground"
          title={`Add task to ${name}`}
          aria-label={`Add task to ${name}`}
        >
          <Icon name="Plus" className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            archived={archived}
            onEdit={onEdit}
            onLaunch={onLaunch}
            onArchive={onArchive}
            onRestore={onRestore}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
        {tasks.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Empty
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LoadingBoard() {
  return (
    <div className="flex h-full items-start gap-3 p-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-full w-72 shrink-0 rounded-lg border border-border bg-card" />
      ))}
      <div className="p-6 text-sm text-muted-foreground">
        <Icon name="Loading" className="mr-2 inline size-4 animate-spin" />
        Loading board…
      </div>
    </div>
  );
}

/**
 * The full kandown web app, embedded. The backend ensures the project's
 * kandown daemon is running (with the bb agent hook) and hands us its URL;
 * the daemon serves the app and injects its own auth token into the page,
 * so the iframe needs nothing else. The "Send to Agent · bb" action inside
 * the app comes back through the plugin's hook and opens the bb thread.
 */
function AppView({ projectId, epoch }: { projectId: string; epoch: number }) {
  const rpc = useRpc<typeof rpcContract>();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState("loading");
    setError(null);
    setUrl(null);
    rpc.call("kd_daemon", { projectId }).then(
      (result) => {
        const value = result as { ok: boolean; url: string; error: string | null };
        if (value.ok && value.url !== "") {
          setUrl(value.url);
          setState("ready");
        } else {
          setState("error");
          setError(value.error ?? "The kandown daemon could not be started.");
        }
      },
      (cause) => {
        setState("error");
        setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  }, [rpc, projectId]);

  useEffect(() => {
    load();
  }, [load, epoch]);

  if (state === "loading") {
    return (
      <div className="p-4">
        <EmptyState>
          <Icon name="Loading" className="mr-2 inline size-4 animate-spin" />
          Starting the kandown daemon…
        </EmptyState>
      </div>
    );
  }
  if (state === "error" || url === null) {
    return (
      <div className="p-4">
        <EmptyState>
          {error}
          <div className="mt-3">
            <Button size="sm" onClick={load}>
              <Icon name="RotateCcw" className="size-4" />
              Retry
            </Button>
          </div>
        </EmptyState>
      </div>
    );
  }
  return <iframe key={url} src={url} title="Kandown" className="h-full w-full flex-1 border-0 bg-background" />;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function KanbanPage() {
  const navigate = useBbNavigate();
  const kandown = useKandown();
  const [view, setView] = useState<"app" | "board">("app");
  const [daemonEpoch, setDaemonEpoch] = useState(0);
  const [dialog, setDialog] = useState<TaskDialogState | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchDialog, setLaunchDialog] = useState<{ task: TaskRow } | null>(null);

  const { board, boards, selectedProjectId, setSelectedProjectId } = kandown;
  const projectId = selectedProjectId ?? null;
  const selected = boards?.find((candidate) => candidate.projectId === selectedProjectId) ?? null;

  // A thread launched from the embedded kandown app (its "Send to Agent · bb"
  // action goes through the plugin hook) arrives here and opens in bb.
  useRealtime(LAUNCHED_CHANNEL, (payload) => {
    const { threadId } = (payload ?? {}) as { threadId?: string };
    if (typeof threadId === "string" && threadId !== "") navigate.toThread(threadId);
  });

  const openCreate = (status: string) => {
    setDetail(null);
    setDialog({ mode: "create", status });
  };
  const openEdit = (task: TaskRow) => {
    setDetail(null);
    setDialog({ mode: "edit", task });
    if (projectId !== null) {
      setDetailLoading(true);
      kandown
        .showTask(projectId, task.id)
        .then(setDetail, kandown.report)
        .finally(() => setDetailLoading(false));
    }
  };

  const moveTask = (id: string, column: string) => {
    setDraggingId(null);
    if (projectId === null) return;
    void kandown.runMutation("kd_move", { projectId, id, status: column }, `Moved ${id} → ${column}`);
  };
  const archiveTask = (task: TaskRow) => {
    if (projectId === null) return;
    void kandown.runMutation("kd_move", { projectId, id: task.id, status: "archived" }, `Archived ${task.id}`);
  };
  const restoreTask = (task: TaskRow) => {
    if (projectId === null) return;
    const status = restoreStatus(task.status);
    void kandown.runMutation("kd_move", { projectId, id: task.id, status }, `Restored ${task.id} → ${status}`);
  };
  const initProject = async () => {
    if (projectId === null) return;
    await kandown.runMutation("kd_init", { projectId }, "Kandown initialized");
  };

  const createTask = async (values: CreateValues) => {
    if (projectId === null) return;
    await kandown.runMutation("kd_create", { projectId, ...values }, "Task created");
  };
  const updateTask = async (id: string, values: UpdateValues) => {
    if (projectId === null) return;
    await kandown.runMutation("kd_update", { projectId, id, ...values }, `Saved ${id}`);
  };

  const launchTask = async (task: TaskRow, providerId?: string, modelId?: string) => {
    if (projectId === null || launching) return;
    setLaunching(true);
    try {
      const launched = await kandown.kdLaunch(projectId, task.id, providerId ?? "", modelId ?? "");
      setLaunchDialog(null);
      toast.success(`Thread started on ${task.id} — opening in bb.`);
      // The thread belongs to this project; opening it is what "start in bb"
      // means. The realtime signal would also do it, but navigate directly
      // so the transition is instant.
      navigate.toThread(launched.threadId);
    } catch (cause) {
      kandown.report(cause);
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLaunching(false);
    }
  };

  const refresh = () => {
    void kandown.refreshBoards();
    if (view === "app") {
      setDaemonEpoch((value) => value + 1);
    } else if (projectId !== null) {
      void kandown.loadBoard(projectId);
    }
  };

  const archivedCount = board?.archived.length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar: back-to-bb, view switch, project picker, health, refresh, board actions */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          aria-label="Back to bb"
          onClick={() => navigate.toCompose()}
        >
          <Icon name="ChevronLeft" className="size-4" />
        </Button>
        <select
          value={selectedProjectId ?? ""}
          onChange={(event) => setSelectedProjectId(event.target.value || null)}
          className="h-8 max-w-56 truncate rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Project board"
        >
          <option value="">Select a project…</option>
          {boards?.map((candidate) => (
            <option key={candidate.projectId} value={candidate.projectId}>
              {candidate.projectName}
              {candidate.remote ? " (remote)" : candidate.isKandown ? "" : " (no kandown)"}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => setView("app")}
            className={cn(
              "rounded-sm px-2 py-1 text-xs font-medium transition-colors",
              view === "app" ? "bg-state-active text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            App
          </button>
          <button
            type="button"
            onClick={() => setView("board")}
            className={cn(
              "rounded-sm px-2 py-1 text-xs font-medium transition-colors",
              view === "board" ? "bg-state-active text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Board
          </button>
        </div>
        {kandown.health !== null && !kandown.health.ok ? (
          <span
            className="hidden items-center gap-1.5 text-xs text-foreground/60 md:inline-flex"
            title={kandown.health.error ?? undefined}
          >
            <Icon name="AlertTriangle" className="size-4" style={{ color: "#f59e0b" }} />
            kandown CLI missing
          </span>
        ) : kandown.health?.ok === true ? (
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <span className="size-2 rounded-full" style={{ backgroundColor: "#10b981" }} />
            kandown {kandown.health.version}
          </span>
        ) : null}
        <span className="grow" />
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          aria-label="Refresh from disk"
          onClick={refresh}
        >
          <Icon name="RotateCcw" className="size-4" />
        </Button>
        {view === "board" ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 text-muted-foreground hover:text-foreground",
                kandown.includeArchived && "bg-state-active text-foreground",
              )}
              aria-label="Toggle archived tasks"
              onClick={() => kandown.setIncludeArchived((value) => !value)}
            >
              <Icon name="Archive" className="size-4" />
              {archivedCount > 0 ? <span className="text-xs tabular-nums">{archivedCount}</span> : null}
            </Button>
            <Button size="sm" onClick={() => openCreate(board?.columns[0]?.name ?? "Backlog")}>
              <Icon name="Plus" className="size-4" />
              Add task
            </Button>
          </>
        ) : null}
      </div>

      {kandown.error !== null ? (
        <div className="shrink-0 border-b border-border bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {kandown.error}
        </div>
      ) : null}
      {kandown.health !== null && !kandown.health.ok ? (
        <div className="shrink-0 border-b border-border px-3 py-2 text-sm">
          <span className="text-foreground/80">
            The kandown CLI is not installed. The board shells out to it, just like the kandown web app and TUI
            do. Install it once with:
          </span>
          <code className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm install -g kandown</code>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {view === "app" ? (
          selected !== null && selected.isKandown && !selected.remote ? (
            <AppView key={`${selected.projectId}:${daemonEpoch}`} projectId={selected.projectId} epoch={daemonEpoch} />
          ) : (
            <EmptyBoard selected={selected} health={kandown.health} onInit={initProject} />
          )
        ) : kandown.loading && board === null ? (
          <LoadingBoard />
        ) : board !== null ? (
          <div className="flex h-full min-h-0 items-start gap-3 overflow-x-auto p-3">
            {board.columns.map((column) => (
              <ColumnView
                key={column.name}
                name={column.name}
                color={column.color}
                tasks={column.tasks}
                onAdd={openCreate}
                onEdit={openEdit}
                onLaunch={(task) => setLaunchDialog({ task })}
                onArchive={archiveTask}
                onMove={moveTask}
                draggingId={draggingId}
                onDragStart={setDraggingId}
                onDragEnd={() => setDraggingId(null)}
              />
            ))}
            {kandown.includeArchived && board.archived.length > 0 ? (
              <ColumnView
                name="Archived"
                color={null}
                tasks={board.archived}
                archived
                onAdd={() => {}}
                onEdit={openEdit}
                onLaunch={() => {}}
                onArchive={() => {}}
                onRestore={restoreTask}
                onMove={() => {}}
                draggingId={null}
                onDragStart={() => {}}
                onDragEnd={() => {}}
              />
            ) : null}
          </div>
        ) : (
          <EmptyBoard selected={selected} health={kandown.health} onInit={initProject} />
        )}
      </div>

      {dialog !== null && projectId !== null ? (
        <TaskDialog
          board={board}
          dialog={dialog}
          detail={detail}
          detailLoading={detailLoading}
          onCancel={() => setDialog(null)}
          onCreate={createTask}
          onUpdate={updateTask}
        />
      ) : null}
      {launchDialog !== null && projectId !== null ? (
        <LaunchDialog
          projectId={projectId}
          task={launchDialog.task}
          busy={launching}
          onCancel={() => setLaunchDialog(null)}
          onLaunch={launchTask}
        />
      ) : null}
    </div>
  );
}

function EmptyBoard({
  selected,
  health,
  onInit,
}: {
  selected: BoardSummary | null;
  health: HealthState | null;
  onInit: () => void;
}) {
  if (health !== null && !health.ok) {
    return (
      <div className="p-4">
        <EmptyState>
          Install the kandown CLI (
          <code className="rounded bg-muted px-1 font-mono text-xs">npm install -g kandown</code>) to visualize
          your boards here, or run <code className="rounded bg-muted px-1 font-mono text-xs">bb kandown boards</code>.
        </EmptyState>
      </div>
    );
  }
  if (selected === null) {
    return (
      <div className="p-4">
        <EmptyState>
          Pick a project from the selector above. Projects with a kandown setup (a{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">tasks/</code> folder) become boards
          automatically.
        </EmptyState>
      </div>
    );
  }
  if (selected.error !== null) {
    return (
      <div className="p-4">
        <EmptyState>{selected.error}</EmptyState>
      </div>
    );
  }
  return (
    <div className="p-4">
      <EmptyState>
        <span className="font-medium text-foreground">{selected.projectName}</span> is not a kandown project yet.
        Initialize it and this project gets a board backed by Markdown task files.
        <div className="mt-3">
          <Button size="sm" onClick={onInit}>
            <Icon name="FolderPlus" className="size-4" />
            Initialize kandown here
          </Button>
        </div>
      </EmptyState>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit dialog
// ---------------------------------------------------------------------------

function TaskDialog({
  board,
  dialog,
  detail,
  detailLoading,
  onCancel,
  onCreate,
  onUpdate,
}: {
  board: BoardData | null;
  dialog: TaskDialogState;
  detail: TaskDetail | null;
  detailLoading: boolean;
  onCancel: () => void;
  onCreate: (values: CreateValues) => Promise<void>;
  onUpdate: (id: string, values: UpdateValues) => Promise<void>;
}) {
  const isEdit = dialog.mode === "edit";
  const columns = (board?.columns ?? []).map((column) => column.name);
  const defaultPriority = board?.config?.defaultPriority ?? "P3";
  const [title, setTitle] = useState(dialog.mode === "edit" ? dialog.task.title : "");
  const [status, setStatus] = useState(dialog.mode === "edit" ? dialog.task.status : dialog.status);
  const [priority, setPriority] = useState(
    dialog.mode === "edit" ? dialog.task.priority || defaultPriority : defaultPriority,
  );
  const [assignee, setAssignee] = useState(dialog.mode === "edit" ? dialog.task.assignee : "");
  const [tags, setTags] = useState(dialog.mode === "edit" ? dialog.task.tags.join(", ") : "");
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  // The edit form loads the full task file content once it arrives.
  useEffect(() => {
    if (isEdit && detail !== null) {
      setCategory(detail.category);
      setBody(detail.body);
    }
  }, [isEdit, detail]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || title.trim() === "") return;
    setPending(true);
    try {
      const common = {
        title: title.trim(),
        status,
        priority,
        assignee: assignee.trim(),
        tags: splitTags(tags),
        category: category.trim(),
      };
      if (dialog.mode === "create") {
        await onCreate(common);
      } else {
        await onUpdate(dialog.task.id, { ...common, body });
      }
      onCancel();
    } catch (cause) {
      console.error(cause);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? `Edit ${dialog.task.id}` : "New task"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Saves back into the task's Markdown file and reslugs the filename."
                : "Creates a Markdown task file in the project's tasks/ folder."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Field label="Title">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What needs doing?"
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Column">
                <select value={status} onChange={(event) => setStatus(event.target.value)} className={selectClass}>
                  {columns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select value={priority} onChange={(event) => setPriority(event.target.value)} className={selectClass}>
                  {["P0", "P1", "P2", "P3"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Assignee">
                <Input
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                  placeholder="vava, claude, codex…"
                />
              </Field>
              <Field label="Category">
                <Input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="UI, backend…"
                />
              </Field>
            </div>
            <Field label="Tags">
              <Input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="bug, ui, quality (comma separated)"
              />
            </Field>
            {isEdit && detailLoading ? (
              <p className="text-xs text-muted-foreground">
                <Icon name="Loading" className="mr-1 inline size-3.5 animate-spin" />
                Loading task body…
              </p>
            ) : isEdit ? (
              <Field label="Body (Markdown)">
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={7}
                  className="w-full rounded-md border border-input bg-transparent p-2 text-sm font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </Field>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || title.trim() === ""}>
              {pending ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Launch dialog — pick the bb harness (provider) and start the task.
// ---------------------------------------------------------------------------

/** Default harness pick: last choice per project, else first available. */
const LAUNCH_PROVIDER_KEY = "kandown.launchProvider";
const LAUNCH_MODEL_KEY = "kandown.launchModel";

function LaunchDialog({
  projectId,
  task,
  busy,
  onCancel,
  onLaunch,
}: {
  projectId: string;
  task: TaskRow;
  busy: boolean;
  onCancel: () => void;
  onLaunch: (task: TaskRow, providerId: string, modelId?: string) => Promise<void>;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [providers, setProviders] = useState<HarvestOption[] | null>(null);
  const [models, setModels] = useState<HarvestModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(() => {
    const key = `${LAUNCH_PROVIDER_KEY}:${projectId}`;
    return localStorage.getItem(key);
  });
  const [modelId, setModelId] = useState<string | null>(null);

  // Load the provider roster and the remembered/available selection once.
  useEffect(() => {
    let alive = true;
    rpc.call("kd_models", { projectId }).then(
      (result) => {
        if (!alive) return;
        const value = result as { providers: HarvestOption[] };
        setProviders(value.providers);
        const remembered = localStorage.getItem(`${LAUNCH_PROVIDER_KEY}:${projectId}`);
        if (remembered !== null && value.providers.some((p) => p.providerId === remembered)) {
          setProviderId(remembered);
        } else {
          const preferred =
            value.providers.find((p) => p.available && p.providerId === "opencode-go") ??
            value.providers.find((p) => p.available) ??
            value.providers[0] ??
            null;
          if (preferred !== null) setProviderId(preferred.providerId);
        }
      },
      (cause) => {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      alive = false;
    };
  }, [rpc, projectId]);

  // Load the models for the selected provider; pick the remembered one or the
  // provider's default.
  useEffect(() => {
    if (providerId === null) {
      setModels(null);
      setModelId(null);
      return;
    }
    let alive = true;
    setModels(null);
    setModelId(null);
    rpc.call("kd_models", { projectId, providerId }).then(
      (result) => {
        if (!alive) return;
        const value = result as { models?: HarvestModel[] };
        const next = value.models ?? [];
        setModels(next);
        const remembered = localStorage.getItem(`${LAUNCH_MODEL_KEY}:${projectId}:${providerId}`);
        const pick =
          next.find((m) => m.id === remembered) ?? next.find((m) => m.isDefault) ?? next[0] ?? null;
        setModelId(pick?.id ?? null);
      },
      (cause) => {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      alive = false;
    };
  }, [rpc, projectId, providerId]);

  const launch = async () => {
    if (providerId === null) return;
    localStorage.setItem(`${LAUNCH_PROVIDER_KEY}:${projectId}`, providerId);
    if (modelId !== null) localStorage.setItem(`${LAUNCH_MODEL_KEY}:${projectId}:${providerId}`, modelId);
    await onLaunch(task, providerId, modelId ?? undefined);
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start in bb</DialogTitle>
          <DialogDescription>
            Spawns a bb thread on <span className="font-mono">{task.id}</span> in this project, with the
            task file as the prompt. The agent works on it and moves it forward on the board.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {error !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Field label="Harness (provider)">
            <select
              value={providerId ?? ""}
              onChange={(event) => {
                setProviderId(event.target.value || null);
                setModelId(null);
                setModels(null);
              }}
              className={selectClass}
              disabled={providers === null}
            >
              <option value="">Project default…</option>
              {(providers ?? []).map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.displayName}
                  {provider.available ? "" : " (unavailable)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model">
            <select
              value={modelId ?? ""}
              onChange={(event) => setModelId(event.target.value || null)}
              className={selectClass}
              disabled={providerId === null || models === null}
            >
              <option value="">Provider default…</option>
              {(models ?? []).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName}
                  {model.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-muted-foreground">
            The thread opens in bb with this provider and model, seeded with the task. You can switch models
            inside the thread at any time.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void launch()} disabled={busy || providerId === null}>
            {busy ? (
              <>
                <Icon name="Loading" className="size-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <Icon name="Play" className="size-4" />
                Start in bb
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "board",
    title: "Kandown",
    icon: "Columns2",
    // Routed at /plugins/kandown/board. The sidebar row is the kandown
    // button: click it and bb's main area becomes the kanban board.
    path: "board",
    component: KanbanPage,
  });
});