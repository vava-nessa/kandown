/**
 * @file Extension system types and public API contract
 * @description The single source of truth for the extension surface: the
 * manifest shape, the contribution-point definitions, the lifecycle events,
 * the context handed to handlers, and the `KandownExtensionAPI` an extension
 * factory receives. Pure types only, no Node or React imports, so the CLI
 * (Node, tsup), the daemon and the web UI all share the same contract.
 *
 * 📖 An extension is a module that exports a default factory receiving a
 * `KandownExtensionAPI`. The factory registers contributions (fields, panels,
 * commands, gates, syncs) and subscribes to lifecycle events. Everything an
 * extension persists lives under the opaque `plugins.<id>.*` frontmatter
 * namespace; see docs/EXTENSIONS.md.
 *
 * @exports ExtensionManifest, ExtensionHealth, LoadedExtension, FieldContribution, WebPanelContribution, CommandContribution, GateContribution, SyncContribution, TaskLike, TaskEvent, GateEvent, ExtensionContext, ExtensionCommandContext, KandownExtensionAPI, ExtensionFactory
 * @see docs/EXTENSIONS.md
 * @see src/lib/extensions/host.ts
 */

/** Health state of an installed extension. Only `enabled` ones run. */
export type ExtensionHealth = 'enabled' | 'disabled' | 'quarantined' | 'errored';

/** Supported field types. Stored as a string on disk, coerced by the namespace helper on read. */
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'select';

/**
 * 📖 The manifest is metadata plus display hints. It is what the store gallery
 * and the settings panel show without executing extension code. The runtime
 * registrations in the factory are authoritative; `contributes` is best-effort
 * display and is surfaced by `kandown extension doctor`.
 */
export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  /** Extension API version this targets. Currently 1. */
  apiVersion: number;
  /** Semver gate: refuses to load on older kandown installs. */
  minKandownVersion?: string;
  author?: string;
  description?: string;
  homepage?: string;
  /** Declared capabilities, enforced at runtime by the permissions layer. */
  permissions?: string[];
  /** Node entry, relative to the extension dir. Defaults to `./index.js`. */
  main?: string;
  /** Display-only contribution ids, for the gallery and settings. */
  contributes?: {
    fields?: string[];
    webPanels?: string[];
    commands?: string[];
    gates?: string[];
    syncs?: string[];
  };
}

/** A simplified, read-only view of a task handed to extension handlers. */
export interface TaskLike {
  id: string;
  frontmatter: Record<string, unknown>;
  /** Convenience accessor for the `plugins` namespace (also reachable via frontmatter). */
  plugins?: Record<string, unknown>;
}

/** A task lifecycle event payload. `from`/`to` are column/status names when relevant. */
export interface TaskEvent {
  task: TaskLike;
  from?: string;
  to?: string;
}

/** Gate events reuse the task event shape; handlers may return a verdict. */
export interface GateEvent extends TaskEvent {}

/** Verdict a gate handler may return. Absent or `{}` means "no objection". */
export interface GateVerdict {
  block?: boolean;
  reason?: string;
}

/**
 * 📖 The context every handler receives. It is deliberately scoped: extensions
 * never get the raw daemon token, the React store, or direct filesystem handles.
 * `board.read*` and `setField` are proxied by the host and checked against the
 * extension's declared permissions.
 */
export interface ExtensionContext {
  /** The id of the extension this context belongs to. */
  extId: string;
  /** Abort signal for nested async work, when the host can provide one. */
  signal?: AbortSignal;
  board: {
    readAll(): Promise<TaskLike[]>;
    read(taskId: string): Promise<TaskLike | null>;
  };
  /** Write a field under this extension's own `plugins.<extId>.<key>` namespace. */
  setField(taskId: string, key: string, value: unknown): Promise<void>;
  log: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
  /** `fetch`, available only when the extension declared a `net:*` permission. */
  fetch?: typeof fetch;
}

/** Command handlers get the base context. Reserved for command-only extras. */
export type ExtensionCommandContext = ExtensionContext;

/** A custom task field stored under `plugins.<extId>.<key>`. */
export interface FieldContribution {
  key: string;
  label: string;
  type: FieldType;
  /** For `select` fields. */
  options?: { value: string; label: string }[];
  /** Optional card badge renderer. Returns the badge text, or null to hide. */
  badge?: (value: unknown, task: TaskLike) => string | null;
  /**
   * 📖 Web-only: id of a React editor component exported by the extension's web
   * bundle. If omitted, the drawer renders a default input matching `type`.
   */
  editorComponentId?: string;
}

/** A web UI panel rendered in the Drawer. `entry` is the web bundle path. */
export interface WebPanelContribution {
  id: string;
  title: string;
  entry: string;
  icon?: string;
}

/** A CLI/TUI command, surfaced as `kandown <name>`. Additive; never overrides core commands. */
export interface CommandContribution {
  name: string;
  description?: string;
  handler: (args: string, ctx: ExtensionCommandContext) => void | Promise<void>;
}

/** A transition policy, composing with the core dependency gate. */
export interface GateContribution {
  id?: string;
  on: 'task:beforeMove' | 'task:beforeCreate' | 'task:beforeArchive' | 'task:beforeDelete';
  /** Restrict the gate to a specific target status (e.g. `Done`). */
  to?: string;
  handler: (event: GateEvent, ctx: ExtensionContext) => void | Promise<void | GateVerdict>;
}

/** A background reaction to a task event (notify, push to an external service). */
export interface SyncContribution {
  id?: string;
  on: 'task:afterMove' | 'task:afterCreate' | 'task:afterArchive';
  to?: string;
  handler: (event: TaskEvent, ctx: ExtensionContext) => void | Promise<void>;
}

/** Generic lifecycle event handler signature. */
export type LifecycleHandler = (event: TaskEvent, ctx: ExtensionContext) => void | Promise<void>;

/**
 * 📖 The API an extension factory receives. Registration methods are the source
 * of truth for contributions at runtime; `on` subscribes to lifecycle events.
 * Every call is wrapped by the host so a throwing registration cannot crash the
 * core.
 */
export interface KandownExtensionAPI {
  readonly id: string;
  contributeField(def: FieldContribution): void;
  contributeWebPanel(def: WebPanelContribution): void;
  contributeCommand(name: string, def: CommandContribution): void;
  contributeGate(def: GateContribution): void;
  contributeSync(def: SyncContribution): void;
  on(event: 'task:afterCreate' | 'task:afterMove' | 'task:afterArchive' | 'board:load', handler: LifecycleHandler): void;
}

/** The default export shape of an extension's Node entry. */
export type ExtensionFactory = (kd: KandownExtensionAPI) => void | Promise<void>;

/** A loaded extension, with its runtime health and provenance. */
export interface LoadedExtension {
  manifest: ExtensionManifest;
  health: ExtensionHealth;
  /** Error message when health is `errored` or `quarantined`. */
  error?: string;
  /** Consecutive failure count, used by the quarantine policy. */
  failures: number;
  /** Where it was discovered: global (`~/.kandown/extensions`) or project. */
  source: 'global' | 'project';
  /** Absolute path to the extension directory. */
  dir: string;
}
