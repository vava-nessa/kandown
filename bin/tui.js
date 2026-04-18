// src/cli/tui.tsx
import { render } from "ink";

// src/cli/app.tsx
import { Box as Box4, Text as Text4 } from "ink";

// src/cli/screens/settings.tsx
import { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";

// src/cli/lib/config.ts
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
var DEFAULT_CONFIG = {
  ui: { language: "en", theme: "auto", skin: "kandown", font: "inter" },
  agent: { suggestFollowUp: false, maxSuggestions: 3 },
  board: {
    columns: ["Backlog", "Todo", "In Progress", "Review", "Done"],
    taskPrefix: "t",
    defaultPriority: "P3",
    defaultOwnerType: "human"
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
  const configPath = join(kandownDir, "kandown.json");
  if (!existsSync(configPath)) return structuredClone(DEFAULT_CONFIG);
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    const merged = {
      ui: { ...DEFAULT_CONFIG.ui, ...raw.ui },
      agent: { ...DEFAULT_CONFIG.agent, ...raw.agent },
      board: {
        ...DEFAULT_CONFIG.board,
        ...raw.board,
        columns: Array.isArray(raw.board?.columns) && raw.board.columns.length > 0 ? raw.board.columns.filter((name) => typeof name === "string" && name.trim().length > 0) : DEFAULT_CONFIG.board.columns
      },
      fields: { ...DEFAULT_CONFIG.fields, ...raw.fields },
      notifications: { ...DEFAULT_CONFIG.notifications, ...raw.notifications }
    };
    if (raw.agents) merged.agents = raw.agents;
    return merged;
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}
function saveConfig(kandownDir, config) {
  const configPath = join(kandownDir, "kandown.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}
function getConfigValue(config, path) {
  const parts = path.split(".");
  let current = config;
  for (const part of parts) {
    if (current === null || current === void 0) return void 0;
    current = current[part];
  }
  return current;
}
function setConfigValue(config, path, value) {
  const result = structuredClone(config);
  const parts = path.split(".");
  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
  return result;
}

// src/cli/screens/settings.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var SETTINGS = [
  // UI
  {
    key: "ui.language",
    label: "Language",
    section: "Appearance",
    type: "select",
    options: ["en", "fr", "es", "de", "pt", "ja", "zh", "ko", "it", "nl", "ru"]
  },
  {
    key: "ui.theme",
    label: "Mode",
    section: "Appearance",
    type: "select",
    options: ["auto", "light", "dark"]
  },
  {
    key: "ui.skin",
    label: "Skin",
    section: "Appearance",
    type: "select",
    options: ["kandown", "graphite", "sage", "cobalt", "rose"]
  },
  {
    key: "ui.font",
    label: "Font",
    section: "Appearance",
    type: "select",
    options: ["inter", "system", "serif", "mono", "rounded"]
  },
  // Agent
  {
    key: "agent.suggestFollowUp",
    label: "Suggest follow-up tasks",
    section: "Agent",
    type: "toggle"
  },
  {
    key: "agent.maxSuggestions",
    label: "Max suggestions",
    section: "Agent",
    type: "number",
    min: 1,
    max: 5
  },
  // Board
  {
    key: "board.taskPrefix",
    label: "Task prefix",
    section: "Board",
    type: "select",
    options: ["t", "task", "kandown", "feat", "bug", "fix", "custom"],
    allowCustom: true
  },
  {
    key: "board.defaultPriority",
    label: "Default priority",
    section: "Fields",
    type: "select",
    options: ["P1", "P2", "P3", "P4"]
  },
  {
    key: "board.defaultOwnerType",
    label: "Default owner",
    section: "Fields",
    type: "select",
    options: ["human", "ai"]
  },
  // Fields
  { key: "fields.priority", label: "Priority", section: "Fields", type: "toggle" },
  { key: "fields.assignee", label: "Assignee", section: "Fields", type: "toggle" },
  { key: "fields.tags", label: "Tags", section: "Fields", type: "toggle" },
  { key: "fields.dueDate", label: "Due date", section: "Fields", type: "toggle" },
  { key: "fields.ownerType", label: "Owner type", section: "Fields", type: "toggle" },
  { key: "fields.tools", label: "Tools", section: "Fields", type: "toggle" },
  // Notifications
  { key: "notifications.browser", label: "Browser notifications", section: "Notifications", type: "toggle" },
  { key: "notifications.statusChanges", label: "Status changes", section: "Notifications", type: "toggle" },
  { key: "notifications.taskEdits", label: "Task edits", section: "Notifications", type: "toggle" },
  { key: "notifications.subtaskCompletions", label: "Subtask completions", section: "Notifications", type: "toggle" },
  { key: "notifications.sound", label: "Play sound", section: "Notifications", type: "toggle" },
  {
    key: "notifications.soundId",
    label: "Sound",
    section: "Notifications",
    type: "select",
    options: ["soft", "chime", "ping", "pop"]
  }
];
var SECTIONS = ["Appearance", "Agent", "Board", "Fields", "Notifications"];
var LABEL_WIDTH = 30;
var VALUE_WIDTH = 20;
var SECTION_ICONS = {
  Appearance: "\u{1F3A8}",
  Agent: "\u{1F916}",
  Board: "\u{1F4CB}",
  Fields: "\u{1F4DD}",
  Notifications: "\u{1F514}"
};
function Settings({ kandownDir }) {
  const { exit } = useApp();
  const [config, setConfig] = useState(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [savedAt, setSavedAt] = useState(null);
  const [editingCustom, setEditingCustom] = useState(false);
  const [customBuffer, setCustomBuffer] = useState("");
  useEffect(() => {
    const loaded = loadConfig(kandownDir);
    setConfig(loaded);
    const presets = ["t", "task", "kandown", "feat", "bug", "fix"];
    if (!presets.includes(loaded.board.taskPrefix)) {
      setCustomBuffer(loaded.board.taskPrefix);
    }
  }, [kandownDir]);
  const persistConfig = useCallback(
    (newConfig) => {
      setConfig(newConfig);
      saveConfig(kandownDir, newConfig);
      setSavedAt(Date.now());
    },
    [kandownDir]
  );
  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setSavedAt(null), 2e3);
    return () => clearTimeout(timer);
  }, [savedAt]);
  useInput((input, key) => {
    if (!config) return;
    if (editingCustom) {
      if (key.return) {
        const prefix = customBuffer.trim() || "t";
        persistConfig(setConfigValue(config, "board.taskPrefix", prefix));
        setEditingCustom(false);
        return;
      }
      if (key.escape) {
        setEditingCustom(false);
        setCustomBuffer(
          ["t", "task", "kandown", "feat", "bug", "fix"].includes(config.board.taskPrefix) ? "" : config.board.taskPrefix
        );
        return;
      }
      if (key.backspace || key.delete) {
        setCustomBuffer((prev) => prev.slice(0, -1));
        return;
      }
      if (input && /^[a-zA-Z0-9-]$/.test(input)) {
        setCustomBuffer((prev) => prev + input);
        return;
      }
      return;
    }
    if (key.escape || input === "q") {
      exit();
      return;
    }
    if (key.upArrow) {
      setFocusIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setFocusIndex((i) => Math.min(SETTINGS.length - 1, i + 1));
      return;
    }
    const setting = SETTINGS[focusIndex];
    if (!setting) return;
    const currentValue = getConfigValue(config, setting.key);
    if (setting.type === "toggle" && (input === " " || key.return)) {
      persistConfig(setConfigValue(config, setting.key, !currentValue));
      return;
    }
    if (setting.type === "select" && setting.options) {
      const options = setting.options;
      const currentIdx = options.indexOf(String(currentValue));
      let newIdx = currentIdx;
      if (key.leftArrow) {
        newIdx = Math.max(0, currentIdx - 1);
      } else if (key.rightArrow) {
        newIdx = Math.min(options.length - 1, currentIdx + 1);
      } else if (input === " " || key.return) {
        newIdx = (currentIdx + 1) % options.length;
      } else {
        return;
      }
      const newValue = options[newIdx];
      if (newValue === "custom" && setting.allowCustom) {
        setEditingCustom(true);
        setCustomBuffer("");
        return;
      }
      persistConfig(setConfigValue(config, setting.key, newValue));
      return;
    }
    if (setting.type === "number") {
      const num = Number(currentValue);
      const min = setting.min ?? 0;
      const max = setting.max ?? 99;
      if (key.leftArrow) {
        persistConfig(setConfigValue(config, setting.key, Math.max(min, num - 1)));
      } else if (key.rightArrow) {
        persistConfig(setConfigValue(config, setting.key, Math.min(max, num + 1)));
      }
    }
  });
  if (!config) {
    return /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Loading\u2026" }) });
  }
  const showSaved = savedAt !== null;
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    /* @__PURE__ */ jsxs(Box, { justifyContent: "space-between", marginBottom: 1, children: [
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { bold: true, color: "cyan", children: "  \u256D\u2500 " }),
        /* @__PURE__ */ jsx(Text, { bold: true, color: "white", children: "KANDOWN SETTINGS" }),
        /* @__PURE__ */ jsx(Text, { bold: true, color: "cyan", children: " \u2500\u256E" })
      ] }),
      /* @__PURE__ */ jsx(Box, { children: showSaved && /* @__PURE__ */ jsxs(Text, { color: "green", bold: true, children: [
        "\u2713 saved",
        " "
      ] }) })
    ] }),
    SECTIONS.map((section) => {
      const items = SETTINGS.filter((s) => s.section === section);
      const icon = SECTION_ICONS[section] ?? "\u2022";
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
        /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { color: "cyan", bold: true, children: [
          "  ",
          icon,
          " ",
          section
        ] }) }),
        /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "  " + "\u2500".repeat(LABEL_WIDTH + VALUE_WIDTH + 4) }) }),
        items.map((setting) => {
          const globalIdx = SETTINGS.indexOf(setting);
          const focused = globalIdx === focusIndex;
          const value = getConfigValue(config, setting.key);
          return /* @__PURE__ */ jsx(
            SettingRow,
            {
              setting,
              value,
              focused,
              editingCustom: editingCustom && setting.key === "board.taskPrefix",
              customBuffer
            },
            setting.key
          );
        })
      ] }, section);
    }),
    /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "  ",
      editingCustom ? "Type prefix \u2192 Enter confirm  Esc cancel" : "\u2191\u2193 navigate   Space toggle   \u2190\u2192 change   Q quit"
    ] }) })
  ] });
}
function SettingRow({ setting, value, focused, editingCustom, customBuffer }) {
  const marker = focused ? "\u203A" : " ";
  const markerColor = focused ? "yellow" : void 0;
  const labelColor = focused ? "white" : "gray";
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsxs(Text, { color: markerColor, bold: focused, children: [
      "  ",
      marker,
      " "
    ] }),
    /* @__PURE__ */ jsx(Box, { width: LABEL_WIDTH, children: /* @__PURE__ */ jsx(Text, { color: labelColor, bold: focused, children: setting.label }) }),
    /* @__PURE__ */ jsx(Box, { width: VALUE_WIDTH, justifyContent: "flex-end", children: /* @__PURE__ */ jsx(
      ValueDisplay,
      {
        setting,
        value,
        focused,
        editingCustom,
        customBuffer
      }
    ) })
  ] });
}
function ValueDisplay({ setting, value, focused, editingCustom, customBuffer }) {
  if (editingCustom) {
    return /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Text, { color: "yellow", bold: true, children: customBuffer }),
      /* @__PURE__ */ jsx(Text, { color: "yellow", bold: true, children: "\u258F" }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "-001" })
    ] });
  }
  if (setting.type === "toggle") {
    const on = Boolean(value);
    return /* @__PURE__ */ jsx(Text, { color: on ? "green" : "gray", bold: on, children: on ? "\u25CF ON" : "\u25CB OFF" });
  }
  if (setting.type === "select" && setting.options) {
    const options = setting.options;
    const idx = options.indexOf(String(value));
    const atStart = idx <= 0;
    const atEnd = idx >= options.length - 1;
    const displayValue = String(value);
    const isPrefix = setting.key === "board.taskPrefix";
    const preview = isPrefix ? `-001` : "";
    if (focused) {
      return /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { color: atStart ? "gray" : "cyan", children: "\u25C2 " }),
        /* @__PURE__ */ jsx(Text, { color: "white", bold: true, children: displayValue }),
        preview && /* @__PURE__ */ jsx(Text, { dimColor: true, children: preview }),
        /* @__PURE__ */ jsx(Text, { color: atEnd ? "gray" : "cyan", children: " \u25B8" })
      ] });
    }
    return /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      displayValue,
      preview
    ] }) });
  }
  if (setting.type === "number") {
    const num = Number(value);
    const atMin = num <= (setting.min ?? 0);
    const atMax = num >= (setting.max ?? 99);
    if (focused) {
      return /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { color: atMin ? "gray" : "cyan", children: "\u25C2 " }),
        /* @__PURE__ */ jsx(Text, { color: "white", bold: true, children: num }),
        /* @__PURE__ */ jsx(Text, { color: atMax ? "gray" : "cyan", children: " \u25B8" })
      ] });
    }
    return /* @__PURE__ */ jsx(Text, { dimColor: true, children: num });
  }
  return /* @__PURE__ */ jsx(Text, { children: String(value) });
}

