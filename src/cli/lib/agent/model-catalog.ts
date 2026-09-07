/**
 * @file Model catalog: which models a harness can actually run (t324)
 * @description Answers the chat model menu's question, "what can I pick for
 * this harness?", with real model ids instead of a cosmetic shortlist. One
 * baseline plus two dynamic sources, merged by model id with the dynamic one
 * winning (the baseline-plus-discovery recipe BB uses):
 *
 *  → a per-harness baseline: short, curated, always available, zero cost. It
 *    only exists for the moment a dynamic source has not answered yet;
 *  → models.dev (https://models.dev/api.json), the community database
 *    opencode builds its own catalog from, for the harnesses with no
 *    discovery surface (claude, codex, gemini, pi). Freshness is the whole
 *    point: a table compiled at build time was already two model generations
 *    behind within a month (vava flagged exactly that). pi gets `provider/id`
 *    prefixed ids, the big-three CLIs take bare ids;
 *  → a live ACP discovery for ACP harnesses (opencode): spawn the harness in
 *    its ACP mode, read the `model` config option out of the session answer.
 *    Ground truth: the exact model ids the authenticated account can use and
 *    the value it currently runs on.
 *
 * 📖 Silence is the contract, exactly like harness detection. A failed fetch,
 * a timeout, a missing binary or a protocol change all degrade to the
 * baseline list: the menu is populated, never broken. Discovery results are
 * cached in memory for ten minutes (a cold opencode handshake costs up to
 * ten seconds), the models.dev payload for twenty-four hours, and one
 * discovery per harness runs at a time.
 *
 * @functions
 *  → listHarnessModels   : the merged pick list for one harness (never throws)
 *  → fetchModelsDevCatalog : the cached models.dev catalog (null when offline)
 *  → modelsDevToHarness  : pure: catalog slice to pickable models, newest first
 *  → resetModelCatalog   : drop the caches (tests)
 *
 * @exports HarnessModel, HarnessModelList, ModelsDevModel, ModelsDevCatalog, listHarnessModels, fetchModelsDevCatalog, modelsDevToHarness, resetModelCatalog
 * @see src/cli/lib/agent/adapters/acp.ts: how a pick is applied to a session
 * @see src/components/agent/ChatSidebar.tsx: the menu that consumes this
 */

import { spawn } from 'node:child_process';
import { resolveHarness } from './detect';

/** 📖 One pickable model as the menu renders it. `current` marks the value
 *  the account is already running on (ACP discovery only); `release` is the
 *  models.dev release date, used to sort newest first. */
export interface HarnessModel {
  id: string;
  name: string;
  current?: boolean;
  release?: string;
}

/** 📖 The merged list plus where the dynamic part came from, so Settings and
 *  logs can explain a thin list without a debug session. */
export interface HarnessModelList {
  models: HarnessModel[];
  /** `discovered` = a live answer (ACP session or models.dev) is merged in;
   * `baseline` = static only. */
  source: 'discovered' | 'baseline';
}

/** 📖 The curated baselines. Short on purpose: this is the "works offline"
 *  floor, not a catalog. Aliases (claude) and family names go first because
 *  the harness CLIs resolve them themselves; the live models.dev source
 *  (below) is what keeps the menu current, these strings only answer when
 *  nothing else did. */
const BASELINE_MODELS: Record<string, string[]> = {
  claude: ['opus', 'sonnet', 'haiku'],
  codex: ['gpt-5.6', 'gpt-5.5'],
  gemini: ['gemini-3.8-flash'],
  // 📖 opencode model ids are provider/model slugs (its own catalog format);
  // these are the common ones worth offering before discovery has answered
  // (or when it cannot: no binary, broken install, timeout).
  opencode: ['zai-coding-plan/glm-5.3', 'anthropic/claude-sonnet-4-5', 'openai/gpt-5.6'],
};

/**
 * 📖 The models.dev live source (https://models.dev/api.json, the same
 * database opencode builds its catalog from). Community-maintained and
 * updated within hours of every release, which is exactly what a static
 * table can never be: at build time this file's "current" codex list was
 * already two generations behind. Mapping is per harness:
 *
 *  → `providers`: which models.dev providers feed the harness;
 *  → `prefix`: pi wants `provider/id` (its own --model convention), the
 *    big-three CLIs take bare ids;
 *  → `filter`: drop model families the CLI cannot run (gpt-4o noise for a
 *    codex that only speaks gpt-5, gemma for a gemini CLI).
 *
 * Every harness here also keeps its ACP discovery (opencode) or baseline so
 * an offline machine still gets a menu.
 */
interface ModelsDevSource {
  providers: readonly string[];
  prefix: boolean;
  filter?: RegExp;
}

const MODELS_DEV_SOURCES: Record<string, ModelsDevSource> = {
  claude: { providers: ['anthropic'], prefix: false },
  codex: { providers: ['openai'], prefix: false, filter: /gpt-5|o[3-9]-|codex/ },
  gemini: { providers: ['google'], prefix: false, filter: /gemini/ },
  pi: {
    providers: ['anthropic', 'openai', 'google', 'zai-coding-plan', 'zai', 'openrouter', 'cerebras', 'mistral', 'minimax', 'nvidia', 'xai', 'groq'],
    prefix: true,
  },
};

