/**
 * @file Safe agent instruction migration
 * @description Migrates old project and user-level Kandown instruction files
 * without discarding edited content. Generated legacy agent documents are
 * removed only after a known SHA-256 match, while unknown documents are moved
 * to collision-safe backups. The bootstrap helper changes only marker-owned
 * lines and uses an atomic write so user-authored AGENTS.md prose stays intact.
 *
 * @functions
 *  → migrateAgentInstructions - migrate instruction files and legacy documents
 *  → ensureAgentBootstrap - create or repair the managed root AGENTS.md line
 *
 * @exports migrateAgentInstructions, ensureAgentBootstrap,
 * AgentMigrationEvent, AgentMigrationOptions, AGENT_BOOTSTRAP_LINE
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { atomicWriteFileSync } from './atomic-write.js';

export const AGENT_BOOTSTRAP_LINE =
  'This project uses Kandown. Before task work, run `kandown work` and follow its output. <!-- kandown:agent-ref -->';

const AGENT_BOOTSTRAP_MARKER = '<!-- kandown:agent-ref -->';
const LEGACY_AGENT_DOCS = ['AGENT.md', 'AGENT_KANDOWN.md'] as const;
const DEFAULT_KNOWN_HASHES: ReadonlySet<string> = new Set([
  'fc1380adf958f6e46ba8c5462fe56a9b34840bb85cc8648bd7021c0ba45fb7a5',
  '889ff6069c3a7e7881fb59b1dc10a469805f3e866eccf5f29c906c268f02b2f6',
]);

export type AgentMigrationEventCode =
  | 'instruction-renamed'
  | 'instruction-conflict'
  | 'generated-doc-removed'
  | 'legacy-doc-backed-up'
  | 'bootstrap-created'
  | 'bootstrap-appended'
  | 'bootstrap-repaired';

export interface AgentMigrationEvent {
  severity: 'info' | 'warning';
  code: AgentMigrationEventCode;
  message: string;
  path: string;
  destination?: string;
  scope?: 'project' | 'global';
}

export interface AgentMigrationOptions {
  homeDir?: string;
  knownHashes?: ReadonlySet<string>;
}

interface PreservedLine {
  body: string;
  ending: string;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function migrateInstructionFile(
  directory: string,
  scope: 'project' | 'global',
): AgentMigrationEvent[] {
  const oldPath = join(directory, 'instructions.md');
  const newPath = join(directory, 'kandown_work.md');
  if (!existsSync(oldPath)) return [];

  if (existsSync(newPath)) {
    return [{
      severity: 'warning',
      code: 'instruction-conflict',
      message: `Kept both instruction files because ${newPath} already exists.`,
      path: oldPath,
      destination: newPath,
      scope,
    }];
  }

  renameSync(oldPath, newPath);
  return [{
    severity: 'info',
    code: 'instruction-renamed',
    message: `Moved ${oldPath} to ${newPath}.`,
    path: oldPath,
    destination: newPath,
    scope,
  }];
}

function collisionSafePath(directory: string, fileName: string): string {
  const extension = extname(fileName);
  const stem = basename(fileName, extension);
  let candidate = join(directory, fileName);
  let suffix = 1;
  while (existsSync(candidate)) {
    candidate = join(directory, `${stem}.${suffix}${extension}`);
    suffix += 1;
  }
  return candidate;
}

function migrateLegacyAgentDocs(
  kandownDir: string,
  knownHashes: ReadonlySet<string>,
): AgentMigrationEvent[] {
  const events: AgentMigrationEvent[] = [];

  for (const fileName of LEGACY_AGENT_DOCS) {
    const legacyPath = join(kandownDir, fileName);
    if (!existsSync(legacyPath)) continue;

    if (knownHashes.has(sha256(legacyPath))) {
      unlinkSync(legacyPath);
      events.push({
        severity: 'info',
        code: 'generated-doc-removed',
        message: `Removed known generated agent document ${legacyPath}.`,
        path: legacyPath,
      });
      continue;
    }

    const backupDir = join(kandownDir, 'legacy-agent-docs');
    mkdirSync(backupDir, { recursive: true });
    const backupPath = collisionSafePath(backupDir, fileName);
    renameSync(legacyPath, backupPath);
    events.push({
      severity: 'warning',
      code: 'legacy-doc-backed-up',
      message: `Preserved edited agent document at ${backupPath}.`,
      path: legacyPath,
      destination: backupPath,
    });
  }

  return events;
}

function splitPreservingLineEndings(content: string): PreservedLine[] {
  const lines: PreservedLine[] = [];
  let start = 0;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character !== '\n' && character !== '\r') continue;

    const isCrLf = character === '\r' && content[index + 1] === '\n';
    const ending = isCrLf ? '\r\n' : character;
    lines.push({ body: content.slice(start, index), ending });
    if (isCrLf) index += 1;
    start = index + 1;
  }

  if (start < content.length) {
    lines.push({ body: content.slice(start), ending: '' });
  }
  return lines;
}

function preferredLineEnding(content: string): string {
  const firstCrLf = content.indexOf('\r\n');
  const firstLf = content.indexOf('\n');
  const firstCr = content.indexOf('\r');
  if (firstCrLf >= 0 && (firstLf < 0 || firstCrLf <= firstLf)) return '\r\n';
  if (firstLf >= 0) return '\n';
  if (firstCr >= 0) return '\r';
  return '\n';
}

export function migrateAgentInstructions(
  kandownDir: string,
  options: AgentMigrationOptions = {},
): AgentMigrationEvent[] {
  const events: AgentMigrationEvent[] = [];
  const projectDirectory = resolve(kandownDir);
  const globalDirectory = resolve(options.homeDir ?? homedir(), '.kandown');

  events.push(...migrateInstructionFile(projectDirectory, 'project'));
  events.push(...migrateLegacyAgentDocs(
    projectDirectory,
    options.knownHashes ?? DEFAULT_KNOWN_HASHES,
  ));

  if (globalDirectory !== projectDirectory) {
    events.push(...migrateInstructionFile(globalDirectory, 'global'));
  }

  return events;
}

export function ensureAgentBootstrap(projectRoot: string): AgentMigrationEvent[] {
  const agentsPath = join(projectRoot, 'AGENTS.md');
  if (!existsSync(agentsPath)) {
    atomicWriteFileSync(agentsPath, `${AGENT_BOOTSTRAP_LINE}\n`);
    return [{
      severity: 'info',
      code: 'bootstrap-created',
      message: `Created ${agentsPath} with the Kandown bootstrap instruction.`,
      path: agentsPath,
    }];
  }

  const content = readFileSync(agentsPath, 'utf8');
  const lines = splitPreservingLineEndings(content);
  const markedIndexes = lines
    .map((line, index) => line.body.includes(AGENT_BOOTSTRAP_MARKER) ? index : -1)
    .filter((index) => index >= 0);

  if (markedIndexes.length === 0) {
    const ending = preferredLineEnding(content);
    const separator = content.length > 0 && !content.endsWith('\n') && !content.endsWith('\r')
      ? ending
      : '';
    atomicWriteFileSync(agentsPath, `${content}${separator}${AGENT_BOOTSTRAP_LINE}${ending}`);
    return [{
      severity: 'info',
      code: 'bootstrap-appended',
      message: `Appended the Kandown bootstrap instruction to ${agentsPath}.`,
      path: agentsPath,
    }];
  }

  const firstMarkedIndex = markedIndexes[0];
  const leadingBom = lines[firstMarkedIndex].body.startsWith('\uFEFF') ? '\uFEFF' : '';
  const managedBody = `${leadingBom}${AGENT_BOOTSTRAP_LINE}`;
  const isCurrent = markedIndexes.length === 1
    && lines[firstMarkedIndex].body === managedBody;
  if (isCurrent) return [];

  const repaired = lines
    .filter((_, index) => index === firstMarkedIndex || !markedIndexes.includes(index))
    .map((line, index) => ({
      ...line,
      body: index === firstMarkedIndex ? managedBody : line.body,
    }))
    .map((line) => `${line.body}${line.ending}`)
    .join('');
  atomicWriteFileSync(agentsPath, repaired);

  return [{
    severity: 'info',
    code: 'bootstrap-repaired',
    message: `Repaired the managed Kandown bootstrap instruction in ${agentsPath}.`,
    path: agentsPath,
  }];
}