// src/cli/screens/board.tsx
import { useState as useState3, useEffect as useEffect2, useCallback as useCallback2 } from "react";
import { Box as Box3, Text as Text3, useInput as useInput3, useApp as useApp2 } from "ink";

// src/cli/lib/board-reader.ts
import { existsSync as existsSync2, readdirSync, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "fs";
import { dirname, join as join2 } from "path";

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
  return {
    id: frontmatter.id || "",
    title: frontmatter.title || frontmatter.id || "Untitled task",
    checked: /done|termin|closed|complet/i.test(status),
    tags,
    assignee: typeof frontmatter.assignee === "string" && frontmatter.assignee ? frontmatter.assignee : null,
    priority: normalizePriority(frontmatter.priority),
    ownerType: normalizeOwnerType(frontmatter.ownerType),
    progress: total > 0 ? { done, total } : null
  };
}
function buildColumnsFromTasks(tasks, configuredColumns = DEFAULT_COLUMNS) {
  const columnNames = configuredColumns.length > 0 ? configuredColumns : DEFAULT_COLUMNS;
  const columnsByName = /* @__PURE__ */ new Map();
  const configured = columnNames.map((name) => ({ name, tasks: [] }));
  for (const column of configured) columnsByName.set(column.name.toLowerCase(), column);
  const unknownColumns = [];
  const sortedTasks = [...tasks].filter((task) => Boolean(task.frontmatter.id)).sort((a, b) => {
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
        lines.push(...v.split("\n").map((line) => `  ${line}`));
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

// src/cli/lib/board-reader.ts
function getProjectRoot(kandownDir) {
  return dirname(kandownDir);
}
function listTaskIds(kandownDir) {
  const tasksDir = join2(kandownDir, "tasks");
  if (!existsSync2(tasksDir)) return [];
  return readdirSync(tasksDir).filter((name) => name.endsWith(".md")).map((name) => name.slice(0, -3)).sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
}
function readBoard(kandownDir) {
  const config = loadConfig(kandownDir);
  const tasks = listTaskIds(kandownDir).map((id) => {
    const task = readTask(kandownDir, id);
    return {
      ...task,
      frontmatter: {
        ...task.frontmatter,
        id: task.frontmatter.id || id,
        status: task.frontmatter.status || "Backlog"
      }
    };
  });
  return {
    frontmatter: null,
    title: "Project Kanban",
    columns: buildColumnsFromTasks(tasks, config.board.columns)
  };
}
function readTask(kandownDir, taskId) {
  const taskPath = join2(kandownDir, "tasks", `${taskId}.md`);
  if (!existsSync2(taskPath)) {
    return {
      frontmatter: { id: taskId, title: `Task ${taskId}`, status: "Backlog" },
      body: ""
    };
  }
  const content = readFileSync2(taskPath, "utf8");
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
function readAgentDoc(kandownDir) {
  const root = getProjectRoot(kandownDir);
  const candidates = [
    join2(root, "AGENT_KANDOWN_COMPACT.md"),
    join2(root, "AGENT_KANDOWN.md"),
    join2(kandownDir, "AGENT.md")
  ];
  for (const candidate of candidates) {
    if (existsSync2(candidate)) {
      return readFileSync2(candidate, "utf8");
    }
  }
  return "";
}
function moveTaskToColumn(kandownDir, taskId, targetColumn) {
  const taskPath = join2(kandownDir, "tasks", `${taskId}.md`);
  if (!existsSync2(taskPath)) return false;
  const parsed = readTask(kandownDir, taskId);
  writeFileSync2(taskPath, serializeTaskFile({
    ...parsed.frontmatter,
    id: taskId,
    status: targetColumn
  }, parsed.body), "utf8");
  return true;
}

// src/cli/lib/agents.ts
import { execFileSync } from "child_process";
var AGENTS = [
  {
    id: "claude",
    name: "Claude Code",
    bin: "claude",
    description: "Anthropic Claude (interactive session)",
    interactive: true,
    buildCommand: ({ systemPrompt, taskPrompt }) => {
      const combined = `${systemPrompt}

---

${taskPrompt}`;
      return ["claude", combined];
    }
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    bin: "codex",
    description: "OpenAI Codex CLI",
    interactive: true,
    buildCommand: ({ systemPrompt, taskPrompt }) => {
      const combined = `${systemPrompt}

---

${taskPrompt}`;
      return ["codex", combined];
    }
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    bin: "gemini",
    description: "Google Gemini CLI",
    interactive: true,
    buildCommand: ({ systemPrompt, taskPrompt }) => {
      const combined = `${systemPrompt}

---

${taskPrompt}`;
      return ["gemini", "-p", combined];
    }
  },
  {
    id: "goose",
    name: "Goose",
    bin: "goose",
    description: "Block open-source AI agent",
    interactive: false,
    buildCommand: ({ systemPrompt, taskPrompt }) => {
      const combined = `${systemPrompt}

---

${taskPrompt}`;
      return ["goose", "run", "--text", combined];
    }
  },
  {
    id: "aider",
    name: "Aider",
    bin: "aider",
    description: "Git-aware AI pair programmer",
    interactive: true,
    buildCommand: ({ systemPrompt, taskPrompt }) => {
      const combined = `${systemPrompt}

---

${taskPrompt}`;
      return ["aider", "--message", combined];
    }
  },
  {
    id: "opencode",
    name: "OpenCode",
    bin: "opencode",
    description: "SST AI coding TUI",
    interactive: true,
    buildCommand: ({ taskPrompt }) => {
      return ["opencode"];
    }
  }
];
var installCache = /* @__PURE__ */ new Map();
function isAgentInstalled(bin) {
  if (installCache.has(bin)) return installCache.get(bin);
  try {
    execFileSync("which", [bin], { stdio: "ignore" });
    installCache.set(bin, true);
    return true;
  } catch {
    installCache.set(bin, false);
    return false;
  }
}
function detectInstalledAgents() {
  return AGENTS.filter((agent) => isAgentInstalled(agent.bin));
}
function getAgentById(id) {
  return AGENTS.find((a) => a.id === id);
}
function buildPrompt(agentDoc, taskContent, taskId, kandownDir) {
  const systemPrompt = agentDoc.trim();
  const taskPrompt = [
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

// src/cli/lib/launcher.ts
import { execSync, spawn } from "child_process";
import { writeFileSync as writeFileSync3 } from "fs";
import { join as join3 } from "path";
import { tmpdir } from "os";
function isInTmux() {
  return !!process.env.TMUX;
}
function launchAgent(opts) {
  const { taskId, agentId, kandownDir, onBeforeExec } = opts;
  const agentDef = getAgentById(agentId);
  if (!agentDef) {
    throw new Error(`Unknown agent: ${agentId}`);
  }
  const task = readTask(kandownDir, taskId);
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
  const { systemPrompt, taskPrompt } = buildPrompt(agentDoc, taskFileContent, taskId, kandownDir);
  moveTaskToColumn(kandownDir, taskId, "In Progress");
  const contextFile = join3(tmpdir(), `kandown-${taskId}-context.md`);
  writeFileSync3(contextFile, `${systemPrompt}

---

${taskPrompt}`, "utf8");
  const launchOpts = { systemPrompt, taskPrompt, kandownDir, taskId };
  const [binary, ...args] = agentDef.buildCommand(launchOpts);
  if (!binary) {
    throw new Error(`Agent ${agentId} returned an empty command`);
  }
  if (isInTmux()) {
    const shellCmd = buildShellCmd(binary, args);
    execSync(`tmux split-window -h -p 50 ${shellescape(shellCmd)}`, {
      stdio: "inherit"
    });
  } else {
    onBeforeExec?.();
    const child = spawn(binary, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        // 📖 Expose the context file path so agents that support env vars can use it
        KANDOWN_CONTEXT_FILE: contextFile,
        KANDOWN_TASK_ID: taskId,
        KANDOWN_DIR: kandownDir
      }
    });
    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
  }
}
function buildShellCmd(binary, args) {
  const parts = [binary, ...args].map(shellescape);
  return parts.join(" ");
}
function shellescape(str) {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

// src/cli/screens/agent-picker.tsx
import { useState as useState2 } from "react";
import { Box as Box2, Text as Text2, useInput as useInput2 } from "ink";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function AgentPicker({ agents, taskId, onSelect, onCancel }) {
  const [cursor, setCursor] = useState2(0);
  useInput2((input, key) => {
    if (key.escape || input === "q") {
      onCancel();
      return;
    }
    if (key.downArrow || input === "j") {
      setCursor((c) => Math.min(c + 1, agents.length - 1));
      return;
    }
    if (key.upArrow || input === "k") {
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (key.return) {
      const agent = agents[cursor];
      if (agent) onSelect(agent.id);
      return;
    }
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= agents.length) {
      const agent = agents[num - 1];
      if (agent) onSelect(agent.id);
    }
  });
  const maxNameLen = Math.max(...agents.map((a) => a.name.length));
  const boxWidth = Math.min(60, Math.max(40, maxNameLen + 30));
  return /* @__PURE__ */ jsxs2(
    Box2,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "cyan",
      paddingX: 2,
      paddingY: 1,
      width: boxWidth,
      children: [
        /* @__PURE__ */ jsxs2(Box2, { marginBottom: 1, children: [
          /* @__PURE__ */ jsx2(Text2, { bold: true, color: "cyan", children: "SELECT AGENT" }),
          /* @__PURE__ */ jsxs2(Text2, { color: "gray", children: [
            "  ",
            "for ",
            /* @__PURE__ */ jsx2(Text2, { color: "yellow", children: taskId })
          ] })
        ] }),
        agents.map((agent, idx) => {
          const isFocused = idx === cursor;
          const numHint = idx < 9 ? `${idx + 1} ` : "  ";
          return /* @__PURE__ */ jsxs2(Box2, { children: [
            /* @__PURE__ */ jsx2(Text2, { color: "gray", dimColor: true, children: numHint }),
            /* @__PURE__ */ jsxs2(Text2, { color: isFocused ? "black" : void 0, backgroundColor: isFocused ? "cyan" : void 0, children: [
              isFocused ? "\u203A" : " ",
              " ",
              /* @__PURE__ */ jsx2(Text2, { bold: isFocused, children: agent.name }),
              "  ",
              /* @__PURE__ */ jsx2(Text2, { dimColor: !isFocused, children: agent.description })
            ] })
          ] }, agent.id);
        }),
        /* @__PURE__ */ jsx2(Box2, { marginTop: 1, children: /* @__PURE__ */ jsxs2(Text2, { color: "gray", dimColor: true, children: [
          "\u2191\u2193 or 1\u2013",
          agents.length,
          " select  Enter launch  Esc cancel"
        ] }) })
      ]
    }
  );
}

// src/cli/screens/board.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "\u2026";
}
function pad(str, len) {
  const t = truncate(str, len);
  return t + " ".repeat(Math.max(0, len - t.length));
}
function termWidth() {
  return process.stdout.columns || 80;
}
function calcColWidth(numCols) {
  const available = termWidth() - (numCols - 1);
  return Math.max(12, Math.floor(available / numCols));
}
var RE_HEADER = /^#{1,3}\s/;
var RE_SUBTASK = /^\s*-\s+\[([ xX])\]/;
var RE_DONE_SUBTASK = /^\s*-\s+\[x\]/i;
function TaskRow({
  task,
  focused,
  colWidth
}) {
  const cursor = focused ? "\u25B8" : " ";
  const check = task.checked ? "\u2713" : "\u25CB";
  const idStr = task.id;
  const available = colWidth - 4 - idStr.length - 1;
  const titleStr = truncate(task.title, Math.max(4, available));
  return /* @__PURE__ */ jsxs3(Box3, { children: [
    /* @__PURE__ */ jsxs3(Text3, { color: focused ? "cyan" : void 0, bold: focused, children: [
      cursor,
      " "
    ] }),
    /* @__PURE__ */ jsxs3(Text3, { color: task.checked ? "green" : focused ? "white" : "gray", children: [
      check,
      " "
    ] }),
    /* @__PURE__ */ jsx3(Text3, { color: focused ? "cyan" : "yellow", bold: focused, children: idStr }),
    /* @__PURE__ */ jsxs3(Text3, { color: focused ? "white" : "gray", children: [
      " ",
      titleStr
    ] })
  ] });
}
function KanbanColumn({
  name,
  tasks,
  focusedRow,
  isFocused,
  colWidth
}) {
  const headerBg = isFocused ? "cyan" : void 0;
  const headerColor = isFocused ? "black" : "cyan";
  const countStr = tasks.length > 0 ? ` (${tasks.length})` : "";
  const headerText = truncate(`${name}${countStr}`, colWidth);
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", width: colWidth, marginRight: 1, children: [
    /* @__PURE__ */ jsx3(Box3, { backgroundColor: headerBg, children: /* @__PURE__ */ jsx3(Text3, { color: headerColor, bold: true, children: pad(headerText, colWidth) }) }),
    /* @__PURE__ */ jsx3(Text3, { color: isFocused ? "cyan" : "gray", children: "\u2500".repeat(colWidth) }),
    tasks.length === 0 ? /* @__PURE__ */ jsxs3(Text3, { color: "gray", dimColor: true, children: [
      " ".repeat(2),
      "(empty)"
    ] }) : tasks.map((task, idx) => /* @__PURE__ */ jsx3(
      TaskRow,
      {
        task,
        focused: isFocused && idx === focusedRow,
        colWidth
      },
      task.id
    ))
  ] });
}
function BoardHeader({ title, inTmux }) {
  const tmuxHint = inTmux ? " tmux" : "";
  return /* @__PURE__ */ jsxs3(Box3, { marginBottom: 1, justifyContent: "space-between", children: [
    /* @__PURE__ */ jsxs3(Text3, { bold: true, color: "cyan", children: [
      "  ",
      "KANDOWN",
      tmuxHint,
      "  ",
      title
    ] }),
    /* @__PURE__ */ jsx3(Text3, { color: "gray", dimColor: true, children: "h/l cols  j/k tasks  Enter detail  a agent  r reload  q quit" })
  ] });
}
function StatusBar({ message, task }) {
  if (message) {
    return /* @__PURE__ */ jsx3(Box3, { marginTop: 1, children: /* @__PURE__ */ jsx3(Text3, { color: "yellow", children: message }) });
  }
  if (!task) return /* @__PURE__ */ jsx3(Box3, { marginTop: 1, children: /* @__PURE__ */ jsx3(Text3, { color: "gray", children: " " }) });
  return /* @__PURE__ */ jsx3(Box3, { marginTop: 1, children: /* @__PURE__ */ jsxs3(Text3, { color: "gray", children: [
    task.id,
    task.progress ? `  (${task.progress.done}/${task.progress.total})` : "",
    "  ",
    task.checked ? "\u2713 done" : "\u25CB open"
  ] }) });
}
function TaskDetail({
  task,
  taskId,
  scrollOffset
}) {
  const fm = task.frontmatter;
  const bodyLines = task.body.split("\n");
  const maxVisible = (process.stdout.rows || 24) - 10;
  const visibleLines = bodyLines.slice(scrollOffset, scrollOffset + maxVisible);
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", paddingX: 2, children: [
    /* @__PURE__ */ jsxs3(Box3, { marginBottom: 1, children: [
      /* @__PURE__ */ jsx3(Text3, { bold: true, color: "cyan", children: taskId }),
      /* @__PURE__ */ jsxs3(Text3, { color: "white", bold: true, children: [
        "  ",
        fm.title
      ] })
    ] }),
    /* @__PURE__ */ jsx3(Box3, { marginBottom: 1, children: /* @__PURE__ */ jsxs3(Text3, { color: "gray", children: [
      "status: ",
      /* @__PURE__ */ jsx3(Text3, { color: "yellow", children: fm.status ?? "\u2014" }),
      fm.priority ? `  priority: ${fm.priority}` : "",
      fm.assignee ? `  assignee: ${fm.assignee}` : "",
      fm.due ? `  due: ${fm.due}` : ""
    ] }) }),
    /* @__PURE__ */ jsx3(Text3, { color: "gray", children: "\u2500".repeat(termWidth() - 4) }),
    visibleLines.map((line, idx) => {
      const isHeader = RE_HEADER.test(line);
      const isSubtask = RE_SUBTASK.test(line);
      const isDone = RE_DONE_SUBTASK.test(line);
      return /* @__PURE__ */ jsx3(
        Text3,
        {
          color: isHeader ? "cyan" : isDone ? "green" : isSubtask ? "white" : "gray",
          bold: isHeader,
          children: line || " "
        },
        scrollOffset + idx
      );
    }),
    bodyLines.length > maxVisible && /* @__PURE__ */ jsxs3(Text3, { color: "gray", dimColor: true, children: [
      "  ",
      "\u2191\u2193 scroll  (",
      scrollOffset + 1,
      "\u2013",
      Math.min(scrollOffset + maxVisible, bodyLines.length),
      "/",
      bodyLines.length,
      " lines)"
    ] })
  ] });
}
function Board({ kandownDir }) {
  const { exit } = useApp2();
  const [board, setBoard] = useState3(null);
  const [colIndex, setColIndex] = useState3(0);
  const [rowIndex, setRowIndex] = useState3(0);
  const [mode, setMode] = useState3("browse");
  const [detailTask, setDetailTask] = useState3(null);
  const [detailTaskId, setDetailTaskId] = useState3("");
  const [detailScroll, setDetailScroll] = useState3(0);
  const [installedAgents, setInstalledAgents] = useState3([]);
  const [statusMsg, setStatusMsg] = useState3("");
  const inTmux = isInTmux();
  useEffect2(() => {
    const loaded = readBoard(kandownDir);
    setBoard(loaded);
    setInstalledAgents(detectInstalledAgents());
  }, [kandownDir]);
  const reloadBoard = useCallback2(() => {
    const loaded = readBoard(kandownDir);
    setBoard(loaded);
    setStatusMsg("Board reloaded");
    setTimeout(() => setStatusMsg(""), 1500);
  }, [kandownDir]);
  const getFocusedTask = useCallback2(() => {
    if (!board) return null;
    const col = board.columns[colIndex];
    if (!col || col.tasks.length === 0) return null;
    return col.tasks[Math.min(rowIndex, col.tasks.length - 1)] ?? null;
  }, [board, colIndex, rowIndex]);
  const openDetail = useCallback2((taskId) => {
    const task = readTask(kandownDir, taskId);
    setDetailTask(task);
    setDetailTaskId(taskId);
    setDetailScroll(0);
    setMode("detail");
  }, [kandownDir]);
  const handleAgentSelect = useCallback2((agentId) => {
    const task = getFocusedTask();
    const taskId = mode === "detail" ? detailTaskId : task?.id;
    if (!taskId) return;
    setMode("browse");
    setStatusMsg(`Launching ${agentId} for ${taskId}\u2026`);
    setTimeout(() => {
      try {
        launchAgent({
          taskId,
          agentId,
          kandownDir,
          onBeforeExec: () => exit()
        });
        reloadBoard();
        setStatusMsg(`${agentId} launched in tmux pane`);
        setTimeout(() => setStatusMsg(""), 3e3);
      } catch (err) {
        setStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
        setTimeout(() => setStatusMsg(""), 4e3);
      }
    }, 50);
  }, [mode, detailTaskId, getFocusedTask, kandownDir, exit, reloadBoard]);
  useInput3((input, key) => {
    if (mode === "browse") {
      if (input === "q" || key.escape) {
        exit();
        return;
      }
      if (input === "r") {
        reloadBoard();
        return;
      }
      if (input === "l" || key.rightArrow) {
        const maxCol = (board?.columns.length ?? 1) - 1;
        setColIndex((c) => Math.min(c + 1, maxCol));
        setRowIndex(0);
        return;
      }
      if (input === "h" || key.leftArrow) {
        setColIndex((c) => Math.max(c - 1, 0));
        setRowIndex(0);
        return;
      }
      if (input === "j" || key.downArrow) {
        const col = board?.columns[colIndex];
        const max = Math.max(0, (col?.tasks.length ?? 1) - 1);
        setRowIndex((r) => Math.min(r + 1, max));
        return;
      }
      if (input === "k" || key.upArrow) {
        setRowIndex((r) => Math.max(r - 1, 0));
        return;
      }
      if (key.return) {
        const task = getFocusedTask();
        if (task) openDetail(task.id);
        return;
      }
      if (input === "a") {
        if (installedAgents.length === 0) {
          setStatusMsg("No AI agents found in PATH (install claude, codex, aider, goose\u2026)");
          setTimeout(() => setStatusMsg(""), 3e3);
          return;
        }
        const task = getFocusedTask();
        if (!task) return;
        setMode("agent-picker");
        return;
      }
    }
    if (mode === "detail") {
      if (key.escape || input === "q") {
        setMode("browse");
        return;
      }
      if (input === "j" || key.downArrow) {
        setDetailScroll((s) => s + 1);
        return;
      }
      if (input === "k" || key.upArrow) {
        setDetailScroll((s) => Math.max(0, s - 1));
        return;
      }
      if (input === "a") {
        if (installedAgents.length === 0) {
          setStatusMsg("No AI agents found in PATH");
          setTimeout(() => setStatusMsg(""), 3e3);
          return;
        }
        setMode("agent-picker");
        return;
      }
    }
  });
  if (!board) {
    return /* @__PURE__ */ jsx3(Box3, { padding: 2, children: /* @__PURE__ */ jsx3(Text3, { color: "gray", children: "Loading board\u2026" }) });
  }
  if (board.columns.length === 0) {
    return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", padding: 2, children: [
      /* @__PURE__ */ jsxs3(Text3, { color: "red", bold: true, children: [
        "No board found at ",
        kandownDir
      ] }),
      /* @__PURE__ */ jsxs3(Text3, { color: "gray", children: [
        "Run ",
        /* @__PURE__ */ jsx3(Text3, { color: "cyan", children: "kandown init" }),
        " to set up kandown in this project."
      ] })
    ] });
  }
  const colWidth = calcColWidth(board.columns.length);
  const focusedTask = getFocusedTask();
  if (mode === "agent-picker") {
    const taskId = detailTaskId || focusedTask?.id || "";
    return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx3(BoardHeader, { title: board.title, inTmux }),
      /* @__PURE__ */ jsx3(
        AgentPicker,
        {
          agents: installedAgents,
          taskId,
          onSelect: handleAgentSelect,
          onCancel: () => setMode(detailTaskId ? "detail" : "browse")
        }
      )
    ] });
  }
  if (mode === "detail" && detailTask) {
    return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs3(Box3, { marginBottom: 1, justifyContent: "space-between", children: [
        /* @__PURE__ */ jsx3(Text3, { color: "gray", children: "Esc back  a launch agent  j/k scroll" }),
        /* @__PURE__ */ jsxs3(Text3, { color: "gray", dimColor: true, children: [
          "KANDOWN  ",
          board.title
        ] })
      ] }),
      /* @__PURE__ */ jsx3(TaskDetail, { task: detailTask, taskId: detailTaskId, scrollOffset: detailScroll }),
      statusMsg && /* @__PURE__ */ jsx3(Box3, { marginTop: 1, children: /* @__PURE__ */ jsx3(Text3, { color: "yellow", children: statusMsg }) })
    ] });
  }
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx3(BoardHeader, { title: board.title, inTmux }),
    /* @__PURE__ */ jsx3(Box3, { flexDirection: "row", children: board.columns.map((col, cIdx) => /* @__PURE__ */ jsx3(
      KanbanColumn,
      {
        name: col.name,
        tasks: col.tasks,
        focusedRow: cIdx === colIndex ? rowIndex : -1,
        isFocused: cIdx === colIndex,
        colWidth
      },
      col.name
    )) }),
    /* @__PURE__ */ jsx3(StatusBar, { message: statusMsg, task: focusedTask })
  ] });
}

// src/cli/app.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function App({ screen, kandownDir }) {
  switch (screen) {
    case "settings":
      return /* @__PURE__ */ jsx4(Settings, { kandownDir });
    case "board":
      return /* @__PURE__ */ jsx4(Board, { kandownDir });
    default:
      return /* @__PURE__ */ jsx4(Box4, { padding: 2, children: /* @__PURE__ */ jsxs4(Text4, { color: "red", bold: true, children: [
        "Unknown screen: ",
        screen
      ] }) });
  }
}

// src/cli/tui.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
async function run(screen, kandownDir) {
  if (!process.stdin.isTTY) {
    throw new Error(
      "kandown TUI requires an interactive terminal. Run this command directly in your terminal."
    );
  }
  process.stdout.write("\x1B[?1049h\x1B[H");
  const instance = render(/* @__PURE__ */ jsx5(App, { screen, kandownDir }), {
    exitOnCtrlC: true
  });
  try {
    await instance.waitUntilExit();
  } finally {
    process.stdout.write("\x1B[?1049l");
  }
}
export {
  run
};
