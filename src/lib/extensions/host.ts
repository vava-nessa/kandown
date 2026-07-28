/**
 * @file Extension host
 * @description The orchestrator that loads extensions, manages their health,
 * and dispatches contributions (gates, syncs, commands, lifecycle) with
 * per-contribution fail policies. This is where "a broken extension must never
 * break kandown" is enforced: every call into extension code is wrapped, and a
 * repeatedly failing extension is quarantined and its contributions dropped.
 *
 * 📖 The host owns one `ContributionRegistry`. It discovers extensions via the
 * loader, checks restricted mode + project trust + version compatibility, then
 * loads each Node entry with jiti and runs the factory. Authoritative dispatch
 * (gates, syncs, commands) happens here in Node, once, so the CLI, daemon and
 * (via the daemon API) the web UI all share one implementation. See
 * docs/EXTENSIONS.md § "Runtimes" and § "Isolation and resilience".
 *
 * @class ExtensionHost
 * @exports ExtensionHost, type HostEnvironment
 * @see src/lib/extensions/registry.ts
 * @see src/lib/extensions/loader.ts
 * @see src/lib/extensions/trust.ts
 */

import { createJiti } from 'jiti';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContributionRegistry } from './registry';
import { discoverExtensions } from './loader';
import { isCompatible } from './manifest';
import { isRestricted, loadProjectTrust, saveProjectTrust } from './trust';
import { loadEnabled, saveEnabled, loadFailureState, saveFailureState, type ExtensionFailureRecord } from './state';
import { isAllowed } from './permissions';
import { coerceField, readField } from './namespace';
import type {
  ExtensionContext,
  ExtensionFactory,
  ExtensionHealth,
  GateContribution,
  GateEvent,
  GateVerdict,
  KandownExtensionAPI,
  LoadedExtension,
  TaskEvent,
  TaskLike,
  ExtensionBadge,
  ExtensionFieldDescriptor,
  ExtensionPanelDescriptor,
} from './types';

/** Number of consecutive failures before an enabled extension is quarantined. */
const QUARANTINE_THRESHOLD = 3;
/** Extension API version this build of kandown supports. */
export const SUPPORTED_API_VERSION = 1;

/**
 * 📖 Runtime services the host needs, injected by the CLI or the daemon. Keeping
 * I/O behind this interface lets the dispatch logic stay pure-ish and testable,
 * and means the web UI (which has no direct fs) never instantiates a host: it
 * talks to the daemon, which does.
 */
