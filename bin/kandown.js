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
    KANDOWN_VERSION = "0.54.0";
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
  const latest = await new Promise((resolve12) => {
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
    child2.on("error", () => resolve12(null));
    child2.on("close", (code) => {
      if (code !== 0) return resolve12(null);
      const v = stdout.trim().replace(/^"|"$/g, "");
      resolve12(v || null);
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
var PERMISSION_MODES, DEFAULT_COLUMNS, DEFAULT_WORK_OUTPUT, DEFAULT_COLUMN_META, DEFAULT_CONFIG;
var init_types = __esm({
  "src/lib/types.ts"() {
    "use strict";
    PERMISSION_MODES = ["yolo", "accept-edits"];
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
      ui: { language: "en", theme: "auto", skin: "shadcn", font: "inter", background: "solid", onboardingCompleted: false, categoryChips: true },
      agent: { suggestFollowUp: false, maxSuggestions: 3, permissionMode: "yolo", workOutput: DEFAULT_WORK_OUTPUT },
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
      categoryChips: booleanOr(ui.categoryChips, DEFAULT_CONFIG.ui.categoryChips),
      ...customThemes ? { customThemes } : {}
    },
    agent: {
      suggestFollowUp: booleanOr(
        agent.suggestFollowUp,
        DEFAULT_CONFIG.agent.suggestFollowUp
      ),
      maxSuggestions: numberOr(agent.maxSuggestions, DEFAULT_CONFIG.agent.maxSuggestions),
      // 📖 Permission mode for harness sessions (t307): unknown values fall
      // back to yolo so a hand-edited kandown.json can never block launches.
      permissionMode: isOneOf(agent.permissionMode, PERMISSION_MODES) ? agent.permissionMode : DEFAULT_CONFIG.agent.permissionMode,
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
  const meta2 = safeObject(lookupCaseInsensitive(rawMeta, columnName));
  return isOneOf(meta2.role, COLUMN_ROLES) ? meta2.role : "custom";
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

// src/lib/task-title-category.ts
function taskCategory(frontmatter) {
  if (typeof frontmatter.category === "string" && frontmatter.category.trim()) {
    return frontmatter.category.trim();
  }
  return parseTaskTitle(frontmatter.title ?? "").category;
}
function parseTaskTitle(title2) {
  if (typeof title2 !== "string" || !title2) return { category: null, rawCategory: null, cleanTitle: typeof title2 === "string" ? title2 : "" };
  const match = title2.match(/^\[([^\]]+)\]\s*/);
  if (!match) {
    return { category: null, rawCategory: null, cleanTitle: title2 };
  }
  return {
    category: match[1],
    rawCategory: match[0].trim(),
    cleanTitle: title2.slice(match[0].length)
  };
}
var init_task_title_category = __esm({
  "src/lib/task-title-category.ts"() {
    "use strict";
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
  const { id: _id, title: _title, status: _status, order: _order, created: _created, updated: _updated, archived: _archived, report: _report, category: _category, ...metadata } = frontmatter;
  return {
    id: frontmatter.id || "",
    title: frontmatter.title || frontmatter.id || "Untitled task",
    checked: /done|termin|closed|complet/i.test(status),
    category: taskCategory(frontmatter),
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
    init_task_title_category();
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

// src/lib/task-filename.ts
function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function normalizeCategorySegment(raw) {
  if (typeof raw !== "string") return null;
  const ascii = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!ascii) return null;
  if (ascii.length > CATEGORY_MAX_LENGTH) {
    const segments = ascii.slice(0, CATEGORY_MAX_LENGTH).replace(/_[^_]*$/, "");
    return segments.length >= 2 ? segments : ascii.slice(0, CATEGORY_MAX_LENGTH);
  }
  return CATEGORY_LIKE.test(ascii) ? ascii : null;
}
function categorySegmentFromTitle(title2) {
  if (typeof title2 !== "string" || !title2.trim()) return null;
  return normalizeCategorySegment(parseTaskTitle(title2).category);
}
function categorySegmentFromFrontmatter(frontmatter) {
  return normalizeCategorySegment(taskCategory(frontmatter));
}
function slugifyTitle(title2, maxWords = SLUG_MAX_WORDS) {
  if (typeof title2 !== "string" || !title2.trim()) return "";
  if (!Number.isFinite(maxWords) || maxWords < 1) return "";
  const { cleanTitle } = parseTaskTitle(title2);
  let text = cleanTitle.trim() || title2;
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
function buildTaskFilename(id, title2, category, takenFilenames = []) {
  const safeId = String(id ?? "").trim();
  if (!safeId) throw new Error("buildTaskFilename requires a task id");
  if (/[\\/]|^\.+$/.test(safeId)) throw new Error(`Unsafe task id for a filename: ${safeId}`);
  const categorySegment = normalizeCategorySegment(category ?? null) ?? categorySegmentFromTitle(title2 ?? "");
  const slug = slugifyTitle(title2 ?? "");
  let body;
  if (categorySegment && slug) body = `${categorySegment}${SLUG_SEPARATOR}${slug}`;
  else if (categorySegment) body = categorySegment;
  else if (slug) body = slug;
  else body = "";
  const candidate = body ? `${safeId}${SLUG_SEPARATOR}${body}.md` : `${safeId}.md`;
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
  const slug = idPrefix !== null ? base.slice(cut + 1) : null;
  if (idPrefix === null || cut === base.length - 1 || !ID_LIKE.test(idPrefix)) {
    return { base, idPrefix: null, slug: null, candidateIds: [base], category: null };
  }
  let category = null;
  let slugOnly = slug;
  if (slug) {
    const slugStart = slug.search(/[a-z0-9]/);
    if (slugStart > 0 && /^[A-Z0-9_-]+$/.test(slug.slice(0, slugStart).replace(/_+$/, ""))) {
      const candidate = slug.slice(0, slugStart).replace(/_+$/, "");
      if (/[A-Z]/.test(candidate)) {
        category = candidate;
        slugOnly = slug.slice(slugStart);
      }
    }
  }
  return {
    base,
    idPrefix,
    slug: slugOnly || null,
    candidateIds: [base, idPrefix],
    category
  };
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
var SLUG_MAX_WORDS, SLUG_MAX_LENGTH, SLUG_MAX_WORD_LENGTH, CATEGORY_MAX_LENGTH, CATEGORY_LIKE, SLUG_SEPARATOR, ID_LIKE, TRANSLITERATIONS, STOP_WORDS;
var init_task_filename = __esm({
  "src/lib/task-filename.ts"() {
    "use strict";
    init_task_title_category();
    SLUG_MAX_WORDS = 3;
    SLUG_MAX_LENGTH = 48;
    SLUG_MAX_WORD_LENGTH = 20;
    CATEGORY_MAX_LENGTH = 32;
    CATEGORY_LIKE = /^[A-Z0-9_-]+$/;
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
import { existsSync as existsSync4, readdirSync as readdirSync2, readFileSync as readFileSync4, mkdirSync as mkdirSync2, renameSync as renameSync2, unlinkSync as unlinkSync4 } from "fs";
import { dirname as dirname3, join as join4, sep, basename } from "path";
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
function newTaskFilePath(kandownDir, id, title2, category) {
  const tasksDir = getTasksDir(kandownDir);
  return join4(tasksDir, buildTaskFilename(id, title2, category, listTaskFilenames(tasksDir)));
}
function writeTaskContent(kandownDir, id, content, options = {}) {
  const useGit = options.useGit !== false;
  const tasksDir = getTasksDir(kandownDir);
  const previousPath = findTaskPath(kandownDir, id);
  const previousDir = previousPath ? dirname3(previousPath) : tasksDir;
  const previousName = previousPath ? basename(previousPath) : null;
  const parsed = parseTaskFile(content);
  const fm = parsed.frontmatter;
  const parsedTitle = fm.title;
  const expectedName = buildTaskFilename(
    id,
    parsedTitle,
    categorySegmentFromFrontmatter(fm),
    listTaskFilenames(previousDir)
  );
  let writeDir = previousDir;
  let writeName = previousName ?? expectedName;
  if (previousName && previousName !== expectedName) {
    const previousParsed = parseTaskFilename(previousName);
    const nextCategory = categorySegmentFromFrontmatter(fm);
    const previousCategory = previousParsed?.category ?? null;
    if (previousCategory !== nextCategory) {
      if (existsSync4(join4(writeDir, expectedName))) {
        throw new Error(`Cannot rename ${id}: ${expectedName} already exists in ${writeDir}`);
      }
      const from = join4(writeDir, previousName);
      const to = join4(writeDir, expectedName);
      if (useGit && isTrackedByGit(from)) {
        renameFileViaGit(from, to);
      } else {
        renameSync2(from, to);
      }
      writeName = expectedName;
    }
  } else if (!previousName) {
    writeName = expectedName;
    if (!existsSync4(writeDir)) mkdirSync2(writeDir, { recursive: true });
  }
  const finalPath = join4(writeDir, writeName);
  atomicWriteFileSync(finalPath, content);
  return { path: finalPath, previousPath };
}
function isTrackedByGit(path) {
  const res = __require("child_process").spawnSync(
    "git",
    ["ls-files", "--error-unmatch", "--", basename(path)],
    { cwd: dirname3(path), encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] }
  );
  return res.status === 0;
}
function renameFileViaGit(from, to) {
  const res = __require("child_process").spawnSync(
    "git",
    ["mv", "--", basename(from), basename(to)],
    { cwd: dirname3(from), encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] }
  );
  if (res.status !== 0) {
    renameSync2(from, to);
  }
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
  const title2 = text.replace(/\s+/g, " ").trim() || rawInput;
  const { category, cleanTitle } = parseTaskTitle(title2);
  const fm = stampUpdated({
    id: newId,
    title: category ? cleanTitle : title2,
    status: targetStatus,
    created: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
  });
  if (category) fm.category = category;
  if (priority) fm.priority = priority;
  if (assignee) fm.assignee = assignee;
  if (tags.length > 0) fm.tags = tags;
  if (due) fm.due = due;
  if (depends_on.length > 0) fm.depends_on = depends_on;
  const content = serializeTaskFile(fm, "");
  const taskPath = newTaskFilePath(kandownDir, newId, title2);
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
    init_task_title_category();
    init_config2();
  }
});

// src/cli/lib/agent-migration.ts
import { createHash } from "crypto";
import {
  existsSync as existsSync6,
  mkdirSync as mkdirSync3,
  readFileSync as readFileSync6,
  renameSync as renameSync3,
  unlinkSync as unlinkSync5
} from "fs";
import { homedir as homedir2 } from "os";
import { basename as basename2, extname, join as join6, resolve as resolve2 } from "path";
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
  renameSync3(oldPath, newPath);
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
  const stem = basename2(fileName, extension);
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
    renameSync3(legacyPath, backupPath);
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
import { join as join8, resolve as resolve3, basename as basename3, dirname as dirname4 } from "path";
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
      if (basename3(currentDir) === ".kandown" && existsSync8(join8(currentDir, "kandown.json"))) {
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
  plugin              Author plugins (create/build/check/dev/brief/publish)
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
function newTaskPath(kandownDir, id, title2, category) {
  return newTaskFilePath(kandownDir, id, title2, category);
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
      "plugin",
      "plugins",
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
    const open2 = remaining.match(SECTION_OPEN);
    if (!open2) {
      addError2(errors, "malformed_capsule", `capsule.sections[${sections.length}]`, "Malformed Kandown section tag");
      return sections;
    }
    const rawKind = open2[1] ?? "";
    if (!isCapsuleSectionKind(rawKind)) {
      addError2(errors, "unknown_section", `capsule.sections[${sections.length}]`, `Unknown Kandown section kind "${rawKind}"`);
      return sections;
    }
    let path;
    try {
      path = decodeURIComponent(open2[2] ?? "");
    } catch {
      addError2(errors, "malformed_capsule", `capsule.sections[${sections.length}].path`, "Section path is not valid URI encoding");
      return sections;
    }
    if (!isSafeWorkflowPath(path)) {
      addError2(errors, "unsafe_path", `capsule.sections[${sections.length}].path`, `Section path "${path}" is unsafe`);
      return sections;
    }
    const length = Number(open2[3]);
    if (!Number.isSafeInteger(length) || length < 0) {
      addError2(errors, "malformed_capsule", `capsule.sections[${sections.length}].chars`, "Section character count is invalid");
      return sections;
    }
    const contentStart = cursor + open2[0].length;
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
import { createHash as createHash2 } from "crypto";
import { existsSync as existsSync21, readFileSync as readFileSync19 } from "fs";
import { join as join24 } from "path";
function installFilePath(kandownDir) {
  return join24(kandownDir, "workflow-installs.json");
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
  const checksum = createHash2("sha256").update(capsule).digest("hex");
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
    if (existsSync21(join24(kandownDir, "workflows", entry.id))) return { ok: false, error: `Workflow ${entry.id} already exists.` };
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
import { existsSync as existsSync22, mkdirSync as mkdirSync12, readFileSync as readFileSync20, readdirSync as readdirSync9, statSync as statSync6, unlinkSync as unlinkSync7 } from "fs";
import { basename as basename6, join as join25, resolve as resolve8 } from "path";
function sourceFiles(directory, prefix = "") {
  const files = {};
  for (const name of readdirSync9(directory)) {
    const absolute = join25(directory, name);
    const relative3 = prefix ? `${prefix}/${name}` : name;
    if (statSync6(absolute).isDirectory()) Object.assign(files, sourceFiles(absolute, relative3));
    else files[relative3] = readFileSync20(absolute, "utf8");
  }
  return files;
}
function workflowRoots(kandownDir) {
  return [
    { directory: join25(kandownDir, "workflows"), source: "local" },
    { directory: join25(PKG_ROOT, "templates", "workflows"), source: "built-in" }
  ];
}
function installedStoreIds(kandownDir) {
  try {
    const raw = JSON.parse(readFileSync20(join25(kandownDir, "workflow-installs.json"), "utf8"));
    return new Set(Object.keys(raw.installs ?? {}));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function workflowDirectory(kandownDir, id) {
  return workflowRoots(kandownDir).map((root) => ({ directory: join25(root.directory, id), source: root.source })).find((item) => existsSync22(join25(item.directory, "manifest.json"))) ?? null;
}
function packageDirectories(root) {
  if (!existsSync22(root)) return [];
  return readdirSync9(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync22(join25(root, entry.name, "manifest.json"))).map((entry) => join25(root, entry.name));
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
      let rawId = basename6(directory);
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
    const directory = join25(root.directory, id);
    if (!existsSync22(join25(directory, "manifest.json"))) continue;
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
  atomicWriteFileSync(join25(located.directory, path), content);
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
  const directory = join25(kandownDir, "workflows", workflow.manifest.id);
  if (existsSync22(directory)) throw new Error(`Local workflow "${workflow.manifest.id}" already exists.`);
  mkdirSync12(join25(directory, "templates"), { recursive: true });
  atomicWriteFileSync(join25(directory, "manifest.json"), `${JSON.stringify(workflow.manifest, null, 2)}
`);
  atomicWriteFileSync(join25(directory, workflow.protocol.path), workflow.protocol.content);
  if (workflow.guide) atomicWriteFileSync(join25(directory, workflow.guide.path), workflow.guide.content);
  if (workflow.boardPreset) atomicWriteFileSync(join25(directory, workflow.boardPreset.path), workflow.boardPreset.content);
  for (const template of workflow.taskTemplates) atomicWriteFileSync(join25(directory, template.file), template.content);
  return directory;
}
function replaceStoreWorkflowPackage(kandownDir, workflow) {
  if (!installedStoreIds(kandownDir).has(workflow.manifest.id)) throw new Error("Only store-installed workflows can be updated in place.");
  const directory = join25(kandownDir, "workflows", workflow.manifest.id);
  const declared = new Set(["manifest.json", workflow.protocol.path, workflow.guide?.path, workflow.boardPreset?.path, ...workflow.taskTemplates.map((item) => item.file)].filter((item) => Boolean(item)));
  if (existsSync22(directory)) {
    for (const path of Object.keys(sourceFiles(directory))) if (!declared.has(path)) unlinkSync7(join25(directory, path));
  } else mkdirSync12(join25(directory, "templates"), { recursive: true });
  atomicWriteFileSync(join25(directory, "manifest.json"), `${JSON.stringify(workflow.manifest, null, 2)}
`);
  atomicWriteFileSync(join25(directory, workflow.protocol.path), workflow.protocol.content);
  if (workflow.guide) atomicWriteFileSync(join25(directory, workflow.guide.path), workflow.guide.content);
  if (workflow.boardPreset) atomicWriteFileSync(join25(directory, workflow.boardPreset.path), workflow.boardPreset.content);
  for (const template of workflow.taskTemplates) {
    mkdirSync12(join25(directory, "templates"), { recursive: true });
    atomicWriteFileSync(join25(directory, template.file), template.content);
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
      const directory = resolve8(args.positional[1] ?? "");
      if (!existsSync22(join25(directory, "manifest.json"))) throw new Error("Expected a workflow directory containing manifest.json.");
      const result = loadWorkflowPackage(sourceFiles(directory));
      if (!result.ok) throw new Error(result.errors.map((item) => `${item.path}: ${item.message}`).join("\n"));
      if (sub === "validate") {
        success(`Valid workflow ${result.value.manifest.id}@${result.value.manifest.version}.`);
        return;
      }
      const capsule = exportWorkflowCapsule(result.value);
      if (!capsule.ok) throw new Error(capsule.errors.map((item) => item.message).join("; "));
      const destination = resolve8(String(args.flags.output || `${result.value.manifest.id}.kandown-workflow.md`));
      atomicWriteFileSync(destination, capsule.value);
      success(`Packed ${destination}.`);
      return;
    }
    if (sub === "import") {
      const capsulePath = resolve8(args.positional[1] ?? "");
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
import { existsSync as existsSync31 } from "fs";
import { join as join38 } from "path";

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
  return new Promise((resolve12) => {
    const socket = createConnection({ port, host: "127.0.0.1" }, () => {
      socket.destroy();
      resolve12(true);
    });
    socket.on("error", () => resolve12(false));
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
      resolve12(false);
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
    await new Promise((resolve12) => setTimeout(resolve12, 120));
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
    await new Promise((resolve12) => setTimeout(resolve12, 100));
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
  const check2 = () => {
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
  const first = setTimeout(check2, FIRST_CHECK_MS);
  const interval = setInterval(check2, CHECK_INTERVAL_MS);
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
import { existsSync as existsSync14, readFileSync as readFileSync14, copyFileSync as copyFileSync2 } from "fs";
import { join as join16, resolve as resolve4 } from "path";
import { homedir as homedir9 } from "os";
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
function section(title2, body) {
  return `## ${title2}

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
    ({ name, meta: meta2 }) => `- **${name}** (${meta2.role})${meta2.instructions ? `: ${meta2.instructions}` : ""}`
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
import { readFileSync as readFileSync9, writeFileSync as writeFileSync3, mkdirSync as mkdirSync5, realpathSync, renameSync as renameSync4 } from "fs";
import { homedir as homedir5 } from "os";
import { join as join10 } from "path";

// src/lib/project-hash.ts
function canonicalizeProjectPath(projectDir, realpath2) {
  if (realpath2) {
    try {
      return realpath2(projectDir);
    } catch {
    }
  }
  return lexicalResolve(projectDir);
}
function projectHash(canonicalProject) {
  return sha256Hex(canonicalProject).slice(0, 24);
}
var SHA256_K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function rotr(x, n) {
  return x >>> n | x << 32 - n;
}
function sha256Hex(input) {
  const message = new TextEncoder().encode(input);
  const bitLength = message.length * 8;
  const paddedLength = (Math.floor((message.length + 8) / 64) + 1) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 4294967296), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  let h0 = 1779033703;
  let h1 = 3144134277;
  let h2 = 1013904242;
  let h3 = 2773480762;
  let h4 = 1359893119;
  let h5 = 2600822924;
  let h6 = 528734635;
  let h7 = 1541459225;
  const w = new Uint32Array(64);
  for (let block = 0; block < paddedLength; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let a = h0;
    let b = h1;
    let c2 = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const temp1 = h + S1 + ch + SHA256_K[i] + w[i] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c2 ^ b & c2;
      const temp2 = S0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + temp1 >>> 0;
      d = c2;
      c2 = b;
      b = a;
      a = temp1 + temp2 >>> 0;
    }
    h0 = h0 + a >>> 0;
    h1 = h1 + b >>> 0;
    h2 = h2 + c2 >>> 0;
    h3 = h3 + d >>> 0;
    h4 = h4 + e >>> 0;
    h5 = h5 + f >>> 0;
    h6 = h6 + g >>> 0;
    h7 = h7 + h >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((part) => part.toString(16).padStart(8, "0")).join("");
}
function lexicalResolve(projectDir) {
  const drive = /^[A-Za-z]:/.exec(projectDir)?.[0];
  const raw = drive ? projectDir.slice(2).replace(/\\/g, "/") : projectDir;
  const absolute = raw.startsWith("/");
  const stack = [];
  for (const segment of raw.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(segment);
  }
  const body = stack.join("/");
  if (drive) return `${drive}/${body}`;
  return absolute ? `/${body}` : body;
}

// src/lib/extensions/state.ts
function extensionStateDir(projectDir) {
  const canonicalProject = canonicalizeProjectPath(projectDir, realpathSync);
  const hash = projectHash(canonicalProject);
  return join10(homedir5(), ".kandown", "project-state", hash, "extensions");
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
  renameSync4(tmp, file);
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
    const relative3 = prefix ? `${prefix}/${name}` : name;
    if (statSync4(absolute).isDirectory()) Object.assign(files, readSourceFiles(absolute, relative3));
    else files[relative3] = readFileSync11(absolute, "utf8");
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
import { existsSync as existsSync11, renameSync as renameSync5, readFileSync as readFileSync12 } from "fs";
import { join as join13, basename as basename4, dirname as dirname5 } from "path";
import { spawnSync } from "child_process";
function isTrackedByGit2(path) {
  const res = spawnSync("git", ["ls-files", "--error-unmatch", "--", basename4(path)], {
    cwd: dirname5(path),
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"]
  });
  return res.status === 0;
}
function renameFile(from, to, useGit) {
  if (useGit && isTrackedByGit2(from)) {
    const res = spawnSync("git", ["mv", "--", basename4(from), basename4(to)], {
      cwd: dirname5(from),
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"]
    });
    if (res.status === 0) return "git";
  }
  renameSync5(from, to);
  return "fs";
}
function planFor(directory, filename) {
  const id = taskIdFromFilename(filename);
  if (!id) return null;
  let frontmatter = null;
  try {
    frontmatter = parseTaskFile(readFileSync12(join13(directory, filename), "utf8")).frontmatter;
  } catch {
    return null;
  }
  const others = listTaskFilenames(directory).filter((f) => f !== filename);
  const target = buildTaskFilename(id, frontmatter.title, frontmatter.category, others);
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
    const plan = planFor(dirname5(path), basename4(path));
    if (!plan) {
      info(`${id} already has the right filename: ${basename4(path)}`);
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
    const relative3 = prefix ? `${prefix}/${name}` : name;
    if (statSync5(absolute).isDirectory()) Object.assign(files, readSourceFiles2(absolute, relative3));
    else files[relative3] = readFileSync13(absolute, "utf8");
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

// src/cli/lib/home-workspace.ts
import { existsSync as existsSync13 } from "fs";
import { join as join15 } from "path";
import { homedir as homedir8 } from "os";
var HOME_WORKSPACE_MARKERS = ["package.json", "pnpm-workspace.yaml", "node_modules"];
function detectHomeWorkspace(home = homedir8()) {
  const markers = HOME_WORKSPACE_MARKERS.map((f) => join15(home, f)).filter(existsSync13);
  return markers.length >= 2 ? markers : [];
}

// src/cli/commands/project.ts
init_cli_shared();
function cmdInit(rawArgs) {
  const args = parseArgs(rawArgs);
  const kandownDir = resolve4(process.cwd(), args.path);
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
  const latest = await new Promise((resolve12) => {
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
    child.on("error", () => resolve12(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve12(null);
      const v = stdout.trim().replace(/^"|"$/g, "");
      resolve12(v || null);
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
  const kandownDir = resolve4(cwd, args.path);
  const htmlDest = join16(kandownDir, "kandown.html");
  if (existsSync14(htmlDest)) {
    const htmlSrc = resolve4(PKG_ROOT, "dist", "index.html");
    if (existsSync14(htmlSrc)) {
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
  const configPath = join16(kandownDir, "kandown.json");
  if (existsSync14(configPath)) {
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
  reportHomeWorkspace();
  log(`
${c.green}\u2713 Everything looks good!${c.reset}
`);
}
function reportHomeWorkspace(home = homedir9()) {
  const markers = detectHomeWorkspace(home);
  if (markers.length === 0) return;
  log(`
${c.yellow}\u26A0 pnpm workspace detected in your home directory${c.reset}`);
  info(`Found ${markers.map((m) => join16("~", m.slice(home.length + 1))).join(", ")} at ${home}`);
  err("This makes pnpm treat ~/ as the workspace root for every project below it \u2014 `pnpm dev` can hang and installs may target the wrong store.");
  info("Fix: remove these files/folders from your home (back them up first), or declare a pnpm-workspace.yaml inside each project.");
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
import { existsSync as existsSync18, readFileSync as readFileSync17, mkdirSync as mkdirSync8 } from "fs";
import { join as join20, resolve as resolve7 } from "path";
import { spawnSync as spawnSync2 } from "child_process";

// src/cli/lib/extensions-cli.ts
import { existsSync as existsSync16, readFileSync as readFileSync15, writeFileSync as writeFileSync5, mkdirSync as mkdirSync7, cpSync, rmSync, readdirSync as readdirSync7 } from "fs";
import { join as join18, resolve as resolve6 } from "path";

// src/lib/extensions/host.ts
import { createJiti } from "jiti";
import { existsSync as existsSync15 } from "fs";
import { join as join17, resolve as resolve5 } from "path";
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
   *
   * 📖 `options.inspect` skips the trust and restricted-mode gates, and
   * `options.only` narrows the load to one id. Both exist for `kandown plugin
   * check`, which must be able to report on a plugin the user has deliberately
   * not enabled yet. Inspection is in-process and one-shot: it never persists
   * trust, never installs the host anywhere, and the author already controls the
   * machine, so it grants no capability they did not have.
   */
  async loadAll(options = {}) {
    this.registry.reset();
    this.byExtId.clear();
    const restricted = isRestricted(this.env.config) && !options.inspect;
    const discovered = discoverExtensions(this.env.projectDir);
    for (const found of discovered) {
      if (options.only && found.manifestResult.ok && found.manifestResult.manifest.id !== options.only) continue;
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
      if (!options.inspect && persistedFailure && persistedFailure.failures >= QUARANTINE_THRESHOLD) {
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
      if (!options.inspect && found.source === "project" && !this.trust.has(manifest.id)) {
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
    const candidates = mainRel ? [resolve5(dir, mainRel)] : [join17(dir, "index.ts"), join17(dir, "index.js"), join17(dir, "index.mjs")];
    for (const c2 of candidates) if (existsSync15(c2)) return c2;
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
        const guidePath = resolve6(extension.dir, guidance.guide);
        if (!guidePath.startsWith(`${resolve6(extension.dir)}/`) || !existsSync16(guidePath)) {
          err(`Declared guide is unavailable: ${guidance.guide}`);
          process.exitCode = 1;
          return;
        }
        log(`
${readFileSync15(guidePath, "utf8")}`);
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
  const tasksDir = join18(projectDir, "tasks");
  let count = 0;
  if (!existsSync16(tasksDir)) return 0;
  for (const file of readdirSync7(tasksDir)) {
    if (!file.endsWith(".md")) continue;
    const path = join18(tasksDir, file);
    const raw = readFileSync15(path, "utf8");
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
  const destRoot = join18(projectDir, ".kandown", "extensions");
  mkdirSync7(destRoot, { recursive: true });
  const src = resolve6(target);
  if (existsSync16(src) && existsSync16(join18(src, "manifest.json"))) {
    const manifest = JSON.parse(readFileSync15(join18(src, "manifest.json"), "utf8"));
    if (!manifest.id) return null;
    const dest = join18(destRoot, manifest.id);
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
  const dir = join18(projectDir, ".kandown", "extensions", name);
  if (existsSync16(dir)) {
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
  writeFileSync5(join18(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}
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
  writeFileSync5(join18(dir, "index.ts"), indexTs);
  writeFileSync5(join18(dir, "README.md"), `# ${name}

A kandown extension. Enable with \`kandown extension enable ${name}\`.
`);
}

// src/cli/commands/tasks.ts
init_config2();

// src/cli/lib/agents.ts
import { execFileSync as execFileSync2 } from "child_process";

// src/cli/lib/agents-config.ts
init_atomic_write();
import { existsSync as existsSync17, readFileSync as readFileSync16 } from "fs";
import { join as join19 } from "path";
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
  const path = join19(kandownDir, "agents.json");
  if (!existsSync17(path)) return defaultAgentsConfig();
  let raw;
  try {
    raw = JSON.parse(readFileSync16(path, "utf8"));
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
  const path = join19(kandownDir, "agents.json");
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
init_task_title_category();
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
  process.stdout.write(readFileSync17(path, "utf8"));
}
function cmdCreate(rawArgs) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const title2 = args.positional.join(" ").trim();
  if (!title2) {
    err('Usage: kandown create "title" [-p P1] [-a user] [-t tag] [--to status] [--id custom-id] [--json]');
    process.exit(1);
  }
  const { category, cleanTitle } = parseTaskTitle(title2);
  const storedTitle = category ? cleanTitle : title2;
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
    title: storedTitle,
    status,
    created: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
  });
  if (category) fm.category = category;
  const priority = stringFlag(args.flags, "priority")?.toUpperCase();
  const assignee = stringFlag(args.flags, "assignee");
  const tags = listFlag(args.flags, "tag");
  if (priority) fm.priority = priority;
  if (assignee) fm.assignee = assignee;
  if (tags.length > 0) fm.tags = tags;
  const tasksDir = getTasksDir(kandownDir);
  if (!existsSync18(tasksDir)) mkdirSync8(tasksDir, { recursive: true });
  const path = newTaskPath(kandownDir, id, storedTitle, category);
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
  const metadataPath2 = join20(kandownDir, "daemon.json");
  if (!existsSync18(metadataPath2)) {
    info("No daemon metadata for this project.");
    return;
  }
  process.stdout.write(readFileSync17(metadataPath2, "utf8").trim() + "\n");
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
  if (!existsSync18(importPath)) {
    err(`Import file not found: ${file}`);
    process.exit(1);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync17(importPath, "utf8"));
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
  if (!existsSync18(tasksDir)) mkdirSync8(tasksDir, { recursive: true });
  let imported = 0;
  for (const row of rows) {
    const id = typeof row.id === "string" && /^[a-zA-Z0-9_-]+$/.test(row.id) ? row.id : nextTaskId(kandownDir);
    const title2 = typeof row.title === "string" && row.title ? row.title : id;
    const { category: rowCategory, cleanTitle: rowCleanTitle } = parseTaskTitle(title2);
    const storedTitle = rowCategory ? rowCleanTitle : title2;
    const existing = findTaskPath2(kandownDir, id);
    if (existing && args.flags.overwrite !== true) continue;
    const path = existing ?? newTaskPath(kandownDir, id, storedTitle, rowCategory);
    const fm = {
      id,
      title: storedTitle,
      status: typeof row.status === "string" && row.status ? row.status.replace(/ \(archived\)$/i, "") : defaultStatus
    };
    if (rowCategory) fm.category = rowCategory;
    if (typeof row.priority === "string") fm.priority = row.priority;
    if (typeof row.assignee === "string") fm.assignee = row.assignee;
    if (Array.isArray(row.tags)) fm.tags = row.tags.map(String);
    atomicWriteFileSync(path, serializeTaskFile(stampUpdated(fm), typeof row.body === "string" ? row.body : ""));
    imported++;
  }
  success(`Imported ${imported} task${imported === 1 ? "" : "s"}`);
}

// src/cli/commands/daemon.ts
import { join as join27 } from "path";

// src/cli/lib/server.ts
init_board_reader();
init_task_filename();
init_parser();
init_config2();
import { createServer } from "http";
import { existsSync as existsSync23, readFileSync as readFileSync21, copyFileSync as copyFileSync3, unlinkSync as unlinkSync8, mkdirSync as mkdirSync13 } from "fs";
import { basename as basename7, join as join26 } from "path";
import { spawn as spawn7 } from "child_process";

// src/cli/lib/agent/detect.ts
import { execFileSync as execFileSync3 } from "child_process";
var HARNESS_DEFS = [
  {
    id: "claude",
    name: "Claude Code",
    bin: "claude",
    protocol: "claude-stream-json",
    protocolArgs: [],
    permissionModes: { yolo: "native", "accept-edits": "native" },
    installHint: "npm install -g @anthropic-ai/claude-code"
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    bin: "codex",
    protocol: "codex-exec-json",
    protocolArgs: [],
    // 📖 codex exec has no interactive approver: yolo maps onto its bypass
    // flags natively, accept-edits can only be approximated by the
    // workspace-write sandbox, so the UI treats it as advisory.
    permissionModes: { yolo: "native", "accept-edits": "advisory" },
    installHint: "npm install -g @openai/codex"
  },
  {
    id: "pi",
    name: "Pi",
    bin: "pi",
    protocol: "pi-rpc",
    protocolArgs: ["--mode", "rpc"],
    // 📖 pi is deliberately permission-free (its extensions own confirmations):
    // both modes are advisory, the diff is shown after the fact.
    permissionModes: { yolo: "advisory", "accept-edits": "advisory" },
    installHint: "https://github.com/badlogic/pi-mono"
  },
  {
    id: "opencode",
    name: "OpenCode",
    bin: "opencode",
    protocol: "acp",
    protocolArgs: ["acp"],
    // 📖 ACP agents decide per session: session/new reports the available
    // modes and the runtime upgrades support to native when a mode matches.
    permissionModes: { yolo: "advisory", "accept-edits": "advisory" },
    installHint: "https://opencode.ai"
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    bin: "gemini",
    protocol: "acp",
    protocolArgs: ["--experimental-acp"],
    permissionModes: { yolo: "advisory", "accept-edits": "advisory" },
    installHint: "npm install -g @google/gemini-cli"
  }
];
function probeVersion(bin) {
  try {
    const out = execFileSync3(bin, ["--version"], {
      encoding: "utf8",
      timeout: 3e3,
      stdio: ["ignore", "pipe", "ignore"]
    });
    const first = out.split("\n").map((line) => line.trim()).find(Boolean);
    return first ? first.slice(0, 80) : null;
  } catch {
    return null;
  }
}
function detectHarnessesJSON() {
  return {
    harnesses: HARNESS_DEFS.map((def) => {
      const binPath = resolveBinPath(def.bin);
      return {
        id: def.id,
        name: def.name,
        bin: def.bin,
        protocol: def.protocol,
        binPath,
        version: binPath ? probeVersion(def.bin) : null,
        installed: binPath !== null,
        permissionModes: { ...def.permissionModes },
        installHint: def.installHint
      };
    })
  };
}
function getHarnessDef(id) {
  return HARNESS_DEFS.find((def) => def.id === id);
}
function resolveHarness(id) {
  const def = getHarnessDef(id);
  if (!def) return null;
  const binPath = resolveBinPath(def.bin);
  return binPath ? { def, binPath } : null;
}

// src/cli/lib/agent/agent-runtime.ts
import { spawn as spawn6 } from "child_process";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";

// src/cli/lib/agent/types.ts
var EDIT_TOOL_NAMES = /* @__PURE__ */ new Set(["write", "edit", "multiedit", "notebookedit", "apply_patch", "apply-patch", "str_replace", "create", "patch"]);

// src/cli/lib/agent/adapters/claude-code.ts
function buildArgs(config, binPath) {
  const args = [
    binPath,
    "-p",
    config.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    config.permissionMode === "yolo" ? "bypassPermissions" : "acceptEdits"
  ];
  if (config.resumeSessionId) args.push("--resume", config.resumeSessionId);
  return args;
}
function editPath(input) {
  if (input === null || typeof input !== "object") return null;
  const record = input;
  for (const key of ["file_path", "filePath", "path", "notebook_path"]) {
    if (typeof record[key] === "string" && record[key]) return record[key];
  }
  return null;
}
function parseLine(line, state) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return { events: [] };
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { events: [] };
  }
  if (parsed === null || typeof parsed !== "object") return { events: [] };
  const event = parsed;
  const events = [];
  if (event.type === "system" && event.subtype === "init" && !state.sessionStartedEmitted) {
    state.sessionStartedEmitted = true;
    state.harnessSessionId = typeof event.session_id === "string" ? event.session_id : void 0;
    state.model = typeof event.model === "string" ? event.model : void 0;
    events.push({
      type: "session_started",
      harnessSessionId: state.harnessSessionId ?? "",
      ...state.model ? { model: state.model } : {},
      permissionMode: state.permissionMode,
      permissionSupport: state.permissionSupport
    });
    return { events };
  }
  if (event.type === "assistant" && event.message && typeof event.message === "object") {
    const message = event.message;
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block === null || typeof block !== "object") continue;
        const content = block;
        if (content.type === "text" && typeof content.text === "string" && content.text) {
          events.push({ type: "message_delta", text: content.text, partial: false, channel: "text" });
        } else if (content.type === "tool_use") {
          const toolName = typeof content.name === "string" ? content.name : "tool";
          const path = editPath(content.input);
          events.push({
            type: "tool_started",
            toolCallId: typeof content.id === "string" ? content.id : void 0,
            toolName,
            ...path ? { summary: path } : {}
          });
          if (path && EDIT_TOOL_NAMES.has(toolName.toLowerCase())) {
            events.push({ type: "file_changed", path });
          }
        }
      }
    }
    return { events };
  }
  if (event.type === "user" && event.message && typeof event.message === "object") {
    const message = event.message;
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block === null || typeof block !== "object") continue;
        const content = block;
        if (content.type === "tool_result") {
          events.push({
            type: "tool_finished",
            toolCallId: typeof content.tool_use_id === "string" ? content.tool_use_id : void 0,
            ok: content.is_error !== true
          });
        }
      }
    }
    return { events };
  }
  if (event.type === "result") {
    if (event.usage && typeof event.usage === "object") {
      const usage = event.usage;
      events.push({
        type: "usage",
        inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : void 0,
        outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : void 0,
        cachedInputTokens: typeof usage.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : void 0,
        costUsd: typeof event.total_cost_usd === "number" ? event.total_cost_usd : void 0
      });
    }
    events.push({
      type: "turn_completed",
      stopReason: typeof event.subtype === "string" ? event.subtype : void 0
    });
    return { events };
  }
  return { events };
}
var claudeCodeAdapter = {
  protocol: "claude-stream-json",
  buildArgs,
  parseLine: (line, state) => parseLine(line, state)
};

// src/cli/lib/agent/adapters/codex.ts
function buildArgs2(config, binPath) {
  const modeFlags = config.permissionMode === "yolo" ? ["--dangerously-bypass-approvals-and-sandbox"] : ["--sandbox", "workspace-write"];
  const jsonAndCheck = ["--json", "--skip-git-repo-check"];
  if (config.resumeSessionId) {
    return [binPath, "exec", "resume", config.resumeSessionId, ...jsonAndCheck, ...modeFlags, config.prompt];
  }
  return [binPath, "exec", ...jsonAndCheck, ...modeFlags, config.prompt];
}
function itemFields(item) {
  const empty = { type: "", paths: [] };
  if (item === null || typeof item !== "object") return empty;
  const record = item;
  const type = typeof record.type === "string" ? record.type : "";
  const paths = [];
  if (Array.isArray(record.changes)) {
    for (const change of record.changes) {
      if (change && typeof change === "object" && typeof change.path === "string") {
        paths.push(change.path);
      }
    }
  }
  return {
    type,
    id: typeof record.id === "string" ? record.id : void 0,
    text: typeof record.text === "string" ? record.text : void 0,
    command: typeof record.command === "string" ? record.command : void 0,
    exitCode: typeof record.exit_code === "number" ? record.exit_code : void 0,
    paths
  };
}
function parseLine2(line, state) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return { events: [] };
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { events: [] };
  }
  if (parsed === null || typeof parsed !== "object") return { events: [] };
  const event = parsed;
  const events = [];
  if (event.type === "thread.started" && !state.sessionStartedEmitted) {
    state.sessionStartedEmitted = true;
    state.harnessSessionId = typeof event.thread_id === "string" ? event.thread_id : void 0;
    events.push({
      type: "session_started",
      harnessSessionId: state.harnessSessionId ?? "",
      permissionMode: state.permissionMode,
      permissionSupport: state.permissionSupport
    });
    return { events };
  }
  if ((event.type === "item.started" || event.type === "item.completed") && event.item !== void 0) {
    const item = itemFields(event.item);
    if (event.type === "item.started" && item.type === "command_execution") {
      events.push({
        type: "tool_started",
        toolCallId: item.id,
        toolName: "command",
        ...item.command ? { summary: item.command } : {}
      });
      return { events };
    }
    if (event.type === "item.completed") {
      if (item.type === "agent_message" && item.text) {
        events.push({ type: "message_delta", text: item.text, partial: false, channel: "text" });
      } else if (item.type === "command_execution") {
        events.push({
          type: "tool_finished",
          toolCallId: item.id,
          toolName: "command",
          ok: item.exitCode === void 0 ? true : item.exitCode === 0,
          ...item.command ? { summary: item.command } : {}
        });
      } else if (item.type === "file_change") {
        for (const path of item.paths) events.push({ type: "file_changed", path });
      } else if (item.type === "error") {
        events.push({ type: "error", message: item.text ?? "codex item failed", fatal: false });
      }
      return { events };
    }
    return { events };
  }
  if (event.type === "turn.completed") {
    if (event.usage && typeof event.usage === "object") {
      const usage = event.usage;
      events.push({
        type: "usage",
        inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : void 0,
        outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : void 0,
        cachedInputTokens: typeof usage.cached_input_tokens === "number" ? usage.cached_input_tokens : void 0
      });
    }
    events.push({ type: "turn_completed" });
    return { events };
  }
  if (event.type === "turn.failed") {
    const error = event.error;
    const message = error && typeof error.message === "string" ? error.message : "codex turn failed";
    events.push({ type: "error", message, fatal: true });
    return { events };
  }
  if (event.type === "error" && typeof event.message === "string") {
    events.push({ type: "error", message: event.message, fatal: false });
    return { events };
  }
  return { events };
}
var codexAdapter = {
  protocol: "codex-exec-json",
  buildArgs: buildArgs2,
  parseLine: (line, state) => parseLine2(line, state)
};

// src/cli/lib/agent/adapters/pi.ts
function buildArgs3(config, binPath) {
  return [binPath, "--mode", "rpc"];
}
function initialStdin(config) {
  const lines = [];
  if (config.resumeSessionId) {
    lines.push(JSON.stringify({ type: "switch_session", sessionPath: config.resumeSessionId }));
  }
  lines.push(JSON.stringify({ id: "kandown-state", type: "get_state" }));
  lines.push(JSON.stringify({ id: "kandown-prompt-1", type: "prompt", message: config.prompt }));
  return lines;
}
function onStop() {
  return [JSON.stringify({ type: "abort" })];
}
function argsPath(args) {
  if (args === null || typeof args !== "object") return null;
  const record = args;
  for (const key of ["path", "file_path", "filePath", "file", "target"]) {
    if (typeof record[key] === "string" && record[key]) return record[key];
  }
  return null;
}
function parseMessageUpdate(event, events) {
  if (event.usage && typeof event.usage === "object") {
    const usage = event.usage;
    const cost = usage.cost && typeof usage.cost === "object" ? usage.cost : void 0;
    events.push({
      type: "usage",
      inputTokens: typeof usage.input === "number" ? usage.input : void 0,
      outputTokens: typeof usage.output === "number" ? usage.output : void 0,
      cachedInputTokens: typeof usage.cacheRead === "number" ? usage.cacheRead : void 0,
      costUsd: cost && typeof cost.total === "number" ? cost.total : void 0
    });
  }
  const delta = event.assistantMessageEvent && typeof event.assistantMessageEvent === "object" ? event.assistantMessageEvent : void 0;
  if (!delta) return;
  switch (delta.type) {
    case "text_delta":
      if (typeof delta.delta === "string") {
        events.push({ type: "message_delta", text: delta.delta, partial: true, channel: "text" });
      }
      break;
    case "thinking_delta":
      if (typeof delta.delta === "string") {
        events.push({ type: "message_delta", text: delta.delta, partial: true, channel: "thinking" });
      }
      break;
    case "toolcall_start":
      events.push({
        type: "tool_started",
        toolCallId: typeof delta.id === "string" ? delta.id : void 0,
        toolName: typeof delta.toolName === "string" ? delta.toolName : "tool"
      });
      break;
    default:
      break;
  }
}
function parseLine3(line, state) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return { events: [] };
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { events: [] };
  }
  if (parsed === null || typeof parsed !== "object") return { events: [] };
  const event = parsed;
  const events = [];
  if (event.type === "response") {
    if (event.command === "get_state" && event.success === true && !state.sessionStartedEmitted) {
      const data = event.data && typeof event.data === "object" ? event.data : {};
      state.sessionStartedEmitted = true;
      state.harnessSessionId = typeof data.sessionId === "string" ? data.sessionId : void 0;
      const model = data.model && typeof data.model === "object" ? data.model : void 0;
      state.model = model && typeof model.id === "string" ? model.id : void 0;
      events.push({
        type: "session_started",
        harnessSessionId: state.harnessSessionId ?? "",
        ...state.model ? { model: state.model } : {},
        permissionMode: state.permissionMode,
        permissionSupport: state.permissionSupport
      });
      return { events };
    }
    if (event.success === false) {
      const message = typeof event.error === "string" ? event.error : `pi command failed: ${String(event.command ?? "unknown")}`;
      events.push({ type: "error", message, fatal: event.command === "prompt" });
      return { events };
    }
    return { events };
  }
  if (event.type === "agent_start") {
    state.busy = true;
    return { events };
  }
  if (event.type === "agent_settled") {
    state.busy = false;
    return { events };
  }
  if (event.type === "message_update") {
    parseMessageUpdate(event, events);
    return { events };
  }
  if (event.type === "tool_execution_start") {
    const toolName = typeof event.toolName === "string" ? event.toolName : "tool";
    events.push({
      type: "tool_started",
      toolCallId: typeof event.toolCallId === "string" ? event.toolCallId : void 0,
      toolName
    });
    const path = argsPath(event.args);
    if (path && EDIT_TOOL_NAMES.has(toolName.toLowerCase())) {
      events.push({ type: "file_changed", path });
    }
    return { events };
  }
  if (event.type === "tool_execution_end") {
    const toolName = typeof event.toolName === "string" ? event.toolName : void 0;
    events.push({
      type: "tool_finished",
      toolCallId: typeof event.toolCallId === "string" ? event.toolCallId : void 0,
      ...toolName ? { toolName } : {},
      ok: event.isError !== true
    });
    const path = argsPath(event.args);
    if (path && toolName && EDIT_TOOL_NAMES.has(toolName.toLowerCase())) {
      events.push({ type: "file_changed", path });
    }
    return { events };
  }
  if (event.type === "turn_end") {
    events.push({ type: "turn_completed" });
    return { events };
  }
  if (event.type === "extension_error") {
    const message = typeof event.error === "string" ? event.error : "pi extension error";
    events.push({ type: "error", message, fatal: false });
    return { events };
  }
  return { events };
}
var piAdapter = {
  protocol: "pi-rpc",
  buildArgs: buildArgs3,
  initialStdin,
  parseLine: (line, state) => parseLine3(line, state),
  onStop
};

// src/cli/lib/agent/adapters/acp.ts
var JSONRPC_VERSION = "2.0";
function buildArgs4(config, binPath) {
  return config.resumeSessionId ? [binPath, ...config.protocolArgs ?? [], "--resume", config.resumeSessionId] : [binPath, ...config.protocolArgs ?? []];
}
function initialStdin2() {
  return [JSON.stringify({
    jsonrpc: JSONRPC_VERSION,
    id: 1,
    method: "initialize",
    params: { protocolVersion: 1, clientCapabilities: {} }
  })];
}
function matchModeId(modeId, mode) {
  const normalized = modeId.toLowerCase().replace(/[\s_-]/g, "");
  if (mode === "yolo") return /yolo|bypass|danger|fullaccess/.test(normalized);
  return /accept|edit|autowrite|write/.test(normalized);
}
function promptRequest(sessionId, id, prompt) {
  return JSON.stringify({
    jsonrpc: JSONRPC_VERSION,
    id,
    method: "session/prompt",
    params: { sessionId, prompt: [{ type: "text", text: prompt }] }
  });
}
function parseSessionUpdate(update, events) {
  const kind = typeof update.sessionUpdate === "string" ? update.sessionUpdate : "";
  if (kind === "agent_message_chunk") {
    const content = update.content && typeof update.content === "object" ? update.content : void 0;
    if (content && typeof content.text === "string" && content.text) {
      events.push({ type: "message_delta", text: content.text, partial: true, channel: "text" });
    }
  } else if (kind === "agent_thought_chunk") {
    const content = update.content && typeof update.content === "object" ? update.content : void 0;
    if (content && typeof content.text === "string" && content.text) {
      events.push({ type: "message_delta", text: content.text, partial: true, channel: "thinking" });
    }
  } else if (kind === "tool_call") {
    events.push({
      type: "tool_started",
      toolCallId: typeof update.toolCallId === "string" ? update.toolCallId : void 0,
      toolName: typeof update.title === "string" ? update.title : "tool"
    });
  } else if (kind === "tool_call_update") {
    const status = typeof update.status === "string" ? update.status : void 0;
    if (status === "completed" || status === "failed") {
      events.push({
        type: "tool_finished",
        toolCallId: typeof update.toolCallId === "string" ? update.toolCallId : void 0,
        ok: status === "completed"
      });
    }
  }
}
function parseLine4(line, state, config) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return { events: [] };
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { events: [] };
  }
  if (parsed === null || typeof parsed !== "object") return { events: [] };
  const message = parsed;
  const events = [];
  const outbound = [];
  if (message.id === 1 && message.method === void 0 && message.result !== void 0) {
    outbound.push(JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: "session/new",
      params: { cwd: config.projectRoot, mcpServers: [] }
    }));
    return { events, outbound };
  }
  if (message.id === 2 && message.method === void 0 && message.result !== void 0) {
    const result = message.result && typeof message.result === "object" ? message.result : {};
    state.acpSessionId = typeof result.sessionId === "string" ? result.sessionId : void 0;
    state.harnessSessionId = state.acpSessionId;
    state.acpNextRequestId = 3;
    const modes = result.modes && typeof result.modes === "object" ? result.modes : void 0;
    const available = Array.isArray(modes?.availableModes) ? modes.availableModes : [];
    let matchedModeId = null;
    for (const mode of available) {
      const modeId = mode && typeof mode === "object" && typeof mode.id === "string" ? mode.id : "";
      if (modeId && matchModeId(modeId, state.permissionMode)) {
        matchedModeId = modeId;
        break;
      }
    }
    if (matchedModeId && state.acpSessionId) {
      state.permissionSupport = "native";
      outbound.push(JSON.stringify({
        jsonrpc: JSONRPC_VERSION,
        method: "session/set_mode",
        params: { sessionId: state.acpSessionId, modeId: matchedModeId }
      }));
    }
    if (state.acpSessionId) {
      state.acpPendingPromptId = state.acpNextRequestId;
      state.acpNextRequestId += 1;
      outbound.push(promptRequest(state.acpSessionId, state.acpPendingPromptId, config.prompt));
    }
    state.sessionStartedEmitted = true;
    events.push({
      type: "session_started",
      harnessSessionId: state.harnessSessionId ?? "",
      permissionMode: state.permissionMode,
      permissionSupport: state.permissionSupport
    });
    return { events, outbound };
  }
  if (message.method === void 0 && message.id !== void 0 && message.id === state.acpPendingPromptId) {
    state.acpPendingPromptId = void 0;
    if (message.error !== void 0 && message.error !== null) {
      events.push({ type: "error", message: `ACP prompt failed: ${JSON.stringify(message.error)}`, fatal: true });
      return { events };
    }
    const result = message.result && typeof message.result === "object" ? message.result : {};
    events.push({ type: "turn_completed", stopReason: typeof result.stopReason === "string" ? result.stopReason : void 0 });
    return { events };
  }
  if (message.method !== void 0 && message.id !== void 0) {
    if (message.method === "session/request_permission") {
      const params = message.params && typeof message.params === "object" ? message.params : {};
      const options = Array.isArray(params.options) ? params.options : [];
      let optionId;
      for (const option of options) {
        const record = option && typeof option === "object" ? option : {};
        if (record.kind === "allow_once" && typeof record.optionId === "string") {
          optionId = record.optionId;
          break;
        }
      }
      outbound.push(JSON.stringify({
        jsonrpc: JSONRPC_VERSION,
        id: message.id,
        result: {
          outcome: optionId ? { outcome: "selected", optionId } : { outcome: "cancelled" }
        }
      }));
      return { events, outbound };
    }
    outbound.push(JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      id: message.id,
      error: { code: -32601, message: `kandown does not implement ${String(message.method)}` }
    }));
    return { events, outbound };
  }
  if (message.method === "session/update" && message.params && typeof message.params === "object") {
    const params = message.params;
    const update = params.update && typeof params.update === "object" ? params.update : void 0;
    if (update) parseSessionUpdate(update, events);
    return { events };
  }
  return { events };
}
var acpAdapter = {
  protocol: "acp",
  buildArgs: buildArgs4,
  initialStdin: () => initialStdin2(),
  parseLine: parseLine4
};

