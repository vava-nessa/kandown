/**
 * @file Browser extension runtime
 * @description Loads project-local bundled extension entries through Blob URLs
 * for standalone File System Access mode, registers browser-safe fields, badges
 * and panels, and computes card badges without a daemon. The same Blob loader
 * fetches server assets with authenticated API requests before importing them,
 * so dynamic imports never need the daemon token in their URL.
 *
 * 📖 Standalone can only see `.kandown/extensions/` inside the directory the
 * user selected. Global extensions under `~/.kandown` remain daemon-only because
 * browser sandboxing intentionally prevents access outside that directory.
 * Bundles must be self-contained JavaScript: Blob modules cannot resolve local
 * relative imports and browsers cannot execute development-only `index.ts`.
 *
 * 📖 The browser invokes the same default extension factory as Node, but exposes
 * a registration-only API. Commands, gates, syncs and lifecycle handlers are
 * counted for display and never executed. Extension gates therefore degrade
 * open without a daemon while the core dependency gate remains active.
 *
 * @functions
 *  → loadStandaloneExtensionRuntime: discover and activate project extensions
 *  → loadExtensionWebModule: import a bundled panel module from daemon or FSA
 *  → reportStandalonePanelOutcome: persist/reset consecutive panel failures
 *  → invalidateStandaloneExtensions: revoke Blob URLs and clear project cache
 * @exports loadStandaloneExtensionRuntime, loadExtensionWebModule, reportStandalonePanelOutcome, invalidateStandaloneExtensions, ExtensionWebModule
 * @see src/lib/extensions/host.ts
 * @see src/components/ExtensionRuntimeProvider.tsx
 */

import { isCompatible, parseManifest } from './manifest';
import { readField } from './namespace';
import { isServerMode, serverReadExtensionFile } from '../filesystem';
import { KANDOWN_VERSION } from '../version';
import type {
  ExtensionBadge,
  ExtensionFactory,
  ExtensionHealth,
  ExtensionManifest,
  ExtensionRuntimePayload,
  ExtensionRuntimeSummary,
  FieldContribution,
  KandownExtensionAPI,
  TaskLike,
  WebPanelContribution,
} from './types';

const QUARANTINE_THRESHOLD = 3;
const SUPPORTED_API_VERSION = 1;
const TRUST_STORAGE_KEY = 'kandown:extension-trust:v1';
const HEALTH_STORAGE_KEY = 'kandown:extension-health:v1';

interface HealthRecord {
  failures: number;
  surface?: string;
  error?: string;
  updatedAt: string;
}

interface BrowserRegistration {
  fields: FieldContribution[];
  panels: WebPanelContribution[];
  commands: string[];
  gates: number;
  syncs: number;
}

interface CachedStandaloneExtension {
  manifest: ExtensionManifest;
  dir: FileSystemDirectoryHandle;
  /** User-local trust/health key derived from project identity and source hash. */
  stateKey: string;
  summary: ExtensionRuntimeSummary;
  registration: BrowserRegistration;
}

export interface ExtensionPanelRenderProps {
  task: Readonly<TaskLike>;
  api: {
    readField(key: string): unknown;
    readAllTasks(): Promise<Readonly<TaskLike>[]>;
    setField(key: string, value: unknown): Promise<void>;
    refresh(): Promise<void>;
  };
  /** Host React runtime. Components use `ui.createElement` and `ui.useState`
   * without bundling a second React copy. */
  ui: typeof import('react');
}

export type ExtensionPanelComponent = (props: ExtensionPanelRenderProps) => import('react').ReactNode;
export type ExtensionFieldEditorComponent = (props: {
  field: ExtensionRuntimeSummary['fields'][number];
  value: unknown;
  disabled: boolean;
  onChange(value: unknown): void | Promise<void>;
  ui: typeof import('react');
}) => import('react').ReactNode;

export interface ExtensionWebModule {
  default?: ExtensionPanelComponent;
  panels?: Record<string, ExtensionPanelComponent>;
  editors?: Record<string, ExtensionFieldEditorComponent>;
}

let cachedHandle: FileSystemDirectoryHandle | null = null;
let cachedRestricted = true;
let cachedProjectKey = '';
let cachedExtensions: CachedStandaloneExtension[] = [];
const memoryTrust = new Set<string>();
const memoryHealth = new Map<string, HealthRecord>();
const moduleCache = new Map<string, Promise<Record<string, unknown>>>();
const blobUrls = new Set<string>();

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readStorageRecord<T>(key: string): Record<string, T> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, T>
      : {};
  } catch {
    return {};
  }
}

function writeStorageRecord<T>(key: string, value: Record<string, T>): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage is best effort */ }
}

