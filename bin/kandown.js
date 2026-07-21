#!/usr/bin/env node

// src/cli/cli.ts
import { existsSync as existsSync5, readFileSync as readFileSync5, copyFileSync } from "fs";
import { join as join5, resolve as resolve2, basename } from "path";
import { spawn as spawn3 } from "child_process";

// src/cli/lib/updater.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync } from "fs";
import { join, resolve } from "path";
import { spawn, execSync } from "child_process";
import { homedir } from "os";

// src/lib/version.ts
var KANDOWN_VERSION = "0.32.1";

// src/cli/lib/updater.ts
var PKG_ROOT = resolve(import.meta.url ? new URL("../../..", import.meta.url).pathname : process.cwd());
var UPDATE_CHECK_CACHE = join(PKG_ROOT, ".update-check.json");
var UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1e3;
function getCurrentVersion() {
  try {
    const pkgPath = join(PKG_ROOT, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (pkg.version) return pkg.version;
    }
  } catch {
  }
  return KANDOWN_VERSION || "0.32.0";
}
function semverGt(a, b) {
  const parse = (v) => {
    const [core, ...pre] = String(v).replace(/^v/, "").split("-");
    return { nums: core.split(".").map((n) => Number(n) || 0), pre: pre.length > 0 };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((pa.nums[i] || 0) > (pb.nums[i] || 0)) return 1;
    if ((pa.nums[i] || 0) < (pb.nums[i] || 0)) return -1;
  }
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && !pb.pre) return -1;
  return 0;
}
function resolveKandownBin() {
  try {
    const whichBin = String(execSync("which kandown 2>/dev/null || command -v kandown 2>/dev/null", {
      timeout: 3e3,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    })).trim();
    if (whichBin && existsSync(whichBin)) return whichBin;
  } catch {
  }
  const localBin = join(homedir(), ".local", "bin", "kandown");
  if (existsSync(localBin)) return localBin;
  try {
    const npmBin = String(execSync("npm config get prefix 2>/dev/null", {
      timeout: 3e3,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    })).trim();
    if (existsSync(join(npmBin, "bin", "kandown"))) return join(npmBin, "bin", "kandown");
    if (existsSync(join(npmBin, "kandown"))) return join(npmBin, "kandown");
  } catch {
  }
  try {
    const pnpmBin = String(execSync("pnpm config get prefix 2>/dev/null", {
      timeout: 3e3,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    })).trim();
    if (existsSync(join(pnpmBin, "bin", "kandown"))) return join(pnpmBin, "bin", "kandown");
    if (existsSync(join(pnpmBin, "kandown"))) return join(pnpmBin, "kandown");
  } catch {
  }
  return null;
}
async function readInstalledKandownVersion(targetVersion) {
  const localVersion = getCurrentVersion();
  if (localVersion && semverGt(localVersion, targetVersion) >= 0) return localVersion;
  const bin = resolveKandownBin();
  if (!bin) return localVersion;
  return await new Promise((resolveVersion) => {
    const child = spawn(bin, ["--version"], {
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, KANDOWN_NO_UPDATE: "1" },
      detached: false
    });
    let stdout = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", () => {
    });
    child.on("error", () => resolveVersion(localVersion));
    child.on("close", (code) => {
      if (code !== 0) return resolveVersion(localVersion);
      const match = stdout.trim().match(/v?(\d+\.\d+\.\d+(?:-[\w.-]+)?)/);
      resolveVersion(match ? match[1] : localVersion);
    });
  });
}
function updateCheckedRecently() {
  try {
    const raw = JSON.parse(readFileSync(UPDATE_CHECK_CACHE, "utf8"));
    return Number.isFinite(raw?.lastCheck) && Date.now() - raw.lastCheck < UPDATE_CHECK_INTERVAL_MS;
  } catch {
    return false;
  }
}
function rememberUpdateCheck() {
  try {
    writeFileSync(UPDATE_CHECK_CACHE, JSON.stringify({ lastCheck: Date.now() }), "utf8");
  } catch {
  }
}
async function performGlobalPackageUpdate(packageSpec) {
  const cleanEnv = { ...process.env };
  for (const k of Object.keys(cleanEnv)) {
    if (k.startsWith("npm_config_") || k.startsWith("npm_") || k === "INIT_CWD") {
      delete cleanEnv[k];
    }
  }
  const tryPkgCmd = (cmd, args) => {
    return new Promise((res) => {
      const child = spawn(cmd, args, {
        timeout: 6e4,
        stdio: ["pipe", "pipe", "pipe"],
        env: cleanEnv,
        detached: false
      });
      child.stderr.on("data", () => {
      });
      child.stdout.on("data", () => {
      });
      child.on("error", () => res(false));
      child.on("close", (code) => res(code === 0));
    });
  };
  const currentBin = resolveKandownBin() || "";
  const isPnpmInstall = currentBin.includes("pnpm");
  if (isPnpmInstall) {
    if (await tryPkgCmd("pnpm", ["add", "-g", packageSpec])) return true;
    if (await tryPkgCmd("npm", ["install", "-g", packageSpec, "--force"])) return true;
  } else {
    if (await tryPkgCmd("npm", ["install", "-g", packageSpec, "--force"])) return true;
    if (await tryPkgCmd("pnpm", ["add", "-g", packageSpec])) return true;
  }
  if (await tryPkgCmd("yarn", ["global", "add", packageSpec])) return true;
  return await tryPkgCmd("bun", ["add", "-g", packageSpec]);
}
async function checkForUpdate(argv = process.argv) {
  if (existsSync(join(PKG_ROOT, "src")) && !process.env.KANDOWN_TEST_UPDATE) return;
  if (process.env.KANDOWN_NO_UPDATE === "1") return;
  if (!process.stdout.isTTY) return;
  if (updateCheckedRecently()) return;
  const current = getCurrentVersion();
  if (!current) return;
  const lockFile = join(PKG_ROOT, ".update.lock");
  const now = Date.now();
  try {
    if (existsSync(lockFile)) {
      const lockAge = now - statSync(lockFile).mtimeMs;
      if (lockAge < 6e4) return;
      unlinkSync(lockFile);
    }
  } catch {
  }
  const latest = await new Promise((resolve3) => {
    const child2 = spawn("npm", ["view", "kandown", "version"], {
      timeout: 6e3,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      detached: false
    });
    let stdout = "";
    child2.stdout.on("data", (d) => {
      stdout += d;
    });
    child2.stderr.on("data", () => {
    });
    child2.on("error", () => resolve3(null));
    child2.on("close", (code) => {
      if (code !== 0) return resolve3(null);
      const v = stdout.trim().replace(/^"|"$/g, "");
      resolve3(v || null);
    });
  });
  if (!latest) return;
  if (semverGt(current, latest) >= 0) {
    rememberUpdateCheck();
    return;
  }
  console.log(`\u26A1 Update available: kandown ${current} \u2192 ${latest}`);
  try {
    writeFileSync(lockFile, `${process.pid}
${now}`, "utf8");
  } catch {
  }
  const updateOk = await performGlobalPackageUpdate(`kandown@${latest}`);
  try {
    if (existsSync(lockFile)) unlinkSync(lockFile);
  } catch {
  }
  if (!updateOk) {
    console.log(`\u2717 Auto-update failed \u2014 continuing with current version`);
    return;
  }
  const postVersion = await readInstalledKandownVersion(latest);
  if (!postVersion || semverGt(postVersion, latest) < 0) return;
  rememberUpdateCheck();
  console.log(`\u2713 Updated to v${postVersion} \u2014 restarting\u2026`);
  const bin = resolveKandownBin();
  const childArgs = ["--no-update-check", ...argv.slice(2)];
  const child = spawn(bin || process.argv[0], bin ? childArgs : [process.argv[1], ...childArgs], {
    detached: true,
    stdio: "inherit",
    env: { ...process.env }
  });
  child.unref();
  process.exit(0);
}

