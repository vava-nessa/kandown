// bb-plugin-kandown — a BB plugin backend entry.
//
// @file        server.ts
// @description Runs kandown inside bb. The plugin shells out to the `kandown`
//   CLI (see the kandown repository: a file-based Kanban engine where every
//   task is a Markdown file under tasks/). bb projects whose checkout is a
//   kandown project (.kandown/kandown.json + tasks/) become boards; the
//   frontend (app.tsx) renders them and calls back here over RPC.
//
//   Why the CLI instead of parsing the files directly: kandown owns the task
//   file format (frontmatter, descriptive filenames, id allocation, status
//   resolution against the configured columns, reslug rules). Shelling out
//   keeps bb and the board byte-identical with the kandown web app, the TUI
//   and the CLI, so "your data is just files" stays true no matter which
//   surface wrote last. The only file edits done here (patchTaskContent)
//   touch frontmatter fields the CLI has no command for (title, priority,
//   tags, category, body) and immediately reslug the file so the filename can
//   never drift from the task it names.
//
//   Locality rule: the CLI runs on the bb server host. A board whose project
//   checkout lives on an enrolled remote host is detected and listed, but
//   loading it returns a friendly error instead of touching the wrong disk.
//
// @functions
//   → plugin(bb) — registers settings, the RPC contract, the bb kandown CLI
//     command and realtime signals
//   → binaryFor / cliVersion — resolve and probe the kandown executable
//   → runCli — execFile wrapper with a 30s timeout and stable errors
//   → listProjectSources — every bb project's default local-path source
//   → resolveSource — one project → { hostId, path } or a typed error
//   → readBoardConfig — .kandown/kandown.json → columns, colors, defaultPriority
//   → isKandownProject — config file exists on the source host
//   → parseRows — `kandown list --json` stdout → TaskRow[]
//   → loadBoard — config + rows → column buckets (+ archived + unknown-status column)
//   → createTask / moveTask / assignTask / updateTask / archiveTask
//   → findTaskFile — resolve a task id to a file path under tasks/
//   → patchTaskContent — frontmatter-only editor for fields the CLI lacks
//   → showTask — `kandown show <id>` + frontmatter parse → TaskDetail
//   → initBoard — `kandown init` in the project checkout
//
// @exports
//   default plugin(bb), rpcContract, BoardSummary, BoardData, ColumnInfo,
//   TaskRow, TaskDetail, BoardConfig, columnHex
//
// @see https://github.com/vava-nessa/kandown — the kandown project this
//   plugin drives

import { execFile } from "node:child_process";
import { join } from "node:path";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** Normalize an absolute path for matching (trailing slashes, doubled seps). */
function normalizePath(path: string): string {
  return join(path).replace(/[\\/]+$/, "");
}

// ---------------------------------------------------------------------------
// Shared types (imported type-only by app.tsx)
// ---------------------------------------------------------------------------

export interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  tags: string[];
  archived: boolean;
}

export interface ColumnInfo {
  name: string;
  color: string | null;
  tasks: TaskRow[];
}

export interface BoardConfig {
  columns: string[];
  columnColors: Record<string, string>;
  defaultPriority: string;
}

export interface BoardSummary {
  projectId: string;
  projectName: string;
  path: string | null;
  hostId: string | null;
  isKandown: boolean;
  remote: boolean;
  error: string | null;
}

export interface BoardData {
  projectId: string;
  projectName: string;
  path: string;
  hostId: string;
  columns: ColumnInfo[];
  archived: TaskRow[];
  config: BoardConfig | null;
  cliVersion: string | null;
}

export interface TaskDetail {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  tags: string[];
  category: string;
  order: number | null;
  created: string | null;
  updated: string | null;
  body: string;
  raw: string;
}

/** Realtime channel name app.tsx listens on for board refreshes. */
export const BOARD_CHANGED = "kandown/board-changed";

// ---------------------------------------------------------------------------
// RPC contract — every method's input/output runs through these schemas
// ---------------------------------------------------------------------------

const taskRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: z.string(),
  assignee: z.string(),
  tags: z.array(z.string()),
  archived: z.boolean(),
});

export const rpcContract = defineRpcContract({
  kd_health: {
    input: z.null(),
    output: z.object({
      ok: z.boolean(),
      version: z.string().nullable(),
      binary: z.string(),
      error: z.string().nullable(),
    }),
  },
  kd_boards: {
    input: z.null(),
    output: z.object({ boards: z.array(z.unknown()) }),
  },
  kd_load: {
    input: z
      .object({
        projectId: z.string().min(1),
        includeArchived: z.boolean().default(false),
      })
      .strict(),
    output: z.unknown(),
  },
  kd_show: {
    input: z.object({ projectId: z.string().min(1), id: z.string().min(1) }).strict(),
    output: z.unknown(),
  },
  kd_create: {
    input: z
      .object({
        projectId: z.string().min(1),
        title: z.string().trim().min(1).max(500),
        status: z.string().optional(),
        priority: z.string().optional(),
        assignee: z.string().optional(),
        tags: z.array(z.string().trim().min(1)).optional(),
      })
      .strict(),
    output: taskRowSchema,
  },
  kd_move: {
    input: z.object({ projectId: z.string().min(1), id: z.string().min(1), status: z.string().min(1) }).strict(),
    output: taskRowSchema,
  },
  kd_assign: {
    input: z.object({ projectId: z.string().min(1), id: z.string().min(1), assignee: z.string() }).strict(),
    output: taskRowSchema,
  },
  kd_update: {
    input: z
      .object({
        projectId: z.string().min(1),
        id: z.string().min(1),
        title: z.string().optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
        assignee: z.string().optional(),
        tags: z.array(z.string()).optional(),
        category: z.string().optional(),
        body: z.string().optional(),
      })
      .strict(),
    output: taskRowSchema,
  },
  kd_init: {
    input: z.object({ projectId: z.string().min(1) }).strict(),
    output: z.object({ ok: z.boolean() }),
  },
  kd_daemon: {
    // 📖 Ensures the kandown daemon for a project is running, restarted with
    // the bb agent hook when needed, and returns the web app URL to embed.
    input: z.object({ projectId: z.string().min(1) }).strict(),
    output: z.object({ ok: z.boolean(), url: z.string(), error: z.string().nullable() }),
  },
  kd_launch: {
    // 📖 Starts a bb thread on the task in the project that matches the
    // kandown project, then opens it in bb (the frontend navigates).
    // providerId optionally picks the harness; otherwise the project default.
    input: z
      .object({ projectId: z.string().min(1), taskId: z.string().min(1), providerId: z.string().optional() })
      .strict(),
    output: z.object({ ok: z.boolean(), threadId: z.string(), title: z.string(), error: z.string().nullable() }),
  },
  kd_models: {
    // 📖 The harnesses (providers) available to spawn a task thread on.
    input: z.object({ projectId: z.string().min(1) }).strict(),
    output: z.object({
      providers: z.array(
        z.object({ providerId: z.string(), displayName: z.string(), available: z.boolean() }),
      ),
    }),
  },
});

