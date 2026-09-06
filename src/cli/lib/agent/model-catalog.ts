/**
 * @file Model catalog: which models a harness can actually run (t324)
 * @description Answers the chat model menu's question, "what can I pick for
 * this harness?", with real model ids instead of a cosmetic shortlist. Two
 * sources, merged by model id with the dynamic one winning (the same baseline
 * plus discovery recipe BB uses):
 *
 *  → a per-harness baseline: short, curated, always available, zero cost;
 *  → a live ACP discovery: spawn the harness in its ACP mode, handshake,
 *    read the `model` config option out of the session answer, close the
 *    session. This is ground truth: it carries the exact model ids the
 *    authenticated account can use (opencode: provider/model slugs like
 *    `zai-coding-plan/glm-5.3`) and the value the account currently runs on.
 *
 * 📖 Silence is the contract, exactly like harness detection. Discovery
 * timeouts, a missing binary or a protocol change all degrade to the baseline
 * list: the menu is populated, never broken. Discovery results are cached in
 * memory for ten minutes (a cold opencode handshake costs up to ten seconds,
 * so it must not run on every menu open), and one discovery per harness runs
 * at a time.
 *
 * 📖 Deliberately no third source: models.dev or provider HTTP APIs would add
 * a network dependency kandown does not need, because the harness itself is
 * the authority on what it can run. The merge shape leaves room for one more
 * source if a harness ever shows up that has neither flags nor configOptions.
 *
 * @functions
 *  → listHarnessModels : the merged pick list for one harness (never throws)
 *  → resetModelCatalog : drop the cache (tests)
 *
 * @exports HarnessModel, HarnessModelList, listHarnessModels, resetModelCatalog
 * @see src/cli/lib/agent/adapters/acp.ts: how a pick is applied to a session
 * @see src/components/agent/ChatSidebar.tsx: the menu that consumes this
 */

import { spawn } from 'node:child_process';
import { resolveHarness } from './detect';

/** 📖 One pickable model as the menu renders it. `current` marks the value
 *  the account is already running on (ACP discovery only). */
export interface HarnessModel {
  id: string;
  name: string;
  current?: boolean;
}

/** 📖 The merged list plus where the dynamic part came from, so Settings and
 *  logs can explain a thin list without a debug session. */
export interface HarnessModelList {
  models: HarnessModel[];
  /** `discovered` = a live ACP answer is merged in; `baseline` = static only. */
  source: 'discovered' | 'baseline';
}

/** 📖 The curated baselines. Short on purpose: this is the "works offline"
 *  floor, not a catalog. Aliases (claude) and family names (codex, gemini)
 *  go first because the harness CLIs resolve them themselves. */
const BASELINE_MODELS: Record<string, string[]> = {
  claude: ['opus', 'sonnet', 'haiku'],
  codex: ['gpt-5.1-codex', 'gpt-5.1', 'o4-mini'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  opencode: [],
};

/** 📖 Baselines for unknown harnesses: none. Free text stays the answer. */
function baselineFor(harnessId: string): HarnessModel[] {
  return (BASELINE_MODELS[harnessId] ?? []).map(id => ({ id, name: id }));
}

/** 📖 Cache TTL. Long enough that opening the menu twice does not pay the
 *  handshake twice, short enough that a model added to the account shows up
 *  within minutes. */
const DISCOVERY_TTL_MS = 10 * 60 * 1000;

/** 📖 Hard ceiling on one discovery. A cold opencode handshake measured
 *  between 7 and 15 seconds locally; 25 gives headroom without letting a
 *  wedged binary pin the route. */
const DISCOVERY_TIMEOUT_MS = 25_000;

const cache = new Map<string, { at: number; list: HarnessModelList }>();
const inFlight = new Map<string, Promise<HarnessModelList>>();

/**
 * 📖 The model list for one harness: baseline merged with discovery when the
 * harness speaks ACP. Never throws and never rejects; any failure degrades to
 * the baseline.
 */
export function listHarnessModels(harnessId: string): Promise<HarnessModelList> {
  const baseline = baselineFor(harnessId);
  const def = resolveHarness(harnessId);
  if (!def || def.def.protocol !== 'acp') {
    return Promise.resolve({ models: baseline, source: 'baseline' });
  }
  const cached = cache.get(harnessId);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) {
    return Promise.resolve(cached.list);
  }
  let pending = inFlight.get(harnessId);
  if (!pending) {
    pending = discoverAcpModels(def.binPath, def.def.protocolArgs)
      .catch(() => null)
      .then(discovered => {
        const list = mergeModels(baseline, discovered);
        cache.set(harnessId, { at: Date.now(), list });
        inFlight.delete(harnessId);
        return list;
      });
    inFlight.set(harnessId, pending);
  }
  return pending;
}