function isLocallyTrusted(stateKey: string): boolean {
  return memoryTrust.has(stateKey) || readStorageRecord<boolean>(TRUST_STORAGE_KEY)[stateKey] === true;
}

function saveLocalTrust(stateKey: string): void {
  memoryTrust.add(stateKey);
  const stored = readStorageRecord<boolean>(TRUST_STORAGE_KEY);
  stored[stateKey] = true;
  writeStorageRecord(TRUST_STORAGE_KEY, stored);
}

function readLocalHealth(stateKey: string): HealthRecord | undefined {
  return memoryHealth.get(stateKey) ?? readStorageRecord<HealthRecord>(HEALTH_STORAGE_KEY)[stateKey];
}

function saveLocalHealth(stateKey: string, record: HealthRecord | undefined): void {
  if (record) memoryHealth.set(stateKey, record);
  else memoryHealth.delete(stateKey);
  const stored = readStorageRecord<HealthRecord>(HEALTH_STORAGE_KEY);
  if (record) stored[stateKey] = record;
  else delete stored[stateKey];
  writeStorageRecord(HEALTH_STORAGE_KEY, stored);
}

async function sourceStateKey(projectKey: string, ...sources: string[]): Promise<string> {
  const input = new TextEncoder().encode([projectKey, ...sources].join('\0'));
  const digest = await crypto.subtle.digest('SHA-256', input);
  const fingerprint = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${projectKey}:${fingerprint}`;
}

async function readText(dir: FileSystemDirectoryHandle, relativePath: string): Promise<string> {
  const parts = relativePath.replace(/^\.\//, '').split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '..')) throw new Error('invalid extension file path');
  let current = dir;
  for (const part of parts.slice(0, -1)) current = await current.getDirectoryHandle(part, { create: false });
  const file = await (await current.getFileHandle(parts[parts.length - 1]!)).getFile();
  return file.text();
}

async function sourceTree(dir: FileSystemDirectoryHandle): Promise<string> {
  const files: Array<{ path: string; source: string }> = [];
  const visit = async (current: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
    for await (const entry of current.values()) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        await visit(entry as FileSystemDirectoryHandle, path);
      } else {
        const file = await (entry as FileSystemFileHandle).getFile();
        files.push({ path, source: await file.text() });
      }
    }
  };
  await visit(dir, '');
  files.sort((left, right) => left.path.localeCompare(right.path));
  return JSON.stringify(files);
}

async function importSource(cacheKey: string, source: string): Promise<Record<string, unknown>> {
  const existing = moduleCache.get(cacheKey);
  if (existing) return existing;
  const pending = (async () => {
    // 📖 Node's ESM loader cannot import blob: URLs. The data URL branch keeps
    // the standalone adapter integration-testable without changing browsers,
    // which continue using revocable Blob URLs for normal source sizes.
    const url = typeof window === 'undefined'
      ? `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`
      : URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    if (url.startsWith('blob:')) blobUrls.add(url);
    return import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>;
  })();
  moduleCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    moduleCache.delete(cacheKey);
    throw error;
  }
}

function registrationApi(extId: string, registration: BrowserRegistration): KandownExtensionAPI {
  const safe = (callback: () => void) => {
    try { callback(); } catch { /* one bad registration never blocks siblings */ }
  };
  return {
    id: extId,
    contributeField: (definition) => safe(() => {
      if (!registration.fields.some((field) => field.key === definition.key)) registration.fields.push(definition);
    }),
    contributeWebPanel: (definition) => safe(() => {
      if (!registration.panels.some((panel) => panel.id === definition.id)) registration.panels.push(definition);
    }),
    contributeCommand: (name) => safe(() => {
      if (!registration.commands.includes(name)) registration.commands.push(name);
    }),
    contributeGate: () => { registration.gates += 1; },
    contributeSync: () => { registration.syncs += 1; },
    on: () => { /* lifecycle handlers require the daemon */ },
  };
}

function emptyRegistration(): BrowserRegistration {
  return { fields: [], panels: [], commands: [], gates: 0, syncs: 0 };
}

function summaryFrom(
  manifest: ExtensionManifest,
  health: ExtensionHealth,
  registration: BrowserRegistration,
  error?: string,
  failures = 0,
): ExtensionRuntimeSummary {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    source: 'project',
    health,
    error,
    failures,
    permissions: [...(manifest.permissions ?? [])],
    fields: health === 'enabled' ? registration.fields.map((field) => ({
      extId: manifest.id,
      key: field.key,
      label: field.label,
      type: field.type,
      options: field.options,
      hasBadge: typeof field.badge === 'function',
      editorComponentId: field.editorComponentId,
    })) : [],
    panels: health === 'enabled' ? registration.panels.map((panel) => ({ ...panel, extId: manifest.id })) : [],
    commands: health === 'enabled' ? [...registration.commands] : [],
    gates: health === 'enabled' ? registration.gates : 0,
    syncs: health === 'enabled' ? registration.syncs : 0,
  };
}

export type StandaloneTrustPrompt = (manifest: ExtensionManifest) => boolean | Promise<boolean>;

async function discoverStandalone(
  kandownHandle: FileSystemDirectoryHandle,
  restricted: boolean,
  projectKey: string,
  requestTrust?: StandaloneTrustPrompt,
): Promise<CachedStandaloneExtension[]> {
  let extensionsDir: FileSystemDirectoryHandle;
  try {
    extensionsDir = await kandownHandle.getDirectoryHandle('extensions', { create: false });
  } catch {
    return [];
  }
  const discovered: CachedStandaloneExtension[] = [];

  for await (const entry of extensionsDir.values()) {
    if (entry.kind !== 'directory') continue;
    const dir = entry as FileSystemDirectoryHandle;
    const registration = emptyRegistration();
    const invalidStateKey = `${projectKey}:invalid:${entry.name}`;
    let manifestSource: string;
    let rawManifest: unknown;
    try {
      manifestSource = await readText(dir, 'manifest.json');
      rawManifest = JSON.parse(manifestSource);
    } catch (error) {
      const manifest: ExtensionManifest = { id: entry.name, name: entry.name, version: '0', apiVersion: SUPPORTED_API_VERSION };
      discovered.push({ manifest, dir, stateKey: invalidStateKey, registration, summary: summaryFrom(manifest, 'errored', registration, `manifest failed: ${toErrorMessage(error)}`) });
      continue;
    }
    const parsed = parseManifest(rawManifest);
    if (!parsed.ok) {
      const manifest: ExtensionManifest = { id: entry.name, name: entry.name, version: '0', apiVersion: SUPPORTED_API_VERSION };
      discovered.push({ manifest, dir, stateKey: invalidStateKey, registration, summary: summaryFrom(manifest, 'errored', registration, parsed.error) });
      continue;
    }
    const manifest = parsed.manifest;
    if (manifest.apiVersion !== SUPPORTED_API_VERSION) {
      discovered.push({ manifest, dir, stateKey: invalidStateKey, registration, summary: summaryFrom(manifest, 'errored', registration, `unsupported apiVersion ${manifest.apiVersion} (expected ${SUPPORTED_API_VERSION})`) });
      continue;
    }
    if (!isCompatible(manifest, KANDOWN_VERSION)) {
      discovered.push({ manifest, dir, stateKey: invalidStateKey, registration, summary: summaryFrom(manifest, 'errored', registration, `requires kandown >= ${manifest.minKandownVersion}`) });
      continue;
    }

    let source: string;
    try {
      source = await readText(dir, 'index.js');
    } catch (error) {
      discovered.push({ manifest, dir, stateKey: invalidStateKey, registration, summary: summaryFrom(manifest, 'errored', registration, `browser load failed: ${toErrorMessage(error)}`) });
      continue;
    }
    // 📖 Every file is fingerprinted before any extension code executes. This
    // includes deferred panel entries, so changing web.js cannot reuse trust
    // granted to an older index.js bundle.
    const stateKey = await sourceStateKey(projectKey, await sourceTree(dir));
    const failure = readLocalHealth(stateKey);
    if (failure && failure.failures >= QUARANTINE_THRESHOLD) {
      discovered.push({ manifest, dir, stateKey, registration, summary: summaryFrom(manifest, 'quarantined', registration, failure.error, failure.failures) });
      continue;
    }

    let trusted = isLocallyTrusted(stateKey);
    if (!trusted && requestTrust) {
      trusted = await requestTrust(manifest);
      if (trusted) saveLocalTrust(stateKey);
    }
    if (!trusted) {
      const reason = restricted ? 'restricted mode requires local approval' : 'project extension not trusted locally';
      discovered.push({ manifest, dir, stateKey, registration, summary: summaryFrom(manifest, 'disabled', registration, reason, failure?.failures ?? 0) });
      continue;
    }

    try {
      const module = await importSource(`standalone:${stateKey}:index.js`, source);
      const factory = module.default as ExtensionFactory | undefined;
      if (typeof factory !== 'function') throw new Error('index.js default export is not a function');
      await factory(registrationApi(manifest.id, registration));
      discovered.push({ manifest, dir, stateKey, registration, summary: summaryFrom(manifest, 'enabled', registration, undefined, failure?.failures ?? 0) });
    } catch (error) {
      discovered.push({ manifest, dir, stateKey, registration, summary: summaryFrom(manifest, 'errored', registration, `browser load failed: ${toErrorMessage(error)}`, failure?.failures ?? 0) });
    }
  }
  return discovered;
}

function computeBadges(extensions: CachedStandaloneExtension[], tasks: TaskLike[]): Record<string, ExtensionBadge[]> {
  const result: Record<string, ExtensionBadge[]> = {};
  for (const task of tasks) {
    const badges: ExtensionBadge[] = [];
    for (const extension of extensions) {
      if (extension.summary.health !== 'enabled') continue;
      for (const field of extension.registration.fields) {
        if (!field.badge) continue;
        try {
          const value = readField(task.frontmatter, extension.manifest.id, field.key, field.type);
          const text = field.badge(value, task);
          if (typeof text === 'string' && text.trim()) badges.push({ extId: extension.manifest.id, fieldKey: field.key, text });
        } catch {
          // Render failures are isolated. Panel failures have an explicit report
          // channel; badge failures stay fail-open so cards always render.
        }
      }
    }
    if (badges.length > 0) result[task.id] = badges;
  }
  return result;
}

/** Discovers project-local extensions and computes current standalone badges. */
export async function loadStandaloneExtensionRuntime(
  kandownHandle: FileSystemDirectoryHandle,
  restricted: boolean,
  tasks: TaskLike[],
  projectKey: string,
  requestTrust?: StandaloneTrustPrompt,
): Promise<ExtensionRuntimePayload> {
  if (cachedHandle !== kandownHandle || cachedRestricted !== restricted || cachedProjectKey !== projectKey || cachedExtensions.length === 0) {
    invalidateStandaloneExtensions();
    cachedHandle = kandownHandle;
    cachedRestricted = restricted;
    cachedProjectKey = projectKey;
    cachedExtensions = await discoverStandalone(kandownHandle, restricted, projectKey, requestTrust);
  }
  return {
    extensions: cachedExtensions.map((extension) => extension.summary),
    badges: computeBadges(cachedExtensions, tasks),
  };
}

/** Imports one bundled panel module after reading it through the active backend. */
export async function loadExtensionWebModule(
  kandownHandle: FileSystemDirectoryHandle | null,
  extId: string,
  entry: string,
): Promise<ExtensionWebModule> {
  const safeEntry = entry.replace(/^\.\//, '');
  if (!safeEntry || safeEntry.split('/').some((part) => part === '..')) throw new Error('invalid panel entry path');
  if (isServerMode()) {
    const source = await serverReadExtensionFile(extId, safeEntry);
    return importSource(`server:${extId}:${safeEntry}`, source) as Promise<ExtensionWebModule>;
  }
  if (!kandownHandle) throw new Error('project directory is unavailable');
  const extensionsDir = await kandownHandle.getDirectoryHandle('extensions', { create: false });
  const extensionDir = await extensionsDir.getDirectoryHandle(extId, { create: false });
  return importSource(`standalone:${extId}:${safeEntry}`, await readText(extensionDir, safeEntry)) as Promise<ExtensionWebModule>;
}

/** Persists a standalone panel result in user-local browser storage. */
export async function reportStandalonePanelOutcome(
  _kandownHandle: FileSystemDirectoryHandle,
  extId: string,
  outcome: 'success' | 'failure',
  error?: string,
): Promise<{ health: ExtensionHealth; failures: number; error?: string }> {
  const cached = cachedExtensions.find((extension) => extension.manifest.id === extId);
  if (!cached) return { health: 'disabled', failures: 0, error: 'extension runtime is not active' };
  const previous = readLocalHealth(cached.stateKey);
  if (outcome === 'success') {
    if (previous?.surface === 'webPanel') {
      saveLocalHealth(cached.stateKey, undefined);
      cached.summary.failures = 0;
      cached.summary.error = undefined;
    }
    return { health: 'enabled', failures: 0 };
  }

  const failures = previous?.surface === 'webPanel' ? previous.failures + 1 : 1;
  const message = error || 'web panel failed';
  saveLocalHealth(cached.stateKey, {
    failures,
    surface: 'webPanel',
    error: message,
    updatedAt: new Date().toISOString(),
  });
  const quarantined = failures >= QUARANTINE_THRESHOLD;
  if (quarantined) invalidateStandaloneExtensions();
  return {
    health: quarantined ? 'quarantined' : 'enabled',
    failures,
    error: quarantined ? `quarantined after ${failures} failures (last: ${message})` : message,
  };
}

/** Clears project runtime caches and revokes every generated module URL. */
export function invalidateStandaloneExtensions(): void {
  for (const url of blobUrls) URL.revokeObjectURL(url);
  blobUrls.clear();
  moduleCache.clear();
  cachedHandle = null;
  cachedProjectKey = '';
  cachedExtensions = [];
}
