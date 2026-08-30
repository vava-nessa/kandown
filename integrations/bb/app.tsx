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
  onArchive,
  onRestore,
  onDragStart,
  onDragEnd,
}: {
  task: TaskRow;
  archived?: boolean;
  onEdit: (task: TaskRow) => void;
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
        <span className="hidden items-center gap-1 group-hover:flex">
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

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function KanbanPage() {
  const navigate = useBbNavigate();
  const kandown = useKandown();
  const [dialog, setDialog] = useState<TaskDialogState | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const { board, boards, selectedProjectId, setSelectedProjectId } = kandown;
  const projectId = selectedProjectId ?? null;
  const selected = boards?.find((candidate) => candidate.projectId === selectedProjectId) ?? null;

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

  const refresh = () => {
    void kandown.refreshBoards();
    if (projectId !== null) void kandown.loadBoard(projectId);
  };

  const archivedCount = board?.archived.length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar: back-to-bb, project picker, health, refresh, archive toggle, add */}
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
        {kandown.loading && board === null ? (
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