/** 📖 Test seam. */
export function resetModelCatalog(): void {
  cache.clear();
  inFlight.clear();
}

/** 📖 Merges baseline and discovered ids: the dynamic entry replaces its
 *  static twin by id (fresh metadata wins), the rest of the baseline stays.
 *  A null discovery leaves the baseline untouched. */
function mergeModels(baseline: HarnessModel[], discovered: HarnessModel[] | null): HarnessModelList {
  if (!discovered || discovered.length === 0) return { models: baseline, source: 'baseline' };
  const merged = new Map(baseline.map(model => [model.id, model]));
  for (const model of discovered) merged.set(model.id, model);
  return { models: [...merged.values()], source: 'discovered' };
}

/** 📖 One narrowable ACP config option entry. */
interface AcpConfigOption {
  id?: unknown;
  currentValue?: unknown;
  options?: unknown;
}

/**
 * 📖 Live discovery for one ACP harness: initialize, session/new, read the
 * `model` select, close the session, exit. Resolves null for every failure
 * mode (no binary, timeout, protocol drift); logs nothing. The probe session
 * is closed again so discovery does not litter the agent's session storage.
 */
async function discoverAcpModels(binPath: string, protocolArgs: readonly string[]): Promise<HarnessModel[] | null> {
  return new Promise<HarnessModel[] | null>(resolve => {
    const child = spawn(binPath, [...protocolArgs], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let buffer = '';
    let settled = false;
    const models: HarnessModel[] = [];

    const finish = (result: HarnessModel[] | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners();
      if (!child.killed) child.kill();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), DISCOVERY_TIMEOUT_MS);

    const send = (message: Record<string, unknown>): void => {
      child.stdin?.write(`${JSON.stringify(message)}\n`);
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let index: number;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        const brace = line.indexOf('{');
        if (brace < 0) continue;
        let message: { id?: unknown; result?: unknown };
        try {
          message = JSON.parse(line.slice(brace)) as { id?: unknown; result?: unknown };
        } catch {
          continue;
        }
        if (message.id === 1) {
          send({ jsonrpc: '2.0', id: 2, method: 'session/new', params: { cwd: process.cwd(), mcpServers: [] } });
          continue;
        }
        if (message.id !== 2 || !message.result || typeof message.result !== 'object') continue;
        const result = message.result as { sessionId?: unknown; configOptions?: unknown };
        const options = Array.isArray(result.configOptions) ? result.configOptions as AcpConfigOption[] : [];
        const modelOption = options.find(option => option && typeof option === 'object' && option.id === 'model');
        const current = typeof modelOption?.currentValue === 'string' ? modelOption.currentValue : undefined;
        if (Array.isArray(modelOption?.options)) {
          for (const entry of modelOption!.options as unknown[]) {
            const record = entry && typeof entry === 'object' ? entry as { value?: unknown; name?: unknown } : null;
            const id = typeof record?.value === 'string' ? record.value : null;
            if (!id) continue;
            const name = typeof record?.name === 'string' && record.name ? record.name : id;
            models.push({ id, name, ...(current === id ? { current: true } : {}) });
          }
        }
        // 📖 Best-effort cleanup: close the probe session so the agent's own
        // storage does not fill with discovery leftovers, then leave.
        if (typeof result.sessionId === 'string') {
          send({ jsonrpc: '2.0', id: 3, method: 'session/close', params: { sessionId: result.sessionId } });
        }
        setTimeout(() => finish(models), 250);
        return;
      }
    });
    child.on('error', () => finish(null));
    child.stdin?.on('error', () => finish(null));
    child.on('close', () => finish(models.length > 0 ? models : null));

    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: {} } });
  });
}
