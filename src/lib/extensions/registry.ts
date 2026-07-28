/**
 * @file Contribution registry
 * @description The in-memory store of everything loaded extensions contribute:
 * fields, web panels, commands, gates, syncs and generic lifecycle handlers.
 * The host populates it while loading; the CLI, daemon and web UI query it to
 * dispatch a command, run gates, render panels or show field editors.
 *
 * 📖 Contributions are namespaced by extension id so two extensions cannot
 * collide on a field key or panel id without the second one being rejected.
 * `clearForExt` removes every contribution owned by an extension, used when an
 * extension is disabled or quarantined so its handlers stop firing.
 *
 * @class ContributionRegistry
 * @exports ContributionRegistry
 * @see src/lib/extensions/host.ts
 */

import type {
  FieldContribution,
  WebPanelContribution,
  CommandContribution,
  GateContribution,
  SyncContribution,
  LifecycleHandler,
} from './types';

interface Owned<T> {
  extId: string;
  def: T;
}

export class ContributionRegistry {
  readonly fields = new Map<string, Owned<FieldContribution>>();
  readonly panels = new Map<string, Owned<WebPanelContribution>>();
  readonly commands = new Map<string, Owned<CommandContribution>>();
  gates: Owned<GateContribution>[] = [];
  syncs: Owned<SyncContribution>[] = [];
  readonly lifecycle = new Map<string, { extId: string; handler: LifecycleHandler }[]>();

  /** Namespaced key for a field, `${extId}.${fieldKey}`. */
  static fieldKey(extId: string, fieldKey: string): string {
    return `${extId}.${fieldKey}`;
  }

  registerField(extId: string, def: FieldContribution): boolean {
    const key = ContributionRegistry.fieldKey(extId, def.key);
    if (this.fields.has(key)) return false;
    this.fields.set(key, { extId, def });
    return true;
  }

  registerPanel(extId: string, def: WebPanelContribution): boolean {
    const key = `${extId}.${def.id}`;
    if (this.panels.has(key)) return false;
    this.panels.set(key, { extId, def });
    return true;
  }

  registerCommand(extId: string, def: CommandContribution): boolean {
    if (this.commands.has(def.name)) return false;
    this.commands.set(def.name, { extId, def });
    return true;
  }

  registerGate(extId: string, def: GateContribution): void {
    this.gates.push({ extId, def });
  }

  registerSync(extId: string, def: SyncContribution): void {
    this.syncs.push({ extId, def });
  }

  on(extId: string, event: string, handler: LifecycleHandler): void {
    const list = this.lifecycle.get(event) ?? [];
    list.push({ extId, handler });
    this.lifecycle.set(event, list);
  }

  /** Removes every contribution owned by `extId`. Used on disable/quarantine. */
  clearForExt(extId: string): void {
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
  fieldsFor(extId: string): FieldContribution[] {
    return [...this.fields.values()].filter((field) => field.extId === extId).map((field) => field.def);
  }

  /** Panels belonging to `extId`. */
  panelsFor(extId: string): WebPanelContribution[] {
    return [...this.panels.values()].filter((panel) => panel.extId === extId).map((panel) => panel.def);
  }

  reset(): void {
    this.fields.clear();
    this.panels.clear();
    this.commands.clear();
    this.gates.length = 0;
    this.syncs.length = 0;
    this.lifecycle.clear();
  }
}