// src/cli/lib/board-reader.ts
import { existsSync as existsSync3, readdirSync, readFileSync as readFileSync3, mkdirSync, unlinkSync as unlinkSync3 } from "fs";
import { dirname, join as join3 } from "path";
import { fileURLToPath } from "url";
import { homedir as homedir2 } from "os";
import { execFileSync } from "child_process";

// src/cli/lib/atomic-write.ts
import { renameSync, unlinkSync as unlinkSync2, writeFileSync as writeFileSync2 } from "fs";
function atomicWriteFileSync(path, content) {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync2(tmp, content, "utf8");
    renameSync(tmp, path);
  } catch (e) {
    try {
      unlinkSync2(tmp);
    } catch {
    }
    throw e;
  }
}

// src/lib/types.ts
var DEFAULT_COLUMNS = ["Backlog", "Todo", "In Progress", "Review", "Done"];

// src/lib/parser.ts
function parseSimpleYaml(yaml) {
  const obj = {};
  if (!yaml || typeof yaml !== "string") return obj;
  const lines = yaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (!key) continue;
    let val = m[2]?.trim() ?? "";
    if (val === "|") {
      const block = [];
      i++;
      while (i < lines.length && (/^\s+/.test(lines[i] ?? "") || (lines[i] ?? "") === "")) {
        block.push((lines[i] ?? "").replace(/^  /, ""));
        i++;
      }
      i--;
      obj[key] = block.join("\n").trimEnd();
      continue;
    }
    if (typeof val !== "string") val = "";
    if (val.startsWith("[") && val.endsWith("]")) {
      const arr = val.slice(1, -1).split(",").map((s) => s && typeof s === "string" ? s.trim().replace(/^["']|["']$/g, "") : "").filter(Boolean);
      obj[key] = arr;
    } else {
      obj[key] = typeof val === "string" ? val.replace(/^["']|["']$/g, "") : val;
    }
  }
  return obj;
}
function parseTaskFile(md) {
  if (!md || typeof md !== "string") {
    return { frontmatter: { id: "", title: "" }, body: "" };
  }
  const lines = md.split("\n");
  if (lines[0] && lines[0].trim() === "---") {
    const fmLines = [];
    let i = 1;
    while (i < lines.length && lines[i].trim() !== "---") {
      fmLines.push(lines[i]);
      i++;
    }
    const body = lines.slice(i + 1).join("\n").trimStart();
    const fm = parseSimpleYaml(fmLines.join("\n"));
    return { frontmatter: fm, body };
  }
  return { frontmatter: { id: "", title: "" }, body: md };
}
function normalizeStatus(status) {
  const value = typeof status === "string" ? status.trim() : "";
  return value || "Backlog";
}
function normalizePriority(priority) {
  if (typeof priority !== "string") return null;
  const value = priority.toUpperCase();
  return /^(P1|P2|P3|P4)$/.test(value) ? value : null;
}
function normalizeOwnerType(ownerType) {
  if (typeof ownerType !== "string") return "";
  const value = ownerType.toLowerCase();
  return value === "human" || value === "ai" ? value : "";
}
function taskOrder(task) {
  const value = task.frontmatter.order;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.MAX_SAFE_INTEGER;
}
function taskToBoardTask(task) {
  const { frontmatter, body } = task;
  const { subtasks } = extractSubtasks(body);
  const done = subtasks.filter((s) => s.done).length;
  const total = subtasks.length;
  const status = normalizeStatus(frontmatter.status);
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags.filter((tag) => typeof tag === "string" && tag.trim().length > 0) : [];
  const { id: _id, title: _title, status: _status, order: _order, created: _created, archived: _archived, report: _report, ...metadata } = frontmatter;
  return {
    id: frontmatter.id || "",
    title: frontmatter.title || frontmatter.id || "Untitled task",
    checked: /done|termin|closed|complet/i.test(status),
    tags,
    assignee: typeof frontmatter.assignee === "string" && frontmatter.assignee ? frontmatter.assignee : null,
    priority: normalizePriority(frontmatter.priority),
    ownerType: normalizeOwnerType(frontmatter.ownerType),
    progress: total > 0 ? { done, total } : null,
    dependsOn: Array.isArray(frontmatter.depends_on) ? frontmatter.depends_on.filter((d) => typeof d === "string" && d.trim().length > 0) : [],
    frontmatter: metadata
  };
}
function buildColumnsFromTasks(tasks, configuredColumns = DEFAULT_COLUMNS) {
  const columnNames = configuredColumns.length > 0 ? configuredColumns : DEFAULT_COLUMNS;
  const columnsByName = /* @__PURE__ */ new Map();
  const configured = columnNames.map((name) => ({ name, tasks: [] }));
  for (const column of configured) columnsByName.set(column.name.toLowerCase(), column);
  const unknownColumns = [];
  const sortedTasks = [...tasks].filter((task) => Boolean(task.frontmatter.id)).filter((task) => !isArchived(task)).sort((a, b) => {
    const byOrder = taskOrder(a) - taskOrder(b);
    if (byOrder !== 0) return byOrder;
    return a.frontmatter.id.localeCompare(b.frontmatter.id, void 0, { numeric: true });
  });
  for (const task of sortedTasks) {
    const status = normalizeStatus(task.frontmatter.status);
    let column = columnsByName.get(status.toLowerCase());
    if (!column) {
      column = { name: status, tasks: [] };
      columnsByName.set(status.toLowerCase(), column);
      unknownColumns.push(column);
    }
    column.tasks.push(taskToBoardTask(task));
  }
  return [...unknownColumns, ...configured];
}
function isArchived(task) {
  return String(task.frontmatter.archived) === "true";
}
function extractSubtasks(body) {
  const subtasks = [];
  if (!body || typeof body !== "string") return { subtasks, bodyWithoutSubtasks: body ?? "" };
  const lines = body.split("\n");
  const kept = [];
  let inSubtaskSection = false;
  for (const line of lines) {
    if (/^#{1,6}\s+(subtasks?|sous[- ]t[âa]ches?|crit[èe]res?)/i.test(line)) {
      inSubtaskSection = true;
      kept.push(line);
      continue;
    }
    if (/^#{1,6}\s+/.test(line) && inSubtaskSection) {
      inSubtaskSection = false;
      kept.push(line);
      continue;
    }
    const m = line.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);
    if (m && inSubtaskSection) {
      const text = m[2]?.trim() ?? "";
      subtasks.push({ done: (m[1]?.toLowerCase() ?? "") === "x", text });
      continue;
    }
    const descMatch = line.match(/^\s*\[DESC\]\s*(.*)$/);
    if (descMatch && subtasks.length > 0) {
      subtasks[subtasks.length - 1].description = descMatch[1];
      continue;
    }
    const reportMatch = line.match(/^\s*\[REPORT\]\s*(.*)$/);
    if (reportMatch && subtasks.length > 0) {
      subtasks[subtasks.length - 1].report = reportMatch[1];
      continue;
    }
    const legacyDescMatch = line.match(/^\s+description:\s*(.+)$/);
    if (legacyDescMatch && inSubtaskSection && subtasks.length > 0) {
      subtasks[subtasks.length - 1].description = legacyDescMatch[1].trim();
      continue;
    }
    const legacyReportMatch = line.match(/^\s+report:\s*(.+)$/);
    if (legacyReportMatch && inSubtaskSection && subtasks.length > 0) {
      subtasks[subtasks.length - 1].report = legacyReportMatch[1].trim();
      continue;
    }
    kept.push(line);
  }
  return { subtasks, bodyWithoutSubtasks: kept.join("\n") };
}

// src/lib/serializer.ts
function serializeTaskFile(frontmatter, body) {
  const lines = ["---"];
  if (frontmatter && typeof frontmatter === "object") {
    for (const [k, v] of Object.entries(frontmatter)) {
      if (v === null || v === void 0 || v === "") continue;
      if (Array.isArray(v)) {
        if (v.length === 0) continue;
        lines.push(`${k}: [${v.join(", ")}]`);
      } else if (typeof v === "string" && v.includes("\n")) {
        lines.push(`${k}: |`);
        lines.push(...v.split("\n").map((line) => line === "" ? "" : `  ${line}`));
      } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        lines.push(`${k}: ${v}`);
      }
    }
  }
  lines.push("---");
  lines.push("");
  lines.push((body ?? "").trim());
  lines.push("");
  return lines.join("\n");
}

// src/cli/lib/config.ts
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "fs";
import { join as join2 } from "path";
var DEFAULT_CONFIG = {
  ui: { language: "en", theme: "auto", skin: "kandown", font: "inter" },
  agent: { suggestFollowUp: false, maxSuggestions: 3 },
  board: {
    columns: ["Backlog", "Todo", "In Progress", "Review", "Done"],
    defaultPriority: "P3",
    defaultOwnerType: "human",
    stackDefaultState: "collapsed"
  },
  fields: {
    priority: false,
    assignee: false,
    tags: false,
    dueDate: false,
    ownerType: false,
    tools: false
  },
  notifications: {
    browser: false,
    sound: false,
    soundId: "soft",
    statusChanges: true,
    taskEdits: true,
    subtaskCompletions: true,
    editDebounceMs: 2e3
  }
};
function loadConfig(kandownDir) {
  const configPath = join2(kandownDir, "kandown.json");
  if (!existsSync2(configPath)) return structuredClone(DEFAULT_CONFIG);
  let raw;
  try {
    raw = JSON.parse(readFileSync2(configPath, "utf8"));
  } catch (e) {
    const err2 = e;
    if (err2.code === "ENOENT") return structuredClone(DEFAULT_CONFIG);
    console.warn(`[kandown] kandown.json is corrupted, using defaults: ${e.message}`);
    return structuredClone(DEFAULT_CONFIG);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    console.warn("[kandown] kandown.json must be a JSON object, using defaults.");
    return structuredClone(DEFAULT_CONFIG);
  }
  const obj = raw;
  const safeObj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const boardRaw = safeObj(obj.board);
  const merged = {
    ui: { ...DEFAULT_CONFIG.ui, ...safeObj(obj.ui) },
    agent: { ...DEFAULT_CONFIG.agent, ...safeObj(obj.agent) },
    board: {
      ...DEFAULT_CONFIG.board,
      ...boardRaw,
      columns: Array.isArray(boardRaw.columns) && boardRaw.columns.length > 0 ? boardRaw.columns.filter((name) => typeof name === "string" && name.trim().length > 0) : DEFAULT_CONFIG.board.columns
    },
    fields: { ...DEFAULT_CONFIG.fields, ...safeObj(obj.fields) },
    notifications: { ...DEFAULT_CONFIG.notifications, ...safeObj(obj.notifications) }
  };
  if (obj.agents && typeof obj.agents === "object") {
    merged.agents = obj.agents;
  }
  return merged;
}

// src/cli/lib/board-reader.ts
function getProjectRoot(kandownDir) {
  return dirname(kandownDir);
}
function getTasksDir(kandownDir) {
  return join3(getProjectRoot(kandownDir), "tasks");
}
function listTaskIds(kandownDir) {
  const tasksDir = getTasksDir(kandownDir);
  if (!existsSync3(tasksDir)) return [];
  return readdirSync(tasksDir).filter((name) => name.endsWith(".md")).map((name) => name.slice(0, -3)).sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
}
function readBoard(kandownDir) {
  const config = loadConfig(kandownDir);
  const ids = listTaskIds(kandownDir);
  const tasks = [];
  for (const id of ids) {
    try {
      const task = readTask(kandownDir, id);
      tasks.push({
        ...task,
        frontmatter: {
          ...task.frontmatter,
          id: task.frontmatter.id || id,
          status: task.frontmatter.status || "Backlog"
        }
      });
    } catch (e) {
      console.error(`[kandown] Failed to read task ${id}:`, e.message);
    }
  }
  return {
    frontmatter: null,
    title: "Project Kanban",
    columns: buildColumnsFromTasks(tasks, config.board.columns)
  };
}
function readTask(kandownDir, taskId) {
  const taskPath = join3(getTasksDir(kandownDir), `${taskId}.md`);
  if (!existsSync3(taskPath)) {
    return {
      frontmatter: { id: taskId, title: `Task ${taskId}`, status: "Backlog" },
      body: ""
    };
  }
  const content = readFileSync3(taskPath, "utf8");
  const parsed = parseTaskFile(content);
  return {
    ...parsed,
    frontmatter: {
      ...parsed.frontmatter,
      id: parsed.frontmatter.id || taskId,
      status: parsed.frontmatter.status || "Backlog"
    }
  };
}
var PKG_ROOT2 = dirname(dirname(fileURLToPath(import.meta.url)));
function readAgentDoc(kandownDir) {
  const sections = [];
  try {
    sections.push(readFileSync3(join3(PKG_ROOT2, "templates", "AGENT_KANDOWN.md"), "utf8").trim());
  } catch (e) {
    console.warn("[kandown] Could not read base agent rules:", e.message);
  }
  const globalPath = join3(homedir2(), ".kandown", "instructions.md");
  if (existsSync3(globalPath)) {
    try {
      sections.push(`## Global instructions

${readFileSync3(globalPath, "utf8").trim()}`);
    } catch (e) {
      console.warn(`[kandown] Could not read ${globalPath}:`, e.message);
    }
  }
  const projectPath = join3(kandownDir, "instructions.md");
  if (existsSync3(projectPath)) {
    try {
      sections.push(`## Project-specific instructions

${readFileSync3(projectPath, "utf8").trim()}`);
    } catch (e) {
      console.warn(`[kandown] Could not read ${projectPath}:`, e.message);
    }
  }
  try {
    const root = getProjectRoot(kandownDir);
    const gitLog = execFileSync("git", ["log", "-n", "5", "--oneline", "--", "tasks/"], { cwd: root, encoding: "utf8" }).trim();
    if (gitLog) {
      sections.push(`## Recent Task Activity (Git History)

\`\`\`
${gitLog}
\`\`\``);
    }
  } catch {
  }
  return sections.filter(Boolean).join("\n\n---\n\n");
}
function moveTaskToColumn(kandownDir, taskId, targetColumn) {
  const taskPath = join3(getTasksDir(kandownDir), `${taskId}.md`);
  if (!existsSync3(taskPath)) return false;
  try {
    const prevContent = readFileSync3(taskPath, "utf8");
    const parsed = readTask(kandownDir, taskId);
    const newContent = serializeTaskFile({
      ...parsed.frontmatter,
      id: taskId,
      status: targetColumn
    }, parsed.body);
    atomicWriteFileSync(taskPath, newContent);
    pushUndo(kandownDir, {
      type: "move",
      taskId,
      path: taskPath,
      previousContent: prevContent,
      newContent,
      timestamp: Date.now()
    });
    return true;
  } catch (e) {
    console.error(`[kandown] Failed to move task ${taskId} to ${targetColumn}:`, e.message);
    return false;
  }
}
function pushUndo(kandownDir, record) {
  try {
    const undoDir = join3(kandownDir, ".undo");
    if (!existsSync3(undoDir)) mkdirSync(undoDir, { recursive: true });
    const logPath = join3(undoDir, "log.json");
    let list = [];
    if (existsSync3(logPath)) {
      try {
        list = JSON.parse(readFileSync3(logPath, "utf8"));
      } catch {
        list = [];
      }
    }
    list.unshift(record);
    if (list.length > 50) list = list.slice(0, 50);
    atomicWriteFileSync(logPath, JSON.stringify(list, null, 2));
  } catch {
  }
}

// src/cli/lib/daemon.ts
import { existsSync as existsSync4, readFileSync as readFileSync4, unlinkSync as unlinkSync4 } from "fs";
import { dirname as dirname2, join as join4 } from "path";
import { execFileSync as execFileSync2, spawn as spawn2 } from "child_process";
import { createConnection } from "net";
function metadataPath(kandownDir) {
  return join4(kandownDir, "daemon.json");
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function parseMetadata(value) {
  if (!isRecord(value)) return null;
  const { pid, port, url, kandownDir, startedAt, version, token } = value;
  if (typeof pid !== "number" || !Number.isInteger(pid)) return null;
  if (typeof port !== "number" || !Number.isInteger(port)) return null;
  if (typeof url !== "string" || typeof kandownDir !== "string") return null;
  if (typeof startedAt !== "string") return null;
  if (version !== null && typeof version !== "string" && version !== void 0) return null;
  if (token !== null && typeof token !== "string" && token !== void 0) return null;
  return { pid, port, url, kandownDir, startedAt, version: version ?? null, token: typeof token === "string" ? token : null };
}
function readDaemonMetadata(kandownDir) {
  const path = metadataPath(kandownDir);
  if (!existsSync4(path)) return null;
  try {
    return parseMetadata(JSON.parse(readFileSync4(path, "utf8")));
  } catch {
    return null;
  }
}
function removeDaemonMetadata(kandownDir) {
  try {
    const path = metadataPath(kandownDir);
    if (existsSync4(path)) unlinkSync4(path);
  } catch {
  }
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function parseRemoteDaemonInfo(value) {
  if (!isRecord(value)) return null;
  const { ok, pid, kandownDir } = value;
  if (ok !== true || typeof pid !== "number" || !Number.isInteger(pid) || typeof kandownDir !== "string") return null;
  return { ok, pid, kandownDir };
}
async function fetchDaemonInfo(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/daemon`, {
      signal: AbortSignal.timeout(700)
    });
    if (!response.ok) return null;
    return parseRemoteDaemonInfo(await response.json());
  } catch {
    return null;
  }
}
function isPortListening(port, timeoutMs = 400) {
  return new Promise((resolve3) => {
    const socket = createConnection({ port, host: "127.0.0.1" }, () => {
      socket.destroy();
      resolve3(true);
    });
    socket.on("error", () => resolve3(false));
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
      resolve3(false);
    });
  });
}
async function getDaemonStatus(kandownDir) {
  const metadata = readDaemonMetadata(kandownDir);
  if (!metadata) return { running: false, metadata: null };
  if (!isProcessAlive(metadata.pid)) {
    removeDaemonMetadata(kandownDir);
    return { running: false, metadata: null };
  }
  const remote = await fetchDaemonInfo(metadata.port);
  if (!remote) {
    return { running: false, metadata: null };
  }
  if (remote.pid !== metadata.pid || remote.kandownDir !== kandownDir) {
    removeDaemonMetadata(kandownDir);
    return { running: false, metadata: null };
  }
  return { running: true, metadata };
}
async function waitForDaemon(kandownDir, timeoutMs = 8e3) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const metadata = readDaemonMetadata(kandownDir);
    if (metadata && isProcessAlive(metadata.pid) && await isPortListening(metadata.port)) {
      return { running: true, metadata };
    }
    await new Promise((resolve3) => setTimeout(resolve3, 120));
  }
  return { running: false, metadata: null };
}
async function startProjectDaemon(kandownDir, preferredPort) {
  const current = await getDaemonStatus(kandownDir);
  if (current.running) return current;
  const cliPath = process.argv[1];
  if (!cliPath) throw new Error("Cannot locate kandown CLI entrypoint");
  const args = [
    cliPath,
    "--no-update-check",
    "daemon",
    "run",
    "--path",
    kandownDir
  ];
  if (typeof preferredPort === "number" && Number.isInteger(preferredPort)) {
    args.push("--port", String(preferredPort));
  }
  const child = spawn2(process.execPath, args, {
    cwd: dirname2(kandownDir),
    detached: true,
    stdio: "ignore",
    env: { ...process.env, KANDOWN_DAEMON: "1" }
  });
  child.unref();
  return waitForDaemon(kandownDir);
}

// src/cli/cli.ts
var c = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  red: "\x1B[31m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  blue: "\x1B[34m",
  cyan: "\x1B[36m"
};
function log(msg) {
  console.log(msg);
}
function info(msg) {
  console.log(`${c.blue}\u2139${c.reset}  ${msg}`);
}
function success(msg) {
  console.log(`${c.green}\u2713${c.reset}  ${msg}`);
}
function err(msg) {
  console.error(`${c.red}\u2717${c.reset}  ${msg}`);
}
function parseArgs(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (a.startsWith("-")) {
      flags[a.slice(1)] = true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional, path: typeof flags.path === "string" ? flags.path : ".kandown" };
}
function resolveKandownDir(pathArg = ".kandown", cwd = process.cwd()) {
  if (basename(cwd) === ".kandown" || existsSync5(join5(cwd, "kandown.json"))) {
    return cwd;
  }
  return resolve2(cwd, pathArg);
}
function ensureKandownDir(rawArgs) {
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const kandownDir = resolveKandownDir(args.path, cwd);
  if (!existsSync5(kandownDir)) {
    err(`No Kandown installation found at ${c.bold}${kandownDir}${c.reset}`);
    log(`  Run ${c.cyan}npx kandown init${c.reset} to create one.`);
    process.exit(1);
  }
  return { kandownDir, cwd };
}
function help() {
  const current = getCurrentVersion();
  log(`
${c.bold}Kandown CLI${c.reset} v${current} \u2014 file-based Kanban backed by Markdown

${c.bold}USAGE:${c.reset}
  kandown [command] [options]

${c.bold}COMMANDS:${c.reset}
  (none)              Start web server & launch TUI
  work                Output agent rules + live board digest
  list                List tasks (alias: ls)
  show <id>           Display task details
  create "<title>"    Create new task (alias: new)
  move <id> <status>  Move task column
  assign <id> <user>  Assign task
  commit              Commit task changes to git
  update              Update kandown CLI to latest version (alias: upgrade)
  doctor              Run environment & board diagnostics
  daemon              Manage background daemon (status, start, stop, restart)
  projects            List open kandown projects
  export              Export board tasks to JSON
  import <file>       Import tasks from JSON/Markdown
  mcp                 Start Model Context Protocol (MCP) server
  help                Show help screen

${c.bold}OPTIONS:${c.reset}
  --path <dir>        Path to .kandown folder (default: .kandown)
  --port <number>     Server port (default: 2050)
  --no-open           Don't open browser automatically
  --help, -h          Show help screen
`);
}
async function cmdUpdate(rawArgs) {
  const current = getCurrentVersion();
  log(`${c.bold}kandown update${c.reset} ${c.dim}\u2014 v${current}${c.reset}`);
  const latest = await new Promise((resolve3) => {
    const child = spawn3("npm", ["view", "kandown", "version"], {
      timeout: 6e3,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      detached: false
    });
    let stdout = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", () => {
    });
    child.on("error", () => resolve3(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve3(null);
      const v = stdout.trim().replace(/^"|"$/g, "");
      resolve3(v || null);
    });
  });
  if (latest && semverGt(latest, current) > 0) {
    info(`Updating kandown package v${current} \u2192 v${latest}\u2026`);
    const updateOk = await performGlobalPackageUpdate(`kandown@${latest}`);
    if (updateOk) {
      success(`Successfully upgraded kandown to v${latest}`);
    } else {
      err(`Global CLI update failed \u2014 try: pnpm add -g kandown@latest or npm install -g kandown@latest`);
    }
  } else {
    info(`kandown CLI is already up to date (v${current}).`);
  }
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const kandownDir = resolve2(cwd, args.path);
  const htmlDest = join5(kandownDir, "kandown.html");
  if (existsSync5(htmlDest)) {
    const htmlSrc = resolve2(import.meta.url ? new URL("../..", import.meta.url).pathname : process.cwd(), "dist", "index.html");
    if (existsSync5(htmlSrc)) {
      copyFileSync(htmlSrc, htmlDest);
      success(`Refreshed ${args.path}/kandown.html`);
    }
  }
}
async function cmdDoctor(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const currentVersion = getCurrentVersion();
  log(`${c.bold}kandown doctor${c.reset} ${c.dim}\u2014 environment & board diagnostic${c.reset}
`);
  log(`  CLI Version: ${currentVersion}`);
  const configPath = join5(kandownDir, "kandown.json");
  if (existsSync5(configPath)) {
    try {
      JSON.parse(readFileSync5(configPath, "utf8"));
      success("kandown.json valid");
    } catch (e) {
      err(`kandown.json invalid: ${e.message}`);
    }
  } else {
    err("Missing kandown.json");
  }
  const daemonStatus = await getDaemonStatus(kandownDir);
  if (daemonStatus.running && daemonStatus.metadata) {
    success(`Daemon running on port ${daemonStatus.metadata.port} (PID ${daemonStatus.metadata.pid})`);
  } else {
    info("Daemon not running");
  }
  const taskIds = listTaskIds(kandownDir);
  success(`Tasks: ${taskIds.length} active task files`);
  log(`
${c.green}\u2713 Everything looks good!${c.reset}
`);
}
async function cmdWork(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const doc = readAgentDoc(kandownDir);
  const board = readBoard(kandownDir);
  log(doc);
  log("\n---\n");
  log(`## Current Board Digest
`);
  const allTasksCount = board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
  log(`Tasks total: ${allTasksCount}`);
  for (const col of board.columns) {
    log(`- **${col.name}** (${col.tasks.length}): ${col.tasks.map((t) => `${t.id} ${t.title}`).join(", ") || "empty"}`);
  }
}
function cmdList(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const board = readBoard(kandownDir);
  const { flags } = parseArgs(rawArgs);
  const statusFilter = typeof flags.status === "string" ? flags.status.toLowerCase() : null;
  const priorityFilter = typeof flags.priority === "string" ? flags.priority.toUpperCase() : null;
  for (const col of board.columns) {
    if (statusFilter && col.name.toLowerCase() !== statusFilter) continue;
    log(`
${c.bold}${col.name}${c.reset} (${col.tasks.length})`);
    for (const t of col.tasks) {
      if (priorityFilter && t.priority !== priorityFilter) continue;
      log(`  ${c.cyan}${t.id}${c.reset} [${t.priority || "P2"}] ${t.title}`);
    }
  }
  log("");
}
function cmdShow(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const id = rawArgs.find((a) => !a.startsWith("-"));
  if (!id) {
    err("Usage: kandown show <task-id>");
    process.exit(1);
  }
  try {
    const task = readTask(kandownDir, id);
    log(`${c.bold}${task.frontmatter.id}: ${task.frontmatter.title}${c.reset}`);
    log(`Status: ${task.frontmatter.status} | Priority: ${task.frontmatter.priority || "P2"} | Assignee: ${task.frontmatter.assignee || "none"}
`);
    log(task.body);
  } catch (e) {
    err(`Could not read task ${id}: ${e.message}`);
  }
}
function cmdMove(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const [id, newStatus] = rawArgs.filter((a) => !a.startsWith("-"));
  if (!id || !newStatus) {
    err("Usage: kandown move <task-id> <status>");
    process.exit(1);
  }
  try {
    moveTaskToColumn(kandownDir, id, newStatus);
    success(`Moved ${id} \u2192 "${newStatus}"`);
  } catch (e) {
    err(`Move failed: ${e.message}`);
  }
}
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const rest = args.slice(1);
  const skipUpdate = args.includes("--no-update-check") || process.env.KANDOWN_NO_UPDATE === "1";
  const SCRIPTED = /* @__PURE__ */ new Set(["list", "ls", "show", "create", "new", "move", "assign", "commit", "work", "doctor", "projects", "export", "import"]);
  if (!skipUpdate && !SCRIPTED.has(cmd)) {
    await checkForUpdate(process.argv);
  }
  switch (cmd) {
    case "update":
    case "upgrade":
      await cmdUpdate(rest);
      break;
    case "doctor":
      await cmdDoctor(rest);
      break;
    case "work":
      await cmdWork(rest);
      break;
    case "list":
    case "ls":
      cmdList(rest);
      break;
    case "show":
      cmdShow(rest);
      break;
    case "move":
      cmdMove(rest);
      break;
    case "help":
    case "--help":
    case "-h":
      help();
      break;
    case void 0: {
      const { kandownDir } = ensureKandownDir(rest);
      const status = await getDaemonStatus(kandownDir);
      if (!status.running) {
        await startProjectDaemon(kandownDir);
      }
      const tuiPath = resolve2(import.meta.url ? new URL("../..", import.meta.url).pathname : process.cwd(), "bin", "tui.js");
      if (existsSync5(tuiPath)) {
        const child = spawn3("node", [tuiPath, ...rest], { stdio: "inherit" });
        child.on("close", (code) => process.exit(code || 0));
      } else {
        info("Kandown daemon running. Open kandown.html in browser.");
      }
      break;
    }
    default:
      if (cmd.startsWith("-")) {
        help();
        break;
      }
      err(`Unknown command: ${cmd}`);
      help();
      process.exit(1);
  }
}
void main();