/** 📖 One entry of the models.dev catalog, narrowed to the fields this module
 *  reads. Everything else (pricing, limits, modalities) is ignored. */
export interface ModelsDevModel {
  name?: unknown;
  release_date?: unknown;
  tool_call?: unknown;
}

/** 📖 The catalog shape: provider id → { models: model id → metadata }. */
export type ModelsDevCatalog = Record<string, { models?: Record<string, ModelsDevModel> }>;

/** 📖 Cache TTL for the models.dev fetch: fresh enough that a new release
 *  shows up the next day, long enough that a day of heavy use costs one
 *  request. */
const MODELS_DEV_URL = 'https://models.dev/api.json';

const MODELS_DEV_TTL_MS = 24 * 60 * 60 * 1000;

/** 📖 Hard ceiling on the fetch. The payload is ~2 MB; anything slower than
 *  this is a network the user did not want us to wait on. */
const MODELS_DEV_TIMEOUT_MS = 8_000;

let modelsDevCache: { at: number; data: ModelsDevCatalog } | null = null;
let modelsDevPending: Promise<ModelsDevCatalog | null> | null = null;

/**
 * 📖 The models.dev catalog, fetched once per TTL. Never rejects: any
 * failure (offline, timeout, payload drift) resolves null and the caller
 * falls back to the baseline list.
 */
export async function fetchModelsDevCatalog(): Promise<ModelsDevCatalog | null> {
  if (modelsDevCache && Date.now() - modelsDevCache.at < MODELS_DEV_TTL_MS) {
    return modelsDevCache.data;
  }
  if (!modelsDevPending) {
    modelsDevPending = (async () => {
      try {
        const response = await fetch(MODELS_DEV_URL, {
          signal: AbortSignal.timeout(MODELS_DEV_TIMEOUT_MS),
          headers: { accept: 'application/json' },
        });
        if (!response.ok) return null;
        const data = await response.json() as ModelsDevCatalog;
        if (!data || typeof data !== 'object') return null;
        modelsDevCache = { at: Date.now(), data };
        return data;
      } catch {
        return null;
      } finally {
        modelsDevPending = null;
      }
    })();
  }
  return modelsDevPending;
}

/**
 * 📖 Narrows one provider's models.dev entries into pickable models: chat
 * capable only (tool_call is false for image/audio models), newest release
 * first (the complaint that started this: a static table lists generations
 * that are already two behind), optional family filter, optional
 * `provider/id` prefix for harnesses that name models that way. Pure.
 */
export function modelsDevToHarness(
  catalog: ModelsDevCatalog,
  source: ModelsDevSource,
): HarnessModel[] {
  const out: HarnessModel[] = [];
  for (const provider of source.providers) {
    const models = catalog[provider]?.models;
    if (!models) continue;
    for (const [modelId, meta] of Object.entries(models)) {
      if (meta.tool_call === false) continue;
      if (source.filter && !source.filter.test(modelId)) continue;
      const id = source.prefix ? `${provider}/${modelId}` : modelId;
      const name = typeof meta.name === 'string' && meta.name ? `${meta.name}${source.prefix ? ` (${provider})` : ''}` : id;
      out.push({
        id,
        name,
        ...(typeof meta.release_date === 'string' ? { release: meta.release_date } : {}),
      });
    }
  }
  out.sort((a, b) => {
    if (a.release !== b.release) return (b.release ?? '').localeCompare(a.release ?? '');
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
  return out.slice(0, 24);
}

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
 * 📖 The model list for one harness: baseline merged with the best dynamic
 * source the harness offers. ACP harnesses ask the binary itself (ground
 * truth for the signed-in account); everything else reads models.dev (the
 * live community catalog). Never throws and never rejects; any failure
 * degrades to the baseline.
 */
export async function listHarnessModels(harnessId: string): Promise<HarnessModelList> {
  const baseline = baselineFor(harnessId);
  const def = resolveHarness(harnessId);
  if (!def) return { models: baseline, source: 'baseline' };

  if (def.def.protocol !== 'acp') {
    // 📖 No ACP surface to interrogate: models.dev is the dynamic layer.
    const source = MODELS_DEV_SOURCES[harnessId];
    if (!source) return { models: baseline, source: 'baseline' };
    const catalog = await fetchModelsDevCatalog();
    if (!catalog) return { models: baseline, source: 'baseline' };
    return mergeModels(baseline, modelsDevToHarness(catalog, source));
  }

  const cached = cache.get(harnessId);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) {
    return cached.list;
  }
  let pending = inFlight.get(harnessId);
  if (!pending) {
    pending = discoverAcpModels(def.binPath, def.def.protocolArgs)
      .catch(() => null)
      .then(async discovered => {
        // 📖 An ACP harness whose discovery answers nothing still deserves a
        // live list: gemini's session/open can fail server-side (its Code
        // Assist endpoint refused kandown's client outright in testing) while
        // models.dev still knows its current model ids.
        let dynamic = discovered;
        if (!dynamic || dynamic.length === 0) {
          const source = MODELS_DEV_SOURCES[harnessId];
          if (source) {
            const catalog = await fetchModelsDevCatalog();
            if (catalog) dynamic = modelsDevToHarness(catalog, source);
          }
        }
        const list = mergeModels(baseline, dynamic);
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
  modelsDevCache = null;
  modelsDevPending = null;
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
