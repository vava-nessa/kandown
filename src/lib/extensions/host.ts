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
import { loadEnabled, saveEnabled } from './state';
import { isAllowed } from './permissions';
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
  private jiti: ReturnType<typeof createJiti> | undefined;

  constructor(private env: HostEnvironment) {
    this.trust = loadProjectTrust(env.projectDir);
    this.enabled = loadEnabled(env.projectDir);
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
    fields: string[];
    panels: string[];
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
      fields: this.registry.fieldsFor(ext.manifest.id).map((f) => f.key),
      panels: [...this.registry.panels.values()].filter((p) => p.extId === ext.manifest.id).map((p) => p.def.id),
      commands: [...this.registry.commands.values()].filter((c) => c.extId === ext.manifest.id).map((c) => c.def.name),
      gates: this.registry.gates.filter((g) => g.extId === ext.manifest.id).length,
      syncs: this.registry.syncs.filter((s) => s.extId === ext.manifest.id).length,
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

      await this.loadEntry(manifest, found.dir, found.source);
    }
  }

  /** Loads and runs one extension's Node entry, registering its contributions. */
  private async loadEntry(manifest: LoadedExtension['manifest'], dir: string, source: 'global' | 'project'): Promise<void> {
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
      this.byExtId.set(manifest.id, loaded(manifest, dir, source, 'enabled'));
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
        readAll: () => this.env.readAll(),
        read: (id) => this.env.read(id),
      },
      setField: (taskId, key, value) => this.env.applyField(taskId, extId, key, value),
      log: {
        info: (m) => this.env.log?.info?.(m),
        warn: (m) => this.env.log?.warn?.(m),
        error: (m) => this.env.log?.error?.(m),
      },
    };
    if (hasNet) ctx.fetch = fetch;
    return ctx;
  }

  /** Bumps the failure counter and quarantines past the threshold. */
  private recordFailure(extId: string, e: unknown): void {
    const ext = this.byExtId.get(extId);
    if (!ext || ext.health !== 'enabled') return;
    ext.failures += 1;
    if (ext.failures >= QUARANTINE_THRESHOLD) {
      ext.health = 'quarantined';
      ext.error = `quarantined after ${ext.failures} failures (last: ${errMsg(e)})`;
      this.registry.clearForExt(extId);
      this.env.log?.error?.(`[${extId}] quarantined`);
    }
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
        if (verdict?.block) {
          return { allowed: false, reason: verdict.reason ?? `Blocked by extension "${extId}"` };
        }
      } catch (e) {
        this.recordFailure(extId, e);
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
      void Promise.resolve(def.handler(event, this.makeContext(extId))).catch((e) => this.recordFailure(extId, e));
    }
  }

  /** Fires matching lifecycle handlers, isolated. */
  dispatchLifecycle(event: TaskEvent & { type: string }): void {
    const handlers = this.registry.lifecycle.get(event.type);
    if (!handlers) return;
    for (const { extId, handler } of handlers) {
      if (this.byExtId.get(extId)?.health !== 'enabled') continue;
      void Promise.resolve(handler(event, this.makeContext(extId))).catch((e) => this.recordFailure(extId, e));
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
    } catch (e) {
      this.recordFailure(cmd.extId, e);
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
): LoadedExtension {
  return { manifest, dir, source, health, error, failures: 0 };
}
