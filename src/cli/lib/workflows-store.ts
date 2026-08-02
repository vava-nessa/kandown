/**
 * @file Community workflow store
 * @description Fetches an approved GitHub-hosted workflow index, installs only
 * pinned and checksum-verified Markdown capsules, records provenance, previews
 * upstream updates as a text diff, and applies them only after confirmation.
 * Network access occurs only through explicit store commands or Settings actions.
 *
 * @functions
 *  → fetchWorkflowRegistry: fetch and validate the approved repository index
 *  → installStoreWorkflow: install one pinned capsule after checksum validation
 *  → previewWorkflowUpdate: validate and diff an available upstream version
 *  → applyWorkflowUpdate: replace an immutable store package after confirmation
 *
 * @exports WorkflowRegistryEntry, WorkflowRegistryResult, WorkflowInstallResult, WorkflowUpdatePreview, fetchWorkflowRegistry, installStoreWorkflow, previewWorkflowUpdate, applyWorkflowUpdate
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportWorkflowCapsule, importWorkflowCapsule, type LoadedWorkflowPackage } from '../../lib/workflows/index.js';
import { atomicWriteFileSync } from './atomic-write.js';
import { loadWorkflowById, replaceStoreWorkflowPackage, writeWorkflowPackage } from './workflows-cli.js';

export const WORKFLOW_REGISTRY_URL = 'https://raw.githubusercontent.com/vava-nessa/kandown/main/registry/workflows.json';

export interface WorkflowRegistryEntry {
  id: string;
  name: string;
  description?: string;
  author: string;
  repo: string;
  ref: string;
  capsule: string;
  sha256: string;
  version: string;
}

export interface WorkflowRegistryResult { entries: WorkflowRegistryEntry[]; url: string; error?: string }
export interface WorkflowInstallResult { ok: boolean; id?: string; error?: string }
export interface WorkflowUpdatePreview { id: string; currentVersion: string; nextVersion: string; changed: boolean; diff: string; entry: WorkflowRegistryEntry }

interface InstallRecord extends WorkflowRegistryEntry { installedAt: string }
interface InstallFile { version: 1; installs: Record<string, InstallRecord> }

function installFilePath(kandownDir: string): string { return join(kandownDir, 'workflow-installs.json'); }
function readInstalls(kandownDir: string): InstallFile {
  try {
    const parsed = JSON.parse(readFileSync(installFilePath(kandownDir), 'utf8')) as InstallFile;
    return parsed.version === 1 && parsed.installs && typeof parsed.installs === 'object' ? parsed : { version: 1, installs: {} };
  } catch { return { version: 1, installs: {} }; }
}
function writeInstalls(kandownDir: string, value: InstallFile): void {
  atomicWriteFileSync(installFilePath(kandownDir), `${JSON.stringify(value, null, 2)}\n`);
}

function validEntry(entry: unknown): entry is WorkflowRegistryEntry {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const item = entry as Record<string, unknown>;
  return typeof item.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)
    && typeof item.name === 'string' && typeof item.author === 'string'
    && typeof item.repo === 'string' && typeof item.ref === 'string'
    && (/^[0-9a-f]{40}$/i.test(item.ref) || /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(item.ref))
    && typeof item.capsule === 'string' && !item.capsule.includes('..') && !item.capsule.startsWith('/')
    && typeof item.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(item.sha256)
    && typeof item.version === 'string';
}

export async function fetchWorkflowRegistry(url = WORKFLOW_REGISTRY_URL): Promise<WorkflowRegistryResult> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return { entries: [], url, error: `HTTP ${response.status}` };
    const payload = await response.json() as unknown;
    const raw = Array.isArray(payload) ? payload : (payload && typeof payload === 'object' ? (payload as { entries?: unknown }).entries : []);
    if (!Array.isArray(raw)) return { entries: [], url, error: 'Registry entries must be an array.' };
    const entries = raw.filter(validEntry);
    return { entries, url, ...(entries.length !== raw.length ? { error: `${raw.length - entries.length} invalid registry entries were ignored.` } : {}) };
  } catch (error) {
    return { entries: [], url, error: error instanceof Error ? error.message : String(error) };
  }
}

function rawBase(entry: WorkflowRegistryEntry): string {
  const repo = entry.repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Registry repository must be a GitHub owner/repo pair.');
  return `https://raw.githubusercontent.com/${repo}/${entry.ref}`;
}

async function fetchPackage(entry: WorkflowRegistryEntry): Promise<{ workflow: LoadedWorkflowPackage; capsule: string }> {
  if (!validEntry(entry)) throw new Error('Invalid workflow registry entry.');
  const response = await fetch(`${rawBase(entry)}/${entry.capsule}`, { headers: { Accept: 'text/markdown' } });
  if (!response.ok) throw new Error(`Capsule fetch failed: HTTP ${response.status}`);
  const capsule = await response.text();
  const checksum = createHash('sha256').update(capsule).digest('hex');
  if (checksum !== entry.sha256.toLowerCase()) throw new Error('Workflow capsule checksum does not match the approved index.');
  const imported = importWorkflowCapsule(capsule);
  if (!imported.ok) throw new Error(imported.errors.map(item => `${item.path}: ${item.message}`).join('; '));
  if (imported.value.manifest.id !== entry.id || imported.value.manifest.version !== entry.version) throw new Error('Registry metadata does not match the workflow capsule.');
  return {
    capsule,
    workflow: {
      ...imported.value,
      manifest: {
        ...imported.value.manifest,
        provenance: { sourceId: entry.id, sourceVersion: entry.version, repository: entry.repo, ref: entry.ref },
      },
    },
  };
}

export async function installStoreWorkflow(kandownDir: string, entry: WorkflowRegistryEntry): Promise<WorkflowInstallResult> {
  try {
    if (existsSync(join(kandownDir, 'workflows', entry.id))) return { ok: false, error: `Workflow ${entry.id} already exists.` };
    const { workflow } = await fetchPackage(entry);
    writeWorkflowPackage(kandownDir, workflow);
    const installs = readInstalls(kandownDir);
    installs.installs[entry.id] = { ...entry, installedAt: new Date().toISOString() };
    writeInstalls(kandownDir, installs);
    return { ok: true, id: entry.id };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}

function simpleDiff(before: string, after: string): string {
  const left = before.split('\n');
  const right = after.split('\n');
  const lines: string[] = [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length && lines.length < 400; index += 1) {
    if (left[index] === right[index]) continue;
    if (left[index] !== undefined) lines.push(`- ${left[index]}`);
    if (right[index] !== undefined) lines.push(`+ ${right[index]}`);
  }
  return lines.join('\n') || 'No content changes.';
}

export async function previewWorkflowUpdate(kandownDir: string, entry: WorkflowRegistryEntry): Promise<WorkflowUpdatePreview> {
  const current = loadWorkflowById(kandownDir, entry.id);
  const currentCapsule = exportWorkflowCapsule(current);
  if (!currentCapsule.ok) throw new Error(currentCapsule.errors.map(item => item.message).join('; '));
  const next = await fetchPackage(entry);
  const nextCapsule = exportWorkflowCapsule(next.workflow);
  if (!nextCapsule.ok) throw new Error(nextCapsule.errors.map(item => item.message).join('; '));
  return {
    id: entry.id,
    currentVersion: current.manifest.version,
    nextVersion: next.workflow.manifest.version,
    changed: currentCapsule.value !== nextCapsule.value,
    diff: simpleDiff(currentCapsule.value, nextCapsule.value),
    entry,
  };
}

export async function applyWorkflowUpdate(kandownDir: string, entry: WorkflowRegistryEntry, confirmed: boolean): Promise<WorkflowInstallResult> {
  if (!confirmed) return { ok: false, error: 'Explicit update confirmation is required.' };
  try {
    const { workflow } = await fetchPackage(entry);
    replaceStoreWorkflowPackage(kandownDir, workflow);
    const installs = readInstalls(kandownDir);
    installs.installs[entry.id] = { ...entry, installedAt: new Date().toISOString() };
    writeInstalls(kandownDir, installs);
    return { ok: true, id: entry.id };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}
