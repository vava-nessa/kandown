/**
 * @file Shared Kandown config normalization
 * @description Converts unknown kandown.json input into the canonical config
 * contract used by browser and Node adapters. This module stays pure so every
 * interface applies identical defaults, legacy migrations, and column roles.
 *
 * @functions
 *  → normalizeKandownConfig - safely normalizes unknown config input
 *  → detailModeFromLegacyBaseRulesMode - maps legacy instruction density
 *  → resolveColumnRole - resolves one configured column's semantic role
 *  → resolveColumnNameByRole - finds the first board-ordered column with a semantic role
 *  → resolveColumnNamesByRole - finds every column with a semantic role
 *
 * @exports normalizeKandownConfig, detailModeFromLegacyBaseRulesMode,
 *          resolveColumnRole, resolveColumnNameByRole, resolveColumnNamesByRole
 * @see src/lib/types.ts
 * @see src/lib/filesystem.ts
 * @see src/cli/lib/config.ts
 */

import {
  DEFAULT_COLUMN_META,
  DEFAULT_CONFIG,
  DEFAULT_WORK_OUTPUT,
} from './types';
import type {
  AgentsConfig,
  ColumnAgentMeta,
  ColumnColor,
  ColumnRole,
  FontId,
  KandownConfig,
  KandownTheme,
  NotificationSoundId,
  TaskTrackingCadence,
  ThemeMode,
  WorkOutputBaseRulesMode,
  WorkOutputDetailMode,
} from './types';

const COLUMN_ROLES: readonly ColumnRole[] = [
  'backlog',
  'ready',
  'active',
  'review',
  'terminal',
  'custom',
];
const DETAIL_MODES: readonly WorkOutputDetailMode[] = ['caveman', 'standard', 'complete'];
const TRACKING_CADENCES: readonly TaskTrackingCadence[] = ['live', 'balanced', 'economy'];
const BASE_RULES_MODES: readonly WorkOutputBaseRulesMode[] = [
  'verbose',
  'optimized',
  'caveman',
  'full',
  'concise',
];
const COLUMN_COLORS: readonly ColumnColor[] = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'slate',
  'gray',
  'zinc',
  'black',
  'blackTransparent',
];
const FONT_IDS: readonly FontId[] = ['inter', 'system', 'serif', 'mono', 'rounded'];
const THEME_MODES: readonly ThemeMode[] = ['auto', 'light', 'dark'];
const SOUND_IDS: readonly NotificationSoundId[] = ['soft', 'chime', 'ping', 'pop'];

function safeObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )];
}

function normalizeColumns(value: unknown): string[] {
  const columns = stringList(value);
  return columns.length > 0 ? columns : [...DEFAULT_CONFIG.board.columns];
}

function lookupCaseInsensitive(
  record: Record<string, unknown>,
  key: string,
): unknown {
  if (Object.hasOwn(record, key)) return record[key];
  const normalizedKey = key.toLocaleLowerCase();
  const match = Object.keys(record).find(
    (candidate) => candidate.toLocaleLowerCase() === normalizedKey,
  );
  return match === undefined ? undefined : record[match];
}

function normalizeColumnMeta(
  columns: string[],
  value: unknown,
): Record<string, ColumnAgentMeta> {
  const rawMeta = safeObject(value);
  const defaultMeta = safeObject(DEFAULT_COLUMN_META);
  const normalized: Record<string, ColumnAgentMeta> = {};

  for (const column of columns) {
    const rawValue = lookupCaseInsensitive(rawMeta, column);
    const hasRawMeta = rawValue !== null
      && typeof rawValue === 'object'
      && !Array.isArray(rawValue);
    const raw = safeObject(rawValue);
    const fallback = safeObject(lookupCaseInsensitive(defaultMeta, column));
    const role = isOneOf(raw.role, COLUMN_ROLES)
      ? raw.role
      : isOneOf(fallback.role, COLUMN_ROLES)
        ? fallback.role
        : 'custom';
    const instructions = hasRawMeta
      ? typeof raw.instructions === 'string' ? raw.instructions.trim() : undefined
      : typeof fallback.instructions === 'string' ? fallback.instructions : undefined;

    normalized[column] = instructions
      ? { role, instructions }
      : { role };
  }

  return normalized;
}

function normalizeColumnColors(value: unknown): Record<string, ColumnColor> {
  const normalized: Record<string, ColumnColor> = {
    ...(DEFAULT_CONFIG.board.columnColors ?? {}),
  };
  for (const [key, color] of Object.entries(safeObject(value))) {
    if (isOneOf(color, COLUMN_COLORS)) normalized[key] = color;
  }
  return normalized;
}

