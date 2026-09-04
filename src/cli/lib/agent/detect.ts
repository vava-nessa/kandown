/**
 * @file Harness detection: which installed agents kandown can drive headlessly
 * @description Extends the PATH scan from src/cli/lib/agents.ts with the
 * harness contract of t307: kandown never embeds an LLM and never asks for an
 * API key, it drives harnesses the user already installed and authenticated.
 * The bounded set of wire protocols is claude stream-json, codex exec json,
 * pi rpc mode, and generic ACP (Agent Client Protocol) for the long tail
 * (opencode, gemini, ...).
 *
 * 📖 Detection is runtime-only and never blocking: a missing harness is an
 * install CTA in Settings, not an error. Version probing is best-effort
 * (`<bin> --version`, short timeout, first line) because several CLIs are slow
 * or chatty on stderr; a null version must never hide an installed harness.
 *
 * @functions
 *  → detectHarnessesJSON    : the JSON payload served by /api/agent/harnesses
 *  → getHarnessDef          : find one harness definition by detection id
 *  → resolveHarness         : def + resolved binary path, for session creation
 *
 * @exports HARNESS_DEFS, detectHarnessesJSON, getHarnessDef, resolveHarness
 * @see src/cli/lib/agents.ts: the interactive-launcher PATH scan this extends
 * @see src/cli/lib/agent/agent-runtime.ts: consumes resolved harnesses
 */

import { execFileSync } from 'node:child_process';
import type { DetectedHarness, PermissionMode, PermissionSupport } from '../../../lib/types.js';
import { resolveBinPath } from '../agents.js';

/** 📖 Static harness catalog. `protocolArgs` are the extra argv that switch a
 *  multi-mode binary into its harness-wire mode (opencode and gemini need an
 *  explicit flag, the others are harness-ready on plain invocation). */
export interface HarnessDef {
  id: string;
  name: string;
  bin: string;
  protocol: DetectedHarness['protocol'];
  protocolArgs: string[];
  permissionModes: Record<PermissionMode, PermissionSupport>;
  installHint: string;
}

/** 📖 The bounded harness set. Order is display order in Settings. A harness
 *  listed here but absent from PATH simply shows its install CTA. */
export const HARNESS_DEFS: HarnessDef[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    protocol: 'claude-stream-json',
    protocolArgs: [],
    permissionModes: { yolo: 'native', 'accept-edits': 'native' },
    installHint: 'npm install -g @anthropic-ai/claude-code',
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    bin: 'codex',
    protocol: 'codex-exec-json',
    protocolArgs: [],
    // 📖 codex exec has no interactive approver: yolo maps onto its bypass
    // flags natively, accept-edits can only be approximated by the
    // workspace-write sandbox, so the UI treats it as advisory.
    permissionModes: { yolo: 'native', 'accept-edits': 'advisory' },
    installHint: 'npm install -g @openai/codex',
  },
  {
    id: 'pi',
    name: 'Pi',
    bin: 'pi',
    protocol: 'pi-rpc',
    protocolArgs: ['--mode', 'rpc'],
    // 📖 pi is deliberately permission-free (its extensions own confirmations):
    // both modes are advisory, the diff is shown after the fact.
    permissionModes: { yolo: 'advisory', 'accept-edits': 'advisory' },
    installHint: 'https://github.com/badlogic/pi-mono',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    bin: 'opencode',
    protocol: 'acp',
    protocolArgs: ['acp'],
    // 📖 ACP agents decide per session: session/new reports the available
    // modes and the runtime upgrades support to native when a mode matches.
    permissionModes: { yolo: 'advisory', 'accept-edits': 'advisory' },
    installHint: 'https://opencode.ai',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    bin: 'gemini',
    protocol: 'acp',
    protocolArgs: ['--experimental-acp'],
    permissionModes: { yolo: 'advisory', 'accept-edits': 'advisory' },
    installHint: 'npm install -g @google/gemini-cli',
  },
];

/** 📖 Runs `<bin> --version` with a tight timeout and returns the first
 *  non-empty stdout line, or null on any failure. Never throws. */
function probeVersion(bin: string): string | null {
  try {
    const out = execFileSync(bin, ['--version'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const first = out.split('\n').map(line => line.trim()).find(Boolean);
    return first ? first.slice(0, 80): null;
  } catch {
    return null;
  }
}

/** 📖 Builds the browser-safe detection payload: every known harness with its
 *  install state, resolved path, best-effort version and permission support.
 *  This is the exact body of GET /api/agent/harnesses. */
export function detectHarnessesJSON(): { harnesses: DetectedHarness[] } {
  return {
    harnesses: HARNESS_DEFS.map(def => {
      const binPath = resolveBinPath(def.bin);
      return {
        id: def.id,
        name: def.name,
        bin: def.bin,
        protocol: def.protocol,
        binPath,
        version: binPath ? probeVersion(def.bin): null,
        installed: binPath !== null,
        permissionModes: { ...def.permissionModes },
        installHint: def.installHint,
      };
    }),
  };
}

/** 📖 Returns one harness definition by detection id, or undefined. */
export function getHarnessDef(id: string): HarnessDef | undefined {
  return HARNESS_DEFS.find(def => def.id === id);
}

/** 📖 Resolves a harness for session creation: the definition plus its absolute
 *  binary path. Returns null when the id is unknown or the binary vanished
 *  from PATH since detection, so callers answer 400 instead of spawning ENOENT. */
export function resolveHarness(id: string): { def: HarnessDef; binPath: string } | null {
  const def = getHarnessDef(id);
  if (!def) return null;
  const binPath = resolveBinPath(def.bin);
  return binPath ? { def, binPath }: null;
}
