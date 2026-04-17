// src/cli/tui.tsx
import { render } from "ink";

// src/cli/app.tsx
import { Box as Box2, Text as Text2 } from "ink";

// src/cli/screens/settings.tsx
import { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";

// src/cli/lib/config.ts
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
var DEFAULT_CONFIG = {
  ui: { language: "en", theme: "auto" },
  agent: { suggestFollowUp: false, maxSuggestions: 3 },
  board: { taskPrefix: "t", defaultPriority: "P3", defaultOwnerType: "human" },
  fields: {
    priority: false,
    assignee: false,
    tags: false,
    dueDate: false,
    ownerType: false
  }
};
function loadConfig(kandownDir) {
  const configPath = join(kandownDir, "kandown.json");
  if (!existsSync(configPath)) return structuredClone(DEFAULT_CONFIG);
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    return {
      ui: { ...DEFAULT_CONFIG.ui, ...raw.ui },
      agent: { ...DEFAULT_CONFIG.agent, ...raw.agent },
      board: { ...DEFAULT_CONFIG.board, ...raw.board },
      fields: { ...DEFAULT_CONFIG.fields, ...raw.fields }
    };
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
    section: "UI",
    type: "select",
    options: ["en", "fr", "es", "de", "pt", "ja", "zh", "ko", "it", "nl", "ru"]
  },
  {
    key: "ui.theme",
    label: "Theme",
    section: "UI",
    type: "select",
    options: ["auto", "light", "dark"]
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
    section: "Board",
    type: "select",
    options: ["P1", "P2", "P3", "P4"]
  },
  {
    key: "board.defaultOwnerType",
    label: "Default owner",
    section: "Board",
    type: "select",
    options: ["human", "ai"]
  },
  // Fields
  { key: "fields.priority", label: "Priority", section: "Fields", type: "toggle" },
  { key: "fields.assignee", label: "Assignee", section: "Fields", type: "toggle" },
  { key: "fields.tags", label: "Tags", section: "Fields", type: "toggle" },
  { key: "fields.dueDate", label: "Due date", section: "Fields", type: "toggle" },
  { key: "fields.ownerType", label: "Owner type", section: "Fields", type: "toggle" }
];
var SECTIONS = ["UI", "Agent", "Board", "Fields"];
var LABEL_WIDTH = 30;
var VALUE_WIDTH = 20;
var SECTION_ICONS = {
  UI: "\u{1F3A8}",
  Agent: "\u{1F916}",
  Board: "\u{1F4CB}",
  Fields: "\u{1F4DD}"
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

// src/cli/app.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function App({ screen, kandownDir }) {
  switch (screen) {
    case "settings":
      return /* @__PURE__ */ jsx2(Settings, { kandownDir });
    default:
      return /* @__PURE__ */ jsx2(Box2, { padding: 2, children: /* @__PURE__ */ jsxs2(Text2, { color: "red", bold: true, children: [
        "Unknown screen: ",
        screen
      ] }) });
  }
}

// src/cli/tui.tsx
import { jsx as jsx3 } from "react/jsx-runtime";
async function run(screen, kandownDir) {
  if (!process.stdin.isTTY) {
    throw new Error(
      "kandown TUI requires an interactive terminal. Run this command directly in your terminal."
    );
  }
  process.stdout.write("\x1B[?1049h\x1B[H");
  const instance = render(/* @__PURE__ */ jsx3(App, { screen, kandownDir }), {
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
