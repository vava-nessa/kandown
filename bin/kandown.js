#!/usr/bin/env node
import { createRequire as __createRequire } from 'node:module';
if (typeof globalThis.require === 'undefined') {
  globalThis.require = __createRequire(import.meta.url);
}
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/version.ts
var KANDOWN_VERSION;
var init_version = __esm({
  "src/lib/version.ts"() {
    "use strict";
    KANDOWN_VERSION = "0.50.0";
  }
});

// src/cli/lib/updater.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { spawn, execSync } from "child_process";
import { homedir } from "os";
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
  const latest = await new Promise((resolve11) => {
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
    child2.on("error", () => resolve11(null));
    child2.on("close", (code) => {
      if (code !== 0) return resolve11(null);
      const v = stdout.trim().replace(/^"|"$/g, "");
      resolve11(v || null);
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
var PKG_ROOT, CACHE_DIR, UPDATE_CHECK_CACHE, UPDATE_CHECK_INTERVAL_MS;
var init_updater = __esm({
  "src/cli/lib/updater.ts"() {
    "use strict";
    init_version();
    PKG_ROOT = getPackageRoot();
    CACHE_DIR = join(homedir(), ".kandown");
    UPDATE_CHECK_CACHE = join(CACHE_DIR, ".update-check.json");
    UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1e3;
  }
});

// src/lib/types.ts
var DEFAULT_COLUMNS, DEFAULT_WORK_OUTPUT, DEFAULT_COLUMN_META, DEFAULT_CONFIG;
var init_types = __esm({
  "src/lib/types.ts"() {
    "use strict";
    DEFAULT_COLUMNS = ["Backlog", "Todo", "In Progress", "Review", "Done"];
    DEFAULT_WORK_OUTPUT = {
      detailMode: "complete",
      boardDigest: {
        showColumnCounts: true,
        showTasks: true,
        showPriority: true,
        showAssignee: true,
        showBlockedBy: true,
        showNextActionable: true
      }
    };
    DEFAULT_COLUMN_META = {
      Backlog: {
        role: "backlog",
        instructions: "Capture unscheduled work here. Keep enough context to decide whether it belongs in this workflow."
      },
      Todo: {
        role: "ready",
        instructions: "Only move work here when its required inputs, acceptance criteria, dependencies, and approvals are ready."
      },
      "In Progress": {
        role: "active",
        instructions: "Execute the current workflow phase, update the checklist as work happens, and record blockers immediately."
      },
      Review: {
        role: "review",
        instructions: "Require completed verification, reproducible evidence, and the workflow-specific review gate before acceptance."
      },
      Done: {
        role: "terminal",
        instructions: "Only accept work whose criteria and required review are satisfied. Preserve the completion report and evidence."
      }
    };
    DEFAULT_CONFIG = {
      ui: { language: "en", theme: "auto", skin: "kandown", font: "inter", background: "solid", onboardingCompleted: false },
      agent: { suggestFollowUp: false, maxSuggestions: 3, workOutput: DEFAULT_WORK_OUTPUT },
      workflow: { active: "kandown-standard", skills: [], trackingCadence: "balanced" },
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
        columnMeta: DEFAULT_COLUMN_META,
        stackDefaultState: "collapsed"
      },
      tui: {
        defaultView: "list",
        showDetailPane: true,
        listSort: "status",
        listSortDir: "asc",
        columns: {
          age: true,
          status: true,
          priority: true,
          owner: true,
          deps: true,
          tags: false,
          assignee: true
        }
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
  }
});

// src/lib/config.ts
function safeObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function isOneOf(value, options) {
  return typeof value === "string" && options.includes(value);
}
function stringOr(value, fallback) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}
function booleanOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function stringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
  )];
}
function normalizeColumns(value) {
  const columns = stringList(value);
  return columns.length > 0 ? columns : [...DEFAULT_CONFIG.board.columns];
}
function lookupCaseInsensitive(record, key) {
  if (Object.hasOwn(record, key)) return record[key];
  const normalizedKey = key.toLocaleLowerCase();
  const match = Object.keys(record).find(
    (candidate) => candidate.toLocaleLowerCase() === normalizedKey
  );
  return match === void 0 ? void 0 : record[match];
}
function normalizeColumnMeta(columns, value) {
  const rawMeta = safeObject(value);
  const defaultMeta = safeObject(DEFAULT_COLUMN_META);
  const normalized = {};
  for (const column of columns) {
    const rawValue = lookupCaseInsensitive(rawMeta, column);
    const hasRawMeta = rawValue !== null && typeof rawValue === "object" && !Array.isArray(rawValue);
    const raw = safeObject(rawValue);
    const fallback = safeObject(lookupCaseInsensitive(defaultMeta, column));
    const role = isOneOf(raw.role, COLUMN_ROLES) ? raw.role : isOneOf(fallback.role, COLUMN_ROLES) ? fallback.role : "custom";
    const instructions = hasRawMeta ? typeof raw.instructions === "string" ? raw.instructions.trim() : void 0 : typeof fallback.instructions === "string" ? fallback.instructions : void 0;
    normalized[column] = instructions ? { role, instructions } : { role };
  }
  return normalized;
}
function normalizeColumnColors(value) {
  const normalized = {
    ...DEFAULT_CONFIG.board.columnColors ?? {}
  };
  for (const [key, color] of Object.entries(safeObject(value))) {
    if (isOneOf(color, COLUMN_COLORS)) normalized[key] = color;
  }
  return normalized;
}
function normalizeWipLimits(value) {
  const normalized = {};
  for (const [key, limit] of Object.entries(safeObject(value))) {
    if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
      normalized[key] = limit;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : void 0;
}
function normalizeExtraArgs(value) {
  const normalized = {};
  for (const [agentId, args] of Object.entries(safeObject(value))) {
    if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) continue;
    normalized[agentId] = [...args];
  }
  return Object.keys(normalized).length > 0 ? normalized : void 0;
}
function normalizeAgents(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
  const raw = safeObject(value);
  const agents = {};
  if (typeof raw.preferred === "string" && raw.preferred.trim()) {
    agents.preferred = raw.preferred;
  }
  const extraArgs = normalizeExtraArgs(raw.extraArgs);
  if (extraArgs) agents.extraArgs = extraArgs;
  return agents;
}
function normalizeCustomThemes(value) {
  if (!Array.isArray(value)) return void 0;
  const themes = value.filter((entry) => {
    const theme = safeObject(entry);
    return typeof theme.id === "string" && typeof theme.name === "string" && Object.keys(safeObject(theme.appearance)).length > 0 && Object.keys(safeObject(theme.light)).length > 0 && Object.keys(safeObject(theme.dark)).length > 0;
  });
  return themes.length > 0 ? [...themes] : void 0;
}
function detailModeFromLegacyBaseRulesMode(mode) {
  if (mode === "caveman") return "caveman";
  if (mode === "concise" || mode === "optimized") return "standard";
  return "complete";
}
function normalizeKandownConfig(raw) {
  const root = safeObject(raw);
  const ui = safeObject(root.ui);
  const agent = safeObject(root.agent);
  const workOutput = safeObject(agent.workOutput);
  const boardDigest2 = safeObject(workOutput.boardDigest);
  const workflow = safeObject(root.workflow);
  const board = safeObject(root.board);
  const tui = safeObject(root.tui);
  const tuiColumns = safeObject(tui.columns);
  const fields = safeObject(root.fields);
  const notifications = safeObject(root.notifications);
  const extensions = safeObject(root.extensions);
  const baseRulesMode = isOneOf(workOutput.baseRulesMode, BASE_RULES_MODES) ? workOutput.baseRulesMode : "full";
  const detailMode = isOneOf(workOutput.detailMode, DETAIL_MODES) ? workOutput.detailMode : detailModeFromLegacyBaseRulesMode(baseRulesMode);
  const columns = normalizeColumns(board.columns);
  const customThemes = normalizeCustomThemes(ui.customThemes);
  const wipLimits = normalizeWipLimits(board.wipLimits);
  const config = {
    ui: {
      language: stringOr(ui.language, DEFAULT_CONFIG.ui.language),
      theme: isOneOf(ui.theme, THEME_MODES) ? ui.theme : DEFAULT_CONFIG.ui.theme,
      skin: stringOr(ui.skin, DEFAULT_CONFIG.ui.skin),
      font: isOneOf(ui.font, FONT_IDS) ? ui.font : DEFAULT_CONFIG.ui.font,
      background: ui.background === "static-gradient" ? "static-gradient" : "solid",
      onboardingCompleted: booleanOr(
        ui.onboardingCompleted,
        DEFAULT_CONFIG.ui.onboardingCompleted
      ),
      ...customThemes ? { customThemes } : {}
    },
    agent: {
      suggestFollowUp: booleanOr(
        agent.suggestFollowUp,
        DEFAULT_CONFIG.agent.suggestFollowUp
      ),
      maxSuggestions: numberOr(agent.maxSuggestions, DEFAULT_CONFIG.agent.maxSuggestions),
      workOutput: {
        detailMode,
        boardDigest: {
          showColumnCounts: booleanOr(
            boardDigest2.showColumnCounts,
            DEFAULT_WORK_OUTPUT.boardDigest.showColumnCounts
          ),
          showTasks: booleanOr(
            boardDigest2.showTasks,
            DEFAULT_WORK_OUTPUT.boardDigest.showTasks
          ),
          showPriority: booleanOr(
            boardDigest2.showPriority,
            DEFAULT_WORK_OUTPUT.boardDigest.showPriority
          ),
          showAssignee: booleanOr(
            boardDigest2.showAssignee,
            DEFAULT_WORK_OUTPUT.boardDigest.showAssignee
          ),
          showBlockedBy: booleanOr(
            boardDigest2.showBlockedBy,
            DEFAULT_WORK_OUTPUT.boardDigest.showBlockedBy
          ),
          showNextActionable: booleanOr(
            boardDigest2.showNextActionable,
            DEFAULT_WORK_OUTPUT.boardDigest.showNextActionable
          )
        }
      }
    },
    workflow: {
      active: stringOr(workflow.active, DEFAULT_CONFIG.workflow.active),
      skills: stringList(workflow.skills),
      trackingCadence: isOneOf(workflow.trackingCadence, TRACKING_CADENCES) ? workflow.trackingCadence : DEFAULT_CONFIG.workflow.trackingCadence
    },
    board: {
      columns,
      defaultPriority: stringOr(board.defaultPriority, DEFAULT_CONFIG.board.defaultPriority),
      defaultOwnerType: board.defaultOwnerType === "ai" ? "ai" : "human",
      columnColors: normalizeColumnColors(board.columnColors),
      columnMeta: normalizeColumnMeta(columns, board.columnMeta),
      stackDefaultState: board.stackDefaultState === "expanded" ? "expanded" : "collapsed",
      ...wipLimits ? { wipLimits } : {}
    },
    tui: {
      defaultView: tui.defaultView === "board" ? "board" : "list",
      showDetailPane: booleanOr(tui.showDetailPane, DEFAULT_CONFIG.tui.showDetailPane),
      listSort: tui.listSort === "age" || tui.listSort === "priority" || tui.listSort === "id" ? tui.listSort : "status",
      listSortDir: tui.listSortDir === "desc" ? "desc" : "asc",
      columns: {
        age: booleanOr(tuiColumns.age, DEFAULT_CONFIG.tui.columns.age),
        status: booleanOr(tuiColumns.status, DEFAULT_CONFIG.tui.columns.status),
        priority: booleanOr(tuiColumns.priority, DEFAULT_CONFIG.tui.columns.priority),
        owner: booleanOr(tuiColumns.owner, DEFAULT_CONFIG.tui.columns.owner),
        deps: booleanOr(tuiColumns.deps, DEFAULT_CONFIG.tui.columns.deps),
        tags: booleanOr(tuiColumns.tags, DEFAULT_CONFIG.tui.columns.tags),
        assignee: booleanOr(tuiColumns.assignee, DEFAULT_CONFIG.tui.columns.assignee)
      }
    },
    fields: {
      priority: booleanOr(fields.priority, DEFAULT_CONFIG.fields.priority),
      assignee: booleanOr(fields.assignee, DEFAULT_CONFIG.fields.assignee),
      tags: booleanOr(fields.tags, DEFAULT_CONFIG.fields.tags),
      dueDate: booleanOr(fields.dueDate, DEFAULT_CONFIG.fields.dueDate),
      ownerType: booleanOr(fields.ownerType, DEFAULT_CONFIG.fields.ownerType),
      tools: booleanOr(fields.tools, DEFAULT_CONFIG.fields.tools)
    },
    notifications: {
      browser: booleanOr(notifications.browser, DEFAULT_CONFIG.notifications.browser),
      sound: booleanOr(notifications.sound, DEFAULT_CONFIG.notifications.sound),
      soundId: isOneOf(notifications.soundId, SOUND_IDS) ? notifications.soundId : DEFAULT_CONFIG.notifications.soundId,
      statusChanges: booleanOr(
        notifications.statusChanges,
        DEFAULT_CONFIG.notifications.statusChanges
      ),
      taskEdits: booleanOr(notifications.taskEdits, DEFAULT_CONFIG.notifications.taskEdits),
      subtaskCompletions: booleanOr(
        notifications.subtaskCompletions,
        DEFAULT_CONFIG.notifications.subtaskCompletions
      ),
      editDebounceMs: numberOr(
        notifications.editDebounceMs,
        DEFAULT_CONFIG.notifications.editDebounceMs
      ),
      ...typeof notifications.webhookUrl === "string" ? { webhookUrl: notifications.webhookUrl } : {}
    },
    extensions: {
      restricted: booleanOr(extensions.restricted, DEFAULT_CONFIG.extensions.restricted)
    }
  };
  const agents = normalizeAgents(root.agents);
  if (agents) config.agents = agents;
  return config;
}
function resolveColumnRole(config, columnName) {
  const rawMeta = safeObject(config.board.columnMeta);
  const meta = safeObject(lookupCaseInsensitive(rawMeta, columnName));
  return isOneOf(meta.role, COLUMN_ROLES) ? meta.role : "custom";
}
function resolveColumnNamesByRole(config, role) {
  return config.board.columns.filter(
    (columnName) => resolveColumnRole(config, columnName) === role
  );
}
function resolveColumnNameByRole(config, role) {
  return resolveColumnNamesByRole(config, role)[0];
}
var COLUMN_ROLES, DETAIL_MODES, TRACKING_CADENCES, BASE_RULES_MODES, COLUMN_COLORS, FONT_IDS, THEME_MODES, SOUND_IDS;
var init_config = __esm({
  "src/lib/config.ts"() {
    "use strict";
    init_types();
    COLUMN_ROLES = [
      "backlog",
      "ready",
      "active",
      "review",
      "terminal",
      "custom"
    ];
    DETAIL_MODES = ["caveman", "standard", "complete"];
    TRACKING_CADENCES = ["live", "balanced", "economy"];
    BASE_RULES_MODES = [
      "verbose",
      "optimized",
      "caveman",
      "full",
      "concise"
    ];
    COLUMN_COLORS = [
      "red",
      "orange",
      "amber",
      "yellow",
      "lime",
      "green",
      "emerald",
      "teal",
      "cyan",
      "sky",
      "blue",
      "indigo",
      "violet",
      "purple",
      "fuchsia",
      "pink",
      "rose",
      "slate",
      "gray",
      "zinc",
      "black",
      "blackTransparent"
    ];
    FONT_IDS = ["inter", "system", "serif", "mono", "rounded"];
    THEME_MODES = ["auto", "light", "dark"];
    SOUND_IDS = ["soft", "chime", "ping", "pop"];
  }
});

// src/lib/dependencies.ts
function terminalStatus(config = DEFAULT_CONFIG) {
  const cols = config.board.columns;
  return resolveColumnNameByRole(config, "terminal") ?? cols[cols.length - 1] ?? DEFAULT_CONFIG.board.columns.at(-1);
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
var DependencyGateError;
var init_dependencies = __esm({
  "src/lib/dependencies.ts"() {
    "use strict";
    init_config();
    init_types();
    DependencyGateError = class extends Error {
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
  }
});

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
var init_atomic_write = __esm({
  "src/cli/lib/atomic-write.ts"() {
    "use strict";
  }
});

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
var MINUTE, HOUR, DAY, WEEK, MONTH, YEAR;
var init_task_meta = __esm({
  "src/lib/task-meta.ts"() {
    "use strict";
    MINUTE = 6e4;
    HOUR = 60 * MINUTE;
    DAY = 24 * HOUR;
    WEEK = 7 * DAY;
    MONTH = 30 * DAY;
    YEAR = 365 * DAY;
  }
});

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
function normalizeStatus(status, fallback = "Backlog") {
  const value = typeof status === "string" ? status.trim() : "";
  return value || fallback;
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
function taskToBoardTask(task, defaultStatus = "Backlog") {
  const { frontmatter, body } = task;
  const { subtasks } = extractSubtasks(body);
  const done = subtasks.filter((s) => s.done).length;
  const total = subtasks.length;
  const status = normalizeStatus(frontmatter.status, defaultStatus);
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
  const defaultStatus = columnNames[0] ?? DEFAULT_COLUMNS[0];
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
    const status = normalizeStatus(task.frontmatter.status, defaultStatus);
    let column = columnsByName.get(status.toLowerCase());
    if (!column) {
      column = { name: status, tasks: [] };
      columnsByName.set(status.toLowerCase(), column);
      unknownColumns.push(column);
    }
    column.tasks.push(taskToBoardTask(task, defaultStatus));
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
var init_parser = __esm({
  "src/lib/parser.ts"() {
    "use strict";
    init_types();
    init_task_meta();
  }
});

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
var init_serializer = __esm({
  "src/lib/serializer.ts"() {
    "use strict";
  }
});

// src/lib/task-title-category.ts
function parseTaskTitle(title) {
  if (!title) return { category: null, rawCategory: null, cleanTitle: "" };
  const match = title.match(/^\[([^\]]+)\]\s*/);
  if (!match) {
    return { category: null, rawCategory: null, cleanTitle: title };
  }
  return {
    category: match[1],
    rawCategory: match[0].trim(),
    cleanTitle: title.slice(match[0].length)
  };
}
var init_task_title_category = __esm({
  "src/lib/task-title-category.ts"() {
    "use strict";
  }
});

// src/lib/task-filename.ts
function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function slugifyTitle(title, maxWords = SLUG_MAX_WORDS) {
  if (typeof title !== "string" || !title.trim()) return "";
  if (!Number.isFinite(maxWords) || maxWords < 1) return "";
  const { cleanTitle } = parseTaskTitle(title);
  let text = cleanTitle.trim() || title;
  for (const [pattern, replacement] of TRANSLITERATIONS) text = text.replace(pattern, replacement);
  const ascii = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!ascii) return "";
  const words = ascii.split(" ").filter(Boolean).map((w) => w.slice(0, SLUG_MAX_WORD_LENGTH));
  const meaningful = words.filter((w) => !STOP_WORDS.has(w));
  const chosen = (meaningful.length ? meaningful : words).slice(0, Math.floor(maxWords));
  let slug = chosen.join(SLUG_SEPARATOR);
  if (slug.length > SLUG_MAX_LENGTH) {
    slug = slug.slice(0, SLUG_MAX_LENGTH).replace(/_+[^_]*$/, "");
    if (!slug) slug = chosen[0].slice(0, SLUG_MAX_LENGTH);
  }
  return slug.replace(/^_+|_+$/g, "");
}
function buildTaskFilename(id, title, takenFilenames = []) {
  const safeId = String(id ?? "").trim();
  if (!safeId) throw new Error("buildTaskFilename requires a task id");
  if (/[\\/]|^\.+$/.test(safeId)) throw new Error(`Unsafe task id for a filename: ${safeId}`);
  const slug = slugifyTitle(title ?? "");
  const candidate = slug ? `${safeId}${SLUG_SEPARATOR}${slug}.md` : `${safeId}.md`;
  if (!takenFilenames.length) return candidate;
  const taken = new Set(takenFilenames.map((f) => f.toLowerCase()));
  if (!taken.has(candidate.toLowerCase())) return candidate;
  const stem = candidate.slice(0, -3);
  for (let n = 2; n < 1e3; n += 1) {
    const next = `${stem}${SLUG_SEPARATOR}${n}.md`;
    if (!taken.has(next.toLowerCase())) return next;
  }
  throw new Error(`Could not find a free filename for task ${safeId}`);
}
function isTaskFilename(name) {
  if (typeof name !== "string") return false;
  if (!name.toLowerCase().endsWith(".md")) return false;
  if (name.startsWith(".") || name.includes("/") || name.includes("\\")) return false;
  const base = name.slice(0, -3);
  if (!base || base === "." || base === "..") return false;
  return /^[A-Za-z0-9._-]+$/.test(base);
}
function parseTaskFilename(name) {
  if (!isTaskFilename(name)) return null;
  const base = name.slice(0, -3);
  const cut = base.indexOf(SLUG_SEPARATOR);
  const idPrefix = cut > 0 ? base.slice(0, cut) : null;
  if (idPrefix === null || cut === base.length - 1 || !ID_LIKE.test(idPrefix)) {
    return { base, idPrefix: null, slug: null, candidateIds: [base] };
  }
  const slug = base.slice(cut + 1);
  return { base, idPrefix, slug, candidateIds: [base, idPrefix] };
}
function taskIdFromFilename(name) {
  const info2 = parseTaskFilename(name);
  return info2 ? info2.idPrefix ?? info2.base : null;
}
function resolveTaskFilename(id, filenames) {
  const wanted = String(id ?? "").trim();
  if (!wanted) return null;
  const parsed = filenames.map((name) => ({ name, info: parseTaskFilename(name) })).filter((entry) => entry.info !== null).sort((a, b) => byCodeUnit(a.name, b.name));
  const pick = (matches, exact) => {
    if (!matches.length) return null;
    const [best, ...rest] = matches;
    return {
      filename: best.name,
      id: wanted,
      slug: best.info.slug,
      exact,
      ambiguousWith: rest.map((m) => m.name)
    };
  };
  const exactMatches = parsed.filter((e) => e.info.base === wanted);
  if (exactMatches.length) {
    const others = parsed.filter((e) => e.info.base !== wanted && e.info.idPrefix === wanted);
    const match = pick(exactMatches, true);
    return { ...match, ambiguousWith: [...match.ambiguousWith, ...others.map((o) => o.name)] };
  }
  const prefixMatches = parsed.filter((e) => e.info.idPrefix === wanted);
  if (prefixMatches.length) return pick(prefixMatches, false);
  const lower = wanted.toLowerCase();
  const exactCi = parsed.filter((e) => e.info.base.toLowerCase() === lower);
  if (exactCi.length) return pick(exactCi, true);
  const prefixCi = parsed.filter((e) => e.info.idPrefix?.toLowerCase() === lower);
  if (prefixCi.length) return pick(prefixCi, false);
  return null;
}
function hasDescriptiveSlug(name) {
  return parseTaskFilename(name)?.slug != null;
}
var SLUG_MAX_WORDS, SLUG_MAX_LENGTH, SLUG_MAX_WORD_LENGTH, SLUG_SEPARATOR, ID_LIKE, TRANSLITERATIONS, STOP_WORDS;
var init_task_filename = __esm({
  "src/lib/task-filename.ts"() {
    "use strict";
    init_task_title_category();
    SLUG_MAX_WORDS = 3;
    SLUG_MAX_LENGTH = 48;
    SLUG_MAX_WORD_LENGTH = 20;
    SLUG_SEPARATOR = "_";
    ID_LIKE = /^(?=.*\d)[A-Za-z0-9-]+$/;
    TRANSLITERATIONS = [
      [/ß/g, "ss"],
      [/æ/g, "ae"],
      [/œ/g, "oe"],
      [/ø/g, "o"],
      [/å/g, "a"],
      [/ð/g, "d"],
      [/þ/g, "th"],
      [/ł/g, "l"],
      [/đ/g, "d"],
      [/ħ/g, "h"],
      [/ı/g, "i"],
      [/ŋ/g, "n"]
    ];
    STOP_WORDS = /* @__PURE__ */ new Set([
      // English
      "a",
      "an",
      "and",
      "are",
      "as",
      "at",
      "be",
      "but",
      "by",
      "for",
      "from",
      "in",
      "into",
      "is",
      "it",
      "its",
      "of",
      "on",
      "onto",
      "or",
      "our",
      "that",
      "the",
      "their",
      "then",
      "there",
      "this",
      "to",
      "we",
      "when",
      "with",
      "without",
      // French
      "au",
      "aux",
      "avec",
      "ce",
      "ces",
      "dans",
      "de",
      "des",
      "du",
      "en",
      "et",
      "il",
      "la",
      "le",
      "les",
      "leur",
      "ne",
      "ou",
      "par",
      "pas",
      "pour",
      "que",
      "qui",
      "sa",
      "sans",
      "se",
      "ses",
      "son",
      "sur",
      "un",
      "une",
      "y"
    ]);
  }
});

// src/cli/lib/config.ts
import { readFileSync as readFileSync3, existsSync as existsSync3, readdirSync, statSync as statSync2 } from "fs";
import { join as join3 } from "path";
function loadConfig(kandownDir) {
  const configPath = join3(kandownDir, "kandown.json");
  if (!existsSync3(configPath)) return normalizeKandownConfig(void 0);
  let raw;
  try {
    raw = JSON.parse(readFileSync3(configPath, "utf8"));
  } catch (e) {
    const err3 = e;
    if (err3.code === "ENOENT") return normalizeKandownConfig(void 0);
    console.warn(`[kandown] kandown.json is corrupted, using defaults: ${e.message}`);
    return normalizeKandownConfig(void 0);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    console.warn("[kandown] kandown.json must be a JSON object, using defaults.");
  }
  return normalizeKandownConfig(raw);
}
function saveConfig(kandownDir, config) {
  const configPath = join3(kandownDir, "kandown.json");
  atomicWriteFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}
var init_config2 = __esm({
  "src/cli/lib/config.ts"() {
    "use strict";
    init_atomic_write();
    init_config();
  }
});

// src/cli/lib/board-reader.ts
import { existsSync as existsSync4, readdirSync as readdirSync2, readFileSync as readFileSync4, mkdirSync as mkdirSync2, unlinkSync as unlinkSync4 } from "fs";
import { dirname as dirname3, join as join4, sep } from "path";
function getProjectRoot(kandownDir) {
  return dirname3(kandownDir);
}
function getTasksDir(kandownDir) {
  return join4(getProjectRoot(kandownDir), "tasks");
}
function listTaskFilenames(directory) {
  if (!existsSync4(directory)) return [];
  try {
    return readdirSync2(directory).filter(isTaskFilename);
  } catch {
    return [];
  }
}
function listTaskIds(kandownDir) {
  const tasksDir = getTasksDir(kandownDir);
  const owners = /* @__PURE__ */ new Map();
  for (const directory of [tasksDir, join4(tasksDir, "archive")]) {
    for (const name of listTaskFilenames(directory).sort()) {
      const id = taskIdFromFilename(name);
      if (!id) continue;
      const owner = owners.get(id);
      if (owner) {
        if (owner !== name) {
          console.error(`[kandown] Two files claim task ${id}: using ${owner}, ignoring ${name}`);
        }
        continue;
      }
      owners.set(id, name);
    }
  }
  return [...owners.keys()].sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
}
function findTaskPath(kandownDir, taskId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) return null;
  const tasksDir = getTasksDir(kandownDir);
  for (const directory of [tasksDir, join4(tasksDir, "archive")]) {
    const match = resolveTaskFilename(taskId, listTaskFilenames(directory));
    if (!match) continue;
    if (match.ambiguousWith.length) {
      console.error(`[kandown] Task ${taskId} is claimed by several files, using ${match.filename} (also: ${match.ambiguousWith.join(", ")})`);
    }
    return join4(directory, match.filename);
  }
  return null;
}
function newTaskFilePath(kandownDir, id, title) {
  const tasksDir = getTasksDir(kandownDir);
  return join4(tasksDir, buildTaskFilename(id, title, listTaskFilenames(tasksDir)));
}
function readBoard(kandownDir) {
  const config = loadConfig(kandownDir);
  const ids = listTaskIds(kandownDir);
  const tasks = [];
  for (const id of ids) {
    try {
      const task = readTask(kandownDir, id, config.board.columns[0]);
      tasks.push({
        ...task,
        frontmatter: {
          ...task.frontmatter,
          id: task.frontmatter.id || id,
          status: task.frontmatter.status || config.board.columns[0] || "Backlog"
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
function readTask(kandownDir, taskId, defaultStatus) {
  const fallback = defaultStatus || loadConfig(kandownDir).board.columns[0] || "Backlog";
  const taskPath = findTaskPath(kandownDir, taskId);
  if (!taskPath) {
    return {
      frontmatter: { id: taskId, title: `Task ${taskId}`, status: fallback },
      body: ""
    };
  }
  const content = readFileSync4(taskPath, "utf8");
  const parsed = parseTaskFile(content);
  const tasksDir = getTasksDir(kandownDir);
  const inArchive = taskPath.startsWith(join4(tasksDir, "archive") + sep);
  const archived = inArchive || isArchived(parsed);
  return {
    ...parsed,
    frontmatter: {
      ...parsed.frontmatter,
      id: parsed.frontmatter.id || taskId,
      status: parsed.frontmatter.status || fallback,
      // Normalize to a real boolean so JSON serializers and `=== true`
      // checks both behave consistently downstream.
      archived: archived ? true : parsed.frontmatter.archived
    }
  };
}
function moveTaskToColumn(kandownDir, taskId, targetColumn) {
  const taskPath = findTaskPath(kandownDir, taskId);
  if (!taskPath) return false;
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
    const prevContent = readFileSync4(taskPath, "utf8");
    const newContent = serializeTaskFile(stampUpdated({
      ...parsed.frontmatter,
      id: taskId,
      status: targetColumn
    }), parsed.body);
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
function assignTaskToAgent(kandownDir, taskId, agentId) {
  const taskPath = findTaskPath(kandownDir, taskId);
  if (!taskPath) return false;
  try {
    const parsed = readTask(kandownDir, taskId);
    if (parsed.frontmatter.assignee === agentId) return true;
    const prevContent = readFileSync4(taskPath, "utf8");
    const newContent = serializeTaskFile(stampUpdated({
      ...parsed.frontmatter,
      id: taskId,
      assignee: agentId
    }), parsed.body);
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
    console.error(`[kandown] Failed to assign task ${taskId} to ${agentId}:`, e.message);
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
  const taskPath = newTaskFilePath(kandownDir, newId, title);
  atomicWriteFileSync(taskPath, content);
  pushUndo(kandownDir, {
    type: "create",
    taskId: newId,
    path: taskPath,
    previousContent: null,
    newContent: content,
    timestamp: Date.now()
  });
  return newId;
}
function archiveTaskInBoard(kandownDir, taskId) {
  const tasksDir = getTasksDir(kandownDir);
  const match = resolveTaskFilename(taskId, listTaskFilenames(tasksDir));
  if (!match) return false;
  const taskPath = join4(tasksDir, match.filename);
  if (!existsSync4(taskPath)) return false;
  try {
    const prevContent = readFileSync4(taskPath, "utf8");
    const archiveDir = join4(tasksDir, "archive");
    if (!existsSync4(archiveDir)) mkdirSync2(archiveDir, { recursive: true });
    const parsed = readTask(kandownDir, taskId);
    const newContent = serializeTaskFile(stampUpdated({
      ...parsed.frontmatter,
      id: taskId,
      archived: true
    }), parsed.body);
    const destPath = join4(archiveDir, match.filename);
    atomicWriteFileSync(destPath, newContent);
    unlinkSync4(taskPath);
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
var init_board_reader = __esm({
  "src/cli/lib/board-reader.ts"() {
    "use strict";
    init_dependencies();
    init_atomic_write();
    init_parser();
    init_serializer();
    init_task_meta();
    init_task_filename();
    init_config2();
  }
});

// src/cli/lib/agent-migration.ts
import { createHash } from "crypto";
import {
  existsSync as existsSync6,
  mkdirSync as mkdirSync3,
  readFileSync as readFileSync6,
  renameSync as renameSync2,
  unlinkSync as unlinkSync5
} from "fs";
import { homedir as homedir2 } from "os";
import { basename, extname, join as join6, resolve as resolve2 } from "path";
function sha256(path) {
  return createHash("sha256").update(readFileSync6(path)).digest("hex");
}
function migrateInstructionFile(directory, scope) {
  const oldPath = join6(directory, "instructions.md");
  const newPath = join6(directory, "kandown_work.md");
  if (!existsSync6(oldPath)) return [];
  if (existsSync6(newPath)) {
    return [{
      severity: "warning",
      code: "instruction-conflict",
      message: `Kept both instruction files because ${newPath} already exists.`,
      path: oldPath,
      destination: newPath,
      scope
    }];
  }
  renameSync2(oldPath, newPath);
  return [{
    severity: "info",
    code: "instruction-renamed",
    message: `Moved ${oldPath} to ${newPath}.`,
    path: oldPath,
    destination: newPath,
    scope
  }];
}
function collisionSafePath(directory, fileName) {
  const extension = extname(fileName);
  const stem = basename(fileName, extension);
  let candidate = join6(directory, fileName);
  let suffix = 1;
  while (existsSync6(candidate)) {
    candidate = join6(directory, `${stem}.${suffix}${extension}`);
    suffix += 1;
  }
  return candidate;
}
function migrateLegacyAgentDocs(kandownDir, knownHashes) {
  const events = [];
  for (const fileName of LEGACY_AGENT_DOCS) {
    const legacyPath = join6(kandownDir, fileName);
    if (!existsSync6(legacyPath)) continue;
    if (knownHashes.has(sha256(legacyPath))) {
      unlinkSync5(legacyPath);
      events.push({
        severity: "info",
        code: "generated-doc-removed",
        message: `Removed known generated agent document ${legacyPath}.`,
        path: legacyPath
      });
      continue;
    }
    const backupDir = join6(kandownDir, "legacy-agent-docs");
    mkdirSync3(backupDir, { recursive: true });
    const backupPath = collisionSafePath(backupDir, fileName);
    renameSync2(legacyPath, backupPath);
    events.push({
      severity: "warning",
      code: "legacy-doc-backed-up",
      message: `Preserved edited agent document at ${backupPath}.`,
      path: legacyPath,
      destination: backupPath
    });
  }
  return events;
}
function splitPreservingLineEndings(content) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character !== "\n" && character !== "\r") continue;
    const isCrLf = character === "\r" && content[index + 1] === "\n";
    const ending = isCrLf ? "\r\n" : character;
    lines.push({ body: content.slice(start, index), ending });
    if (isCrLf) index += 1;
    start = index + 1;
  }
  if (start < content.length) {
    lines.push({ body: content.slice(start), ending: "" });
  }
  return lines;
}
function preferredLineEnding(content) {
  const firstCrLf = content.indexOf("\r\n");
  const firstLf = content.indexOf("\n");
  const firstCr = content.indexOf("\r");
  if (firstCrLf >= 0 && (firstLf < 0 || firstCrLf <= firstLf)) return "\r\n";
  if (firstLf >= 0) return "\n";
  if (firstCr >= 0) return "\r";
  return "\n";
}
function migrateAgentInstructions(kandownDir, options = {}) {
  const events = [];
  const projectDirectory = resolve2(kandownDir);
  const globalDirectory = resolve2(options.homeDir ?? homedir2(), ".kandown");
  events.push(...migrateInstructionFile(projectDirectory, "project"));
  events.push(...migrateLegacyAgentDocs(
    projectDirectory,
    options.knownHashes ?? DEFAULT_KNOWN_HASHES
  ));
  if (globalDirectory !== projectDirectory) {
    events.push(...migrateInstructionFile(globalDirectory, "global"));
  }
  return events;
}
function ensureAgentBootstrap(projectRoot) {
  const agentsPath = join6(projectRoot, "AGENTS.md");
  if (!existsSync6(agentsPath)) {
    atomicWriteFileSync(agentsPath, `${AGENT_BOOTSTRAP_LINE}
`);
    return [{
      severity: "info",
      code: "bootstrap-created",
      message: `Created ${agentsPath} with the Kandown bootstrap instruction.`,
      path: agentsPath
    }];
  }
  const content = readFileSync6(agentsPath, "utf8");
  const lines = splitPreservingLineEndings(content);
  const markedIndexes = lines.map((line, index) => line.body.includes(AGENT_BOOTSTRAP_MARKER) ? index : -1).filter((index) => index >= 0);
  if (markedIndexes.length === 0) {
    const ending = preferredLineEnding(content);
    const separator = content.length > 0 && !content.endsWith("\n") && !content.endsWith("\r") ? ending : "";
    atomicWriteFileSync(agentsPath, `${content}${separator}${AGENT_BOOTSTRAP_LINE}${ending}`);
    return [{
      severity: "info",
      code: "bootstrap-appended",
      message: `Appended the Kandown bootstrap instruction to ${agentsPath}.`,
      path: agentsPath
    }];
  }
  const firstMarkedIndex = markedIndexes[0];
  const leadingBom = lines[firstMarkedIndex].body.startsWith("\uFEFF") ? "\uFEFF" : "";
  const managedBody = `${leadingBom}${AGENT_BOOTSTRAP_LINE}`;
  const isCurrent = markedIndexes.length === 1 && lines[firstMarkedIndex].body === managedBody;
  if (isCurrent) return [];
  const repaired = lines.filter((_, index) => index === firstMarkedIndex || !markedIndexes.includes(index)).map((line, index) => ({
    ...line,
    body: index === firstMarkedIndex ? managedBody : line.body
  })).map((line) => `${line.body}${line.ending}`).join("");
  atomicWriteFileSync(agentsPath, repaired);
  return [{
    severity: "info",
    code: "bootstrap-repaired",
    message: `Repaired the managed Kandown bootstrap instruction in ${agentsPath}.`,
    path: agentsPath
  }];
}
var AGENT_BOOTSTRAP_LINE, AGENT_BOOTSTRAP_MARKER, LEGACY_AGENT_DOCS, DEFAULT_KNOWN_HASHES;
var init_agent_migration = __esm({
  "src/cli/lib/agent-migration.ts"() {
    "use strict";
    init_atomic_write();
    AGENT_BOOTSTRAP_LINE = "This project uses Kandown. Before task work, run `kandown work` and follow its output. <!-- kandown:agent-ref -->";
    AGENT_BOOTSTRAP_MARKER = "<!-- kandown:agent-ref -->";
    LEGACY_AGENT_DOCS = ["AGENT.md", "AGENT_KANDOWN.md"];
    DEFAULT_KNOWN_HASHES = /* @__PURE__ */ new Set([
      "fc1380adf958f6e46ba8c5462fe56a9b34840bb85cc8648bd7021c0ba45fb7a5",
      "889ff6069c3a7e7881fb59b1dc10a469805f3e866eccf5f29c906c268f02b2f6"
    ]);
  }
});

// src/cli/lib/init.ts
import { existsSync as existsSync7, mkdirSync as mkdirSync4, copyFileSync, readdirSync as readdirSync3, statSync as statSync3 } from "fs";
import { join as join7 } from "path";
function copyRecursive(src, dest) {
  const errors = [];
  try {
    if (!existsSync7(dest)) mkdirSync4(dest, { recursive: true });
    const entries = readdirSync3(src);
    for (const entry of entries) {
      const srcPath = join7(src, entry);
      const destPath = join7(dest, entry);
      try {
        if (statSync3(srcPath).isDirectory()) {
          errors.push(...copyRecursive(srcPath, destPath));
        } else if (!existsSync7(destPath)) {
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
function writeKandownGitignore(kandownDir) {
  const path = join7(kandownDir, ".gitignore");
  if (existsSync7(path)) return;
  try {
    atomicWriteFileSync(path, KANDOWN_GITIGNORE);
  } catch {
  }
}
function doInit(kandownDir) {
  try {
    mkdirSync4(kandownDir, { recursive: true });
    const htmlSrc = join7(PKG_ROOT, "dist", "index.html");
    const htmlDest = join7(kandownDir, "kandown.html");
    if (existsSync7(htmlSrc)) {
      copyFileSync(htmlSrc, htmlDest);
    }
    migrateAgentInstructions(kandownDir);
    ensureAgentBootstrap(join7(kandownDir, ".."));
    writeKandownGitignore(kandownDir);
    const templatesDir = join7(PKG_ROOT, "templates");
    if (existsSync7(templatesDir)) {
      if (!existsSync7(join7(kandownDir, "README.md")) && existsSync7(join7(templatesDir, "README.md"))) {
        copyFileSync(join7(templatesDir, "README.md"), join7(kandownDir, "README.md"));
      }
      const tasksSrc = join7(templatesDir, "tasks");
      const tasksDest = getTasksDir(kandownDir);
      if (!existsSync7(tasksDest) && existsSync7(tasksSrc)) {
        copyRecursive(tasksSrc, tasksDest);
      }
      if (!existsSync7(join7(kandownDir, "kandown.json")) && existsSync7(join7(templatesDir, "kandown.json"))) {
        copyFileSync(join7(templatesDir, "kandown.json"), join7(kandownDir, "kandown.json"));
      }
      if (!existsSync7(join7(kandownDir, "agents.json")) && existsSync7(join7(templatesDir, "agents.json"))) {
        copyFileSync(join7(templatesDir, "agents.json"), join7(kandownDir, "agents.json"));
      }
    }
    return true;
  } catch (error) {
    console.error(`Init failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
var KANDOWN_GITIGNORE;
var init_init = __esm({
  "src/cli/lib/init.ts"() {
    "use strict";
    init_atomic_write();
    init_board_reader();
    init_updater();
    init_agent_migration();
    KANDOWN_GITIGNORE = `daemon.json
daemon.lock
.undo/

# Local extension state. Which extensions you enabled and which you trusted is a
# per-machine decision, and a committed copy is ignored at load time anyway
# (see docs/EXTENSIONS.md).
extensions/enabled.json
extensions/trust.json
`;
  }
});

// src/cli/lib/cli-shared.ts
import { existsSync as existsSync8, readFileSync as readFileSync7 } from "fs";
import { homedir as homedir3 } from "os";
import { join as join8, resolve as resolve3, basename as basename2, dirname as dirname4 } from "path";
import { spawn as spawn4 } from "child_process";
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
    return resolve3(cwd, pathArg);
  }
  const startDir = resolve3(cwd);
  const homeDir = homedir3();
  let currentDir = startDir;
  while (true) {
    const isHomeBoundary = currentDir === homeDir && currentDir !== startDir;
    if (!isHomeBoundary) {
      if (basename2(currentDir) === ".kandown" && existsSync8(join8(currentDir, "kandown.json"))) {
        return currentDir;
      }
      const candidate = join8(currentDir, ".kandown");
      if (existsSync8(join8(candidate, "kandown.json"))) {
        return candidate;
      }
    }
    if (currentDir === homeDir) break;
    if (existsSync8(join8(currentDir, ".git"))) break;
    const parentDir = dirname4(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return resolve3(cwd, pathArg);
}
function ensureKandownDir(rawArgs) {
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const kandownDir = resolveKandownDir(args.path, cwd);
  if (!existsSync8(kandownDir)) {
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
  reslug <id>|--all   Rename task files descriptively (t232_remove_dead_code.md)
  run [id]            Cascade: run ready tasks via assigned agents (DAG chain)
  agents              List detected AI agents + catalog (.kandown/agents.json)
  extension           Manage extensions (list/enable/disable/install/create)
  workflow            Manage workflows, templates, store installs and updates
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
function findTaskPath2(kandownDir, id) {
  return findTaskPath(kandownDir, id);
}
function newTaskPath(kandownDir, id, title) {
  return newTaskFilePath(kandownDir, id, title);
}
function nextTaskId(kandownDir) {
  const ids = new Set(listTaskIds(kandownDir));
  for (const name of listTaskFilenames(join8(getTasksDir(kandownDir), "archive"))) {
    const id = taskIdFromFilename(name);
    if (id) ids.add(id);
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
  const tuiPath = join8(PKG_ROOT, "bin", "tui.js");
  if (!existsSync8(tuiPath)) {
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
var c, COMMANDS;
var init_cli_shared = __esm({
  "src/cli/lib/cli-shared.ts"() {
    "use strict";
    init_updater();
    init_board_reader();
    init_init();
    init_config2();
    init_parser();
    init_task_filename();
    c = {
      reset: "\x1B[0m",
      bold: "\x1B[1m",
      dim: "\x1B[2m",
      red: "\x1B[31m",
      green: "\x1B[32m",
      yellow: "\x1B[33m",
      blue: "\x1B[34m",
      cyan: "\x1B[36m"
    };
    COMMANDS = /* @__PURE__ */ new Set([
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
      "agents",
      "reslug",
      "extension",
      "extensions",
      "theme",
      "themes",
      "workflow",
      "workflows"
    ]);
  }
});

// src/lib/workflows/validation.ts
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isWorkflowBoardRole(value) {
  return typeof value === "string" && ROLES.has(value);
}
function failure(errors) {
  return { ok: false, errors };
}
function addError(errors, code, path, message) {
  errors.push({ code, path, message });
}
function executableKey(key) {
  return EXECUTABLE_KEYS.has(key.toLowerCase());
}
function checkKnownFields(value, allowed, path, errors) {
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) continue;
    addError(
      errors,
      executableKey(key) ? "executable_payload" : "unknown_field",
      `${path}.${key}`,
      executableKey(key) ? `Executable payload declaration "${key}" is not allowed` : `Unknown field "${key}"`
    );
  }
}
function requiredString(value, key, path, errors) {
  const raw = value[key];
  if (typeof raw !== "string") {
    addError(errors, raw === void 0 ? "missing_field" : "invalid_type", `${path}.${key}`, `Expected ${key} to be a string`);
    return "";
  }
  if (!raw.trim()) addError(errors, "invalid_value", `${path}.${key}`, `${key} must not be empty`);
  return raw;
}
function fileContent(value, key, path, errors) {
  const raw = value[key];
  if (typeof raw !== "string") {
    addError(errors, raw === void 0 ? "missing_field" : "invalid_type", `${path}.${key}`, `Expected ${key} to be a string`);
    return "";
  }
  return raw;
}
function optionalString(value, key, path, errors) {
  const raw = value[key];
  if (raw === void 0) return void 0;
  if (typeof raw !== "string" || !raw.trim()) {
    addError(errors, "invalid_type", `${path}.${key}`, `Expected ${key} to be a non-empty string`);
    return void 0;
  }
  return raw;
}
function isSafeWorkflowPath(path) {
  if (!path || path.includes("\\") || path.includes("\0")) return false;
  if (path.startsWith("/") || path.startsWith("//") || /^[A-Za-z]:/.test(path)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function validatePath(path, fieldPath, expected, errors) {
  if (!isSafeWorkflowPath(path)) {
    addError(errors, "unsafe_path", fieldPath, `Path "${path}" is not a safe relative package path`);
    return;
  }
  const valid = expected === "protocol" ? path === "protocol.md" : expected === "guide" ? path === "guide.md" : expected === "board" ? path === "board.json" : /^templates\/[^/]+\.md$/.test(path);
  if (!valid) {
    addError(errors, "invalid_value", fieldPath, `Path "${path}" does not match the workflow ${expected} location`);
  }
}
function validateTaskTemplates(raw, errors) {
  if (!Array.isArray(raw)) {
    addError(errors, raw === void 0 ? "missing_field" : "invalid_type", "manifest.taskTemplates", "taskTemplates must be an array");
    return [];
  }
  const templates = [];
  const ids = /* @__PURE__ */ new Set();
  const paths = /* @__PURE__ */ new Set();
  let defaultCount = 0;
  raw.forEach((item, index) => {
    const path = `manifest.taskTemplates[${index}]`;
    if (!isRecord2(item)) {
      addError(errors, "invalid_type", path, "Task template must be an object");
      return;
    }
    checkKnownFields(item, TEMPLATE_FIELDS, path, errors);
    const id = requiredString(item, "id", path, errors);
    const name = requiredString(item, "name", path, errors);
    const description = requiredString(item, "description", path, errors);
    const file = requiredString(item, "file", path, errors);
    const defaultValue = item.default;
    if (defaultValue !== void 0 && typeof defaultValue !== "boolean") {
      addError(errors, "invalid_type", `${path}.default`, "default must be a boolean when present");
    }
    if (id && !KEBAB_CASE.test(id)) addError(errors, "invalid_value", `${path}.id`, "Template id must be kebab-case");
    if (id && ids.has(id)) addError(errors, "duplicate_id", `${path}.id`, `Duplicate task template id "${id}"`);
    if (id) ids.add(id);
    if (file) validatePath(file, `${path}.file`, "template", errors);
    if (file && paths.has(file)) addError(errors, "duplicate_id", `${path}.file`, `Duplicate task template file "${file}"`);
    if (file) paths.add(file);
    if (defaultValue === true) defaultCount += 1;
    templates.push({
      id,
      name,
      description,
      file,
      ...typeof defaultValue === "boolean" ? { default: defaultValue } : {}
    });
  });
  if (defaultCount > 1) {
    addError(errors, "duplicate_default", "manifest.taskTemplates", "At most one task template may be the default");
  }
  return templates;
}
function validateAttribution(raw, errors) {
  if (!Array.isArray(raw)) {
    addError(errors, raw === void 0 ? "missing_field" : "invalid_type", "manifest.attribution", "attribution must be an array");
    return [];
  }
  return raw.flatMap((item, index) => {
    const path = `manifest.attribution[${index}]`;
    if (!isRecord2(item)) {
      addError(errors, "invalid_type", path, "Attribution must be an object");
      return [];
    }
    checkKnownFields(item, ATTRIBUTION_FIELDS, path, errors);
    const name = requiredString(item, "name", path, errors);
    const url = requiredString(item, "url", path, errors);
    const note = optionalString(item, "note", path, errors);
    const license = optionalString(item, "license", path, errors);
    return [{ name, url, ...note ? { note } : {}, ...license ? { license } : {} }];
  });
}
function validateProvenance(raw, errors) {
  if (raw === void 0) return void 0;
  if (!isRecord2(raw)) {
    addError(errors, "invalid_type", "manifest.provenance", "provenance must be an object");
    return void 0;
  }
  checkKnownFields(raw, PROVENANCE_FIELDS, "manifest.provenance", errors);
  const sourceId = requiredString(raw, "sourceId", "manifest.provenance", errors);
  const sourceVersion = requiredString(raw, "sourceVersion", "manifest.provenance", errors);
  const repository = optionalString(raw, "repository", "manifest.provenance", errors);
  const ref = optionalString(raw, "ref", "manifest.provenance", errors);
  const forkedAt = optionalString(raw, "forkedAt", "manifest.provenance", errors);
  if (sourceId && !KEBAB_CASE.test(sourceId)) addError(errors, "invalid_value", "manifest.provenance.sourceId", "sourceId must be kebab-case");
  if (sourceVersion && !SEMVERISH.test(sourceVersion)) addError(errors, "invalid_value", "manifest.provenance.sourceVersion", "sourceVersion must be semver-like");
  return { sourceId, sourceVersion, ...repository ? { repository } : {}, ...ref ? { ref } : {}, ...forkedAt ? { forkedAt } : {} };
}
function validateRoles(raw, errors) {
  if (!Array.isArray(raw)) {
    addError(errors, raw === void 0 ? "missing_field" : "invalid_type", "manifest.requiredRoles", "requiredRoles must be an array");
    return [];
  }
  const roles = [];
  const seen = /* @__PURE__ */ new Set();
  raw.forEach((role, index) => {
    const path = `manifest.requiredRoles[${index}]`;
    if (!isWorkflowBoardRole(role)) {
      addError(errors, "invalid_value", path, `Unknown board role "${String(role)}"`);
      return;
    }
    if (seen.has(role)) {
      addError(errors, "duplicate_id", path, `Duplicate required role "${role}"`);
      return;
    }
    seen.add(role);
    roles.push(role);
  });
  return roles;
}
function validateWorkflowManifest(raw) {
  const errors = [];
  if (!isRecord2(raw)) {
    addError(errors, "invalid_type", "manifest", "Workflow manifest must be an object");
    return failure(errors);
  }
  checkKnownFields(raw, MANIFEST_FIELDS, "manifest", errors);
  if (raw.formatVersion !== 1) {
    addError(
      errors,
      raw.formatVersion === void 0 ? "missing_field" : "invalid_value",
      "manifest.formatVersion",
      "formatVersion must be 1"
    );
  }
  const id = requiredString(raw, "id", "manifest", errors);
  const name = requiredString(raw, "name", "manifest", errors);
  const version = requiredString(raw, "version", "manifest", errors);
  const author = requiredString(raw, "author", "manifest", errors);
  const description = requiredString(raw, "description", "manifest", errors);
  const summary = requiredString(raw, "summary", "manifest", errors);
  const minKandownVersion = optionalString(raw, "minKandownVersion", "manifest", errors);
  const protocol = requiredString(raw, "protocol", "manifest", errors);
  const guide = optionalString(raw, "guide", "manifest", errors);
  const boardPreset = optionalString(raw, "boardPreset", "manifest", errors);
  const requiredRoles = validateRoles(raw.requiredRoles, errors);
  const taskTemplates = validateTaskTemplates(raw.taskTemplates, errors);
  const attribution = validateAttribution(raw.attribution, errors);
  const provenance = validateProvenance(raw.provenance, errors);
  if (id && !KEBAB_CASE.test(id)) addError(errors, "invalid_value", "manifest.id", "Workflow id must be kebab-case");
  if (version && !SEMVERISH.test(version)) addError(errors, "invalid_value", "manifest.version", "Workflow version must be semver-like");
  if (minKandownVersion && !SEMVERISH.test(minKandownVersion)) {
    addError(errors, "invalid_value", "manifest.minKandownVersion", "Minimum Kandown version must be semver-like");
  }
  if (protocol) validatePath(protocol, "manifest.protocol", "protocol", errors);
  if (guide) validatePath(guide, "manifest.guide", "guide", errors);
  if (boardPreset) validatePath(boardPreset, "manifest.boardPreset", "board", errors);
  if (errors.length > 0) return failure(errors);
  return {
    ok: true,
    value: {
      formatVersion: 1,
      id,
      name,
      version,
      author,
      description,
      summary,
      ...minKandownVersion ? { minKandownVersion } : {},
      requiredRoles,
      protocol,
      ...guide ? { guide } : {},
      ...boardPreset ? { boardPreset } : {},
      taskTemplates,
      attribution,
      ...provenance ? { provenance } : {}
    }
  };
}
function findExecutableDeclaration(value, path) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findExecutableDeclaration(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord2(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (executableKey(key)) return `${path}.${key}`;
    const found = findExecutableDeclaration(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}
function parseBoardPreset(path, content, errors) {
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    addError(errors, "malformed_json", path, "Board preset must contain valid JSON");
    return void 0;
  }
  if (!isRecord2(value)) {
    addError(errors, "invalid_type", path, "Board preset root must be an object");
    return void 0;
  }
  const executable = findExecutableDeclaration(value, path);
  if (executable) {
    addError(errors, "executable_payload", executable, "Board presets cannot declare executable payloads");
    return void 0;
  }
  if (!Array.isArray(value.columns) || value.columns.length === 0) {
    addError(errors, "invalid_type", `${path}.columns`, "Board preset columns must be a non-empty array");
    return void 0;
  }
  const names = /* @__PURE__ */ new Set();
  value.columns.forEach((rawColumn, index) => {
    const columnPath = `${path}.columns[${index}]`;
    if (!isRecord2(rawColumn)) {
      addError(errors, "invalid_type", columnPath, "Board preset column must be an object");
      return;
    }
    const name = rawColumn.name;
    if (typeof name !== "string" || !name.trim()) addError(errors, "invalid_value", `${columnPath}.name`, "Column name must be a non-empty string");
    else if (names.has(name.toLocaleLowerCase())) addError(errors, "duplicate_id", `${columnPath}.name`, `Duplicate board column name "${name}"`);
    else names.add(name.toLocaleLowerCase());
    if (!isWorkflowBoardRole(rawColumn.role)) addError(errors, "invalid_value", `${columnPath}.role`, `Unknown board role "${String(rawColumn.role)}"`);
    if (rawColumn.instructions !== void 0 && typeof rawColumn.instructions !== "string") addError(errors, "invalid_type", `${columnPath}.instructions`, "Column instructions must be a string");
  });
  if (value.priorities !== void 0 && (!Array.isArray(value.priorities) || !value.priorities.every((priority) => typeof priority === "string" && priority.trim()))) {
    addError(errors, "invalid_type", `${path}.priorities`, "Board preset priorities must be an array of non-empty strings");
  }
  if (errors.length > 0) return void 0;
  return { path, content, value };
}
function sourceFilesFromUnknown(raw, errors) {
  if (!isRecord2(raw)) {
    addError(errors, "invalid_type", "files", "Workflow source files must be an object map");
    return null;
  }
  const files = {};
  for (const [path, content] of Object.entries(raw)) {
    if (!isSafeWorkflowPath(path)) {
      addError(errors, "unsafe_path", `files.${path}`, `Source path "${path}" is unsafe`);
      continue;
    }
    if (EXECUTABLE_FILE.test(path)) {
      addError(errors, "executable_payload", `files.${path}`, `Executable source file "${path}" is not allowed`);
      continue;
    }
    if (typeof content !== "string") {
      addError(errors, "invalid_type", `files.${path}`, "Source file content must be a string");
      continue;
    }
    files[path] = content;
  }
  return files;
}
function loadWorkflowPackage(rawFiles) {
  const errors = [];
  const files = sourceFilesFromUnknown(rawFiles, errors);
  if (!files) return failure(errors);
  const manifestSource = files["manifest.json"];
  if (manifestSource === void 0) {
    addError(errors, "missing_file", "files.manifest.json", "Workflow package requires manifest.json");
    return failure(errors);
  }
  let rawManifest;
  try {
    rawManifest = JSON.parse(manifestSource);
  } catch {
    addError(errors, "malformed_json", "files.manifest.json", "manifest.json must contain valid JSON");
    return failure(errors);
  }
  const manifestResult = validateWorkflowManifest(rawManifest);
  if (!manifestResult.ok) errors.push(...manifestResult.errors);
  if (!manifestResult.ok) return failure(errors);
  const manifest = manifestResult.value;
  const expectedPaths = /* @__PURE__ */ new Set(["manifest.json", manifest.protocol]);
  if (manifest.guide) expectedPaths.add(manifest.guide);
  if (manifest.boardPreset) expectedPaths.add(manifest.boardPreset);
  for (const template of manifest.taskTemplates) expectedPaths.add(template.file);
  for (const path of expectedPaths) {
    if (files[path] === void 0) addError(errors, "missing_file", `files.${path}`, `Referenced file "${path}" is missing`);
  }
  for (const path of Object.keys(files)) {
    if (!expectedPaths.has(path)) addError(errors, "unknown_file", `files.${path}`, `File "${path}" is not declared by the manifest`);
  }
  if (errors.length > 0) return failure(errors);
  const protocol = { path: manifest.protocol, content: files[manifest.protocol] ?? "" };
  const guide = manifest.guide ? { path: manifest.guide, content: files[manifest.guide] ?? "" } : void 0;
  const boardPreset = manifest.boardPreset ? parseBoardPreset(manifest.boardPreset, files[manifest.boardPreset] ?? "", errors) : void 0;
  if (boardPreset) {
    const presetRoles = new Set(boardPreset.value.columns.map((column) => column.role));
    for (const role of manifest.requiredRoles) {
      if (!presetRoles.has(role)) addError(errors, "missing_field", `${manifest.boardPreset}.columns`, `Board preset does not provide required role "${role}"`);
    }
  }
  const taskTemplates = manifest.taskTemplates.map((template) => ({
    ...template,
    content: files[template.file] ?? ""
  }));
  if (errors.length > 0) return failure(errors);
  return {
    ok: true,
    value: {
      manifest,
      protocol,
      ...guide ? { guide } : {},
      ...boardPreset ? { boardPreset } : {},
      taskTemplates
    }
  };
}
function validateLoadedTextFile(raw, path, allowed, errors) {
  if (!isRecord2(raw)) {
    addError(errors, "invalid_type", path, "Loaded text file must be an object");
    return null;
  }
  checkKnownFields(raw, allowed, path, errors);
  const filePath = requiredString(raw, "path", path, errors);
  const content = fileContent(raw, "content", path, errors);
  return { path: filePath, content };
}
function validateWorkflowPackage(raw) {
  const errors = [];
  if (!isRecord2(raw)) {
    addError(errors, "invalid_type", "package", "Loaded workflow package must be an object");
    return failure(errors);
  }
  checkKnownFields(raw, PACKAGE_FIELDS, "package", errors);
  const manifestResult = validateWorkflowManifest(raw.manifest);
  if (!manifestResult.ok) errors.push(...manifestResult.errors);
  const protocol = validateLoadedTextFile(raw.protocol, "package.protocol", TEXT_FILE_FIELDS, errors);
  const guide = raw.guide === void 0 ? void 0 : validateLoadedTextFile(raw.guide, "package.guide", TEXT_FILE_FIELDS, errors);
  let boardPreset;
  if (raw.boardPreset !== void 0) {
    const boardFile = validateLoadedTextFile(raw.boardPreset, "package.boardPreset", BOARD_FILE_FIELDS, errors);
    boardPreset = boardFile ? parseBoardPreset(boardFile.path, boardFile.content, errors) ?? null : null;
  }
  const taskTemplates = [];
  if (!Array.isArray(raw.taskTemplates)) {
    addError(errors, raw.taskTemplates === void 0 ? "missing_field" : "invalid_type", "package.taskTemplates", "Loaded taskTemplates must be an array");
  } else {
    raw.taskTemplates.forEach((item, index) => {
      const path = `package.taskTemplates[${index}]`;
      if (!isRecord2(item)) {
        addError(errors, "invalid_type", path, "Loaded task template must be an object");
        return;
      }
      checkKnownFields(item, LOADED_TEMPLATE_FIELDS, path, errors);
      const id = requiredString(item, "id", path, errors);
      const name = requiredString(item, "name", path, errors);
      const description = requiredString(item, "description", path, errors);
      const file = requiredString(item, "file", path, errors);
      const content = fileContent(item, "content", path, errors);
      const defaultValue = item.default;
      if (defaultValue !== void 0 && typeof defaultValue !== "boolean") {
        addError(errors, "invalid_type", `${path}.default`, "default must be a boolean when present");
      }
      taskTemplates.push({ id, name, description, file, content, ...typeof defaultValue === "boolean" ? { default: defaultValue } : {} });
    });
  }
  if (!manifestResult.ok || !protocol) return failure(errors);
  const manifest = manifestResult.value;
  if (protocol.path !== manifest.protocol) addError(errors, "invalid_value", "package.protocol.path", "Protocol path does not match the manifest");
  if (Boolean(guide) !== Boolean(manifest.guide)) addError(errors, "missing_file", "package.guide", "Guide presence does not match the manifest");
  if (guide && guide.path !== manifest.guide) addError(errors, "invalid_value", "package.guide.path", "Guide path does not match the manifest");
  if (Boolean(boardPreset) !== Boolean(manifest.boardPreset)) addError(errors, "missing_file", "package.boardPreset", "Board preset presence does not match the manifest");
  if (boardPreset && boardPreset.path !== manifest.boardPreset) addError(errors, "invalid_value", "package.boardPreset.path", "Board preset path does not match the manifest");
  if (taskTemplates.length !== manifest.taskTemplates.length) {
    addError(errors, "missing_file", "package.taskTemplates", "Loaded task template count does not match the manifest");
  } else {
    manifest.taskTemplates.forEach((declared, index) => {
      const loaded2 = taskTemplates[index];
      if (!loaded2 || loaded2.id !== declared.id || loaded2.file !== declared.file || loaded2.name !== declared.name || loaded2.description !== declared.description || loaded2.default !== declared.default) {
        addError(errors, "invalid_value", `package.taskTemplates[${index}]`, "Loaded task template metadata does not match the manifest");
      }
    });
  }
  if (errors.length > 0) return failure(errors);
  return {
    ok: true,
    value: {
      manifest,
      protocol,
      ...guide ? { guide } : {},
      ...boardPreset ? { boardPreset } : {},
      taskTemplates
    }
  };
}
var KEBAB_CASE, SEMVERISH, ROLES, MANIFEST_FIELDS, TEMPLATE_FIELDS, ATTRIBUTION_FIELDS, PROVENANCE_FIELDS, PACKAGE_FIELDS, TEXT_FILE_FIELDS, BOARD_FILE_FIELDS, LOADED_TEMPLATE_FIELDS, EXECUTABLE_KEYS, EXECUTABLE_FILE;
var init_validation = __esm({
  "src/lib/workflows/validation.ts"() {
    "use strict";
    KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    SEMVERISH = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
    ROLES = /* @__PURE__ */ new Set([
      "backlog",
      "ready",
      "active",
      "review",
      "terminal",
      "custom"
    ]);
    MANIFEST_FIELDS = /* @__PURE__ */ new Set([
      "formatVersion",
      "id",
      "name",
      "version",
      "author",
      "description",
      "summary",
      "minKandownVersion",
      "requiredRoles",
      "protocol",
      "guide",
      "boardPreset",
      "taskTemplates",
      "attribution",
      "provenance"
    ]);
    TEMPLATE_FIELDS = /* @__PURE__ */ new Set(["id", "name", "description", "file", "default"]);
    ATTRIBUTION_FIELDS = /* @__PURE__ */ new Set(["name", "url", "note", "license"]);
    PROVENANCE_FIELDS = /* @__PURE__ */ new Set(["sourceId", "sourceVersion", "repository", "ref", "forkedAt"]);
    PACKAGE_FIELDS = /* @__PURE__ */ new Set(["manifest", "protocol", "guide", "boardPreset", "taskTemplates"]);
    TEXT_FILE_FIELDS = /* @__PURE__ */ new Set(["path", "content"]);
    BOARD_FILE_FIELDS = /* @__PURE__ */ new Set(["path", "content", "value"]);
    LOADED_TEMPLATE_FIELDS = /* @__PURE__ */ new Set(["id", "name", "description", "file", "default", "content"]);
    EXECUTABLE_KEYS = /* @__PURE__ */ new Set([
      "bin",
      "command",
      "commands",
      "entry",
      "entrypoint",
      "executable",
      "hooks",
      "main",
      "module",
      "permissions",
      "runtime",
      "script",
      "scripts"
    ]);
    EXECUTABLE_FILE = /\.(?:cjs|cmd|com|exe|js|jsx|mjs|ps1|sh|ts|tsx)$/i;
  }
});

// src/lib/workflows/capsule.ts
function isCapsuleSectionKind(value) {
  return SECTION_KINDS.has(value);
}
function addError2(errors, code, path, message) {
  errors.push({ code, path, message });
}
function failure2(errors) {
  return { ok: false, errors };
}
function utf8Size(value) {
  return new TextEncoder().encode(value).byteLength;
}
function encodeSection(section2) {
  const encodedPath = encodeURIComponent(section2.path);
  return `<!-- kandown:section kind=${section2.kind} path=${encodedPath} chars=${section2.content.length} -->
${section2.content}${SECTION_CLOSE}`;
}
function exportWorkflowCapsule(rawPackage) {
  const packageResult = validateWorkflowPackage(rawPackage);
  if (!packageResult.ok) return packageResult;
  const workflow = packageResult.value;
  const sections = [
    {
      kind: "manifest",
      path: "manifest.json",
      content: JSON.stringify(workflow.manifest, null, 2)
    },
    { kind: "protocol", path: workflow.protocol.path, content: workflow.protocol.content }
  ];
  if (workflow.guide) sections.push({ kind: "guide", path: workflow.guide.path, content: workflow.guide.content });
  if (workflow.boardPreset) sections.push({ kind: "board", path: workflow.boardPreset.path, content: workflow.boardPreset.content });
  for (const template of workflow.taskTemplates) {
    sections.push({ kind: "template", path: template.file, content: template.content });
  }
  const capsule = [
    "---",
    'kind: "kandown-workflow-capsule"',
    "capsuleVersion: 1",
    "formatVersion: 1",
    `id: ${JSON.stringify(workflow.manifest.id)}`,
    "---",
    "",
    `# Kandown Workflow Capsule: ${workflow.manifest.name}`,
    "",
    "> This file is a data-only Kandown workflow package. Its tagged sections are portable and machine-validated.",
    "",
    sections.map(encodeSection).join("\n\n"),
    ""
  ].join("\n");
  if (utf8Size(capsule) > WORKFLOW_CAPSULE_MAX_BYTES) {
    return failure2([{
      code: "capsule_too_large",
      path: "capsule",
      message: `Workflow capsule exceeds the ${WORKFLOW_CAPSULE_MAX_BYTES} byte limit`
    }]);
  }
  return { ok: true, value: capsule };
}
function parseScalar(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
function parseFrontmatter(source, errors) {
  if (!source.startsWith("---\n")) {
    addError2(errors, "malformed_capsule", "capsule.frontmatter", "Capsule must start with YAML frontmatter");
    return { value: null, bodyStart: 0 };
  }
  const close = source.indexOf("\n---\n", 4);
  if (close === -1) {
    addError2(errors, "malformed_capsule", "capsule.frontmatter", "Capsule frontmatter is not closed");
    return { value: null, bodyStart: 0 };
  }
  const values = {};
  const lines = source.slice(4, close).split("\n");
  lines.forEach((line, index) => {
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/);
    const path = `capsule.frontmatter.line${index + 2}`;
    if (!match) {
      addError2(errors, "malformed_capsule", path, "Malformed capsule frontmatter entry");
      return;
    }
    const key = match[1] ?? "";
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      addError2(errors, "duplicate_section", `capsule.frontmatter.${key}`, `Duplicate frontmatter field "${key}"`);
      return;
    }
    if (!CAPSULE_FIELDS.has(key)) {
      addError2(
        errors,
        EXECUTABLE_FIELDS.has(key.toLowerCase()) ? "executable_payload" : "unknown_field",
        `capsule.frontmatter.${key}`,
        EXECUTABLE_FIELDS.has(key.toLowerCase()) ? `Executable payload declaration "${key}" is not allowed` : `Unknown capsule frontmatter field "${key}"`
      );
      return;
    }
    values[key] = parseScalar(match[2] ?? "");
  });
  if (values.kind !== "kandown-workflow-capsule") {
    addError2(errors, "invalid_value", "capsule.frontmatter.kind", "kind must be kandown-workflow-capsule");
  }
  if (values.capsuleVersion !== 1) {
    addError2(errors, "invalid_value", "capsule.frontmatter.capsuleVersion", "capsuleVersion must be 1");
  }
  if (values.formatVersion !== 1) {
    addError2(errors, "invalid_value", "capsule.frontmatter.formatVersion", "formatVersion must be 1");
  }
  if (typeof values.id !== "string" || !values.id) {
    addError2(errors, "invalid_type", "capsule.frontmatter.id", "id must be a non-empty string");
  }
  if (errors.length > 0) return { value: null, bodyStart: close + 5 };
  return {
    value: {
      kind: "kandown-workflow-capsule",
      capsuleVersion: 1,
      formatVersion: 1,
      id: typeof values.id === "string" ? values.id : ""
    },
    bodyStart: close + 5
  };
}
function parseSections(source, bodyStart, errors) {
  const sections = [];
  const firstTag = source.indexOf("<!-- kandown:", bodyStart);
  if (firstTag === -1) {
    addError2(errors, "malformed_capsule", "capsule.sections", "Capsule contains no Kandown sections");
    return sections;
  }
  const prelude = source.slice(bodyStart, firstTag);
  if (prelude.includes("<!-- kandown:")) {
    addError2(errors, "malformed_capsule", "capsule.sections", "Malformed Kandown tag before the first section");
    return sections;
  }
  let cursor = firstTag;
  while (cursor < source.length) {
    const remaining = source.slice(cursor);
    const open = remaining.match(SECTION_OPEN);
    if (!open) {
      addError2(errors, "malformed_capsule", `capsule.sections[${sections.length}]`, "Malformed Kandown section tag");
      return sections;
    }
    const rawKind = open[1] ?? "";
    if (!isCapsuleSectionKind(rawKind)) {
      addError2(errors, "unknown_section", `capsule.sections[${sections.length}]`, `Unknown Kandown section kind "${rawKind}"`);
      return sections;
    }
    let path;
    try {
      path = decodeURIComponent(open[2] ?? "");
    } catch {
      addError2(errors, "malformed_capsule", `capsule.sections[${sections.length}].path`, "Section path is not valid URI encoding");
      return sections;
    }
    if (!isSafeWorkflowPath(path)) {
      addError2(errors, "unsafe_path", `capsule.sections[${sections.length}].path`, `Section path "${path}" is unsafe`);
      return sections;
    }
    const length = Number(open[3]);
    if (!Number.isSafeInteger(length) || length < 0) {
      addError2(errors, "malformed_capsule", `capsule.sections[${sections.length}].chars`, "Section character count is invalid");
      return sections;
    }
    const contentStart = cursor + open[0].length;
    const contentEnd = contentStart + length;
    if (contentEnd > source.length) {
      addError2(errors, "malformed_capsule", `capsule.sections[${sections.length}]`, "Section content is shorter than its declared character count");
      return sections;
    }
    const content = source.slice(contentStart, contentEnd);
    if (!source.startsWith(SECTION_CLOSE, contentEnd)) {
      addError2(errors, "malformed_capsule", `capsule.sections[${sections.length}]`, "Section closing tag is missing or misplaced");
      return sections;
    }
    sections.push({ kind: rawKind, path, content });
    cursor = contentEnd + SECTION_CLOSE.length;
    if (cursor === source.length) break;
    const next = source.indexOf("<!-- kandown:", cursor);
    if (next === -1) {
      if (source.slice(cursor).trim()) addError2(errors, "malformed_capsule", "capsule.sections", "Unexpected content after the final section");
      break;
    }
    if (source.slice(cursor, next).trim()) {
      addError2(errors, "malformed_capsule", "capsule.sections", "Only whitespace may appear between Kandown sections");
      return sections;
    }
    cursor = next;
  }
  return sections;
}
function validateSectionSet(sections, errors) {
  const seenPaths = /* @__PURE__ */ new Set();
  const singletonCounts = /* @__PURE__ */ new Map();
  for (const section2 of sections) {
    if (seenPaths.has(section2.path)) {
      addError2(errors, "duplicate_section", `capsule.sections.${section2.path}`, `Duplicate capsule section path "${section2.path}"`);
    }
    seenPaths.add(section2.path);
    if (section2.kind !== "template") singletonCounts.set(section2.kind, (singletonCounts.get(section2.kind) ?? 0) + 1);
  }
  for (const kind of ["manifest", "protocol", "guide", "board"]) {
    const count = singletonCounts.get(kind) ?? 0;
    if ((kind === "manifest" || kind === "protocol") && count === 0) {
      addError2(errors, "missing_file", `capsule.sections.${kind}`, `Capsule requires one ${kind} section`);
    }
    if (count > 1) addError2(errors, "duplicate_section", `capsule.sections.${kind}`, `Capsule contains duplicate ${kind} sections`);
  }
  for (const section2 of sections) {
    const expected = section2.kind === "manifest" ? section2.path === "manifest.json" : section2.kind === "protocol" ? section2.path === "protocol.md" : section2.kind === "guide" ? section2.path === "guide.md" : section2.kind === "board" ? section2.path === "board.json" : /^templates\/[^/]+\.md$/.test(section2.path);
    if (!expected) addError2(errors, "invalid_value", `capsule.sections.${section2.path}`, `Path does not match ${section2.kind} section policy`);
  }
}
function importWorkflowCapsule(source) {
  const errors = [];
  if (typeof source !== "string") {
    addError2(errors, "invalid_type", "capsule", "Workflow capsule must be a string");
    return failure2(errors);
  }
  if (utf8Size(source) > WORKFLOW_CAPSULE_MAX_BYTES) {
    addError2(errors, "capsule_too_large", "capsule", `Workflow capsule exceeds the ${WORKFLOW_CAPSULE_MAX_BYTES} byte limit`);
    return failure2(errors);
  }
  const frontmatter = parseFrontmatter(source, errors);
  if (!frontmatter.value) return failure2(errors);
  const sections = parseSections(source, frontmatter.bodyStart, errors);
  validateSectionSet(sections, errors);
  if (errors.length > 0) return failure2(errors);
  const files = {};
  for (const section2 of sections) files[section2.path] = section2.content;
  const packageResult = loadWorkflowPackage(files);
  if (!packageResult.ok) return packageResult;
  if (packageResult.value.manifest.id !== frontmatter.value.id) {
    addError2(errors, "invalid_value", "capsule.frontmatter.id", "Capsule id does not match manifest id");
  }
  if (packageResult.value.manifest.formatVersion !== frontmatter.value.formatVersion) {
    addError2(errors, "invalid_value", "capsule.frontmatter.formatVersion", "Capsule formatVersion does not match the manifest");
  }
  return errors.length > 0 ? failure2(errors) : packageResult;
}
var WORKFLOW_CAPSULE_MAX_BYTES, CAPSULE_FIELDS, SECTION_KINDS, EXECUTABLE_FIELDS, SECTION_OPEN, SECTION_CLOSE;
var init_capsule = __esm({
  "src/lib/workflows/capsule.ts"() {
    "use strict";
    init_validation();
    WORKFLOW_CAPSULE_MAX_BYTES = 1048576;
    CAPSULE_FIELDS = /* @__PURE__ */ new Set(["kind", "capsuleVersion", "formatVersion", "id"]);
    SECTION_KINDS = /* @__PURE__ */ new Set(["manifest", "protocol", "guide", "board", "template"]);
    EXECUTABLE_FIELDS = /* @__PURE__ */ new Set([
      "bin",
      "command",
      "commands",
      "entry",
      "entrypoint",
      "executable",
      "hooks",
      "main",
      "module",
      "permissions",
      "runtime",
      "script",
      "scripts"
    ]);
    SECTION_OPEN = /^<!-- kandown:section kind=([a-z]+) path=([^ ]+) chars=(\d+) -->\n/;
    SECTION_CLOSE = "\n<!-- kandown:end -->";
  }
});

// src/lib/workflows/skills.ts
function fail(errors) {
  return { ok: false, errors };
}
function addError3(errors, code, path, message) {
  errors.push({ code, path, message });
}
function loadWorkflowSkill(files) {
  const errors = [];
  let raw;
  try {
    raw = JSON.parse(files["manifest.json"] ?? "");
  } catch {
    return fail([{ code: "malformed_json", path: "manifest.json", message: "Skill manifest must contain valid JSON" }]);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail([{ code: "invalid_type", path: "manifest", message: "Skill manifest must be an object" }]);
  const item = raw;
  const allowed = /* @__PURE__ */ new Set(["formatVersion", "id", "name", "version", "description", "instructions", "compatibleWorkflows", "requiredRoles"]);
  for (const key of Object.keys(item)) if (!allowed.has(key)) addError3(errors, "unknown_field", `manifest.${key}`, `Unknown skill field "${key}"`);
  const string = (key) => {
    const value = item[key];
    if (typeof value !== "string" || !value.trim()) {
      addError3(errors, value === void 0 ? "missing_field" : "invalid_value", `manifest.${key}`, `${key} must be a non-empty string`);
      return "";
    }
    return value;
  };
  const id = string("id");
  const name = string("name");
  const version = string("version");
  const description = string("description");
  const instructions = string("instructions");
  if (item.formatVersion !== 1) addError3(errors, "invalid_value", "manifest.formatVersion", "formatVersion must be 1");
  if (id && !ID.test(id)) addError3(errors, "invalid_value", "manifest.id", "Skill id must be kebab-case");
  if (version && !VERSION.test(version)) addError3(errors, "invalid_value", "manifest.version", "Skill version must be semver-like");
  if (instructions && (!/^([a-zA-Z0-9._-]+)\.md$/.test(instructions) || instructions.includes(".."))) addError3(errors, "unsafe_path", "manifest.instructions", "Skill instructions must be a safe root Markdown path");
  const compatibleWorkflows = item.compatibleWorkflows === void 0 ? void 0 : Array.isArray(item.compatibleWorkflows) && item.compatibleWorkflows.every((value) => typeof value === "string" && ID.test(value)) ? [...new Set(item.compatibleWorkflows)] : void 0;
  if (item.compatibleWorkflows !== void 0 && !compatibleWorkflows) addError3(errors, "invalid_type", "manifest.compatibleWorkflows", "compatibleWorkflows must contain kebab-case ids");
  const requiredRoles = item.requiredRoles === void 0 ? void 0 : Array.isArray(item.requiredRoles) && item.requiredRoles.every((value) => ROLES2.has(value)) ? [...new Set(item.requiredRoles)] : void 0;
  if (item.requiredRoles !== void 0 && !requiredRoles) addError3(errors, "invalid_type", "manifest.requiredRoles", "requiredRoles contains an unknown role");
  const expected = /* @__PURE__ */ new Set(["manifest.json", instructions]);
  for (const path of Object.keys(files)) if (!expected.has(path)) addError3(errors, "unknown_file", path, `Undeclared skill file "${path}"`);
  const content = files[instructions];
  if (instructions && typeof content !== "string") addError3(errors, "missing_file", instructions, `Missing skill instructions "${instructions}"`);
  if (errors.length) return fail(errors);
  return { ok: true, value: { formatVersion: 1, id, name, version, description, instructions, ...compatibleWorkflows ? { compatibleWorkflows } : {}, ...requiredRoles ? { requiredRoles } : {}, content } };
}
var ID, VERSION, ROLES2;
var init_skills = __esm({
  "src/lib/workflows/skills.ts"() {
    "use strict";
    ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
    ROLES2 = /* @__PURE__ */ new Set(["backlog", "ready", "active", "review", "terminal", "custom"]);
  }
});

// src/lib/workflows/index.ts
var init_workflows = __esm({
  "src/lib/workflows/index.ts"() {
    "use strict";
    init_validation();
    init_capsule();
    init_skills();
  }
});

// src/cli/lib/workflows-store.ts
var workflows_store_exports = {};
__export(workflows_store_exports, {
  WORKFLOW_REGISTRY_URL: () => WORKFLOW_REGISTRY_URL,
  applyWorkflowUpdate: () => applyWorkflowUpdate,
  fetchWorkflowRegistry: () => fetchWorkflowRegistry,
  installStoreWorkflow: () => installStoreWorkflow,
  previewWorkflowUpdate: () => previewWorkflowUpdate
});
import { createHash as createHash3 } from "crypto";
import { existsSync as existsSync20, readFileSync as readFileSync19 } from "fs";
import { join as join22 } from "path";
function installFilePath(kandownDir) {
  return join22(kandownDir, "workflow-installs.json");
}
function readInstalls(kandownDir) {
  try {
    const parsed = JSON.parse(readFileSync19(installFilePath(kandownDir), "utf8"));
    return parsed.version === 1 && parsed.installs && typeof parsed.installs === "object" ? parsed : { version: 1, installs: {} };
  } catch {
    return { version: 1, installs: {} };
  }
}
function writeInstalls(kandownDir, value) {
  atomicWriteFileSync(installFilePath(kandownDir), `${JSON.stringify(value, null, 2)}
`);
}
function validEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const item = entry;
  return typeof item.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) && typeof item.name === "string" && typeof item.author === "string" && typeof item.repo === "string" && typeof item.ref === "string" && (/^[0-9a-f]{40}$/i.test(item.ref) || /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(item.ref)) && typeof item.capsule === "string" && !item.capsule.includes("..") && !item.capsule.startsWith("/") && typeof item.sha256 === "string" && /^[0-9a-f]{64}$/i.test(item.sha256) && typeof item.version === "string";
}
async function fetchWorkflowRegistry(url = WORKFLOW_REGISTRY_URL) {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return { entries: [], url, error: `HTTP ${response.status}` };
    const payload = await response.json();
    const raw = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? payload.entries : [];
    if (!Array.isArray(raw)) return { entries: [], url, error: "Registry entries must be an array." };
    const entries = raw.filter(validEntry);
    return { entries, url, ...entries.length !== raw.length ? { error: `${raw.length - entries.length} invalid registry entries were ignored.` } : {} };
  } catch (error) {
    return { entries: [], url, error: error instanceof Error ? error.message : String(error) };
  }
}
function rawBase(entry) {
  const repo = entry.repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Registry repository must be a GitHub owner/repo pair.");
  return `https://raw.githubusercontent.com/${repo}/${entry.ref}`;
}
async function fetchPackage(entry) {
  if (!validEntry(entry)) throw new Error("Invalid workflow registry entry.");
  const response = await fetch(`${rawBase(entry)}/${entry.capsule}`, { headers: { Accept: "text/markdown" } });
  if (!response.ok) throw new Error(`Capsule fetch failed: HTTP ${response.status}`);
  const capsule = await response.text();
  const checksum = createHash3("sha256").update(capsule).digest("hex");
  if (checksum !== entry.sha256.toLowerCase()) throw new Error("Workflow capsule checksum does not match the approved index.");
  const imported = importWorkflowCapsule(capsule);
  if (!imported.ok) throw new Error(imported.errors.map((item) => `${item.path}: ${item.message}`).join("; "));
  if (imported.value.manifest.id !== entry.id || imported.value.manifest.version !== entry.version) throw new Error("Registry metadata does not match the workflow capsule.");
  return {
    capsule,
    workflow: {
      ...imported.value,
      manifest: {
        ...imported.value.manifest,
        provenance: { sourceId: entry.id, sourceVersion: entry.version, repository: entry.repo, ref: entry.ref }
      }
    }
  };
}
async function installStoreWorkflow(kandownDir, entry) {
  try {
    if (existsSync20(join22(kandownDir, "workflows", entry.id))) return { ok: false, error: `Workflow ${entry.id} already exists.` };
    const { workflow } = await fetchPackage(entry);
    writeWorkflowPackage(kandownDir, workflow);
    const installs = readInstalls(kandownDir);
    installs.installs[entry.id] = { ...entry, installedAt: (/* @__PURE__ */ new Date()).toISOString() };
    writeInstalls(kandownDir, installs);
    return { ok: true, id: entry.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
function simpleDiff(before, after) {
  const left = before.split("\n");
  const right = after.split("\n");
  const lines = [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length && lines.length < 400; index += 1) {
    if (left[index] === right[index]) continue;
    if (left[index] !== void 0) lines.push(`- ${left[index]}`);
    if (right[index] !== void 0) lines.push(`+ ${right[index]}`);
  }
  return lines.join("\n") || "No content changes.";
}
async function previewWorkflowUpdate(kandownDir, entry) {
  const current = loadWorkflowById(kandownDir, entry.id);
  const currentCapsule = exportWorkflowCapsule(current);
  if (!currentCapsule.ok) throw new Error(currentCapsule.errors.map((item) => item.message).join("; "));
  const next = await fetchPackage(entry);
  const nextCapsule = exportWorkflowCapsule(next.workflow);
  if (!nextCapsule.ok) throw new Error(nextCapsule.errors.map((item) => item.message).join("; "));
  return {
    id: entry.id,
    currentVersion: current.manifest.version,
    nextVersion: next.workflow.manifest.version,
    changed: currentCapsule.value !== nextCapsule.value,
    diff: simpleDiff(currentCapsule.value, nextCapsule.value),
    entry
  };
}
async function applyWorkflowUpdate(kandownDir, entry, confirmed) {
  if (!confirmed) return { ok: false, error: "Explicit update confirmation is required." };
  try {
    const { workflow } = await fetchPackage(entry);
    replaceStoreWorkflowPackage(kandownDir, workflow);
    const installs = readInstalls(kandownDir);
    installs.installs[entry.id] = { ...entry, installedAt: (/* @__PURE__ */ new Date()).toISOString() };
    writeInstalls(kandownDir, installs);
    return { ok: true, id: entry.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
var WORKFLOW_REGISTRY_URL;
var init_workflows_store = __esm({
  "src/cli/lib/workflows-store.ts"() {
    "use strict";
    init_workflows();
    init_atomic_write();
    init_workflows_cli();
    WORKFLOW_REGISTRY_URL = "https://raw.githubusercontent.com/vava-nessa/kandown/main/registry/workflows.json";
  }
});

// src/cli/lib/workflows-cli.ts
import { existsSync as existsSync21, mkdirSync as mkdirSync11, readFileSync as readFileSync20, readdirSync as readdirSync8, statSync as statSync6, unlinkSync as unlinkSync6 } from "fs";
import { basename as basename5, join as join23, resolve as resolve9 } from "path";
function sourceFiles(directory, prefix = "") {
  const files = {};
  for (const name of readdirSync8(directory)) {
    const absolute = join23(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (statSync6(absolute).isDirectory()) Object.assign(files, sourceFiles(absolute, relative));
    else files[relative] = readFileSync20(absolute, "utf8");
  }
  return files;
}
function workflowRoots(kandownDir) {
  return [
    { directory: join23(kandownDir, "workflows"), source: "local" },
    { directory: join23(PKG_ROOT, "templates", "workflows"), source: "built-in" }
  ];
}
function installedStoreIds(kandownDir) {
  try {
    const raw = JSON.parse(readFileSync20(join23(kandownDir, "workflow-installs.json"), "utf8"));
    return new Set(Object.keys(raw.installs ?? {}));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function workflowDirectory(kandownDir, id) {
  return workflowRoots(kandownDir).map((root) => ({ directory: join23(root.directory, id), source: root.source })).find((item) => existsSync21(join23(item.directory, "manifest.json"))) ?? null;
}
function packageDirectories(root) {
  if (!existsSync21(root)) return [];
  return readdirSync8(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync21(join23(root, entry.name, "manifest.json"))).map((entry) => join23(root, entry.name));
}
function compatibilityError(workflow) {
  const minimum = workflow.manifest.minKandownVersion;
  if (!minimum || semverGt(minimum, getCurrentVersion()) <= 0) return null;
  return `Requires Kandown ${minimum} or newer; running ${getCurrentVersion()}.`;
}
function listWorkflowPackages(kandownDir) {
  const active = loadConfig(kandownDir).workflow.active;
  const summaries = /* @__PURE__ */ new Map();
  for (const root of workflowRoots(kandownDir)) {
    for (const directory of packageDirectories(root.directory)) {
      let rawId = basename5(directory);
      let name = rawId;
      let version = "unknown";
      let description = "";
      let valid = false;
      let errors = [];
      try {
        const result = loadWorkflowPackage(sourceFiles(directory));
        if (result.ok) {
          rawId = result.value.manifest.id;
          name = result.value.manifest.name;
          version = result.value.manifest.version;
          description = result.value.manifest.description;
          const incompatible = compatibilityError(result.value);
          valid = !incompatible;
          if (incompatible) errors = [incompatible];
        } else errors = result.errors.map((item) => `${item.path}: ${item.message}`);
      } catch (error) {
        errors = [error instanceof Error ? error.message : String(error)];
      }
      const source = root.source === "local" && installedStoreIds(kandownDir).has(rawId) ? "store" : root.source;
      if (!summaries.has(rawId)) summaries.set(rawId, {
        id: rawId,
        name,
        version,
        description,
        source,
        active: rawId === active,
        valid,
        errors
      });
    }
  }
  return [...summaries.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function loadWorkflowById(kandownDir, id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("Workflow id must be kebab-case.");
  for (const root of workflowRoots(kandownDir)) {
    const directory = join23(root.directory, id);
    if (!existsSync21(join23(directory, "manifest.json"))) continue;
    const result = loadWorkflowPackage(sourceFiles(directory));
    if (!result.ok) throw new Error(result.errors.map((item) => `${item.path}: ${item.message}`).join("; "));
    const incompatible = compatibilityError(result.value);
    if (incompatible) throw new Error(incompatible);
    return result.value;
  }
  throw new Error(`Workflow "${id}" is not installed.`);
}
function missingWorkflowRoles(kandownDir, workflow) {
  const config = loadConfig(kandownDir);
  return workflow.manifest.requiredRoles.filter((role) => resolveColumnNamesByRole(config, role).length === 0);
}
function forkWorkflow(kandownDir, id) {
  const source = loadWorkflowById(kandownDir, id);
  const forkId = `${id}-local`;
  const fork = {
    ...source,
    manifest: {
      ...source.manifest,
      id: forkId,
      name: `${source.manifest.name} Local`,
      version: `${source.manifest.version}+local.1`,
      provenance: {
        sourceId: source.manifest.id,
        sourceVersion: source.manifest.version,
        ...source.manifest.provenance?.repository ? { repository: source.manifest.provenance.repository } : {},
        ...source.manifest.provenance?.ref ? { ref: source.manifest.provenance.ref } : {},
        forkedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    }
  };
  writeWorkflowPackage(kandownDir, fork);
  return fork;
}
function updateLocalWorkflowFile(kandownDir, id, path, content) {
  const located = workflowDirectory(kandownDir, id);
  if (!located || located.source !== "local") throw new Error("Only local workflows are editable. Fork this workflow first.");
  if (installedStoreIds(kandownDir).has(id)) throw new Error("Store workflows are immutable. Fork this workflow first.");
  const current = loadWorkflowById(kandownDir, id);
  const declared = new Set([
    current.manifest.protocol,
    current.manifest.guide,
    ...current.manifest.taskTemplates.map((template) => template.file)
  ].filter((item) => Boolean(item)));
  if (!declared.has(path) || !path.endsWith(".md") || path.includes("..")) throw new Error("File is not an editable declared Markdown source.");
  const nextFiles = { ...sourceFiles(located.directory), [path]: content };
  const validated = loadWorkflowPackage(nextFiles);
  if (!validated.ok) throw new Error(validated.errors.map((item) => `${item.path}: ${item.message}`).join("; "));
  atomicWriteFileSync(join23(located.directory, path), content);
  return validated.value;
}
function presetColumns(workflow) {
  const columns = workflow.boardPreset?.value.columns;
  if (!Array.isArray(columns)) throw new Error("Workflow has no valid board preset columns.");
  return columns.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`board.columns[${index}] must be an object.`);
    const item = raw;
    if (typeof item.name !== "string" || !item.name.trim()) throw new Error(`board.columns[${index}].name is required.`);
    const roles = ["backlog", "ready", "active", "review", "terminal", "custom"];
    if (!roles.includes(item.role)) throw new Error(`board.columns[${index}].role is invalid.`);
    return { name: item.name.trim(), role: item.role, ...typeof item.instructions === "string" ? { instructions: item.instructions } : {} };
  });
}
function previewBoardPreset(kandownDir, id) {
  const workflow = loadWorkflowById(kandownDir, id);
  const preset = presetColumns(workflow);
  const config = loadConfig(kandownDir);
  const board = readBoard(kandownDir);
  const counts = new Map(board.columns.map((column) => [column.name, column.tasks.length]));
  const byRole = new Map(preset.map((column) => [column.role, column.name]));
  const targetColumns = preset.map((column) => column.name);
  const statusMapping = {};
  const preservedColumns = [];
  for (const current of config.board.columns) {
    const role = config.board.columnMeta[current]?.role ?? "custom";
    const target = byRole.get(role) ?? (targetColumns.includes(current) ? current : void 0);
    if (target) statusMapping[current] = target;
    else if ((counts.get(current) ?? 0) > 0) {
      statusMapping[current] = current;
      targetColumns.push(current);
      preservedColumns.push(current);
    }
  }
  const taskMoves = Object.entries(statusMapping).filter(([from, to]) => from !== to && (counts.get(from) ?? 0) > 0).map(([from, to]) => ({ from, to, count: counts.get(from) ?? 0 }));
  return { workflowId: id, currentColumns: config.board.columns, targetColumns, statusMapping, taskMoves, preservedColumns };
}
function applyBoardPreset(kandownDir, id) {
  const preview = previewBoardPreset(kandownDir, id);
  const preset = presetColumns(loadWorkflowById(kandownDir, id));
  for (const taskId of listTaskIds(kandownDir)) {
    const task = readTask(kandownDir, taskId);
    const from = task.frontmatter.status ?? preview.currentColumns[0];
    const to = preview.statusMapping[from] ?? from;
    if (to === from) continue;
    const path = findTaskPath(kandownDir, taskId);
    if (!path) continue;
    atomicWriteFileSync(path, serializeTaskFile(stampUpdated({ ...task.frontmatter, status: to }), task.body));
  }
  const config = loadConfig(kandownDir);
  const nextMeta = {};
  for (const column of preset) nextMeta[column.name] = { role: column.role, ...column.instructions ? { instructions: column.instructions } : {} };
  for (const preserved of preview.preservedColumns) nextMeta[preserved] = config.board.columnMeta[preserved] ?? { role: "custom" };
  config.board.columns = preview.targetColumns;
  config.board.columnMeta = nextMeta;
  saveConfig(kandownDir, config);
  return preview;
}
function writeWorkflowPackage(kandownDir, workflow) {
  const directory = join23(kandownDir, "workflows", workflow.manifest.id);
  if (existsSync21(directory)) throw new Error(`Local workflow "${workflow.manifest.id}" already exists.`);
  mkdirSync11(join23(directory, "templates"), { recursive: true });
  atomicWriteFileSync(join23(directory, "manifest.json"), `${JSON.stringify(workflow.manifest, null, 2)}
`);
  atomicWriteFileSync(join23(directory, workflow.protocol.path), workflow.protocol.content);
  if (workflow.guide) atomicWriteFileSync(join23(directory, workflow.guide.path), workflow.guide.content);
  if (workflow.boardPreset) atomicWriteFileSync(join23(directory, workflow.boardPreset.path), workflow.boardPreset.content);
  for (const template of workflow.taskTemplates) atomicWriteFileSync(join23(directory, template.file), template.content);
  return directory;
}
function replaceStoreWorkflowPackage(kandownDir, workflow) {
  if (!installedStoreIds(kandownDir).has(workflow.manifest.id)) throw new Error("Only store-installed workflows can be updated in place.");
  const directory = join23(kandownDir, "workflows", workflow.manifest.id);
  const declared = new Set(["manifest.json", workflow.protocol.path, workflow.guide?.path, workflow.boardPreset?.path, ...workflow.taskTemplates.map((item) => item.file)].filter((item) => Boolean(item)));
  if (existsSync21(directory)) {
    for (const path of Object.keys(sourceFiles(directory))) if (!declared.has(path)) unlinkSync6(join23(directory, path));
  } else mkdirSync11(join23(directory, "templates"), { recursive: true });
  atomicWriteFileSync(join23(directory, "manifest.json"), `${JSON.stringify(workflow.manifest, null, 2)}
`);
  atomicWriteFileSync(join23(directory, workflow.protocol.path), workflow.protocol.content);
  if (workflow.guide) atomicWriteFileSync(join23(directory, workflow.guide.path), workflow.guide.content);
  if (workflow.boardPreset) atomicWriteFileSync(join23(directory, workflow.boardPreset.path), workflow.boardPreset.content);
  for (const template of workflow.taskTemplates) {
    mkdirSync11(join23(directory, "templates"), { recursive: true });
    atomicWriteFileSync(join23(directory, template.file), template.content);
  }
  return directory;
}
async function cmdWorkflow(rawArgs) {
  const args = taskParseArgs(rawArgs);
  const sub = args.positional[0];
  const { kandownDir } = ensureKandownDir(rawArgs);
  if (!sub || sub === "list" || sub === "ls") {
    for (const item of listWorkflowPackages(kandownDir)) {
      log(`${item.active ? "*" : " "} ${item.id} ${item.version} [${item.source}]${item.valid ? "" : " INVALID"}`);
      if (!item.valid) for (const message of item.errors) log(`    ${message}`);
    }
    return;
  }
  try {
    if (sub === "store") {
      const { fetchWorkflowRegistry: fetchWorkflowRegistry2 } = await Promise.resolve().then(() => (init_workflows_store(), workflows_store_exports));
      const registry = await fetchWorkflowRegistry2();
      if (registry.error) info(`Registry warning: ${registry.error}`);
      if (registry.entries.length === 0) {
        info("No approved community workflows are published yet.");
        return;
      }
      for (const entry of registry.entries) log(`${entry.id} ${entry.version} by ${entry.author}: ${entry.description ?? entry.name}`);
      return;
    }
    if (sub === "install") {
      const { fetchWorkflowRegistry: fetchWorkflowRegistry2, installStoreWorkflow: installStoreWorkflow2 } = await Promise.resolve().then(() => (init_workflows_store(), workflows_store_exports));
      const id = args.positional[1] ?? "";
      const registry = await fetchWorkflowRegistry2();
      const entry = registry.entries.find((item) => item.id === id);
      if (!entry) throw new Error(`Workflow ${id} is not present in the approved registry.`);
      const result = await installStoreWorkflow2(kandownDir, entry);
      if (!result.ok) throw new Error(result.error ?? "Install failed.");
      success(`Installed immutable workflow ${id}@${entry.version}.`);
      return;
    }
    if (sub === "update") {
      const { applyWorkflowUpdate: applyWorkflowUpdate2, fetchWorkflowRegistry: fetchWorkflowRegistry2, previewWorkflowUpdate: previewWorkflowUpdate2 } = await Promise.resolve().then(() => (init_workflows_store(), workflows_store_exports));
      const id = args.positional[1] ?? "";
      const registry = await fetchWorkflowRegistry2();
      const entry = registry.entries.find((item) => item.id === id);
      if (!entry) throw new Error(`Workflow ${id} is not present in the approved registry.`);
      const preview = await previewWorkflowUpdate2(kandownDir, entry);
      log(`${preview.currentVersion} -> ${preview.nextVersion}

${preview.diff}`);
      if (args.flags.confirm !== true) {
        info("Preview only. Re-run with --confirm to apply this validated update.");
        return;
      }
      const result = await applyWorkflowUpdate2(kandownDir, entry, true);
      if (!result.ok) throw new Error(result.error ?? "Update failed.");
      success(`Updated ${id} to ${entry.version}.`);
      return;
    }
    if (sub === "show") {
      const workflow = loadWorkflowById(kandownDir, args.positional[1] ?? "");
      log(`# ${workflow.manifest.name}

${workflow.manifest.description}

Version: ${workflow.manifest.version}
Author: ${workflow.manifest.author}
Required roles: ${workflow.manifest.requiredRoles.join(", ")}
Templates: ${workflow.taskTemplates.map((item) => `${item.id}${item.default ? " (default)" : ""}`).join(", ") || "none"}
Attribution: ${workflow.manifest.attribution.map((item) => item.name).join(", ") || "none"}

${workflow.protocol.content}${workflow.guide ? `

---

${workflow.guide.content}` : ""}`);
      return;
    }
    if (sub === "template") {
      const workflow = loadWorkflowById(kandownDir, args.positional[1] ?? "");
      const templateId = args.positional[2];
      if (!templateId) {
        for (const template2 of workflow.taskTemplates) log(`${template2.id}${template2.default ? " *" : ""}: ${template2.name} - ${template2.description}`);
        return;
      }
      const template = workflow.taskTemplates.find((item) => item.id === templateId);
      if (!template) throw new Error(`Template ${templateId} is not declared by ${workflow.manifest.id}.`);
      log(template.content);
      return;
    }
    if (sub === "use") {
      const id = args.positional[1] ?? "";
      const workflow = loadWorkflowById(kandownDir, id);
      const missing = missingWorkflowRoles(kandownDir, workflow);
      if (missing.length > 0) throw new Error(`Workflow requires missing column roles: ${missing.join(", ")}.${workflow.boardPreset ? " Preview its board preset in Settings." : ""}`);
      const config = loadConfig(kandownDir);
      config.workflow.active = workflow.manifest.id;
      saveConfig(kandownDir, config);
      success(`Using workflow ${workflow.manifest.name}.`);
      if (workflow.boardPreset) info("This workflow includes a board preset. It was not applied automatically. Preview it in Settings.");
      return;
    }
    if (sub === "validate" || sub === "pack") {
      const directory = resolve9(args.positional[1] ?? "");
      if (!existsSync21(join23(directory, "manifest.json"))) throw new Error("Expected a workflow directory containing manifest.json.");
      const result = loadWorkflowPackage(sourceFiles(directory));
      if (!result.ok) throw new Error(result.errors.map((item) => `${item.path}: ${item.message}`).join("\n"));
      if (sub === "validate") {
        success(`Valid workflow ${result.value.manifest.id}@${result.value.manifest.version}.`);
        return;
      }
      const capsule = exportWorkflowCapsule(result.value);
      if (!capsule.ok) throw new Error(capsule.errors.map((item) => item.message).join("; "));
      const destination = resolve9(String(args.flags.output || `${result.value.manifest.id}.kandown-workflow.md`));
      atomicWriteFileSync(destination, capsule.value);
      success(`Packed ${destination}.`);
      return;
    }
    if (sub === "import") {
      const capsulePath = resolve9(args.positional[1] ?? "");
      const result = importWorkflowCapsule(readFileSync20(capsulePath, "utf8"));
      if (!result.ok) throw new Error(result.errors.map((item) => `${item.path}: ${item.message}`).join("\n"));
      success(`Imported ${writeWorkflowPackage(kandownDir, result.value)}.`);
      return;
    }
    throw new Error(`Unknown workflow subcommand: ${sub}`);
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
var init_workflows_cli = __esm({
  "src/cli/lib/workflows-cli.ts"() {
    "use strict";
    init_workflows();
    init_atomic_write();
    init_cli_shared();
    init_config2();
    init_updater();
    init_board_reader();
    init_serializer();
    init_task_meta();
    init_config();
  }
});

// src/cli/cli.ts
init_updater();
import { existsSync as existsSync25 } from "fs";
import { join as join29 } from "path";

// src/cli/lib/daemon.ts
init_updater();
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
  return new Promise((resolve11) => {
    const socket = createConnection({ port, host: "127.0.0.1" }, () => {
      socket.destroy();
      resolve11(true);
    });
    socket.on("error", () => resolve11(false));
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
      resolve11(false);
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
    await new Promise((resolve11) => setTimeout(resolve11, 120));
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
    await new Promise((resolve11) => setTimeout(resolve11, 100));
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
var DAEMON_UPGRADE_ENV = "KANDOWN_DAEMON_UPGRADED_TO";
var FIRST_CHECK_MS = 15e3;
var CHECK_INTERVAL_MS = 5 * 6e4;
function pendingUpgradeTarget() {
  const running = getCurrentVersion();
  const installed = getInstalledVersion();
  if (!installed || !running) return null;
  return semverGt(installed, running) > 0 ? installed : null;
}
function scheduleDaemonSelfUpgrade(kandownDir) {
  const alreadyAttempted = process.env[DAEMON_UPGRADE_ENV];
  const check = () => {
    const target = pendingUpgradeTarget();
    if (!target) return;
    if (alreadyAttempted === target) return;
    const cliPath = join2(PKG_ROOT, "bin", "kandown.js");
    if (!existsSync2(cliPath)) return;
    try {
      const child = spawn2(
        process.execPath,
        [cliPath, "--no-update-check", "daemon", "restart", "--path", kandownDir],
        {
          cwd: dirname2(kandownDir),
          detached: true,
          stdio: "ignore",
          env: { ...process.env, [DAEMON_UPGRADE_ENV]: target }
        }
      );
      child.unref();
    } catch {
    }
  };
  const first = setTimeout(check, FIRST_CHECK_MS);
  const interval = setInterval(check, CHECK_INTERVAL_MS);
  first.unref?.();
  interval.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}

// src/cli/lib/mcp.ts
init_board_reader();
init_config2();
init_atomic_write();
init_serializer();
init_task_meta();
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
                status: { type: "string", description: "Target column name (default: first configured column)" },
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
        const taskPath = join5(getTasksDir(kandownDir), `${newId}.md`);
        atomicWriteFileSync(taskPath, serializeTaskFile(stampUpdated(fm), body));
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
      const taskPath = join5(getTasksDir(kandownDir), `${args.id}.md`);
      if (!existsSync5(taskPath)) {
        sendResponse(id, { error: { code: -32602, message: `Task ${args.id} not found` } });
        return;
      }
      const task = readTask(kandownDir, args.id);
      const reportSection = `

## Report

${args.report.trim()}`;
      const newBody = task.body.includes("## Report") ? task.body.replace(/## Report[\s\S]*/, `## Report

${args.report.trim()}`) : task.body.trim() + reportSection;
      atomicWriteFileSync(taskPath, serializeTaskFile(stampUpdated(task.frontmatter), newBody));
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

// src/cli/cli.ts
init_cli_shared();

// src/cli/commands/project.ts
init_updater();
init_board_reader();
import { existsSync as existsSync13, readFileSync as readFileSync14, copyFileSync as copyFileSync2 } from "fs";
import { join as join15, resolve as resolve5 } from "path";
import { spawn as spawn5 } from "child_process";

// src/cli/lib/kandown-work.ts
import { existsSync as existsSync12, readFileSync as readFileSync13, readdirSync as readdirSync6, statSync as statSync5 } from "fs";
import { homedir as homedir7 } from "os";
import { join as join14 } from "path";

// src/lib/kandown-work.ts
function estimateTokenCount(text) {
  const pieces = text.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
  return pieces.reduce((total, piece) => {
    if (/^[\p{L}\p{N}_]+$/u.test(piece)) {
      const divisor = /^[\x00-\x7F]+$/.test(piece) ? 4 : 2;
      return total + Math.max(1, Math.ceil(piece.length / divisor));
    }
    return total + 1;
  }, 0);
}
function kandownWorkStats(text) {
  return {
    characters: text.length,
    words: text.trim() ? text.trim().split(/\s+/u).length : 0,
    estimatedTokens: estimateTokenCount(text)
  };
}
var CORE = {
  caveman: [
    "Task Markdown is truth. Read the target task first.",
    "Respect dependencies, decisions, and out of scope.",
    "Track progress, preserve user data, and prove completion before terminal status."
  ],
  standard: [
    "Task Markdown files are the only source of task truth.",
    "Read the targeted task before working and respect dependencies and blockers.",
    "Do not invent scope or silently change recorded decisions or out of scope.",
    "Record progress at the active cadence and preserve all user-authored data.",
    "Provide reproducible evidence before moving work to a terminal column.",
    "Use only commands listed as available in this document."
  ],
  complete: [
    "Task Markdown files are the only source of task truth. Do not create an index, cache, or parallel task state.",
    "Read the targeted task, its acceptance criteria, dependencies, blockers, decisions, and out of scope before changing anything.",
    "Do not invent scope, silently reverse a human decision, or turn deferred work into a completion blocker.",
    "Keep the task file faithful to real progress at the active tracking cadence, including discoveries and blockers.",
    "Preserve user-authored task data and make every migration or destructive action explicit.",
    "Before terminal status, satisfy acceptance criteria and record reproducible verification evidence and a useful completion report.",
    "Use only commands listed as available in this document. Never assume a Kandown command exists."
  ]
};
var TRACKING = {
  live: "Update the task checklist and reports after every meaningful step. Record blockers immediately.",
  balanced: "Update the task after each completed subtask, phase change, blocker, or important discovery.",
  economy: "Update the task at start, on blockers, at phase changes, and at completion."
};
function section(title, body) {
  return `## ${title}

${body.trim()}`;
}
function compileKandownWork(input) {
  const diagnostics = [];
  const roleNames = /* @__PURE__ */ new Map();
  for (const column of input.columns) {
    if (!roleNames.has(column.meta.role)) roleNames.set(column.meta.role, column.name);
  }
  const coreRoles = ["backlog", "active", "terminal"];
  for (const role of /* @__PURE__ */ new Set([...coreRoles, ...input.workflow.manifest.requiredRoles])) {
    if (!roleNames.has(role)) diagnostics.push({
      code: "missing_column_role",
      severity: "error",
      role,
      message: `${coreRoles.includes(role) ? "Kandown core" : "Workflow"} requires a column with role "${role}".`
    });
  }
  const compatibleSkills = (input.skills ?? []).filter((skill) => {
    if (skill.compatibleWorkflows?.length && !skill.compatibleWorkflows.includes(input.workflow.manifest.id)) {
      diagnostics.push({ code: "incompatible_skill", severity: "warning", message: `Skill "${skill.id}" is not compatible with workflow "${input.workflow.manifest.id}".` });
      return false;
    }
    const missing = (skill.requiredRoles ?? []).find((role) => !roleNames.has(role));
    if (missing) {
      diagnostics.push({ code: "missing_skill_role", severity: "error", role: missing, message: `Skill "${skill.id}" requires missing column role "${missing}".` });
      return false;
    }
    return true;
  });
  let protocol = input.workflow.protocol.content.replace(/\{\{trackingPolicy\}\}/g, TRACKING[input.trackingCadence]);
  protocol = protocol.replace(/\{\{column:([a-z]+)\}\}/g, (placeholder, role) => {
    const name = roleNames.get(role);
    if (name) return name;
    diagnostics.push({ code: "unresolved_placeholder", severity: "error", role, message: `Cannot resolve ${placeholder}.` });
    return `[missing column role: ${role}]`;
  });
  const columnLines = input.columns.map(
    ({ name, meta }) => `- **${name}** (${meta.role})${meta.instructions ? `: ${meta.instructions}` : ""}`
  );
  const commandLines = input.availableCommands.map((command) => `- \`${command}\``);
  const layers = [
    section("Kandown Core", CORE[input.detailMode].map((rule) => `- ${rule}`).join("\n")),
    section("Project Columns and Available Commands", `${columnLines.join("\n")}

Available commands:
${commandLines.join("\n") || "- None declared"}`)
  ];
  if (input.extensions?.length) layers.push(section("Active Extensions", input.extensions.map((item) => `- **${item.name}** (\`${item.id}\`): ${item.summary}`).join("\n")));
  layers.push(section(`Workflow: ${input.workflow.manifest.name}`, protocol));
  layers.push(section(`Tracking Policy: ${input.trackingCadence}`, TRACKING[input.trackingCadence]));
  if (compatibleSkills.length) layers.push(section("Active Skills", compatibleSkills.map((skill) => `### ${skill.name}

${skill.content.trim()}`).join("\n\n")));
  if (input.globalInstructions?.trim()) layers.push(section("Global Instructions", input.globalInstructions));
  if (input.projectInstructions?.trim()) layers.push(section("Project Instructions", input.projectInstructions));
  layers.push(section(input.context.kind === "task" ? "Target Task Context" : "Current Board Digest", input.context.markdown));
  const markdown = `# Kandown Work

${layers.join("\n\n---\n\n")}
`;
  return { markdown, diagnostics, stats: kandownWorkStats(markdown) };
}

// src/cli/lib/kandown-work.ts
init_workflows();
init_config2();
init_board_reader();
init_updater();
init_agent_migration();

// src/lib/extensions/loader.ts
import { readdirSync as readdirSync4, readFileSync as readFileSync8, existsSync as existsSync9 } from "fs";
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
  if (m.agent !== void 0) {
    if (!m.agent || typeof m.agent !== "object" || Array.isArray(m.agent)) {
      return { ok: false, error: '"agent" must be an object' };
    }
    const agent = m.agent;
    if (typeof agent.summary !== "string" || !agent.summary.trim()) {
      return { ok: false, error: '"agent.summary" must be a non-empty string' };
    }
    if (agent.guide !== void 0 && (typeof agent.guide !== "string" || !/^[a-zA-Z0-9._/-]+$/.test(agent.guide) || agent.guide.includes("..") || agent.guide.startsWith("/"))) {
      return { ok: false, error: '"agent.guide" must be a safe relative path' };
    }
    if (agent.source !== void 0 && typeof agent.source !== "string") {
      return { ok: false, error: '"agent.source" must be a string' };
    }
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
    entries = readdirSync4(location, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
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
      raw = JSON.parse(readFileSync8(manifestPath, "utf8"));
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

// src/lib/extensions/state.ts
import { readFileSync as readFileSync9, writeFileSync as writeFileSync3, mkdirSync as mkdirSync5, realpathSync, renameSync as renameSync3 } from "fs";
import { createHash as createHash2 } from "crypto";
import { homedir as homedir5 } from "os";
import { join as join10, resolve as resolve4 } from "path";
function extensionStateDir(projectDir) {
  let canonicalProject;
  try {
    canonicalProject = realpathSync(projectDir);
  } catch {
    canonicalProject = resolve4(projectDir);
  }
  const projectHash = createHash2("sha256").update(canonicalProject).digest("hex").slice(0, 24);
  return join10(homedir5(), ".kandown", "project-state", projectHash, "extensions");
}
function enabledFilePath(projectDir) {
  return join10(extensionStateDir(projectDir), "enabled.json");
}
function loadEnabled(projectDir) {
  try {
    const raw = readFileSync9(enabledFilePath(projectDir), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x) => typeof x === "string"));
    return /* @__PURE__ */ new Set();
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function saveEnabled(projectDir, ids) {
  const file = enabledFilePath(projectDir);
  mkdirSync5(join10(file, ".."), { recursive: true });
  writeFileSync3(file, `${JSON.stringify([...ids].sort(), null, 2)}
`, "utf8");
}
function healthFilePath(projectDir) {
  return join10(extensionStateDir(projectDir), "health.json");
}
function loadFailureState(projectDir) {
  try {
    const parsed = JSON.parse(readFileSync9(healthFilePath(projectDir), "utf8"));
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
  mkdirSync5(join10(file, ".."), { recursive: true });
  const extensions = Object.fromEntries([...records.entries()].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync3(tmp, `${JSON.stringify({ version: 1, extensions }, null, 2)}
`, "utf8");
  renameSync3(tmp, file);
}

// src/lib/extensions/trust.ts
import { readFileSync as readFileSync10, writeFileSync as writeFileSync4, mkdirSync as mkdirSync6 } from "fs";
import { join as join11 } from "path";
function isRestricted(config) {
  const flag = config?.extensions?.restricted;
  return typeof flag === "boolean" ? flag : true;
}
function trustFilePath(projectDir) {
  return join11(extensionStateDir(projectDir), "trust.json");
}
function loadProjectTrust(projectDir) {
  try {
    const raw = readFileSync10(trustFilePath(projectDir), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x) => typeof x === "string"));
    return /* @__PURE__ */ new Set();
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function saveProjectTrust(projectDir, trusted) {
  const file = trustFilePath(projectDir);
  mkdirSync6(join11(file, ".."), { recursive: true });
  writeFileSync4(file, `${JSON.stringify([...trusted].sort(), null, 2)}
`, "utf8");
}

// src/cli/lib/kandown-work.ts
init_dependencies();

// src/cli/lib/skills.ts
init_workflows();
init_updater();
import { existsSync as existsSync10, readFileSync as readFileSync11, readdirSync as readdirSync5, statSync as statSync4 } from "fs";
import { homedir as homedir6 } from "os";
import { join as join12 } from "path";
function readSourceFiles(directory, prefix = "") {
  const files = {};
  for (const name of readdirSync5(directory)) {
    const absolute = join12(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (statSync4(absolute).isDirectory()) Object.assign(files, readSourceFiles(absolute, relative));
    else files[relative] = readFileSync11(absolute, "utf8");
  }
  return files;
}
function packageListing(directory, source) {
  const fallbackId = directory.split("/").at(-1) ?? "invalid-skill";
  const result = loadWorkflowSkill(readSourceFiles(directory));
  if (!result.ok) return {
    id: fallbackId,
    name: fallbackId,
    version: "0.0.0",
    description: "Invalid skill package",
    source,
    content: "",
    valid: false,
    errors: result.errors.map((error) => `${error.path}: ${error.message}`)
  };
  return { ...result.value, source, valid: true, errors: [] };
}
function listWorkflowSkills(kandownDir) {
  const found = /* @__PURE__ */ new Map();
  for (const location of [
    { directory: join12(PKG_ROOT, "templates", "skills"), source: "built-in" },
    { directory: join12(homedir6(), ".kandown", "skills"), source: "global" },
    { directory: join12(kandownDir, "skills"), source: "project" }
  ]) {
    if (!existsSync10(location.directory)) continue;
    for (const name of readdirSync5(location.directory).sort()) {
      const absolute = join12(location.directory, name);
      if (statSync4(absolute).isDirectory() && existsSync10(join12(absolute, "manifest.json"))) {
        const listing = packageListing(absolute, location.source);
        found.set(listing.id, listing);
      } else if (statSync4(absolute).isFile() && /^[a-z0-9-]+\.md$/.test(name)) {
        const id = name.slice(0, -3);
        found.set(id, {
          id,
          name: id,
          version: "0.0.0",
          description: "Legacy Markdown skill",
          source: location.source,
          content: readFileSync11(absolute, "utf8"),
          valid: true,
          errors: []
        });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}
function loadConfiguredWorkflowSkills(kandownDir, ids) {
  const installed = new Map(listWorkflowSkills(kandownDir).map((item) => [item.id, item]));
  const skills = [];
  const diagnostics = [];
  for (const id of ids) {
    const item = installed.get(id);
    if (!item) {
      diagnostics.push({ code: "missing_skill", severity: "warning", message: `Configured skill "${id}" is not installed.` });
      continue;
    }
    if (!item.valid) {
      diagnostics.push({ code: "invalid_skill", severity: "error", message: `Skill "${id}" is invalid: ${item.errors.join("; ")}` });
      continue;
    }
    skills.push({
      id: item.id,
      name: item.name,
      content: item.content,
      ...item.compatibleWorkflows ? { compatibleWorkflows: item.compatibleWorkflows } : {},
      ...item.requiredRoles ? { requiredRoles: item.requiredRoles } : {}
    });
  }
  return { skills, diagnostics };
}

// src/cli/commands/reslug.ts
init_cli_shared();
init_board_reader();
init_parser();
init_task_filename();
import { existsSync as existsSync11, renameSync as renameSync4, readFileSync as readFileSync12 } from "fs";
import { join as join13, basename as basename3, dirname as dirname5 } from "path";
import { spawnSync } from "child_process";
function isTrackedByGit(path) {
  const res = spawnSync("git", ["ls-files", "--error-unmatch", "--", basename3(path)], {
    cwd: dirname5(path),
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"]
  });
  return res.status === 0;
}
function renameFile(from, to, useGit) {
  if (useGit && isTrackedByGit(from)) {
    const res = spawnSync("git", ["mv", "--", basename3(from), basename3(to)], {
      cwd: dirname5(from),
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"]
    });
    if (res.status === 0) return "git";
  }
  renameSync4(from, to);
  return "fs";
}
function planFor(directory, filename) {
  const id = taskIdFromFilename(filename);
  if (!id) return null;
  let title = "";
  try {
    title = parseTaskFile(readFileSync12(join13(directory, filename), "utf8")).frontmatter.title ?? "";
  } catch {
    return null;
  }
  const others = listTaskFilenames(directory).filter((f) => f !== filename);
  const target = buildTaskFilename(id, title, others);
  if (target === filename) return null;
  return { id, directory, from: filename, to: target };
}
function cmdReslug(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const all = args.flags.all === true;
  const dryRun = args.flags["dry-run"] === true || args.flags.n === true;
  const force = args.flags.force === true;
  const useGit = args.flags["no-git"] !== true;
  const id = args.positional[0];
  if (!id && !all) {
    err("Usage: kandown reslug <task-id> | kandown reslug --all [--dry-run] [--no-git]");
    info("Renames tasks/t232.md to tasks/t232_remove_dead_code.md. The id never changes.");
    process.exit(1);
  }
  const tasksDir = getTasksDir(kandownDir);
  const archiveDir = join13(tasksDir, "archive");
  const plans = [];
  if (all) {
    for (const directory of [tasksDir, archiveDir]) {
      for (const filename of listTaskFilenames(directory).sort()) {
        if (!force && hasDescriptiveSlug(filename)) continue;
        const plan = planFor(directory, filename);
        if (plan) plans.push(plan);
      }
    }
  } else {
    const path = findTaskPath(kandownDir, id);
    if (!path) {
      err(`Task not found: ${id}`);
      process.exit(1);
    }
    const plan = planFor(dirname5(path), basename3(path));
    if (!plan) {
      info(`${id} already has the right filename: ${basename3(path)}`);
      return;
    }
    plans.push(plan);
  }
  if (plans.length === 0) {
    info(all ? "Every task filename is already descriptive." : "Nothing to rename.");
    return;
  }
  for (const plan of plans) {
    const label = plan.directory === archiveDir ? `${c.dim}archive/${c.reset}` : "";
    log(`  ${label}${plan.from} ${c.dim}\u2192${c.reset} ${c.bold}${plan.to}${c.reset}`);
  }
  if (dryRun) {
    info(`Dry run: ${plans.length} file${plans.length === 1 ? "" : "s"} would be renamed, nothing was touched.`);
    return;
  }
  let renamed = 0;
  let viaGit = 0;
  for (const plan of plans) {
    const from = join13(plan.directory, plan.from);
    const to = join13(plan.directory, plan.to);
    if (existsSync11(to)) {
      err(`Skipped ${plan.id}: ${plan.to} already exists`);
      continue;
    }
    try {
      if (renameFile(from, to, useGit) === "git") viaGit += 1;
      renamed += 1;
    } catch (error) {
      err(`Failed to rename ${plan.from}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  success(`Renamed ${renamed} task file${renamed === 1 ? "" : "s"}${viaGit ? ` (${viaGit} via git mv)` : ""}`);
  if (renamed) {
    info("Task ids are unchanged, so dependencies, links and branch names still resolve.");
  }
}
function countBareTaskFilenames(kandownDir) {
  const tasksDir = getTasksDir(kandownDir);
  let bare = 0;
  for (const directory of [tasksDir, join13(tasksDir, "archive")]) {
    for (const filename of listTaskFilenames(directory)) {
      if (hasDescriptiveSlug(filename)) continue;
      if (planFor(directory, filename)) bare += 1;
    }
  }
  return bare;
}

// src/cli/lib/kandown-work.ts
var AVAILABLE_COMMANDS = [
  "kandown work [task-id]",
  "kandown list [--json]",
  "kandown show <id>",
  "kandown create <title>",
  "kandown move <id> <status>",
  "kandown assign <id> [agent]",
  "kandown commit",
  "kandown reslug <id>|--all [--dry-run]"
];
function readSourceFiles2(directory, prefix = "") {
  const files = {};
  for (const name of readdirSync6(directory)) {
    const absolute = join14(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (statSync5(absolute).isDirectory()) Object.assign(files, readSourceFiles2(absolute, relative));
    else files[relative] = readFileSync13(absolute, "utf8");
  }
  return files;
}
function loadSelectedWorkflow(kandownDir, id) {
  const candidates = [join14(kandownDir, "workflows", id), join14(PKG_ROOT, "templates", "workflows", id)];
  const directory = candidates.find((candidate) => existsSync12(join14(candidate, "manifest.json")));
  if (!directory) throw new Error(`Selected workflow "${id}" is not installed.`);
  const result = loadWorkflowPackage(readSourceFiles2(directory));
  if (!result.ok) throw new Error(`Workflow "${id}" is invalid: ${result.errors.map((error) => error.message).join("; ")}`);
  return result.value;
}
function readOptional(path) {
  if (!existsSync12(path)) return void 0;
  try {
    return readFileSync13(path, "utf8");
  } catch {
    return void 0;
  }
}
function loadExtensionGuidance(kandownDir, config) {
  const projectRoot = getProjectRoot(kandownDir);
  const enabled = loadEnabled(projectRoot);
  const trusted = loadProjectTrust(projectRoot);
  const failed = loadFailureState(projectRoot);
  return discoverExtensions(projectRoot).flatMap((item) => {
    if (!item.manifestResult.ok) return [];
    const manifest = item.manifestResult.manifest;
    if (!manifest.agent?.summary || isRestricted(config) && !enabled.has(manifest.id)) return [];
    if (item.source === "project" && !trusted.has(manifest.id)) return [];
    if ((failed.get(manifest.id)?.failures ?? 0) >= 3) return [];
    return [{ id: manifest.id, name: manifest.name, summary: manifest.agent.summary }];
  });
}
function boardDigest(kandownDir, config) {
  const board = readBoard(kandownDir);
  const total = board.columns.reduce((sum, column) => sum + column.tasks.length, 0);
  const tasks = listTaskIds(kandownDir).map((id) => readTask(kandownDir, id));
  const dependencyStatus = resolveDependencyStatus(tasks, config);
  const detail = config.agent.workOutput.boardDigest;
  const lines = [`Tasks total: ${total}`];
  for (const column of board.columns) {
    const header = detail.showColumnCounts ? `- **${column.name}** (${column.tasks.length})` : `- **${column.name}**`;
    if (!detail.showTasks || column.tasks.length === 0) {
      lines.push(`${header}: ${column.tasks.length ? "tasks hidden" : "empty"}`);
      continue;
    }
    const rendered = column.tasks.slice(0, 12).map((task) => {
      const parsed = tasks.find((item) => item.frontmatter.id === task.id);
      const resolution = dependencyStatus.get(task.id);
      const blocked = parsed ? unresolvedDependencyIds(parsed, dependencyStatus) : [];
      return [
        `${task.id} ${task.title}`,
        detail.showPriority && parsed?.frontmatter.priority ? `[${parsed.frontmatter.priority}]` : "",
        detail.showAssignee && parsed?.frontmatter.assignee ? `@${parsed.frontmatter.assignee}` : "",
        detail.showBlockedBy && blocked.length ? `(blocked by ${blocked.join(", ")})` : ""
      ].filter(Boolean).join(" ");
    });
    lines.push(`${header}: ${rendered.join(", ")}${column.tasks.length > 12 ? `, and ${column.tasks.length - 12} more` : ""}`);
  }
  if (detail.showNextActionable) {
    const terminal = terminalStatus(config).toLocaleLowerCase();
    const priority = (task) => Number.parseInt(String(task.frontmatter.priority ?? "P9").slice(1), 10) || 9;
    const next = tasks.filter((task) => String(task.frontmatter.status ?? "").toLocaleLowerCase() !== terminal && unresolvedDependencyIds(task, dependencyStatus).length === 0).sort((a, b) => {
      const aColumn = config.board.columns.indexOf(String(a.frontmatter.status ?? ""));
      const bColumn = config.board.columns.indexOf(String(b.frontmatter.status ?? ""));
      return bColumn - aColumn || priority(a) - priority(b) || String(a.frontmatter.id).localeCompare(String(b.frontmatter.id), void 0, { numeric: true });
    })[0];
    lines.push(`
Next actionable: ${next ? `${next.frontmatter.id} ${next.frontmatter.title}` : "none"}`);
  }
  const bare = countBareTaskFilenames(kandownDir);
  if (bare > 0) {
    lines.push(`
Filenames: ${bare} task file${bare === 1 ? " is" : "s are"} still named after the id alone (\`t232.md\`). Descriptive names (\`t232_remove_dead_code.md\`) make git diffs and file lists readable, and the task id does not change. Offer the user \`kandown reslug --all --dry-run\` to preview it, then \`kandown reslug --all\`. Do not rename anything without being asked.`);
  }
  return lines.join("\n");
}
function compileProjectKandownWork(kandownDir, taskId) {
  for (const event of migrateAgentInstructions(kandownDir)) {
    const output = event.severity === "warning" ? console.warn : console.error;
    output(`[kandown] ${event.message}`);
  }
  ensureAgentBootstrap(getProjectRoot(kandownDir));
  const config = loadConfig(kandownDir);
  const workflow = loadSelectedWorkflow(kandownDir, config.workflow.active);
  const columns = config.board.columns.map((name) => ({
    name,
    meta: config.board.columnMeta[name] ?? { role: "custom" }
  }));
  const context = taskId ? { kind: "task", markdown: (() => {
    const task = readTask(kandownDir, taskId);
    return `**${task.frontmatter.id} ${task.frontmatter.title}**

Status: ${task.frontmatter.status}
Priority: ${task.frontmatter.priority ?? "unset"}
Dependencies: ${task.frontmatter.depends_on?.join(", ") || "none"}

${task.body.trim()}`;
  })() } : { kind: "board", markdown: boardDigest(kandownDir, config) };
  const configuredSkills = loadConfiguredWorkflowSkills(kandownDir, config.workflow.skills);
  const compiled = compileKandownWork({
    detailMode: config.agent.workOutput.detailMode,
    trackingCadence: config.workflow.trackingCadence,
    columns,
    availableCommands: AVAILABLE_COMMANDS,
    workflow,
    extensions: loadExtensionGuidance(kandownDir, config),
    skills: configuredSkills.skills,
    globalInstructions: readOptional(join14(homedir7(), ".kandown", "kandown_work.md")),
    projectInstructions: readOptional(join14(kandownDir, "kandown_work.md")),
    context
  });
  return { ...compiled, diagnostics: [...configuredSkills.diagnostics, ...compiled.diagnostics] };
}

// src/cli/commands/project.ts
init_init();
init_cli_shared();
function cmdInit(rawArgs) {
  const args = parseArgs(rawArgs);
  const kandownDir = resolve5(process.cwd(), args.path);
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
  const latest = await new Promise((resolve11) => {
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
    child.on("error", () => resolve11(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve11(null);
      const v = stdout.trim().replace(/^"|"$/g, "");
      resolve11(v || null);
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
  const kandownDir = resolve5(cwd, args.path);
  const htmlDest = join15(kandownDir, "kandown.html");
  if (existsSync13(htmlDest)) {
    const htmlSrc = resolve5(PKG_ROOT, "dist", "index.html");
    if (existsSync13(htmlSrc)) {
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
  const configPath = join15(kandownDir, "kandown.json");
  if (existsSync13(configPath)) {
    try {
      JSON.parse(readFileSync14(configPath, "utf8"));
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
  const taskId = parseArgs(rawArgs).positional[0];
  const compiled = compileProjectKandownWork(kandownDir, taskId);
  for (const diagnostic of compiled.diagnostics) console.error(`[kandown] ${diagnostic.severity}: ${diagnostic.message}`);
  console.error(`[kandown] ~${compiled.stats.estimatedTokens.toLocaleString("en-US")} tokens (${compiled.stats.words.toLocaleString("en-US")} words, estimate varies by model).`);
  process.stdout.write(compiled.markdown);
}

// src/cli/commands/tasks.ts
init_board_reader();
import { existsSync as existsSync17, readFileSync as readFileSync18, mkdirSync as mkdirSync8 } from "fs";
import { join as join19, resolve as resolve8 } from "path";
import { spawnSync as spawnSync2 } from "child_process";

// src/cli/lib/extensions-cli.ts
import { existsSync as existsSync15, readFileSync as readFileSync16, writeFileSync as writeFileSync5, mkdirSync as mkdirSync7, cpSync, rmSync, readdirSync as readdirSync7 } from "fs";
import { join as join17, resolve as resolve7 } from "path";

// src/lib/extensions/host.ts
import { createJiti } from "jiti";
import { existsSync as existsSync14 } from "fs";
import { join as join16, resolve as resolve6 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

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
    const candidates = mainRel ? [resolve6(dir, mainRel)] : [join16(dir, "index.ts"), join16(dir, "index.js"), join16(dir, "index.mjs")];
    for (const c2 of candidates) if (existsSync14(c2)) return c2;
    return null;
  }
  async loadFactory(entry) {
    if (!this.jiti) {
      const base = typeof __filename !== "undefined" ? __filename : fileURLToPath2(import.meta.url);
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
init_board_reader();
init_config2();
init_updater();
init_serializer();
init_parser();
init_task_meta();
init_atomic_write();
init_cli_shared();
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
      const taskPath = findTaskPath(kandownDir, taskId);
      if (!taskPath) throw new Error(`task not found: ${taskId}`);
      const parsed = readTask(kandownDir, taskId);
      const next = setField(parsed.frontmatter, extId, key, value);
      atomicWriteFileSync(taskPath, serializeTaskFile(stampUpdated(next), parsed.body));
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
  const usage = `${c.cyan}kandown extension${c.reset} ${c.dim}<list|enable|disable|install|create|guide|purge>${c.reset}`;
  if (!sub) {
    log(usage);
    return;
  }
  const host = await loadExtensionHost(kandownDir);
  switch (sub) {
    case "guide": {
      const id = args.positional[1];
      if (!id) {
        err("Usage: kandown extension guide <id>");
        process.exitCode = 1;
        return;
      }
      const extension = host.get(id);
      if (!extension) {
        err(`Extension not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      const guidance = extension.manifest.agent;
      if (!guidance) {
        info(`${id} does not provide agent guidance.`);
        return;
      }
      log(`# ${extension.manifest.name} agent guide

${guidance.summary}`);
      if (guidance.guide) {
        const guidePath = resolve7(extension.dir, guidance.guide);
        if (!guidePath.startsWith(`${resolve7(extension.dir)}/`) || !existsSync15(guidePath)) {
          err(`Declared guide is unavailable: ${guidance.guide}`);
          process.exitCode = 1;
          return;
        }
        log(`
${readFileSync16(guidePath, "utf8")}`);
      }
      if (guidance.source) log(`
Source: ${guidance.source}`);
      return;
    }
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
  const tasksDir = join17(projectDir, "tasks");
  let count = 0;
  if (!existsSync15(tasksDir)) return 0;
  for (const file of readdirSync7(tasksDir)) {
    if (!file.endsWith(".md")) continue;
    const path = join17(tasksDir, file);
    const raw = readFileSync16(path, "utf8");
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
  const destRoot = join17(projectDir, ".kandown", "extensions");
  mkdirSync7(destRoot, { recursive: true });
  const src = resolve7(target);
  if (existsSync15(src) && existsSync15(join17(src, "manifest.json"))) {
    const manifest = JSON.parse(readFileSync16(join17(src, "manifest.json"), "utf8"));
    if (!manifest.id) return null;
    const dest = join17(destRoot, manifest.id);
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
  const dir = join17(projectDir, ".kandown", "extensions", name);
  if (existsSync15(dir)) {
    err(`Already exists: ${dir}`);
    process.exit(1);
  }
  mkdirSync7(dir, { recursive: true });
  const manifest = {
    id: name,
    name,
    version: "0.1.0",
    apiVersion: 1,
    description: "A kandown extension.",
    permissions: ["read:tasks", `write:field:plugins.${name}.*`],
    contributes: { fields: [], webPanels: [], commands: [], gates: [] }
  };
  writeFileSync5(join17(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}
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
  writeFileSync5(join17(dir, "index.ts"), indexTs);
  writeFileSync5(join17(dir, "README.md"), `# ${name}

A kandown extension. Enable with \`kandown extension enable ${name}\`.
`);
}

// src/cli/commands/tasks.ts
init_config2();

// src/cli/lib/agents.ts
import { execFileSync as execFileSync2 } from "child_process";

// src/cli/lib/agents-config.ts
init_atomic_write();
import { existsSync as existsSync16, readFileSync as readFileSync17 } from "fs";
import { join as join18 } from "path";
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
      { id: "pi", name: "Pi", bin: "pi", interactive: true, description: "Earendil Works pi coding agent", aliases: ["pi", "piearendil", "picodingagent"] },
      { id: "crush", name: "Crush", bin: "crush", interactive: true, description: "Charmbracelet Crush (Glamourous agentic TUI)", aliases: ["crush", "charmbraceletcrush"] },
      { id: "openclaw", name: "OpenClaw", bin: "openclaw", interactive: true, description: "OpenClaw Foundation personal AI assistant", aliases: ["openclaw", "openclawfoundation", "claw"] },
      { id: "kimi", name: "Kimi Code CLI", bin: "kimi", interactive: true, description: "Moonshot Kimi Code CLI (terminal coding agent)", aliases: ["kimi", "moonshot", "moonshotai", "kimicode"] },
      { id: "qwen", name: "Qwen Code", bin: "qwen", interactive: true, description: "Alibaba Qwen3-Coder CLI (QwenLM/qwen-code)", aliases: ["qwen", "qwencode", "qwenlm", "alibabaqwen"] },
      { id: "vibe", name: "Mistral Vibe", bin: "vibe", interactive: true, description: "Mistral Vibe CLI (Devstral-powered)", aliases: ["vibe", "mistralvibe"] },
      { id: "grok", name: "Grok Build", bin: "grok", interactive: true, description: "xAI Grok Build (terminal coding agent)", aliases: ["grok", "grokbuild", "xaigrok", "xai"] },
      { id: "openhands", name: "OpenHands", bin: "openhands", interactive: true, description: "OpenHands CLI (Python; multi-agent)", aliases: ["openhands", "openhandscli", "openhand"] },
      { id: "pplx", name: "Perplexity CLI", bin: "pplx", interactive: true, description: "Perplexity pplx CLI (search + agent capabilities)", aliases: ["pplx", "pplxcli", "perplexitycli", "perplexity"] },
      { id: "copilot", name: "GitHub Copilot CLI", bin: "copilot", interactive: true, description: "GitHub Copilot CLI (interactive session)", aliases: ["copilot", "githubcopilot", "ghcopilot"] },
      { id: "amp", name: "Amp", bin: "amp", interactive: false, description: "Sourcegraph Amp (execute mode)", aliases: ["amp", "sourcegraphamp", "ampcode"] },
      { id: "droid", name: "Factory Droid", bin: "droid", interactive: false, description: "Factory AI droid (headless exec)", aliases: ["droid", "factory", "factoryai", "factorydroid"] },
      { id: "auggie", name: "Auggie", bin: "auggie", interactive: true, description: "Augment Code CLI", aliases: ["auggie", "augment", "augmentcode"] },
      { id: "amazonq", name: "Amazon Q Developer", bin: "q", interactive: true, description: "Amazon Q Developer CLI (q chat)", aliases: ["q", "amazonq", "awsq", "qdeveloper"] },
      { id: "cline", name: "Cline", bin: "cline", interactive: false, description: "Cline CLI (task mode)", aliases: ["cline", "clinedev", "claudedev"] },
      { id: "agy", name: "Agy", bin: "agy", interactive: true, description: "Agy coding agent", aliases: ["agy"] }
    ]
  };
}
function loadAgentsConfig(kandownDir) {
  const path = join18(kandownDir, "agents.json");
  if (!existsSync16(path)) return defaultAgentsConfig();
  let raw;
  try {
    raw = JSON.parse(readFileSync17(path, "utf8"));
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
  const path = join18(kandownDir, "agents.json");
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
  },
  // 📖 Second compatibility wave. Same contract as the block above: an entry
  // here needs a matching alias in src/lib/agent-aliases.ts so the web view can
  // render the `assignee:` the CLI writes. Each buildCommand below mirrors the
  // flag the tool actually documents for "start a session on this prompt" —
  // several of these CLIs only expose a one-shot mode, and those are marked
  // `interactive: false` rather than being forced into a fake TUI launch.
  {
    id: "copilot",
    name: "GitHub Copilot CLI",
    bin: "copilot",
    description: "GitHub Copilot CLI (interactive session)",
    interactive: true,
    aliases: ["copilot", "githubcopilot", "ghcopilot"],
    // 📖 `-p/--prompt` exits after the answer; `-i/--interactive <prompt>` runs
    // the prompt and *keeps* the session, which is what a task launch wants.
    buildCommand: (opts) => ["copilot", "--interactive", combinedPrompt(opts)]
  },
  {
    id: "amp",
    name: "Amp",
    bin: "amp",
    description: "Sourcegraph Amp (execute mode)",
    interactive: false,
    aliases: ["amp", "sourcegraphamp", "ampcode"],
    // 📖 Amp's only prompt-taking entry point is execute mode: it runs the
    // prompt once and closes the session, hence interactive: false.
    buildCommand: (opts) => ["amp", "-x", combinedPrompt(opts)]
  },
  {
    id: "droid",
    name: "Factory Droid",
    bin: "droid",
    description: "Factory AI droid (headless exec)",
    interactive: false,
    aliases: ["droid", "factory", "factoryai", "factorydroid"],
    // 📖 `droid exec` is the scriptable, non-interactive entry point.
    buildCommand: (opts) => ["droid", "exec", combinedPrompt(opts)]
  },
  {
    id: "auggie",
    name: "Auggie",
    bin: "auggie",
    description: "Augment Code CLI",
    interactive: true,
    aliases: ["auggie", "augment", "augmentcode"],
    buildCommand: (opts) => ["auggie", combinedPrompt(opts)]
  },
  {
    id: "amazonq",
    name: "Amazon Q Developer",
    bin: "q",
    description: "Amazon Q Developer CLI (q chat)",
    interactive: true,
    aliases: ["q", "amazonq", "awsq", "qdeveloper"],
    buildCommand: (opts) => ["q", "chat", combinedPrompt(opts)]
  },
  {
    id: "cline",
    name: "Cline",
    bin: "cline",
    description: "Cline CLI (task mode)",
    interactive: false,
    aliases: ["cline", "clinedev", "claudedev"],
    buildCommand: (opts) => ["cline", "task", combinedPrompt(opts)]
  },
  {
    id: "agy",
    name: "Agy",
    bin: "agy",
    description: "Agy coding agent",
    interactive: true,
    aliases: ["agy"],
    // 📖 Same shape as Gemini: `--prompt-interactive` runs the prompt then
    // hands the session back to the user. `--print` would be headless.
    buildCommand: (opts) => ["agy", "--prompt-interactive", combinedPrompt(opts)]
  }
];
function getProjectCwd(kandownDir) {
  const m = kandownDir.replace(/\/(\.kandown|kandown)$/, "");
  return m && m !== kandownDir ? m : process.cwd();
}
var binPathCache = /* @__PURE__ */ new Map();
function detectCatalogJSON(kandownDir) {
  const catalog = loadCatalog(kandownDir);
  const preferred = kandownDir ? loadAgentsConfig(kandownDir).preferred : void 0;
  return {
    ...preferred ? { preferred } : {},
    agents: catalog.map((a) => {
      const binPath = resolveBinPath(a.bin);
      return {
        id: a.id,
        name: a.name,
        bin: a.bin,
        installed: binPath !== null,
        binPath,
        interactive: a.interactive,
        description: a.description,
        aliases: a.aliases ?? [],
        ...preferred === a.id ? { preferred: true } : {}
      };
    })
  };
}
function resolveBinPath(bin) {
  const cached = binPathCache.get(bin);
  if (cached !== void 0) return cached;
  let resolved = null;
  try {
    const out = execFileSync2("which", [bin], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const first = out.split("\n").map((l) => l.trim()).find(Boolean);
    resolved = first && first.startsWith("/") ? first : null;
  } catch {
    resolved = null;
  }
  binPathCache.set(bin, resolved);
  return resolved;
}
function isAgentInstalled(bin) {
  return resolveBinPath(bin) !== null;
}
function warmupDetection(catalog) {
  for (const agent of catalog) resolveBinPath(agent.bin);
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
  const installed = [];
  for (const agent of catalog) {
    const binPath = resolveBinPath(agent.bin);
    if (binPath) installed.push({ ...agent, binPath });
  }
  return installed;
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
function buildPrompt(agentDoc, taskContent, taskId, kandownDir, activeStatus, terminalStatus2, handoff, queue) {
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
    `Work through these tasks strictly in order. For each one: set its status to "${activeStatus}", do the work, update the task file as you go, then set it to "${terminalStatus2}" with a completion report before starting the next.`,
    "",
    ...queue.map((q, i) => `${i + 1}. ${q.id} \u2014 ${q.title}`),
    "",
    `When the whole queue is in "${terminalStatus2}", stop.`,
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
    `1. Set task ${taskId} frontmatter status to "${activeStatus}" (it may already be there, which is fine)`,
    "2. Work through each subtask, checking them off and adding reports as you go",
    `3. When done, write the completion report and set the task status to "${terminalStatus2}"`
  ].join("\n");
  return { systemPrompt, taskPrompt };
}

// src/cli/commands/tasks.ts
init_atomic_write();
init_parser();
init_serializer();
init_task_meta();
init_cli_shared();
function cmdList(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const defaultStatus = loadConfig(kandownDir).board.columns[0] || "Backlog";
  const args = taskParseArgs(rawArgs);
  const includeArchived = args.flags.archived === true;
  const statusFilter = stringFlag(args.flags, "status")?.toLowerCase() ?? null;
  const priorityFilter = stringFlag(args.flags, "priority")?.toUpperCase() ?? null;
  const assigneeFilter = stringFlag(args.flags, "assignee");
  const tagFilters = listFlag(args.flags, "tag").map((tag) => tag.toLowerCase());
  const rows = [];
  for (const id of listTaskIds(kandownDir)) {
    const task = readTask(kandownDir, id);
    const archived = isArchived(task);
    if (archived && !includeArchived) continue;
    const baseStatus = task.frontmatter.status || defaultStatus;
    rows.push({
      id,
      title: task.frontmatter.title || id,
      status: archived ? `${baseStatus} (archived)` : baseStatus,
      priority: task.frontmatter.priority || "",
      assignee: task.frontmatter.assignee || "",
      tags: Array.isArray(task.frontmatter.tags) ? task.frontmatter.tags : [],
      archived
    });
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
  process.stdout.write(readFileSync18(path, "utf8"));
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
  if (!existsSync17(tasksDir)) mkdirSync8(tasksDir, { recursive: true });
  const path = newTaskPath(kandownDir, id, title);
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
  const add = spawnSync2("git", ["add", "tasks", ".kandown/kandown.json"], { stdio: "inherit" });
  if (add.status !== 0) process.exit(add.status ?? 1);
  const commit = spawnSync2("git", ["commit", "-m", message], { stdio: "inherit" });
  process.exit(commit.status ?? 1);
}
function cmdExport(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const board = readBoard(kandownDir);
  process.stdout.write(JSON.stringify(board, null, 2) + "\n");
}
function cmdProjects(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const metadataPath2 = join19(kandownDir, "daemon.json");
  if (!existsSync17(metadataPath2)) {
    info("No daemon metadata for this project.");
    return;
  }
  process.stdout.write(readFileSync18(metadataPath2, "utf8").trim() + "\n");
}
function cmdImport(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const file = args.positional[0];
  if (!file) {
    err("Usage: kandown import <file.json> [--overwrite]");
    process.exit(1);
  }
  const importPath = resolve8(process.cwd(), file);
  if (!existsSync17(importPath)) {
    err(`Import file not found: ${file}`);
    process.exit(1);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync18(importPath, "utf8"));
  } catch (error) {
    err(`Import file must be JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const defaultStatus = loadConfig(kandownDir).board.columns[0] || "Backlog";
  const rows = [];
  if (Array.isArray(raw)) {
    rows.push(...raw.filter((value) => typeof value === "object" && value !== null));
  } else if (typeof raw === "object" && raw !== null && Array.isArray(raw.columns)) {
    for (const column of raw.columns) {
      if (typeof column !== "object" || column === null) continue;
      const col = column;
      if (!Array.isArray(col.tasks)) continue;
      for (const task of col.tasks) {
        if (typeof task === "object" && task !== null) rows.push({ ...task, status: String(col.name || defaultStatus) });
      }
    }
  }
  if (rows.length === 0) {
    err("No tasks found to import. Expected a list JSON array or kandown export object.");
    process.exit(1);
  }
  const tasksDir = getTasksDir(kandownDir);
  if (!existsSync17(tasksDir)) mkdirSync8(tasksDir, { recursive: true });
  let imported = 0;
  for (const row of rows) {
    const id = typeof row.id === "string" && /^[a-zA-Z0-9_-]+$/.test(row.id) ? row.id : nextTaskId(kandownDir);
    const title = typeof row.title === "string" && row.title ? row.title : id;
    const existing = findTaskPath2(kandownDir, id);
    if (existing && args.flags.overwrite !== true) continue;
    const path = existing ?? newTaskPath(kandownDir, id, title);
    const fm = {
      id,
      title,
      status: typeof row.status === "string" && row.status ? row.status.replace(/ \(archived\)$/i, "") : defaultStatus
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
import { join as join25 } from "path";

// src/cli/lib/server.ts
init_board_reader();
init_task_filename();
init_parser();
init_config2();
import { createServer } from "http";
import { existsSync as existsSync22, readFileSync as readFileSync21, copyFileSync as copyFileSync3, unlinkSync as unlinkSync7, mkdirSync as mkdirSync12 } from "fs";
import { basename as basename6, join as join24 } from "path";
import { spawn as spawn6 } from "child_process";
init_updater();
init_atomic_write();

// src/cli/lib/task-move.ts
init_atomic_write();
init_board_reader();
init_config2();
init_dependencies();
init_serializer();
init_task_meta();
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
  const taskPath = findTaskPath(kandownDir, taskId);
  if (!taskPath) {
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
import { mkdirSync as mkdirSync9, writeFileSync as writeFileSync6 } from "fs";
import { join as join20 } from "path";
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
  const destDir = join20(projectDir, ".kandown", "extensions", manifest.id);
  mkdirSync9(destDir, { recursive: true });
  const copied = [];
  const write = (relPath, content) => {
    writeFileSync6(join20(destDir, relPath), content, "utf8");
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

// src/cli/lib/themes-store.ts
import { existsSync as existsSync19, mkdirSync as mkdirSync10, writeFileSync as writeFileSync7 } from "fs";
import { join as join21 } from "path";

// src/lib/themes/shared.ts
var sharedLight = {
  "destructive": "0 72% 51%",
  "destructive-foreground": "0 0% 100%",
  "success": "148 55% 39%",
  "warning": "38 82% 49%",
  "grid": "220 13% 0% / 0.05",
  "grid-strong": "220 13% 0% / 0.085"
};
var sharedDark = {
  "destructive": "358 74% 59%",
  "destructive-foreground": "0 0% 100%",
  "success": "151 55% 42%",
  "warning": "38 82% 57%",
  "grid": "0 0% 100% / 0.018",
  "grid-strong": "0 0% 100% / 0.04"
};

// src/lib/themes/kandown.ts
var kandownTheme = {
  id: "kandown",
  name: "Kandown",
  author: "Kandown",
  description: "The house theme: brand lime (#88E138) on near-neutral surfaces, pale lime accents, 4px radius.",
  appearance: { radius: "4px", borderWidth: "1px", shadows: "soft", density: "comfortable", glass: true, motion: "subtle" },
  fonts: { sans: "'Inter var', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "'Inter Tight', 'Inter var', Inter, sans-serif", mono: "'SF Mono', Menlo, Monaco, Consolas, monospace" },
  light: {
    ...sharedLight,
    "background": "80 40% 99%",
    "foreground": "120 10% 10%",
    "card": "0 0% 100%",
    "card-foreground": "120 10% 10%",
    "popover": "0 0% 100%",
    "popover-foreground": "120 10% 10%",
    "primary": "91 67% 47%",
    "primary-foreground": "96 55% 9%",
    "secondary": "75 45% 94%",
    "secondary-foreground": "96 40% 18%",
    "muted": "75 12% 95%",
    "muted-foreground": "120 5% 40%",
    "accent": "72 100% 90%",
    "accent-foreground": "96 50% 18%",
    "border": "0 0% 92%",
    "border-strong": "0 0% 85%",
    "border-focus": "91 67% 47%",
    "input": "0 0% 90%",
    "ring": "91 67% 47%",
    "success": "130 90% 28%",
    "grid": "92 40% 20% / 0.05",
    "grid-strong": "92 40% 20% / 0.09",
    "glass": "0 0% 100% / 0.78",
    "glass-border": "75 30% 88% / 0.85",
    // 📖 Code blocks: very light gray background so github-light's dark
    // token colors (blues / reds / greens) keep a WCAG-AA contrast.
    // Inline code is slightly tinted with the page accent so single
    // backticks in body prose still pop without competing with the block.
    "code-bg": "220 14% 96%",
    "code-fg": "220 30% 12%",
    "code-inline-bg": "75 35% 90%",
    "code-inline-fg": "120 25% 18%",
    "code-block-border": "220 14% 88%"
  },
  dark: {
    ...sharedDark,
    "background": "120 8% 7%",
    "foreground": "80 15% 93%",
    "card": "120 7% 10%",
    "card-foreground": "80 15% 93%",
    "popover": "120 7% 11%",
    "popover-foreground": "80 15% 93%",
    "primary": "92 74% 55%",
    "primary-foreground": "120 30% 7%",
    "secondary": "120 6% 16%",
    "secondary-foreground": "80 15% 93%",
    "muted": "120 6% 14%",
    "muted-foreground": "90 6% 60%",
    "accent": "92 30% 18%",
    "accent-foreground": "92 74% 70%",
    "border": "120 6% 18%",
    "border-strong": "120 6% 26%",
    "border-focus": "92 74% 55%",
    "input": "120 6% 18%",
    "ring": "92 74% 55%",
    "success": "130 90% 48%",
    "grid": "92 60% 60% / 0.03",
    "grid-strong": "92 60% 60% / 0.06",
    "glass": "120 7% 10% / 0.78",
    "glass-border": "92 20% 24% / 0.8",
    // 📖 Code blocks: a deeper neutral background, close to github-dark's
    // own `#0d1117` (≈ 220 15% 9%) so the bundled Shiki palette's light
    // token colors stay readable. Inline code is warmer so it reads as a
    // deliberate pill, not a missed selection.
    "code-bg": "220 15% 11%",
    "code-fg": "80 20% 92%",
    "code-inline-bg": "92 20% 22%",
    "code-inline-fg": "92 50% 78%",
    "code-block-border": "220 14% 22%"
  }
};

// src/lib/themes/index.ts
var THEME_PRESETS = [kandownTheme];

// src/lib/theme.ts
var LEGACY_SKIN_MAP = {};
var SKIN_OPTIONS = THEME_PRESETS.map((t) => ({
  id: t.id,
  label: t.name,
  description: t.description ?? "",
  light: t.light,
  dark: t.dark
}));
var customThemesRegistry = [];
function getAllThemes() {
  return [...THEME_PRESETS, ...customThemesRegistry];
}
function normalizeSkinId(value) {
  if (typeof value !== "string") return "kandown";
  const all = getAllThemes();
  const target = LEGACY_SKIN_MAP[value] ?? value;
  return all.some((t) => t.id === target) ? target : "kandown";
}

// src/cli/lib/themes-store.ts
var DEFAULT_REGISTRY_URL2 = "https://raw.githubusercontent.com/vava-nessa/kandown/main/registry/themes.json";
async function fetchRegistry2(url = DEFAULT_REGISTRY_URL2) {
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
function githubRawBase2(repo, ref) {
  const cleaned = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  return `https://raw.githubusercontent.com/${cleaned}/${ref}`;
}
async function installTheme(projectDir, input) {
  let themeUrl;
  if (input.entry) {
    const ref = input.entry.ref || "HEAD";
    const base = githubRawBase2(input.entry.repo, ref);
    const path = input.entry.path || `registry/themes/${input.entry.id}.json`;
    themeUrl = `${base}/${path}`.replace(/\/+$/, "");
  } else if (input.url) {
    const trimmed = input.url.replace(/\/+$/, "");
    if (trimmed.includes("raw.githubusercontent.com")) {
      themeUrl = trimmed;
    } else {
      const base = githubRawBase2(trimmed, "HEAD");
      themeUrl = `${base}/registry/themes/${guessIdFromUrl(trimmed)}.json`;
    }
  } else {
    return { ok: false, error: "Provide a registry entry or a GitHub URL." };
  }
  let themeJson;
  try {
    const res = await fetch(themeUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false, error: `theme fetch failed: HTTP ${res.status}` };
    themeJson = await res.text();
  } catch (e) {
    return { ok: false, error: `theme fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  let theme;
  try {
    theme = JSON.parse(themeJson);
  } catch {
    return { ok: false, error: "theme file is not valid JSON" };
  }
  if (!theme.id || !/^[a-z][a-z0-9-]{0,63}$/.test(theme.id)) {
    return { ok: false, error: "theme is missing a valid id" };
  }
  normalizeSkinId(theme.id);
  const { description: _desc, author: _author, name: _name, ..._rest } = theme;
  const destDir = join21(projectDir, ".kandown", "themes");
  mkdirSync10(destDir, { recursive: true });
  writeFileSync7(join21(destDir, `${theme.id}.json`), `${themeJson}
`, "utf8");
  return { ok: true, id: theme.id };
}
function guessIdFromUrl(url) {
  const m = url.match(/\/([a-z0-9_-]+?)(?:\.git)?$/i);
  return m ? m[1].toLowerCase().replace(/[^a-z0-9-]/g, "-") : "unknown";
}
function base64EncodeUtf8(input) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(input)));
}
function buildProposeUrl(opts) {
  const branch = opts.branch ?? "main";
  const dir = (opts.dir ?? "registry/themes").replace(/\/+$/, "");
  const params = new URLSearchParams({
    filename: `${dir}/${opts.themeId}.json`,
    value: base64EncodeUtf8(opts.json)
  });
  return `https://github.com/${opts.githubOwner}/${opts.githubRepo}/new/${branch}/${dir}?${params.toString()}`;
}
function listInstalledThemes(projectDir) {
  const dir = join21(projectDir, ".kandown", "themes");
  if (!existsSync19(dir)) return [];
  const themes = [];
  const { readFileSync: readFileSync23, readdirSync: readdirSync11 } = __require("fs");
  for (const file of readdirSync11(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = readFileSync23(join21(dir, file), "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id && parsed.light && parsed.dark) {
        themes.push({ ...parsed, isCustom: true });
      }
    } catch {
    }
  }
  return themes;
}

// src/cli/lib/server.ts
init_workflows_cli();
init_workflows_store();

// src/cli/lib/daemon-auth.ts
import { randomBytes, timingSafeEqual } from "crypto";
var TOKEN_HEADER = "X-Kandown-Token";
var TOKEN_QUERY = "token";
function generateToken() {
  return randomBytes(32).toString("hex");
}
function extractToken(req, url) {
  const headerValue = req.headers[TOKEN_HEADER.toLowerCase()];
  const fromHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof fromHeader === "string" && fromHeader.length > 0) return fromHeader;
  const fromQuery = url?.searchParams.get(TOKEN_QUERY);
  return typeof fromQuery === "string" && fromQuery.length > 0 ? fromQuery : null;
}
function verifyToken(expected, candidate) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const candidateBuffer = Buffer.from(candidate, "utf8");
  if (expectedBuffer.length !== candidateBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, candidateBuffer);
}
function selfOrigin(port) {
  return `http://127.0.0.1:${port}`;
}

// src/cli/lib/server.ts
var START_PORT_RANGE = 2050;
var END_PORT_RANGE = 2099;
var UNSAFE_PORTS = /* @__PURE__ */ new Set([2049, 4045, 6e3, 6665, 6666, 6667, 6668, 6669, 6697]);
var sseClients = [];
var nextClientId = 1;
var activeToken = null;
function setActiveToken(token) {
  activeToken = token;
}
function corsHeaders(port) {
  return {
    "Access-Control-Allow-Origin": selfOrigin(port),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Kandown-Token"
  };
}
function authenticateHttp(req, url, res) {
  if (activeToken === null) return true;
  const candidate = extractToken(req, url);
  if (candidate === null || !verifyToken(activeToken, candidate)) {
    res.writeHead(401, {
      "Content-Type": "application/json",
      ...corsHeaders(localPort(res))
    });
    res.end(JSON.stringify({ error: "Token missing or invalid" }));
    return false;
  }
  return true;
}
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
function localPort(res) {
  const socket = res.socket;
  return socket && typeof socket.localPort === "number" ? socket.localPort : 0;
}
function handleCors(res) {
  res.writeHead(204, corsHeaders(localPort(res)));
  res.end();
}
function writeJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...corsHeaders(localPort(res))
  });
  res.end(JSON.stringify(data));
}
function writeText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    ...corsHeaders(localPort(res))
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
    const projectHtml = join24(kandownDir, "kandown.html");
    const distHtml = join24(PKG_ROOT, "dist", "index.html");
    if (!existsSync22(distHtml)) return false;
    if (!existsSync22(projectHtml)) {
      copyFileSync3(distHtml, projectHtml);
      return true;
    }
    const currentContent = readFileSync21(projectHtml, "utf8");
    const newContent = readFileSync21(distHtml, "utf8");
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
    const raw = JSON.parse(readFileSync21(join24(kandownDir, "daemon.json"), "utf8"));
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
  if (!authenticateHttp(req, url, res)) return;
  if (path === "/api/version" && method === "GET") {
    return writeJson(res, 200, {
      version: getCurrentVersion()
    });
  }
  if (path === "/api/update/check" && method === "GET") {
    const current = getCurrentVersion();
    const latest = await new Promise((resolve11) => {
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
      child.on("error", () => resolve11(null));
      child.on("close", (code) => {
        if (code !== 0) return resolve11(null);
        resolve11(stdout.trim().replace(/^"|"$/g, "") || null);
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
    const latest = await new Promise((resolve11) => {
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
      child.on("error", () => resolve11(null));
      child.on("close", (code) => resolve11(code === 0 ? stdout.trim() : null));
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
      ...corsHeaders(localPort(res))
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
      const boardPath = join24(tasksDir, "board.md");
      const text = existsSync22(boardPath) ? readFileSync21(boardPath, "utf8") : "";
      return writeText(res, 200, text);
    }
    if (method === "PUT") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const tasksDir = getTasksDir(kandownDir);
        if (!existsSync22(tasksDir)) mkdirSync12(tasksDir, { recursive: true });
        atomicWriteFileSync(join24(tasksDir, "board.md"), body);
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
  if (path === "/api/instructions") {
    const instructionsPath = join24(kandownDir, "kandown_work.md");
    if (method === "GET") return writeText(res, 200, existsSync22(instructionsPath) ? readFileSync21(instructionsPath, "utf8") : "");
    if (method === "PUT") {
      try {
        atomicWriteFileSync(instructionsPath, await readRequestBody(req));
        broadcastSseEvent({ type: "instructions" });
        return writeJson(res, 200, { ok: true });
      } catch (error) {
        return writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  if (path === "/api/skills" && method === "GET") {
    const config = loadConfig(kandownDir);
    const active = new Set(config.workflow.skills);
    const roles = new Set(Object.values(config.board.columnMeta).map((meta) => meta.role));
    const skills = listWorkflowSkills(kandownDir).map((skill) => {
      const missingRole = skill.requiredRoles?.find((role) => !roles.has(role));
      const wrongWorkflow = skill.compatibleWorkflows?.length && !skill.compatibleWorkflows.includes(config.workflow.active);
      const reason = !skill.valid ? skill.errors.join("; ") : wrongWorkflow ? `Compatible with: ${skill.compatibleWorkflows?.join(", ")}` : missingRole ? `Requires column role: ${missingRole}` : void 0;
      return { ...skill, active: active.has(skill.id), compatible: !reason, ...reason ? { compatibilityReason: reason } : {} };
    });
    return writeJson(res, 200, { skills });
  }
  if (path === "/api/workflows" && method === "GET") {
    try {
      const config = loadConfig(kandownDir);
      const selected = loadWorkflowById(kandownDir, config.workflow.active);
      const compiled = compileProjectKandownWork(kandownDir);
      return writeJson(res, 200, {
        workflows: listWorkflowPackages(kandownDir),
        selected,
        preview: compiled.markdown,
        stats: compiled.stats,
        diagnostics: compiled.diagnostics,
        boardPresetPreview: selected.boardPreset ? previewBoardPreset(kandownDir, selected.manifest.id) : null
      });
    } catch (error) {
      return writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (path === "/api/workflows/registry" && method === "GET") {
    return writeJson(res, 200, await fetchWorkflowRegistry());
  }
  if (path === "/api/workflows/install" && method === "POST") {
    try {
      const body = JSON.parse(await readRequestBody(req));
      if (!body.entry) return writeJson(res, 400, { ok: false, error: "Registry entry is required." });
      const result = await installStoreWorkflow(kandownDir, body.entry);
      broadcastSseEvent({ type: "workflows" });
      return writeJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      return writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (path === "/api/workflows/update" && method === "POST") {
    try {
      const body = JSON.parse(await readRequestBody(req));
      if (!body.entry) return writeJson(res, 400, { ok: false, error: "Registry entry is required." });
      if (body.confirm !== true) return writeJson(res, 200, { ok: true, preview: await previewWorkflowUpdate(kandownDir, body.entry) });
      const result = await applyWorkflowUpdate(kandownDir, body.entry, true);
      broadcastSseEvent({ type: "workflows" });
      return writeJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      return writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (path.startsWith("/api/workflows/") && method === "POST") {
    const action = path.slice("/api/workflows/".length);
    let body = {};
    try {
      body = JSON.parse(await readRequestBody(req));
    } catch (error) {
      return writeJson(res, 400, { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
    }
    if (typeof body.id !== "string") return writeJson(res, 400, { error: "Workflow id is required." });
    try {
      if (action === "use") {
        const workflow = loadWorkflowById(kandownDir, body.id);
        const missing = missingWorkflowRoles(kandownDir, workflow);
        if (missing.length > 0) return writeJson(res, 409, { error: `Missing required column roles: ${missing.join(", ")}.`, missing, boardPresetPreview: workflow.boardPreset ? previewBoardPreset(kandownDir, body.id) : null });
        const config = loadConfig(kandownDir);
        config.workflow.active = workflow.manifest.id;
        saveConfig(kandownDir, config);
        broadcastSseEvent({ type: "config" });
        return writeJson(res, 200, { ok: true });
      }
      if (action === "fork") {
        const workflow = forkWorkflow(kandownDir, body.id);
        broadcastSseEvent({ type: "workflows" });
        return writeJson(res, 200, { ok: true, workflow });
      }
      if (action === "edit") {
        if (typeof body.path !== "string" || typeof body.content !== "string") return writeJson(res, 400, { error: "path and content are required." });
        const workflow = updateLocalWorkflowFile(kandownDir, body.id, body.path, body.content);
        broadcastSseEvent({ type: "workflows" });
        return writeJson(res, 200, { ok: true, workflow });
      }
      if (action === "apply-preset") {
        const preview = previewBoardPreset(kandownDir, body.id);
        if (body.confirm !== true) return writeJson(res, 409, { error: "Explicit confirmation is required.", preview });
        const applied = applyBoardPreset(kandownDir, body.id);
        broadcastSseEvent({ type: "config" });
        broadcastSseEvent({ type: "board" });
        return writeJson(res, 200, { ok: true, preview: applied });
      }
      return writeJson(res, 404, { error: "Unknown workflow action." });
    } catch (error) {
      return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
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
      const file = join24(ext.dir, rel);
      if (!existsSync22(file)) return writeText(res, 404, "File not found");
      return writeText(res, 200, readFileSync21(file, "utf8"));
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
  if (path === "/api/themes" && method === "GET") {
    const projectDir = getProjectRoot(kandownDir);
    const themes = listInstalledThemes(projectDir);
    return writeJson(res, 200, { themes });
  }
  if (path === "/api/themes/registry" && method === "GET") {
    const result = await fetchRegistry2();
    return writeJson(res, 200, result);
  }
  if (path === "/api/themes/install" && method === "POST") {
    try {
      const body = JSON.parse(await readRequestBody(req));
      const projectDir = getProjectRoot(kandownDir);
      const result = await installTheme(projectDir, { entry: body.entry, url: body.url });
      broadcastSseEvent({ type: "themes" });
      return writeJson(res, result.ok ? 200 : 400, result);
    } catch (e) {
      return writeJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (path.startsWith("/api/themes/") && method === "DELETE") {
    const rawId = decodeURIComponent(path.slice("/api/themes/".length).split("?")[0] ?? "");
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(rawId)) return writeJson(res, 400, { error: "Invalid theme id" });
    const { unlinkSync: unlinkSync8, existsSync: existsSync26 } = await import("fs");
    const { join: join30 } = await import("path");
    const file = join30(getProjectRoot(kandownDir), ".kandown", "themes", `${rawId}.json`);
    if (!existsSync26(file)) return writeJson(res, 404, { error: "Theme not installed" });
    try {
      unlinkSync8(file);
      broadcastSseEvent({ type: "themes" });
      return writeJson(res, 200, { ok: true, id: rawId });
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
    const archiveDir = join24(tasksDir, "archive");
    const resolveIn = (directory) => {
      const match = resolveTaskFilename(taskId, listTaskFilenames(directory));
      return match ? join24(directory, match.filename) : null;
    };
    const activePath = resolveIn(tasksDir);
    const archivedPath = resolveIn(archiveDir);
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
      const existingDestination = archiving ? archivedPath : activePath;
      if (!source && !existingDestination) {
        return writeText(res, 404, "Task not found");
      }
      const destinationDir = archiving ? archiveDir : tasksDir;
      const destination = existingDestination ?? join24(destinationDir, basename6(source));
      try {
        if (!existsSync22(tasksDir)) mkdirSync12(tasksDir, { recursive: true });
        if (!existsSync22(archiveDir)) mkdirSync12(archiveDir, { recursive: true });
        const body = await readRequestBody(req);
        atomicWriteFileSync(destination, body);
        if (source && source !== destination && existsSync22(source)) unlinkSync7(source);
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
      const taskPath = findTaskPath(kandownDir, taskId);
      if (!taskPath) return writeText(res, 404, "Task not found");
      return writeText(res, 200, readFileSync21(taskPath, "utf8"));
    }
    if (method === "PUT") {
      try {
        if (!existsSync22(tasksDir)) mkdirSync12(tasksDir, { recursive: true });
        const body = await readRequestBody(req);
        const taskPath = findTaskPath(kandownDir, taskId) ?? newTaskFilePath(kandownDir, taskId, parseTaskFile(body).frontmatter.title);
        atomicWriteFileSync(taskPath, body);
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
        if (activePath && existsSync22(activePath)) unlinkSync7(activePath);
        if (archivedPath && existsSync22(archivedPath)) unlinkSync7(archivedPath);
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
  const tokenLiteral = activeToken === null ? "null" : JSON.stringify(activeToken).replace(/</g, "\\u003c");
  const script = `<script>window.__KANDOWN_ROOT__ = ${safeRoot};
window.__KANDOWN_TOKEN__ = ${tokenLiteral};</script>
`;
  if (markerIndex === -1) return script + html;
  return html.slice(0, markerIndex) + script + html.slice(markerIndex);
}
function serveApp(res, kandownDir) {
  syncProjectKandownHtml(kandownDir);
  const htmlPath = join24(kandownDir, "kandown.html");
  if (existsSync22(htmlPath)) {
    const html = readFileSync21(htmlPath, "utf8");
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
init_atomic_write();
init_updater();
init_cli_shared();
async function cmdDaemon(rest) {
  const parsedDaemonArgs = parseArgs(rest);
  const subcommand = parsedDaemonArgs.positional[0] || "status";
  const daemonArgs = subcommand ? stripFirstPositional(rest, subcommand) : rest;
  const { kandownDir } = ensureKandownDir(daemonArgs);
  if (subcommand === "run") {
    const daemonOptions = parseArgs(daemonArgs);
    const preferredPort = typeof daemonOptions.flags.port === "string" ? Number(daemonOptions.flags.port) : null;
    const token = generateToken();
    setActiveToken(token);
    const { port } = await listenOnAvailablePort(kandownDir, Number.isInteger(preferredPort) ? preferredPort : null);
    const url = `http://localhost:${port}`;
    const metadataPath2 = join25(kandownDir, "daemon.json");
    atomicWriteFileSync(metadataPath2, JSON.stringify({
      pid: process.pid,
      port,
      url,
      kandownDir,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: getCurrentVersion(),
      token
    }, null, 2));
    info(`Kandown daemon running on port ${port} (PID ${process.pid})`);
    scheduleDaemonSelfUpgrade(kandownDir);
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

// src/cli/commands/run.ts
init_cli_shared();

// src/cli/lib/cascade.ts
init_board_reader();

// src/cli/lib/launcher.ts
init_board_reader();
import { execSync as execSync2, spawn as spawn7 } from "child_process";
import { writeFileSync as writeFileSync8 } from "fs";
import { join as join26 } from "path";
import { tmpdir } from "os";
init_config2();
init_config();
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
  const config = loadConfig(kandownDir);
  const originalStatus = task.frontmatter.status || config.board.columns[0];
  const activeStatus = resolveColumnNameByRole(config, "active") ?? config.board.columns[0];
  const terminalStatus2 = resolveColumnNameByRole(config, "terminal") ?? config.board.columns.at(-1);
  const agentDoc = compileProjectKandownWork(kandownDir, taskId).markdown;
  const taskFileContent = [
    `---`,
    `id: ${task.frontmatter.id}`,
    `title: ${task.frontmatter.title}`,
    `status: ${task.frontmatter.status ?? "unknown"}`,
    `---`,
    "",
    task.body.trim()
  ].join("\n");
  const { systemPrompt, taskPrompt } = buildPrompt(agentDoc, taskFileContent, taskId, kandownDir, activeStatus, terminalStatus2, handoff, queue);
  assignTaskToAgent(kandownDir, taskId, agentDef.id);
  const taskMoved = moveTaskToColumn(kandownDir, taskId, activeStatus);
  if (!taskMoved) {
    throw new Error(`Could not move task ${taskId} to ${activeStatus}: task file missing or unwritable.`);
  }
  const contextFile = join26(tmpdir(), `kandown-${taskId}-context.md`);
  try {
    writeFileSync8(contextFile, `${systemPrompt}

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
  return new Promise((resolve11, reject) => {
    const child = spawn7(binary, args, { stdio: "inherit", env: launchEnv(contextFile, taskId, kandownDir) });
    child.on("error", (e) => {
      rollbackTaskStatus(kandownDir, taskId, originalStatus);
      reject(new Error(`Failed to launch ${agentName}: ${e.message}`));
    });
    child.on("exit", (code) => {
      resolve11({ exitCode: code ?? 0 });
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
init_config();
init_dependencies();
init_config2();
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
  const activeStatus = resolveColumnNameByRole(cfg, "active");
  const candidates = [];
  for (const t of all) {
    const id = t.frontmatter.id || "";
    if (scope && !scope.has(id)) continue;
    const status = t.frontmatter.status || cfg.board.columns[0];
    if (reachedTerminal(status, cfg)) continue;
    if (activeStatus && status.toLowerCase() === activeStatus.toLowerCase() && !opts.includeInProgress) continue;
    candidates.push(toCascadeTask(t, cfg.board.columns[0]));
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
function toCascadeTask(t, fallbackStatus) {
  return {
    id: t.frontmatter.id || "",
    title: typeof t.frontmatter.title === "string" ? t.frontmatter.title : "",
    status: t.frontmatter.status || fallbackStatus,
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
init_config2();
init_dependencies();
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
    success(`All ${result.completed.length} task(s) reached ${terminalStatus(loadConfig(kandownDir))}.`);
  } else if (result.completed.length > 0) {
    info(`${result.completed.length} done, ${result.incomplete.length} not done. Chain stopped at the first non-done task.`);
  } else {
    err("No tasks completed.");
  }
}

// src/cli/commands/agents.ts
init_cli_shared();
import { existsSync as existsSync23 } from "fs";
import { join as join27 } from "path";
function cmdAgents(rawArgs) {
  const args = parseArgs(rawArgs);
  const kandownDir = resolveKandownDir(args.path, process.cwd());
  const sub = args.positional[0];
  if (sub === "init") {
    const target = join27(kandownDir, "agents.json");
    if (existsSync23(target)) {
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
  const agentsFile = join27(kandownDir, "agents.json");
  log("");
  log(`${c.bold}Agent catalog${c.reset} ${c.dim}(${installed.length}/${catalog.length} installed)${c.reset}`);
  log(`${c.dim}catalog: ${existsSync23(agentsFile) ? agentsFile : "built-in defaults (run `kandown agents init` to commit one)"}${c.reset}`);
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

// src/cli/lib/themes-cli.ts
import { existsSync as existsSync24, mkdirSync as mkdirSync13, readFileSync as readFileSync22, readdirSync as readdirSync10, writeFileSync as writeFileSync9 } from "fs";
import { join as join28, resolve as resolve10 } from "path";
init_board_reader();
init_cli_shared();

// src/cli/lib/themes-meta.ts
var KANDOWN_THEME_REPO_OWNER = "vava-nessa";
var KANDOWN_THEME_REPO_NAME = "kandown";

// src/cli/lib/themes-cli.ts
async function cmdTheme(rawArgs) {
  const args = taskParseArgs(rawArgs);
  const sub = args.positional[0];
  const { kandownDir } = ensureKandownDir(rawArgs);
  const projectDir = getProjectRoot(kandownDir);
  const usage = `${c.cyan}kandown theme${c.reset} ${c.dim}<list|install|create|publish>${c.reset}`;
  if (!sub) {
    log(usage);
    return;
  }
  switch (sub) {
    case "list":
    case "ls": {
      const themes = listInstalledThemesForCli(projectDir);
      if (themes.length === 0) {
        info("No community themes installed. Try: kandown theme install <path-or-github-url>");
        return;
      }
      for (const theme of themes) {
        log(`${c.green}installed${c.reset} ${c.bold}${theme.id}${c.reset} ${c.dim}v${theme.version ?? "1.0.0"}${c.reset} \u2014 ${theme.name}${theme.author ? ` \xB7 ${theme.author}` : ""}`);
        if (theme.description) log(`             ${c.dim}${theme.description}${c.reset}`);
      }
      return;
    }
    case "install": {
      const target = args.positional[1];
      if (!target) {
        err("Usage: kandown theme install <path-or-github-url>");
        process.exit(1);
      }
      const result = await installFromTarget(projectDir, target);
      if (result.ok) success(`Installed ${result.id}. It will appear in the theme gallery on the next reload.`);
      else {
        err(`Install failed: ${result.error}`);
        process.exit(1);
      }
      return;
    }
    case "create": {
      const name = args.positional[1];
      if (!name) {
        err("Usage: kandown theme create <kebab-name>");
        process.exit(1);
      }
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) {
        err("name must be kebab-case (lowercase letters, digits, hyphens)");
        process.exit(1);
      }
      scaffoldTheme(projectDir, name);
      success(`Scaffolded theme "${name}" at .kandown/themes/${name}.json`);
      info("Edit it, then: kandown theme publish .kandown/themes/" + name + ".json");
      return;
    }
    case "publish":
    case "propose": {
      const file = args.positional[1];
      if (!file) {
        err("Usage: kandown theme publish <path-to-theme.json> [--github-user <username>]");
        process.exit(1);
      }
      const githubUser = String(args.flags["github-user"] ?? args.flags["githubUser"] ?? "");
      publishTheme(file, githubUser);
      return;
    }
    default:
      err(`Unknown theme subcommand: ${sub}`);
      log(usage);
  }
}
async function installFromTarget(projectDir, target) {
  const src = resolve10(target);
  if (existsSync24(src) && src.endsWith(".json")) {
    const text = readFileSync22(src, "utf8");
    const parsed = JSON.parse(text);
    if (!parsed.id) return { ok: false, error: "theme JSON is missing id" };
    const destDir = join28(projectDir, ".kandown", "themes");
    mkdirSync13(destDir, { recursive: true });
    writeFileSync9(join28(destDir, `${parsed.id}.json`), text, "utf8");
    return { ok: true, id: parsed.id };
  }
  return installTheme(projectDir, { url: target });
}
function listInstalledThemesForCli(projectDir) {
  const dir = join28(projectDir, ".kandown", "themes");
  if (!existsSync24(dir)) return [];
  const out = [];
  for (const file of readdirSync10(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = readFileSync22(join28(dir, file), "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.id) out.push({ id: parsed.id, name: parsed.name ?? parsed.id, author: parsed.author, description: parsed.description, version: parsed.version });
    } catch {
    }
  }
  return out;
}
function scaffoldTheme(projectDir, name) {
  const destDir = join28(projectDir, ".kandown", "themes");
  mkdirSync13(destDir, { recursive: true });
  const dest = join28(destDir, `${name}.json`);
  if (existsSync24(dest)) {
    err(`Already exists: ${dest}`);
    process.exit(1);
  }
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const starter = {
    $schema: "https://kandown.dev/schemas/theme.v1.json",
    id: name,
    name: name.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
    author: "Your GitHub Username",
    description: "A community theme for kandown.",
    appearance: {
      radius: "6px",
      borderWidth: "1px",
      shadows: "soft",
      density: "comfortable",
      glass: false,
      motion: "subtle"
    },
    fonts: {
      sans: "'Inter var', Inter, sans-serif",
      display: "'Inter var', Inter, sans-serif",
      mono: "'SF Mono', Menlo, monospace"
    },
    light: {
      background: "0 0% 100%",
      foreground: "220 13% 14%",
      card: "0 0% 100%",
      "card-foreground": "220 13% 14%",
      popover: "0 0% 100%",
      "popover-foreground": "220 13% 14%",
      primary: "220 90% 56%",
      "primary-foreground": "0 0% 100%",
      secondary: "220 14% 96%",
      "secondary-foreground": "220 13% 14%",
      muted: "220 14% 96%",
      "muted-foreground": "220 9% 46%",
      accent: "220 14% 96%",
      "accent-foreground": "220 13% 14%",
      border: "220 13% 91%",
      "border-strong": "220 13% 84%",
      "border-focus": "220 90% 56%",
      input: "220 13% 91%",
      ring: "220 90% 56%",
      destructive: "0 84% 60%",
      "destructive-foreground": "0 0% 100%",
      success: "142 71% 45%",
      warning: "38 92% 50%"
    },
    dark: {
      background: "220 13% 8%",
      foreground: "220 13% 95%",
      card: "220 13% 11%",
      "card-foreground": "220 13% 95%",
      popover: "220 13% 11%",
      "popover-foreground": "220 13% 95%",
      primary: "220 90% 60%",
      "primary-foreground": "220 13% 8%",
      secondary: "220 13% 16%",
      "secondary-foreground": "220 13% 95%",
      muted: "220 13% 14%",
      "muted-foreground": "220 9% 60%",
      accent: "220 13% 18%",
      "accent-foreground": "220 13% 95%",
      border: "220 13% 18%",
      "border-strong": "220 13% 26%",
      "border-focus": "220 90% 60%",
      input: "220 13% 18%",
      ring: "220 90% 60%",
      destructive: "0 72% 55%",
      "destructive-foreground": "0 0% 100%",
      success: "142 71% 50%",
      warning: "38 92% 55%"
    },
    version: "0.1.0",
    created: today
  };
  writeFileSync9(dest, `${JSON.stringify(starter, null, 2)}
`, "utf8");
}
function publishTheme(file, githubUser) {
  const resolved = resolve10(file);
  if (!existsSync24(resolved)) {
    err(`Theme file not found: ${file}`);
    process.exit(1);
  }
  const raw = readFileSync22(resolved, "utf8");
  let theme;
  try {
    theme = JSON.parse(raw);
  } catch {
    err("Theme file is not valid JSON.");
    process.exit(1);
  }
  if (!theme.id) {
    err("Theme JSON is missing the `id` field.");
    process.exit(1);
  }
  if (githubUser && (!theme.author || theme.author === "Your GitHub Username")) {
    try {
      const updated = JSON.parse(raw);
      updated.author = githubUser;
      const updatedRaw = `${JSON.stringify(updated, null, 2)}
`;
      writeFileSync9(resolved, updatedRaw, "utf8");
      info(`Set author to @${githubUser} in ${file}.`);
    } catch {
    }
  }
  const json = existsSync24(resolved) ? readFileSync22(resolved, "utf8") : raw;
  const url = buildProposeUrl({
    githubOwner: KANDOWN_THEME_REPO_OWNER,
    githubRepo: KANDOWN_THEME_REPO_NAME,
    themeId: theme.id,
    json
  });
  success(`Open this URL in your browser to propose "${theme.id}" via PR:`);
  log(url);
  log("");
  info(`If you are not a ${KANDOWN_THEME_REPO_OWNER} collaborator, GitHub will fork the repo automatically and open a PR from your fork.`);
  log("");
  log(`${c.dim}Don't forget to add an entry to ${DEFAULT_REGISTRY_URL2} in the same PR:${c.reset}`);
  const entryJson = JSON.stringify({
    id: theme.id,
    name: theme.id,
    author: githubUser || theme.author || "unknown",
    description: theme.description ?? "",
    repo: `https://github.com/${KANDOWN_THEME_REPO_OWNER}/${KANDOWN_THEME_REPO_NAME}`,
    path: `registry/themes/${theme.id}.json`,
    ref: "main",
    tags: ["community"]
  }, null, 2);
  log(c.dim + entryJson + c.reset);
}

// src/cli/cli.ts
init_workflows_cli();
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
    case "reslug":
      cmdReslug(rest);
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
    case "theme":
    case "themes":
      await cmdTheme(rest);
      break;
    case "workflow":
    case "workflows":
      await cmdWorkflow(rest);
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
      if (existsSync25(join29(kandownDir, "kandown.json"))) {
        let status = await getDaemonStatus(kandownDir);
        if (!status.running) {
          status = await startProjectDaemon(kandownDir);
        }
        if (!parsed.flags["no-open"]) {
          const urlToOpen = status.metadata?.url || join29(kandownDir, "kandown.html");
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
      if (existsSync25(join29(kandownDir, "kandown.json"))) {
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