function normalizeWipLimits(value: unknown): Record<string, number> | undefined {
  const normalized: Record<string, number> = {};
  for (const [key, limit] of Object.entries(safeObject(value))) {
    if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 0) {
      normalized[key] = limit;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeExtraArgs(value: unknown): Record<string, string[]> | undefined {
  const normalized: Record<string, string[]> = {};
  for (const [agentId, args] of Object.entries(safeObject(value))) {
    if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) continue;
    normalized[agentId] = [...args];
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeAgents(value: unknown): AgentsConfig | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = safeObject(value);
  const agents: AgentsConfig = {};
  if (typeof raw.preferred === 'string' && raw.preferred.trim()) {
    agents.preferred = raw.preferred;
  }
  const extraArgs = normalizeExtraArgs(raw.extraArgs);
  if (extraArgs) agents.extraArgs = extraArgs;
  return agents;
}

function normalizeCustomThemes(value: unknown): KandownTheme[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const themes = value.filter((entry): entry is KandownTheme => {
    const theme = safeObject(entry);
    return typeof theme.id === 'string'
      && typeof theme.name === 'string'
      && Object.keys(safeObject(theme.appearance)).length > 0
      && Object.keys(safeObject(theme.light)).length > 0
      && Object.keys(safeObject(theme.dark)).length > 0;
  });
  return themes.length > 0 ? [...themes] : undefined;
}

/** Maps every legacy base-rules density to the canonical detail mode. */
export function detailModeFromLegacyBaseRulesMode(
  mode: WorkOutputBaseRulesMode,
): WorkOutputDetailMode {
  if (mode === 'caveman') return 'caveman';
  if (mode === 'concise' || mode === 'optimized') return 'standard';
  return 'complete';
}

/** Converts an unknown parsed JSON value into the full canonical config. */
export function normalizeKandownConfig(raw: unknown): KandownConfig {
  const root = safeObject(raw);
  const ui = safeObject(root.ui);
  const agent = safeObject(root.agent);
  const workOutput = safeObject(agent.workOutput);
  const boardDigest = safeObject(workOutput.boardDigest);
  const workflow = safeObject(root.workflow);
  const board = safeObject(root.board);
  const tui = safeObject(root.tui);
  const tuiColumns = safeObject(tui.columns);
  const fields = safeObject(root.fields);
  const notifications = safeObject(root.notifications);
  const extensions = safeObject(root.extensions);

  const baseRulesMode = isOneOf(workOutput.baseRulesMode, BASE_RULES_MODES)
    ? workOutput.baseRulesMode
    : 'full';
  const detailMode = isOneOf(workOutput.detailMode, DETAIL_MODES)
    ? workOutput.detailMode
    : detailModeFromLegacyBaseRulesMode(baseRulesMode);
  const columns = normalizeColumns(board.columns);
  const customThemes = normalizeCustomThemes(ui.customThemes);
  const wipLimits = normalizeWipLimits(board.wipLimits);

  const config: KandownConfig = {
    ui: {
      language: stringOr(ui.language, DEFAULT_CONFIG.ui.language),
      theme: isOneOf(ui.theme, THEME_MODES) ? ui.theme : DEFAULT_CONFIG.ui.theme,
      skin: stringOr(ui.skin, DEFAULT_CONFIG.ui.skin),
      font: isOneOf(ui.font, FONT_IDS) ? ui.font : DEFAULT_CONFIG.ui.font,
      background: ui.background === 'static-gradient' ? 'static-gradient' : 'solid',
      onboardingCompleted: booleanOr(
        ui.onboardingCompleted,
        DEFAULT_CONFIG.ui.onboardingCompleted,
      ),
      ...(customThemes ? { customThemes } : {}),
    },
    agent: {
      suggestFollowUp: booleanOr(
        agent.suggestFollowUp,
        DEFAULT_CONFIG.agent.suggestFollowUp,
      ),
      maxSuggestions: numberOr(agent.maxSuggestions, DEFAULT_CONFIG.agent.maxSuggestions),
      workOutput: {
        detailMode,
        boardDigest: {
          showColumnCounts: booleanOr(
            boardDigest.showColumnCounts,
            DEFAULT_WORK_OUTPUT.boardDigest.showColumnCounts,
          ),
          showTasks: booleanOr(
            boardDigest.showTasks,
            DEFAULT_WORK_OUTPUT.boardDigest.showTasks,
          ),
          showPriority: booleanOr(
            boardDigest.showPriority,
            DEFAULT_WORK_OUTPUT.boardDigest.showPriority,
          ),
          showAssignee: booleanOr(
            boardDigest.showAssignee,
            DEFAULT_WORK_OUTPUT.boardDigest.showAssignee,
          ),
          showBlockedBy: booleanOr(
            boardDigest.showBlockedBy,
            DEFAULT_WORK_OUTPUT.boardDigest.showBlockedBy,
          ),
          showNextActionable: booleanOr(
            boardDigest.showNextActionable,
            DEFAULT_WORK_OUTPUT.boardDigest.showNextActionable,
          ),
        },
      },
    },
    workflow: {
      active: stringOr(workflow.active, DEFAULT_CONFIG.workflow.active),
      skills: stringList(workflow.skills),
      trackingCadence: isOneOf(workflow.trackingCadence, TRACKING_CADENCES)
        ? workflow.trackingCadence
        : DEFAULT_CONFIG.workflow.trackingCadence,
    },
    board: {
      columns,
      defaultPriority: stringOr(board.defaultPriority, DEFAULT_CONFIG.board.defaultPriority),
      defaultOwnerType: board.defaultOwnerType === 'ai' ? 'ai' : 'human',
      columnColors: normalizeColumnColors(board.columnColors),
      columnMeta: normalizeColumnMeta(columns, board.columnMeta),
      stackDefaultState: board.stackDefaultState === 'expanded' ? 'expanded' : 'collapsed',
      ...(wipLimits ? { wipLimits } : {}),
    },
    tui: {
      defaultView: tui.defaultView === 'board' ? 'board' : 'list',
      showDetailPane: booleanOr(tui.showDetailPane, DEFAULT_CONFIG.tui.showDetailPane),
      listSort: tui.listSort === 'age'
        || tui.listSort === 'priority'
        || tui.listSort === 'id'
        ? tui.listSort
        : 'status',
      listSortDir: tui.listSortDir === 'desc' ? 'desc' : 'asc',
      columns: {
        age: booleanOr(tuiColumns.age, DEFAULT_CONFIG.tui.columns.age),
        status: booleanOr(tuiColumns.status, DEFAULT_CONFIG.tui.columns.status),
        priority: booleanOr(tuiColumns.priority, DEFAULT_CONFIG.tui.columns.priority),
        owner: booleanOr(tuiColumns.owner, DEFAULT_CONFIG.tui.columns.owner),
        deps: booleanOr(tuiColumns.deps, DEFAULT_CONFIG.tui.columns.deps),
        tags: booleanOr(tuiColumns.tags, DEFAULT_CONFIG.tui.columns.tags),
        assignee: booleanOr(tuiColumns.assignee, DEFAULT_CONFIG.tui.columns.assignee),
      },
    },
    fields: {
      priority: booleanOr(fields.priority, DEFAULT_CONFIG.fields.priority),
      assignee: booleanOr(fields.assignee, DEFAULT_CONFIG.fields.assignee),
      tags: booleanOr(fields.tags, DEFAULT_CONFIG.fields.tags),
      dueDate: booleanOr(fields.dueDate, DEFAULT_CONFIG.fields.dueDate),
      ownerType: booleanOr(fields.ownerType, DEFAULT_CONFIG.fields.ownerType),
      tools: booleanOr(fields.tools, DEFAULT_CONFIG.fields.tools),
    },
    notifications: {
      browser: booleanOr(notifications.browser, DEFAULT_CONFIG.notifications.browser),
      sound: booleanOr(notifications.sound, DEFAULT_CONFIG.notifications.sound),
      soundId: isOneOf(notifications.soundId, SOUND_IDS)
        ? notifications.soundId
        : DEFAULT_CONFIG.notifications.soundId,
      statusChanges: booleanOr(
        notifications.statusChanges,
        DEFAULT_CONFIG.notifications.statusChanges,
      ),
      taskEdits: booleanOr(notifications.taskEdits, DEFAULT_CONFIG.notifications.taskEdits),
      subtaskCompletions: booleanOr(
        notifications.subtaskCompletions,
        DEFAULT_CONFIG.notifications.subtaskCompletions,
      ),
      editDebounceMs: numberOr(
        notifications.editDebounceMs,
        DEFAULT_CONFIG.notifications.editDebounceMs,
      ),
      ...(typeof notifications.webhookUrl === 'string'
        ? { webhookUrl: notifications.webhookUrl }
        : {}),
    },
    extensions: {
      restricted: booleanOr(extensions.restricted, DEFAULT_CONFIG.extensions.restricted),
    },
  };

  const agents = normalizeAgents(root.agents);
  if (agents) config.agents = agents;
  return config;
}

/** Returns one configured column's semantic role, defaulting to custom. */
export function resolveColumnRole(
  config: Pick<KandownConfig, 'board'>,
  columnName: string,
): ColumnRole {
  const rawMeta = safeObject(config.board.columnMeta);
  const meta = safeObject(lookupCaseInsensitive(rawMeta, columnName));
  return isOneOf(meta.role, COLUMN_ROLES) ? meta.role : 'custom';
}

/** Returns every configured column carrying the requested semantic role. */
export function resolveColumnNamesByRole(
  config: Pick<KandownConfig, 'board'>,
  role: ColumnRole,
): string[] {
  return config.board.columns.filter(
    (columnName) => resolveColumnRole(config, columnName) === role,
  );
}

/** Returns the first configured column carrying the requested semantic role. */
export function resolveColumnNameByRole(
  config: Pick<KandownConfig, 'board'>,
  role: ColumnRole,
): string | undefined {
  return resolveColumnNamesByRole(config, role)[0];
}
