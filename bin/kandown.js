#!/usr/bin/env node
import { createRequire as __createRequire } from 'node:module';
if (typeof globalThis.require === 'undefined') {
  globalThis.require = __createRequire(import.meta.url);
}

// src/cli/cli.ts
import { existsSync as existsSync11 } from "fs";
import { join as join12 } from "path";

// src/cli/lib/updater.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { spawn, execSync } from "child_process";
import { homedir } from "os";

// src/lib/version.ts
var KANDOWN_VERSION = "0.34.3";

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
  const latest = await new Promise((resolve5) => {
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
    child2.on("error", () => resolve5(null));
    child2.on("close", (code) => {
      if (code !== 0) return resolve5(null);
      const v = stdout.trim().replace(/^"|"$/g, "");
      resolve5(v || null);
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
  return new Promise((resolve5) => {
    const socket = createConnection({ port, host: "127.0.0.1" }, () => {
      socket.destroy();
      resolve5(true);
    });
    socket.on("error", () => resolve5(false));
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
      resolve5(false);
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
    await new Promise((resolve5) => setTimeout(resolve5, 120));
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
    await new Promise((resolve5) => setTimeout(resolve5, 100));
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
import { readFileSync as readFileSync3, existsSync as existsSync3, readdirSync, statSync as statSync2 } from "fs";
import { join as join3 } from "path";
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
  const configPath = join3(kandownDir, "kandown.json");
  if (!existsSync3(configPath)) return structuredClone(DEFAULT_CONFIG);
  let raw;
  try {
    raw = JSON.parse(readFileSync3(configPath, "utf8"));
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
    const prevContent = readFileSync4(taskPath2, "utf8");
    const parsed = readTask(kandownDir, taskId);
    const newContent = serializeTaskFile({
      ...parsed.frontmatter,
      id: taskId,
      status: targetColumn
    }, parsed.body);
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
  const fm = {
    id: newId,
    title,
    status: targetStatus,
    created: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
  };
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
    const newContent = serializeTaskFile({
      ...parsed.frontmatter,
      id: taskId,
      archived: true
    }, parsed.body);
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
        atomicWriteFileSync(taskPath2, serializeTaskFile(fm, body));
      }
      sendResponse(id, { result: { content: [{ type: "text", text: `Created task ${newId}` }] } });
      return;
    }
    if (name === "move_task") {
      const ok = moveTaskToColumn(kandownDir, args.id, args.status);
      sendResponse(id, { result: { content: [{ type: "text", text: ok ? `Moved ${args.id} to ${args.status}` : `Failed to move ${args.id}` }] } });
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
      atomicWriteFileSync(taskPath2, serializeTaskFile(task.frontmatter, newBody));
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
import { existsSync as existsSync7, readFileSync as readFileSync7, readdirSync as readdirSync4, statSync as statSync4 } from "fs";
import { join as join7, resolve as resolve2, basename } from "path";
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
  "version"
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
  if (basename(cwd) === ".kandown" || existsSync7(join7(cwd, "kandown.json"))) {
    return cwd;
  }
  if (pathArg !== ".kandown") {
    return resolve2(cwd, pathArg);
  }
  let entries;
  try {
    entries = readdirSync4(cwd);
  } catch {
    return resolve2(cwd, pathArg);
  }
  for (const name of entries) {
    if (name.startsWith(".") || name === "node_modules" || name === "tasks") continue;
    const subPath = join7(cwd, name);
    let stat;
    try {
      stat = statSync4(subPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const found = resolveKandownDir(pathArg, subPath);
    if (existsSync7(found)) return found;
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
  const latest = await new Promise((resolve5) => {
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
    child.on("error", () => resolve5(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve5(null);
      const v = stdout.trim().replace(/^"|"$/g, "");
      resolve5(v || null);
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
import { existsSync as existsSync9, readFileSync as readFileSync9, mkdirSync as mkdirSync4, readdirSync as readdirSync5 } from "fs";
import { join as join9, resolve as resolve4 } from "path";
import { spawnSync } from "child_process";
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
    const archiveDir = join9(getTasksDir(kandownDir), "archive");
    if (existsSync9(archiveDir)) {
      for (const file of readdirSync5(archiveDir).filter((name) => name.endsWith(".md"))) {
        const id = file.slice(0, -3);
        const parsed = parseTaskFile(readFileSync9(join9(archiveDir, file), "utf8"));
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
  process.stdout.write(readFileSync9(path, "utf8"));
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
  const fm = {
    id,
    title,
    status,
    created: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
  };
  const priority = stringFlag(args.flags, "priority")?.toUpperCase();
  const assignee = stringFlag(args.flags, "assignee");
  const tags = listFlag(args.flags, "tag");
  if (priority) fm.priority = priority;
  if (assignee) fm.assignee = assignee;
  if (tags.length > 0) fm.tags = tags;
  const tasksDir = getTasksDir(kandownDir);
  if (!existsSync9(tasksDir)) mkdirSync4(tasksDir, { recursive: true });
  const path = taskPath(kandownDir, id);
  atomicWriteFileSync(path, serializeTaskFile(fm, ""));
  process.stderr.write(`${c.green}\u2713${c.reset} Created ${c.bold}${id}${c.reset} \u2192 ${status}
`);
  process.stdout.write(args.flags.json === true ? JSON.stringify(fm, null, 2) + "\n" : `${id}
`);
}
function cmdMove(rawArgs) {
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
  if (!moveTaskToColumn(kandownDir, id, status)) {
    err(`Move failed: ${id}`);
    process.exit(1);
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
  if (assignee) frontmatter.assignee = assignee;
  else delete frontmatter.assignee;
  atomicWriteFileSync(task.path, serializeTaskFile(frontmatter, task.body));
  success(assignee ? `Assigned ${id} \u2192 ${assignee}` : `Unassigned ${id}`);
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
  const metadataPath2 = join9(kandownDir, "daemon.json");
  if (!existsSync9(metadataPath2)) {
    info("No daemon metadata for this project.");
    return;
  }
  process.stdout.write(readFileSync9(metadataPath2, "utf8").trim() + "\n");
}
function cmdImport(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const file = args.positional[0];
  if (!file) {
    err("Usage: kandown import <file.json> [--overwrite]");
    process.exit(1);
  }
  const importPath = resolve4(process.cwd(), file);
  if (!existsSync9(importPath)) {
    err(`Import file not found: ${file}`);
    process.exit(1);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync9(importPath, "utf8"));
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
  if (!existsSync9(tasksDir)) mkdirSync4(tasksDir, { recursive: true });
  let imported = 0;
  for (const row of rows) {
    const id = typeof row.id === "string" && /^[a-zA-Z0-9_-]+$/.test(row.id) ? row.id : nextTaskId(kandownDir);
    const path = taskPath(kandownDir, id);
    if (existsSync9(path) && args.flags.overwrite !== true) continue;
    const fm = {
      id,
      title: typeof row.title === "string" && row.title ? row.title : id,
      status: typeof row.status === "string" && row.status ? row.status.replace(/ \(archived\)$/i, "") : "Backlog"
    };
    if (typeof row.priority === "string") fm.priority = row.priority;
    if (typeof row.assignee === "string") fm.assignee = row.assignee;
    if (Array.isArray(row.tags)) fm.tags = row.tags.map(String);
    atomicWriteFileSync(path, serializeTaskFile(fm, typeof row.body === "string" ? row.body : ""));
    imported++;
  }
  success(`Imported ${imported} task${imported === 1 ? "" : "s"}`);
}

// src/cli/commands/daemon.ts
import { join as join11 } from "path";

// src/cli/lib/server.ts
import { createServer } from "http";
import { existsSync as existsSync10, readFileSync as readFileSync10, copyFileSync as copyFileSync3, unlinkSync as unlinkSync5, mkdirSync as mkdirSync5 } from "fs";
import { join as join10 } from "path";
import { spawn as spawn6 } from "child_process";
var START_PORT_RANGE = 2050;
var END_PORT_RANGE = 2099;
var UNSAFE_PORTS = /* @__PURE__ */ new Set([2049, 4045, 6e3, 6665, 6666, 6667, 6668, 6669, 6697]);
var sseClients = [];
var nextClientId = 1;
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
    const projectHtml = join10(kandownDir, "kandown.html");
    const distHtml = join10(PKG_ROOT, "dist", "index.html");
    if (!existsSync10(distHtml)) return false;
    if (!existsSync10(projectHtml)) {
      copyFileSync3(distHtml, projectHtml);
      return true;
    }
    const currentContent = readFileSync10(projectHtml, "utf8");
    const newContent = readFileSync10(distHtml, "utf8");
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
    const raw = JSON.parse(readFileSync10(join10(kandownDir, "daemon.json"), "utf8"));
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
    const latest = await new Promise((resolve5) => {
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
      child.on("error", () => resolve5(null));
      child.on("close", (code) => {
        if (code !== 0) return resolve5(null);
        resolve5(stdout.trim().replace(/^"|"$/g, "") || null);
      });
    });
    const updateAvailable = latest ? semverGt(latest, current) > 0 : false;
    return writeJson(res, 200, {
      current,
      latest: latest || current,
      updateAvailable
    });
  }
  if (path === "/api/update/apply" && method === "POST") {
    const current = getCurrentVersion();
    const latest = await new Promise((resolve5) => {
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
      child.on("error", () => resolve5(null));
      child.on("close", (code) => resolve5(code === 0 ? stdout.trim() : null));
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
      const boardPath = join10(tasksDir, "board.md");
      const text = existsSync10(boardPath) ? readFileSync10(boardPath, "utf8") : "";
      return writeText(res, 200, text);
    }
    if (method === "PUT") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const tasksDir = getTasksDir(kandownDir);
        if (!existsSync10(tasksDir)) mkdirSync5(tasksDir, { recursive: true });
        atomicWriteFileSync(join10(tasksDir, "board.md"), body);
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
          broadcastSseEvent({ type: "config" });
          writeJson(res, 200, { ok: true });
        } catch (e) {
          writeJson(res, 400, { error: e.message });
        }
      });
      return;
    }
  }
  if (path === "/api/tasks" && method === "GET") {
    return writeJson(res, 200, listTaskIds(kandownDir));
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
    const archiveDir = join10(tasksDir, "archive");
    const activePath = join10(tasksDir, `${taskId}.md`);
    const archivedPath = join10(archiveDir, `${taskId}.md`);
    const action = routeParts[1];
    if (method === "POST" && (action === "archive" || action === "unarchive")) {
      if (routeParts.length !== 2) return writeText(res, 400, "Invalid task route");
      const archiving = action === "archive";
      const source = archiving ? activePath : archivedPath;
      const destination = archiving ? archivedPath : activePath;
      if (!existsSync10(source) && !existsSync10(destination)) {
        return writeText(res, 404, "Task not found");
      }
      try {
        if (!existsSync10(tasksDir)) mkdirSync5(tasksDir, { recursive: true });
        if (!existsSync10(archiveDir)) mkdirSync5(archiveDir, { recursive: true });
        const body = await readRequestBody(req);
        atomicWriteFileSync(destination, body);
        if (source !== destination && existsSync10(source)) unlinkSync5(source);
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
      return writeText(res, 200, readFileSync10(taskPath2, "utf8"));
    }
    if (method === "PUT") {
      try {
        if (!existsSync10(tasksDir)) mkdirSync5(tasksDir, { recursive: true });
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
        if (existsSync10(activePath)) unlinkSync5(activePath);
        if (existsSync10(archivedPath)) unlinkSync5(archivedPath);
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
  const htmlPath = join10(kandownDir, "kandown.html");
  if (existsSync10(htmlPath)) {
    const html = readFileSync10(htmlPath, "utf8");
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
    const metadataPath2 = join11(kandownDir, "daemon.json");
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
      cmdMove(rest);
      break;
    case "assign":
      cmdAssign(rest);
      break;
    case "commit":
      cmdCommit(rest);
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
      if (existsSync11(kandownDir)) {
        let status = await getDaemonStatus(kandownDir);
        if (!status.running) {
          status = await startProjectDaemon(kandownDir);
        }
        if (!parsed.flags["no-open"]) {
          const urlToOpen = status.metadata?.url || join12(kandownDir, "kandown.html");
          openBrowser(urlToOpen);
        }
      } else if (!process.stdin.isTTY) {
        err(`No kandown project found at ${c.bold}${kandownDir}${c.reset} \u2014 run ${c.cyan}kandown init${c.reset} first.`);
        process.exit(1);
      }
      await launchTui("board", kandownDir);
      break;
    }
    default:
      if (!cmd || cmd.startsWith("-")) {
        help();
        break;
      }
      err(`Unknown command: ${cmd}`);
      help();
      process.exit(1);
  }
}
void main();