// src/cli/lib/agent/agent-runtime.ts
var MAX_SESSIONS = 50;
var EVENT_BUFFER_LIMIT = 500;
var ADAPTERS = {
  "claude-stream-json": claudeCodeAdapter,
  "codex-exec-json": codexAdapter,
  "pi-rpc": piAdapter,
  "acp": acpAdapter
};
var sessions = /* @__PURE__ */ new Map();
function createLineSplitter(onLine) {
  let buffer = "";
  return {
    push(chunk) {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        onLine(line);
        index = buffer.indexOf("\n");
      }
    },
    flush() {
      if (buffer.trim()) onLine(buffer.replace(/\r$/, ""));
      buffer = "";
    }
  };
}
function meta(record) {
  return { sessionId: record.info.id, harnessId: record.info.harnessId, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
}
function recordEvent(record, event) {
  record.buffer.push(event);
  if (record.buffer.length > EVENT_BUFFER_LIMIT) record.buffer.shift();
  record.emitter.emit("event", event);
}
function handleLine(record, line) {
  if (!line.trim()) return;
  let result;
  try {
    result = record.adapter.parseLine(line, record.state, record.config);
  } catch (error) {
    recordEvent(record, {
      type: "error",
      message: `adapter parse failure: ${error instanceof Error ? error.message : String(error)}`,
      fatal: false,
      ...meta(record)
    });
    return;
  }
  for (const event of result.events ?? []) {
    if (event.type === "session_started") {
      record.info.harnessSessionId = event.harnessSessionId || record.state.harnessSessionId;
    }
    if (event.type === "turn_completed") record.turnSeen = true;
    recordEvent(record, { ...event, ...meta(record) });
  }
  if (result.outbound && record.child?.stdin && !record.child.stdin.destroyed) {
    for (const line2 of result.outbound) record.child.stdin.write(`${line2}
`);
  }
}
function attachChild(record, child) {
  record.child = child;
  const splitter = createLineSplitter((line) => handleLine(record, line));
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => splitter.push(chunk));
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    record.stderrTail = `${record.stderrTail}${chunk}`.slice(-2e3);
  });
  const finish = (reason, code) => {
    splitter.flush();
    record.child = null;
    record.state.busy = false;
    record.info.exitCode = code;
    if (reason === "crash" && !record.turnSeen && record.stderrTail.trim()) {
      recordEvent(record, {
        type: "error",
        message: record.stderrTail.trim().split("\n").slice(-3).join("\n"),
        fatal: true,
        ...meta(record)
      });
    }
    record.info.status = reason === "crash" ? "failed" : reason === "user" ? "stopped" : "completed";
    recordEvent(record, { type: "stopped", reason, exitCode: code, ...meta(record) });
  };
  child.on("error", (error) => {
    recordEvent(record, {
      type: "error",
      message: `failed to start ${record.info.harnessId}: ${error.message}`,
      fatal: true,
      ...meta(record)
    });
    if (record.child === child) finish("crash", null);
  });
  child.on("close", (code) => {
    if (record.stopRequested) finish("user", code);
    else if (code === 0) finish("exit", code);
    else finish("crash", code);
  });
}
function startChild(record) {
  const config = record.config;
  const argv = record.adapter.buildArgs(config, record.resolvedBinPath);
  const child = spawn6(argv[0], argv.slice(1), {
    cwd: config.projectRoot,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"]
  });
  attachChild(record, child);
  const initial = record.adapter.initialStdin?.(config) ?? [];
  if (initial.length > 0) {
    child.once("spawn", () => {
      for (const line of initial) child.stdin?.write(`${line}
`);
    });
  }
}
function evictIfNeeded() {
  if (sessions.size < MAX_SESSIONS) return;
  const settled = [...sessions.values()].filter((record) => record.info.status !== "starting" && record.info.status !== "running").sort((a, b) => a.info.startedAt.localeCompare(b.info.startedAt));
  if (settled.length > 0) sessions.delete(settled[0].info.id);
  else {
    const oldest = sessions.keys().next();
    if (!oldest.done) sessions.delete(oldest.value);
  }
}
function createAgentSession(config) {
  const resolved = resolveHarness(config.harnessId);
  if (!resolved) {
    throw new Error(`Harness "${config.harnessId}" is not installed or unknown.`);
  }
  const adapter = ADAPTERS[resolved.def.protocol];
  if (!adapter) {
    throw new Error(`No adapter for protocol "${resolved.def.protocol}".`);
  }
  evictIfNeeded();
  const record = {
    info: {
      id: `ses_${randomUUID().slice(0, 8)}`,
      harnessId: config.harnessId,
      status: "starting",
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    config: { ...config, protocolArgs: [...resolved.def.protocolArgs] },
    adapter,
    state: {
      permissionMode: config.permissionMode,
      // 📖 Detection-level support; ACP upgrades this per session when a
      // matching mode is reported by session/new.
      permissionSupport: resolved.def.permissionModes[config.permissionMode]
    },
    emitter: new EventEmitter(),
    buffer: [],
    child: null,
    stopRequested: false,
    turnSeen: false,
    stderrTail: "",
    resolvedBinPath: resolved.binPath
  };
  sessions.set(record.info.id, record);
  startChild(record);
  return { ...record.info };
}
function listAgentSessions() {
  return [...sessions.values()].map((record) => ({ ...record.info }));
}
function subscribeAgentSession(id, listener) {
  const record = sessions.get(id);
  if (!record) return null;
  for (const event of record.buffer) listener(event);
  record.emitter.on("event", listener);
  return () => record.emitter.off("event", listener);
}
function promptAcpSession(sessionId, id, text) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "session/prompt",
    params: { sessionId, prompt: [{ type: "text", text }] }
  });
}
function sendToSession(id, text) {
  const record = sessions.get(id);
  if (!record) return { ok: false, error: "Unknown session" };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Message is empty" };
  if (record.child?.stdin && !record.child.stdin.destroyed) {
    if (record.adapter === piAdapter) {
      const command = record.state.busy ? { type: "prompt", message: trimmed, streamingBehavior: "followUp" } : { id: `kandown-prompt-${Date.now()}`, type: "prompt", message: trimmed };
      record.child.stdin.write(`${JSON.stringify(command)}
`);
      return { ok: true };
    }
    if (record.adapter === acpAdapter && record.state.acpSessionId) {
      const nextId = record.state.acpNextRequestId ?? 3;
      record.state.acpNextRequestId = nextId + 1;
      record.state.acpPendingPromptId = nextId;
      record.child.stdin.write(`${promptAcpSession(record.state.acpSessionId, nextId, trimmed)}
`);
      return { ok: true };
    }
    return { ok: false, error: "This harness is one-shot; wait for the turn to finish." };
  }
  if (record.info.status === "completed" || record.info.status === "stopped" || record.info.status === "failed") {
    if (!record.info.harnessSessionId) {
      return { ok: false, error: "The harness never reported a session id; resume is impossible." };
    }
    record.config.prompt = trimmed;
    record.config.resumeSessionId = record.info.harnessSessionId;
    record.stopRequested = false;
    record.turnSeen = false;
    record.stderrTail = "";
    record.info.status = "running";
    try {
      startChild(record);
    } catch (error) {
      record.info.status = "failed";
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    return { ok: true };
  }
  return { ok: false, error: `Session is ${record.info.status}; cannot send now.` };
}
function stopAgentSession(id) {
  const record = sessions.get(id);
  if (!record) return false;
  record.stopRequested = true;
  if (record.child) {
    const goodbye = record.adapter.onStop?.(record.state) ?? [];
    if (record.child.stdin && !record.child.stdin.destroyed) {
      for (const line of goodbye) record.child.stdin.write(`${line}
`);
    }
    const child = record.child;
    setTimeout(() => {
      if (record.child === child && child.exitCode === null && !child.killed) {
        child.kill("SIGTERM");
      }
    }, 3e3);
  } else {
    record.info.status = "stopped";
    recordEvent(record, { type: "stopped", reason: "user", exitCode: null, ...meta(record) });
  }
  return true;
}

// src/cli/lib/agent/session-index.ts
import { mkdirSync as mkdirSync9, readFileSync as readFileSync18, readdirSync as readdirSync8, realpathSync as realpathSync2, unlinkSync as unlinkSync6 } from "fs";
import { homedir as homedir10 } from "os";
import { join as join21 } from "path";
init_atomic_write();
function sessionIndexBaseDir() {
  return join21(homedir10(), ".kandown", "sessions");
}
function sessionIndexDir(projectRoot) {
  const canonicalProject = canonicalizeProjectPath(projectRoot, realpathSync2);
  return join21(sessionIndexBaseDir(), projectHash(canonicalProject));
}
function entryFileName(id) {
  if (typeof id !== "string") return null;
  const safe = id.replace(/[^A-Za-z0-9._-]/g, "_");
  return safe ? `${safe}.json` : null;
}
function entryPath(projectRoot, id) {
  const fileName = entryFileName(id);
  return fileName ? join21(sessionIndexDir(projectRoot), fileName) : null;
}
function isSessionIndexEntry(value) {
  if (!value || typeof value !== "object") return false;
  const item = value;
  if (typeof item.id !== "string" || !item.id) return false;
  if (typeof item.harnessId !== "string" || !item.harnessId) return false;
  if (typeof item.title !== "string") return false;
  if (typeof item.createdAt !== "string" || typeof item.updatedAt !== "string") return false;
  if (item.harnessSessionId !== void 0 && typeof item.harnessSessionId !== "string") return false;
  if (item.taskId !== void 0 && typeof item.taskId !== "string") return false;
  return true;
}
function readEntry(projectRoot, id) {
  const file = entryPath(projectRoot, id);
  if (!file) return null;
  try {
    const parsed = JSON.parse(readFileSync18(file, "utf8"));
    return isSessionIndexEntry(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function upsertSessionIndexEntry(projectRoot, entry) {
  const file = entryPath(projectRoot, entry?.id ?? "");
  if (!file) return;
  try {
    mkdirSync9(sessionIndexDir(projectRoot), { recursive: true });
    atomicWriteFileSync(file, `${JSON.stringify(entry, null, 2)}
`);
  } catch {
  }
}
function patchSessionIndexEntry(projectRoot, id, patch) {
  if (typeof id !== "string" || !id) return;
  const existing = readEntry(projectRoot, id);
  if (!existing) return;
  const next = {
    ...existing,
    ...patch.harnessSessionId !== void 0 ? { harnessSessionId: patch.harnessSessionId } : {},
    ...patch.title !== void 0 ? { title: patch.title } : {},
    ...patch.taskId !== void 0 ? { taskId: patch.taskId } : {},
    updatedAt: patch.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
  upsertSessionIndexEntry(projectRoot, next);
}
function forgetSessionIndexEntry(projectRoot, id) {
  const file = entryPath(projectRoot, id);
  if (!file) return;
  try {
    unlinkSync6(file);
  } catch {
  }
}
function listSessionIndexEntries(projectRoot) {
  const dir = sessionIndexDir(projectRoot);
  let fileNames;
  try {
    fileNames = readdirSync8(dir);
  } catch {
    return [];
  }
  const entries = [];
  for (const fileName of fileNames) {
    if (!fileName.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(readFileSync18(join21(dir, fileName), "utf8"));
      if (isSessionIndexEntry(parsed)) entries.push(parsed);
    } catch {
      continue;
    }
  }
  return entries.sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
  );
}
function indexEntryForPrompt(prompt) {
  const firstLine = prompt.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? "";
  const collapsed = firstLine.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, 60).trimEnd();
}

// src/cli/lib/server.ts
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
import { mkdirSync as mkdirSync10, writeFileSync as writeFileSync6 } from "fs";
import { join as join22 } from "path";
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
  const destDir = join22(projectDir, ".kandown", "extensions", manifest.id);
  mkdirSync10(destDir, { recursive: true });
  const copied = [];
  const write = (relPath, content) => {
    writeFileSync6(join22(destDir, relPath), content, "utf8");
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
import { existsSync as existsSync20, mkdirSync as mkdirSync11, writeFileSync as writeFileSync7 } from "fs";
import { join as join23 } from "path";

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

// src/lib/themes/shadcn.ts
var shadcnTheme = {
  id: "shadcn",
  name: "Shadcn",
  author: "Kandown",
  description: "Ultra-clean zinc palette, near-black primary, crisp borders. The shadcn/ui look as a default.",
  appearance: { radius: "8px", borderWidth: "1px", shadows: "soft", density: "comfortable", glass: true, motion: "subtle" },
  fonts: { sans: "'Inter var', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "'Inter Tight', 'Inter var', Inter, sans-serif", mono: "'SF Mono', Menlo, Monaco, Consolas, monospace" },
  light: {
    ...sharedLight,
    "background": "0 0% 100%",
    "foreground": "240 10% 3.9%",
    "card": "0 0% 100%",
    "card-foreground": "240 10% 3.9%",
    "popover": "0 0% 100%",
    "popover-foreground": "240 10% 3.9%",
    "primary": "240 5.9% 10%",
    "primary-foreground": "0 0% 98%",
    "secondary": "240 4.8% 95.9%",
    "secondary-foreground": "240 5.9% 10%",
    "muted": "240 4.8% 95.9%",
    "muted-foreground": "240 3.8% 46.1%",
    "accent": "240 4.8% 95.9%",
    "accent-foreground": "240 5.9% 10%",
    "border": "240 5.9% 90%",
    "border-strong": "240 5.9% 80%",
    "border-focus": "240 5.9% 10%",
    "input": "240 5.9% 90%",
    "ring": "240 5.9% 10%",
    "grid": "240 10% 3.9% / 0.04",
    "grid-strong": "240 10% 3.9% / 0.07",
    "glass": "0 0% 100% / 0.8",
    "glass-border": "240 5.9% 90% / 0.8",
    // 📖 Code blocks: very light gray (github-light-ish) so the bundled
    // Shiki palette keeps WCAG-AA contrast. Inline code is a zinc pill.
    "code-bg": "240 6% 96%",
    "code-fg": "240 10% 12%",
    "code-inline-bg": "240 5% 94%",
    "code-inline-fg": "240 8% 18%",
    "code-block-border": "240 6% 88%"
  },
  dark: {
    ...sharedDark,
    "background": "240 10% 3.9%",
    "foreground": "0 0% 98%",
    "card": "240 7% 6%",
    "card-foreground": "0 0% 98%",
    "popover": "240 8% 7%",
    "popover-foreground": "0 0% 98%",
    "primary": "0 0% 98%",
    "primary-foreground": "240 5.9% 10%",
    "secondary": "240 3.7% 15.9%",
    "secondary-foreground": "0 0% 98%",
    "muted": "240 3.7% 15.9%",
    "muted-foreground": "240 5% 64.9%",
    "accent": "240 3.7% 15.9%",
    "accent-foreground": "0 0% 98%",
    "border": "240 3.7% 15.9%",
    "border-strong": "240 5% 26%",
    "border-focus": "240 4.9% 83.9%",
    "input": "240 3.7% 15.9%",
    "ring": "240 4.9% 83.9%",
    "grid": "0 0% 98% / 0.03",
    "grid-strong": "0 0% 98% / 0.06",
    "glass": "240 7% 6% / 0.8",
    "glass-border": "240 5% 16% / 0.8",
    // 📖 Code blocks: zinc-950 close to github-dark's #0d1117 so the dark
    // Shiki palette stays readable; inline code is a slightly lighter pill.
    "code-bg": "240 5% 8%",
    "code-fg": "0 0% 93%",
    "code-inline-bg": "240 4% 13%",
    "code-inline-fg": "240 8% 75%",
    "code-block-border": "240 4% 18%"
  }
};

// src/lib/themes/vercel.ts
var vercelTheme = {
  id: "vercel",
  name: "Vercel",
  author: "Kandown",
  description: "Black and white, mono display type, compact density. The Vercel high-contrast look.",
  appearance: { radius: "6px", borderWidth: "1px", shadows: "soft", density: "compact", glass: true, motion: "subtle" },
  fonts: { sans: "'Inter var', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace", mono: "'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace" },
  light: {
    ...sharedLight,
    "background": "0 0% 98%",
    "foreground": "0 0% 4%",
    "card": "0 0% 100%",
    "card-foreground": "0 0% 4%",
    "popover": "0 0% 100%",
    "popover-foreground": "0 0% 4%",
    "primary": "0 0% 4%",
    "primary-foreground": "0 0% 100%",
    "secondary": "0 0% 96%",
    "secondary-foreground": "0 0% 10%",
    "muted": "0 0% 96%",
    "muted-foreground": "0 0% 44%",
    "accent": "0 0% 93%",
    "accent-foreground": "0 0% 8%",
    "border": "0 0% 90%",
    "border-strong": "0 0% 78%",
    "border-focus": "0 0% 4%",
    "input": "0 0% 90%",
    "ring": "0 0% 4%",
    "grid": "0 0% 4% / 0.05",
    "grid-strong": "0 0% 4% / 0.09",
    "glass": "0 0% 100% / 0.8",
    "glass-border": "0 0% 90% / 0.8",
    "code-bg": "0 0% 95%",
    "code-fg": "0 0% 12%",
    "code-inline-bg": "0 0% 92%",
    "code-inline-fg": "0 0% 15%",
    "code-block-border": "0 0% 86%"
  },
  dark: {
    ...sharedDark,
    "background": "0 0% 4%",
    "foreground": "0 0% 98%",
    "card": "0 0% 6%",
    "card-foreground": "0 0% 98%",
    "popover": "0 0% 7%",
    "popover-foreground": "0 0% 98%",
    "primary": "0 0% 98%",
    "primary-foreground": "0 0% 4%",
    "secondary": "0 0% 13%",
    "secondary-foreground": "0 0% 96%",
    "muted": "0 0% 12%",
    "muted-foreground": "0 0% 58%",
    "accent": "0 0% 15%",
    "accent-foreground": "0 0% 96%",
    "border": "0 0% 14%",
    "border-strong": "0 0% 24%",
    "border-focus": "0 0% 90%",
    "input": "0 0% 14%",
    "ring": "0 0% 90%",
    "grid": "0 0% 100% / 0.03",
    "grid-strong": "0 0% 100% / 0.06",
    "glass": "0 0% 6% / 0.8",
    "glass-border": "0 0% 16% / 0.8",
    "code-bg": "0 0% 8%",
    "code-fg": "0 0% 92%",
    "code-inline-bg": "0 0% 14%",
    "code-inline-fg": "0 0% 80%",
    "code-block-border": "0 0% 18%"
  }
};

// src/lib/themes/linear.ts
var linearTheme = {
  id: "linear",
  name: "Linear",
  author: "Kandown",
  description: "Dark-first aesthetic, Plus Jakarta Sans, electric violet accent, sleek elevated popovers.",
  appearance: { radius: "8px", borderWidth: "1px", shadows: "elevated", density: "comfortable", glass: true, motion: "subtle", glassIntensity: 24, shadowCard: "0 1px 2px rgb(8 8 16 / 0.06), 0 4px 12px rgb(8 8 16 / 0.10)", shadowPopover: "0 12px 32px rgb(8 8 16 / 0.22)" },
  fonts: { sans: "'Plus Jakarta Sans', Outfit, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "'Plus Jakarta Sans', Outfit, -apple-system, BlinkMacSystemFont, sans-serif", mono: "'SF Mono', Menlo, Consolas, monospace" },
  light: {
    ...sharedLight,
    "background": "220 20% 98%",
    "foreground": "224 24% 12%",
    "card": "0 0% 100%",
    "card-foreground": "224 24% 12%",
    "popover": "0 0% 100%",
    "popover-foreground": "224 24% 12%",
    "primary": "235 59% 60%",
    "primary-foreground": "0 0% 100%",
    "secondary": "235 25% 95%",
    "secondary-foreground": "235 59% 30%",
    "muted": "220 16% 94%",
    "muted-foreground": "220 12% 42%",
    "accent": "235 45% 92%",
    "accent-foreground": "235 59% 35%",
    "border": "220 15% 88%",
    "border-strong": "220 15% 80%",
    "border-focus": "235 59% 60%",
    "input": "220 15% 90%",
    "ring": "235 59% 60%",
    "grid": "235 30% 12% / 0.04",
    "grid-strong": "235 30% 12% / 0.08",
    "glass": "0 0% 100% / 0.8",
    "glass-border": "220 15% 86% / 0.85",
    "code-bg": "220 14% 96%",
    "code-fg": "224 24% 12%",
    "code-inline-bg": "235 30% 92%",
    "code-inline-fg": "235 40% 30%",
    "code-block-border": "220 14% 88%"
  },
  dark: {
    ...sharedDark,
    "background": "210 11% 4%",
    "foreground": "210 14% 94%",
    "card": "216 7% 8%",
    "card-foreground": "210 14% 94%",
    "popover": "216 7% 8%",
    "popover-foreground": "210 14% 94%",
    "primary": "235 59% 60%",
    "primary-foreground": "0 0% 100%",
    "secondary": "218 9% 13%",
    "secondary-foreground": "210 14% 94%",
    "muted": "218 9% 11%",
    "muted-foreground": "215 8% 58%",
    "accent": "235 30% 15%",
    "accent-foreground": "210 14% 94%",
    "border": "225 9% 14%",
    "border-strong": "225 9% 20%",
    "border-focus": "235 59% 60%",
    "input": "225 9% 14%",
    "ring": "235 59% 60%",
    "grid": "0 0% 100% / 0.018",
    "grid-strong": "0 0% 100% / 0.04",
    "glass": "216 7% 8% / 0.78",
    "glass-border": "225 9% 18% / 0.85",
    "code-bg": "216 9% 10%",
    "code-fg": "210 14% 90%",
    "code-inline-bg": "235 25% 18%",
    "code-inline-fg": "235 60% 78%",
    "code-block-border": "225 9% 20%"
  }
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
var THEME_PRESETS = [shadcnTheme, vercelTheme, linearTheme, kandownTheme];

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
  if (typeof value !== "string") return "shadcn";
  const all = getAllThemes();
  const target = LEGACY_SKIN_MAP[value] ?? value;
  return all.some((t) => t.id === target) ? target : "shadcn";
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
  const destDir = join23(projectDir, ".kandown", "themes");
  mkdirSync11(destDir, { recursive: true });
  writeFileSync7(join23(destDir, `${theme.id}.json`), `${themeJson}
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
  const dir = join23(projectDir, ".kandown", "themes");
  if (!existsSync20(dir)) return [];
  const themes = [];
  const { readFileSync: readFileSync26, readdirSync: readdirSync13 } = __require("fs");
  for (const file of readdirSync13(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = readFileSync26(join23(dir, file), "utf8");
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
    const projectHtml = join26(kandownDir, "kandown.html");
    const distHtml = join26(PKG_ROOT, "dist", "index.html");
    if (!existsSync23(distHtml)) return false;
    if (!existsSync23(projectHtml)) {
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
    const raw = JSON.parse(readFileSync21(join26(kandownDir, "daemon.json"), "utf8"));
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
    const child = spawn7(process.execPath, ["-e", launcher, process.execPath, cliPath, ...args], {
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
    const latest = await new Promise((resolve12) => {
      const child = spawn7("npm", ["view", "kandown", "version"], {
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
      child.on("error", () => resolve12(null));
      child.on("close", (code) => {
        if (code !== 0) return resolve12(null);
        resolve12(stdout.trim().replace(/^"|"$/g, "") || null);
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
    const latest = await new Promise((resolve12) => {
      const child = spawn7("npm", ["view", "kandown", "version"], {
        timeout: 4e3,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
        detached: false
      });
      let stdout = "";
      child.stdout.on("data", (d) => {
        stdout += d;
      });
      child.on("error", () => resolve12(null));
      child.on("close", (code) => resolve12(code === 0 ? stdout.trim() : null));
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
      const boardPath = join26(tasksDir, "board.md");
      const text = existsSync23(boardPath) ? readFileSync21(boardPath, "utf8") : "";
      return writeText(res, 200, text);
    }
    if (method === "PUT") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const tasksDir = getTasksDir(kandownDir);
        if (!existsSync23(tasksDir)) mkdirSync13(tasksDir, { recursive: true });
        atomicWriteFileSync(join26(tasksDir, "board.md"), body);
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
    const instructionsPath = join26(kandownDir, "kandown_work.md");
    if (method === "GET") return writeText(res, 200, existsSync23(instructionsPath) ? readFileSync21(instructionsPath, "utf8") : "");
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
    const roles = new Set(Object.values(config.board.columnMeta).map((meta2) => meta2.role));
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
  if (path === "/api/agent/harnesses" && method === "GET") {
    return writeJson(res, 200, detectHarnessesJSON());
  }
  if (path === "/api/agent/sessions" && method === "GET") {
    return writeJson(res, 200, { sessions: listAgentSessions() });
  }
  if (path === "/api/agent/sessions" && method === "POST") {
    let body;
    try {
      body = JSON.parse(await readRequestBody(req));
    } catch (error) {
      return writeJson(res, 400, { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
    }
    if (typeof body.harnessId !== "string" || !body.harnessId.trim()) {
      return writeJson(res, 400, { error: "harnessId is required" });
    }
    const taskId = typeof body.taskId === "string" && body.taskId.trim() ? body.taskId.trim() : void 0;
    let compiled;
    try {
      compiled = compileProjectKandownWork(kandownDir, taskId);
    } catch {
      return writeJson(res, 404, { error: `Task not found: ${taskId}` });
    }
    const message = typeof body.message === "string" && body.message.trim() ? body.message.trim() : void 0;
    const prompt = message ? `${compiled.markdown}

---

${message}` : compiled.markdown;
    const config = loadConfig(kandownDir);
    const permissionMode = body.permissionMode === "accept-edits" || body.permissionMode === "yolo" ? body.permissionMode : config.agent.permissionMode;
    const projectRoot = getProjectRoot(kandownDir);
    try {
      const session = createAgentSession({
        harnessId: body.harnessId.trim(),
        projectRoot,
        prompt,
        permissionMode,
        ...typeof body.resumeSessionId === "string" && body.resumeSessionId ? { resumeSessionId: body.resumeSessionId } : {}
      });
      const titleOverride = typeof body.title === "string" && body.title.trim() ? body.title.trim() : void 0;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const indexEntry = {
        id: session.id,
        harnessId: session.harnessId,
        title: titleOverride ?? indexEntryForPrompt(message ?? compiled.markdown),
        ...taskId ? { taskId } : {},
        createdAt: now,
        updatedAt: now
      };
      upsertSessionIndexEntry(projectRoot, indexEntry);
      let unsubscribeIndex = null;
      let sawStopped = false;
      unsubscribeIndex = subscribeAgentSession(session.id, (event) => {
        if (event.type === "session_started" && event.harnessSessionId) {
          patchSessionIndexEntry(projectRoot, session.id, { harnessSessionId: event.harnessSessionId });
        } else if (event.type === "stopped" && !sawStopped) {
          sawStopped = true;
          patchSessionIndexEntry(projectRoot, session.id, { updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
          unsubscribeIndex?.();
        }
      });
      return writeJson(res, 201, { session });
    } catch (error) {
      return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (path === "/api/agent/sessions-index" && method === "GET") {
    return writeJson(res, 200, { sessions: listSessionIndexEntries(getProjectRoot(kandownDir)) });
  }
  if (path.startsWith("/api/agent/sessions-index/") && method === "DELETE") {
    let entryId;
    try {
      entryId = decodeURIComponent(path.slice("/api/agent/sessions-index/".length).split("?")[0] ?? "");
    } catch {
      return writeJson(res, 400, { error: "Invalid session id" });
    }
    const projectRoot = getProjectRoot(kandownDir);
    const known = listSessionIndexEntries(projectRoot).some((entry) => entry.id === entryId);
    if (!known) return writeJson(res, 404, { error: "Session not found" });
    forgetSessionIndexEntry(projectRoot, entryId);
    return writeJson(res, 200, { ok: true });
  }
  const agentSessionMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)(\/events|\/stop|\/send)?$/);
  if (agentSessionMatch) {
    const sessionId = decodeURIComponent(agentSessionMatch[1]);
    const sub = agentSessionMatch[2];
    if (!sub && method === "GET") {
      const session = listAgentSessions().find((entry) => entry.id === sessionId);
      return session ? writeJson(res, 200, { session }) : writeJson(res, 404, { error: "Session not found" });
    }
    if (sub === "/events" && method === "GET") {
      const unsubscribe = subscribeAgentSession(sessionId, (event) => {
        res.write(`data: ${JSON.stringify(event)}

`);
      });
      if (!unsubscribe) return writeJson(res, 404, { error: "Session not found" });
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        ...corsHeaders(localPort(res))
      });
      res.write("retry: 2000\n\n");
      req.on("close", unsubscribe);
      return;
    }
    if (sub === "/stop" && method === "POST") {
      const stopped = stopAgentSession(sessionId);
      if (stopped) patchSessionIndexEntry(getProjectRoot(kandownDir), sessionId, { updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
      return stopped ? writeJson(res, 200, { ok: true }) : writeJson(res, 404, { error: "Session not found" });
    }
    if (sub === "/send" && method === "POST") {
      let body;
      try {
        body = JSON.parse(await readRequestBody(req));
      } catch (error) {
        return writeJson(res, 400, { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
      }
      if (typeof body.message !== "string" || !body.message.trim()) {
        return writeJson(res, 400, { error: "message is required" });
      }
      const result = sendToSession(sessionId, body.message);
      return result.ok ? writeJson(res, 200, { ok: true }) : writeJson(res, 400, { ok: false, error: result.error ?? "Send failed" });
    }
  }
  if (path === "/api/extensions" && method === "GET") {
    const host = await getExtensionHost(kandownDir);
    const badges = await host.renderBadges();
    return writeJson(res, 200, { extensions: host.installedSummary(), badges });
  }
  if (path === "/api/extensions/reload" && method === "POST") {
    extensionHost = null;
    extensionHostDir = null;
    await getExtensionHost(kandownDir);
    broadcastSseEvent({ type: "extensions" });
    return writeJson(res, 200, { ok: true });
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
      const file = join26(ext.dir, rel);
      if (!existsSync23(file)) return writeText(res, 404, "File not found");
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
    const { unlinkSync: unlinkSync9, existsSync: existsSync32 } = await import("fs");
    const { join: join39 } = await import("path");
    const file = join39(getProjectRoot(kandownDir), ".kandown", "themes", `${rawId}.json`);
    if (!existsSync32(file)) return writeJson(res, 404, { error: "Theme not installed" });
    try {
      unlinkSync9(file);
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
  if (path.startsWith("/api/tasks/") && path.endsWith("/agent") && method === "POST") {
    const taskId = decodeURIComponent(path.slice("/api/tasks/".length, -"/agent".length));
    if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) return writeText(res, 400, "Invalid task id");
    const taskPath = findTaskPath(kandownDir, taskId);
    if (!taskPath) return writeText(res, 404, "Task not found");
    const hookUrl = process.env.KANDOWN_AGENT_HOOK_URL?.trim();
    if (!hookUrl) {
      return writeJson(res, 400, { ok: false, error: "No agent hook is configured on this daemon (KANDOWN_AGENT_HOOK_URL is not set)." });
    }
    const content = readFileSync21(taskPath, "utf8");
    const parsed = parseTaskFile(content);
    const fm = parsed.frontmatter;
    const payload = {
      id: taskId,
      title: typeof fm.title === "string" ? fm.title : taskId,
      status: typeof fm.status === "string" ? fm.status : null,
      priority: typeof fm.priority === "string" ? fm.priority : null,
      assignee: typeof fm.assignee === "string" ? fm.assignee : null,
      content,
      kandownDir
    };
    try {
      const hookResponse = await fetch(hookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(2e4)
      });
      const raw = await hookResponse.text();
      let forwarded = null;
      try {
        forwarded = raw === "" ? null : JSON.parse(raw);
      } catch {
        forwarded = raw;
      }
      if (!hookResponse.ok) {
        const message = forwarded !== null && typeof forwarded === "object" && "error" in forwarded ? String(forwarded.error) : raw.slice(0, 500);
        return writeJson(res, 502, { ok: false, error: message || `Agent hook responded ${hookResponse.status}` });
      }
      return writeJson(res, 200, typeof forwarded === "object" && forwarded !== null ? { ok: true, ...forwarded } : { ok: true, forwarded: raw });
    } catch (error) {
      return writeJson(res, 502, { ok: false, error: `Agent hook unreachable: ${error instanceof Error ? error.message : String(error)}` });
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
    const archiveDir = join26(tasksDir, "archive");
    const resolveIn = (directory) => {
      const match = resolveTaskFilename(taskId, listTaskFilenames(directory));
      return match ? join26(directory, match.filename) : null;
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
      const destination = existingDestination ?? join26(destinationDir, basename7(source));
      try {
        if (!existsSync23(tasksDir)) mkdirSync13(tasksDir, { recursive: true });
        if (!existsSync23(archiveDir)) mkdirSync13(archiveDir, { recursive: true });
        const body = await readRequestBody(req);
        atomicWriteFileSync(destination, body);
        if (source && source !== destination && existsSync23(source)) unlinkSync8(source);
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
        if (!existsSync23(tasksDir)) mkdirSync13(tasksDir, { recursive: true });
        const body = await readRequestBody(req);
        const { path: taskPath } = writeTaskContent(kandownDir, taskId, body, { useGit: false });
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
        if (activePath && existsSync23(activePath)) unlinkSync8(activePath);
        if (archivedPath && existsSync23(archivedPath)) unlinkSync8(archivedPath);
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
  const htmlPath = join26(kandownDir, "kandown.html");
  if (existsSync23(htmlPath)) {
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
    const metadataPath2 = join27(kandownDir, "daemon.json");
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
import { execSync as execSync2, spawn as spawn8 } from "child_process";
import { writeFileSync as writeFileSync8 } from "fs";
import { join as join28 } from "path";
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
  const contextFile = join28(tmpdir(), `kandown-${taskId}-context.md`);
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
  return new Promise((resolve12, reject) => {
    const child = spawn8(binary, args, { stdio: "inherit", env: launchEnv(contextFile, taskId, kandownDir) });
    child.on("error", (e) => {
      rollbackTaskStatus(kandownDir, taskId, originalStatus);
      reject(new Error(`Failed to launch ${agentName}: ${e.message}`));
    });
    child.on("exit", (code) => {
      resolve12({ exitCode: code ?? 0 });
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
import { existsSync as existsSync24 } from "fs";
import { join as join29 } from "path";
function cmdAgents(rawArgs) {
  const args = parseArgs(rawArgs);
  const kandownDir = resolveKandownDir(args.path, process.cwd());
  const sub = args.positional[0];
  if (sub === "init") {
    const target = join29(kandownDir, "agents.json");
    if (existsSync24(target)) {
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
  const agentsFile = join29(kandownDir, "agents.json");
  log("");
  log(`${c.bold}Agent catalog${c.reset} ${c.dim}(${installed.length}/${catalog.length} installed)${c.reset}`);
  log(`${c.dim}catalog: ${existsSync24(agentsFile) ? agentsFile : "built-in defaults (run `kandown agents init` to commit one)"}${c.reset}`);
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

// src/cli/lib/plugin-cli.ts
import { spawn as spawn9 } from "child_process";
import { existsSync as existsSync29, readFileSync as readFileSync24 } from "fs";
import { basename as basename13, join as join36 } from "path";

// src/lib/extensions/agent-brief.ts
var EXTENSION_AGENT_BRIEF = "# Kandown plugin brief (for coding agents)\n\n<!-- Generated by scripts/build-extension-brief.js from src/lib/extensions/types.ts.\n     Do not edit by hand: run `pnpm extension-brief`. -->\n\nYou are writing a **kandown plugin**. This document is the complete contract.\nEverything below is extracted from the shipped type definitions, so it matches\nthe runtime you will be loaded into. Read it once, write the code, then run the\nloop at the bottom until it is green.\n\n## 1. What a plugin is\n\nA directory under `.kandown/extensions/<id>/` containing:\n\n| File | Required | Purpose |\n|---|---|---|\n| `manifest.json` | yes | identity, permissions, display hints |\n| `index.ts` | yes | the Node entry, loaded with jiti (no build step in dev) |\n| `index.js` | to ship | bundled entry, the only thing the browser can execute |\n| `web.tsx` / `web.js` | panels only | the panel module, bundled the same way |\n| `README.md` | no | human documentation |\n\n`index.ts` default-exports a factory. It is called once at load, it registers\ncontributions, and it must not do slow or throwing work at module scope.\n\n```typescript\nimport type { KandownExtensionAPI } from 'kandown';\n\nexport default function (kd: KandownExtensionAPI) {\n  // register here\n}\n```\n\n## 2. The API you are handed\n\n```typescript\nexport interface KandownExtensionAPI {\n  readonly id: string;\n  contributeField(def: FieldContribution): void;\n  contributeWebPanel(def: WebPanelContribution): void;\n  contributeCommand(name: string, def: CommandContribution): void;\n  contributeGate(def: GateContribution): void;\n  contributeSync(def: SyncContribution): void;\n  on(event: 'task:afterCreate' | 'task:afterMove' | 'task:afterArchive' | 'board:load', handler: LifecycleHandler): void;\n}\n```\n\nContribution shapes, verbatim:\n\n```typescript\nexport interface FieldContribution {\n  key: string;\n  label: string;\n  type: FieldType;\n  options?: { value: string; label: string }[];\n  badge?: (value: unknown, task: TaskLike) => string | null;\n  editorComponentId?: string;\n}\n\nexport interface WebPanelContribution {\n  id: string;\n  title: string;\n  entry: string;\n  icon?: string;\n}\n\nexport interface CommandContribution {\n  name: string;\n  description?: string;\n  handler: (args: string, ctx: ExtensionCommandContext) => void | Promise<void>;\n}\n\nexport interface GateContribution {\n  id?: string;\n  on: 'task:beforeMove' | 'task:beforeCreate' | 'task:beforeArchive' | 'task:beforeDelete';\n  to?: string;\n  handler: (event: GateEvent, ctx: ExtensionContext) => void | Promise<void | GateVerdict>;\n}\n\nexport interface SyncContribution {\n  id?: string;\n  on: 'task:afterMove' | 'task:afterCreate' | 'task:afterArchive';\n  to?: string;\n  handler: (event: TaskEvent, ctx: ExtensionContext) => void | Promise<void>;\n}\n\nexport interface GateVerdict {\n  block?: boolean;\n  reason?: string;\n}\n```\n\n## 3. The context handlers receive\n\n```typescript\nexport interface ExtensionContext {\n  extId: string;\n  signal?: AbortSignal;\n  board: {\n    readAll(): Promise<TaskLike[]>;\n    read(taskId: string): Promise<TaskLike | null>;\n  };\n  setField(taskId: string, key: string, value: unknown): Promise<void>;\n  log: {\n    info(msg: string): void;\n    warn(msg: string): void;\n    error(msg: string): void;\n  };\n  fetch?: typeof fetch;\n}\n\nexport interface TaskLike {\n  id: string;\n  frontmatter: Record<string, unknown>;\n  plugins?: Record<string, unknown>;\n}\n```\n\n`ctx.fetch` is present **only** when a `net:` permission is declared. `ctx.board`\nthrows without `read:tasks`. `ctx.setField` throws without\n`write:field:plugins.<id>.<key>` (a trailing `*` covers every key).\n\n## 4. Events\n\n| Kind | Names | Semantics |\n|---|---|---|\n| Gates (`contributeGate`) | `task:beforeMove`, `task:beforeCreate`, `task:beforeArchive`, `task:beforeDelete` | may veto by returning `{ block: true, reason }`; a throw is treated as no objection |\n| Syncs (`contributeSync`) | `task:afterMove`, `task:afterCreate`, `task:afterArchive` | fire and forget, after the file is written |\n| Lifecycle (`kd.on`) | `task:afterCreate`, `task:afterMove`, `task:afterArchive`, `board:load` | observation only, never blocks |\n\nBoth gates and syncs accept an optional `to` to restrict them to one target\ncolumn. A move is allowed only when **every** gate abstains or permits.\n\n## 5. Field types\n\n`string`, `number`, `boolean`, `date`, `select`. Scalars are persisted as strings and coerced back on read,\nso a `number` field reads back as a number. A `select` field must declare\n`options: [{ value, label }]`, and a value outside that list is rejected.\n\n## 6. Where your data lives\n\nOnly under `plugins.<id>.*` in the task frontmatter, opaque to the core:\n\n```yaml\n---\ntitle: Ship the thing\nstatus: Done\nplugins:\n  my-plugin:\n    points: 5\n---\n```\n\nRead it from `event.task.plugins`, write it with `ctx.setField(taskId, key, value)`.\n**Never** write a core field (`title`, `status`, `depends_on`, `created`, ...),\nnever write a second file, never call the serializer.\n\n## 7. Permissions\n\n| Declare | Unlocks |\n|---|---|\n| `read:tasks` | `ctx.board.readAll()`, `ctx.board.read(id)` |\n| `write:field:plugins.<id>.*` | `ctx.setField(...)` for your namespace |\n| `net:*` or `net:<url-prefix>` | `ctx.fetch` |\n| `*` | everything, avoid it |\n\nUndeclared calls throw at runtime. Declare exactly what you use, nothing more:\n`kandown plugin check` reports both missing and unused permissions.\n\n## 8. Web panels\n\nDeclare the panel in `index.ts`, implement it in `web.tsx`:\n\n```typescript\nkd.contributeWebPanel({ id: 'chart', title: 'Burndown', entry: './web.js' });\n```\n\n```javascript\nfunction Chart({ task, api, ui }) {\n  const [tasks, setTasks] = ui.useState([]);\n  ui.useEffect(() => { void api.readAllTasks().then(setTasks); }, [api]);\n  return ui.createElement('div', null, tasks.length + ' tasks');\n}\n\nexport const panels = { chart: Chart };\n```\n\nHard rules for panel modules:\n\n- **Never import React.** The host React runtime arrives as the `ui` prop\n  (`ui.createElement`, `ui.useState`, `ui.useEffect`, `ui.Fragment`). A second\n  React copy in the bundle breaks hooks.\n- The module must be self-contained: it is imported through a Blob URL and\n  cannot resolve sibling files. `kandown plugin build` bundles it for you.\n- Props are exactly `{ task, api, ui }` where `api` is\n  `{ readField(key), readAllTasks(), setField(key, value), refresh() }`.\n- Three consecutive render failures quarantine the plugin.\n\n## 9. The build and verify loop\n\n```bash\nkandown plugin build <id>          # index.ts -> index.js, web.tsx -> web.js\nkandown plugin check <id> --json   # structured verdict, exit code 1 on failure\nkandown plugin enable <id>         # trust + enable\nkandown plugin dev <id>            # watch: rebuild, recheck, hot reload the web UI\n```\n\n`check --json` returns `{ ok, id, checks: [{ id, status, message, fix }] }`.\nRead `fix` on any failing check, apply it, run again. Do not stop until `ok`\nis `true`.\n\n## 10. Failure table\n\n| Symptom from `plugin check` | Fix |\n|---|---|\n| `manifest` invalid id | id must match `^[a-z][a-z0-9-]{0,63}$` |\n| `entry` default export is not a function | export the factory as `export default function (kd) {}` |\n| `permissions` missing | add the exact permission string the check names to `manifest.json` |\n| `bundle` missing index.js | run `kandown plugin build <id>` |\n| `panel` module exports nothing | export `panels` (a map) or a `default` component |\n| `panel` imports react | drop the import, use the `ui` prop |\n| `namespace` write outside plugins.\\<id\\> | only `ctx.setField` may write, and only your own keys |\n| `roundtrip` frontmatter drift | store plain JSON values, no class instances, no `undefined` |\n| quarantined | fix the throw, then `kandown plugin enable <id>` clears the counter |\n\n## 11. Style rules for this codebase\n\n- Never use an em dash or an en dash in any string, comment or document you write.\n- Comment the why, not the what, and open explanatory comments with `\u{1F4D6}`.\n- Keep the factory synchronous unless you genuinely need to await something.\n- Handle your own errors: a throw inside a gate is silently fail-open, which\n  hides bugs. Log with `ctx.log.warn` instead of throwing.\n";

// src/cli/lib/plugin-build.ts
import { existsSync as existsSync25, readdirSync as readdirSync11, readFileSync as readFileSync22 } from "fs";
import { basename as basename8, extname as extname2, join as join30 } from "path";
var SOURCE_EXTENSIONS = [".ts", ".tsx", ".jsx", ".mts"];
function findSource(dir, stem) {
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = join30(dir, `${stem}${extension}`);
    if (existsSync25(candidate)) return candidate;
  }
  return null;
}
function discoverEntries(dir) {
  const entries = [];
  const index = findSource(dir, "index");
  if (index) entries.push({ stem: "index", source: index });
  let names = [];
  try {
    names = readdirSync11(dir);
  } catch {
    return entries;
  }
  for (const name of names.sort()) {
    const extension = extname2(name);
    if (!SOURCE_EXTENSIONS.includes(extension)) continue;
    const stem = basename8(name, extension);
    if (!stem.startsWith("web")) continue;
    if (entries.some((entry) => entry.stem === stem)) continue;
    entries.push({ stem, source: join30(dir, name) });
  }
  return entries;
}
async function loadEsbuild() {
  try {
    return await import("esbuild");
  } catch {
    return null;
  }
}
async function buildPlugin(dir) {
  const result = { ok: true, outputs: [], errors: [], warnings: [] };
  const entries = discoverEntries(dir);
  if (entries.length === 0) {
    return { ...result, ok: false, errors: ["no TypeScript entry found (expected index.ts or web.tsx)"] };
  }
  const esbuild = await loadEsbuild();
  if (!esbuild) {
    return {
      ...result,
      ok: false,
      errors: ['esbuild is unavailable; reinstall kandown or run "npm install esbuild" in this project']
    };
  }
  for (const entry of entries) {
    const out = join30(dir, `${entry.stem}.js`);
    try {
      const built = await esbuild.build({
        entryPoints: [entry.source],
        outfile: out,
        bundle: true,
        format: "esm",
        platform: "neutral",
        target: "es2022",
        // 📖 `neutral` keeps the output browser-safe; these stay external so a
        // Node-flavoured plugin still compiles and a panel never ships React.
        external: ["react", "react-dom", "react/jsx-runtime", "kandown", "node:*"],
        jsx: "automatic",
        legalComments: "none",
        logLevel: "silent",
        write: true
      });
      for (const warning of built.warnings) result.warnings.push(`${entry.stem}: ${warning.text}`);
      const source = readFileSync22(out, "utf8");
      if (/from\s*["']react(?:-dom|\/jsx-runtime)?["']/.test(source)) {
        result.errors.push(
          `${entry.stem}: bundle imports react; panels must use the "ui" prop instead of importing React`
        );
        result.ok = false;
      }
      result.outputs.push({ entry: entry.source, out, bytes: Buffer.byteLength(source) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${entry.stem}: ${message.replace(/\n+/g, " ").trim()}`);
      result.ok = false;
    }
  }
  return result;
}

// src/cli/lib/plugin-check.ts
import { existsSync as existsSync26, readFileSync as readFileSync23, statSync as statSync7 } from "fs";
import { basename as basename9, extname as extname3, join as join31 } from "path";
init_parser();
init_serializer();
init_updater();
init_config2();
init_cli_shared();
function syntheticTasks() {
  const make = (id, title2, status) => ({
    id,
    frontmatter: { id, title: title2, status, created: "2026-01-01", priority: "P2" },
    plugins: void 0
  });
  return [
    make("check-1", "Synthetic backlog task", "Backlog"),
    make("check-2", "Synthetic active task", "In Progress"),
    make("check-3", "Synthetic finished task", "Done")
  ];
}
function stubUi() {
  const noop = () => void 0;
  return {
    createElement: (type, props, ...children) => ({ type, props, children }),
    Fragment: /* @__PURE__ */ Symbol("Fragment"),
    useState: (initial) => [typeof initial === "function" ? initial() : initial, noop],
    // 📖 Effects run so a panel that explodes on mount is caught, but their
    // async results are dropped: the checker asserts "does not throw", not
    // "renders the right numbers".
    useEffect: (effect) => {
      try {
        effect();
      } catch {
      }
    },
    useLayoutEffect: (effect) => {
      try {
        effect();
      } catch {
      }
    },
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
    useRef: (initial) => ({ current: initial }),
    useReducer: (_reducer, initial) => [initial, noop],
    useId: () => "check-id",
    memo: (component) => component
  };
}
function check(id, status, message, fix) {
  return fix ? { id, status, message, fix } : { id, status, message };
}
function newestMtime(paths) {
  let newest = 0;
  for (const path of paths) {
    try {
      newest = Math.max(newest, statSync7(path).mtimeMs);
    } catch {
    }
  }
  return newest;
}
function scanPermissionUsage(source) {
  const usesRead = /\.board\s*\.\s*(readAll|read)\s*\(/.test(source);
  const usesWrite = /\.setField\s*\(/.test(source);
  const usesFetch = /\.fetch\s*(\?\.)?\s*\(/.test(source);
  const needs = [];
  if (usesRead) needs.push("read:tasks");
  if (usesFetch) needs.push("net:*");
  return { needs, uses: { read: usesRead, write: usesWrite, fetch: usesFetch } };
}
async function checkPlugin(kandownDir, projectDir, id) {
  const checks = [];
  const discovered = discoverExtensions(projectDir);
  const found = discovered.find((entry) => entry.manifestResult.ok ? entry.manifestResult.manifest.id === id : basename9(entry.dir) === id);
  if (!found) {
    return {
      ok: false,
      id,
      dir: null,
      checks: [check(
        "discovery",
        "fail",
        `no plugin "${id}" found under .kandown/extensions/ or ~/.kandown/extensions/`,
        `Create it with "kandown plugin create ${id}", or check the directory name.`
      )]
    };
  }
  const dir = found.dir;
  if (!found.manifestResult.ok) {
    return {
      ok: false,
      id,
      dir,
      checks: [check(
        "manifest",
        "fail",
        found.manifestResult.error,
        "Fix manifest.json. Required: id (kebab-case), name, version, apiVersion (1)."
      )]
    };
  }
  const manifest = found.manifestResult.manifest;
  checks.push(check("manifest", "pass", `manifest.json is valid (v${manifest.version}, apiVersion ${manifest.apiVersion})`));
  if (basename9(dir) !== manifest.id) {
    checks.push(check(
      "manifest-dir",
      "warn",
      `directory is "${basename9(dir)}" but the manifest id is "${manifest.id}"`,
      `Rename the directory to "${manifest.id}" so install and purge target the same namespace.`
    ));
  }
  const tasks = syntheticTasks();
  const writes = [];
  const logs = [];
  const env = {
    projectDir,
    kandownVersion: getCurrentVersion(),
    config: loadConfig(kandownDir),
    readAll: async () => tasks,
    read: async (taskId) => tasks.find((task) => task.id === taskId) ?? null,
    applyField: async (taskId, extId, key, value) => {
      if (extId !== manifest.id) throw new Error(`refused a write to plugins.${extId}.*`);
      writes.push({ taskId, key, value });
    },
    log: {
      info: (message) => logs.push(message),
      warn: (message) => logs.push(`[warn] ${message}`),
      error: (message) => logs.push(`[error] ${message}`)
    }
  };
  const host = new ExtensionHost(env);
  await host.loadAll({ only: manifest.id, inspect: true });
  const loaded2 = host.get(manifest.id);
  if (!loaded2 || loaded2.health !== "enabled") {
    checks.push(check(
      "entry",
      "fail",
      loaded2?.error ?? "the plugin did not load",
      "The default export of index.ts must be a function receiving the kd API, and must not throw while registering."
    ));
    return { ok: false, id: manifest.id, dir, checks };
  }
  checks.push(check("entry", "pass", "index loaded and the factory ran"));
  const summary = host.installedSummary().find((entry) => entry.id === manifest.id);
  const counts = {
    fields: summary?.fields.length ?? 0,
    panels: summary?.panels.length ?? 0,
    commands: summary?.commands.length ?? 0,
    gates: summary?.gates ?? 0,
    syncs: summary?.syncs ?? 0
  };
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    checks.push(check(
      "contributions",
      "fail",
      "the factory registered nothing",
      "Call at least one of contributeField, contributeWebPanel, contributeCommand, contributeGate or contributeSync."
    ));
  } else {
    checks.push(check(
      "contributions",
      "pass",
      `${counts.fields} field(s), ${counts.panels} panel(s), ${counts.commands} command(s), ${counts.gates} gate(s), ${counts.syncs} sync(s)`
    ));
  }
  const sources = ["index.ts", "index.tsx", "index.js", "index.mjs"].map((name) => join31(dir, name)).filter((path) => existsSync26(path));
  const sourceText = sources.map((path) => readFileSync23(path, "utf8")).join("\n");
  const declared = manifest.permissions ?? [];
  const usage = scanPermissionUsage(sourceText);
  const missing = [];
  for (const permission of usage.needs) {
    if (!isAllowed(declared, permission)) missing.push(permission);
  }
  const needsWrite = usage.uses.write || counts.fields > 0;
  if (needsWrite && !declared.some((entry) => entry === "*" || entry.startsWith(`write:field:plugins.${manifest.id}.`))) {
    missing.push(`write:field:plugins.${manifest.id}.*`);
  }
  const unused = declared.filter((permission) => {
    if (permission === "*") return false;
    if (permission === "read:tasks") return !usage.uses.read;
    if (permission.startsWith("net:")) return !usage.uses.fetch;
    if (permission.startsWith("write:field:")) return !needsWrite;
    return false;
  });
  if (missing.length > 0) {
    checks.push(check(
      "permissions",
      "fail",
      `code calls capabilities the manifest does not declare: ${missing.join(", ")}`,
      `Add ${JSON.stringify(missing)} to "permissions" in manifest.json.`
    ));
  } else if (unused.length > 0) {
    checks.push(check(
      "permissions",
      "warn",
      `declared but never used: ${unused.join(", ")}`,
      `Remove ${JSON.stringify(unused)} from "permissions"; an over-broad declaration makes the model meaningless.`
    ));
  } else if (declared.includes("*")) {
    checks.push(check(
      "permissions",
      "warn",
      'the manifest declares "*"',
      'Replace "*" with the exact permissions used: read:tasks, write:field:plugins.<id>.*, net:*.'
    ));
  } else {
    checks.push(check("permissions", "pass", declared.length > 0 ? `declares ${declared.join(", ")}` : "needs no permission"));
  }
  const bundleTargets = [{ stem: "index", sources: sources.filter((path) => extname3(path) === ".ts" || extname3(path) === ".tsx") }];
  for (const panel of summary?.panels ?? []) {
    const stem = basename9(panel.entry.replace(/^\.\//, ""), ".js");
    if (bundleTargets.some((target) => target.stem === stem)) continue;
    bundleTargets.push({
      stem,
      sources: [".tsx", ".ts", ".jsx"].map((extension) => join31(dir, `${stem}${extension}`)).filter((path) => existsSync26(path))
    });
  }
  const staleBundles = [];
  const missingBundles = [];
  for (const target of bundleTargets) {
    const out = join31(dir, `${target.stem}.js`);
    if (!existsSync26(out)) {
      if (target.sources.length > 0 || target.stem !== "index") missingBundles.push(`${target.stem}.js`);
      continue;
    }
    if (target.sources.length > 0 && statSync7(out).mtimeMs < newestMtime(target.sources)) {
      staleBundles.push(`${target.stem}.js`);
    }
  }
  if (missingBundles.length > 0) {
    checks.push(check(
      "bundle",
      "fail",
      `missing browser bundle(s): ${missingBundles.join(", ")}`,
      `Run "kandown plugin build ${manifest.id}". The web UI can only execute bundled JavaScript.`
    ));
  } else if (staleBundles.length > 0) {
    checks.push(check(
      "bundle",
      "warn",
      `bundle(s) older than their source: ${staleBundles.join(", ")}`,
      `Run "kandown plugin build ${manifest.id}" so the browser sees your latest changes.`
    ));
  } else {
    checks.push(check("bundle", "pass", bundleTargets.length > 0 ? "browser bundles are present and current" : "nothing to bundle"));
  }
  if ((summary?.panels.length ?? 0) === 0) {
    checks.push(check("panel", "skip", "no web panel declared"));
  } else {
    for (const panel of summary?.panels ?? []) {
      const entry = panel.entry.replace(/^\.\//, "");
      const out = join31(dir, entry);
      if (!existsSync26(out)) {
        checks.push(check(
          `panel:${panel.id}`,
          "fail",
          `declared entry ${panel.entry} does not exist`,
          `Run "kandown plugin build ${manifest.id}", or point entry at the bundle it produces.`
        ));
        continue;
      }
      const source = readFileSync23(out, "utf8");
      if (/from\s*["']react["']/.test(source)) {
        checks.push(check(
          `panel:${panel.id}`,
          "fail",
          "the panel bundle imports react",
          'Delete the React import and use the "ui" prop (ui.createElement, ui.useState, ui.useEffect).'
        ));
        continue;
      }
      try {
        const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
        const component = module.panels?.[panel.id] ?? module.default;
        if (typeof component !== "function") {
          checks.push(check(
            `panel:${panel.id}`,
            "fail",
            `the module exports no component for panel "${panel.id}"`,
            `Export it as "export const panels = { ${panel.id}: Component }" or as the default export.`
          ));
          continue;
        }
        component({
          task: tasks[0],
          api: {
            readField: () => void 0,
            readAllTasks: async () => tasks,
            setField: async () => void 0,
            refresh: async () => void 0
          },
          ui: stubUi()
        });
        checks.push(check(`panel:${panel.id}`, "pass", "panel module renders once without throwing"));
      } catch (error) {
        checks.push(check(
          `panel:${panel.id}`,
          "fail",
          `panel failed to load or render: ${error instanceof Error ? error.message : String(error)}`,
          "Keep the module self-contained and side-effect free at import time; three render failures quarantine the plugin."
        ));
      }
    }
  }
  if (counts.gates === 0 && counts.syncs === 0 && counts.commands === 0) {
    checks.push(check("runtime", "skip", "no gate, sync or command to exercise"));
  } else {
    const failuresBefore = host.get(manifest.id)?.failures ?? 0;
    for (const task of tasks) {
      for (const to of ["Todo", "In Progress", "Done"]) {
        await host.runGates({ type: "task:beforeMove", task, from: String(task.frontmatter.status ?? ""), to });
      }
    }
    for (const task of tasks) {
      host.dispatchSync({ type: "task:afterMove", task, from: "In Progress", to: "Done" });
      host.dispatchLifecycle({ type: "task:afterMove", task, from: "In Progress", to: "Done" });
    }
    const commandErrors = [];
    for (const name of summary?.commands ?? []) {
      try {
        await host.runCommand(name, "");
      } catch (error) {
        commandErrors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await new Promise((resolve12) => setTimeout(resolve12, 25));
    const after = host.get(manifest.id);
    const newFailures = (after?.failures ?? 0) - failuresBefore;
    if (commandErrors.length > 0) {
      const denied = commandErrors.map((entry) => /permission denied: (\S+)/.exec(entry)?.[1]).filter((permission) => Boolean(permission));
      checks.push(check(
        "runtime",
        "fail",
        `contributed command threw: ${commandErrors.join("; ")}`,
        denied.length > 0 ? `Declare ${JSON.stringify([...new Set(denied)])} in "permissions" in manifest.json.` : "Handle your own errors inside the command handler and report them with ctx.log.error."
      ));
    } else if (newFailures > 0 || after?.health === "quarantined") {
      checks.push(check(
        "runtime",
        "fail",
        `${newFailures} handler failure(s) against a synthetic board: ${after?.error ?? "see logs"}`,
        "A throwing gate fails open and a throwing sync is swallowed. Guard your handlers and log with ctx.log.warn."
      ));
    } else {
      checks.push(check(
        "runtime",
        "pass",
        `gates, syncs and commands ran clean on 3 synthetic tasks (${writes.length} field write(s))`
      ));
    }
  }
  if (writes.length === 0) {
    checks.push(check("roundtrip", "skip", "the plugin wrote no field during the run"));
  } else {
    const problems = [];
    for (const write of writes) {
      const frontmatter = setField({ id: "check-1", title: "Round trip", status: "Todo" }, manifest.id, write.key, write.value);
      const reparsed = parseTaskFile(serializeTaskFile(frontmatter, "body")).frontmatter;
      const namespace = reparsed.plugins?.[manifest.id];
      if (!namespace || !(write.key in namespace)) {
        problems.push(`${write.key} disappeared through the serializer`);
        continue;
      }
      if (String(namespace[write.key]) !== String(write.value)) {
        problems.push(`${write.key}: wrote ${JSON.stringify(write.value)}, read back ${JSON.stringify(namespace[write.key])}`);
      }
    }
    if (problems.length > 0) {
      checks.push(check(
        "roundtrip",
        "fail",
        problems.join("; "),
        "Store plain JSON scalars or plain objects under plugins.<id>.*; class instances, undefined and functions do not survive the file."
      ));
    } else {
      checks.push(check("roundtrip", "pass", `${writes.length} field write(s) survive the frontmatter round-trip`));
    }
  }
  return {
    ok: checks.every((entry) => entry.status !== "fail"),
    id: manifest.id,
    dir,
    checks
  };
}
var MARK = {
  pass: `${c.green}\u2713${c.reset}`,
  fail: `${c.red}\u2717${c.reset}`,
  warn: `${c.yellow}!${c.reset}`,
  skip: `${c.dim}-${c.reset}`
};
function formatCheckReport(report) {
  const lines = [];
  for (const entry of report.checks) {
    lines.push(`${MARK[entry.status]} ${c.bold}${entry.id.padEnd(14)}${c.reset} ${entry.message}`);
    if (entry.fix) lines.push(`  ${c.dim}\u21B3 fix: ${entry.fix}${c.reset}`);
  }
  const failed = report.checks.filter((entry) => entry.status === "fail").length;
  const warned = report.checks.filter((entry) => entry.status === "warn").length;
  lines.push("");
  lines.push(report.ok ? `${c.green}${report.id} passes${c.reset}${warned > 0 ? ` ${c.dim}(${warned} warning(s))${c.reset}` : ""}` : `${c.red}${report.id} fails ${failed} check(s)${c.reset}`);
  return lines.join("\n");
}

// node_modules/.pnpm/chokidar@4.0.3/node_modules/chokidar/esm/index.js
import { stat as statcb } from "fs";
import { stat as stat3, readdir as readdir2 } from "fs/promises";
import { EventEmitter as EventEmitter2 } from "events";
import * as sysPath2 from "path";

// node_modules/.pnpm/readdirp@4.1.2/node_modules/readdirp/esm/index.js
import { stat, lstat, readdir, realpath } from "fs/promises";
import { Readable } from "stream";
import { resolve as presolve, relative as prelative, join as pjoin, sep as psep } from "path";
var EntryTypes = {
  FILE_TYPE: "files",
  DIR_TYPE: "directories",
  FILE_DIR_TYPE: "files_directories",
  EVERYTHING_TYPE: "all"
};
var defaultOptions = {
  root: ".",
  fileFilter: (_entryInfo) => true,
  directoryFilter: (_entryInfo) => true,
  type: EntryTypes.FILE_TYPE,
  lstat: false,
  depth: 2147483648,
  alwaysStat: false,
  highWaterMark: 4096
};
Object.freeze(defaultOptions);
var RECURSIVE_ERROR_CODE = "READDIRP_RECURSIVE_ERROR";
var NORMAL_FLOW_ERRORS = /* @__PURE__ */ new Set(["ENOENT", "EPERM", "EACCES", "ELOOP", RECURSIVE_ERROR_CODE]);
var ALL_TYPES = [
  EntryTypes.DIR_TYPE,
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE,
  EntryTypes.FILE_TYPE
];
var DIR_TYPES = /* @__PURE__ */ new Set([
  EntryTypes.DIR_TYPE,
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE
]);
var FILE_TYPES = /* @__PURE__ */ new Set([
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE,
  EntryTypes.FILE_TYPE
]);
var isNormalFlowError = (error) => NORMAL_FLOW_ERRORS.has(error.code);
var wantBigintFsStats = process.platform === "win32";
var emptyFn = (_entryInfo) => true;
var normalizeFilter = (filter) => {
  if (filter === void 0)
    return emptyFn;
  if (typeof filter === "function")
    return filter;
  if (typeof filter === "string") {
    const fl = filter.trim();
    return (entry) => entry.basename === fl;
  }
  if (Array.isArray(filter)) {
    const trItems = filter.map((item) => item.trim());
    return (entry) => trItems.some((f) => entry.basename === f);
  }
  return emptyFn;
};
var ReaddirpStream = class extends Readable {
  constructor(options = {}) {
    super({
      objectMode: true,
      autoDestroy: true,
      highWaterMark: options.highWaterMark
    });
    const opts = { ...defaultOptions, ...options };
    const { root, type } = opts;
    this._fileFilter = normalizeFilter(opts.fileFilter);
    this._directoryFilter = normalizeFilter(opts.directoryFilter);
    const statMethod = opts.lstat ? lstat : stat;
    if (wantBigintFsStats) {
      this._stat = (path) => statMethod(path, { bigint: true });
    } else {
      this._stat = statMethod;
    }
    this._maxDepth = opts.depth ?? defaultOptions.depth;
    this._wantsDir = type ? DIR_TYPES.has(type) : false;
    this._wantsFile = type ? FILE_TYPES.has(type) : false;
    this._wantsEverything = type === EntryTypes.EVERYTHING_TYPE;
    this._root = presolve(root);
    this._isDirent = !opts.alwaysStat;
    this._statsProp = this._isDirent ? "dirent" : "stats";
    this._rdOptions = { encoding: "utf8", withFileTypes: this._isDirent };
    this.parents = [this._exploreDir(root, 1)];
    this.reading = false;
    this.parent = void 0;
  }
  async _read(batch) {
    if (this.reading)
      return;
    this.reading = true;
    try {
      while (!this.destroyed && batch > 0) {
        const par = this.parent;
        const fil = par && par.files;
        if (fil && fil.length > 0) {
          const { path, depth } = par;
          const slice = fil.splice(0, batch).map((dirent) => this._formatEntry(dirent, path));
          const awaited = await Promise.all(slice);
          for (const entry of awaited) {
            if (!entry)
              continue;
            if (this.destroyed)
              return;
            const entryType = await this._getEntryType(entry);
            if (entryType === "directory" && this._directoryFilter(entry)) {
              if (depth <= this._maxDepth) {
                this.parents.push(this._exploreDir(entry.fullPath, depth + 1));
              }
              if (this._wantsDir) {
                this.push(entry);
                batch--;
              }
            } else if ((entryType === "file" || this._includeAsFile(entry)) && this._fileFilter(entry)) {
              if (this._wantsFile) {
                this.push(entry);
                batch--;
              }
            }
          }
        } else {
          const parent = this.parents.pop();
          if (!parent) {
            this.push(null);
            break;
          }
          this.parent = await parent;
          if (this.destroyed)
            return;
        }
      }
    } catch (error) {
      this.destroy(error);
    } finally {
      this.reading = false;
    }
  }
  async _exploreDir(path, depth) {
    let files;
    try {
      files = await readdir(path, this._rdOptions);
    } catch (error) {
      this._onError(error);
    }
    return { files, depth, path };
  }
  async _formatEntry(dirent, path) {
    let entry;
    const basename14 = this._isDirent ? dirent.name : dirent;
    try {
      const fullPath = presolve(pjoin(path, basename14));
      entry = { path: prelative(this._root, fullPath), fullPath, basename: basename14 };
      entry[this._statsProp] = this._isDirent ? dirent : await this._stat(fullPath);
    } catch (err3) {
      this._onError(err3);
      return;
    }
    return entry;
  }
  _onError(err3) {
    if (isNormalFlowError(err3) && !this.destroyed) {
      this.emit("warn", err3);
    } else {
      this.destroy(err3);
    }
  }
  async _getEntryType(entry) {
    if (!entry && this._statsProp in entry) {
      return "";
    }
    const stats = entry[this._statsProp];
    if (stats.isFile())
      return "file";
    if (stats.isDirectory())
      return "directory";
    if (stats && stats.isSymbolicLink()) {
      const full = entry.fullPath;
      try {
        const entryRealPath = await realpath(full);
        const entryRealPathStats = await lstat(entryRealPath);
        if (entryRealPathStats.isFile()) {
          return "file";
        }
        if (entryRealPathStats.isDirectory()) {
          const len = entryRealPath.length;
          if (full.startsWith(entryRealPath) && full.substr(len, 1) === psep) {
            const recursiveError = new Error(`Circular symlink detected: "${full}" points to "${entryRealPath}"`);
            recursiveError.code = RECURSIVE_ERROR_CODE;
            return this._onError(recursiveError);
          }
          return "directory";
        }
      } catch (error) {
        this._onError(error);
        return "";
      }
    }
  }
  _includeAsFile(entry) {
    const stats = entry && entry[this._statsProp];
    return stats && this._wantsEverything && !stats.isDirectory();
  }
};
function readdirp(root, options = {}) {
  let type = options.entryType || options.type;
  if (type === "both")
    type = EntryTypes.FILE_DIR_TYPE;
  if (type)
    options.type = type;
  if (!root) {
    throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");
  } else if (typeof root !== "string") {
    throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");
  } else if (type && !ALL_TYPES.includes(type)) {
    throw new Error(`readdirp: Invalid type passed. Use one of ${ALL_TYPES.join(", ")}`);
  }
  options.root = root;
  return new ReaddirpStream(options);
}

// node_modules/.pnpm/chokidar@4.0.3/node_modules/chokidar/esm/handler.js
import { watchFile, unwatchFile, watch as fs_watch } from "fs";
import { open, stat as stat2, lstat as lstat2, realpath as fsrealpath } from "fs/promises";
import * as sysPath from "path";
import { type as osType } from "os";
var STR_DATA = "data";
var STR_END = "end";
var STR_CLOSE = "close";
var EMPTY_FN = () => {
};
var pl = process.platform;
var isWindows = pl === "win32";
var isMacos = pl === "darwin";
var isLinux = pl === "linux";
var isFreeBSD = pl === "freebsd";
var isIBMi = osType() === "OS400";
var EVENTS = {
  ALL: "all",
  READY: "ready",
  ADD: "add",
  CHANGE: "change",
  ADD_DIR: "addDir",
  UNLINK: "unlink",
  UNLINK_DIR: "unlinkDir",
  RAW: "raw",
  ERROR: "error"
};
var EV = EVENTS;
var THROTTLE_MODE_WATCH = "watch";
var statMethods = { lstat: lstat2, stat: stat2 };
var KEY_LISTENERS = "listeners";
var KEY_ERR = "errHandlers";
var KEY_RAW = "rawEmitters";
var HANDLER_KEYS = [KEY_LISTENERS, KEY_ERR, KEY_RAW];
var binaryExtensions = /* @__PURE__ */ new Set([
  "3dm",
  "3ds",
  "3g2",
  "3gp",
  "7z",
  "a",
  "aac",
  "adp",
  "afdesign",
  "afphoto",
  "afpub",
  "ai",
  "aif",
  "aiff",
  "alz",
  "ape",
  "apk",
  "appimage",
  "ar",
  "arj",
  "asf",
  "au",
  "avi",
  "bak",
  "baml",
  "bh",
  "bin",
  "bk",
  "bmp",
  "btif",
  "bz2",
  "bzip2",
  "cab",
  "caf",
  "cgm",
  "class",
  "cmx",
  "cpio",
  "cr2",
  "cur",
  "dat",
  "dcm",
  "deb",
  "dex",
  "djvu",
  "dll",
  "dmg",
  "dng",
  "doc",
  "docm",
  "docx",
  "dot",
  "dotm",
  "dra",
  "DS_Store",
  "dsk",
  "dts",
  "dtshd",
  "dvb",
  "dwg",
  "dxf",
  "ecelp4800",
  "ecelp7470",
  "ecelp9600",
  "egg",
  "eol",
  "eot",
  "epub",
  "exe",
  "f4v",
  "fbs",
  "fh",
  "fla",
  "flac",
  "flatpak",
  "fli",
  "flv",
  "fpx",
  "fst",
  "fvt",
  "g3",
  "gh",
  "gif",
  "graffle",
  "gz",
  "gzip",
  "h261",
  "h263",
  "h264",
  "icns",
  "ico",
  "ief",
  "img",
  "ipa",
  "iso",
  "jar",
  "jpeg",
  "jpg",
  "jpgv",
  "jpm",
  "jxr",
  "key",
  "ktx",
  "lha",
  "lib",
  "lvp",
  "lz",
  "lzh",
  "lzma",
  "lzo",
  "m3u",
  "m4a",
  "m4v",
  "mar",
  "mdi",
  "mht",
  "mid",
  "midi",
  "mj2",
  "mka",
  "mkv",
  "mmr",
  "mng",
  "mobi",
  "mov",
  "movie",
  "mp3",
  "mp4",
  "mp4a",
  "mpeg",
  "mpg",
  "mpga",
  "mxu",
  "nef",
  "npx",
  "numbers",
  "nupkg",
  "o",
  "odp",
  "ods",
  "odt",
  "oga",
  "ogg",
  "ogv",
  "otf",
  "ott",
  "pages",
  "pbm",
  "pcx",
  "pdb",
  "pdf",
  "pea",
  "pgm",
  "pic",
  "png",
  "pnm",
  "pot",
  "potm",
  "potx",
  "ppa",
  "ppam",
  "ppm",
  "pps",
  "ppsm",
  "ppsx",
  "ppt",
  "pptm",
  "pptx",
  "psd",
  "pya",
  "pyc",
  "pyo",
  "pyv",
  "qt",
  "rar",
  "ras",
  "raw",
  "resources",
  "rgb",
  "rip",
  "rlc",
  "rmf",
  "rmvb",
  "rpm",
  "rtf",
  "rz",
  "s3m",
  "s7z",
  "scpt",
  "sgi",
  "shar",
  "snap",
  "sil",
  "sketch",
  "slk",
  "smv",
  "snk",
  "so",
  "stl",
  "suo",
  "sub",
  "swf",
  "tar",
  "tbz",
  "tbz2",
  "tga",
  "tgz",
  "thmx",
  "tif",
  "tiff",
  "tlz",
  "ttc",
  "ttf",
  "txz",
  "udf",
  "uvh",
  "uvi",
  "uvm",
  "uvp",
  "uvs",
  "uvu",
  "viv",
  "vob",
  "war",
  "wav",
  "wax",
  "wbmp",
  "wdp",
  "weba",
  "webm",
  "webp",
  "whl",
  "wim",
  "wm",
  "wma",
  "wmv",
  "wmx",
  "woff",
  "woff2",
  "wrm",
  "wvx",
  "xbm",
  "xif",
  "xla",
  "xlam",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
  "xlt",
  "xltm",
  "xltx",
  "xm",
  "xmind",
  "xpi",
  "xpm",
  "xwd",
  "xz",
  "z",
  "zip",
  "zipx"
]);
var isBinaryPath = (filePath) => binaryExtensions.has(sysPath.extname(filePath).slice(1).toLowerCase());
var foreach = (val, fn) => {
  if (val instanceof Set) {
    val.forEach(fn);
  } else {
    fn(val);
  }
};
var addAndConvert = (main2, prop, item) => {
  let container = main2[prop];
  if (!(container instanceof Set)) {
    main2[prop] = container = /* @__PURE__ */ new Set([container]);
  }
  container.add(item);
};
var clearItem = (cont) => (key) => {
  const set = cont[key];
  if (set instanceof Set) {
    set.clear();
  } else {
    delete cont[key];
  }
};
var delFromSet = (main2, prop, item) => {
  const container = main2[prop];
  if (container instanceof Set) {
    container.delete(item);
  } else if (container === item) {
    delete main2[prop];
  }
};
var isEmptySet = (val) => val instanceof Set ? val.size === 0 : !val;
var FsWatchInstances = /* @__PURE__ */ new Map();
function createFsWatchInstance(path, options, listener, errHandler, emitRaw) {
  const handleEvent = (rawEvent, evPath) => {
    listener(path);
    emitRaw(rawEvent, evPath, { watchedPath: path });
    if (evPath && path !== evPath) {
      fsWatchBroadcast(sysPath.resolve(path, evPath), KEY_LISTENERS, sysPath.join(path, evPath));
    }
  };
  try {
    return fs_watch(path, {
      persistent: options.persistent
    }, handleEvent);
  } catch (error) {
    errHandler(error);
    return void 0;
  }
}
var fsWatchBroadcast = (fullPath, listenerType, val1, val2, val3) => {
  const cont = FsWatchInstances.get(fullPath);
  if (!cont)
    return;
  foreach(cont[listenerType], (listener) => {
    listener(val1, val2, val3);
  });
};
var setFsWatchListener = (path, fullPath, options, handlers) => {
  const { listener, errHandler, rawEmitter } = handlers;
  let cont = FsWatchInstances.get(fullPath);
  let watcher;
  if (!options.persistent) {
    watcher = createFsWatchInstance(path, options, listener, errHandler, rawEmitter);
    if (!watcher)
      return;
    return watcher.close.bind(watcher);
  }
  if (cont) {
    addAndConvert(cont, KEY_LISTENERS, listener);
    addAndConvert(cont, KEY_ERR, errHandler);
    addAndConvert(cont, KEY_RAW, rawEmitter);
  } else {
    watcher = createFsWatchInstance(
      path,
      options,
      fsWatchBroadcast.bind(null, fullPath, KEY_LISTENERS),
      errHandler,
      // no need to use broadcast here
      fsWatchBroadcast.bind(null, fullPath, KEY_RAW)
    );
    if (!watcher)
      return;
    watcher.on(EV.ERROR, async (error) => {
      const broadcastErr = fsWatchBroadcast.bind(null, fullPath, KEY_ERR);
      if (cont)
        cont.watcherUnusable = true;
      if (isWindows && error.code === "EPERM") {
        try {
          const fd = await open(path, "r");
          await fd.close();
          broadcastErr(error);
        } catch (err3) {
        }
      } else {
        broadcastErr(error);
      }
    });
    cont = {
      listeners: listener,
      errHandlers: errHandler,
      rawEmitters: rawEmitter,
      watcher
    };
    FsWatchInstances.set(fullPath, cont);
  }
  return () => {
    delFromSet(cont, KEY_LISTENERS, listener);
    delFromSet(cont, KEY_ERR, errHandler);
    delFromSet(cont, KEY_RAW, rawEmitter);
    if (isEmptySet(cont.listeners)) {
      cont.watcher.close();
      FsWatchInstances.delete(fullPath);
      HANDLER_KEYS.forEach(clearItem(cont));
      cont.watcher = void 0;
      Object.freeze(cont);
    }
  };
};
var FsWatchFileInstances = /* @__PURE__ */ new Map();
var setFsWatchFileListener = (path, fullPath, options, handlers) => {
  const { listener, rawEmitter } = handlers;
  let cont = FsWatchFileInstances.get(fullPath);
  const copts = cont && cont.options;
  if (copts && (copts.persistent < options.persistent || copts.interval > options.interval)) {
    unwatchFile(fullPath);
    cont = void 0;
  }
  if (cont) {
    addAndConvert(cont, KEY_LISTENERS, listener);
    addAndConvert(cont, KEY_RAW, rawEmitter);
  } else {
    cont = {
      listeners: listener,
      rawEmitters: rawEmitter,
      options,
      watcher: watchFile(fullPath, options, (curr, prev) => {
        foreach(cont.rawEmitters, (rawEmitter2) => {
          rawEmitter2(EV.CHANGE, fullPath, { curr, prev });
        });
        const currmtime = curr.mtimeMs;
        if (curr.size !== prev.size || currmtime > prev.mtimeMs || currmtime === 0) {
          foreach(cont.listeners, (listener2) => listener2(path, curr));
        }
      })
    };
    FsWatchFileInstances.set(fullPath, cont);
  }
  return () => {
    delFromSet(cont, KEY_LISTENERS, listener);
    delFromSet(cont, KEY_RAW, rawEmitter);
    if (isEmptySet(cont.listeners)) {
      FsWatchFileInstances.delete(fullPath);
      unwatchFile(fullPath);
      cont.options = cont.watcher = void 0;
      Object.freeze(cont);
    }
  };
};
var NodeFsHandler = class {
  constructor(fsW) {
    this.fsw = fsW;
    this._boundHandleError = (error) => fsW._handleError(error);
  }
  /**
   * Watch file for changes with fs_watchFile or fs_watch.
   * @param path to file or dir
   * @param listener on fs change
   * @returns closer for the watcher instance
   */
  _watchWithNodeFs(path, listener) {
    const opts = this.fsw.options;
    const directory = sysPath.dirname(path);
    const basename14 = sysPath.basename(path);
    const parent = this.fsw._getWatchedDir(directory);
    parent.add(basename14);
    const absolutePath = sysPath.resolve(path);
    const options = {
      persistent: opts.persistent
    };
    if (!listener)
      listener = EMPTY_FN;
    let closer;
    if (opts.usePolling) {
      const enableBin = opts.interval !== opts.binaryInterval;
      options.interval = enableBin && isBinaryPath(basename14) ? opts.binaryInterval : opts.interval;
      closer = setFsWatchFileListener(path, absolutePath, options, {
        listener,
        rawEmitter: this.fsw._emitRaw
      });
    } else {
      closer = setFsWatchListener(path, absolutePath, options, {
        listener,
        errHandler: this._boundHandleError,
        rawEmitter: this.fsw._emitRaw
      });
    }
    return closer;
  }
  /**
   * Watch a file and emit add event if warranted.
   * @returns closer for the watcher instance
   */
  _handleFile(file, stats, initialAdd) {
    if (this.fsw.closed) {
      return;
    }
    const dirname9 = sysPath.dirname(file);
    const basename14 = sysPath.basename(file);
    const parent = this.fsw._getWatchedDir(dirname9);
    let prevStats = stats;
    if (parent.has(basename14))
      return;
    const listener = async (path, newStats) => {
      if (!this.fsw._throttle(THROTTLE_MODE_WATCH, file, 5))
        return;
      if (!newStats || newStats.mtimeMs === 0) {
        try {
          const newStats2 = await stat2(file);
          if (this.fsw.closed)
            return;
          const at = newStats2.atimeMs;
          const mt = newStats2.mtimeMs;
          if (!at || at <= mt || mt !== prevStats.mtimeMs) {
            this.fsw._emit(EV.CHANGE, file, newStats2);
          }
          if ((isMacos || isLinux || isFreeBSD) && prevStats.ino !== newStats2.ino) {
            this.fsw._closeFile(path);
            prevStats = newStats2;
            const closer2 = this._watchWithNodeFs(file, listener);
            if (closer2)
              this.fsw._addPathCloser(path, closer2);
          } else {
            prevStats = newStats2;
          }
        } catch (error) {
          this.fsw._remove(dirname9, basename14);
        }
      } else if (parent.has(basename14)) {
        const at = newStats.atimeMs;
        const mt = newStats.mtimeMs;
        if (!at || at <= mt || mt !== prevStats.mtimeMs) {
          this.fsw._emit(EV.CHANGE, file, newStats);
        }
        prevStats = newStats;
      }
    };
    const closer = this._watchWithNodeFs(file, listener);
    if (!(initialAdd && this.fsw.options.ignoreInitial) && this.fsw._isntIgnored(file)) {
      if (!this.fsw._throttle(EV.ADD, file, 0))
        return;
      this.fsw._emit(EV.ADD, file, stats);
    }
    return closer;
  }
  /**
   * Handle symlinks encountered while reading a dir.
   * @param entry returned by readdirp
   * @param directory path of dir being read
   * @param path of this item
   * @param item basename of this item
   * @returns true if no more processing is needed for this entry.
   */
  async _handleSymlink(entry, directory, path, item) {
    if (this.fsw.closed) {
      return;
    }
    const full = entry.fullPath;
    const dir = this.fsw._getWatchedDir(directory);
    if (!this.fsw.options.followSymlinks) {
      this.fsw._incrReadyCount();
      let linkPath;
      try {
        linkPath = await fsrealpath(path);
      } catch (e) {
        this.fsw._emitReady();
        return true;
      }
      if (this.fsw.closed)
        return;
      if (dir.has(item)) {
        if (this.fsw._symlinkPaths.get(full) !== linkPath) {
          this.fsw._symlinkPaths.set(full, linkPath);
          this.fsw._emit(EV.CHANGE, path, entry.stats);
        }
      } else {
        dir.add(item);
        this.fsw._symlinkPaths.set(full, linkPath);
        this.fsw._emit(EV.ADD, path, entry.stats);
      }
      this.fsw._emitReady();
      return true;
    }
    if (this.fsw._symlinkPaths.has(full)) {
      return true;
    }
    this.fsw._symlinkPaths.set(full, true);
  }
  _handleRead(directory, initialAdd, wh, target, dir, depth, throttler) {
    directory = sysPath.join(directory, "");
    throttler = this.fsw._throttle("readdir", directory, 1e3);
    if (!throttler)
      return;
    const previous = this.fsw._getWatchedDir(wh.path);
    const current = /* @__PURE__ */ new Set();
    let stream = this.fsw._readdirp(directory, {
      fileFilter: (entry) => wh.filterPath(entry),
      directoryFilter: (entry) => wh.filterDir(entry)
    });
    if (!stream)
      return;
    stream.on(STR_DATA, async (entry) => {
      if (this.fsw.closed) {
        stream = void 0;
        return;
      }
      const item = entry.path;
      let path = sysPath.join(directory, item);
      current.add(item);
      if (entry.stats.isSymbolicLink() && await this._handleSymlink(entry, directory, path, item)) {
        return;
      }
      if (this.fsw.closed) {
        stream = void 0;
        return;
      }
      if (item === target || !target && !previous.has(item)) {
        this.fsw._incrReadyCount();
        path = sysPath.join(dir, sysPath.relative(dir, path));
        this._addToNodeFs(path, initialAdd, wh, depth + 1);
      }
    }).on(EV.ERROR, this._boundHandleError);
    return new Promise((resolve12, reject) => {
      if (!stream)
        return reject();
      stream.once(STR_END, () => {
        if (this.fsw.closed) {
          stream = void 0;
          return;
        }
        const wasThrottled = throttler ? throttler.clear() : false;
        resolve12(void 0);
        previous.getChildren().filter((item) => {
          return item !== directory && !current.has(item);
        }).forEach((item) => {
          this.fsw._remove(directory, item);
        });
        stream = void 0;
        if (wasThrottled)
          this._handleRead(directory, false, wh, target, dir, depth, throttler);
      });
    });
  }
  /**
   * Read directory to add / remove files from `@watched` list and re-read it on change.
   * @param dir fs path
   * @param stats
   * @param initialAdd
   * @param depth relative to user-supplied path
   * @param target child path targeted for watch
   * @param wh Common watch helpers for this path
   * @param realpath
   * @returns closer for the watcher instance.
   */
  async _handleDir(dir, stats, initialAdd, depth, target, wh, realpath2) {
    const parentDir = this.fsw._getWatchedDir(sysPath.dirname(dir));
    const tracked = parentDir.has(sysPath.basename(dir));
    if (!(initialAdd && this.fsw.options.ignoreInitial) && !target && !tracked) {
      this.fsw._emit(EV.ADD_DIR, dir, stats);
    }
    parentDir.add(sysPath.basename(dir));
    this.fsw._getWatchedDir(dir);
    let throttler;
    let closer;
    const oDepth = this.fsw.options.depth;
    if ((oDepth == null || depth <= oDepth) && !this.fsw._symlinkPaths.has(realpath2)) {
      if (!target) {
        await this._handleRead(dir, initialAdd, wh, target, dir, depth, throttler);
        if (this.fsw.closed)
          return;
      }
      closer = this._watchWithNodeFs(dir, (dirPath, stats2) => {
        if (stats2 && stats2.mtimeMs === 0)
          return;
        this._handleRead(dirPath, false, wh, target, dir, depth, throttler);
      });
    }
    return closer;
  }
  /**
   * Handle added file, directory, or glob pattern.
   * Delegates call to _handleFile / _handleDir after checks.
   * @param path to file or ir
   * @param initialAdd was the file added at watch instantiation?
   * @param priorWh depth relative to user-supplied path
   * @param depth Child path actually targeted for watch
   * @param target Child path actually targeted for watch
   */
  async _addToNodeFs(path, initialAdd, priorWh, depth, target) {
    const ready = this.fsw._emitReady;
    if (this.fsw._isIgnored(path) || this.fsw.closed) {
      ready();
      return false;
    }
    const wh = this.fsw._getWatchHelpers(path);
    if (priorWh) {
      wh.filterPath = (entry) => priorWh.filterPath(entry);
      wh.filterDir = (entry) => priorWh.filterDir(entry);
    }
    try {
      const stats = await statMethods[wh.statMethod](wh.watchPath);
      if (this.fsw.closed)
        return;
      if (this.fsw._isIgnored(wh.watchPath, stats)) {
        ready();
        return false;
      }
      const follow = this.fsw.options.followSymlinks;
      let closer;
      if (stats.isDirectory()) {
        const absPath = sysPath.resolve(path);
        const targetPath = follow ? await fsrealpath(path) : path;
        if (this.fsw.closed)
          return;
        closer = await this._handleDir(wh.watchPath, stats, initialAdd, depth, target, wh, targetPath);
        if (this.fsw.closed)
          return;
        if (absPath !== targetPath && targetPath !== void 0) {
          this.fsw._symlinkPaths.set(absPath, targetPath);
        }
      } else if (stats.isSymbolicLink()) {
        const targetPath = follow ? await fsrealpath(path) : path;
        if (this.fsw.closed)
          return;
        const parent = sysPath.dirname(wh.watchPath);
        this.fsw._getWatchedDir(parent).add(wh.watchPath);
        this.fsw._emit(EV.ADD, wh.watchPath, stats);
        closer = await this._handleDir(parent, stats, initialAdd, depth, path, wh, targetPath);
        if (this.fsw.closed)
          return;
        if (targetPath !== void 0) {
          this.fsw._symlinkPaths.set(sysPath.resolve(path), targetPath);
        }
      } else {
        closer = this._handleFile(wh.watchPath, stats, initialAdd);
      }
      ready();
      if (closer)
        this.fsw._addPathCloser(path, closer);
      return false;
    } catch (error) {
      if (this.fsw._handleError(error)) {
        ready();
        return path;
      }
    }
  }
};

// node_modules/.pnpm/chokidar@4.0.3/node_modules/chokidar/esm/index.js
var SLASH = "/";
var SLASH_SLASH = "//";
var ONE_DOT = ".";
var TWO_DOTS = "..";
var STRING_TYPE = "string";
var BACK_SLASH_RE = /\\/g;
var DOUBLE_SLASH_RE = /\/\//;
var DOT_RE = /\..*\.(sw[px])$|~$|\.subl.*\.tmp/;
var REPLACER_RE = /^\.[/\\]/;
function arrify(item) {
  return Array.isArray(item) ? item : [item];
}
var isMatcherObject = (matcher) => typeof matcher === "object" && matcher !== null && !(matcher instanceof RegExp);
function createPattern(matcher) {
  if (typeof matcher === "function")
    return matcher;
  if (typeof matcher === "string")
    return (string) => matcher === string;
  if (matcher instanceof RegExp)
    return (string) => matcher.test(string);
  if (typeof matcher === "object" && matcher !== null) {
    return (string) => {
      if (matcher.path === string)
        return true;
      if (matcher.recursive) {
        const relative3 = sysPath2.relative(matcher.path, string);
        if (!relative3) {
          return false;
        }
        return !relative3.startsWith("..") && !sysPath2.isAbsolute(relative3);
      }
      return false;
    };
  }
  return () => false;
}
function normalizePath(path) {
  if (typeof path !== "string")
    throw new Error("string expected");
  path = sysPath2.normalize(path);
  path = path.replace(/\\/g, "/");
  let prepend = false;
  if (path.startsWith("//"))
    prepend = true;
  const DOUBLE_SLASH_RE2 = /\/\//;
  while (path.match(DOUBLE_SLASH_RE2))
    path = path.replace(DOUBLE_SLASH_RE2, "/");
  if (prepend)
    path = "/" + path;
  return path;
}
function matchPatterns(patterns, testString, stats) {
  const path = normalizePath(testString);
  for (let index = 0; index < patterns.length; index++) {
    const pattern = patterns[index];
    if (pattern(path, stats)) {
      return true;
    }
  }
  return false;
}
function anymatch(matchers, testString) {
  if (matchers == null) {
    throw new TypeError("anymatch: specify first argument");
  }
  const matchersArray = arrify(matchers);
  const patterns = matchersArray.map((matcher) => createPattern(matcher));
  if (testString == null) {
    return (testString2, stats) => {
      return matchPatterns(patterns, testString2, stats);
    };
  }
  return matchPatterns(patterns, testString);
}
var unifyPaths = (paths_) => {
  const paths = arrify(paths_).flat();
  if (!paths.every((p) => typeof p === STRING_TYPE)) {
    throw new TypeError(`Non-string provided as watch path: ${paths}`);
  }
  return paths.map(normalizePathToUnix);
};
var toUnix = (string) => {
  let str = string.replace(BACK_SLASH_RE, SLASH);
  let prepend = false;
  if (str.startsWith(SLASH_SLASH)) {
    prepend = true;
  }
  while (str.match(DOUBLE_SLASH_RE)) {
    str = str.replace(DOUBLE_SLASH_RE, SLASH);
  }
  if (prepend) {
    str = SLASH + str;
  }
  return str;
};
var normalizePathToUnix = (path) => toUnix(sysPath2.normalize(toUnix(path)));
var normalizeIgnored = (cwd = "") => (path) => {
  if (typeof path === "string") {
    return normalizePathToUnix(sysPath2.isAbsolute(path) ? path : sysPath2.join(cwd, path));
  } else {
    return path;
  }
};
var getAbsolutePath = (path, cwd) => {
  if (sysPath2.isAbsolute(path)) {
    return path;
  }
  return sysPath2.join(cwd, path);
};
var EMPTY_SET = Object.freeze(/* @__PURE__ */ new Set());
var DirEntry = class {
  constructor(dir, removeWatcher) {
    this.path = dir;
    this._removeWatcher = removeWatcher;
    this.items = /* @__PURE__ */ new Set();
  }
  add(item) {
    const { items } = this;
    if (!items)
      return;
    if (item !== ONE_DOT && item !== TWO_DOTS)
      items.add(item);
  }
  async remove(item) {
    const { items } = this;
    if (!items)
      return;
    items.delete(item);
    if (items.size > 0)
      return;
    const dir = this.path;
    try {
      await readdir2(dir);
    } catch (err3) {
      if (this._removeWatcher) {
        this._removeWatcher(sysPath2.dirname(dir), sysPath2.basename(dir));
      }
    }
  }
  has(item) {
    const { items } = this;
    if (!items)
      return;
    return items.has(item);
  }
  getChildren() {
    const { items } = this;
    if (!items)
      return [];
    return [...items.values()];
  }
  dispose() {
    this.items.clear();
    this.path = "";
    this._removeWatcher = EMPTY_FN;
    this.items = EMPTY_SET;
    Object.freeze(this);
  }
};
var STAT_METHOD_F = "stat";
var STAT_METHOD_L = "lstat";
var WatchHelper = class {
  constructor(path, follow, fsw) {
    this.fsw = fsw;
    const watchPath = path;
    this.path = path = path.replace(REPLACER_RE, "");
    this.watchPath = watchPath;
    this.fullWatchPath = sysPath2.resolve(watchPath);
    this.dirParts = [];
    this.dirParts.forEach((parts) => {
      if (parts.length > 1)
        parts.pop();
    });
    this.followSymlinks = follow;
    this.statMethod = follow ? STAT_METHOD_F : STAT_METHOD_L;
  }
  entryPath(entry) {
    return sysPath2.join(this.watchPath, sysPath2.relative(this.watchPath, entry.fullPath));
  }
  filterPath(entry) {
    const { stats } = entry;
    if (stats && stats.isSymbolicLink())
      return this.filterDir(entry);
    const resolvedPath = this.entryPath(entry);
    return this.fsw._isntIgnored(resolvedPath, stats) && this.fsw._hasReadPermissions(stats);
  }
  filterDir(entry) {
    return this.fsw._isntIgnored(this.entryPath(entry), entry.stats);
  }
};
var FSWatcher = class extends EventEmitter2 {
  // Not indenting methods for history sake; for now.
  constructor(_opts = {}) {
    super();
    this.closed = false;
    this._closers = /* @__PURE__ */ new Map();
    this._ignoredPaths = /* @__PURE__ */ new Set();
    this._throttled = /* @__PURE__ */ new Map();
    this._streams = /* @__PURE__ */ new Set();
    this._symlinkPaths = /* @__PURE__ */ new Map();
    this._watched = /* @__PURE__ */ new Map();
    this._pendingWrites = /* @__PURE__ */ new Map();
    this._pendingUnlinks = /* @__PURE__ */ new Map();
    this._readyCount = 0;
    this._readyEmitted = false;
    const awf = _opts.awaitWriteFinish;
    const DEF_AWF = { stabilityThreshold: 2e3, pollInterval: 100 };
    const opts = {
      // Defaults
      persistent: true,
      ignoreInitial: false,
      ignorePermissionErrors: false,
      interval: 100,
      binaryInterval: 300,
      followSymlinks: true,
      usePolling: false,
      // useAsync: false,
      atomic: true,
      // NOTE: overwritten later (depends on usePolling)
      ..._opts,
      // Change format
      ignored: _opts.ignored ? arrify(_opts.ignored) : arrify([]),
      awaitWriteFinish: awf === true ? DEF_AWF : typeof awf === "object" ? { ...DEF_AWF, ...awf } : false
    };
    if (isIBMi)
      opts.usePolling = true;
    if (opts.atomic === void 0)
      opts.atomic = !opts.usePolling;
    const envPoll = process.env.CHOKIDAR_USEPOLLING;
    if (envPoll !== void 0) {
      const envLower = envPoll.toLowerCase();
      if (envLower === "false" || envLower === "0")
        opts.usePolling = false;
      else if (envLower === "true" || envLower === "1")
        opts.usePolling = true;
      else
        opts.usePolling = !!envLower;
    }
    const envInterval = process.env.CHOKIDAR_INTERVAL;
    if (envInterval)
      opts.interval = Number.parseInt(envInterval, 10);
    let readyCalls = 0;
    this._emitReady = () => {
      readyCalls++;
      if (readyCalls >= this._readyCount) {
        this._emitReady = EMPTY_FN;
        this._readyEmitted = true;
        process.nextTick(() => this.emit(EVENTS.READY));
      }
    };
    this._emitRaw = (...args) => this.emit(EVENTS.RAW, ...args);
    this._boundRemove = this._remove.bind(this);
    this.options = opts;
    this._nodeFsHandler = new NodeFsHandler(this);
    Object.freeze(opts);
  }
  _addIgnoredPath(matcher) {
    if (isMatcherObject(matcher)) {
      for (const ignored of this._ignoredPaths) {
        if (isMatcherObject(ignored) && ignored.path === matcher.path && ignored.recursive === matcher.recursive) {
          return;
        }
      }
    }
    this._ignoredPaths.add(matcher);
  }
  _removeIgnoredPath(matcher) {
    this._ignoredPaths.delete(matcher);
    if (typeof matcher === "string") {
      for (const ignored of this._ignoredPaths) {
        if (isMatcherObject(ignored) && ignored.path === matcher) {
          this._ignoredPaths.delete(ignored);
        }
      }
    }
  }
  // Public methods
  /**
   * Adds paths to be watched on an existing FSWatcher instance.
   * @param paths_ file or file list. Other arguments are unused
   */
  add(paths_, _origAdd, _internal) {
    const { cwd } = this.options;
    this.closed = false;
    this._closePromise = void 0;
    let paths = unifyPaths(paths_);
    if (cwd) {
      paths = paths.map((path) => {
        const absPath = getAbsolutePath(path, cwd);
        return absPath;
      });
    }
    paths.forEach((path) => {
      this._removeIgnoredPath(path);
    });
    this._userIgnored = void 0;
    if (!this._readyCount)
      this._readyCount = 0;
    this._readyCount += paths.length;
    Promise.all(paths.map(async (path) => {
      const res = await this._nodeFsHandler._addToNodeFs(path, !_internal, void 0, 0, _origAdd);
      if (res)
        this._emitReady();
      return res;
    })).then((results) => {
      if (this.closed)
        return;
      results.forEach((item) => {
        if (item)
          this.add(sysPath2.dirname(item), sysPath2.basename(_origAdd || item));
      });
    });
    return this;
  }
  /**
   * Close watchers or start ignoring events from specified paths.
   */
  unwatch(paths_) {
    if (this.closed)
      return this;
    const paths = unifyPaths(paths_);
    const { cwd } = this.options;
    paths.forEach((path) => {
      if (!sysPath2.isAbsolute(path) && !this._closers.has(path)) {
        if (cwd)
          path = sysPath2.join(cwd, path);
        path = sysPath2.resolve(path);
      }
      this._closePath(path);
      this._addIgnoredPath(path);
      if (this._watched.has(path)) {
        this._addIgnoredPath({
          path,
          recursive: true
        });
      }
      this._userIgnored = void 0;
    });
    return this;
  }
  /**
   * Close watchers and remove all listeners from watched paths.
   */
  close() {
    if (this._closePromise) {
      return this._closePromise;
    }
    this.closed = true;
    this.removeAllListeners();
    const closers = [];
    this._closers.forEach((closerList) => closerList.forEach((closer) => {
      const promise = closer();
      if (promise instanceof Promise)
        closers.push(promise);
    }));
    this._streams.forEach((stream) => stream.destroy());
    this._userIgnored = void 0;
    this._readyCount = 0;
    this._readyEmitted = false;
    this._watched.forEach((dirent) => dirent.dispose());
    this._closers.clear();
    this._watched.clear();
    this._streams.clear();
    this._symlinkPaths.clear();
    this._throttled.clear();
    this._closePromise = closers.length ? Promise.all(closers).then(() => void 0) : Promise.resolve();
    return this._closePromise;
  }
  /**
   * Expose list of watched paths
   * @returns for chaining
   */
  getWatched() {
    const watchList = {};
    this._watched.forEach((entry, dir) => {
      const key = this.options.cwd ? sysPath2.relative(this.options.cwd, dir) : dir;
      const index = key || ONE_DOT;
      watchList[index] = entry.getChildren().sort();
    });
    return watchList;
  }
  emitWithAll(event, args) {
    this.emit(event, ...args);
    if (event !== EVENTS.ERROR)
      this.emit(EVENTS.ALL, event, ...args);
  }
  // Common helpers
  // --------------
  /**
   * Normalize and emit events.
   * Calling _emit DOES NOT MEAN emit() would be called!
   * @param event Type of event
   * @param path File or directory path
   * @param stats arguments to be passed with event
   * @returns the error if defined, otherwise the value of the FSWatcher instance's `closed` flag
   */
  async _emit(event, path, stats) {
    if (this.closed)
      return;
    const opts = this.options;
    if (isWindows)
      path = sysPath2.normalize(path);
    if (opts.cwd)
      path = sysPath2.relative(opts.cwd, path);
    const args = [path];
    if (stats != null)
      args.push(stats);
    const awf = opts.awaitWriteFinish;
    let pw;
    if (awf && (pw = this._pendingWrites.get(path))) {
      pw.lastChange = /* @__PURE__ */ new Date();
      return this;
    }
    if (opts.atomic) {
      if (event === EVENTS.UNLINK) {
        this._pendingUnlinks.set(path, [event, ...args]);
        setTimeout(() => {
          this._pendingUnlinks.forEach((entry, path2) => {
            this.emit(...entry);
            this.emit(EVENTS.ALL, ...entry);
            this._pendingUnlinks.delete(path2);
          });
        }, typeof opts.atomic === "number" ? opts.atomic : 100);
        return this;
      }
      if (event === EVENTS.ADD && this._pendingUnlinks.has(path)) {
        event = EVENTS.CHANGE;
        this._pendingUnlinks.delete(path);
      }
    }
    if (awf && (event === EVENTS.ADD || event === EVENTS.CHANGE) && this._readyEmitted) {
      const awfEmit = (err3, stats2) => {
        if (err3) {
          event = EVENTS.ERROR;
          args[0] = err3;
          this.emitWithAll(event, args);
        } else if (stats2) {
          if (args.length > 1) {
            args[1] = stats2;
          } else {
            args.push(stats2);
          }
          this.emitWithAll(event, args);
        }
      };
      this._awaitWriteFinish(path, awf.stabilityThreshold, event, awfEmit);
      return this;
    }
    if (event === EVENTS.CHANGE) {
      const isThrottled = !this._throttle(EVENTS.CHANGE, path, 50);
      if (isThrottled)
        return this;
    }
    if (opts.alwaysStat && stats === void 0 && (event === EVENTS.ADD || event === EVENTS.ADD_DIR || event === EVENTS.CHANGE)) {
      const fullPath = opts.cwd ? sysPath2.join(opts.cwd, path) : path;
      let stats2;
      try {
        stats2 = await stat3(fullPath);
      } catch (err3) {
      }
      if (!stats2 || this.closed)
        return;
      args.push(stats2);
    }
    this.emitWithAll(event, args);
    return this;
  }
  /**
   * Common handler for errors
   * @returns The error if defined, otherwise the value of the FSWatcher instance's `closed` flag
   */
  _handleError(error) {
    const code = error && error.code;
    if (error && code !== "ENOENT" && code !== "ENOTDIR" && (!this.options.ignorePermissionErrors || code !== "EPERM" && code !== "EACCES")) {
      this.emit(EVENTS.ERROR, error);
    }
    return error || this.closed;
  }
  /**
   * Helper utility for throttling
   * @param actionType type being throttled
   * @param path being acted upon
   * @param timeout duration of time to suppress duplicate actions
   * @returns tracking object or false if action should be suppressed
   */
  _throttle(actionType, path, timeout) {
    if (!this._throttled.has(actionType)) {
      this._throttled.set(actionType, /* @__PURE__ */ new Map());
    }
    const action = this._throttled.get(actionType);
    if (!action)
      throw new Error("invalid throttle");
    const actionPath = action.get(path);
    if (actionPath) {
      actionPath.count++;
      return false;
    }
    let timeoutObject;
    const clear = () => {
      const item = action.get(path);
      const count = item ? item.count : 0;
      action.delete(path);
      clearTimeout(timeoutObject);
      if (item)
        clearTimeout(item.timeoutObject);
      return count;
    };
    timeoutObject = setTimeout(clear, timeout);
    const thr = { timeoutObject, clear, count: 0 };
    action.set(path, thr);
    return thr;
  }
  _incrReadyCount() {
    return this._readyCount++;
  }
  /**
   * Awaits write operation to finish.
   * Polls a newly created file for size variations. When files size does not change for 'threshold' milliseconds calls callback.
   * @param path being acted upon
   * @param threshold Time in milliseconds a file size must be fixed before acknowledging write OP is finished
   * @param event
   * @param awfEmit Callback to be called when ready for event to be emitted.
   */
  _awaitWriteFinish(path, threshold, event, awfEmit) {
    const awf = this.options.awaitWriteFinish;
    if (typeof awf !== "object")
      return;
    const pollInterval = awf.pollInterval;
    let timeoutHandler;
    let fullPath = path;
    if (this.options.cwd && !sysPath2.isAbsolute(path)) {
      fullPath = sysPath2.join(this.options.cwd, path);
    }
    const now = /* @__PURE__ */ new Date();
    const writes = this._pendingWrites;
    function awaitWriteFinishFn(prevStat) {
      statcb(fullPath, (err3, curStat) => {
        if (err3 || !writes.has(path)) {
          if (err3 && err3.code !== "ENOENT")
            awfEmit(err3);
          return;
        }
        const now2 = Number(/* @__PURE__ */ new Date());
        if (prevStat && curStat.size !== prevStat.size) {
          writes.get(path).lastChange = now2;
        }
        const pw = writes.get(path);
        const df = now2 - pw.lastChange;
        if (df >= threshold) {
          writes.delete(path);
          awfEmit(void 0, curStat);
        } else {
          timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval, curStat);
        }
      });
    }
    if (!writes.has(path)) {
      writes.set(path, {
        lastChange: now,
        cancelWait: () => {
          writes.delete(path);
          clearTimeout(timeoutHandler);
          return event;
        }
      });
      timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval);
    }
  }
  /**
   * Determines whether user has asked to ignore this path.
   */
  _isIgnored(path, stats) {
    if (this.options.atomic && DOT_RE.test(path))
      return true;
    if (!this._userIgnored) {
      const { cwd } = this.options;
      const ign = this.options.ignored;
      const ignored = (ign || []).map(normalizeIgnored(cwd));
      const ignoredPaths = [...this._ignoredPaths];
      const list = [...ignoredPaths.map(normalizeIgnored(cwd)), ...ignored];
      this._userIgnored = anymatch(list, void 0);
    }
    return this._userIgnored(path, stats);
  }
  _isntIgnored(path, stat4) {
    return !this._isIgnored(path, stat4);
  }
  /**
   * Provides a set of common helpers and properties relating to symlink handling.
   * @param path file or directory pattern being watched
   */
  _getWatchHelpers(path) {
    return new WatchHelper(path, this.options.followSymlinks, this);
  }
  // Directory helpers
  // -----------------
  /**
   * Provides directory tracking objects
   * @param directory path of the directory
   */
  _getWatchedDir(directory) {
    const dir = sysPath2.resolve(directory);
    if (!this._watched.has(dir))
      this._watched.set(dir, new DirEntry(dir, this._boundRemove));
    return this._watched.get(dir);
  }
  // File helpers
  // ------------
  /**
   * Check for read permissions: https://stackoverflow.com/a/11781404/1358405
   */
  _hasReadPermissions(stats) {
    if (this.options.ignorePermissionErrors)
      return true;
    return Boolean(Number(stats.mode) & 256);
  }
  /**
   * Handles emitting unlink events for
   * files and directories, and via recursion, for
   * files and directories within directories that are unlinked
   * @param directory within which the following item is located
   * @param item      base path of item/directory
   */
  _remove(directory, item, isDirectory) {
    const path = sysPath2.join(directory, item);
    const fullPath = sysPath2.resolve(path);
    isDirectory = isDirectory != null ? isDirectory : this._watched.has(path) || this._watched.has(fullPath);
    if (!this._throttle("remove", path, 100))
      return;
    if (!isDirectory && this._watched.size === 1) {
      this.add(directory, item, true);
    }
    const wp = this._getWatchedDir(path);
    const nestedDirectoryChildren = wp.getChildren();
    nestedDirectoryChildren.forEach((nested) => this._remove(path, nested));
    const parent = this._getWatchedDir(directory);
    const wasTracked = parent.has(item);
    parent.remove(item);
    if (this._symlinkPaths.has(fullPath)) {
      this._symlinkPaths.delete(fullPath);
    }
    let relPath = path;
    if (this.options.cwd)
      relPath = sysPath2.relative(this.options.cwd, path);
    if (this.options.awaitWriteFinish && this._pendingWrites.has(relPath)) {
      const event = this._pendingWrites.get(relPath).cancelWait();
      if (event === EVENTS.ADD)
        return;
    }
    this._watched.delete(path);
    this._watched.delete(fullPath);
    const eventName = isDirectory ? EVENTS.UNLINK_DIR : EVENTS.UNLINK;
    if (wasTracked && !this._isIgnored(path))
      this._emit(eventName, path);
    this._closePath(path);
  }
  /**
   * Closes all watchers for a path
   */
  _closePath(path) {
    this._closeFile(path);
    const dir = sysPath2.dirname(path);
    this._getWatchedDir(dir).remove(sysPath2.basename(path));
  }
  /**
   * Closes only file-specific watchers
   */
  _closeFile(path) {
    const closers = this._closers.get(path);
    if (!closers)
      return;
    closers.forEach((closer) => closer());
    this._closers.delete(path);
  }
  _addPathCloser(path, closer) {
    if (!closer)
      return;
    let list = this._closers.get(path);
    if (!list) {
      list = [];
      this._closers.set(path, list);
    }
    list.push(closer);
  }
  _readdirp(root, opts) {
    if (this.closed)
      return;
    const options = { type: EVENTS.ALL, alwaysStat: true, lstat: true, ...opts, depth: 0 };
    let stream = readdirp(root, options);
    this._streams.add(stream);
    stream.once(STR_CLOSE, () => {
      stream = void 0;
    });
    stream.once(STR_END, () => {
      if (stream) {
        this._streams.delete(stream);
        stream = void 0;
      }
    });
    return stream;
  }
};
function watch(paths, options = {}) {
  const watcher = new FSWatcher(options);
  watcher.add(paths);
  return watcher;
}

// src/cli/lib/plugin-dev.ts
import { existsSync as existsSync27 } from "fs";
import { basename as basename12, dirname as dirname8, extname as extname5, join as join34, sep as sep2 } from "path";
init_cli_shared();
function isGeneratedBundle(dir, path) {
  if (path.includes(`${sep2}node_modules${sep2}`) || basename12(path).startsWith(".")) return true;
  if (extname5(path) !== ".js") return false;
  const stem = basename12(path, ".js");
  return [".ts", ".tsx", ".jsx", ".mts"].some((extension) => existsSync27(join34(dirname8(path) || dir, `${stem}${extension}`)));
}
async function requestDaemonReload(kandownDir) {
  try {
    const status = await getDaemonStatus(kandownDir);
    if (!status.running || !status.metadata) return false;
    const response = await fetch(`http://localhost:${status.metadata.port}/api/extensions/reload`, {
      method: "POST",
      headers: status.metadata.token ? { [TOKEN_HEADER]: status.metadata.token } : {}
    });
    return response.ok;
  } catch {
    return false;
  }
}
async function cycle(kandownDir, projectDir, id, dir, quiet) {
  const build = await buildPlugin(dir);
  for (const warning of build.warnings) info(warning);
  if (!build.ok) {
    for (const error of build.errors) err(error);
    return false;
  }
  if (!quiet) {
    const summary = build.outputs.map((output) => `${output.out.split("/").pop()} ${(output.bytes / 1024).toFixed(1)}kb`).join(", ");
    info(`built ${summary}`);
  }
  const report = await checkPlugin(kandownDir, projectDir, id);
  log(formatCheckReport(report));
  const reloaded = await requestDaemonReload(kandownDir);
  if (reloaded) success("reloaded the board");
  else if (!quiet) info('no daemon running; start one with "kandown" to see the plugin live');
  return report.ok;
}
async function runPluginDev(kandownDir, projectDir, id, dir) {
  const host = await loadExtensionHost(kandownDir);
  const enabled = await host.enable(id);
  if (enabled) success(`${id} is trusted and enabled`);
  else info(`${id} is not enabled yet; the checks below explain why`);
  await cycle(kandownDir, projectDir, id, dir, false);
  const watcher = watch(dir, {
    ignoreInitial: true,
    ignored: (path) => isGeneratedBundle(dir, path),
    // 📖 Editors write in several steps. Waiting for the size to settle stops a
    // rebuild from reading a truncated file.
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 }
  });
  log("");
  log(`${c.dim}watching ${dir}, press Ctrl+C to stop${c.reset}`);
  let running = false;
  let queued = false;
  const trigger = async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      log("");
      log(`${c.dim}${(/* @__PURE__ */ new Date()).toLocaleTimeString()} rebuilding${c.reset}`);
      await cycle(kandownDir, projectDir, id, dir, true);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void trigger();
      }
    }
  };
  watcher.on("all", () => {
    void trigger();
  });
  await new Promise((resolve12) => {
    const stop = () => {
      void watcher.close().then(() => resolve12());
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

// src/cli/lib/plugin-scaffold.ts
import { existsSync as existsSync28, mkdirSync as mkdirSync14, writeFileSync as writeFileSync9 } from "fs";
import { join as join35 } from "path";
var PLUGIN_KINDS = ["field", "panel", "gate", "sync", "command", "full"];
function isValidPluginId(id) {
  return /^[a-z][a-z0-9-]{0,63}$/.test(id);
}
function camel(id) {
  return id.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}
function title(id) {
  const spaced = id.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
function fieldPart(id) {
  return {
    body: [
      `  // \u{1F4D6} A number field stored at plugins.${id}.points. The badge renders on`,
      `  // the card; returning null hides it for tasks that never set a value.`,
      `  kd.contributeField({`,
      `    key: 'points',`,
      `    label: 'Story points',`,
      `    type: 'number',`,
      `    badge: (value) => (typeof value === 'number' && value > 0 ? \`\u{1F53A} \${value}\` : null),`,
      `  });`
    ],
    permissions: [`write:field:plugins.${id}.*`],
    contributes: { fields: ["points"] },
    web: false,
    summary: `Adds a "Story points" field on every task, stored under plugins.${id}.points.`
  };
}
function panelPart(id) {
  return {
    body: [
      `  // \u{1F4D6} The panel is declared here and implemented in web.tsx. \`entry\` must`,
      `  // point at the bundled web.js that \`kandown plugin build\` produces.`,
      `  kd.contributeWebPanel({`,
      `    id: 'overview',`,
      `    title: '${title(id)}',`,
      `    entry: './web.js',`,
      `  });`
    ],
    // 📖 A panel needs no permission: the browser hands it a task snapshot and
    // a scoped api, and every privileged call still goes through the host.
    permissions: [],
    contributes: { webPanels: ["overview"] },
    web: true,
    summary: `Adds an "${title(id)}" panel to the task editor.`
  };
}
function gatePart(id) {
  return {
    body: [
      `  // \u{1F4D6} Gates compose: the move happens only when every gate abstains or`,
      `  // permits. Return nothing to abstain, never throw (a throw fails open).`,
      `  kd.contributeGate({`,
      `    id: '${id}-requires-report',`,
      `    on: 'task:beforeMove',`,
      `    to: 'Done',`,
      `    handler: (event) => {`,
      `      const body = String(event.task.frontmatter.title ?? '');`,
      `      if (!body.trim()) return { block: true, reason: 'A task needs a title before Done.' };`,
      `      return undefined;`,
      `    },`,
      `  });`
    ],
    permissions: [],
    contributes: { gates: [`${id}-requires-report`] },
    web: false,
    summary: "Blocks a move to Done when the task has no title."
  };
}
function syncPart(id) {
  return {
    body: [
      `  // \u{1F4D6} Syncs are fire and forget: they run after the file is written and`,
      `  // their failures never block the board. \`ctx.fetch\` exists only because`,
      `  // this manifest declares a net: permission.`,
      `  kd.contributeSync({`,
      `    id: '${id}-notify',`,
      `    on: 'task:afterMove',`,
      `    to: 'Done',`,
      `    handler: async (event, ctx) => {`,
      `      const url = process.env.${camel(id).toUpperCase()}_WEBHOOK;`,
      `      if (!url || !ctx.fetch) return;`,
      `      await ctx.fetch(url, {`,
      `        method: 'POST',`,
      `        headers: { 'Content-Type': 'application/json' },`,
      `        body: JSON.stringify({ id: event.task.id, to: event.to }),`,
      `      });`,
      `    },`,
      `  });`
    ],
    permissions: ["net:*"],
    contributes: { syncs: [`${id}-notify`] },
    web: false,
    summary: "Posts a webhook every time a task lands in Done."
  };
}
function commandPart(id) {
  return {
    body: [
      `  // \u{1F4D6} Surfaces as \`kandown ${id}\`. Contributed commands are additive and`,
      `  // can never shadow a core command.`,
      `  kd.contributeCommand('${id}', {`,
      `    description: 'Summarise the board.',`,
      `    handler: async (_args, ctx) => {`,
      `      const tasks = await ctx.board.readAll();`,
      `      ctx.log.info(\`${id}: \${tasks.length} task(s) on the board\`);`,
      `    },`,
      `  });`
    ],
    permissions: ["read:tasks"],
    contributes: { commands: [id] },
    web: false,
    summary: `Adds the \`kandown ${id}\` command.`
  };
}
function partsFor(kind, id) {
  switch (kind) {
    case "field":
      return fieldPart(id);
    case "panel":
      return panelPart(id);
    case "gate":
      return gatePart(id);
    case "sync":
      return syncPart(id);
    case "command":
      return commandPart(id);
    case "full":
      return mergeParts(id, [fieldPart(id), panelPart(id), gatePart(id), commandPart(id)]);
  }
}
function mergeParts(id, parts) {
  const body = [];
  const permissions = /* @__PURE__ */ new Set();
  const contributes = {};
  for (const part of parts) {
    if (body.length > 0) body.push("");
    body.push(...part.body);
    for (const permission of part.permissions) permissions.add(permission);
    for (const [key, values] of Object.entries(part.contributes)) {
      const bucket = key;
      contributes[bucket] = [...contributes[bucket] ?? [], ...values ?? []];
    }
  }
  return {
    body,
    permissions: [...permissions],
    contributes,
    web: parts.some((part) => part.web),
    summary: `Field, panel, gate and command for ${id}.`
  };
}
function indexSource(id, parts) {
  return `/**
 * @file ${id} plugin entry
 * @description ${parts.summary}
 *
 * \u{1F4D6} Loaded by kandown through jiti, so this TypeScript runs with no build step
 * during development. Run \`kandown plugin build ${id}\` before sharing it: the
 * browser can only execute the bundled index.js.
 */

import type { KandownExtensionAPI } from 'kandown';

export default function (kd: KandownExtensionAPI) {
${parts.body.join("\n")}
}
`;
}
function webSource(id) {
  return `/**
 * @file ${id} panel module
 * @description The browser half of the plugin. Bundled to web.js by
 * \`kandown plugin build ${id}\` and imported through a Blob URL, so it must stay
 * self-contained.
 *
 * \u{1F4D6} Never import React here. The host passes its own React runtime as \`ui\`;
 * a second copy in the bundle breaks hooks and blanks the panel.
 */

/** Props kandown passes to every panel. */
interface PanelProps {
  task: { id: string; frontmatter: Record<string, unknown> };
  api: {
    readField(key: string): unknown;
    readAllTasks(): Promise<Array<{ id: string; frontmatter: Record<string, unknown> }>>;
    setField(key: string, value: unknown): Promise<void>;
    refresh(): Promise<void>;
  };
  ui: {
    createElement: (...args: unknown[]) => unknown;
    useState: <T>(initial: T) => [T, (next: T) => void];
    useEffect: (effect: () => void, deps: unknown[]) => void;
  };
}

function Overview({ task, api, ui }: PanelProps) {
  const [total, setTotal] = ui.useState(0);

  ui.useEffect(() => {
    void api.readAllTasks().then((tasks) => setTotal(tasks.length));
  }, [api]);

  return ui.createElement(
    'div',
    { style: { display: 'grid', gap: '4px', fontSize: '13px' } },
    ui.createElement('div', { key: 'id' }, 'Task: ' + task.id),
    ui.createElement('div', { key: 'total' }, 'Board size: ' + total),
  );
}

export const panels = { overview: Overview };
`;
}
function agentSource(id, kind, parts) {
  return `# ${id} plugin

${parts.summary}

## Layout

- \`index.ts\`, the Node entry. Registers every contribution.
${parts.web ? "- `web.tsx`, the panel component. Bundled to `web.js`.\n" : ""}- \`manifest.json\`, identity and permissions.

## Working on it

\`\`\`bash
kandown plugin check ${id} --json   # structured verdict, fix every failing check
kandown plugin dev ${id}            # watch, rebuild, hot reload the web UI
\`\`\`

Scaffolded as \`--kind ${kind}\`. Data lives only under \`plugins.${id}.*\`.
Run \`kandown plugin brief\` for the full authoring contract.
`;
}
function scaffoldPlugin(projectDir, id, kind) {
  if (!isValidPluginId(id)) {
    throw new Error("plugin id must be kebab-case (lowercase letters, digits, hyphens)");
  }
  const dir = join35(projectDir, ".kandown", "extensions", id);
  if (existsSync28(dir)) throw new Error(`already exists: ${dir}`);
  const parts = partsFor(kind, id);
  mkdirSync14(dir, { recursive: true });
  const manifest = {
    id,
    name: title(id),
    version: "0.1.0",
    apiVersion: 1,
    description: parts.summary,
    permissions: parts.permissions,
    contributes: parts.contributes,
    agent: {
      summary: parts.summary,
      guide: "AGENT.md"
    }
  };
  const files = [];
  const write = (name, content) => {
    writeFileSync9(join35(dir, name), content, "utf8");
    files.push(name);
  };
  write("manifest.json", `${JSON.stringify(manifest, null, 2)}
`);
  write("index.ts", indexSource(id, parts));
  if (parts.web) write("web.tsx", webSource(id));
  write("AGENT.md", agentSource(id, kind, parts));
  write("README.md", `# ${title(id)}

${parts.summary}

Enable it with \`kandown plugin enable ${id}\`.
`);
  return { dir, files, kind };
}

// src/cli/lib/plugin-cli.ts
init_board_reader();
init_cli_shared();
var USAGE = `${c.cyan}kandown plugin${c.reset} ${c.dim}<create|build|check|dev|brief|publish|list|enable|disable|install|guide|purge>${c.reset}

  ${c.bold}create${c.reset} <id> [--kind ${PLUGIN_KINDS.join("|")}] [--from "<what it should do>"] [--agent <id>]
  ${c.bold}build${c.reset}  <id>            bundle index.ts and web.tsx for the browser
  ${c.bold}check${c.reset}  <id> [--json]   validate against a synthetic board
  ${c.bold}dev${c.reset}    <id>            watch, rebuild, revalidate, hot reload
  ${c.bold}brief${c.reset}                  print the full authoring contract
  ${c.bold}publish${c.reset} <id>           verify, then print the store entry`;
function resolvePluginDir(projectDir, id) {
  const found = discoverExtensions(projectDir).find((entry) => entry.manifestResult.ok ? entry.manifestResult.manifest.id === id : basename13(entry.dir) === id);
  return found?.dir ?? null;
}
function buildAgentPrompt(id, dir, kind, description) {
  return `${EXTENSION_AGENT_BRIEF}

---

# Your assignment

A plugin scaffold already exists. Turn it into this:

> ${description}

Files to edit, all under \`${dir}\`:

- \`index.ts\`, the Node entry (scaffolded as \`--kind ${kind}\`)
- \`manifest.json\`, keep \`permissions\` exactly matching what the code calls
- \`web.tsx\` if the plugin renders a panel
- \`README.md\` and \`AGENT.md\`, keep them truthful

Then run this loop until it is green, from the project root:

\`\`\`bash
kandown plugin build ${id}
kandown plugin check ${id} --json
\`\`\`

\`check\` returns \`{ ok, checks: [{ id, status, message, fix }] }\`. For every
check whose status is \`fail\`, apply its \`fix\` and run the loop again. You are
done when \`ok\` is true. Do not edit anything outside \`${dir}\`, and never write
task frontmatter outside \`plugins.${id}.*\`.`;
}
async function delegateToAgent(kandownDir, id, dir, kind, description, requestedAgent) {
  const prompt = buildAgentPrompt(id, dir, kind, description);
  const agent = requestedAgent ? getAgentById(requestedAgent, kandownDir) : detectInstalledAgents(kandownDir)[0];
  if (!agent) {
    err(requestedAgent ? `Unknown or missing agent: ${requestedAgent}` : "No coding agent CLI detected on this machine.");
    info("Paste the working order below into your agent instead:");
    log("");
    log(prompt);
    return;
  }
  const [binary, ...args] = buildAgentCommand(agent, {
    systemPrompt: prompt,
    taskPrompt: `Build the "${id}" kandown plugin described above, then make "kandown plugin check ${id}" pass.`,
    kandownDir,
    taskId: id
  });
  success(`Handing "${id}" to ${agent.name}`);
  await new Promise((resolve12) => {
    const child = spawn9(binary, args, { stdio: "inherit", env: process.env });
    child.on("error", (error) => {
      err(`Could not launch ${agent.name}: ${error.message}`);
      resolve12();
    });
    child.on("close", () => resolve12());
  });
}
async function cmdPlugin(rawArgs) {
  const args = taskParseArgs(rawArgs);
  const sub = args.positional[0];
  const json = args.flags.json === true;
  if (!sub) {
    log(USAGE);
    return;
  }
  if (["list", "ls", "enable", "disable", "install", "purge", "guide"].includes(sub)) {
    await cmdExtension(rawArgs);
    return;
  }
  if (sub === "brief") {
    log(EXTENSION_AGENT_BRIEF);
    return;
  }
  const { kandownDir } = ensureKandownDir(rawArgs);
  const projectDir = getProjectRoot(kandownDir);
  switch (sub) {
    case "create": {
      const id = args.positional[1];
      if (!id) {
        err("Usage: kandown plugin create <kebab-id> [--kind field|panel|gate|sync|command|full]");
        process.exitCode = 1;
        return;
      }
      if (!isValidPluginId(id)) {
        err("The id must be kebab-case (lowercase letters, digits, hyphens).");
        process.exitCode = 1;
        return;
      }
      const requestedKind = stringFlag(args.flags, "kind") ?? "full";
      if (!PLUGIN_KINDS.includes(requestedKind)) {
        err(`Unknown --kind "${requestedKind}". Use one of: ${PLUGIN_KINDS.join(", ")}`);
        process.exitCode = 1;
        return;
      }
      const kind = requestedKind;
      let created;
      try {
        created = scaffoldPlugin(projectDir, id, kind);
      } catch (error) {
        err(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
      }
      if (json) {
        log(JSON.stringify({ ok: true, id, dir: created.dir, kind, files: created.files, brief: EXTENSION_AGENT_BRIEF }, null, 2));
      } else {
        log(EXTENSION_AGENT_BRIEF);
        log("");
        log(`${c.bold}Scaffolded ${id}${c.reset} (--kind ${kind}) at ${created.dir}`);
        for (const file of created.files) log(`  ${c.dim}+${c.reset} ${file}`);
        log("");
        log(`${c.bold}Next${c.reset}`);
        log(`  1. edit ${join36(created.dir, "index.ts")}`);
        log(`  2. ${c.cyan}kandown plugin build ${id}${c.reset}`);
        log(`  3. ${c.cyan}kandown plugin check ${id} --json${c.reset}   ${c.dim}fix every "fail", repeat${c.reset}`);
        log(`  4. ${c.cyan}kandown plugin dev ${id}${c.reset}            ${c.dim}watch and hot reload the board${c.reset}`);
      }
      const description = stringFlag(args.flags, "from");
      if (description) {
        log("");
        await delegateToAgent(kandownDir, id, created.dir, kind, description, stringFlag(args.flags, "agent"));
      }
      return;
    }
    case "build": {
      const id = args.positional[1];
      if (!id) {
        err("Usage: kandown plugin build <id>");
        process.exitCode = 1;
        return;
      }
      const dir = resolvePluginDir(projectDir, id);
      if (!dir) {
        err(`No plugin "${id}" found. Create it with: kandown plugin create ${id}`);
        process.exitCode = 1;
        return;
      }
      const result = await buildPlugin(dir);
      if (json) {
        log(JSON.stringify(result, null, 2));
      } else {
        for (const warning of result.warnings) info(warning);
        for (const output of result.outputs) {
          success(`${basename13(output.out)} ${c.dim}${(output.bytes / 1024).toFixed(1)}kb${c.reset}`);
        }
        for (const error of result.errors) err(error);
      }
      if (!result.ok) process.exitCode = 1;
      return;
    }
    case "check": {
      const id = args.positional[1];
      if (!id) {
        err("Usage: kandown plugin check <id> [--json]");
        process.exitCode = 1;
        return;
      }
      const report = await checkPlugin(kandownDir, projectDir, id);
      log(json ? JSON.stringify(report, null, 2) : formatCheckReport(report));
      if (!report.ok) process.exitCode = 1;
      return;
    }
    case "dev": {
      const id = args.positional[1];
      if (!id) {
        err("Usage: kandown plugin dev <id>");
        process.exitCode = 1;
        return;
      }
      const dir = resolvePluginDir(projectDir, id);
      if (!dir) {
        err(`No plugin "${id}" found. Create it with: kandown plugin create ${id}`);
        process.exitCode = 1;
        return;
      }
      await runPluginDev(kandownDir, projectDir, id, dir);
      return;
    }
    case "publish": {
      const id = args.positional[1];
      if (!id) {
        err("Usage: kandown plugin publish <id>");
        process.exitCode = 1;
        return;
      }
      const dir = resolvePluginDir(projectDir, id);
      if (!dir) {
        err(`No plugin "${id}" found.`);
        process.exitCode = 1;
        return;
      }
      const build = await buildPlugin(dir);
      for (const error of build.errors) err(error);
      const report = await checkPlugin(kandownDir, projectDir, id);
      if (!build.ok || !report.ok) {
        log(formatCheckReport(report));
        err("Fix the failing checks before publishing.");
        process.exitCode = 1;
        return;
      }
      const manifestPath = join36(dir, "manifest.json");
      const manifest = existsSync29(manifestPath) ? JSON.parse(readFileSync24(manifestPath, "utf8")) : {};
      const entry = {
        id: manifest.id ?? id,
        name: manifest.name ?? id,
        author: manifest.author ?? "you",
        repo: "you/kandown-" + id,
        description: manifest.description ?? "",
        minKandownVersion: manifest.minKandownVersion ?? void 0,
        tags: []
      };
      if (json) {
        log(JSON.stringify({ ok: true, id, entry, assets: ["manifest.json", "index.js"] }, null, 2));
        return;
      }
      success(`${id} passes every check and is ready to publish`);
      log("");
      log(`${c.bold}1.${c.reset} push ${dir} to a public repo, with the built assets committed:`);
      log(`   ${c.dim}manifest.json, index.js, web.js (when it has a panel), README.md${c.reset}`);
      log(`${c.bold}2.${c.reset} open a PR on registry/extensions.json in the kandown repo, adding:`);
      log("");
      log(JSON.stringify(entry, null, 2));
      log("");
      log(`${c.bold}3.${c.reset} users then install it with ${c.cyan}kandown plugin install <repo-url>${c.reset}`);
      return;
    }
    default:
      err(`Unknown plugin subcommand: ${sub}`);
      log(USAGE);
      process.exitCode = 1;
  }
}

// src/cli/lib/themes-cli.ts
import { existsSync as existsSync30, mkdirSync as mkdirSync15, readFileSync as readFileSync25, readdirSync as readdirSync12, writeFileSync as writeFileSync10 } from "fs";
import { join as join37, resolve as resolve11 } from "path";
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
  const src = resolve11(target);
  if (existsSync30(src) && src.endsWith(".json")) {
    const text = readFileSync25(src, "utf8");
    const parsed = JSON.parse(text);
    if (!parsed.id) return { ok: false, error: "theme JSON is missing id" };
    const destDir = join37(projectDir, ".kandown", "themes");
    mkdirSync15(destDir, { recursive: true });
    writeFileSync10(join37(destDir, `${parsed.id}.json`), text, "utf8");
    return { ok: true, id: parsed.id };
  }
  return installTheme(projectDir, { url: target });
}
function listInstalledThemesForCli(projectDir) {
  const dir = join37(projectDir, ".kandown", "themes");
  if (!existsSync30(dir)) return [];
  const out = [];
  for (const file of readdirSync12(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = readFileSync25(join37(dir, file), "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.id) out.push({ id: parsed.id, name: parsed.name ?? parsed.id, author: parsed.author, description: parsed.description, version: parsed.version });
    } catch {
    }
  }
  return out;
}
function scaffoldTheme(projectDir, name) {
  const destDir = join37(projectDir, ".kandown", "themes");
  mkdirSync15(destDir, { recursive: true });
  const dest = join37(destDir, `${name}.json`);
  if (existsSync30(dest)) {
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
  writeFileSync10(dest, `${JSON.stringify(starter, null, 2)}
`, "utf8");
}
function publishTheme(file, githubUser) {
  const resolved = resolve11(file);
  if (!existsSync30(resolved)) {
    err(`Theme file not found: ${file}`);
    process.exit(1);
  }
  const raw = readFileSync25(resolved, "utf8");
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
      writeFileSync10(resolved, updatedRaw, "utf8");
      info(`Set author to @${githubUser} in ${file}.`);
    } catch {
    }
  }
  const json = existsSync30(resolved) ? readFileSync25(resolved, "utf8") : raw;
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
    case "plugin":
    case "plugins":
      await cmdPlugin(rest);
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
      if (existsSync31(join38(kandownDir, "kandown.json"))) {
        let status = await getDaemonStatus(kandownDir);
        if (!status.running) {
          status = await startProjectDaemon(kandownDir);
        }
        if (!parsed.flags["no-open"]) {
          const urlToOpen = status.metadata?.url || join38(kandownDir, "kandown.html");
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
      if (existsSync31(join38(kandownDir, "kandown.json"))) {
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
/*! Bundled license information:

chokidar/esm/index.js:
  (*! chokidar - MIT License (c) 2012 Paul Miller (paulmillr.com) *)
*/