/** Realtime channel the frontend listens on to auto-open a launched thread. */
export const LAUNCHED_CHANNEL = "kandown/launched";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Throwable, frontend-displayable error with a stable message. */
class KandownError extends Error {}

interface CliResult {
  stdout: string;
  stderr: string;
}

/**
 * 📖 Executes the kandown CLI once. args is passed as an argv array (no shell),
 * so titles and statuses with spaces are safe. cwd is the project checkout:
 * kandown walks up from there to find .kandown/. A missing binary and a
 * missing directory get distinct, actionable messages.
 */
async function runCli(
  binary: string,
  args: string[],
  cwd: string,
  options?: { env?: Record<string, string> },
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      {
        cwd,
        timeout: 30_000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        env: options?.env !== undefined ? { ...process.env, ...options.env } : undefined,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ stdout, stderr });
          return;
        }
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          reject(
            new KandownError(
              `The kandown CLI was not found (tried ${binary}). Install it with:\n  npm install -g kandown`,
            ),
          );
          return;
        }
        reject(new KandownError(String(stderr || error.message).trim() || `kandown ${args.join(" ")} failed`));
      },
    );
  });
}

/**
 * 📖 Kandown's own filename vocabulary, mirrored in the plugin's UI. Colors
 * named in .kandown/kandown.json board.columnColors are resolved here; unknown
 * names fall back to null (the UI then uses a neutral accent).
 */
const KANDOWN_COLORS: Record<string, string> = {
  amber: "#f59e0b",
  blue: "#3b82f6",
  cyan: "#06b6d4",
  emerald: "#10b981",
  fuchsia: "#d946ef",
  gray: "#6b7280",
  green: "#22c55e",
  indigo: "#6366f1",
  lime: "#84cc16",
  neutral: "#737373",
  orange: "#f97316",
  pink: "#ec4899",
  purple: "#a855f7",
  red: "#ef4444",
  rose: "#f43f5e",
  sky: "#0ea5e9",
  slate: "#64748b",
  teal: "#14b8a6",
  violet: "#8b5cf6",
  yellow: "#eab308",
};

/** Resolve a column's accent color: hex passthrough, else the named map. */
export function columnHex(name: string, fromConfig: string | undefined): string | null {
  if (typeof fromConfig === "string" && fromConfig.trim() !== "") {
    const candidate = fromConfig.trim();
    if (candidate.startsWith("#")) return candidate;
    const mapped = KANDOWN_COLORS[candidate.toLowerCase()];
    if (mapped) return mapped;
  }
  return KANDOWN_COLORS[name.toLowerCase()] ?? null;
}

/** Normalize a priority token to an uppercase priority or "" when empty. */
function normalizePriority(priority: string | undefined): string {
  if (priority === undefined) return "";
  const trimmed = priority.trim().toUpperCase();
  return /^P[0-3]$/.test(trimmed) ? trimmed : "";
}

/** Parse `kandown list --json` stdout into rows. Throws on malformed JSON. */
function parseRows(stdout: string): TaskRow[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      title: String(row.title ?? ""),
      status: String(row.status ?? ""),
      priority: normalizePriority(String(row.priority ?? "")),
      assignee: String(row.assignee ?? ""),
      tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      archived: row.archived === true,
    };
  });
}

