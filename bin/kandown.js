#!/usr/bin/env node
import { createRequire as __createRequire } from 'node:module';
if (typeof globalThis.require === 'undefined') {
  globalThis.require = __createRequire(import.meta.url);
}

// src/cli/cli.ts
import { existsSync as existsSync17 } from "fs";
import { join as join21 } from "path";

// src/cli/lib/updater.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { spawn, execSync } from "child_process";
import { homedir } from "os";

// src/lib/version.ts
var KANDOWN_VERSION = "0.43.0";

// src/cli/lib/updater.ts
import { fileURLToPath } from "url";
import { dirname } from "path";
function getPackageRoot() {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    if (currentFile.includes("/bin/")) {
      return resolve(dirname(currentFile), "..");
    }
    return resolve(dirname(currentFile), "../../..");
  } catch {
    return process.cwd();
  }
}
var PKG_ROOT = getPackageRoot();
var CACHE_DIR = join(homedir(), ".kandown");
var UPDATE_CHECK_CACHE = join(CACHE_DIR, ".update-check.json");
var UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1e3;
function getInstalledVersion() {
  try {
    const pkgPath = join(PKG_ROOT, "package.json");
    if (!existsSync(pkgPath)) return null;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return typeof pkg.version === "string" && pkg.version ? pkg.version : null;
  } catch {
    return null;
  }
}
function getCurrentVersion() {
  if (KANDOWN_VERSION && KANDOWN_VERSION !== "0.0.0-dev") {
    return KANDOWN_VERSION;
  }
  try {
    const pkgPath = resolve(import.meta.url ? new URL("../../..", import.meta.url).pathname : process.cwd(), "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (pkg.version) return pkg.version;
    }
  } catch {
  }
  return KANDOWN_VERSION || "0.32.1";
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
    if (!existsSync(UPDATE_CHECK_CACHE)) return false;
    const raw = JSON.parse(readFileSync(UPDATE_CHECK_CACHE, "utf8"));
    return Number.isFinite(raw?.lastCheck) && Date.now() - raw.lastCheck < UPDATE_CHECK_INTERVAL_MS;
  } catch {
    return false;
  }
}
function rememberUpdateCheck() {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(UPDATE_CHECK_CACHE, JSON.stringify({ lastCheck: Date.now(), version: getCurrentVersion() }), "utf8");
  } catch {
  }
}
function requestedSemver(packageSpec) {
  const match = packageSpec.match(/@(\d+\.\d+\.\d+(?:-[\w.-]+)?)$/);
  return match ? match[1] : null;
}
async function performGlobalPackageUpdate(packageSpec) {
  const cleanEnv = { ...process.env };
  for (const k of Object.keys(cleanEnv)) {
    if (k.startsWith("npm_config_") || k.startsWith("npm_") || k === "INIT_CWD") {
      delete cleanEnv[k];
    }
  }
  const targetVersion = requestedSemver(packageSpec);
  const verifyInstalledVersion = async () => {
    if (!targetVersion) return true;
    const installedVersion = await readInstalledKandownVersion(targetVersion);
    return semverGt(installedVersion, targetVersion) >= 0;
  };
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
  const tryPkgCmdAndVerify = async (cmd, args) => {
    if (!await tryPkgCmd(cmd, args)) return false;
    return verifyInstalledVersion();
  };
  const currentBin = resolveKandownBin() || "";
  const currentBinDir = currentBin ? dirname(currentBin) : null;
  const siblingNpm = currentBinDir ? join(currentBinDir, "npm") : null;
  const siblingPnpm = currentBinDir ? join(currentBinDir, "pnpm") : null;
  const isPnpmInstall = currentBin.includes("pnpm");
  if (siblingPnpm && existsSync(siblingPnpm) && await tryPkgCmdAndVerify(siblingPnpm, ["add", "-g", packageSpec])) return true;
  if (siblingNpm && existsSync(siblingNpm) && await tryPkgCmdAndVerify(siblingNpm, ["install", "-g", packageSpec, "--force"])) return true;
  if (isPnpmInstall) {
    if (await tryPkgCmdAndVerify("pnpm", ["add", "-g", packageSpec])) return true;
    if (await tryPkgCmdAndVerify("npm", ["install", "-g", packageSpec, "--force"])) return true;
  } else {
    if (await tryPkgCmdAndVerify("npm", ["install", "-g", packageSpec, "--force"])) return true;
    if (await tryPkgCmdAndVerify("pnpm", ["add", "-g", packageSpec])) return true;
  }
  if (await tryPkgCmdAndVerify("yarn", ["global", "add", packageSpec])) return true;
  return await tryPkgCmdAndVerify("bun", ["add", "-g", packageSpec]);
}
async function checkForUpdate(argv = process.argv) {
  if (process.env.KANDOWN_NO_UPDATE === "1") return;
  if (updateCheckedRecently() && !process.env.KANDOWN_FORCE_UPDATE) return;
  const current = getCurrentVersion();
  if (!current) return;
  const lockFile = join(CACHE_DIR, ".update.lock");
  const now = Date.now();
  try {
    if (existsSync(lockFile)) {
      const lockAge = now - statSync(lockFile).mtimeMs;
      if (lockAge < 6e4) return;
      unlinkSync(lockFile);
    }
  } catch {
  }
  const latest = await new Promise((resolve8) => {
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
    child2.on("error", () => resolve8(null));
    child2.on("close", (code) => {
      if (code !== 0) return resolve8(null);
      const v = stdout.trim().replace(/^"|"$/g, "");
      resolve8(v || null);
    });
  });
  if (!latest) return;
  if (semverGt(latest, current) <= 0) {
    rememberUpdateCheck();
    return;
  }
  console.log(`\x1B[36m\u26A1 Update available:\x1B[0m kandown \x1B[2mv${current}\x1B[0m \u2192 \x1B[32mv${latest}\x1B[0m`);
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(lockFile, `${process.pid}
${now}`, "utf8");
  } catch {
  }
  console.log(`\x1B[32mInstalling kandown@${latest} globally\u2026\x1B[0m`);
  const updateOk = await performGlobalPackageUpdate(`kandown@${latest}`);
  try {
    if (existsSync(lockFile)) unlinkSync(lockFile);
  } catch {
  }
  if (!updateOk) {
    console.log(`\x1B[33m\u2717 Auto-update failed\x1B[0m \u2014 continuing with current version`);
    return;
  }
  rememberUpdateCheck();
  console.log(`\x1B[32m\u2713 Successfully updated kandown to v${latest}!\x1B[0m \u2014 restarting\u2026`);
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

// src/cli/lib/daemon.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, unlinkSync as unlinkSync2 } from "fs";
import { dirname as dirname2, join as join2 } from "path";
import { execFileSync, spawn as spawn2 } from "child_process";
import { createConnection } from "net";
function metadataPath(kandownDir) {
  return join2(kandownDir, "daemon.json");
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
  if (!existsSync2(path)) return null;
  try {
    return parseMetadata(JSON.parse(readFileSync2(path, "utf8")));
  } catch {
    return null;
  }
}
function removeDaemonMetadata(kandownDir) {
  try {
    const path = metadataPath(kandownDir);
    if (existsSync2(path)) unlinkSync2(path);
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
  const { ok, pid, kandownDir, version } = value;
  if (ok !== true || typeof pid !== "number" || !Number.isInteger(pid) || typeof kandownDir !== "string") return null;
  if (version !== null && typeof version !== "string" && version !== void 0) return null;
  return { ok, pid, kandownDir, version: typeof version === "string" ? version : null };
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
  return new Promise((resolve8) => {
    const socket = createConnection({ port, host: "127.0.0.1" }, () => {
      socket.destroy();
      resolve8(true);
    });
    socket.on("error", () => resolve8(false));
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
      resolve8(false);
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
  return { running: true, metadata: { ...metadata, version: remote.version ?? metadata.version } };
}
async function waitForDaemon(kandownDir, timeoutMs = 8e3) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const metadata = readDaemonMetadata(kandownDir);
    if (metadata && isProcessAlive(metadata.pid) && await isPortListening(metadata.port)) {
      return { running: true, metadata };
    }
    await new Promise((resolve8) => setTimeout(resolve8, 120));
  }
  return { running: false, metadata: null };
}
async function startProjectDaemon(kandownDir, preferredPort) {
  const current = await getDaemonStatus(kandownDir);
  if (current.running) {
    if (current.metadata?.version === getCurrentVersion()) return current;
    await stopProjectDaemon(kandownDir);
  }
  const cliPath = join2(PKG_ROOT, "bin", "kandown.js");
  if (!existsSync2(cliPath)) throw new Error(`Cannot locate kandown CLI entrypoint at ${cliPath}`);
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
async function isOwnedKandownDaemon(pid, port, kandownDir) {
  const remote = await fetchDaemonInfo(port);
  if (remote) return remote.pid === pid && remote.kandownDir === kandownDir;
  try {
    const cmd = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      timeout: 2e3
    }).trim();
    return /kandown/.test(cmd) && cmd.includes(kandownDir);
  } catch {
    return false;
  }
}
async function stopProjectDaemon(kandownDir) {
  const metadata = readDaemonMetadata(kandownDir);
  if (!metadata) return false;
  const pid = metadata.pid;
  if (!isProcessAlive(pid)) {
    removeDaemonMetadata(kandownDir);
    return false;
  }
  if (!await isOwnedKandownDaemon(pid, metadata.port, kandownDir)) {
    removeDaemonMetadata(kandownDir);
    return false;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
  }
  const started = Date.now();
  while (Date.now() - started < 2500 && isProcessAlive(pid)) {
    await new Promise((resolve8) => setTimeout(resolve8, 100));
  }
  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
    }
  }
  removeDaemonMetadata(kandownDir);
  return true;
}

// src/cli/lib/board-reader.ts
import { existsSync as existsSync4, readdirSync as readdirSync2, readFileSync as readFileSync4, mkdirSync as mkdirSync2, unlinkSync as unlinkSync4 } from "fs";
import { dirname as dirname3, join as join4 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { homedir as homedir2 } from "os";
import { execFileSync as execFileSync2 } from "child_process";

// src/lib/types.ts
var DEFAULT_COLUMNS = ["Backlog", "Todo", "In Progress", "Review", "Done"];
var DEFAULT_WORK_OUTPUT = {
  mode: "blocks",
  includeBaseRules: true,
  baseRulesMode: "full",
  includeProjectInstructions: true,
  includeBoardDigest: true,
  sectionOrder: ["baseRules", "projectInstructions", "boardDigest"],
  rawTemplate: "{{baseRules}}\n\n---\n\n{{projectInstructions}}\n\n---\n\n{{boardDigest}}",
  boardDigest: {
    showColumnCounts: true,
    showTasks: true,
    showPriority: true,
    showAssignee: true,
    showBlockedBy: true,
    showNextActionable: true
  }
};
var DEFAULT_CONFIG = {
  ui: { language: "en", theme: "auto", skin: "kandown", font: "inter", background: "solid", onboardingCompleted: false },
  agent: { suggestFollowUp: false, maxSuggestions: 3, workOutput: DEFAULT_WORK_OUTPUT },
  board: {
    columns: DEFAULT_COLUMNS,
    defaultPriority: "P3",
    defaultOwnerType: "human",
    columnColors: {
      backlog: "red",
      todo: "blue",
      "in progress": "orange",
      review: "violet",
      done: "green"
    },
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
  },
  extensions: {
    restricted: true
  }
};

// src/lib/dependencies.ts
var DependencyGateError = class extends Error {
  constructor(taskId, targetStatus, blockedBy, reason = "unresolved-dependency") {
    const list = blockedBy.length === 1 ? blockedBy[0] : `${blockedBy.slice(0, -1).join(", ")} and ${blockedBy[blockedBy.length - 1]}`;
    super(`Cannot move ${taskId} to ${targetStatus}: blocked by ${list}`);
    this.taskId = taskId;
    this.targetStatus = targetStatus;
    this.blockedBy = blockedBy;
    this.reason = reason;
    this.name = "DependencyGateError";
  }
  taskId;
  targetStatus;
  blockedBy;
  reason;
};
function terminalStatus(config = DEFAULT_CONFIG) {
  const cols = config.board.columns;
  return cols[cols.length - 1] ?? "Done";
}
function isTerminalStatus(status, config = DEFAULT_CONFIG) {
  return status === terminalStatus(config) || status.toLowerCase() === terminalStatus(config).toLowerCase() || isArchivedStatus(status);
}
function isArchivedStatus(taskOrStatus, config) {
  if (typeof taskOrStatus === "string") return taskOrStatus.toLowerCase() === "archived";
  if (taskOrStatus && typeof taskOrStatus === "object") {
    const arch = taskOrStatus.archived;
    if (arch === true || arch === "true") return true;
    const st = typeof taskOrStatus.status === "string" ? taskOrStatus.status : "";
    if (st && st.toLowerCase() === "archived") return true;
  }
  return false;
}
function movesIntoArchived(targetStatus) {
  return targetStatus.toLowerCase() === "archived";
}
function normalizeDeps(task, taskId) {
  const raw = readDeps(task);
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" && raw.trim() ? [raw] : [];
  const out = [];
  for (const dep of arr) {
    if (typeof dep !== "string" || !dep.trim()) continue;
    if (dep === taskId) continue;
    out.push(dep);
  }
  return out;
}
function readStatus(task) {
  if (typeof task.status === "string") {
    return task.status;
  }
  const fm = task.frontmatter;
  return typeof fm?.status === "string" ? fm.status : "Backlog";
}
function readDeps(task) {
  if (task.depends_on !== void 0) {
    return task.depends_on;
  }
  return task.frontmatter?.depends_on;
}
function resolveDependencyStatus(tasks, config = DEFAULT_CONFIG) {
  const byId = /* @__PURE__ */ new Map();
  for (const t of tasks) {
    const id = t && (t.id ?? t.frontmatter?.id);
    if (id) byId.set(id, t);
  }
  const terminal = terminalStatus(config).toLowerCase();
  const out = /* @__PURE__ */ new Map();
  for (const [id, task] of byId) {
    const status = readStatus(task).toLowerCase();
    const isArch = isArchivedStatus(task);
    const fm = task.frontmatter;
    const fmArchived = fm ? isArchivedStatus({ archived: fm.archived, status: fm.status }) : false;
    out.set(id, {
      exists: true,
      resolved: isArch || fmArchived || status === terminal,
      title: null
    });
  }
  for (const task of byId.values()) {
    const taskId = task.id ?? task.frontmatter?.id ?? "";
    const deps = normalizeDeps(task, taskId);
    for (const dep of deps) {
      if (!out.has(dep)) {
        out.set(dep, { exists: false, resolved: true, title: null });
      }
    }
  }
  return out;
}
function unresolvedDependencyIds(task, resolution) {
  const id = task && task.id || task.frontmatter?.id || "";
  const deps = normalizeDeps(task, id);
  const out = [];
  for (const dep of deps) {
    const r = resolution.get(dep);
    if (!r || !r.resolved) out.push(dep);
  }
  return out;
}
function resolveTransition(task, targetStatus, snapshot, config = DEFAULT_CONFIG) {
  const id = task && task.id || task.frontmatter?.id || "";
  if (typeof targetStatus !== "string" || !targetStatus) {
    return { allowed: true, reason: "not-implemented" };
  }
  const gated = isTerminalStatus(targetStatus, config) || movesIntoArchived(targetStatus);
  if (!gated) {
    return { allowed: true, reason: "not-implemented" };
  }
  const blocked = unresolvedDependencyIds(task, snapshot);
  if (blocked.length > 0) {
    return { allowed: false, reason: "unresolved-dependency", blockedBy: blocked };
  }
  return { allowed: true, reason: "allowed" };
}

// src/cli/lib/atomic-write.ts
import { renameSync, unlinkSync as unlinkSync3, writeFileSync as writeFileSync2 } from "fs";
function atomicWriteFileSync(path, content) {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync2(tmp, content, "utf8");
    renameSync(tmp, path);
  } catch (e) {
    try {
      unlinkSync3(tmp);
    } catch {
    }
    throw e;
  }
}