export interface HostEnvironment {
  projectDir: string;
  kandownVersion: string;
  config: { extensions?: { restricted?: boolean } } | undefined | null;
  readAll(): Promise<TaskLike[]>;
  read(taskId: string): Promise<TaskLike | null>;
  applyField(taskId: string, extId: string, key: string, value: unknown): Promise<void>;
  log?: { info?(m: string): void; warn?(m: string): void; error?(m: string): void };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class ExtensionHost {
  readonly registry = new ContributionRegistry();
  private byExtId = new Map<string, LoadedExtension>();
  private trust: Set<string>;
  private enabled: Set<string>;
  private failures: Map<string, ExtensionFailureRecord>;
  private jiti: ReturnType<typeof createJiti> | undefined;

  constructor(private env: HostEnvironment) {
    this.trust = loadProjectTrust(env.projectDir);
    this.enabled = loadEnabled(env.projectDir);
    this.failures = loadFailureState(env.projectDir);
  }

  /** All loaded extensions, with health and provenance. */
  list(): LoadedExtension[] {
    return [...this.byExtId.values()];
  }

  /** One extension by id, or undefined. */
  get(id: string): LoadedExtension | undefined {
    return this.byExtId.get(id);
  }

  /** Summaries of what each enabled extension contributes, for settings/CLI. */
  installedSummary(): Array<{
    id: string;
    name: string;
    version: string;
    source: 'global' | 'project';
    health: ExtensionHealth;
    error?: string;
    failures: number;
    permissions: string[];
    fields: ExtensionFieldDescriptor[];
    panels: ExtensionPanelDescriptor[];
    commands: string[];
    gates: number;
    syncs: number;
  }> {
    return this.list().map((ext) => ({
      id: ext.manifest.id,
      name: ext.manifest.name,
      version: ext.manifest.version,
      source: ext.source,
      health: ext.health,
      error: ext.error,
      failures: ext.failures,
      permissions: [...(ext.manifest.permissions ?? [])],
      fields: this.registry.fieldsFor(ext.manifest.id).map((field) => ({
        extId: ext.manifest.id,
        key: field.key,
        label: field.label,
        type: field.type,
        options: field.options,
        hasBadge: typeof field.badge === 'function',
        editorComponentId: field.editorComponentId,
      })),
      panels: this.registry.panelsFor(ext.manifest.id).map((panel) => ({
        extId: ext.manifest.id,
        id: panel.id,
        title: panel.title,
        entry: panel.entry,
        icon: panel.icon,
      })),
      commands: [...this.registry.commands.values()].filter((command) => command.extId === ext.manifest.id).map((command) => command.def.name),
      gates: this.registry.gates.filter((gate) => gate.extId === ext.manifest.id).length,
      syncs: this.registry.syncs.filter((sync) => sync.extId === ext.manifest.id).length,
    }));
  }

  /**
   * 📖 Discovers and loads every extension, applying restricted mode, project
   * trust and version compatibility. Safe to call repeatedly (it resets first).
   */
  async loadAll(): Promise<void> {
    this.registry.reset();
    this.byExtId.clear();
    const restricted = isRestricted(this.env.config);
    const discovered = discoverExtensions(this.env.projectDir);

    for (const found of discovered) {
      if (!found.manifestResult.ok) {
        this.byExtId.set(found.dir, {
          manifest: { id: '(invalid)', name: '(invalid)', version: '0', apiVersion: SUPPORTED_API_VERSION },
          health: 'errored',
          error: found.manifestResult.error,
          failures: 0,
          source: found.source,
          dir: found.dir,
        });
        continue;
      }
      const manifest = found.manifestResult.manifest;

      // Version compatibility is a hard error: loads as errored, never enabled.
      if (manifest.apiVersion !== SUPPORTED_API_VERSION) {
        this.byExtId.set(manifest.id, loaded(manifest, found.dir, found.source, 'errored', `unsupported apiVersion ${manifest.apiVersion} (expected ${SUPPORTED_API_VERSION})`));
        continue;
      }
      if (!isCompatible(manifest, this.env.kandownVersion)) {
        this.byExtId.set(manifest.id, loaded(manifest, found.dir, found.source, 'errored', `requires kandown >= ${manifest.minKandownVersion}`));
        continue;
      }
      const persistedFailure = this.failures.get(manifest.id);
      if (persistedFailure && persistedFailure.failures >= QUARANTINE_THRESHOLD) {
        this.byExtId.set(manifest.id, loaded(
          manifest,
          found.dir,
          found.source,
          'quarantined',
          persistedFailure.error ?? `quarantined after ${persistedFailure.failures} failures`,
          persistedFailure.failures,
        ));
        continue;
      }
      // 📖 Project-local extensions require explicit trust (mirrors pi project_trust).
      if (found.source === 'project' && !this.trust.has(manifest.id)) {
        this.byExtId.set(manifest.id, loaded(manifest, found.dir, found.source, 'disabled', 'project extension not trusted; run "kandown extension enable"'));
        continue;
      }
      // 📖 Restricted mode (default on): load only extensions the user explicitly enabled.
      if (restricted && !this.enabled.has(manifest.id)) {
        this.byExtId.set(manifest.id, loaded(manifest, found.dir, found.source, 'disabled', 'restricted mode is on; run "kandown extension enable"'));
        continue;
      }

      await this.loadEntry(manifest, found.dir, found.source, persistedFailure?.failures ?? 0);
    }
  }

  /** Loads and runs one extension's Node entry, registering its contributions. */
  private async loadEntry(manifest: LoadedExtension['manifest'], dir: string, source: 'global' | 'project', failures = 0): Promise<void> {
    const entry = this.resolveEntry(manifest, dir);
    if (!entry) {
      this.byExtId.set(manifest.id, loaded(manifest, dir, source, 'errored', 'no Node entry found (index.js or index.ts)'));
      return;
    }
    try {
      const factory = await this.loadFactory(entry);
      if (typeof factory !== 'function') {
        this.byExtId.set(manifest.id, loaded(manifest, dir, source, 'errored', 'default export is not a function'));
        return;
      }
      const kd = this.makeApi(manifest.id);
      await factory(kd);
      this.byExtId.set(manifest.id, loaded(manifest, dir, source, 'enabled', undefined, failures));
    } catch (e) {
      this.registry.clearForExt(manifest.id);
      this.byExtId.set(manifest.id, loaded(manifest, dir, source, 'errored', `load failed: ${errMsg(e)}`));
    }
  }

  private resolveEntry(manifest: LoadedExtension['manifest'], dir: string): string | null {
    const mainRel = manifest.main;
    const candidates = mainRel
      ? [resolve(dir, mainRel)]
      : [join(dir, 'index.ts'), join(dir, 'index.js'), join(dir, 'index.mjs')];
    for (const c of candidates) if (existsSync(c)) return c;
    return null;
  }

  private async loadFactory(entry: string): Promise<ExtensionFactory | undefined> {
    if (!this.jiti) {
      // Base the jiti instance on this file so relative resolution is sane.
      const base = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
      this.jiti = createJiti(base);
    }
    const mod = (await this.jiti.import(entry)) as { default?: unknown };
    return mod.default as ExtensionFactory | undefined;
  }

  /** Builds the scoped `KandownExtensionAPI` an extension factory receives. */
  private makeApi(extId: string): KandownExtensionAPI {
    const safe = (fn: () => void) => {
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
      on: (event, handler) => this.registry.on(extId, event, handler),
    };
  }

  /** Builds the scoped `ExtensionContext` for a handler of `extId`. */
  private makeContext(extId: string): ExtensionContext {
    const perms = this.byExtId.get(extId)?.manifest.permissions;
    const hasNet = perms?.some((p) => p === '*' || p === 'net:*' || p.startsWith('net:')) ?? false;
    const ctx: ExtensionContext = {
      extId,
      board: {
        readAll: async () => {
          if (!isAllowed(perms, 'read:tasks')) throw new Error('permission denied: read:tasks');
          return this.env.readAll();
        },
        read: async (id) => {
          if (!isAllowed(perms, 'read:tasks')) throw new Error('permission denied: read:tasks');
          return this.env.read(id);
        },
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
        error: (m) => this.env.log?.error?.(m),
      },
    };
    if (hasNet) ctx.fetch = fetch;
    return ctx;
  }

  /**
   * Validates and writes one registered field through the host. The browser can
   * never choose another extension's namespace or bypass the declared type.
   */
  async setFieldValue(taskId: string, extId: string, key: string, value: unknown): Promise<void> {
    const ext = this.byExtId.get(extId);
    if (!ext || ext.health !== 'enabled') throw new Error(`extension is not enabled: ${extId}`);
    const field = this.registry.fields.get(ContributionRegistry.fieldKey(extId, key))?.def;
    if (!field) throw new Error(`unknown field: ${extId}.${key}`);
    const permission = `write:field:plugins.${extId}.${key}`;
    if (!isAllowed(ext.manifest.permissions, permission)) throw new Error(`permission denied: ${permission}`);

    let normalized: unknown = value;
    if (value !== undefined && value !== null && value !== '') {
      normalized = coerceField(value, field.type);
      if (field.type === 'number' && normalized === undefined) throw new Error(`${field.label} must be a number`);
      if (field.type === 'select' && field.options && !field.options.some((option) => option.value === normalized)) {
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
  async renderBadges(): Promise<Record<string, ExtensionBadge[]>> {
    const badges: Record<string, ExtensionBadge[]> = {};
    const tasks = await this.env.readAll();
    for (const task of tasks) {
      const taskBadges: ExtensionBadge[] = [];
      for (const { extId, def } of this.registry.fields.values()) {
        if (!def.badge || this.byExtId.get(extId)?.health !== 'enabled') continue;
        try {
          const value = readField(task.frontmatter, extId, def.key, def.type);
          const text = def.badge(value, task);
          this.recordSuccess(extId, `badge:${def.key}`);
          if (typeof text === 'string' && text.trim()) {
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
  private persistFailures(): void {
    try {
      saveFailureState(this.env.projectDir, this.failures);
    } catch (error) {
      this.env.log?.warn?.(`Could not persist extension health: ${errMsg(error)}`);
    }
  }

  /** Bumps one surface's persistent failure counter and quarantines at the threshold. */
  private recordFailure(extId: string, e: unknown, surface: string): void {
    const ext = this.byExtId.get(extId);
    if (!ext || ext.health !== 'enabled') return;
    const previous = this.failures.get(extId);
    ext.failures = previous?.surface === surface ? previous.failures + 1 : 1;
    const message = errMsg(e);
    this.failures.set(extId, {
      failures: ext.failures,
      surface,
      error: message,
      updatedAt: new Date().toISOString(),
    });
    if (ext.failures >= QUARANTINE_THRESHOLD) {
      ext.health = 'quarantined';
      ext.error = `quarantined after ${ext.failures} failures (last: ${message})`;
      this.failures.set(extId, {
        failures: ext.failures,
        surface,
        error: ext.error,
        updatedAt: new Date().toISOString(),
      });
      this.registry.clearForExt(extId);
      this.env.log?.error?.(`[${extId}] quarantined`);
    }
    this.persistFailures();
  }

  /** Clears consecutive failures only for the same contribution surface. */
  private recordSuccess(extId: string, surface: string): void {
    const ext = this.byExtId.get(extId);
    const previous = this.failures.get(extId);
    if (!ext || ext.health !== 'enabled' || ext.failures === 0 || previous?.surface !== surface) return;
    ext.failures = 0;
    ext.error = undefined;
    this.failures.delete(extId);
    this.persistFailures();
  }

  /** Records a browser contribution failure reported through the daemon API. */
  reportFailure(extId: string, error: unknown): LoadedExtension | undefined {
    this.recordFailure(extId, error, 'webPanel');
    return this.byExtId.get(extId);
  }

  /** Records a successful browser mount, resetting consecutive failures. */
  reportSuccess(extId: string): LoadedExtension | undefined {
    this.recordSuccess(extId, 'webPanel');
    return this.byExtId.get(extId);
  }

  /**
   * 📖 Runs every gate matching the event. Returns on the first block. A
   * throwing gate is fail-open (no objection) and counted toward quarantine.
   */
  async runGates(event: GateEvent & { type: GateContribution['on'] }): Promise<{ allowed: boolean; reason?: string }> {
    for (const { extId, def } of this.registry.gates) {
      if (def.on !== event.type) continue;
      if (def.to && event.to && def.to !== event.to) continue;
      if (this.byExtId.get(extId)?.health !== 'enabled') continue;
      try {
        const verdict: GateVerdict | void = await def.handler(event, this.makeContext(extId));
        const surface = `gate:${def.id ?? def.on}:${def.to ?? '*'}`;
        this.recordSuccess(extId, surface);
        if (verdict?.block) {
          return { allowed: false, reason: verdict.reason ?? `Blocked by extension "${extId}"` };
        }
      } catch (e) {
        this.recordFailure(extId, e, `gate:${def.id ?? def.on}:${def.to ?? '*'}`);
      }
    }
    return { allowed: true };
  }

  /** Fires matching sync handlers, isolated. Fire-and-forget (returns void). */
  dispatchSync(event: TaskEvent & { type: 'task:afterCreate' | 'task:afterMove' | 'task:afterArchive' }): void {
    for (const { extId, def } of this.registry.syncs) {
      if (def.on !== event.type) continue;
      if (def.to && event.to && def.to !== event.to) continue;
      if (this.byExtId.get(extId)?.health !== 'enabled') continue;
      const surface = `sync:${def.id ?? def.on}:${def.to ?? '*'}`;
      void Promise.resolve(def.handler(event, this.makeContext(extId)))
        .then(() => this.recordSuccess(extId, surface))
        .catch((e) => this.recordFailure(extId, e, surface));
    }
  }

  /** Fires matching lifecycle handlers, isolated. */
  dispatchLifecycle(event: TaskEvent & { type: string }): void {
    const handlers = this.registry.lifecycle.get(event.type);
    if (!handlers) return;
    for (const { extId, handler } of handlers) {
      if (this.byExtId.get(extId)?.health !== 'enabled') continue;
      const surface = `lifecycle:${event.type}`;
      void Promise.resolve(handler(event, this.makeContext(extId)))
        .then(() => this.recordSuccess(extId, surface))
        .catch((e) => this.recordFailure(extId, e, surface));
    }
  }

  /** Returns a contributed command by name, or null. */
  getCommand(name: string): { extId: string; handler: (args: string, ctx: ExtensionContext) => void | Promise<void> } | null {
    const owned = this.registry.commands.get(name);
    if (!owned) return null;
    if (this.byExtId.get(owned.extId)?.health !== 'enabled') return null;
    return { extId: owned.extId, handler: owned.def.handler };
  }

  /** Runs a contributed command by name. Throws if missing; isolated otherwise. */
  async runCommand(name: string, args: string): Promise<void> {
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
  async enable(id: string): Promise<boolean> {
    this.failures.delete(id);
    this.persistFailures();
    this.trust.add(id);
    saveProjectTrust(this.env.projectDir, this.trust);
    this.enabled.add(id);
    saveEnabled(this.env.projectDir, this.enabled);
    await this.loadAll();
    return this.byExtId.get(id)?.health === 'enabled';
  }

  /** Disables an extension (persists, clears contributions, keeps files). */
  disable(id: string): boolean {
    const ext = this.byExtId.get(id);
    if (!ext) return false;
    this.enabled.delete(id);
    saveEnabled(this.env.projectDir, this.enabled);
    ext.health = 'disabled';
    ext.error = undefined;
    this.registry.clearForExt(id);
    return true;
  }
}

/** Helper to build a `LoadedExtension` record. */
function loaded(
  manifest: LoadedExtension['manifest'],
  dir: string,
  source: 'global' | 'project',
  health: ExtensionHealth,
  error?: string,
  failures = 0,
): LoadedExtension {
  return { manifest, dir, source, health, error, failures };
}