/** Frontmatter value → YAML plain scalar, quoted only when YAML could misread it. */
function yamlScalar(value: string): string {
  const plainSafe = /^[A-Za-z0-9][A-Za-z0-9 _./'(),!?&%$@+-]*$/;
  if (value !== "" && plainSafe.test(value) && !value.includes(": ") && !value.includes(" #")) {
    return value;
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Set one frontmatter key to a YAML value. Replaces the existing `key:` line
 * or inserts one before the first ownership/timestamp field so the block stays
 * readable. Returns a new lines array.
 */
function setFrontmatterField(lines: string[], key: string, value: string): string[] {
  const keyRe = new RegExp(`^(${key}\\s*:\\s*).*$`);
  const index = lines.findIndex((line) => keyRe.test(line));
  if (index !== -1) {
    const next = lines.slice();
    next[index] = `${key}: ${value}`;
    return next;
  }
  const anchor = lines.findIndex((line) => /^(ownerType|created|order|updated):/.test(line));
  const at = anchor !== -1 ? anchor : lines.length;
  const next = lines.slice();
  next.splice(at, 0, `${key}: ${value}`);
  return next;
}

/**
 * 📖 The only file-level edit this plugin performs. Splits the file on the
 * `---` frontmatter delimiters, patches the fields the CLI has no command for
 * (title, priority, tags, category, optional body) and stamps `updated`. The
 * body is left byte-for-byte untouched when not provided. The closing newline
 * style of the original file is preserved so round-trips stay diff-clean.
 */
function patchTaskContent(
  content: string,
  patch: {
    title?: string;
    priority?: string;
    tags?: string[];
    category?: string;
    body?: string;
  },
): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n?)([\s\S]*)$/.exec(content);
  if (match === null) throw new KandownError("Task file has no frontmatter block; refusing to patch it");
  let lines = match[1].split(/\r?\n/);
  if (patch.title !== undefined) lines = setFrontmatterField(lines, "title", yamlScalar(patch.title));
  if (patch.priority !== undefined) lines = setFrontmatterField(lines, "priority", patch.priority === "" ? "" : patch.priority.toUpperCase());
  if (patch.category !== undefined) lines = setFrontmatterField(lines, "category", patch.category === "" ? "" : yamlScalar(patch.category));
  if (patch.tags !== undefined) {
    const tags = patch.tags.map((tag) => tag.trim()).filter(Boolean);
    lines = setFrontmatterField(lines, "tags", `[${tags.join(", ")}]`);
  }
  lines = setFrontmatterField(lines, "updated", new Date().toISOString());
  const body = patch.body !== undefined ? patch.body : match[3];
  const finalBody = patch.body !== undefined && !body.endsWith("\n") ? `${body}\n` : body;
  return `---\n${lines.join("\n")}\n---${match[2]}${finalBody}`;
}

// ---------------------------------------------------------------------------
// The factory
// ---------------------------------------------------------------------------

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  const settings = bb.settings.define({
    binary: {
      type: "string",
      label: "kandown executable",
      default: "",
      // 📖 Leave empty to auto-detect `kandown` from PATH. Set an absolute path
      // when kandown is installed somewhere non-standard.
    },
  });

  /** The kandown executable: the settings override, else `kandown` on PATH. */
  async function binaryFor(): Promise<string> {
    const { binary } = await settings.get();
    return typeof binary === "string" && binary.trim() !== "" ? binary.trim() : "kandown";
  }

  async function cliVersion(): Promise<string | null> {
    try {
      const { stdout } = await runCli(await binaryFor(), ["--version"], process.cwd());
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /** Every bb project's default local-path source (checkout directory). */
  async function listProjectSources(): Promise<
    Array<{ projectId: string; projectName: string; hostId: string; path: string }>
  > {
    const projects = await bb.sdk.projects.list({ includePersonal: true });
    const sources: Array<{ projectId: string; projectName: string; hostId: string; path: string }> = [];
    for (const project of projects) {
      const anyProject = project as {
        id?: string;
        name?: string;
        sources?: Array<{ hostId?: string; path?: string; isDefault?: boolean }>;
      };
      const id = anyProject.id;
      const name = anyProject.name;
      const found = anyProject.sources?.find((s) => s.isDefault === true) ?? anyProject.sources?.[0];
      if (id === undefined || name === undefined || found?.hostId === undefined || found?.path === undefined) {
        continue;
      }
      sources.push({ projectId: id, projectName: name, hostId: found.hostId, path: found.path });
    }
    return sources;
  }

  /** Resolve one project's checkout: { hostId, path } or a typed KandownError. */
  async function resolveSource(projectId: string): Promise<{ hostId: string; path: string }> {
    const sources = await listProjectSources();
    const source = sources.find((candidate) => candidate.projectId === projectId);
    if (source === undefined) throw new KandownError(`No bb project with id ${projectId}`);
    const { primaryHostId } = await bb.sdk.system.config();
    if (source.hostId !== primaryHostId) {
      throw new KandownError(
        `This project's checkout lives on a remote host (${source.hostId}). The kandown CLI runs on the bb server host, so this board can only be opened from a machine where the project directory is local.`,
      );
    }
    return { hostId: source.hostId, path: source.path };
  }

  /** .kandown/kandown.json → board config, or null when it does not exist. */
  async function readBoardConfig(hostId: string, path: string): Promise<BoardConfig | null> {
    try {
      const file = await bb.sdk.files.read({ hostId, path: join(path, ".kandown", "kandown.json") });
      const raw = JSON.parse(file.content) as { board?: unknown };
      const board = (raw?.board ?? {}) as {
        columns?: unknown;
        columnColors?: unknown;
        defaultPriority?: unknown;
      };
      const columns = Array.isArray(board.columns)
        ? board.columns.filter((c): c is string => typeof c === "string" && c.trim() !== "")
        : ["Backlog", "Todo", "Done"];
      const columnColors: Record<string, string> = {};
      if (board.columnColors !== undefined && typeof board.columnColors === "object") {
        for (const [key, value] of Object.entries(board.columnColors as Record<string, unknown>)) {
          if (typeof value === "string") columnColors[key] = value;
        }
      }
      const defaultPriority =
        typeof board.defaultPriority === "string" ? board.defaultPriority.toUpperCase() : "P3";
      return { columns, columnColors, defaultPriority };
    } catch {
      return null;
    }
  }

  /** A project is a kandown project when its checkout has .kandown/kandown.json. */
  async function isKandownProject(hostId: string, path: string): Promise<boolean> {
    return (await readBoardConfig(hostId, path)) !== null;
  }

  /** Group `kandown list --json` rows into the configured columns plus archived. */
  async function loadBoard(
    projectId: string,
    includeArchived: boolean,
  ): Promise<BoardData> {
    const { hostId, path } = await resolveSource(projectId);
    const config = await readBoardConfig(hostId, path);
    const binary = await binaryFor();
    const listArgs = ["list", "--json", ...(includeArchived ? ["--archived"] : [])];
    const { stdout } = await runCli(binary, listArgs, path);
    const rows = parseRows(stdout);

    const known = new Set((config?.columns ?? []).map((name) => name.toLowerCase()));
    const extra: string[] = [];
    for (const row of rows) {
      if (row.archived) continue;
      if (!known.has(row.status.toLowerCase()) && !extra.includes(row.status)) extra.push(row.status);
    }

    const columns: ColumnInfo[] = (config?.columns ?? []).map((name) => ({
      name,
      color: columnHex(name, config?.columnColors?.[name.toLowerCase()]),
      tasks: [],
    }));
    for (const name of extra) columns.push({ name, color: columnHex(name, undefined), tasks: [] });

    const byStatus = new Map<string, TaskRow[]>();
    for (const row of rows) {
      if (row.archived) continue;
      const bucket = byStatus.get(row.status) ?? [];
      bucket.push(row);
      byStatus.set(row.status, bucket);
    }
    for (const column of columns) {
      column.tasks = byStatus.get(column.name) ?? [];
    }

    return {
      projectId,
      projectName: "", // filled by the boards listing; kept for symmetry
      hostId,
      path,
      columns,
      archived: rows.filter((row) => row.archived),
      config,
      cliVersion: await cliVersion(),
    };
  }

  /** `kandown show <id>` + frontmatter parse → the editor's task detail. */
  async function showTask(projectId: string, id: string): Promise<TaskDetail> {
    const { path } = await resolveSource(projectId);
    const { stdout } = await runCli(await binaryFor(), ["show", id], path);
    const detail = parseTaskFileText(stdout, id);
    return detail;
  }

  /** Split raw task file content into frontmatter fields + body. */
  function parseTaskFileText(content: string, id: string): TaskDetail {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
    const frontmatter: Record<string, string> = {};
    let body = content;
    if (match !== null) {
      body = match[2];
      for (const line of match[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line.trim());
        if (kv === null) continue;
        const value = kv[2].trim();
        if (value.startsWith("[") && value.endsWith("]")) {
          frontmatter[kv[1]] = value.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean).join("\u0000");
          continue;
        }
        frontmatter[kv[1]] = value.replace(/^"(.*)"$/, "$1");
      }
    }
    const tags = (frontmatter.tags ?? "").split("\u0000").filter(Boolean);
    const order = Number.isNaN(Number(frontmatter.order)) ? null : Number(frontmatter.order);
    return {
      id,
      title: frontmatter.title ?? id,
      status: frontmatter.status ?? "",
      priority: normalizePriority(frontmatter.priority),
      assignee: frontmatter.assignee ?? "",
      tags,
      category: frontmatter.category ?? "",
      order,
      created: frontmatter.created ?? null,
      updated: frontmatter.updated ?? null,
      body: body.replace(/^\r?\n/, ""),
      raw: content,
    };
  }

  /** Find the tasks/ file path for an id (active or archived, custom ids too). */
  async function findTaskFile(hostId: string, path: string, id: string): Promise<string | null> {
    const tasksRoot = join(path, "tasks");
    const listing = await bb.sdk.files.listPaths({
      hostId,
      path: tasksRoot,
      includeFiles: true,
      includeDirectories: false,
    });
    const wanted = `${id}_`;
    for (const entry of listing.paths) {
      if (entry.kind !== "file") continue;
      const name = entry.path.split("/").pop() ?? "";
      if (name.startsWith(wanted) || name === `${id}.md`) return join(tasksRoot, entry.path);
    }
    return null;
  }

  /** Post-mutation: refresh one row from the CLI list (authoritative). */
  async function refreshRow(projectId: string, id: string): Promise<TaskRow> {
    const { path } = await resolveSource(projectId);
    const { stdout } = await runCli(await binaryFor(), ["list", "--json", "--archived"], path);
    const row = parseRows(stdout).find((candidate) => candidate.id === id);
    if (row === undefined) throw new KandownError(`Task ${id} disappeared after the operation`);
    return row;
  }

  function announce(projectId: string): void {
    bb.realtime.publish(BOARD_CHANGED, { projectId });
  }

  async function createTask(input: {
    projectId: string;
    title: string;
    status?: string;
    priority?: string;
    assignee?: string;
    tags?: string[];
  }): Promise<TaskRow> {
    const { path } = await resolveSource(input.projectId);
    const args = ["create", input.title];
    if (input.status !== undefined && input.status !== "") args.push("--to", input.status);
    const priority = normalizePriority(input.priority);
    if (priority !== "") args.push("-p", priority);
    if (input.assignee !== undefined && input.assignee.trim() !== "") args.push("-a", input.assignee.trim());
    for (const tag of input.tags ?? []) {
      if (tag.trim() !== "") args.push("-t", tag.trim());
    }
    args.push("--json");
    const { stdout } = await runCli(await binaryFor(), args, path);
    const fm = JSON.parse(stdout.trim()) as Record<string, unknown>;
    announce(input.projectId);
    return {
      id: String(fm.id ?? ""),
      title: String(fm.title ?? input.title),
      status: String(fm.status ?? input.status ?? ""),
      priority: normalizePriority(String(fm.priority ?? "")),
      assignee: String(fm.assignee ?? ""),
      tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
      archived: false,
    };
  }

  async function moveTask(projectId: string, id: string, status: string): Promise<TaskRow> {
    const { path } = await resolveSource(projectId);
    await runCli(await binaryFor(), ["move", id, status], path);
    announce(projectId);
    return refreshRow(projectId, id);
  }

  async function assignTask(projectId: string, id: string, assignee: string): Promise<TaskRow> {
    const { path } = await resolveSource(projectId);
    const args = assignee.trim() === "" ? ["assign", id] : ["assign", id, assignee.trim()];
    await runCli(await binaryFor(), args, path);
    announce(projectId);
    return refreshRow(projectId, id);
  }

  /**
   * Hybrid update: status and assignee go through the CLI (validated against
   * columns, archived support, agent aliases); the fields the CLI has no
   * command for are patched into the file directly, then the file is reslugged
   * so its descriptive name follows a title/category change.
   */
  async function updateTask(input: {
    projectId: string;
    id: string;
    title?: string;
    status?: string;
    priority?: string;
    assignee?: string;
    tags?: string[];
    category?: string;
    body?: string;
  }): Promise<TaskRow> {
    const { hostId, path } = await resolveSource(input.projectId);
    const binary = await binaryFor();

    if (input.status !== undefined && input.status !== "") {
      await runCli(binary, ["move", input.id, input.status], path);
    }
    if (input.assignee !== undefined) {
      const args = input.assignee.trim() === "" ? ["assign", input.id] : ["assign", input.id, input.assignee.trim()];
      await runCli(binary, args, path);
    }

    const needsPatch =
      input.title !== undefined ||
      input.priority !== undefined ||
      input.tags !== undefined ||
      input.category !== undefined ||
      input.body !== undefined;
    if (needsPatch) {
      const filePath = await findTaskFile(hostId, path, input.id);
      if (filePath === null) throw new KandownError(`No task file for ${input.id} under tasks/`);
      const file = await bb.sdk.files.read({ hostId, path: filePath, rootPath: path });
      const patched = patchTaskContent(file.content, {
        title: input.title,
        priority: input.priority,
        tags: input.tags,
        category: input.category,
        body: input.body,
      });
      const write = await bb.sdk.files.write({
        hostId,
        path: filePath,
        rootPath: path,
        content: patched,
        expectedSha256: file.sha256,
      });
      const outcome = (write as { outcome?: string }).outcome;
      if (outcome !== "written") {
        throw new KandownError(
          outcome === "conflict"
            ? `Task file ${filePath} changed on disk since it was read. Refresh the board and retry.`
            : `Could not write ${filePath} (${outcome ?? "unknown"}).`,
        );
      }
      // 📖 The filename is frozen at creation; reslug is the sanctioned rename.
      if (input.title !== undefined || input.category !== undefined) {
        await runCli(binary, ["reslug", input.id], path);
      }
    }

    announce(input.projectId);
    return refreshRow(input.projectId, input.id);
  }

  async function initBoard(projectId: string): Promise<boolean> {
    const { path } = await resolveSource(projectId);
    await runCli(await binaryFor(), ["init"], path);
    announce(projectId);
    return true;
  }

  /** The plugin's own HTTP token, carried in the hook URL for auth. */
  async function pluginToken(): Promise<string> {
    const result = (await bb.sdk.plugins.token({ pluginId: "kandown" })) as { token?: string };
    return result.token ?? "";
  }

  /** The daemon-facing hook URL: when kandown forwards a task here, a bb
   *  thread is spawned in the bb project that matches the kandown directory. */
  async function hookUrl(): Promise<string> {
    const token = await pluginToken();
    return `${bb.server.loopbackBaseUrl}/api/v1/plugins/kandown/http/hook?token=${encodeURIComponent(token)}`;
  }

  /** Read .kandown/daemon.json (pid/port/url) for a project on a host. */
  async function readDaemonMetadata(
    hostId: string,
    path: string,
  ): Promise<{ port: number; url: string; pid: number } | null> {
    try {
      const file = await bb.sdk.files.read({ hostId, path: join(path, ".kandown", "daemon.json") });
      const data = JSON.parse(file.content) as { port?: unknown; url?: unknown; pid?: unknown };
      if (typeof data.port === "number" && typeof data.url === "string" && typeof data.pid === "number") {
        return { port: data.port, url: data.url, pid: data.pid };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Probe a daemon's /api/daemon; null when unreachable. */
  async function probeDaemon(url: string): Promise<{ hookEnabled: boolean } | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1800);
      try {
        const response = await fetch(`${url}/api/daemon`, { signal: controller.signal });
        if (!response.ok) return null;
        const data = (await response.json()) as { agentHook?: { enabled?: boolean } | null };
        return { hookEnabled: data.agentHook?.enabled === true };
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }

  /**
   * 📖 Ensures the project's kandown daemon is up and hooked to bb. A daemon
   * already running without KANDOWN_AGENT_HOOK_URL (for example one started
   * from the terminal before this plugin existed) is restarted so the embedded
   * app gains the "Send to Agent · bb" action. Returns the web app URL.
   */
  async function ensureDaemon(projectId: string): Promise<{ url: string; ok: boolean; error: string | null }> {
    const { hostId, path } = await resolveSource(projectId);
    const binary = await binaryFor();
    const current = await readDaemonMetadata(hostId, path);
    if (current !== null) {
      const info = await probeDaemon(current.url);
      if (info !== null) {
        if (info.hookEnabled) return { url: current.url, ok: true, error: null };
        await runCli(binary, ["daemon", "stop"], path);
      }
    }
    await runCli(binary, ["daemon", "start"], path, {
      env: { KANDOWN_AGENT_HOOK_URL: await hookUrl(), KANDOWN_AGENT_HOOK_LABEL: "bb" },
    });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const meta = await readDaemonMetadata(hostId, path);
      if (meta !== null) {
        const info = await probeDaemon(meta.url);
        if (info !== null) return { url: meta.url, ok: true, error: null };
      }
      await sleep(500);
    }
    return {
      url: "",
      ok: false,
      error: "The kandown daemon did not come up. Run `bb kandown daemon status` in the project and check the CLI.",
    };
  }

  /** The prompt bb agents get when a kanban task is started in bb. */
  function buildTaskPrompt(detail: TaskDetail): string {
    const facts = [
      `Work on this kandown task in the current project.`,
      ``, 
      `Task: ${detail.id} — ${detail.title}`,
      detail.status !== "" ? `Status: ${detail.status}` : null,
      detail.priority !== "" ? `Priority: ${detail.priority}` : null,
      detail.category !== "" ? `Category: ${detail.category}` : null,
      detail.tags.length > 0 ? `Tags: ${detail.tags.join(", ")}` : null,
      detail.assignee !== "" ? `Assignee: ${detail.assignee}` : null,
      ``, 
      `Full task file (the source of truth):`,
      ``, 
      detail.raw,
      ``, 
      `Working rules:`,
      `- The task file under tasks/ is the single source of truth. Keep its frontmatter and body updated as you make progress:`,
      `    bb kandown update ${detail.id} --status ... -p ... -t ... --body "..."`,
      `- Move the task through the board as you work: bb kandown move ${detail.id} <NextColumn>`,
      `- When finished, move it forward with: bb kandown move ${detail.id} Done`,
      `- End by appending a short summary of what was done and any findings to the task body.`,
    ];
    return facts.filter((line): line is string => line !== null).join("\n");
  }

  /** Spawn a visible bb thread on a kandown task and broadcast its id. */
  async function launchTask(
    projectId: string,
    taskId: string,
    providerId?: string,
  ): Promise<{ threadId: string; title: string }> {
    const detail = await showTask(projectId, taskId);
    const thread = await bb.sdk.threads.spawn({
      projectId,
      title: `${taskId}: ${detail.title}`,
      prompt: buildTaskPrompt(detail),
      environment: { type: "project-default" },
      visibility: "visible",
      providerId: providerId !== undefined && providerId !== "" ? providerId : undefined,
    });
    const threadId = (thread as { id?: string }).id ?? (thread as unknown as { threadId?: string }).threadId ?? "";
    if (threadId === "") throw new KandownError("bb did not return a thread id");
    bb.realtime.publish(LAUNCHED_CHANNEL, { threadId });
    return { threadId, title: detail.title };
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------------------
  // Boards listing with per-project kandown detection
  // -------------------------------------------------------------------------

  async function boardsSummary(): Promise<BoardSummary[]> {
    const [sources, config] = await Promise.all([
      listProjectSources(),
      bb.sdk.system.config(),
    ]);
    const primaryHostId = config.primaryHostId;
    const summaries: BoardSummary[] = [];
    for (const source of sources) {
      const remote = source.hostId !== primaryHostId;
      let isKandown = false;
      let error: string | null = null;
      try {
        isKandown = await isKandownProject(source.hostId, source.path);
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      }
      if (remote) {
        error = "Board lives on a remote host; the CLI runs on the bb server host.";
      }
      summaries.push({
        projectId: source.projectId,
        projectName: source.projectName,
        path: remote ? null : source.path,
        hostId: source.hostId,
        isKandown,
        remote,
        error,
      });
    }
    return summaries;
  }

  bb.rpc.register(rpcContract, {
    kd_health: async () => {
      const binary = await binaryFor();
      const version = await cliVersion();
      return {
        ok: version !== null,
        version,
        binary,
        error: version === null ? "kandown CLI not found. Install it with: npm install -g kandown" : null,
      };
    },
    kd_boards: async () => ({ boards: await boardsSummary() }),
    kd_load: async ({ projectId, includeArchived }) => {
      const board = await loadBoard(projectId, includeArchived);
      const summaries = await boardsSummary();
      const summary = summaries.find((candidate) => candidate.projectId === projectId);
      board.projectName = summary?.projectName ?? projectId;
      return board;
    },
    kd_show: ({ projectId, id }) => showTask(projectId, id),
    kd_create: (input) => createTask(input),
    kd_move: ({ projectId, id, status }) => moveTask(projectId, id, status),
    kd_assign: ({ projectId, id, assignee }) => assignTask(projectId, id, assignee),
    kd_update: (input) => updateTask(input),
    kd_init: async ({ projectId }) => ({ ok: await initBoard(projectId) }),
    kd_daemon: async ({ projectId }) => ensureDaemon(projectId),
    kd_models: async ({ projectId }) => {
      const { hostId } = await resolveSource(projectId);
      const providers = await bb.sdk.providers.list({ hostId });
      return {
        providers: providers.map((provider) => ({
          providerId: provider.id,
          displayName: provider.displayName,
          available: provider.available,
        })),
      };
    },
    kd_launch: async ({ projectId, taskId, providerId }) => {
      try {
        const launched = await launchTask(projectId, taskId, providerId);
        return { ok: true, threadId: launched.threadId, title: launched.title, error: null };
      } catch (cause) {
        return { ok: false, threadId: "", title: "", error: cause instanceof Error ? cause.message : String(cause) };
      }
    },
  });

  // 📖 The daemon hook endpoint. kandown's "Send to Agent" action POSTs the
  // full task here (KANDOWN_AGENT_HOOK_URL); we turn it into a bb thread in
  // the bb project that matches the kandown directory and publish the thread
  // id so the open bb client navigates to it. auth: "token" accepts the
  // ?token= query the hook URL already carries.
  bb.http.route(
    "POST",
    "/hook",
    async (context) => {
      const body = (await context.req.json().catch(() => null)) as {
        id?: unknown;
        content?: unknown;
        kandownDir?: unknown;
      } | null;
      if (body === null || typeof body.id !== "string" || typeof body.content !== "string") {
        return Response.json({ ok: false, error: "Expected { id, content }." }, { status: 400 });
      }
      if (typeof body.kandownDir !== "string") {
        return Response.json({ ok: false, error: "Expected kandownDir." }, { status: 400 });
      }
      const summaries = await boardsSummary();
      const normalized = normalizePath(body.kandownDir);
      // The daemon reports the .kandown directory; bb projects carry the
      // project root. Accept both, plus the exact path.
      const match = summaries.find((candidate) => {
        if (candidate.remote || candidate.path === null) return false;
        const projectPath = normalizePath(candidate.path);
        return projectPath === normalized || join(projectPath, ".kandown") === normalized;
      });
      if (match === undefined) {
        return Response.json(
          { ok: false, error: `No bb project matches the kandown directory ${body.kandownDir}. Add it as a bb project first.` },
          { status: 404 },
        );
      }
      const launched = await launchTask(match.projectId, body.id);
      return Response.json({ ok: true, threadId: launched.threadId, title: launched.title });
    },
    { auth: "token" },
  );

  // -------------------------------------------------------------------------
  // `bb kandown` — the agent-facing CLI (agents discover it via the
  // generated plugin-commands skill)
  // -------------------------------------------------------------------------

  const usage = [
    "Usage:",
    "  bb kandown boards",
    "  bb kandown list [--project <projectId>] [--json]",
    "  bb kandown show <task-id> [--project <projectId>]",
    "  bb kandown create \"<title>\" [--project <projectId>] [--to <status>] [-p P1-P3] [-a <assignee>] [-t <tag>...]",
    "  bb kandown move <task-id> <status|archived> [--project <projectId>]",
    "  bb kandown assign <task-id> [<assignee>] [--project <projectId>]",
    "  bb kandown update <task-id> [--title \"...\"] [-p P1-P3] [-t <tag>...] [--category <cat>] [--body \"...\"] [--project <projectId>]",
    "  bb kandown launch <task-id> [--project <projectId>]  (start as a bb thread)",
    "  bb kandown daemon [status|start|stop] [--project <projectId>]",
    "  bb kandown init [--project <projectId>]",
    "",
    "Boards are bb projects whose checkout is a kandown project (tasks/ + .kandown/).",
  ].join("\n");

  bb.cli.register({
    name: "kandown",
    summary: "Manage kandown boards and tasks from inside bb",
    commands: [
      { name: "boards", summary: "List bb projects that are kandown boards", usage: "bb kandown boards" },
      { name: "list", summary: "List tasks on a board", usage: "bb kandown list [--project <id>]" },
      { name: "show", summary: "Show a task's file content", usage: "bb kandown show <task-id> [--project <id>]" },
      { name: "create", summary: "Create a task", usage: 'bb kandown create "<title>" [--project <id>] [--to status] [-p P1] [-a name] [-t tag]' },
      { name: "move", summary: "Move a task between columns (or to archived)", usage: "bb kandown move <task-id> <status|archived> [--project <id>]" },
      { name: "assign", summary: "Assign (or unassign) a task", usage: "bb kandown assign <task-id> [name] [--project <id>]" },
      { name: "update", summary: "Edit a task's title, priority, tags, category or body", usage: 'bb kandown update <task-id> [--title "..."] [-p P1] [-t tag] [--category X] [--body "..."] [--project <id>]' },
      { name: "launch", summary: "Start a task as a bb thread in the matching bb project", usage: "bb kandown launch <task-id> [--project <id>]" },
      { name: "daemon", summary: "Manage the kandown daemon that powers the embedded app", usage: "bb kandown daemon [status|start|stop] [--project <id>]" },
      { name: "init", summary: "Initialize kandown in a project checkout", usage: "bb kandown init [--project <id>]" },
    ],
    async run(argv) {
      const json = argv.includes("--json");
      const flag = (name: string): string | null => {
        const index = argv.indexOf(`--${name}`);
        return index !== -1 && argv[index + 1] !== undefined ? argv[index + 1] : null;
      };
      const projectFlag = flag("project");
      try {
        if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help") {
          return { exitCode: 0, stdout: usage };
        }
        const command = argv.filter((arg) => arg !== "--json")[0];
        // Strip known flag pairs so they never leak into positionals (e.g. the
        // `move` status or the `create` title). --project is read separately
        // via `flag`, every other flag stays in the token stream for the
        // command handlers that understand it.
        const positional = (() => {
          const cleaned = argv.filter((arg) => arg !== "--json");
          const tokens: string[] = [];
          for (let index = 0; index < cleaned.length; index += 1) {
            const token = cleaned[index];
            if (token === "--project" && cleaned[index + 1] !== undefined) {
              index += 1;
              continue;
            }
            tokens.push(token);
          }
          return tokens.slice(1);
        })();
        const pickProject = async (): Promise<string> => {
          if (projectFlag !== null) return projectFlag;
          const summaries = await boardsSummary();
          const kandown = summaries.find((s) => s.isKandown && !s.remote && s.error === null);
          if (kandown === undefined) {
            throw new KandownError(
              summaries.length === 0
                ? "No bb projects found. Add a project, then try again."
                : "No kandown board found. Run `bb kandown boards` to see what exists, then pick one with `--project <id>`.",
            );
          }
          return kandown.projectId;
        };
        // Split commander-style flags out of a create's word tokens: everything
        // that is not a known flag is part of the title.
        const parseCreateTokens = (tokens: string[]) => {
          const out: { title: string[]; status?: string; priority?: string; assignee?: string; tags: string[] } = {
            title: [],
            tags: [],
          };
          for (let index = 0; index < tokens.length; index += 1) {
            const token = tokens[index];
            const read = (): string | undefined => tokens[index + 1];
            if (token === "-t" || token === "--tag") {
              const value = read();
              if (value !== undefined) out.tags.push(value);
              index += 1;
            } else if (token === "-p" || token === "--priority") {
              out.priority = read();
              index += 1;
            } else if (token === "-a" || token === "--assignee") {
              out.assignee = read();
              index += 1;
            } else if (token === "--to" || token === "--status") {
              out.status = read();
              index += 1;
            } else {
              out.title.push(token);
            }
          }
          return out;
        };
        switch (command) {
          case "boards": {
            const summaries = await boardsSummary();
            const lines = summaries.map((s) => {
              const status = s.remote ? "remote" : s.isKandown ? "kandown" : "no kandown";
              return `${s.projectId}\t${s.projectName}\t${status}${s.error ? `\t${s.error}` : ""}`;
            });
            return { exitCode: 0, stdout: lines.join("\n") || "No bb projects." };
          }
          case "list": {
            const projectId = await pickProject();
            const includeArchivedFlag = argv.includes("--archived");
            const board = await loadBoard(projectId, includeArchivedFlag);
            const summaries = await boardsSummary();
            board.projectName = summaries.find((s) => s.projectId === projectId)?.projectName ?? projectId;
            if (json) return { exitCode: 0, stdout: JSON.stringify(board, null, 2) };
            const lines: string[] = [`Board: ${board.projectName} (${board.cliVersion ?? "kandown"})`];
            for (const column of board.columns) {
              lines.push(`\n${column.name} (${column.tasks.length})`);
              for (const task of column.tasks) {
                const priority = task.priority || "P2";
                const assignee = task.assignee ? ` @${task.assignee}` : "";
                lines.push(`  ${task.id} [${priority}] ${task.title}${assignee}`);
              }
            }
            if (includeArchivedFlag && board.archived.length > 0) {
              lines.push(`\nArchived (${board.archived.length})`);
              for (const task of board.archived) {
                const priority = task.priority || "P2";
                const assignee = task.assignee ? ` @${task.assignee}` : "";
                lines.push(`  ${task.id} [${priority}] ${task.title}${assignee}`);
              }
            }
            return { exitCode: 0, stdout: lines.join("\n") };
          }
          case "show": {
            const id = positional[0];
            if (id === undefined) return { exitCode: 1, stderr: usage };
            const projectId = await pickProject();
            const detail = await showTask(projectId, id);
            return { exitCode: 0, stdout: json ? JSON.stringify(detail) : detail.raw };
          }
          case "create": {
            const tokens = parseCreateTokens(positional);
            const title = tokens.title.join(" ").trim();
            if (title === "") return { exitCode: 1, stderr: usage };
            const projectId = await pickProject();
            const row = await createTask({
              projectId,
              title,
              status: tokens.status,
              priority: tokens.priority,
              assignee: tokens.assignee,
              tags: tokens.tags,
            });
            return {
              exitCode: 0,
              stdout: json ? JSON.stringify(row) : `Created ${row.id} → ${row.status}`,
            };
          }
          case "move": {
            const id = positional[0];
            const status = positional.slice(1).join(" ");
            if (id === undefined || status === "") return { exitCode: 1, stderr: usage };
            const projectId = await pickProject();
            const row = await moveTask(projectId, id, status);
            return { exitCode: 0, stdout: json ? JSON.stringify(row) : `Moved ${row.id} → ${row.status}` };
          }
          case "assign": {
            const id = positional[0];
            const assignee = positional.slice(1).join(" ").trim();
            if (id === undefined) return { exitCode: 1, stderr: usage };
            const projectId = await pickProject();
            const row = await assignTask(projectId, id, assignee);
            return { exitCode: 0, stdout: json ? JSON.stringify(row) : `Assigned ${row.id} → ${row.assignee || "(unassigned)"}` };
          }
          case "update": {
            const id = positional[0];
            if (id === undefined) return { exitCode: 1, stderr: usage };
            const projectId = await pickProject();
            // Short aliases (-p/-t) are not reachable through flag(), so scan
            // both the short and long spellings directly.
            const firstValue = (...names: string[]): string | null => {
              for (const name of names) {
                const index = argv.indexOf(name);
                if (index !== -1 && argv[index + 1] !== undefined) return argv[index + 1];
              }
              return null;
            };
            const tags: string[] = [];
            for (let index = 0; index < argv.length; index += 1) {
              if ((argv[index] === "-t" || argv[index] === "--tag") && argv[index + 1] !== undefined) {
                tags.push(argv[index + 1]);
              }
            }
            const row = await updateTask({
              projectId,
              id,
              title: firstValue("--title") ?? undefined,
              priority: firstValue("-p", "--priority") ?? undefined,
              category: firstValue("--category") ?? undefined,
              body: firstValue("--body") ?? undefined,
              tags: tags.length > 0 ? tags : undefined,
            });
            return { exitCode: 0, stdout: json ? JSON.stringify(row) : `Updated ${row.id} → ${row.title}` };
          }
          case "launch": {
            const id = positional[0];
            if (id === undefined) return { exitCode: 1, stderr: usage };
            const projectId = await pickProject();
            const launched = await launchTask(projectId, id, flag("provider") ?? undefined);
            return {
              exitCode: 0,
              stdout: json
                ? JSON.stringify(launched)
                : `Started thread ${launched.threadId} on ${id} (${launched.title}) — open it in bb.`,
            };
          }
          case "daemon": {
            const projectId = await pickProject();
            const sub = positional[0] ?? "start";
            if (sub === "stop") {
              const { path } = await resolveSource(projectId);
              await runCli(await binaryFor(), ["daemon", "stop"], path);
              return { exitCode: 0, stdout: `Stopped the kandown daemon for ${projectId}` };
            }
            const daemon = await (sub === "start" ? ensureDaemon(projectId) : (async () => {
              const { hostId, path } = await resolveSource(projectId);
              const meta = await readDaemonMetadata(hostId, path);
              if (meta === null) return { url: "", ok: false, error: "Daemon not running." };
              const info = await probeDaemon(meta.url);
              return info === null
                ? { url: meta.url, ok: false, error: "Metadata exists but the daemon is unreachable." }
                : { url: meta.url, ok: true, error: null };
            })());
            return {
              exitCode: daemon.ok ? 0 : 1,
              stdout: json ? JSON.stringify(daemon) : daemon.ok ? `Daemon running at ${daemon.url}` : daemon.error ?? "Daemon not running.",
              stderr: daemon.ok ? undefined : (daemon.error ?? undefined),
            };
          }
          case "init": {
            const projectId = await pickProject();
            await initBoard(projectId);
            return { exitCode: 0, stdout: `Initialized kandown in ${projectId}` };
          }
        }
        return { exitCode: 1, stderr: usage };
      } catch (cause) {
        return {
          exitCode: 1,
          stderr: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  });

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}