// src/lib/task-meta.ts
function nowStamp() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function stampUpdated(frontmatter) {
  return { ...frontmatter, updated: nowStamp() };
}
function taskTimestamp(frontmatter, mtimeMs) {
  for (const raw of [frontmatter?.updated, frontmatter?.created]) {
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const parsed = Date.parse(raw.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof mtimeMs === "number" && Number.isFinite(mtimeMs) && mtimeMs > 0) return mtimeMs;
  return null;
}
var MINUTE = 6e4;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;
var WEEK = 7 * DAY;
var MONTH = 30 * DAY;
var YEAR = 365 * DAY;

// src/lib/parser.ts
function parseSimpleYaml(yaml) {
  if (!yaml || typeof yaml !== "string") return {};
  return readMapping(yaml.split("\n"), 0, 0).value;
}
function leadingSpaces(line) {
  let n = 0;
  while (line[n] === " ") n++;
  return n;
}
function nextContentIndent(lines, from) {
  for (let i = from; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (l.trim() === "") continue;
    return leadingSpaces(l);
  }
  return null;
}
function unquoteScalar(raw) {
  return raw.replace(/^["']|["']$/g, "");
}
function parseInlineArray(raw) {
  return raw.slice(1, -1).split(",").map((s) => s && typeof s === "string" ? s.trim().replace(/^["']|["']$/g, "") : "").filter(Boolean);
}
function readBlockScalar(lines, start) {
  let probe = start;
  while (probe < lines.length && (lines[probe] ?? "").trim() === "") probe++;
  if (probe >= lines.length) return { value: "", next: start };
  const indent = leadingSpaces(lines[probe] ?? "");
  if (indent <= 0) return { value: "", next: start };
  const block = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      block.push("");
      i++;
      continue;
    }
    if (leadingSpaces(line) < indent) break;
    block.push(line.slice(indent));
    i++;
  }
  while (block.length > 0 && block[block.length - 1] === "") block.pop();
  return { value: block.join("\n"), next: i };
}
function readMapping(lines, start, indent) {
  const obj = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    const ind = leadingSpaces(line);
    if (ind < indent) break;
    if (ind > indent) {
      i++;
      continue;
    }
    const m = line.match(/^(\s*)([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[2];
    const rawVal = (m[3] ?? "").trim();
    if (rawVal === "|") {
      const { value, next } = readBlockScalar(lines, i + 1);
      obj[key] = value;
      i = next;
      continue;
    }
    if (rawVal === "") {
      const childIndent = nextContentIndent(lines, i + 1);
      if (childIndent !== null && childIndent > indent) {
        const { value, next } = readMapping(lines, i + 1, childIndent);
        obj[key] = value;
        i = next;
        continue;
      }
      obj[key] = "";
      i++;
      continue;
    }
    if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
      obj[key] = parseInlineArray(rawVal);
      i++;
      continue;
    }
    obj[key] = unquoteScalar(rawVal);
    i++;
  }
  return { value: obj, next: i };
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
  const { id: _id, title: _title, status: _status, order: _order, created: _created, updated: _updated, archived: _archived, report: _report, ...metadata } = frontmatter;
  return {
    id: frontmatter.id || "",
    title: frontmatter.title || frontmatter.id || "Untitled task",
    checked: /done|termin|closed|complet/i.test(status),
    tags,
    assignee: typeof frontmatter.assignee === "string" && frontmatter.assignee ? frontmatter.assignee : null,
    priority: normalizePriority(frontmatter.priority),
    ownerType: normalizeOwnerType(frontmatter.ownerType),
    progress: total > 0 ? { done, total } : null,
    // 📖 Effective last-activity epoch ms — `updated` when present, `created`
    // otherwise, null on a task carrying neither. Resolved once here so every
    // consumer (Age column, age sort) agrees on the same fallback chain.
    updatedAt: taskTimestamp(frontmatter),
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
    const m = line.match(/^\s*-\s+\[([ xX])\]\s*(.*)$/);
    if (m && inSubtaskSection) {
      const text = m[2]?.trim() ?? "";
      subtasks.push({ done: (m[1]?.toLowerCase() ?? "") === "x", text });
      continue;
    }
    const descMatch = line.match(/^\s*\[DESC\]\s?(.*)$/);
    if (descMatch && subtasks.length > 0) {
      const subtask = subtasks[subtasks.length - 1];
      const nextLine = descMatch[1] ?? "";
      subtask.description = subtask.description === void 0 ? nextLine : `${subtask.description}
${nextLine}`;
      continue;
    }
    const reportMatch = line.match(/^\s*\[REPORT\]\s?(.*)$/);
    if (reportMatch && subtasks.length > 0) {
      const subtask = subtasks[subtasks.length - 1];
      const nextLine = reportMatch[1] ?? "";
      subtask.report = subtask.report === void 0 ? nextLine : `${subtask.report}
${nextLine}`;
      continue;
    }
    const legacyDescMatch = line.match(/^\s+description:\s*(.+)$/);
    if (legacyDescMatch && inSubtaskSection && subtasks.length > 0) {
      const subtask = subtasks[subtasks.length - 1];
      const nextLine = legacyDescMatch[1].trim();
      subtask.description = subtask.description ? `${subtask.description}
${nextLine}` : nextLine;
      continue;
    }
    const legacyReportMatch = line.match(/^\s+report:\s*(.+)$/);
    if (legacyReportMatch && inSubtaskSection && subtasks.length > 0) {
      const subtask = subtasks[subtasks.length - 1];
      const nextLine = legacyReportMatch[1].trim();
      subtask.report = subtask.report ? `${subtask.report}
${nextLine}` : nextLine;
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
      serializeValue(k, v, lines, 0);
    }
  }
  lines.push("---");
  lines.push("");
  lines.push((body ?? "").trim());
  lines.push("");
  return lines.join("\n");
}
function serializeValue(key, value, lines, indent) {
  const pad = " ".repeat(indent);
  if (value === null || value === void 0 || value === "") return;
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    lines.push(`${pad}${key}: [${value.join(", ")}]`);
    return;
  }
  if (typeof value === "string") {
    if (value.includes("\n")) {
      lines.push(`${pad}${key}: |`);
      const childPad = " ".repeat(indent + 2);
      for (const l of value.split("\n")) lines.push(l === "" ? "" : `${childPad}${l}`);
    } else {
      lines.push(`${pad}${key}: ${value}`);
    }
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    lines.push(`${pad}${key}: ${value}`);
    return;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== null && v !== void 0 && v !== "");
    if (entries.length === 0) return;
    lines.push(`${pad}${key}:`);
    for (const [ck, cv] of entries) serializeValue(ck, cv, lines, indent + 2);
    return;
  }
}

// src/cli/lib/config.ts
import { readFileSync as readFileSync3, existsSync as existsSync3, readdirSync, statSync as statSync2 } from "fs";
import { join as join3 } from "path";
var DEFAULT_CONFIG2 = {
  ui: { language: "en", theme: "auto", skin: "kandown", font: "inter" },
  agent: { suggestFollowUp: false, maxSuggestions: 3 },
  board: {
    columns: ["Backlog", "Todo", "In Progress", "Review", "Done"],
    defaultPriority: "P3",
    defaultOwnerType: "human",
    stackDefaultState: "collapsed"
  },
  tui: {
    defaultView: "list",
    showDetailPane: true,
    listSort: "status",
    // 📖 Tags default to off: they are the widest optional column and the one
    // most projects leave empty, so on by default it mostly reserved 14 cells
    // of description width to render blanks. Turn it on in `kandown settings`.
    columns: { age: true, status: true, priority: true, owner: true, deps: true, tags: false }
  },
  extensions: { restricted: true },
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
  const configPath = join3(kandownDir, "kandown.json");
  if (!existsSync3(configPath)) return structuredClone(DEFAULT_CONFIG2);
  let raw;
  try {
    raw = JSON.parse(readFileSync3(configPath, "utf8"));
  } catch (e) {
    const err3 = e;
    if (err3.code === "ENOENT") return structuredClone(DEFAULT_CONFIG2);
    console.warn(`[kandown] kandown.json is corrupted, using defaults: ${e.message}`);
    return structuredClone(DEFAULT_CONFIG2);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    console.warn("[kandown] kandown.json must be a JSON object, using defaults.");
    return structuredClone(DEFAULT_CONFIG2);
  }
  const obj = raw;
  const safeObj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const boardRaw = safeObj(obj.board);
  const merged = {
    ui: { ...DEFAULT_CONFIG2.ui, ...safeObj(obj.ui) },
    agent: { ...DEFAULT_CONFIG2.agent, ...safeObj(obj.agent) },
    board: {
      ...DEFAULT_CONFIG2.board,
      ...boardRaw,
      columns: Array.isArray(boardRaw.columns) && boardRaw.columns.length > 0 ? boardRaw.columns.filter((name) => typeof name === "string" && name.trim().length > 0) : DEFAULT_CONFIG2.board.columns
    },
    // 📖 `columns` is merged one level deeper than the rest: a config that only
    // pins `{"tui":{"columns":{"tags":true}}}` must keep the defaults for every
    // other column instead of having them come back `undefined` (falsy — which
    // would silently blank the whole row).
    tui: {
      ...DEFAULT_CONFIG2.tui,
      ...safeObj(obj.tui),
      columns: {
        ...DEFAULT_CONFIG2.tui.columns,
        ...safeObj(safeObj(obj.tui).columns)
      }
    },
    fields: { ...DEFAULT_CONFIG2.fields, ...safeObj(obj.fields) },
    extensions: { ...DEFAULT_CONFIG2.extensions, ...safeObj(obj.extensions) },
    notifications: { ...DEFAULT_CONFIG2.notifications, ...safeObj(obj.notifications) }
  };
  if (obj.agents && typeof obj.agents === "object") {
    merged.agents = obj.agents;
  }
  return merged;
}
function saveConfig(kandownDir, config) {
  const configPath = join3(kandownDir, "kandown.json");
  atomicWriteFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

// src/cli/lib/board-reader.ts
function getProjectRoot(kandownDir) {
  return dirname3(kandownDir);
}
function getTasksDir(kandownDir) {
  return join4(getProjectRoot(kandownDir), "tasks");
}
function listTaskIds(kandownDir) {
  const tasksDir = getTasksDir(kandownDir);
  const ids = /* @__PURE__ */ new Set();
  for (const directory of [tasksDir, join4(tasksDir, "archive")]) {
    if (!existsSync4(directory)) continue;
    for (const name of readdirSync2(directory).filter((entry) => entry.endsWith(".md"))) {
      ids.add(name.slice(0, -3));
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
}
function findTaskPath(kandownDir, taskId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) return null;
  const tasksDir = getTasksDir(kandownDir);
  const activePath = join4(tasksDir, `${taskId}.md`);
  if (existsSync4(activePath)) return activePath;
  const archivedPath = join4(tasksDir, "archive", `${taskId}.md`);
  return existsSync4(archivedPath) ? archivedPath : null;
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
  const taskPath2 = findTaskPath(kandownDir, taskId);
  if (!taskPath2) {
    return {
      frontmatter: { id: taskId, title: `Task ${taskId}`, status: "Backlog" },
      body: ""
    };
  }
  const content = readFileSync4(taskPath2, "utf8");
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
var PKG_ROOT2 = dirname3(dirname3(fileURLToPath2(import.meta.url)));
function readAgentDoc(kandownDir) {
  const sections = [];
  try {
    sections.push(readFileSync4(join4(PKG_ROOT2, "templates", "AGENT_KANDOWN.md"), "utf8").trim());
  } catch (e) {
    console.warn("[kandown] Could not read base agent rules:", e.message);
  }
  const globalPath = join4(homedir2(), ".kandown", "instructions.md");
  if (existsSync4(globalPath)) {
    try {
      sections.push(`## Global instructions

${readFileSync4(globalPath, "utf8").trim()}`);
    } catch (e) {
      console.warn(`[kandown] Could not read ${globalPath}:`, e.message);
    }
  }
  const projectPath = join4(kandownDir, "instructions.md");
  if (existsSync4(projectPath)) {
    try {
      sections.push(`## Project-specific instructions

${readFileSync4(projectPath, "utf8").trim()}`);
    } catch (e) {
      console.warn(`[kandown] Could not read ${projectPath}:`, e.message);
    }
  }
  try {
    const root = getProjectRoot(kandownDir);
    const gitLog = execFileSync2("git", ["log", "-n", "5", "--oneline", "--", "tasks/"], { cwd: root, encoding: "utf8" }).trim();
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
  const taskPath2 = findTaskPath(kandownDir, taskId);
  if (!taskPath2) return false;
  try {
    const parsed = readTask(kandownDir, taskId);
    const cfg = loadConfig(kandownDir);
    const ids = listTaskIds(kandownDir);
    const allTasks = ids.map((id) => {
      try {
        return readTask(kandownDir, id);
      } catch {
        return null;
      }
    }).filter((t) => t !== null);
    const snap = resolveDependencyStatus(allTasks, cfg);
    const verdict = resolveTransition(parsed, targetColumn, snap, cfg);
    if (!verdict.allowed) {
      console.error(
        `[kandown] Cannot move ${taskId} to ${targetColumn}: blocked by ${verdict.blockedBy.join(", ")}`
      );
      return false;
    }
    const prevContent = readFileSync4(taskPath2, "utf8");
    const newContent = serializeTaskFile(stampUpdated({
      ...parsed.frontmatter,
      id: taskId,
      status: targetColumn
    }), parsed.body);
    atomicWriteFileSync(taskPath2, newContent);
    pushUndo(kandownDir, {
      type: "move",
      taskId,
      path: taskPath2,
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
    const undoDir = join4(kandownDir, ".undo");
    if (!existsSync4(undoDir)) mkdirSync2(undoDir, { recursive: true });
    const logPath = join4(undoDir, "log.json");
    let list = [];
    if (existsSync4(logPath)) {
      try {
        list = JSON.parse(readFileSync4(logPath, "utf8"));
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
function createTaskInBoard(kandownDir, rawInput, status) {
  const tasksDir = getTasksDir(kandownDir);
  if (!existsSync4(tasksDir)) mkdirSync2(tasksDir, { recursive: true });
  const ids = listTaskIds(kandownDir);
  let maxN = 0;
  for (const id of ids) {
    const m = id.match(/^t(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  }
  const newId = `t${maxN + 1}`;
  const config = loadConfig(kandownDir);
  const targetStatus = status || (config.board.columns[0] ?? "Backlog");
  let text = rawInput.trim();
  let priority;
  const tags = [];
  let assignee;
  let due;
  const depends_on = [];
  text = text.replace(/(?:^|\s)p([1-4])(?:\s|$)/i, (_, level) => {
    priority = `P${level}`;
    return " ";
  });
  text = text.replace(/(?:^|\s)#([a-zA-Z0-9_-]+)/g, (_, tag) => {
    tags.push(tag.toLowerCase());
    return " ";
  });
  text = text.replace(/(?:^|\s)@([a-zA-Z0-9_-]+)/g, (_, user) => {
    assignee = user;
    return " ";
  });
  text = text.replace(/(?:^|\s)due:([^\s]+)/i, (_, d) => {
    due = d;
    return " ";
  });
  text = text.replace(/(?:^|\s)\+([a-zA-Z0-9_-]+)/g, (_, depId) => {
    depends_on.push(depId);
    return " ";
  });
  const title = text.replace(/\s+/g, " ").trim() || rawInput;
  const fm = stampUpdated({
    id: newId,
    title,
    status: targetStatus,
    created: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
  });
  if (priority) fm.priority = priority;
  if (assignee) fm.assignee = assignee;
  if (tags.length > 0) fm.tags = tags;
  if (due) fm.due = due;
  if (depends_on.length > 0) fm.depends_on = depends_on;
  const content = serializeTaskFile(fm, "");
  const taskPath2 = join4(tasksDir, `${newId}.md`);
  atomicWriteFileSync(taskPath2, content);
  pushUndo(kandownDir, {
    type: "create",
    taskId: newId,
    path: taskPath2,
    previousContent: null,
    newContent: content,
    timestamp: Date.now()
  });
  return newId;
}
function archiveTaskInBoard(kandownDir, taskId) {
  const tasksDir = getTasksDir(kandownDir);
  const taskPath2 = join4(tasksDir, `${taskId}.md`);
  if (!existsSync4(taskPath2)) return false;
  try {
    const prevContent = readFileSync4(taskPath2, "utf8");
    const archiveDir = join4(tasksDir, "archive");
    if (!existsSync4(archiveDir)) mkdirSync2(archiveDir, { recursive: true });
    const parsed = readTask(kandownDir, taskId);
    const newContent = serializeTaskFile(stampUpdated({
      ...parsed.frontmatter,
      id: taskId,
      archived: true
    }), parsed.body);
    const destPath = join4(archiveDir, `${taskId}.md`);
    atomicWriteFileSync(destPath, newContent);
    unlinkSync4(taskPath2);
    pushUndo(kandownDir, {
      type: "archive",
      taskId,
      path: destPath,
      previousContent: prevContent,
      newContent,
      timestamp: Date.now()
    });
    return true;
  } catch {
    return false;
  }
}

// src/cli/lib/mcp.ts
import { existsSync as existsSync5 } from "fs";
import { join as join5 } from "path";
function startMcpServer(kandownDir) {
  process.stdin.setEncoding("utf8");
  let buffer = "";
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const req = JSON.parse(trimmed);
        handleJsonRpc(kandownDir, req);
      } catch (e) {
        sendResponse(null, { error: { code: -32700, message: "Parse error" } });
      }
    }
  });
}
function sendResponse(id, resultOrError) {
  if (id === void 0) return;
  const resp = {
    jsonrpc: "2.0",
    id,
    ...resultOrError
  };
  process.stdout.write(JSON.stringify(resp) + "\n");
}
function handleJsonRpc(kandownDir, req) {
  const { id, method, params } = req;
  if (method === "initialize") {
    sendResponse(id, {
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "kandown", version: "0.20.0" }
      }
    });
    return;
  }
  if (method === "notifications/initialized") {
    return;
  }
  if (method === "tools/list") {
    sendResponse(id, {
      result: {
        tools: [
          {
            name: "list_tasks",
            description: "List all tasks on the Kandown board with optional filtering",
            inputSchema: {
              type: "object",
              properties: {
                status: { type: "string", description: "Filter by column/status name" },
                assignee: { type: "string", description: "Filter by assignee" },
                tag: { type: "string", description: "Filter by tag" },
                priority: { type: "string", description: "Filter by priority (P1, P2, P3, P4)" }
              }
            }
          },
          {
            name: "get_task",
            description: "Get details and full content of a specific task by ID",
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "string", description: "Task ID (e.g. t1, t42)" }
              },
              required: ["id"]
            }
          },
          {
            name: "create_task",
            description: "Create a new task on the Kandown board",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", description: "Task title (supports inline syntax #tag @user p1 due:date)" },
                status: { type: "string", description: "Target column name (default: Backlog)" },
                priority: { type: "string", description: "Priority level (P1, P2, P3, P4)" },
                assignee: { type: "string", description: "Assignee username" },
                tags: { type: "array", items: { type: "string" }, description: "Tags" },
                body: { type: "string", description: "Markdown body content" }
              },
              required: ["title"]
            }
          },
          {
            name: "move_task",
            description: "Move a task to a different column or to archived",
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "string", description: "Task ID" },
                status: { type: "string", description: 'Target column name or "archived"' }
              },
              required: ["id", "status"]
            }
          },
          {
            name: "add_report",
            description: "Append an agent execution report to a task body",
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "string", description: "Task ID" },
                report: { type: "string", description: "Markdown report content to append under ## Report" }
              },
              required: ["id", "report"]
            }
          },
          {
            name: "list_columns",
            description: "List configured board columns and task counts",
            inputSchema: { type: "object", properties: {} }
          }
        ]
      }
    });
    return;
  }
  if (method === "tools/call") {
    const { name, arguments: args = {} } = params || {};
    if (name === "list_tasks") {
      const board = readBoard(kandownDir);
      let tasks = [];
      for (const col of board.columns) {
        if (args.status && col.name.toLowerCase() !== String(args.status).toLowerCase()) continue;
        for (const t of col.tasks) {
          if (args.assignee && t.assignee !== args.assignee) continue;
          if (args.priority && t.priority !== args.priority) continue;
          if (args.tag && !t.tags.includes(args.tag)) continue;
          tasks.push({ ...t, status: col.name });
        }
      }
      sendResponse(id, { result: { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] } });
      return;
    }
    if (name === "get_task") {
      const task = readTask(kandownDir, args.id);
      sendResponse(id, { result: { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] } });
      return;
    }
    if (name === "create_task") {
      const newId = createTaskInBoard(kandownDir, args.title, args.status);
      if (args.body || args.priority || args.assignee || args.tags) {
        const task = readTask(kandownDir, newId);
        const fm = {
          ...task.frontmatter,
          ...args.priority ? { priority: args.priority } : {},
          ...args.assignee ? { assignee: args.assignee } : {},
          ...args.tags ? { tags: args.tags } : {}
        };
        const body = args.body ? (task.body + "\n\n" + args.body).trim() : task.body;
        const taskPath2 = join5(getTasksDir(kandownDir), `${newId}.md`);
        atomicWriteFileSync(taskPath2, serializeTaskFile(stampUpdated(fm), body));
      }
      sendResponse(id, { result: { content: [{ type: "text", text: `Created task ${newId}` }] } });
      return;
    }
    if (name === "move_task") {
      const ok = moveTaskToColumn(kandownDir, args.id, args.status);
      sendResponse(
        id,
        ok ? { result: { content: [{ type: "text", text: `Moved ${args.id} to ${args.status}` }] } } : { error: { code: -32602, message: `Cannot move ${args.id} to ${args.status} (gate refused or file missing)` } }
      );
      return;
    }
    if (name === "add_report") {
      const taskPath2 = join5(getTasksDir(kandownDir), `${args.id}.md`);
      if (!existsSync5(taskPath2)) {
        sendResponse(id, { error: { code: -32602, message: `Task ${args.id} not found` } });
        return;
      }
      const task = readTask(kandownDir, args.id);
      const reportSection = `

## Report

${args.report.trim()}`;
      const newBody = task.body.includes("## Report") ? task.body.replace(/## Report[\s\S]*/, `## Report

${args.report.trim()}`) : task.body.trim() + reportSection;
      atomicWriteFileSync(taskPath2, serializeTaskFile(stampUpdated(task.frontmatter), newBody));
      sendResponse(id, { result: { content: [{ type: "text", text: `Appended report to ${args.id}` }] } });
      return;
    }
    if (name === "list_columns") {
      const config = loadConfig(kandownDir);
      const board = readBoard(kandownDir);
      const cols = board.columns.map((c2) => ({ name: c2.name, count: c2.tasks.length }));
      sendResponse(id, { result: { content: [{ type: "text", text: JSON.stringify(cols, null, 2) }] } });
      return;
    }
    sendResponse(id, { error: { code: -32601, message: `Unknown tool: ${name}` } });
    return;
  }
  sendResponse(id, { error: { code: -32601, message: `Method not found: ${method}` } });
}

// src/cli/lib/browser.ts
import { spawn as spawn3 } from "child_process";
function openBrowser(target) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn3(cmd, [target], { detached: true, stdio: "ignore" }).unref();
  } catch {
  }
}

// src/cli/lib/cli-shared.ts
import { existsSync as existsSync7, readFileSync as readFileSync7, readdirSync as readdirSync4 } from "fs";
import { homedir as homedir3 } from "os";
import { join as join7, resolve as resolve2, basename, dirname as dirname4 } from "path";
import { spawn as spawn4 } from "child_process";

// src/cli/lib/init.ts
import { existsSync as existsSync6, readFileSync as readFileSync6, mkdirSync as mkdirSync3, copyFileSync, readdirSync as readdirSync3, statSync as statSync3 } from "fs";
import { join as join6 } from "path";
function copyRecursive(src, dest) {
  const errors = [];
  try {
    if (!existsSync6(dest)) mkdirSync3(dest, { recursive: true });
    const entries = readdirSync3(src);
    for (const entry of entries) {
      const srcPath = join6(src, entry);
      const destPath = join6(dest, entry);
      try {
        if (statSync3(srcPath).isDirectory()) {
          errors.push(...copyRecursive(srcPath, destPath));
        } else if (!existsSync6(destPath)) {
          copyFileSync(srcPath, destPath);
        }
      } catch (error) {
        errors.push(`${entry}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    errors.push(`${src}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return errors;
}
function syncKandownAgentDoc(kandownDir) {
  const source = join6(PKG_ROOT, "templates", "AGENT_KANDOWN.md");
  const target = join6(kandownDir, "AGENT_KANDOWN.md");
  if (!existsSync6(source)) return false;
  try {
    const expected = readFileSync6(source, "utf8");
    const existing = existsSync6(target) ? readFileSync6(target, "utf8") : null;
    if (existing === null || !existing.includes("# Kandown")) {
      atomicWriteFileSync(target, expected.endsWith("\n") ? expected : `${expected}
`);
      return true;
    }
  } catch {
  }
  return false;
}
function doInit(kandownDir) {
  try {
    mkdirSync3(kandownDir, { recursive: true });
    const htmlSrc = join6(PKG_ROOT, "dist", "index.html");
    const htmlDest = join6(kandownDir, "kandown.html");
    if (existsSync6(htmlSrc)) {
      copyFileSync(htmlSrc, htmlDest);
    }
    syncKandownAgentDoc(kandownDir);
    const templatesDir = join6(PKG_ROOT, "templates");
    if (existsSync6(templatesDir)) {
      if (!existsSync6(join6(kandownDir, "README.md")) && existsSync6(join6(templatesDir, "README.md"))) {
        copyFileSync(join6(templatesDir, "README.md"), join6(kandownDir, "README.md"));
      }
      if (!existsSync6(join6(kandownDir, "AGENT.md")) && existsSync6(join6(templatesDir, "AGENT.md"))) {
        copyFileSync(join6(templatesDir, "AGENT.md"), join6(kandownDir, "AGENT.md"));
      }
      const tasksSrc = join6(templatesDir, "tasks");
      const tasksDest = getTasksDir(kandownDir);
      if (!existsSync6(tasksDest) && existsSync6(tasksSrc)) {
        copyRecursive(tasksSrc, tasksDest);
      }
      if (!existsSync6(join6(kandownDir, "kandown.json")) && existsSync6(join6(templatesDir, "kandown.json"))) {
        copyFileSync(join6(templatesDir, "kandown.json"), join6(kandownDir, "kandown.json"));
      }
      if (!existsSync6(join6(kandownDir, "agents.json")) && existsSync6(join6(templatesDir, "agents.json"))) {
        copyFileSync(join6(templatesDir, "agents.json"), join6(kandownDir, "agents.json"));
      }
    }
    return true;
  } catch (error) {
    console.error(`Init failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

// src/cli/lib/cli-shared.ts
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
  console.error(`${c.blue}\u2139${c.reset}  ${msg}`);
}
function success(msg) {
  console.error(`${c.green}\u2713${c.reset}  ${msg}`);
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
var COMMANDS = /* @__PURE__ */ new Set([
  "init",
  "update",
  "upgrade",
  "doctor",
  "work",
  "list",
  "ls",
  "show",
  "move",
  "help",
  "daemon",
  "board",
  "settings",
  "tasks",
  "create",
  "new",
  "assign",
  "commit",
  "projects",
  "export",
  "import",
  "mcp",
  "version",
  "run",
  "agents"
]);
function splitCommand(args) {
  const withoutGlobalFlags = args.filter((arg) => arg !== "--no-update-check");
  const commandIndex = withoutGlobalFlags.findIndex((arg, index) => {
    if (arg.startsWith("-")) return false;
    if (COMMANDS.has(arg)) return true;
    return index === 0;
  });
  if (commandIndex === -1) {
    return { cmd: void 0, rest: withoutGlobalFlags };
  }
  return {
    cmd: withoutGlobalFlags[commandIndex],
    rest: [...withoutGlobalFlags.slice(0, commandIndex), ...withoutGlobalFlags.slice(commandIndex + 1)]
  };
}
function stripFirstPositional(args, value) {
  const result = [];
  let stripped = false;
  for (const arg of args) {
    if (!stripped && arg === value) {
      stripped = true;
      continue;
    }
    result.push(arg);
  }
  return result;
}
function resolveKandownDir(pathArg = ".kandown", cwd = process.cwd()) {
  if (pathArg !== ".kandown") {
    return resolve2(cwd, pathArg);
  }
  const startDir = resolve2(cwd);
  const homeDir = homedir3();
  let currentDir = startDir;
  while (true) {
    const isHomeBoundary = currentDir === homeDir && currentDir !== startDir;
    if (!isHomeBoundary) {
      if (basename(currentDir) === ".kandown" && existsSync7(join7(currentDir, "kandown.json"))) {
        return currentDir;
      }
      const candidate = join7(currentDir, ".kandown");
      if (existsSync7(join7(candidate, "kandown.json"))) {
        return candidate;
      }
    }
    if (currentDir === homeDir) break;
    if (existsSync7(join7(currentDir, ".git"))) break;
    const parentDir = dirname4(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return resolve2(cwd, pathArg);
}
function ensureKandownDir(rawArgs) {
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const kandownDir = resolveKandownDir(args.path, cwd);
  if (!existsSync7(kandownDir)) {
    info(`No .kandown/ found \u2014 auto-initializing ${c.bold}${kandownDir}${c.reset}`);
    if (!doInit(kandownDir)) {
      err(`Could not auto-initialize Kandown at ${c.bold}${kandownDir}${c.reset}`);
      process.exit(1);
    }
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
  (none)              Start web server, open browser & launch TUI
  init                Initialize Kandown in this project
  work                Output agent rules + live board digest
  list                List tasks (alias: ls)
  show <id>           Display task details
  create "<title>"    Create new task (alias: new)
  move <id> <status>  Move task column
  assign <id> <agent> Assign task to an agent (e.g. claude)
  run [id]            Cascade: run ready tasks via assigned agents (DAG chain)
  agents              List detected AI agents + catalog (.kandown/agents.json)
  extension           Manage extensions (list/enable/disable/install/create)
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
  --no-update-check   Skip the registry update check for this run
  --version           Print CLI version
  --help, -h          Show help screen
`);
}
function addMultiFlag(flags, key, value) {
  const current = flags[key];
  if (Array.isArray(current)) current.push(value);
  else if (typeof current === "string") flags[key] = [current, value];
  else flags[key] = value;
}
function taskParseArgs(argv) {
  const flags = {};
  const positional = [];
  const aliases = { s: "status", p: "priority", a: "assignee", t: "tag", m: "message" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
      const key = rawKey === "to" ? "to" : rawKey;
      const next = inlineValue ?? argv[i + 1];
      if (inlineValue === void 0 && next && !next.startsWith("-")) i++;
      const value = inlineValue ?? (next && !next.startsWith("-") ? next : true);
      if (key === "tag") addMultiFlag(flags, key, String(value));
      else flags[key] = value;
      continue;
    }
    if (/^-[spatm]$/.test(arg)) {
      const key = aliases[arg.slice(1)];
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        flags[key] = true;
      } else {
        i++;
        if (key === "tag") addMultiFlag(flags, key, value);
        else flags[key] = value;
      }
      continue;
    }
    positional.push(arg);
  }
  return { flags, positional };
}
function stringFlag(flags, ...keys) {
  for (const key of keys) {
    const value = flags[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
function listFlag(flags, key) {
  const value = flags[key];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value) return [value];
  return [];
}
function resolveStatusArg(kandownDir, status) {
  const config = loadConfig(kandownDir);
  return config.board.columns.find((col) => col.toLowerCase() === status.toLowerCase()) ?? null;
}
function taskPath(kandownDir, id, archived = false) {
  return archived ? join7(getTasksDir(kandownDir), "archive", `${id}.md`) : join7(getTasksDir(kandownDir), `${id}.md`);
}
function findTaskPath2(kandownDir, id) {
  const active = taskPath(kandownDir, id);
  if (existsSync7(active)) return active;
  const archived = taskPath(kandownDir, id, true);
  if (existsSync7(archived)) return archived;
  return null;
}
function nextTaskId(kandownDir) {
  const ids = new Set(listTaskIds(kandownDir));
  const archiveDir = join7(getTasksDir(kandownDir), "archive");
  if (existsSync7(archiveDir)) {
    for (const file of readdirSync4(archiveDir)) {
      if (file.endsWith(".md")) ids.add(file.slice(0, -3));
    }
  }
  let max = 0;
  for (const id of ids) {
    const match = id.match(/^t(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `t${max + 1}`;
}
function readTaskFile(kandownDir, id) {
  const path = findTaskPath2(kandownDir, id);
  if (!path) return null;
  const parsed = parseTaskFile(readFileSync7(path, "utf8"));
  return {
    path,
    frontmatter: { ...parsed.frontmatter, id: parsed.frontmatter.id || id },
    body: parsed.body,
    archived: path.includes("/archive/")
  };
}
function printTaskCommandsHelp() {
  log(`
${c.bold}Kandown task commands${c.reset}

  kandown list [-s status] [-p P1] [-a user] [-t tag] [--archived] [--json]
  kandown show <id>
  kandown create "title" [-p P1] [-a user] [-t tag] [--to status] [--id id] [--json]
  kandown move <id> <status|archived>
  kandown assign <id> [user]
  kandown commit [-m "message"]
`);
}
async function launchTui(screen, kandownDir) {
  if (!process.stdin.isTTY) {
    info(`TUI skipped because stdin is not interactive. Use ${c.cyan}kandown daemon status${c.reset} to inspect the web daemon.`);
    return;
  }
  const tuiPath = join7(PKG_ROOT, "bin", "tui.js");
  if (!existsSync7(tuiPath)) {
    err(`TUI binary not found at ${tuiPath}`);
    process.exit(1);
  }
  await new Promise((resolveTui) => {
    const child = spawn4(process.execPath, [tuiPath, screen, kandownDir, getCurrentVersion()], { stdio: "inherit" });
    child.on("close", (code) => {
      if (typeof code === "number" && code !== 0) process.exit(code);
      resolveTui();
    });
  });
}

// src/cli/commands/project.ts
import { existsSync as existsSync8, readFileSync as readFileSync8, copyFileSync as copyFileSync2 } from "fs";
import { join as join8, resolve as resolve3 } from "path";
import { spawn as spawn5 } from "child_process";
function cmdInit(rawArgs) {
  const args = parseArgs(rawArgs);
  const kandownDir = resolve3(process.cwd(), args.path);
  const created = doInit(kandownDir);
  if (!created) {
    err("Failed to initialize Kandown.");
    process.exit(1);
  }
  success(`Kandown initialized at ${kandownDir}`);
}
async function cmdUpdate(rawArgs) {
  const current = getCurrentVersion();
  log(`${c.bold}kandown update${c.reset} ${c.dim}\u2014 v${current}${c.reset}`);
  const latest = await new Promise((resolve8) => {
    const child = spawn5("npm", ["view", "kandown", "version"], {
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
    child.on("error", () => resolve8(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve8(null);
      const v = stdout.trim().replace(/^"|"$/g, "");
      resolve8(v || null);
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
  const kandownDir = resolve3(cwd, args.path);
  const htmlDest = join8(kandownDir, "kandown.html");
  if (existsSync8(htmlDest)) {
    const htmlSrc = resolve3(PKG_ROOT, "dist", "index.html");
    if (existsSync8(htmlSrc)) {
      copyFileSync2(htmlSrc, htmlDest);
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
  const configPath = join8(kandownDir, "kandown.json");
  if (existsSync8(configPath)) {
    try {
      JSON.parse(readFileSync8(configPath, "utf8"));
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

// src/cli/commands/tasks.ts
import { existsSync as existsSync13, readFileSync as readFileSync15, mkdirSync as mkdirSync7, readdirSync as readdirSync7 } from "fs";
import { join as join15, resolve as resolve7 } from "path";
import { spawnSync } from "child_process";

// src/cli/lib/extensions-cli.ts
import { existsSync as existsSync11, readFileSync as readFileSync13, writeFileSync as writeFileSync5, mkdirSync as mkdirSync6, cpSync, rmSync, readdirSync as readdirSync6 } from "fs";
import { join as join13, resolve as resolve6 } from "path";

// src/lib/extensions/host.ts
import { createJiti } from "jiti";
import { existsSync as existsSync10 } from "fs";
import { join as join12, resolve as resolve5 } from "path";
import { fileURLToPath as fileURLToPath3 } from "url";

// src/lib/extensions/registry.ts
var ContributionRegistry = class _ContributionRegistry {
  fields = /* @__PURE__ */ new Map();
  panels = /* @__PURE__ */ new Map();
  commands = /* @__PURE__ */ new Map();
  gates = [];
  syncs = [];
  lifecycle = /* @__PURE__ */ new Map();
  /** Namespaced key for a field, `${extId}.${fieldKey}`. */
  static fieldKey(extId, fieldKey) {
    return `${extId}.${fieldKey}`;
  }
  registerField(extId, def) {
    const key = _ContributionRegistry.fieldKey(extId, def.key);
    if (this.fields.has(key)) return false;
    this.fields.set(key, { extId, def });
    return true;
  }
  registerPanel(extId, def) {
    const key = `${extId}.${def.id}`;
    if (this.panels.has(key)) return false;
    this.panels.set(key, { extId, def });
    return true;
  }
  registerCommand(extId, def) {
    if (this.commands.has(def.name)) return false;
    this.commands.set(def.name, { extId, def });
    return true;
  }
  registerGate(extId, def) {
    this.gates.push({ extId, def });
  }
  registerSync(extId, def) {
    this.syncs.push({ extId, def });
  }
  on(extId, event, handler) {
    const list = this.lifecycle.get(event) ?? [];
    list.push({ extId, handler });
    this.lifecycle.set(event, list);
  }
  /** Removes every contribution owned by `extId`. Used on disable/quarantine. */
  clearForExt(extId) {
    for (const [k, v] of this.fields) if (v.extId === extId) this.fields.delete(k);
    for (const [k, v] of this.panels) if (v.extId === extId) this.panels.delete(k);
    for (const [k, v] of this.commands) if (v.extId === extId) this.commands.delete(k);
    this.gates = this.gates.filter((g) => g.extId !== extId);
    this.syncs = this.syncs.filter((s) => s.extId !== extId);
    for (const [event, list] of this.lifecycle) {
      const filtered = list.filter((h) => h.extId !== extId);
      if (filtered.length > 0) this.lifecycle.set(event, filtered);
      else this.lifecycle.delete(event);
    }
  }
  /** Fields belonging to `extId`. */
  fieldsFor(extId) {
    return [...this.fields.values()].filter((field) => field.extId === extId).map((field) => field.def);
  }
  /** Panels belonging to `extId`. */
  panelsFor(extId) {
    return [...this.panels.values()].filter((panel) => panel.extId === extId).map((panel) => panel.def);
  }
  reset() {
    this.fields.clear();
    this.panels.clear();
    this.commands.clear();
    this.gates.length = 0;
    this.syncs.length = 0;
    this.lifecycle.clear();
  }
};

// src/lib/extensions/loader.ts
import { readdirSync as readdirSync5, readFileSync as readFileSync9, existsSync as existsSync9 } from "fs";
import { join as join9 } from "path";
import { homedir as homedir4 } from "os";

// src/lib/extensions/manifest.ts
var REQUIRED = ["id", "name", "version", "apiVersion"];
function parseManifest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "manifest is not a JSON object" };
  }
  const m = raw;
  for (const key of REQUIRED) {
    if (m[key] === void 0 || m[key] === null || m[key] === "") {
      return { ok: false, error: `missing required field "${key}"` };
    }
  }
  if (typeof m.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(m.id)) {
    return { ok: false, error: '"id" must be kebab-case (lowercase letters, digits, hyphens)' };
  }
  if (typeof m.name !== "string") return { ok: false, error: '"name" must be a string' };
  if (typeof m.version !== "string") return { ok: false, error: '"version" must be a string' };
  if (typeof m.apiVersion !== "number" || !Number.isInteger(m.apiVersion)) {
    return { ok: false, error: '"apiVersion" must be an integer' };
  }
  if (m.minKandownVersion !== void 0 && typeof m.minKandownVersion !== "string") {
    return { ok: false, error: '"minKandownVersion" must be a string' };
  }
  if (m.permissions !== void 0 && !Array.isArray(m.permissions)) {
    return { ok: false, error: '"permissions" must be an array' };
  }
  if (m.main !== void 0 && typeof m.main !== "string") {
    return { ok: false, error: '"main" must be a string' };
  }
  return { ok: true, manifest: m };
}
function semverTuple(v) {
  return v.split(".").map((p) => Number.parseInt(p.replace(/[^\d].*$/, ""), 10) || 0).slice(0, 3);
}
function isCompatible(manifest, kandownVersion) {
  if (!manifest.minKandownVersion) return true;
  const a = semverTuple(kandownVersion);
  const b = semverTuple(manifest.minKandownVersion);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

// src/lib/extensions/loader.ts
function globalExtensionsDir() {
  return join9(homedir4(), ".kandown", "extensions");
}
function projectExtensionsDir(projectDir) {
  return join9(projectDir, ".kandown", "extensions");
}
function scanLocation(location, source) {
  let entries = [];
  try {
    entries = readdirSync5(location, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const found = [];
  for (const name of entries) {
    const dir = join9(location, name);
    const manifestPath = join9(dir, "manifest.json");
    if (!existsSync9(manifestPath)) continue;
    let raw;
    try {
      raw = JSON.parse(readFileSync9(manifestPath, "utf8"));
    } catch {
      found.push({ dir, source, manifestResult: { ok: false, error: "manifest.json is not valid JSON" } });
      continue;
    }
    found.push({ dir, source, manifestResult: parseManifest(raw) });
  }
  return found;
}
function discoverExtensions(projectDir) {
  const globalList = scanLocation(globalExtensionsDir(), "global");
  const projectList = scanLocation(projectExtensionsDir(projectDir), "project");
  const projectIds = new Set(
    projectList.map((d) => d.manifestResult.ok ? d.manifestResult.manifest.id : null).filter((x) => x !== null)
  );
  const dedupedGlobal = globalList.filter(
    (d) => !(d.manifestResult.ok && projectIds.has(d.manifestResult.manifest.id))
  );
  return [...projectList, ...dedupedGlobal];
}

// src/lib/extensions/trust.ts
import { readFileSync as readFileSync11, writeFileSync as writeFileSync4, mkdirSync as mkdirSync5 } from "fs";
import { join as join11 } from "path";

// src/lib/extensions/state.ts
import { readFileSync as readFileSync10, writeFileSync as writeFileSync3, mkdirSync as mkdirSync4, realpathSync, renameSync as renameSync2 } from "fs";
import { createHash } from "crypto";
import { homedir as homedir5 } from "os";
import { join as join10, resolve as resolve4 } from "path";
function extensionStateDir(projectDir) {
  let canonicalProject;
  try {
    canonicalProject = realpathSync(projectDir);
  } catch {
    canonicalProject = resolve4(projectDir);
  }
  const projectHash = createHash("sha256").update(canonicalProject).digest("hex").slice(0, 24);
  return join10(homedir5(), ".kandown", "project-state", projectHash, "extensions");
}
function enabledFilePath(projectDir) {
  return join10(extensionStateDir(projectDir), "enabled.json");
}
function loadEnabled(projectDir) {
  try {
    const raw = readFileSync10(enabledFilePath(projectDir), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x) => typeof x === "string"));
    return /* @__PURE__ */ new Set();
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function saveEnabled(projectDir, ids) {
  const file = enabledFilePath(projectDir);
  mkdirSync4(join10(file, ".."), { recursive: true });
  writeFileSync3(file, `${JSON.stringify([...ids].sort(), null, 2)}
`, "utf8");
}
function healthFilePath(projectDir) {
  return join10(extensionStateDir(projectDir), "health.json");
}
function loadFailureState(projectDir) {
  try {
    const parsed = JSON.parse(readFileSync10(healthFilePath(projectDir), "utf8"));
    if (parsed.version !== 1 || !parsed.extensions || typeof parsed.extensions !== "object") {
      return /* @__PURE__ */ new Map();
    }
    const records = /* @__PURE__ */ new Map();
    for (const [id, value] of Object.entries(parsed.extensions)) {
      if (!value || typeof value !== "object") continue;
      const item = value;
      if (typeof item.failures !== "number" || !Number.isInteger(item.failures) || item.failures < 1) continue;
      records.set(id, {
        failures: item.failures,
        surface: typeof item.surface === "string" ? item.surface : void 0,
        error: typeof item.error === "string" ? item.error : void 0,
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString()
      });
    }
    return records;
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
function saveFailureState(projectDir, records) {
  const file = healthFilePath(projectDir);
  const tmp = `${file}.tmp`;
  mkdirSync4(join10(file, ".."), { recursive: true });
  const extensions = Object.fromEntries([...records.entries()].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync3(tmp, `${JSON.stringify({ version: 1, extensions }, null, 2)}
`, "utf8");
  renameSync2(tmp, file);
}

// src/lib/extensions/trust.ts
function isRestricted(config) {
  const flag = config?.extensions?.restricted;
  return typeof flag === "boolean" ? flag : true;
}
function trustFilePath(projectDir) {
  return join11(extensionStateDir(projectDir), "trust.json");
}
function loadProjectTrust(projectDir) {
  try {
    const raw = readFileSync11(trustFilePath(projectDir), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x) => typeof x === "string"));
    return /* @__PURE__ */ new Set();
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function saveProjectTrust(projectDir, trusted) {
  const file = trustFilePath(projectDir);
  mkdirSync5(join11(file, ".."), { recursive: true });
  writeFileSync4(file, `${JSON.stringify([...trusted].sort(), null, 2)}
`, "utf8");
}

// src/lib/extensions/permissions.ts
function isAllowed(declared, permission) {
  if (!declared || declared.length === 0) return false;
  for (const entry of declared) {
    if (entry === permission) return true;
    if (entry === "*") return true;
    if (entry.endsWith("*") && permission.startsWith(entry.slice(0, -1))) return true;
  }
  return false;
}

// src/lib/extensions/namespace.ts
var NS = "plugins";
function getPluginData(frontmatter, extId) {
  const plugins = frontmatter[NS];
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins)) return void 0;
  const ext = plugins[extId];
  if (!ext || typeof ext !== "object" || Array.isArray(ext)) return void 0;
  return ext;
}
function coerceField(raw, type) {
  switch (type) {
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : void 0;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === "True" || raw === 1 || raw === "1";
    case "string":
    case "date":
    case "select":
    default:
      return raw === void 0 ? void 0 : String(raw);
  }
}
function readField(frontmatter, extId, key, type) {
  const data = getPluginData(frontmatter, extId);
  if (!data || data[key] === void 0) return void 0;
  return coerceField(data[key], type);
}
function setField(frontmatter, extId, key, value) {
  const out = { ...frontmatter };
  const plugins = out[NS] && typeof out[NS] === "object" && !Array.isArray(out[NS]) ? { ...out[NS] } : {};
  const ext = plugins[extId] && typeof plugins[extId] === "object" && !Array.isArray(plugins[extId]) ? { ...plugins[extId] } : {};
  if (value === void 0 || value === null || value === "") {
    delete ext[key];
  } else {
    ext[key] = value;
  }
  if (Object.keys(ext).length > 0) plugins[extId] = ext;
  else delete plugins[extId];
  if (Object.keys(plugins).length > 0) out[NS] = plugins;
  else delete out[NS];
  return out;
}

// src/lib/extensions/host.ts
var QUARANTINE_THRESHOLD = 3;
var SUPPORTED_API_VERSION = 1;
function errMsg(e) {
  return e instanceof Error ? e.message : String(e);
}
var ExtensionHost = class {
  constructor(env) {
    this.env = env;
    this.trust = loadProjectTrust(env.projectDir);
    this.enabled = loadEnabled(env.projectDir);
    this.failures = loadFailureState(env.projectDir);
  }
  env;
  registry = new ContributionRegistry();
  byExtId = /* @__PURE__ */ new Map();
  trust;
  enabled;
  failures;
  jiti;
  /** All loaded extensions, with health and provenance. */
  list() {
    return [...this.byExtId.values()];
  }
  /** One extension by id, or undefined. */
  get(id) {
    return this.byExtId.get(id);
  }
  /** Summaries of what each enabled extension contributes, for settings/CLI. */
  installedSummary() {
    return this.list().map((ext) => ({
      id: ext.manifest.id,
      name: ext.manifest.name,
      version: ext.manifest.version,
      source: ext.source,
      health: ext.health,
      error: ext.error,
      failures: ext.failures,
      permissions: [...ext.manifest.permissions ?? []],
      fields: this.registry.fieldsFor(ext.manifest.id).map((field) => ({
        extId: ext.manifest.id,
        key: field.key,
        label: field.label,
        type: field.type,
        options: field.options,
        hasBadge: typeof field.badge === "function",
        editorComponentId: field.editorComponentId
      })),
      panels: this.registry.panelsFor(ext.manifest.id).map((panel) => ({
        extId: ext.manifest.id,
        id: panel.id,
        title: panel.title,
        entry: panel.entry,
        icon: panel.icon
      })),
      commands: [...this.registry.commands.values()].filter((command) => command.extId === ext.manifest.id).map((command) => command.def.name),
      gates: this.registry.gates.filter((gate) => gate.extId === ext.manifest.id).length,
      syncs: this.registry.syncs.filter((sync) => sync.extId === ext.manifest.id).length
    }));
  }
  /**
   * 📖 Discovers and loads every extension, applying restricted mode, project
   * trust and version compatibility. Safe to call repeatedly (it resets first).
   */
  async loadAll() {
    this.registry.reset();
    this.byExtId.clear();
    const restricted = isRestricted(this.env.config);
    const discovered = discoverExtensions(this.env.projectDir);
    for (const found of discovered) {
      if (!found.manifestResult.ok) {
        this.byExtId.set(found.dir, {
          manifest: { id: "(invalid)", name: "(invalid)", version: "0", apiVersion: SUPPORTED_API_VERSION },
          health: "errored",
          error: found.manifestResult.error,
          failures: 0,
          source: found.source,
          dir: found.dir
        });
        continue;
      }
      const manifest = found.manifestResult.manifest;
      if (manifest.apiVersion !== SUPPORTED_API_VERSION) {
        this.byExtId.set(manifest.id, loaded(manifest, found.dir, found.source, "errored", `unsupported apiVersion ${manifest.apiVersion} (expected ${SUPPORTED_API_VERSION})`));
        continue;
      }
      if (!isCompatible(manifest, this.env.kandownVersion)) {
        this.byExtId.set(manifest.id, loaded(manifest, found.dir, found.source, "errored", `requires kandown >= ${manifest.minKandownVersion}`));
        continue;
      }
      const persistedFailure = this.failures.get(manifest.id);
      if (persistedFailure && persistedFailure.failures >= QUARANTINE_THRESHOLD) {
        this.byExtId.set(manifest.id, loaded(
          manifest,
          found.dir,
          found.source,
          "quarantined",
          persistedFailure.error ?? `quarantined after ${persistedFailure.failures} failures`,
          persistedFailure.failures
        ));
        continue;
      }
      if (found.source === "project" && !this.trust.has(manifest.id)) {
        this.byExtId.set(manifest.id, loaded(manifest, found.dir, found.source, "disabled", 'project extension not trusted; run "kandown extension enable"'));
        continue;
      }
      if (restricted && !this.enabled.has(manifest.id)) {
        this.byExtId.set(manifest.id, loaded(manifest, found.dir, found.source, "disabled", 'restricted mode is on; run "kandown extension enable"'));
        continue;
      }
      await this.loadEntry(manifest, found.dir, found.source, persistedFailure?.failures ?? 0);
    }
  }
  /** Loads and runs one extension's Node entry, registering its contributions. */
  async loadEntry(manifest, dir, source, failures = 0) {
    const entry = this.resolveEntry(manifest, dir);
    if (!entry) {
      this.byExtId.set(manifest.id, loaded(manifest, dir, source, "errored", "no Node entry found (index.js or index.ts)"));
      return;
    }
    try {
      const factory = await this.loadFactory(entry);
      if (typeof factory !== "function") {
        this.byExtId.set(manifest.id, loaded(manifest, dir, source, "errored", "default export is not a function"));
        return;
      }
      const kd = this.makeApi(manifest.id);
      await factory(kd);
      this.byExtId.set(manifest.id, loaded(manifest, dir, source, "enabled", void 0, failures));
    } catch (e) {
      this.registry.clearForExt(manifest.id);
      this.byExtId.set(manifest.id, loaded(manifest, dir, source, "errored", `load failed: ${errMsg(e)}`));
    }
  }
  resolveEntry(manifest, dir) {
    const mainRel = manifest.main;
    const candidates = mainRel ? [resolve5(dir, mainRel)] : [join12(dir, "index.ts"), join12(dir, "index.js"), join12(dir, "index.mjs")];
    for (const c2 of candidates) if (existsSync10(c2)) return c2;
    return null;
  }
  async loadFactory(entry) {
    if (!this.jiti) {
      const base = typeof __filename !== "undefined" ? __filename : fileURLToPath3(import.meta.url);
      this.jiti = createJiti(base);
    }
    const mod = await this.jiti.import(entry);
    return mod.default;
  }
  /** Builds the scoped `KandownExtensionAPI` an extension factory receives. */
  makeApi(extId) {
    const safe = (fn) => {
      try {
        fn();
      } catch (e) {
        this.env.log?.warn?.(`[${extId}] registration failed: ${errMsg(e)}`);
      }
    };
    return {
      id: extId,
      contributeField: (def) => safe(() => this.registry.registerField(extId, def)),
      contributeWebPanel: (def) => safe(() => this.registry.registerPanel(extId, def)),
      contributeCommand: (name, def) => safe(() => this.registry.registerCommand(extId, { ...def, name })),
      contributeGate: (def) => safe(() => this.registry.registerGate(extId, def)),
      contributeSync: (def) => safe(() => this.registry.registerSync(extId, def)),
      on: (event, handler) => this.registry.on(extId, event, handler)
    };
  }
  /** Builds the scoped `ExtensionContext` for a handler of `extId`. */
  makeContext(extId) {
    const perms = this.byExtId.get(extId)?.manifest.permissions;
    const hasNet = perms?.some((p) => p === "*" || p === "net:*" || p.startsWith("net:")) ?? false;
    const ctx = {
      extId,
      board: {
        readAll: async () => {
          if (!isAllowed(perms, "read:tasks")) throw new Error("permission denied: read:tasks");
          return this.env.readAll();
        },
        read: async (id) => {
          if (!isAllowed(perms, "read:tasks")) throw new Error("permission denied: read:tasks");
          return this.env.read(id);
        }
      },
      setField: async (taskId, key, value) => {
        const permission = `write:field:plugins.${extId}.${key}`;
        const declared = this.byExtId.get(extId)?.manifest.permissions;
        if (!isAllowed(declared, permission)) throw new Error(`permission denied: ${permission}`);
        await this.env.applyField(taskId, extId, key, value);
      },
      log: {
        info: (m) => this.env.log?.info?.(m),
        warn: (m) => this.env.log?.warn?.(m),
        error: (m) => this.env.log?.error?.(m)
      }
    };
    if (hasNet) ctx.fetch = fetch;
    return ctx;
  }
  /**
   * Validates and writes one registered field through the host. The browser can
   * never choose another extension's namespace or bypass the declared type.
   */
  async setFieldValue(taskId, extId, key, value) {
    const ext = this.byExtId.get(extId);
    if (!ext || ext.health !== "enabled") throw new Error(`extension is not enabled: ${extId}`);
    const field = this.registry.fields.get(ContributionRegistry.fieldKey(extId, key))?.def;
    if (!field) throw new Error(`unknown field: ${extId}.${key}`);
    const permission = `write:field:plugins.${extId}.${key}`;
    if (!isAllowed(ext.manifest.permissions, permission)) throw new Error(`permission denied: ${permission}`);
    let normalized = value;
    if (value !== void 0 && value !== null && value !== "") {
      normalized = coerceField(value, field.type);
      if (field.type === "number" && normalized === void 0) throw new Error(`${field.label} must be a number`);
      if (field.type === "select" && field.options && !field.options.some((option) => option.value === normalized)) {
        throw new Error(`${field.label} has an invalid option`);
      }
    }
    try {
      await this.env.applyField(taskId, extId, key, normalized);
      this.recordSuccess(extId, `field:${key}`);
    } catch (error) {
      this.recordFailure(extId, error, `field:${key}`);
      throw error;
    }
  }
  /** Computes every enabled card badge in one pass, avoiding browser N+1 calls. */
  async renderBadges() {
    const badges = {};
    const tasks = await this.env.readAll();
    for (const task of tasks) {
      const taskBadges = [];
      for (const { extId, def } of this.registry.fields.values()) {
        if (!def.badge || this.byExtId.get(extId)?.health !== "enabled") continue;
        try {
          const value = readField(task.frontmatter, extId, def.key, def.type);
          const text = def.badge(value, task);
          this.recordSuccess(extId, `badge:${def.key}`);
          if (typeof text === "string" && text.trim()) {
            taskBadges.push({ extId, fieldKey: def.key, text });
          }
        } catch (error) {
          this.recordFailure(extId, error, `badge:${def.key}`);
        }
      }
      if (taskBadges.length > 0) badges[task.id] = taskBadges;
    }
    return badges;
  }
  /** Health persistence is best-effort and must never break fail-open isolation. */
  persistFailures() {
    try {
      saveFailureState(this.env.projectDir, this.failures);
    } catch (error) {
      this.env.log?.warn?.(`Could not persist extension health: ${errMsg(error)}`);
    }
  }
  /** Bumps one surface's persistent failure counter and quarantines at the threshold. */
  recordFailure(extId, e, surface) {
    const ext = this.byExtId.get(extId);
    if (!ext || ext.health !== "enabled") return;
    const previous = this.failures.get(extId);
    ext.failures = previous?.surface === surface ? previous.failures + 1 : 1;
    const message = errMsg(e);
    this.failures.set(extId, {
      failures: ext.failures,
      surface,
      error: message,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (ext.failures >= QUARANTINE_THRESHOLD) {
      ext.health = "quarantined";
      ext.error = `quarantined after ${ext.failures} failures (last: ${message})`;
      this.failures.set(extId, {
        failures: ext.failures,
        surface,
        error: ext.error,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      this.registry.clearForExt(extId);
      this.env.log?.error?.(`[${extId}] quarantined`);
    }
    this.persistFailures();
  }
  /** Clears consecutive failures only for the same contribution surface. */
  recordSuccess(extId, surface) {
    const ext = this.byExtId.get(extId);
    const previous = this.failures.get(extId);
    if (!ext || ext.health !== "enabled" || ext.failures === 0 || previous?.surface !== surface) return;
    ext.failures = 0;
    ext.error = void 0;
    this.failures.delete(extId);
    this.persistFailures();
  }
  /** Records a browser contribution failure reported through the daemon API. */
  reportFailure(extId, error) {
    this.recordFailure(extId, error, "webPanel");
    return this.byExtId.get(extId);
  }
  /** Records a successful browser mount, resetting consecutive failures. */
  reportSuccess(extId) {
    this.recordSuccess(extId, "webPanel");
    return this.byExtId.get(extId);
  }
  /**
   * 📖 Runs every gate matching the event. Returns on the first block. A
   * throwing gate is fail-open (no objection) and counted toward quarantine.
   */
  async runGates(event) {
    for (const { extId, def } of this.registry.gates) {
      if (def.on !== event.type) continue;
      if (def.to && event.to && def.to !== event.to) continue;
      if (this.byExtId.get(extId)?.health !== "enabled") continue;
      try {
        const verdict = await def.handler(event, this.makeContext(extId));
        const surface = `gate:${def.id ?? def.on}:${def.to ?? "*"}`;
        this.recordSuccess(extId, surface);
        if (verdict?.block) {
          return { allowed: false, reason: verdict.reason ?? `Blocked by extension "${extId}"` };
        }
      } catch (e) {
        this.recordFailure(extId, e, `gate:${def.id ?? def.on}:${def.to ?? "*"}`);
      }
    }
    return { allowed: true };
  }
  /** Fires matching sync handlers, isolated. Fire-and-forget (returns void). */
  dispatchSync(event) {
    for (const { extId, def } of this.registry.syncs) {
      if (def.on !== event.type) continue;
      if (def.to && event.to && def.to !== event.to) continue;
      if (this.byExtId.get(extId)?.health !== "enabled") continue;
      const surface = `sync:${def.id ?? def.on}:${def.to ?? "*"}`;
      void Promise.resolve(def.handler(event, this.makeContext(extId))).then(() => this.recordSuccess(extId, surface)).catch((e) => this.recordFailure(extId, e, surface));
    }
  }
  /** Fires matching lifecycle handlers, isolated. */
  dispatchLifecycle(event) {
    const handlers = this.registry.lifecycle.get(event.type);
    if (!handlers) return;
    for (const { extId, handler } of handlers) {
      if (this.byExtId.get(extId)?.health !== "enabled") continue;
      const surface = `lifecycle:${event.type}`;
      void Promise.resolve(handler(event, this.makeContext(extId))).then(() => this.recordSuccess(extId, surface)).catch((e) => this.recordFailure(extId, e, surface));
    }
  }
  /** Returns a contributed command by name, or null. */
  getCommand(name) {
    const owned = this.registry.commands.get(name);
    if (!owned) return null;
    if (this.byExtId.get(owned.extId)?.health !== "enabled") return null;
    return { extId: owned.extId, handler: owned.def.handler };
  }
  /** Runs a contributed command by name. Throws if missing; isolated otherwise. */
  async runCommand(name, args) {
    const cmd = this.getCommand(name);
    if (!cmd) throw new Error(`Unknown extension command: ${name}`);
    try {
      await cmd.handler(args, this.makeContext(cmd.extId));
      this.recordSuccess(cmd.extId, `command:${name}`);
    } catch (e) {
      this.recordFailure(cmd.extId, e, `command:${name}`);
      throw e;
    }
  }
  /**
   * 📖 Enables an extension by id: trusts it (harmless for global ones), adds it
   * to the persisted enabled set, and reloads. Returns whether it ended up
   * enabled. Safe to call on a fresh host (no prior `loadAll`): the reload
   * discovers everything.
   */
  async enable(id) {
    this.failures.delete(id);
    this.persistFailures();
    this.trust.add(id);
    saveProjectTrust(this.env.projectDir, this.trust);
    this.enabled.add(id);
    saveEnabled(this.env.projectDir, this.enabled);
    await this.loadAll();
    return this.byExtId.get(id)?.health === "enabled";
  }
  /** Disables an extension (persists, clears contributions, keeps files). */
  disable(id) {
    const ext = this.byExtId.get(id);
    if (!ext) return false;
    this.enabled.delete(id);
    saveEnabled(this.env.projectDir, this.enabled);
    ext.health = "disabled";
    ext.error = void 0;
    this.registry.clearForExt(id);
    return true;
  }
};
function loaded(manifest, dir, source, health, error, failures = 0) {
  return { manifest, dir, source, health, error, failures };
}

// src/cli/lib/extensions-cli.ts
function buildHostEnvironment(kandownDir) {
  const projectDir = getProjectRoot(kandownDir);
  const toTaskLike = (id, fm) => ({
    id,
    frontmatter: fm,
    plugins: fm.plugins && typeof fm.plugins === "object" ? fm.plugins : void 0
  });
  return {
    projectDir,
    kandownVersion: getCurrentVersion(),
    config: loadConfig(kandownDir),
    async readAll() {
      return listTaskIds(kandownDir).map((id) => {
        try {
          return toTaskLike(id, readTask(kandownDir, id).frontmatter);
        } catch {
          return null;
        }
      }).filter((t) => t !== null);
    },
    async read(taskId) {
      try {
        const parsed = readTask(kandownDir, taskId);
        return toTaskLike(taskId, parsed.frontmatter);
      } catch {
        return null;
      }
    },
    async applyField(taskId, extId, key, value) {
      const taskPath2 = findTaskPath(kandownDir, taskId);
      if (!taskPath2) throw new Error(`task not found: ${taskId}`);
      const parsed = readTask(kandownDir, taskId);
      const next = setField(parsed.frontmatter, extId, key, value);
      atomicWriteFileSync(taskPath2, serializeTaskFile(stampUpdated(next), parsed.body));
    },
    log: {
      info: (m) => info(m),
      warn: (m) => info(`[warn] ${m}`),
      error: (m) => err(m)
    }
  };
}
async function loadExtensionHost(kandownDir) {
  const host = new ExtensionHost(buildHostEnvironment(kandownDir));
  await host.loadAll();
  return host;
}
async function runExtensionMoveGates(host, kandownDir, taskId, fromStatus, to) {
  let task;
  try {
    const parsed = readTask(kandownDir, taskId);
    const fm = parsed.frontmatter;
    task = { id: taskId, frontmatter: fm, plugins: fm.plugins };
  } catch {
    task = { id: taskId, frontmatter: {} };
  }
  return host.runGates({ type: "task:beforeMove", task, from: fromStatus, to });
}
async function dispatchContributedCommand(kandownDir, name, args) {
  const host = await loadExtensionHost(kandownDir);
  if (!host.getCommand(name)) return false;
  await host.runCommand(name, args);
  return true;
}
async function cmdExtension(rawArgs) {
  const args = taskParseArgs(rawArgs);
  const sub = args.positional[0];
  const { kandownDir } = ensureKandownDir(rawArgs);
  const usage = `${c.cyan}kandown extension${c.reset} ${c.dim}<list|enable|disable|install|create|purge>${c.reset}`;
  if (!sub) {
    log(usage);
    return;
  }
  const host = await loadExtensionHost(kandownDir);
  switch (sub) {
    case "list":
    case "ls": {
      const summary = host.installedSummary();
      if (summary.length === 0) {
        info("No extensions installed. Try: kandown extension create <name>");
        return;
      }
      for (const s of summary) {
        const tag = s.health === "enabled" ? c.green : s.health === "errored" || s.health === "quarantined" ? c.red : c.dim;
        log(`${tag}${s.health.padEnd(11)}${c.reset} ${c.bold}${s.id}${c.reset} ${c.dim}v${s.version}${c.reset} [${s.source}] ${s.name}`);
        if (s.error) log(`             ${c.dim}\u21B3 ${s.error}${c.reset}`);
        const bits = [
          s.fields.length && `${s.fields.length} field(s)`,
          s.panels.length && `${s.panels.length} panel(s)`,
          s.commands.length && `${s.commands.length} command(s)`,
          s.gates && `${s.gates} gate(s)`,
          s.syncs && `${s.syncs} sync(s)`
        ].filter(Boolean).join(", ");
        if (bits) log(`             ${c.dim}${bits}${c.reset}`);
      }
      return;
    }
    case "enable": {
      const id = args.positional[1];
      if (!id) {
        err("Usage: kandown extension enable <id>");
        process.exit(1);
      }
      const ok = await host.enable(id);
      ok ? success(`Enabled ${id}`) : err(`Could not enable ${id} (not found, incompatible, or errored)`);
      return;
    }
    case "disable": {
      const id = args.positional[1];
      if (!id) {
        err("Usage: kandown extension disable <id>");
        process.exit(1);
      }
      host.disable(id) ? success(`Disabled ${id}`) : err(`Not installed: ${id}`);
      return;
    }
    case "purge": {
      const id = args.positional[1];
      if (!id) {
        err("Usage: kandown extension purge <id>");
        process.exit(1);
      }
      const count = purgePluginData(kandownDir, id);
      success(`Purged plugins.${id}.* from ${count} task(s).`);
      return;
    }
    case "install": {
      const target = args.positional[1];
      if (!target) {
        err("Usage: kandown extension install <path-or-github-url>");
        process.exit(1);
      }
      const installedId = await installExtension(kandownDir, target);
      installedId ? success(`Installed ${installedId}. Enable it with: kandown extension enable ${installedId}`) : err("Install failed.");
      return;
    }
    case "create": {
      const name = args.positional[1];
      if (!name) {
        err("Usage: kandown extension create <kebab-name>");
        process.exit(1);
      }
      scaffoldExtension(kandownDir, name);
      success(`Scaffolded extension "${name}" at .kandown/extensions/${name}/`);
      info("Edit index.ts, then: kandown extension enable " + name);
      return;
    }
    default:
      err(`Unknown extension subcommand: ${sub}`);
      log(usage);
  }
}
function purgePluginData(kandownDir, extId) {
  const projectDir = getProjectRoot(kandownDir);
  const tasksDir = join13(projectDir, "tasks");
  let count = 0;
  if (!existsSync11(tasksDir)) return 0;
  for (const file of readdirSync6(tasksDir)) {
    if (!file.endsWith(".md")) continue;
    const path = join13(tasksDir, file);
    const raw = readFileSync13(path, "utf8");
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch || !raw.includes(`plugins:`)) continue;
    const parsed = parseTaskFile(raw);
    const fm = parsed.frontmatter;
    const plugins = fm.plugins;
    if (!plugins || !(extId in plugins)) continue;
    delete plugins[extId];
    if (Object.keys(plugins).length === 0) delete fm.plugins;
    atomicWriteFileSync(path, serializeTaskFile(stampUpdated(fm), parsed.body));
    count++;
  }
  return count;
}
async function installExtension(kandownDir, target) {
  const projectDir = getProjectRoot(kandownDir);
  const destRoot = join13(projectDir, ".kandown", "extensions");
  mkdirSync6(destRoot, { recursive: true });
  const src = resolve6(target);
  if (existsSync11(src) && existsSync11(join13(src, "manifest.json"))) {
    const manifest = JSON.parse(readFileSync13(join13(src, "manifest.json"), "utf8"));
    if (!manifest.id) return null;
    const dest = join13(destRoot, manifest.id);
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    return manifest.id;
  }
  err("install currently supports a local directory containing manifest.json. GitHub URL fetch is coming soon.");
  return null;
}
function scaffoldExtension(kandownDir, name) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) {
    err("name must be kebab-case (lowercase letters, digits, hyphens)");
    process.exit(1);
  }
  const projectDir = getProjectRoot(kandownDir);
  const dir = join13(projectDir, ".kandown", "extensions", name);
  if (existsSync11(dir)) {
    err(`Already exists: ${dir}`);
    process.exit(1);
  }
  mkdirSync6(dir, { recursive: true });
  const manifest = {
    id: name,
    name,
    version: "0.1.0",
    apiVersion: 1,
    description: "A kandown extension.",
    permissions: ["read:tasks", `write:field:plugins.${name}.*`],
    contributes: { fields: [], webPanels: [], commands: [], gates: [] }
  };
  writeFileSync5(join13(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}
`);
  const indexTs = `// ${name} \u2014 a kandown extension. See docs/EXTENSIONS.md.
// Loaded via jiti, no build step. Register contributions on the \`kd\` API.
import type { KandownExtensionAPI } from 'kandown';

export default function (kd: KandownExtensionAPI) {
  // Example: a custom field stored under plugins.${name}.<key>.
  kd.contributeField({ key: 'note', label: 'Note', type: 'string' });

  // Example: a CLI command surfaced as: kandown ${name}
  kd.contributeCommand('${name}', {
    description: 'Example contributed command',
    handler: async (_args, ctx) => {
      const tasks = await ctx.board.readAll();
      ctx.log.info(\`${name} sees \${tasks.length} task(s)\`);
    },
  });
}
`;
  writeFileSync5(join13(dir, "index.ts"), indexTs);
  writeFileSync5(join13(dir, "README.md"), `# ${name}

A kandown extension. Enable with \`kandown extension enable ${name}\`.
`);
}

// src/cli/lib/agents.ts
import { execFileSync as execFileSync3 } from "child_process";

// src/cli/lib/agents-config.ts
import { existsSync as existsSync12, readFileSync as readFileSync14 } from "fs";
import { join as join14 } from "path";
var AGENTS_CONFIG_VERSION = 1;
var DEFAULT_CASCADE = {
  unassignedBehavior: "skip",
  sameSessionChain: false
};
function defaultAgentsConfig() {
  return {
    version: AGENTS_CONFIG_VERSION,
    preferred: "claude",
    cascade: { ...DEFAULT_CASCADE },
    agents: [
      { id: "claude", name: "Claude Code", bin: "claude", interactive: true, description: "Anthropic Claude (interactive session)", aliases: ["claude", "claudecode", "anthropic", "claudeai"] },
      { id: "codex", name: "OpenAI Codex", bin: "codex", interactive: true, description: "OpenAI Codex CLI", aliases: ["codex", "openaicodex"] },
      { id: "gemini", name: "Gemini CLI", bin: "gemini", interactive: true, description: "Google Gemini CLI", aliases: ["gemini", "geminicli", "googlegemini"] },
      { id: "goose", name: "Goose", bin: "goose", interactive: false, description: "Block open-source AI agent", aliases: ["goose", "blockgoose"] },
      { id: "aider", name: "Aider", bin: "aider", interactive: true, description: "Git-aware AI pair programmer", aliases: ["aider"] },
      { id: "opencode", name: "OpenCode", bin: "opencode", interactive: true, description: "SST AI coding TUI", aliases: ["opencode", "sstopencode"] },
      { id: "cursor", name: "Cursor", bin: "cursor", interactive: true, description: "Cursor IDE (opens project; paste prompt)", aliases: ["cursor"] },
      { id: "pi", name: "Pi", bin: "pi", interactive: true, description: "Earendil Works pi coding agent", aliases: ["pi", "piearendil", "picodingagent"] }
    ]
  };
}
function loadAgentsConfig(kandownDir) {
  const path = join14(kandownDir, "agents.json");
  if (!existsSync12(path)) return defaultAgentsConfig();
  let raw;
  try {
    raw = JSON.parse(readFileSync14(path, "utf8"));
  } catch (e) {
    const err3 = e;
    if (err3.code === "ENOENT") return defaultAgentsConfig();
    console.warn(`[kandown] agents.json is corrupted, using defaults: ${e.message}`);
    return defaultAgentsConfig();
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    console.warn("[kandown] agents.json must be a JSON object, using defaults.");
    return defaultAgentsConfig();
  }
  const obj = raw;
  const base = defaultAgentsConfig();
  const agentsRaw = Array.isArray(obj.agents) ? obj.agents : [];
  const agents = agentsRaw.filter((a) => !!a && typeof a === "object" && !Array.isArray(a)).filter((a) => typeof a.id === "string" && typeof a.bin === "string").map((a) => ({
    id: String(a.id),
    name: typeof a.name === "string" ? a.name : String(a.id),
    bin: String(a.bin),
    ...Array.isArray(a.aliases) ? { aliases: a.aliases.map(String) } : {},
    ...typeof a.interactive === "boolean" ? { interactive: a.interactive } : {},
    ...typeof a.description === "string" ? { description: a.description } : {},
    ...Array.isArray(a.extraArgs) ? { extraArgs: a.extraArgs.map(String) } : {},
    ...typeof a.launchMode === "string" ? { launchMode: a.launchMode } : {},
    ...typeof a.promptFlag === "string" ? { promptFlag: a.promptFlag } : {}
  }));
  return {
    version: typeof obj.version === "number" ? obj.version : base.version,
    ...typeof obj.preferred === "string" ? { preferred: obj.preferred } : { preferred: base.preferred },
    cascade: resolveCascade(obj.cascade),
    agents: agents.length > 0 ? agents : base.agents
  };
}
function resolveCascade(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_CASCADE };
  const c2 = raw;
  const ub = c2.unassignedBehavior;
  const ssc = c2.sameSessionChain;
  return {
    unassignedBehavior: ub === "preferred" ? "preferred" : ub === "skip" ? "skip" : DEFAULT_CASCADE.unassignedBehavior,
    sameSessionChain: typeof ssc === "boolean" ? ssc : DEFAULT_CASCADE.sameSessionChain
  };
}
function saveAgentsConfig(kandownDir, config) {
  const path = join14(kandownDir, "agents.json");
  atomicWriteFileSync(path, JSON.stringify(config, null, 2) + "\n");
}

// src/cli/lib/agents.ts
function combinedPrompt(opts) {
  return `${opts.systemPrompt}

---

${opts.taskPrompt}`;
}
var AGENTS = [
  {
    id: "claude",
    name: "Claude Code",
    bin: "claude",
    description: "Anthropic Claude (interactive session)",
    interactive: true,
    aliases: ["claude", "claudecode", "anthropic", "claudeai"],
    buildCommand: (opts) => ["claude", combinedPrompt(opts)]
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    bin: "codex",
    description: "OpenAI Codex CLI",
    interactive: true,
    aliases: ["codex", "openaicodex"],
    buildCommand: (opts) => ["codex", combinedPrompt(opts)]
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    bin: "gemini",
    description: "Google Gemini CLI",
    interactive: true,
    aliases: ["gemini", "geminicli", "googlegemini"],
    buildCommand: (opts) => {
      return ["gemini", "--prompt-interactive", combinedPrompt(opts)];
    }
  },
  {
    id: "goose",
    name: "Goose",
    bin: "goose",
    description: "Block open-source AI agent",
    interactive: false,
    aliases: ["goose", "blockgoose"],
    buildCommand: (opts) => ["goose", "run", "--text", combinedPrompt(opts)]
  },
  {
    id: "aider",
    name: "Aider",
    bin: "aider",
    description: "Git-aware AI pair programmer",
    interactive: true,
    aliases: ["aider"],
    buildCommand: (opts) => ["aider", "--message", combinedPrompt(opts)]
  },
  {
    id: "opencode",
    name: "OpenCode",
    bin: "opencode",
    description: "SST AI coding TUI",
    interactive: true,
    aliases: ["opencode", "sstopencode"],
    buildCommand: (opts) => {
      return ["opencode", "--prompt", combinedPrompt(opts)];
    }
  },
  {
    id: "cursor",
    name: "Cursor",
    bin: "cursor",
    description: "Cursor IDE (opens project; paste prompt)",
    interactive: true,
    aliases: ["cursor"],
    // 📖 Cursor is an IDE, not a prompt-taking CLI: there is no documented flag
    // to inject a task prompt, so we open the project root and rely on the
    // KANDOWN_CONTEXT_FILE env var (set by the launcher) + the prompt printed
    // to the terminal for the user to paste into Cursor's agent panel.
    buildCommand: (opts) => ["cursor", getProjectCwd(opts.kandownDir)]
  },
  {
    id: "pi",
    name: "Pi",
    bin: "pi",
    description: "Earendil Works pi coding agent",
    interactive: true,
    aliases: ["pi", "piearendil", "picodingagent"],
    buildCommand: (opts) => ["pi", combinedPrompt(opts)]
  },
  // 📖 Wide-compat push (mode-chasse / exa) — every entry here must also
  // exist in src/lib/agent-aliases.ts (alias table) and src/components/
  // agentIcons.tsx (brand glyph / kind). The `which <bin>` check happens
  // implicitly via isAgentInstalled — entries that aren't on PATH simply
  // don't show in the picker.
  {
    id: "crush",
    name: "Crush",
    bin: "crush",
    description: "Charmbracelet Crush (Glamourous agentic TUI)",
    interactive: true,
    aliases: ["crush", "charmbraceletcrush"],
    buildCommand: (opts) => ["crush", combinedPrompt(opts)]
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    bin: "openclaw",
    description: "OpenClaw Foundation personal AI assistant",
    interactive: true,
    aliases: ["openclaw", "openclawfoundation", "claw"],
    buildCommand: (opts) => ["openclaw", combinedPrompt(opts)]
  },
  {
    id: "kimi",
    name: "Kimi Code CLI",
    bin: "kimi",
    description: "Moonshot Kimi Code CLI (terminal coding agent)",
    interactive: true,
    aliases: ["kimi", "moonshot", "moonshotai", "kimicode"],
    buildCommand: (opts) => ["kimi", combinedPrompt(opts)]
  },
  {
    id: "qwen",
    name: "Qwen Code",
    bin: "qwen",
    description: "Alibaba Qwen3-Coder CLI (QwenLM/qwen-code)",
    interactive: true,
    aliases: ["qwen", "qwencode", "qwenlm", "alibabaqwen"],
    buildCommand: (opts) => ["qwen", combinedPrompt(opts)]
  },
  {
    id: "vibe",
    name: "Mistral Vibe",
    bin: "vibe",
    description: "Mistral Vibe CLI (Devstral-powered)",
    interactive: true,
    aliases: ["vibe", "mistralvibe"],
    buildCommand: (opts) => ["vibe", combinedPrompt(opts)]
  },
  {
    id: "grok",
    name: "Grok Build",
    bin: "grok",
    description: "xAI Grok Build (terminal coding agent, pow. by Grok 4.5)",
    interactive: true,
    aliases: ["grok", "grokbuild", "xaigrok", "xai"],
    buildCommand: (opts) => ["grok", combinedPrompt(opts)]
  },
  {
    id: "openhands",
    name: "OpenHands",
    bin: "openhands",
    description: "OpenHands CLI (Python; multi-agent)",
    interactive: true,
    aliases: ["openhands", "openhandscli", "openhand"],
    buildCommand: (opts) => ["openhands", combinedPrompt(opts)]
  },
  {
    id: "pplx",
    name: "Perplexity CLI",
    bin: "pplx",
    description: "Perplexity pplx CLI (search + agent capabilities)",
    interactive: true,
    aliases: ["pplx", "pplxcli", "perplexitycli", "perplexity"],
    buildCommand: (opts) => ["pplx", combinedPrompt(opts)]
  }
];
function getProjectCwd(kandownDir) {
  const m = kandownDir.replace(/\/(\.kandown|kandown)$/, "");
  return m && m !== kandownDir ? m : process.cwd();
}
var installCache = /* @__PURE__ */ new Map();
function detectCatalogJSON(kandownDir) {
  const catalog = loadCatalog(kandownDir);
  const preferred = kandownDir ? loadAgentsConfig(kandownDir).preferred : void 0;
  return {
    ...preferred ? { preferred } : {},
    agents: catalog.map((a) => ({
      id: a.id,
      name: a.name,
      bin: a.bin,
      installed: isAgentInstalled(a.bin),
      interactive: a.interactive,
      description: a.description,
      aliases: a.aliases ?? [],
      ...preferred === a.id ? { preferred: true } : {}
    }))
  };
}
function isAgentInstalled(bin) {
  if (installCache.has(bin)) return installCache.get(bin);
  try {
    execFileSync3("which", [bin], { stdio: "ignore" });
    installCache.set(bin, true);
    return true;
  } catch {
    installCache.set(bin, false);
    return false;
  }
}
function warmupDetection(catalog) {
  for (const agent of catalog) {
    if (!installCache.has(agent.bin)) isAgentInstalled(agent.bin);
  }
}
function loadCatalog(kandownDir) {
  const builtins = AGENTS;
  if (!kandownDir) return builtins.map(cloneDef);
  const cfg = loadAgentsConfig(kandownDir);
  const byId = /* @__PURE__ */ new Map();
  for (const b of builtins) byId.set(b.id, cloneDef(b));
  const custom = [];
  for (const entry of cfg.agents) {
    const existing = byId.get(entry.id);
    if (existing) {
      existing.name = entry.name ?? existing.name;
      existing.bin = entry.bin ?? existing.bin;
      existing.description = entry.description ?? existing.description;
      if (typeof entry.interactive === "boolean") existing.interactive = entry.interactive;
      if (entry.aliases) existing.aliases = entry.aliases;
      if (entry.extraArgs) existing.extraArgs = entry.extraArgs;
    } else {
      custom.push(catalogEntryToDef(entry));
    }
  }
  return [...builtins.map((b) => byId.get(b.id)), ...custom];
}
function cloneDef(d) {
  const { buildCommand, ...rest } = d;
  const copy = { ...rest, interactive: d.interactive };
  if (buildCommand) copy.buildCommand = buildCommand;
  if (d.aliases) copy.aliases = [...d.aliases];
  if (d.extraArgs) copy.extraArgs = [...d.extraArgs];
  return copy;
}
function catalogEntryToDef(entry) {
  return {
    id: entry.id,
    name: entry.name,
    bin: entry.bin,
    interactive: entry.interactive ?? true,
    description: entry.description ?? `${entry.name} (custom)`,
    ...entry.aliases ? { aliases: [...entry.aliases] } : {},
    ...entry.extraArgs ? { extraArgs: [...entry.extraArgs] } : {},
    ...entry.launchMode ? { launchMode: entry.launchMode } : {},
    ...entry.promptFlag ? { promptFlag: entry.promptFlag } : {}
  };
}
function detectInstalledAgents(kandownDir) {
  const catalog = loadCatalog(kandownDir);
  return catalog.filter((agent) => isAgentInstalled(agent.bin));
}
function getAgentById(id, kandownDir) {
  return loadCatalog(kandownDir).find((a) => a.id === id);
}
function normAlias(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function resolveAgentEntry(assignee, kandownDir) {
  if (!assignee) return void 0;
  const norm = normAlias(assignee);
  if (!norm) return void 0;
  const catalog = loadCatalog(kandownDir);
  for (const agent of catalog) {
    if (normAlias(agent.id) === norm) return agent;
    if (agent.aliases?.some((a) => normAlias(a) === norm)) return agent;
  }
  return void 0;
}
function buildAgentCommand(agent, opts) {
  let base;
  if (agent.buildCommand) {
    base = agent.buildCommand(opts);
  } else {
    base = genericCommand(agent, opts);
  }
  if (agent.extraArgs && agent.extraArgs.length > 0) {
    base = [...base, ...agent.extraArgs];
  }
  return base;
}
function genericCommand(agent, opts) {
  const prompt = combinedPrompt(opts);
  switch (agent.launchMode ?? "positional") {
    case "prompt-flag":
      return [agent.bin, agent.promptFlag ?? "--prompt", prompt];
    case "message-flag":
      return [agent.bin, agent.promptFlag ?? "--message", prompt];
    case "text-flag":
      return [agent.bin, agent.promptFlag ?? "--text", prompt];
    case "positional":
    default:
      return [agent.bin, prompt];
  }
}
function getCascadeConfig(kandownDir) {
  const cfg = loadAgentsConfig(kandownDir);
  const cascade = resolveCascade(cfg.cascade);
  return {
    unassignedBehavior: cascade.unassignedBehavior,
    sameSessionChain: cascade.sameSessionChain,
    ...typeof cfg.preferred === "string" ? { preferred: cfg.preferred } : {}
  };
}
function buildPrompt(agentDoc, taskContent, taskId, kandownDir, handoff, queue) {
  const handoffBlock = handoff && handoff.length > 0 ? [
    "## Context from upstream tasks (cascade handoff)",
    "",
    ...handoff.flatMap((h) => [
      `### ${h.taskId} \u2014 ${h.title}`,
      h.report?.trim() ? h.report.trim() : "_(no completion report written)_",
      ""
    ]),
    "Use the above as prior context. Do not redo work that is already done; build on it.",
    "",
    "---",
    ""
  ].join("\n") : "";
  const queueBlock = queue && queue.length > 0 ? [
    "## Your queue (same-session cascade)",
    "",
    'Work through these tasks strictly in order. For each one: set its status to "In Progress", do the work, update the task file as you go, then set it to "Done" with a completion report before starting the next.',
    "",
    ...queue.map((q, i) => `${i + 1}. ${q.id} \u2014 ${q.title}`),
    "",
    "When the whole queue is Done, stop.",
    "",
    "---",
    ""
  ].join("\n") : "";
  const systemPrompt = agentDoc.trim();
  const taskPrompt = [
    queueBlock,
    handoffBlock,
    `## Your Task: ${taskId}`,
    "",
    taskContent.trim(),
    "",
    "---",
    "",
    `**Start working on task ${taskId} now.**`,
    "",
    `The kandown directory is at: \`${kandownDir}\``,
    "",
    "Before anything else:",
    `1. Set task ${taskId} frontmatter status to "In Progress" (it may already be there \u2014 that's fine)`,
    "2. Work through each subtask, checking them off and adding reports as you go",
    '3. When done, write the completion report and set the task status to "Done"'
  ].join("\n");
  return { systemPrompt, taskPrompt };
}

// src/cli/commands/tasks.ts
function cmdList(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const includeArchived = args.flags.archived === true;
  const statusFilter = stringFlag(args.flags, "status")?.toLowerCase() ?? null;
  const priorityFilter = stringFlag(args.flags, "priority")?.toUpperCase() ?? null;
  const assigneeFilter = stringFlag(args.flags, "assignee");
  const tagFilters = listFlag(args.flags, "tag").map((tag) => tag.toLowerCase());
  const rows = [];
  for (const id of listTaskIds(kandownDir)) {
    const task = readTask(kandownDir, id);
    rows.push({
      id,
      title: task.frontmatter.title || id,
      status: task.frontmatter.status || "Backlog",
      priority: task.frontmatter.priority || "",
      assignee: task.frontmatter.assignee || "",
      tags: Array.isArray(task.frontmatter.tags) ? task.frontmatter.tags : [],
      archived: false
    });
  }
  if (includeArchived) {
    const archiveDir = join15(getTasksDir(kandownDir), "archive");
    if (existsSync13(archiveDir)) {
      for (const file of readdirSync7(archiveDir).filter((name) => name.endsWith(".md"))) {
        const id = file.slice(0, -3);
        const parsed = parseTaskFile(readFileSync15(join15(archiveDir, file), "utf8"));
        rows.push({
          id,
          title: parsed.frontmatter.title || id,
          status: `${parsed.frontmatter.status || "Backlog"} (archived)`,
          priority: parsed.frontmatter.priority || "",
          assignee: parsed.frontmatter.assignee || "",
          tags: Array.isArray(parsed.frontmatter.tags) ? parsed.frontmatter.tags : [],
          archived: true
        });
      }
    }
  }
  const filtered = rows.filter((row) => {
    if (statusFilter && row.status.toLowerCase() !== statusFilter) return false;
    if (priorityFilter && row.priority.toUpperCase() !== priorityFilter) return false;
    if (assigneeFilter && row.assignee !== assigneeFilter) return false;
    if (tagFilters.length > 0 && !tagFilters.every((tag) => row.tags.map((t) => t.toLowerCase()).includes(tag))) return false;
    return true;
  });
  if (args.flags.json === true) {
    process.stdout.write(JSON.stringify(filtered, null, 2) + "\n");
    return;
  }
  const byStatus = /* @__PURE__ */ new Map();
  for (const row of filtered) {
    const list = byStatus.get(row.status) ?? [];
    list.push(row);
    byStatus.set(row.status, list);
  }
  for (const [status, tasks] of byStatus) {
    log(`
${c.bold}${status}${c.reset} (${tasks.length})`);
    for (const task of tasks) {
      const pri = task.priority || "P2";
      const assignee = task.assignee ? ` @${task.assignee}` : "";
      log(`  ${c.cyan}${task.id}${c.reset} [${pri}] ${task.title}${assignee}`);
    }
  }
  log("");
}
function cmdShow(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const id = args.positional[0];
  if (!id) {
    err("Usage: kandown show <task-id>");
    process.exit(1);
  }
  const path = findTaskPath2(kandownDir, id);
  if (!path) {
    err(`Task not found: ${id}`);
    process.exit(1);
  }
  process.stdout.write(readFileSync15(path, "utf8"));
}
function cmdCreate(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const title = args.positional.join(" ").trim();
  if (!title) {
    err('Usage: kandown create "title" [-p P1] [-a user] [-t tag] [--to status] [--id custom-id] [--json]');
    process.exit(1);
  }
  const id = stringFlag(args.flags, "id") ?? nextTaskId(kandownDir);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    err(`Invalid task id: ${id}`);
    process.exit(1);
  }
  if (findTaskPath2(kandownDir, id)) {
    err(`Task already exists: ${id}`);
    process.exit(1);
  }
  const config = loadConfig(kandownDir);
  const rawStatus = stringFlag(args.flags, "to", "status");
  const status = rawStatus ? resolveStatusArg(kandownDir, rawStatus) : config.board.columns[0] || "Backlog";
  if (!status) {
    err(`Unknown status: ${rawStatus}`);
    process.exit(1);
  }
  const fm = stampUpdated({
    id,
    title,
    status,
    created: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
  });
  const priority = stringFlag(args.flags, "priority")?.toUpperCase();
  const assignee = stringFlag(args.flags, "assignee");
  const tags = listFlag(args.flags, "tag");
  if (priority) fm.priority = priority;
  if (assignee) fm.assignee = assignee;
  if (tags.length > 0) fm.tags = tags;
  const tasksDir = getTasksDir(kandownDir);
  if (!existsSync13(tasksDir)) mkdirSync7(tasksDir, { recursive: true });
  const path = taskPath(kandownDir, id);
  atomicWriteFileSync(path, serializeTaskFile(fm, ""));
  process.stderr.write(`${c.green}\u2713${c.reset} Created ${c.bold}${id}${c.reset} \u2192 ${status}
`);
  process.stdout.write(args.flags.json === true ? JSON.stringify(fm, null, 2) + "\n" : `${id}
`);
}
async function cmdMove(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const id = args.positional[0];
  const rawStatus = args.positional.slice(1).join(" ") || stringFlag(args.flags, "to", "status");
  if (!id || !rawStatus) {
    err("Usage: kandown move <task-id> <status>");
    process.exit(1);
  }
  if (rawStatus.toLowerCase() === "archived") {
    if (!archiveTaskInBoard(kandownDir, id)) {
      err(`Archive failed: ${id}`);
      process.exit(1);
    }
    success(`Archived ${id}`);
    return;
  }
  const status = resolveStatusArg(kandownDir, rawStatus);
  if (!status) {
    err(`Unknown status: ${rawStatus}`);
    process.exit(1);
  }
  const host = await loadExtensionHost(kandownDir);
  let fromStatus;
  try {
    fromStatus = readTask(kandownDir, id).frontmatter.status;
  } catch {
  }
  const gate = await runExtensionMoveGates(host, kandownDir, id, fromStatus, status);
  if (!gate.allowed) {
    err(`Cannot move ${id} to ${status}: ${gate.reason ?? "blocked by an extension"}`);
    process.exit(1);
  }
  if (!moveTaskToColumn(kandownDir, id, status)) {
    err(`Move failed: ${id}`);
    process.exit(1);
  }
  try {
    const moved = readTask(kandownDir, id);
    const fm = moved.frontmatter;
    host.dispatchSync({ type: "task:afterMove", task: { id, frontmatter: fm, plugins: fm.plugins }, from: fromStatus, to: status });
  } catch {
  }
  success(`Moved ${id} \u2192 "${status}"`);
}
function cmdAssign(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const [id, assignee] = args.positional;
  if (!id) {
    err("Usage: kandown assign <task-id> [assignee]");
    process.exit(1);
  }
  const task = readTaskFile(kandownDir, id);
  if (!task) {
    err(`Task not found: ${id}`);
    process.exit(1);
  }
  const frontmatter = { ...task.frontmatter, id };
  if (assignee) {
    const resolved = resolveAgentEntry(assignee, kandownDir);
    frontmatter.assignee = resolved ? resolved.id : assignee;
  } else {
    delete frontmatter.assignee;
  }
  atomicWriteFileSync(task.path, serializeTaskFile(stampUpdated(frontmatter), task.body));
  success(assignee ? `Assigned ${id} \u2192 ${frontmatter.assignee ?? assignee}` : `Unassigned ${id}`);
}
function cmdCommit(rawArgs) {
  ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const message = stringFlag(args.flags, "message") || "tasks: update kandown board";
  const add = spawnSync("git", ["add", "tasks", ".kandown/kandown.json"], { stdio: "inherit" });
  if (add.status !== 0) process.exit(add.status ?? 1);
  const commit = spawnSync("git", ["commit", "-m", message], { stdio: "inherit" });
  process.exit(commit.status ?? 1);
}
function cmdExport(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const board = readBoard(kandownDir);
  process.stdout.write(JSON.stringify(board, null, 2) + "\n");
}
function cmdProjects(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const metadataPath2 = join15(kandownDir, "daemon.json");
  if (!existsSync13(metadataPath2)) {
    info("No daemon metadata for this project.");
    return;
  }
  process.stdout.write(readFileSync15(metadataPath2, "utf8").trim() + "\n");
}
function cmdImport(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const file = args.positional[0];
  if (!file) {
    err("Usage: kandown import <file.json> [--overwrite]");
    process.exit(1);
  }
  const importPath = resolve7(process.cwd(), file);
  if (!existsSync13(importPath)) {
    err(`Import file not found: ${file}`);
    process.exit(1);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync15(importPath, "utf8"));
  } catch (error) {
    err(`Import file must be JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const rows = [];
  if (Array.isArray(raw)) {
    rows.push(...raw.filter((value) => typeof value === "object" && value !== null));
  } else if (typeof raw === "object" && raw !== null && Array.isArray(raw.columns)) {
    for (const column of raw.columns) {
      if (typeof column !== "object" || column === null) continue;
      const col = column;
      if (!Array.isArray(col.tasks)) continue;
      for (const task of col.tasks) {
        if (typeof task === "object" && task !== null) rows.push({ ...task, status: String(col.name || "Backlog") });
      }
    }
  }
  if (rows.length === 0) {
    err("No tasks found to import. Expected a list JSON array or kandown export object.");
    process.exit(1);
  }
  const tasksDir = getTasksDir(kandownDir);
  if (!existsSync13(tasksDir)) mkdirSync7(tasksDir, { recursive: true });
  let imported = 0;
  for (const row of rows) {
    const id = typeof row.id === "string" && /^[a-zA-Z0-9_-]+$/.test(row.id) ? row.id : nextTaskId(kandownDir);
    const path = taskPath(kandownDir, id);
    if (existsSync13(path) && args.flags.overwrite !== true) continue;
    const fm = {
      id,
      title: typeof row.title === "string" && row.title ? row.title : id,
      status: typeof row.status === "string" && row.status ? row.status.replace(/ \(archived\)$/i, "") : "Backlog"
    };
    if (typeof row.priority === "string") fm.priority = row.priority;
    if (typeof row.assignee === "string") fm.assignee = row.assignee;
    if (Array.isArray(row.tags)) fm.tags = row.tags.map(String);
    atomicWriteFileSync(path, serializeTaskFile(stampUpdated(fm), typeof row.body === "string" ? row.body : ""));
    imported++;
  }
  success(`Imported ${imported} task${imported === 1 ? "" : "s"}`);
}

// src/cli/commands/daemon.ts
import { join as join18 } from "path";

// src/cli/lib/server.ts
import { createServer } from "http";
import { existsSync as existsSync15, readFileSync as readFileSync16, copyFileSync as copyFileSync3, unlinkSync as unlinkSync5, mkdirSync as mkdirSync9 } from "fs";
import { join as join17 } from "path";
import { spawn as spawn6 } from "child_process";

// src/cli/lib/task-move.ts
function userReadyExtensionReason(taskId, target, reason) {
  return `Cannot move ${taskId} to ${target}: ${reason ?? "blocked by an extension"}`;
}
var moveLocks = /* @__PURE__ */ new Map();
async function withProjectMoveLock(projectKey, operation) {
  const previous = moveLocks.get(projectKey) ?? Promise.resolve();
  let release = () => {
  };
  const current = new Promise((resolveLock) => {
    release = resolveLock;
  });
  const tail = previous.then(() => current);
  moveLocks.set(projectKey, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (moveLocks.get(projectKey) === tail) moveLocks.delete(projectKey);
  }
}
async function performTaskMove(host, kandownDir, taskId, targetStatus, toIndex) {
  const taskPath2 = findTaskPath(kandownDir, taskId);
  if (!taskPath2) {
    return { ok: false, kind: "not-found", reason: `Task not found: ${taskId}` };
  }
  const config = loadConfig(kandownDir);
  const board = readBoard(kandownDir);
  const sourceColumn = board.columns.find((column) => column.tasks.some((task) => task.id === taskId));
  const targetColumn = board.columns.find((column) => column.name.toLowerCase() === targetStatus.toLowerCase());
  if (!sourceColumn) {
    return { ok: false, kind: "not-found", reason: `Task is not active: ${taskId}` };
  }
  if (!targetColumn) {
    return { ok: false, kind: "invalid-target", reason: `Unknown status: ${targetStatus}` };
  }
  const target = targetColumn.name;
  const parsed = readTask(kandownDir, taskId);
  const from = typeof parsed.frontmatter.status === "string" ? parsed.frontmatter.status : sourceColumn.name;
  const allTasks = listTaskIds(kandownDir).map((id) => {
    try {
      return readTask(kandownDir, id);
    } catch {
      return null;
    }
  }).filter((task) => task !== null);
  const snapshot = resolveDependencyStatus(allTasks, config);
  const dependencyVerdict = resolveTransition(parsed, target, snapshot, config);
  if (!dependencyVerdict.allowed) {
    const error = new DependencyGateError(taskId, target, dependencyVerdict.blockedBy);
    return {
      ok: false,
      kind: "dependency",
      reason: error.message,
      blockedBy: dependencyVerdict.blockedBy
    };
  }
  const extensionVerdict = await runExtensionMoveGates(host, kandownDir, taskId, from, target);
  if (!extensionVerdict.allowed) {
    return {
      ok: false,
      kind: "extension",
      reason: userReadyExtensionReason(taskId, target, extensionVerdict.reason)
    };
  }
  const sourceIds = sourceColumn.tasks.map((task) => task.id).filter((id) => id !== taskId);
  const targetIds = sourceColumn === targetColumn ? sourceIds : targetColumn.tasks.map((task) => task.id).filter((id) => id !== taskId);
  const insertionIndex = toIndex === void 0 ? targetIds.length : Math.max(0, Math.min(Math.trunc(toIndex), targetIds.length));
  targetIds.splice(insertionIndex, 0, taskId);
  const layouts = sourceColumn === targetColumn ? [{ status: target, ids: targetIds }] : [
    // 📖 Persist the target first, and the moved task first within it. If
    // that authoritative write fails, no neighbor order has changed.
    { status: target, ids: targetIds },
    { status: sourceColumn.name, ids: sourceIds }
  ];
  const failedIds = [];
  for (const layout of layouts) {
    const entries = layout.ids.map((id, order) => ({ id, order }));
    entries.sort((left, right) => left.id === taskId ? -1 : right.id === taskId ? 1 : left.order - right.order);
    for (const { id, order } of entries) {
      const path = findTaskPath(kandownDir, id);
      if (!path) {
        failedIds.push(id);
        continue;
      }
      try {
        const current = readTask(kandownDir, id);
        const nextContent = serializeTaskFile(stampUpdated({
          ...current.frontmatter,
          id,
          status: layout.status,
          order
        }), current.body);
        atomicWriteFileSync(path, nextContent);
      } catch {
        failedIds.push(id);
      }
    }
  }
  const uniqueFailedIds = [...new Set(failedIds)];
  if (uniqueFailedIds.includes(taskId)) {
    return {
      ok: false,
      kind: "write",
      reason: `Failed to persist move for ${taskId}`
    };
  }
  try {
    const moved = readTask(kandownDir, taskId);
    const frontmatter = moved.frontmatter;
    const event = {
      type: "task:afterMove",
      task: {
        id: taskId,
        frontmatter,
        plugins: frontmatter.plugins
      },
      from,
      to: target
    };
    host.dispatchSync(event);
    host.dispatchLifecycle(event);
  } catch {
  }
  return { ok: true, from, to: target, failedIds: uniqueFailedIds };
}
async function moveTaskWithGates(host, kandownDir, taskId, targetStatus, toIndex) {
  return withProjectMoveLock(kandownDir, () => performTaskMove(host, kandownDir, taskId, targetStatus, toIndex));
}

// src/cli/lib/extensions-store.ts
import { mkdirSync as mkdirSync8, writeFileSync as writeFileSync6 } from "fs";
import { join as join16 } from "path";
var DEFAULT_REGISTRY_URL = "https://raw.githubusercontent.com/vava-nessa/kandown/main/registry/extensions.json";
var REGISTRY_FILES = ["manifest.json", "index.js", "index.ts", "web.js", "styles.css"];
async function fetchRegistry(url = DEFAULT_REGISTRY_URL) {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { entries: [], url, error: `HTTP ${res.status}` };
    const data = await res.json();
    const entries = Array.isArray(data) ? data : data.entries ?? [];
    return { entries: Array.isArray(entries) ? entries : [], url };
  } catch (e) {
    return { entries: [], url, error: e instanceof Error ? e.message : String(e) };
  }
}
function githubRawBase(repo, ref) {
  const cleaned = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  return `https://raw.githubusercontent.com/${cleaned}/${ref}`;
}
function githubRawBaseHead(repo) {
  return githubRawBase(repo, "HEAD");
}
async function installExtension2(projectDir, input) {
  let baseUrl;
  let manifestPath;
  if (input.entry) {
    const ref = input.entry.ref || "HEAD";
    baseUrl = `${githubRawBase(input.entry.repo, ref)}/${input.entry.path || ""}`.replace(/\/$/, "");
    manifestPath = "manifest.json";
  } else if (input.url) {
    baseUrl = githubRawBaseHead(input.url).replace(/\/$/, "");
    manifestPath = "manifest.json";
  } else {
    return { ok: false, error: "Provide a registry entry or a GitHub URL." };
  }
  const manifestUrl = `${baseUrl}/${manifestPath}`;
  let manifestJson;
  try {
    const res = await fetch(manifestUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false, error: `manifest fetch failed: HTTP ${res.status}` };
    manifestJson = await res.text();
  } catch (e) {
    return { ok: false, error: `manifest fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestJson);
  } catch {
    return { ok: false, error: "manifest.json is not valid JSON" };
  }
  if (!manifest.id || !/^[a-z][a-z0-9-]{0,63}$/.test(manifest.id)) {
    return { ok: false, error: "manifest.json is missing a valid id" };
  }
  const destDir = join16(projectDir, ".kandown", "extensions", manifest.id);
  mkdirSync8(destDir, { recursive: true });
  const copied = [];
  const write = (relPath, content) => {
    writeFileSync6(join16(destDir, relPath), content, "utf8");
    copied.push(relPath);
  };
  write("manifest.json", manifestJson);
  const otherFiles = REGISTRY_FILES.filter((f) => f !== "manifest.json");
  const results = await Promise.allSettled(
    otherFiles.map(async (f) => {
      const r = await fetch(`${baseUrl}/${f}`);
      if (!r.ok) return null;
      const text = await r.text();
      write(f, text);
      return f;
    })
  );
  return {
    ok: true,
    id: manifest.id
  };
}

// src/cli/lib/server.ts
var START_PORT_RANGE = 2050;
var END_PORT_RANGE = 2099;
var UNSAFE_PORTS = /* @__PURE__ */ new Set([2049, 4045, 6e3, 6665, 6666, 6667, 6668, 6669, 6697]);
var sseClients = [];
var nextClientId = 1;
var extensionHost = null;
var extensionHostDir = null;
async function getExtensionHost(kandownDir) {
  if (!extensionHost || extensionHostDir !== kandownDir) {
    extensionHost = await loadExtensionHost(kandownDir);
    extensionHostDir = kandownDir;
  }
  return extensionHost;
}
function broadcastSseEvent(data) {
  const payload = `data: ${JSON.stringify(data)}

`;
  sseClients.forEach((c2) => c2.res.write(payload));
}
function handleCors(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Kandown-Token"
  });
  res.end();
}
function writeJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(data));
}
function writeText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(text);
}
function readRequestBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolveBody(body));
    req.on("error", rejectBody);
  });
}
function syncProjectKandownHtml(kandownDir) {
  try {
    const projectHtml = join17(kandownDir, "kandown.html");
    const distHtml = join17(PKG_ROOT, "dist", "index.html");
    if (!existsSync15(distHtml)) return false;
    if (!existsSync15(projectHtml)) {
      copyFileSync3(distHtml, projectHtml);
      return true;
    }
    const currentContent = readFileSync16(projectHtml, "utf8");
    const newContent = readFileSync16(distHtml, "utf8");
    if (currentContent !== newContent) {
      atomicWriteFileSync(projectHtml, newContent);
      return true;
    }
  } catch {
  }
  return false;
}
function readDaemonPort(kandownDir) {
  try {
    const raw = JSON.parse(readFileSync16(join17(kandownDir, "daemon.json"), "utf8"));
    return typeof raw.port === "number" && Number.isInteger(raw.port) ? raw.port : null;
  } catch {
    return null;
  }
}
function restartDaemonAfterUpdateResponse(res, kandownDir) {
  const cliPath = process.argv[1];
  if (!cliPath) return;
  const args = ["--no-update-check", "daemon", "run", "--path", kandownDir];
  const port = readDaemonPort(kandownDir);
  if (port !== null) args.push("--port", String(port));
  const launcher = `
const { spawn } = require('node:child_process');
const [nodeBin, cliPath, ...cliArgs] = process.argv.slice(1);
setTimeout(() => {
  const child = spawn(nodeBin, [cliPath, ...cliArgs], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, KANDOWN_DAEMON: '1' },
  });
  child.unref();
}, 350);
`;
  res.on("finish", () => {
    const child = spawn6(process.execPath, ["-e", launcher, process.execPath, cliPath, ...args], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, KANDOWN_DAEMON: "1" }
    });
    child.unref();
    setTimeout(() => process.exit(0), 50).unref();
  });
}
async function handleApi(req, res, url, kandownDir) {
  const path = url.pathname;
  const method = req.method || "GET";
  if (path === "/api/daemon" && method === "GET") {
    return writeJson(res, 200, {
      ok: true,
      pid: process.pid,
      kandownDir,
      version: getCurrentVersion(),
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      agentHook: process.env.KANDOWN_AGENT_HOOK_URL ? { enabled: true, label: process.env.KANDOWN_AGENT_HOOK_LABEL || "Send to Agent" } : null
    });
  }
  if (path === "/api/version" && method === "GET") {
    return writeJson(res, 200, {
      version: getCurrentVersion()
    });
  }
  if (path === "/api/update/check" && method === "GET") {
    const current = getCurrentVersion();
    const latest = await new Promise((resolve8) => {
      const child = spawn6("npm", ["view", "kandown", "version"], {
        timeout: 4e3,
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
      child.on("error", () => resolve8(null));
      child.on("close", (code) => {
        if (code !== 0) return resolve8(null);
        resolve8(stdout.trim().replace(/^"|"$/g, "") || null);
      });
    });
    const installed = getInstalledVersion() ?? current;
    const updateAvailable = latest ? semverGt(latest, installed) > 0 : false;
    const restartRequired = semverGt(installed, current) > 0;
    return writeJson(res, 200, {
      current: installed,
      running: current,
      latest: latest || installed,
      updateAvailable,
      restartRequired
    });
  }
  if (path === "/api/update/apply" && method === "POST") {
    const current = getCurrentVersion();
    const latest = await new Promise((resolve8) => {
      const child = spawn6("npm", ["view", "kandown", "version"], {
        timeout: 4e3,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
        detached: false
      });
      let stdout = "";
      child.stdout.on("data", (d) => {
        stdout += d;
      });
      child.on("error", () => resolve8(null));
      child.on("close", (code) => resolve8(code === 0 ? stdout.trim() : null));
    });
    const targetVersion = latest || current;
    const ok = await performGlobalPackageUpdate(`kandown@${targetVersion}`);
    syncProjectKandownHtml(kandownDir);
    if (ok) {
      restartDaemonAfterUpdateResponse(res, kandownDir);
      writeJson(res, 200, { ok: true, version: targetVersion, message: "Update installed successfully; daemon is restarting" });
      broadcastSseEvent({ type: "update", version: targetVersion });
    } else {
      writeJson(res, 500, { ok: false, message: "Global package installation failed" });
    }
    return;
  }
  if (path === "/api/events" && method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    res.write("retry: 2000\n\n");
    const id = nextClientId++;
    sseClients.push({ id, res });
    req.on("close", () => {
      sseClients = sseClients.filter((c2) => c2.id !== id);
    });
    return;
  }
  if (path === "/api/board") {
    if (method === "GET") {
      const tasksDir = getTasksDir(kandownDir);
      const boardPath = join17(tasksDir, "board.md");
      const text = existsSync15(boardPath) ? readFileSync16(boardPath, "utf8") : "";
      return writeText(res, 200, text);
    }
    if (method === "PUT") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const tasksDir = getTasksDir(kandownDir);
        if (!existsSync15(tasksDir)) mkdirSync9(tasksDir, { recursive: true });
        atomicWriteFileSync(join17(tasksDir, "board.md"), body);
        broadcastSseEvent({ type: "board" });
        writeJson(res, 200, { ok: true });
      });
      return;
    }
  }
  if (path === "/api/config") {
    if (method === "GET") {
      return writeJson(res, 200, loadConfig(kandownDir));
    }
    if (method === "PUT") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          saveConfig(kandownDir, parsed);
          if (extensionHostDir === kandownDir) {
            extensionHost = null;
            extensionHostDir = null;
          }
          broadcastSseEvent({ type: "config" });
          writeJson(res, 200, { ok: true });
        } catch (error) {
          writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      });
      return;
    }
  }
  if (path === "/api/tasks" && method === "GET") {
    return writeJson(res, 200, listTaskIds(kandownDir));
  }
  if (path === "/api/agents" && method === "GET") {
    return writeJson(res, 200, detectCatalogJSON(kandownDir));
  }
  if (path === "/api/extensions" && method === "GET") {
    const host = await getExtensionHost(kandownDir);
    const badges = await host.renderBadges();
    return writeJson(res, 200, { extensions: host.installedSummary(), badges });
  }
  if (path.startsWith("/api/extensions/")) {
    const parts = path.slice("/api/extensions/".length).split("/").filter(Boolean);
    let id;
    try {
      id = decodeURIComponent(parts[0] ?? "");
    } catch {
      return writeJson(res, 400, { error: "Invalid extension id" });
    }
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) return writeJson(res, 400, { error: "Invalid extension id" });
    const host = await getExtensionHost(kandownDir);
    if (parts.length === 2 && parts[1] === "enable" && method === "POST") {
      const ok = await host.enable(id);
      broadcastSseEvent({ type: "extensions" });
      return writeJson(res, 200, { ok, summary: host.installedSummary() });
    }
    if (parts.length === 2 && parts[1] === "disable" && method === "POST") {
      const ok = host.disable(id);
      broadcastSseEvent({ type: "extensions" });
      return writeJson(res, 200, { ok });
    }
    if (parts.length === 2 && parts[1] === "health" && method === "POST") {
      let body;
      try {
        body = JSON.parse(await readRequestBody(req));
      } catch (error) {
        return writeJson(res, 400, { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
      }
      if (body.outcome !== "success" && body.outcome !== "failure") {
        return writeJson(res, 400, { error: "outcome must be success or failure" });
      }
      const ext = body.outcome === "success" ? host.reportSuccess(id) : host.reportFailure(id, typeof body.message === "string" ? body.message : "web panel failed");
      if (!ext) return writeJson(res, 404, { error: "Extension not found" });
      if (ext.health === "quarantined") broadcastSseEvent({ type: "extensions" });
      return writeJson(res, 200, {
        health: ext.health,
        failures: ext.failures,
        error: ext.error
      });
    }
    if (parts.length >= 2 && parts[1] === "files" && method === "GET") {
      const ext = host.get(id);
      if (!ext) return writeText(res, 404, "Extension not found");
      const rel = parts.slice(2).join("/");
      if (!/^[a-zA-Z0-9._\/-]+$/.test(rel) || rel.includes("..")) return writeText(res, 400, "Bad path");
      const file = join17(ext.dir, rel);
      if (!existsSync15(file)) return writeText(res, 404, "File not found");
      return writeText(res, 200, readFileSync16(file, "utf8"));
    }
  }
  if (path === "/api/extensions/registry" && method === "GET") {
    const result = await fetchRegistry();
    return writeJson(res, 200, result);
  }
  if (path === "/api/extensions/install" && method === "POST") {
    try {
      const body = JSON.parse(await readRequestBody(req));
      const projectDir = getProjectRoot(kandownDir);
      const result = await installExtension2(projectDir, { entry: body.entry, url: body.url });
      if (result.ok) await (await getExtensionHost(kandownDir)).loadAll();
      broadcastSseEvent({ type: "extensions" });
      return writeJson(res, result.ok ? 200 : 400, result);
    } catch (e) {
      return writeJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (path.startsWith("/api/tasks/") && path.endsWith("/field") && method === "POST") {
    const parts = path.slice("/api/tasks/".length).split("/").filter(Boolean);
    const taskId = decodeURIComponent(parts[0] ?? "");
    if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) return writeText(res, 400, "Invalid task id");
    if (!findTaskPath(kandownDir, taskId)) return writeText(res, 404, "Task not found");
    let body;
    try {
      body = JSON.parse(await readRequestBody(req));
    } catch (error) {
      return writeJson(res, 400, { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
    }
    if (typeof body.extId !== "string" || typeof body.key !== "string") {
      return writeJson(res, 400, { error: "extId and key required" });
    }
    try {
      const host = await getExtensionHost(kandownDir);
      await host.setFieldValue(taskId, body.extId, body.key, body.value);
      const updated = readTask(kandownDir, taskId).frontmatter;
      broadcastSseEvent({ type: "task", id: taskId });
      return writeJson(res, 200, {
        ok: true,
        plugins: updated.plugins && typeof updated.plugins === "object" ? updated.plugins : void 0
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.startsWith("permission denied") ? 403 : message.startsWith("extension is not enabled") ? 409 : 400;
      return writeJson(res, status, { error: message });
    }
  }
  if (path.startsWith("/api/tasks/")) {
    const routeParts = path.slice("/api/tasks/".length).split("/").filter(Boolean);
    let taskId;
    try {
      taskId = decodeURIComponent(routeParts[0] ?? "");
    } catch {
      return writeText(res, 400, "Invalid task id");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) return writeText(res, 400, "Invalid task id");
    const tasksDir = getTasksDir(kandownDir);
    const archiveDir = join17(tasksDir, "archive");
    const activePath = join17(tasksDir, `${taskId}.md`);
    const archivedPath = join17(archiveDir, `${taskId}.md`);
    const action = routeParts[1];
    if (method === "POST" && action === "move") {
      if (routeParts.length !== 2) return writeText(res, 400, "Invalid task route");
      let input;
      try {
        input = JSON.parse(await readRequestBody(req));
      } catch (error) {
        return writeJson(res, 400, {
          ok: false,
          kind: "invalid-target",
          reason: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
        });
      }
      if (typeof input.to !== "string" || !input.to.trim()) {
        return writeJson(res, 400, {
          ok: false,
          kind: "invalid-target",
          reason: "Move target is required"
        });
      }
      if (input.toIndex !== void 0 && (typeof input.toIndex !== "number" || !Number.isFinite(input.toIndex))) {
        return writeJson(res, 400, {
          ok: false,
          kind: "invalid-target",
          reason: "Move target index must be a finite number"
        });
      }
      try {
        const host = await getExtensionHost(kandownDir);
        const result = await moveTaskWithGates(
          host,
          kandownDir,
          taskId,
          input.to.trim(),
          input.toIndex
        );
        const status = result.ok ? 200 : result.kind === "not-found" ? 404 : result.kind === "invalid-target" ? 400 : result.kind === "write" ? 500 : 409;
        if (result.ok) broadcastSseEvent({ type: "task", id: taskId });
        return writeJson(res, status, result);
      } catch (error) {
        return writeJson(res, 500, {
          ok: false,
          kind: "write",
          reason: `Move failed: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
    if (method === "POST" && (action === "archive" || action === "unarchive")) {
      if (routeParts.length !== 2) return writeText(res, 400, "Invalid task route");
      const archiving = action === "archive";
      const source = archiving ? activePath : archivedPath;
      const destination = archiving ? archivedPath : activePath;
      if (!existsSync15(source) && !existsSync15(destination)) {
        return writeText(res, 404, "Task not found");
      }
      try {
        if (!existsSync15(tasksDir)) mkdirSync9(tasksDir, { recursive: true });
        if (!existsSync15(archiveDir)) mkdirSync9(archiveDir, { recursive: true });
        const body = await readRequestBody(req);
        atomicWriteFileSync(destination, body);
        if (source !== destination && existsSync15(source)) unlinkSync5(source);
        broadcastSseEvent({ type: "task", id: taskId });
        return writeJson(res, 200, { ok: true });
      } catch (error) {
        return writeJson(res, 500, {
          error: `Failed to ${action} task: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
    if (routeParts.length !== 1) return writeText(res, 404, "Route not found");
    if (method === "GET") {
      const taskPath2 = findTaskPath(kandownDir, taskId);
      if (!taskPath2) return writeText(res, 404, "Task not found");
      return writeText(res, 200, readFileSync16(taskPath2, "utf8"));
    }
    if (method === "PUT") {
      try {
        if (!existsSync15(tasksDir)) mkdirSync9(tasksDir, { recursive: true });
        const taskPath2 = findTaskPath(kandownDir, taskId) ?? activePath;
        const body = await readRequestBody(req);
        atomicWriteFileSync(taskPath2, body);
        broadcastSseEvent({ type: "task", id: taskId });
        return writeJson(res, 200, { ok: true });
      } catch (error) {
        return writeJson(res, 500, {
          error: `Failed to write task: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
    if (method === "DELETE") {
      try {
        if (existsSync15(activePath)) unlinkSync5(activePath);
        if (existsSync15(archivedPath)) unlinkSync5(archivedPath);
        broadcastSseEvent({ type: "task_delete", id: taskId });
        return writeJson(res, 200, { ok: true });
      } catch (error) {
        return writeJson(res, 500, {
          error: `Failed to delete task: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }
  writeJson(res, 404, { error: "Route not found" });
}
function injectServerRoot(html, kandownDir) {
  const marker = "</head>";
  const markerIndex = html.toLowerCase().lastIndexOf(marker);
  const safeRoot = JSON.stringify(kandownDir).replace(/</g, "\\u003c");
  const script = `<script>window.__KANDOWN_ROOT__ = ${safeRoot};</script>
`;
  if (markerIndex === -1) return script + html;
  return html.slice(0, markerIndex) + script + html.slice(markerIndex);
}
function serveApp(res, kandownDir) {
  syncProjectKandownHtml(kandownDir);
  const htmlPath = join17(kandownDir, "kandown.html");
  if (existsSync15(htmlPath)) {
    const html = readFileSync16(htmlPath, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(injectServerRoot(html, kandownDir));
  } else {
    writeText(res, 404, "kandown.html not found");
  }
}
function createServeServer(kandownDir) {
  syncProjectKandownHtml(kandownDir);
  return createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "OPTIONS") return handleCors(res);
    if (url.pathname === "/" || url.pathname === "/kandown.html" || !url.pathname.startsWith("/api/")) {
      return serveApp(res, kandownDir);
    }
    if (url.pathname.startsWith("/api/")) {
      return handleApi(req, res, url, kandownDir);
    }
    writeText(res, 404, "Not found");
  });
}
function listen(server, port) {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (e) => {
      server.off("listening", onListening);
      rejectListen(e);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}
async function listenOnAvailablePort(kandownDir, preferredPort) {
  const startPort = preferredPort ?? START_PORT_RANGE;
  for (let p = startPort; p <= END_PORT_RANGE; p++) {
    if (UNSAFE_PORTS.has(p)) continue;
    const server = createServeServer(kandownDir);
    try {
      await listen(server, p);
      return { server, port: p };
    } catch (e) {
      if (e.code !== "EADDRINUSE" && e.code !== "EACCES") throw e;
    }
  }
  throw new Error(`No free port in range ${START_PORT_RANGE}-${END_PORT_RANGE}`);
}

// src/cli/commands/daemon.ts
async function cmdDaemon(rest) {
  const parsedDaemonArgs = parseArgs(rest);
  const subcommand = parsedDaemonArgs.positional[0] || "status";
  const daemonArgs = subcommand ? stripFirstPositional(rest, subcommand) : rest;
  const { kandownDir } = ensureKandownDir(daemonArgs);
  if (subcommand === "run") {
    const daemonOptions = parseArgs(daemonArgs);
    const preferredPort = typeof daemonOptions.flags.port === "string" ? Number(daemonOptions.flags.port) : null;
    const { port } = await listenOnAvailablePort(kandownDir, Number.isInteger(preferredPort) ? preferredPort : null);
    const url = `http://localhost:${port}`;
    const metadataPath2 = join18(kandownDir, "daemon.json");
    atomicWriteFileSync(metadataPath2, JSON.stringify({
      pid: process.pid,
      port,
      url,
      kandownDir,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: getCurrentVersion(),
      token: null
    }, null, 2));
    info(`Kandown daemon running on port ${port} (PID ${process.pid})`);
    await new Promise(() => {
    });
  } else if (subcommand === "start") {
    const daemonOptions = parseArgs(daemonArgs);
    const preferredPort = typeof daemonOptions.flags.port === "string" ? Number(daemonOptions.flags.port) : null;
    const status = await startProjectDaemon(kandownDir, Number.isInteger(preferredPort) ? preferredPort : null);
    if (status.running && status.metadata) success(`Daemon running on port ${status.metadata.port} (PID ${status.metadata.pid})`);
    else {
      err("Daemon failed to start");
      process.exit(1);
    }
  } else if (subcommand === "restart") {
    await stopProjectDaemon(kandownDir);
    const status = await startProjectDaemon(kandownDir);
    if (status.running && status.metadata) success(`Daemon restarted on port ${status.metadata.port} (PID ${status.metadata.pid})`);
    else {
      err("Daemon failed to restart");
      process.exit(1);
    }
  } else if (subcommand === "stop") {
    const stopped = await stopProjectDaemon(kandownDir);
    if (stopped) success("Daemon stopped");
    else info("Daemon not running");
  } else if (subcommand === "status") {
    const status = await getDaemonStatus(kandownDir);
    if (status.running && status.metadata) {
      success(`Daemon running on port ${status.metadata.port} (PID ${status.metadata.pid})`);
    } else {
      info("Daemon not running");
    }
  } else if (subcommand === "refresh-all") {
    const status = await getDaemonStatus(kandownDir);
    if (status.running) await stopProjectDaemon(kandownDir);
    const restarted = await startProjectDaemon(kandownDir);
    if (restarted.running && restarted.metadata) success(`Refreshed current project daemon on port ${restarted.metadata.port}`);
    else info("No running daemon refreshed");
  } else {
    err(`Unknown daemon command: ${subcommand}`);
    log(`  Use ${c.cyan}kandown daemon start|stop|restart|status|refresh-all${c.reset}`);
    process.exit(1);
  }
}

// src/cli/lib/launcher.ts
import { execSync as execSync2, spawn as spawn7 } from "child_process";
import { writeFileSync as writeFileSync7 } from "fs";
import { join as join19 } from "path";
import { tmpdir } from "os";
function prepareLaunch(opts) {
  const { taskId, agentId, kandownDir, handoff, queue } = opts;
  const agentDef = getAgentById(agentId, kandownDir);
  if (!agentDef) {
    throw new Error(`Unknown agent: ${agentId}`);
  }
  let task;
  try {
    task = readTask(kandownDir, taskId);
  } catch (e) {
    throw new Error(`Failed to read task ${taskId}: ${e.message}`);
  }
  const originalStatus = task.frontmatter.status || "Backlog";
  const agentDoc = readAgentDoc(kandownDir);
  const taskFileContent = [
    `---`,
    `id: ${task.frontmatter.id}`,
    `title: ${task.frontmatter.title}`,
    `status: ${task.frontmatter.status ?? "unknown"}`,
    `---`,
    "",
    task.body.trim()
  ].join("\n");
  const { systemPrompt, taskPrompt } = buildPrompt(agentDoc, taskFileContent, taskId, kandownDir, handoff, queue);
  const taskMoved = moveTaskToColumn(kandownDir, taskId, "In Progress");
  if (!taskMoved) {
    throw new Error(`Could not move task ${taskId} to In Progress \u2014 task file missing or unwritable.`);
  }
  const contextFile = join19(tmpdir(), `kandown-${taskId}-context.md`);
  try {
    writeFileSync7(contextFile, `${systemPrompt}

---

${taskPrompt}`, "utf8");
  } catch (e) {
    console.warn(`[kandown] Failed to write context file (${e.message}); launching anyway.`);
  }
  const launchOpts = { systemPrompt, taskPrompt, kandownDir, taskId };
  const [binary, ...args] = buildAgentCommand(agentDef, launchOpts);
  if (!binary) {
    rollbackTaskStatus(kandownDir, taskId, originalStatus);
    throw new Error(`Agent ${agentId} returned an empty command`);
  }
  return { agentName: agentDef.name, binary, args, contextFile, originalStatus, taskMoved };
}
function launchEnv(contextFile, taskId, kandownDir) {
  return {
    ...process.env,
    KANDOWN_CONTEXT_FILE: contextFile,
    KANDOWN_TASK_ID: taskId,
    KANDOWN_DIR: kandownDir
  };
}
function runAgentSync(opts) {
  const { taskId, kandownDir } = opts;
  const prepared = prepareLaunch(opts);
  const { binary, args, contextFile, originalStatus, agentName } = prepared;
  return new Promise((resolve8, reject) => {
    const child = spawn7(binary, args, { stdio: "inherit", env: launchEnv(contextFile, taskId, kandownDir) });
    child.on("error", (e) => {
      rollbackTaskStatus(kandownDir, taskId, originalStatus);
      reject(new Error(`Failed to launch ${agentName}: ${e.message}`));
    });
    child.on("exit", (code) => {
      resolve8({ exitCode: code ?? 0 });
    });
  });
}
function rollbackTaskStatus(kandownDir, taskId, originalStatus) {
  const ok = moveTaskToColumn(kandownDir, taskId, originalStatus);
  if (!ok) {
    console.warn(`[kandown] Could not roll back task ${taskId} to ${originalStatus} \u2014 update it manually.`);
  }
}

// src/cli/lib/cascade.ts
function loadAllTasks(kandownDir) {
  const tasks = [];
  for (const id of listTaskIds(kandownDir)) {
    try {
      const t = readTask(kandownDir, id);
      const archived = String(t.frontmatter.archived) === "true";
      if (archived) continue;
      tasks.push({ ...t, frontmatter: { ...t.frontmatter, id: t.frontmatter.id || id } });
    } catch (e) {
      console.error(`[kandown] Skipping unreadable task ${id}:`, e.message);
    }
  }
  return tasks;
}
var PRIORITY_RANK = { P1: 1, P2: 2, P3: 3, P4: 4 };
function reachedTerminal(status, cfg) {
  const s = (status || "").trim().toLowerCase();
  if (!s) return false;
  if (s === "archived") return true;
  return s === terminalStatus(cfg).trim().toLowerCase();
}
function priorityAndIdKey(t) {
  const rank = PRIORITY_RANK[String(t.priority ?? "").toUpperCase()] ?? 99;
  return `${rank.toString().padStart(2, "0")}	${t.id.padStart(6, "0")}`;
}
function downstreamClosure(all, startId) {
  const depsOf = /* @__PURE__ */ new Map();
  for (const t of all) depsOf.set(t.frontmatter.id || "", Array.isArray(t.frontmatter.depends_on) ? t.frontmatter.depends_on.filter((d) => typeof d === "string") : []);
  const closure = /* @__PURE__ */ new Set([startId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of all) {
      const id = t.frontmatter.id || "";
      if (closure.has(id)) continue;
      const deps = depsOf.get(id) ?? [];
      if (deps.some((d) => closure.has(d))) {
        closure.add(id);
        changed = true;
      }
    }
  }
  return closure;
}
function buildCascadePlan(kandownDir, opts = {}) {
  const cfg = loadConfig(kandownDir);
  const all = loadAllTasks(kandownDir);
  const scope = opts.startTaskId ? downstreamClosure(all, opts.startTaskId) : null;
  const resolution = resolveDependencyStatus(all, cfg);
  const candidates = [];
  for (const t of all) {
    const id = t.frontmatter.id || "";
    if (scope && !scope.has(id)) continue;
    const status = t.frontmatter.status || "Backlog";
    if (reachedTerminal(status, cfg)) continue;
    if (status.toLowerCase() === "in progress" && !opts.includeInProgress) continue;
    candidates.push(toCascadeTask(t));
  }
  const candidateIds = new Set(candidates.map((c2) => c2.id));
  const orderable = [];
  const blocked = [];
  for (const t of candidates) {
    const stuckOn = t.dependsOn.find((d) => {
      const r = resolution.get(d);
      const resolved = !r || r.resolved;
      return !resolved && !candidateIds.has(d);
    });
    if (stuckOn) blocked.push(t);
    else orderable.push(t);
  }
  const orderableIds = new Set(orderable.map((r) => r.id));
  const depsWithin = /* @__PURE__ */ new Map();
  for (const r of orderable) {
    depsWithin.set(r.id, r.dependsOn.filter((d) => orderableIds.has(d)));
  }
  const orderedIds = topoSort([...orderableIds], depsWithin, orderable);
  const ordered = orderedIds.map((id) => orderable.find((r) => r.id === id)).filter(Boolean);
  const cascadeCfg = getCascadeConfig(kandownDir);
  const skippedNoAgent = [];
  const withAgent = [];
  for (const t of ordered) {
    if (resolveAgentFor(t, opts.agentOverride, cascadeCfg.preferred, kandownDir)) {
      withAgent.push(t);
    } else {
      skippedNoAgent.push(t);
    }
  }
  return { order: withAgent, skippedNoAgent, blocked };
}
function resolveAgentFor(task, override, preferred, kandownDir) {
  if (override) {
    return isAgentInstalled(getBinFor(override, kandownDir)) ? override : void 0;
  }
  const byAssignee = task.assignee ? resolveAgentEntry(task.assignee, kandownDir) : void 0;
  if (byAssignee && isAgentInstalled(byAssignee.bin)) return byAssignee.id;
  if (!task.assignee) {
    const cascadeCfg = getCascadeConfig(kandownDir);
    if (cascadeCfg.unassignedBehavior === "preferred" && preferred) {
      return isAgentInstalled(getBinFor(preferred, kandownDir)) ? preferred : void 0;
    }
  }
  return void 0;
}
function getBinFor(agentId, kandownDir) {
  return getAgentById(agentId, kandownDir)?.bin ?? agentId;
}
function toCascadeTask(t) {
  return {
    id: t.frontmatter.id || "",
    title: typeof t.frontmatter.title === "string" ? t.frontmatter.title : "",
    status: t.frontmatter.status || "Backlog",
    ...typeof t.frontmatter.assignee === "string" ? { assignee: t.frontmatter.assignee } : {},
    ...typeof t.frontmatter.priority === "string" ? { priority: t.frontmatter.priority } : {},
    dependsOn: Array.isArray(t.frontmatter.depends_on) ? t.frontmatter.depends_on.filter((d) => typeof d === "string") : []
  };
}
function topoSort(ids, depsWithin, ready) {
  const inDegree = /* @__PURE__ */ new Map();
  const dependents = /* @__PURE__ */ new Map();
  for (const id of ids) {
    inDegree.set(id, 0);
    dependents.set(id, []);
  }
  for (const id of ids) {
    for (const dep of depsWithin.get(id) ?? []) {
      if (!ids.includes(dep)) continue;
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      dependents.get(dep).push(id);
    }
  }
  const byTask = new Map(ready.map((r) => [r.id, r]));
  const remaining = new Set(ids);
  const out = [];
  while (remaining.size > 0) {
    const freed = [...remaining].filter((id) => (inDegree.get(id) ?? 0) === 0);
    if (freed.length === 0) break;
    freed.sort((a, b) => priorityAndIdKey(byTask.get(a)).localeCompare(priorityAndIdKey(byTask.get(b))));
    const pick = freed[0];
    out.push(pick);
    remaining.delete(pick);
    for (const d of dependents.get(pick) ?? []) inDegree.set(d, (inDegree.get(d) ?? 0) - 1);
  }
  if (remaining.size > 0) {
    out.push(...[...remaining].sort((a, b) => priorityAndIdKey(byTask.get(a)).localeCompare(priorityAndIdKey(byTask.get(b)))));
  }
  return out;
}
async function runCascade(kandownDir, opts = {}) {
  warmupDetection(loadCatalog(kandownDir));
  const plan = buildCascadePlan(kandownDir, opts);
  if (opts.dryRun) {
    return { mode: "multi-agent", steps: plan.order.map((t) => ({ taskId: t.id, outcome: "skipped", note: "dry-run" })), completed: [], incomplete: [] };
  }
  const cascadeCfg = getCascadeConfig(kandownDir);
  const sameSession = opts.sameSession ?? cascadeCfg.sameSessionChain;
  if (plan.order.length === 0) {
    return { mode: sameSession ? "same-session" : "multi-agent", steps: [], completed: [], incomplete: [] };
  }
  if (sameSession) {
    return runSameSession(kandownDir, plan, opts);
  }
  return runMultiAgent(kandownDir, plan, opts);
}
async function runMultiAgent(kandownDir, plan, opts) {
  const cascadeCfg = getCascadeConfig(kandownDir);
  const cfg = loadConfig(kandownDir);
  const steps = [];
  const completed = [];
  const incomplete = [];
  const handoff = [];
  for (const task of plan.order) {
    const fresh = loadAllTasks(kandownDir);
    const freshRes = resolveDependencyStatus(fresh, cfg);
    const tp = fresh.find((x) => (x.frontmatter.id || "") === task.id);
    if (tp) {
      const status = tp.frontmatter.status || "";
      if (reachedTerminal(status, cfg)) {
        steps.push({ taskId: task.id, outcome: "done", note: "already terminal" });
        completed.push(task.id);
        const report = typeof tp.frontmatter.report === "string" ? tp.frontmatter.report : "";
        handoff.push({ taskId: task.id, title: task.title, report });
        continue;
      }
      if (unresolvedDependencyIds(tp, freshRes).length > 0) {
        steps.push({ taskId: task.id, outcome: "skipped", note: "dependency not done" });
        incomplete.push(task.id);
        continue;
      }
    }
    const agentId = resolveAgentFor(task, opts.agentOverride, cascadeCfg.preferred, kandownDir);
    if (!agentId) {
      steps.push({ taskId: task.id, outcome: "skipped", note: "no resolvable agent" });
      continue;
    }
    try {
      const { exitCode } = await runAgentSync({
        taskId: task.id,
        agentId,
        kandownDir,
        handoff: handoff.length > 0 ? handoff : void 0
      });
      const after = readTask(kandownDir, task.id);
      const afterStatus = after.frontmatter.status || "";
      const done = reachedTerminal(afterStatus, cfg);
      const report = typeof after.frontmatter.report === "string" ? after.frontmatter.report : "";
      if (done) {
        steps.push({ taskId: task.id, agentId, outcome: "done", exitCode });
        completed.push(task.id);
        handoff.push({ taskId: task.id, title: task.title, report });
      } else {
        steps.push({ taskId: task.id, agentId, outcome: "not-done", exitCode, note: `status is "${afterStatus || "unknown"}", expected terminal` });
        incomplete.push(task.id);
        break;
      }
    } catch (e) {
      steps.push({ taskId: task.id, agentId, outcome: "failed", note: e.message });
      incomplete.push(task.id);
      break;
    }
  }
  return { mode: "multi-agent", steps, completed, incomplete };
}
async function runSameSession(kandownDir, plan, opts) {
  const cascadeCfg = getCascadeConfig(kandownDir);
  const first = plan.order[0];
  const agentId = opts.agentOverride ?? resolveAgentFor(first, void 0, cascadeCfg.preferred, kandownDir) ?? cascadeCfg.preferred;
  if (!agentId) {
    return { mode: "same-session", steps: plan.order.map((t) => ({ taskId: t.id, outcome: "skipped", note: "no agent for queue" })), completed: [], incomplete: plan.order.map((t) => t.id) };
  }
  const queue = plan.order.map((t) => ({ id: t.id, title: t.title }));
  try {
    const { exitCode } = await runAgentSync({
      taskId: first.id,
      agentId,
      kandownDir,
      queue
    });
    const cfg = loadConfig(kandownDir);
    const steps = [];
    const completed = [];
    const incomplete = [];
    for (const t of plan.order) {
      const after = readTask(kandownDir, t.id);
      const status = after.frontmatter.status || "";
      if (reachedTerminal(status, cfg)) {
        steps.push({ taskId: t.id, agentId, outcome: "done", exitCode });
        completed.push(t.id);
      } else {
        steps.push({ taskId: t.id, agentId, outcome: "not-done", exitCode, note: `status is "${status || "unknown"}"` });
        incomplete.push(t.id);
      }
    }
    return { mode: "same-session", steps, completed, incomplete };
  } catch (e) {
    return { mode: "same-session", steps: [{ taskId: first.id, agentId, outcome: "failed", note: e.message }], completed: [], incomplete: plan.order.map((t) => t.id) };
  }
}

// src/cli/commands/run.ts
async function cmdRun(rawArgs) {
  const args = parseArgs(rawArgs);
  const kandownDir = resolveKandownDir(args.path, process.cwd());
  const opts = {
    startTaskId: args.positional[0],
    agentOverride: typeof args.flags["agent"] === "string" ? args.flags["agent"] : void 0,
    includeInProgress: args.flags["resume"] === true,
    sameSession: args.flags["same-session"] === true,
    dryRun: args.flags["dry-run"] === true
  };
  if (opts.agentOverride) {
    const def = loadCatalog(kandownDir).find((a) => a.id === opts.agentOverride);
    if (!def) {
      err(`Unknown agent: ${opts.agentOverride}`);
      log(`  Available: ${loadCatalog(kandownDir).map((a) => a.id).join(", ")}`);
      process.exit(1);
    }
    if (!isAgentInstalled(def.bin)) {
      err(`Agent ${opts.agentOverride} (${def.bin}) is not installed in your $PATH.`);
      process.exit(1);
    }
  }
  const plan = buildCascadePlan(kandownDir, opts);
  const mode = opts.sameSession ? "same-session" : "multi-agent";
  log("");
  log(`${c.bold}Cascade plan${c.reset} ${c.dim}(${mode})${c.reset}`);
  if (opts.startTaskId) log(`${c.dim}scoped to ${opts.startTaskId} + downstream dependents${c.reset}`);
  log("");
  if (plan.order.length === 0) {
    info("No ready tasks with a resolvable agent. Nothing to run.");
    if (plan.blocked.length > 0) {
      log(`${c.dim}  Blocked (unresolved deps): ${plan.blocked.map((t) => t.id).join(", ") || "\u2014"}${c.reset}`);
    }
    if (plan.skippedNoAgent.length > 0) {
      log(`${c.dim}  Skipped (no agent): ${plan.skippedNoAgent.map((t) => `${t.id}${t.assignee ? `(@${t.assignee})` : ""}`).join(", ")}${c.reset}`);
    }
    log("");
    return;
  }
  for (let i = 0; i < plan.order.length; i++) {
    const t = plan.order[i];
    const agent = opts.agentOverride ?? t.assignee ?? "(preferred)";
    log(`  ${c.cyan}${i + 1}.${c.reset} ${c.bold}${t.id}${c.reset} ${t.title}`);
    log(`     ${c.dim}agent: ${agent} \xB7 status: ${t.status}${t.priority ? ` \xB7 ${t.priority}` : ""}${t.dependsOn.length ? ` \xB7 after ${t.dependsOn.join(",")}` : ""}${c.reset}`);
  }
  if (plan.skippedNoAgent.length > 0) {
    log("");
    log(`${c.dim}Skipping (no agent assigned): ${plan.skippedNoAgent.map((t) => t.id).join(", ")}${c.reset}`);
  }
  log("");
  if (opts.dryRun) {
    info("Dry run \u2014 nothing launched.");
    return;
  }
  const result = await runCascade(kandownDir, opts);
  log("");
  log(`${c.bold}Cascade result${c.reset} ${c.dim}(${result.mode})${c.reset}`);
  for (const step of result.steps) {
    const mark = step.outcome === "done" ? `${c.green}\u2713${c.reset}` : step.outcome === "not-done" ? `${c.yellow}~${c.reset}` : step.outcome === "failed" ? `${c.red}\u2717${c.reset}` : `${c.dim}\xB7${c.reset}`;
    const tail = step.agentId ? ` ${c.dim}via ${step.agentId}${c.reset}` : "";
    const note = step.note ? ` ${c.dim}\u2014 ${step.note}${c.reset}` : "";
    log(`  ${mark} ${step.taskId}${tail}${note}`);
  }
  log("");
  if (result.incomplete.length === 0 && result.completed.length > 0) {
    success(`All ${result.completed.length} task(s) reached Done.`);
  } else if (result.completed.length > 0) {
    info(`${result.completed.length} done, ${result.incomplete.length} not done. Chain stopped at the first non-done task.`);
  } else {
    err("No tasks completed.");
  }
}

// src/cli/commands/agents.ts
import { existsSync as existsSync16 } from "fs";
import { join as join20 } from "path";
function cmdAgents(rawArgs) {
  const args = parseArgs(rawArgs);
  const kandownDir = resolveKandownDir(args.path, process.cwd());
  const sub = args.positional[0];
  if (sub === "init") {
    const target = join20(kandownDir, "agents.json");
    if (existsSync16(target)) {
      info(`${c.bold}agents.json${c.reset} already exists at ${target}`);
      return;
    }
    saveAgentsConfig(kandownDir, defaultAgentsConfig());
    success(`Wrote default ${c.bold}agents.json${c.reset} to ${target}`);
    log(`${c.dim}  Commit it so your team shares the same agent catalog + aliases.${c.reset}`);
    return;
  }
  warmupDetection(loadCatalog(kandownDir));
  const catalog = loadCatalog(kandownDir);
  const installed = detectInstalledAgents(kandownDir);
  const cascade = getCascadeConfig(kandownDir);
  const agentsFile = join20(kandownDir, "agents.json");
  log("");
  log(`${c.bold}Agent catalog${c.reset} ${c.dim}(${installed.length}/${catalog.length} installed)${c.reset}`);
  log(`${c.dim}catalog: ${existsSync16(agentsFile) ? agentsFile : "built-in defaults (run `kandown agents init` to commit one)"}${c.reset}`);
  log("");
  for (const a of catalog) {
    const ok = isAgentInstalled(a.bin);
    const mark = ok ? `${c.green}\u2713${c.reset}` : `${c.dim}\xB7${c.reset}`;
    const interactive = a.interactive ? "" : `${c.dim} (one-shot)${c.reset}`;
    const preferred = cascade.preferred === a.id ? ` ${c.cyan}[preferred]${c.reset}` : "";
    log(`  ${mark} ${c.bold}${a.id.padEnd(10)}${c.reset} ${a.name}${preferred}${interactive}`);
    log(`     ${c.dim}${a.bin}${a.aliases && a.aliases.length ? ` \xB7 aliases: ${a.aliases.join(", ")}` : ""}${c.reset}`);
    if (a.extraArgs && a.extraArgs.length) {
      log(`     ${c.dim}extraArgs: ${a.extraArgs.join(" ")}${c.reset}`);
    }
  }
  log("");
  log(`${c.dim}cascade: unassignedBehavior=${cascade.unassignedBehavior} \xB7 sameSessionChain=${cascade.sameSessionChain}${c.reset}`);
  log(`${c.dim}assign a task with: kandown assign <id> <agent>   \xB7   run a chain with: kandown run${c.reset}`);
  log("");
}

// src/cli/cli.ts
async function cmdTui(screen, rawArgs) {
  const args = parseArgs(rawArgs);
  const kandownDir = resolveKandownDir(args.path, process.cwd());
  await launchTui(screen, kandownDir);
}
async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 1 && (rawArgs[0] === "--version" || rawArgs[0] === "version")) {
    log(getCurrentVersion());
    return;
  }
  const { cmd, rest } = splitCommand(rawArgs);
  const skipUpdate = rawArgs.includes("--no-update-check") || process.env.KANDOWN_NO_UPDATE === "1";
  if (!skipUpdate) {
    await checkForUpdate(process.argv);
  }
  switch (cmd) {
    case "init":
      cmdInit(rest);
      break;
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
    case "board":
      await cmdTui("board", rest);
      break;
    case "settings":
      await cmdTui("settings", rest);
      break;
    case "list":
    case "ls":
      cmdList(rest);
      break;
    case "show":
      cmdShow(rest);
      break;
    case "create":
    case "new":
      cmdCreate(rest);
      break;
    case "move":
      await cmdMove(rest);
      break;
    case "assign":
      cmdAssign(rest);
      break;
    case "commit":
      cmdCommit(rest);
      break;
    case "run":
      await cmdRun(rest);
      break;
    case "agents":
      cmdAgents(rest);
      break;
    case "extension":
    case "extensions":
      await cmdExtension(rest);
      break;
    case "tasks":
      printTaskCommandsHelp();
      break;
    case "projects":
      cmdProjects(rest);
      break;
    case "export":
      cmdExport(rest);
      break;
    case "import":
      cmdImport(rest);
      break;
    case "mcp": {
      const { kandownDir } = ensureKandownDir(rest);
      startMcpServer(kandownDir);
      break;
    }
    case "help":
    case "--help":
    case "-h":
      help();
      break;
    case "daemon":
      await cmdDaemon(rest);
      break;
    case void 0: {
      const parsed = parseArgs(rest);
      const kandownDir = resolveKandownDir(parsed.path, process.cwd());
      if (existsSync17(join21(kandownDir, "kandown.json"))) {
        let status = await getDaemonStatus(kandownDir);
        if (!status.running) {
          status = await startProjectDaemon(kandownDir);
        }
        if (!parsed.flags["no-open"]) {
          const urlToOpen = status.metadata?.url || join21(kandownDir, "kandown.html");
          openBrowser(urlToOpen);
        }
      } else if (!process.stdin.isTTY) {
        err(`No kandown project found at ${c.bold}${kandownDir}${c.reset} \u2014 run ${c.cyan}kandown init${c.reset} first.`);
        process.exit(1);
      }
      await launchTui("board", kandownDir);
      break;
    }
    default: {
      if (!cmd || cmd.startsWith("-")) {
        help();
        break;
      }
      const parsed = parseArgs(rest);
      const kandownDir = resolveKandownDir(parsed.path, process.cwd());
      if (existsSync17(join21(kandownDir, "kandown.json"))) {
        const positional = rest.filter((a) => !a.startsWith("-") && !a.startsWith("--path"));
        const ran = await dispatchContributedCommand(kandownDir, cmd, positional.join(" "));
        if (ran) break;
      }
      err(`Unknown command: ${cmd}`);
      help();
      process.exit(1);
    }
  }
}
void main();
