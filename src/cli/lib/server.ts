/**
 * @file Kandown Daemon HTTP Server & API Router
 * @description Provides the REST API, SSE live reload, auto-html bundling refresh,
 * and remote auto-updater routes (/api/update/check & /api/update/apply) for the
 * Web application.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readFileSync, copyFileSync, unlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { getProjectRoot, getTasksDir, findTaskPath, listTaskFilenames, newTaskFilePath, readTask, listTaskIds, writeTaskContent } from './board-reader';
import { resolveTaskFilename } from '../../lib/task-filename';
import { parseTaskFile } from '../../lib/parser';
import { loadConfig, saveConfig } from './config';
import { detectCatalogJSON } from './agents';
import { detectHarnessesJSON } from './agent/detect';
import {
  createAgentSession,
  deliverRawLine,
  getAgentSession,
  listAgentSessions,
  sendToSession,
  setAgentPermissionHandler,
  stopAgentSession,
  subscribeAgentSession,
} from './agent/agent-runtime';
import { buildPermissionResponse } from './agent/adapters/acp';
import { createPermissionQueue } from './agent/permission-queue';
import { createOrchestrator, type AutopilotOrchestrator } from './agent/orchestrator';
import { createSessionEditTracker, type SessionEditTracker } from './agent/session-edits';
import { createWatcher, type FileWatcher } from './file-watcher';
import {
  forgetSessionIndexEntry,
  indexEntryForPrompt,
  listSessionIndexEntries,
  patchSessionIndexEntry,
  upsertSessionIndexEntry,
  type SessionIndexEntry,
} from './agent/session-index';
import type { AgentEvent, AgentSessionInfo } from './agent/types';
import type { PermissionMode } from '../../lib/types';
import { getCurrentVersion, getInstalledVersion, semverGt, performGlobalPackageUpdate, PKG_ROOT } from './updater';
import { atomicWriteFileSync } from './atomic-write';
import { loadExtensionHost } from './extensions-cli';
import { moveTaskWithGates, type MoveTaskResult } from './task-move';
import { fetchRegistry, installExtension, type RegistryEntry } from './extensions-store';
import { fetchRegistry as fetchThemeRegistry, installTheme, listInstalledThemes, type RegistryEntry as ThemeRegistryEntry } from './themes-store';
import type { ExtensionHost } from '../../lib/extensions/host';
import {
  applyBoardPreset,
  forkWorkflow,
  listWorkflowPackages,
  loadWorkflowById,
  missingWorkflowRoles,
  previewBoardPreset,
  updateLocalWorkflowFile,
} from './workflows-cli';
import { compileProjectKandownWork } from './kandown-work';
import { applyWorkflowUpdate, fetchWorkflowRegistry, installStoreWorkflow, previewWorkflowUpdate, type WorkflowRegistryEntry } from './workflows-store';
import { buildSkillSessionPrompt, findSessionSkill, listWorkflowSkills } from './skills';
import { extractToken, selfOrigin, verifyToken } from './daemon-auth';

const START_PORT_RANGE = 2050;
const END_PORT_RANGE = 2099;
const UNSAFE_PORTS = new Set([2049, 4045, 6000, 6665, 6666, 6667, 6668, 6669, 6697]);

/** 📖 Chat affordances (t312): appended to the compiled prompt of every chat
 * session created through POST /api/agent/sessions. Teaches agents the markup
 * the chat sidebar renders: [[tXXX]] (or bare tXXX) references become
 * clickable task chips, and a final `[show: tXXX]` line makes the web UI open
 * that task automatically (scrolling to the anchored section) once the turn
 * completes. Keep byte-identical with the Vite dev mirror copy in
 * vite.config.ts: the daemon bundle and the dev plugin load in different
 * runtimes, so the literal is duplicated on purpose (same pattern as the
 * route handlers the mirror reimplements). */
const CHAT_AFFORDANCES_PROMPT = [
  '## Chat affordances',
  '',
  'Your reply renders as Markdown in the kandown chat sidebar: headings, lists, bold, inline code and fenced code blocks all work.',
  'Reference a task inline as [[t123]] (a bare t123 works too): the UI renders it as a clickable chip that opens the task.',
  'To point the user at a task, end your reply with the directive on its own line: [show: t123], optionally with a tight anchor suffix: [show: t123]#description, #subtasks or #report.',
  'With the directive, the app opens that task automatically and scrolls to the section when your turn completes.',
  'Use [show: t123] whenever the user asks you to find or show something: they get one click to the right task.',
].join('\n');

interface SseClient {
  id: number;
  res: ServerResponse;
}
let sseClients: SseClient[] = [];
let nextClientId = 1;

/** 📖 Per-process auth token (M5). Set by `cmdDaemon` before the server starts
 * binding so every subsequent request can be checked in constant time. Cleared
 * on shutdown so a refreshed daemon never carries the previous token in
 * memory. `null` means the server is running without auth (unit tests, the
 * Vite dev plugin) — explicit, not implicit. */
let activeToken: string | null = null;
export function setActiveToken(token: string | null): void { activeToken = token; }
export function getActiveToken(): string | null { return activeToken; }

/** 📖 One CORS helper. The browser matches `Origin` against
 * `Access-Control-Allow-Origin` exactly and refuses wildcards here, so the
 * only legitimate caller is the page Kandown itself served. Every response
 * that goes back to the client — JSON, text, SSE headers and the OPTIONS
 * preflight — must travel through this helper so a wildcard never sneaks
 * back in by accident. */
function corsHeaders(port: number): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': selfOrigin(port),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Kandown-Token',
  };
}

/** 📖 Returns `true` when no auth is configured (tests, Vite dev) or when the
 * supplied token matches the active one. Failure returns `false` and writes a
 * `401` response with the same strict CORS headers, so the browser can read
 * the body without a separate preflight. */
function authenticateHttp(req: IncomingMessage, url: URL, res: ServerResponse): boolean {
  if (activeToken === null) return true;
  const candidate = extractToken(req, url);
  if (candidate === null || !verifyToken(activeToken, candidate)) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      ...corsHeaders(localPort(res)),
    });
    res.end(JSON.stringify({ error: 'Token missing or invalid' }));
    return false;
  }
  return true;
}

/** 📖 One extension host per daemon process. Built lazily on first /api/extensions
 *  request and reused; enable/disable mutate this same instance and reload. */
let extensionHost: ExtensionHost | null = null;
let extensionHostDir: string | null = null;
async function getExtensionHost(kandownDir: string): Promise<ExtensionHost> {
  if (!extensionHost || extensionHostDir !== kandownDir) {
    extensionHost = await loadExtensionHost(kandownDir);
    extensionHostDir = kandownDir;
  }
  return extensionHost;
}

export function broadcastSseEvent(data: Record<string, unknown>): void {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(c => c.res.write(payload));
}

// ─── Live editing: tracker + watcher + approvals (t309) ─────────────────────

interface AgentEditRuntime {
  tracker: SessionEditTracker;
  watcher: FileWatcher;
}

/** 📖 One live-edit runtime per daemon process, created lazily on the first
 *  agent session so projects that never use harnesses pay for no watcher.
 *  Rebuilt if the daemon is pointed at a different project. The watcher feeds
 *  real disk writes (cached before text plus freshly read after text) into the
 *  tracker, which gates them into task_diff broadcasts for active pairs. */
let agentEditRuntime: AgentEditRuntime | null = null;
let agentEditRuntimeDir: string | null = null;

function getAgentEditRuntime(kandownDir: string): AgentEditRuntime {
  if (agentEditRuntime && agentEditRuntimeDir === kandownDir) return agentEditRuntime;
  agentEditRuntime?.watcher.stop();
  agentEditRuntime?.tracker.dispose();
  const tracker = createSessionEditTracker(
    getProjectRoot(kandownDir),
    getTasksDir(kandownDir),
    broadcastSseEvent,
  );
  const watcher = createWatcher();
  watcher.setOnTaskContentChange((absolutePath, before, after) => {
    tracker.recordChange(absolutePath, before, after);
  });
  watcher.start(kandownDir);
  agentEditRuntime = { tracker, watcher };
  agentEditRuntimeDir = kandownDir;
  return agentEditRuntime;
}

/** 📖 Approval queue for routed permission requests; entries are parked here
 *  until the web UI resolves them (see the two /api/agent/sessions routes). */
const permissionQueue = createPermissionQueue();

/** 📖 One autopilot orchestrator per daemon process (t311), created lazily on
 *  the first /api/agent/autopilot request so projects that never use the
 *  feature pay for nothing. Rebuilt if the daemon is pointed at a different
 *  project. Snapshots broadcast on the board SSE channel at every pivot. */
let autopilotOrchestrator: AutopilotOrchestrator | null = null;
let autopilotOrchestratorDir: string | null = null;

function getAutopilotOrchestrator(kandownDir: string): AutopilotOrchestrator {
  if (autopilotOrchestrator && autopilotOrchestratorDir === kandownDir) return autopilotOrchestrator;
  autopilotOrchestrator?.dispose();
  autopilotOrchestrator = createOrchestrator(
    getProjectRoot(kandownDir),
    kandownDir,
    { broadcast: broadcastSseEvent },
  );
  autopilotOrchestratorDir = kandownDir;
  return autopilotOrchestrator;
}

/** 📖 Git work-tree detection, cached per project root for the process
 *  lifetime: `.git` present, or git itself confirming. The two-second guard
 *  keeps a hung git binary from stalling a session-create request. */
const gitWorkTreeCache = new Map<string, boolean>();
const execFileAsync = promisify(execFile);

async function isGitWorkTree(projectRoot: string): Promise<boolean> {
  const cached = gitWorkTreeCache.get(projectRoot);
  if (cached !== undefined) return cached;
  let inside = existsSync(join(projectRoot, '.git'));
  if (!inside) {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: projectRoot,
        timeout: 2000,
      });
      inside = stdout.trim() === 'true';
    } catch {
      inside = false;
    }
  }
  gitWorkTreeCache.set(projectRoot, inside);
  return inside;
}

interface AgentSessionCreatedResponse {
  session: AgentSessionInfo;
  /** Present when the project root sits outside any git work tree: the UI
   *  should soften its diff story since no git safety net exists. */
  gitWarning?: 'not-a-git-repo';
}

function localPort(res: ServerResponse): number {
  // 📖 The response socket exposes the port the request was received on,
  // which is exactly the daemon's bound port. One helper instead of threading
  // `port` through every writeJson / writeText / writeHead call site.
  const socket = res.socket as { localPort?: number } | null;
  return socket && typeof socket.localPort === 'number' ? socket.localPort : 0;
}

function handleCors(res: ServerResponse): void {
  res.writeHead(204, corsHeaders(localPort(res)));
  res.end();
}

function writeJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...corsHeaders(localPort(res)),
  });
  res.end(JSON.stringify(data));
}

function writeText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...corsHeaders(localPort(res)),
  });
  res.end(text);
}

/** 📖 Reads a request body once for task writes and archive moves. */
function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolveBody(body));
    req.on('error', rejectBody);
  });
}

/**
 * 📖 Ensures the project's kandown.html is synced with the installed CLI bundle.
 */
export function syncProjectKandownHtml(kandownDir: string): boolean {
  try {
    const projectHtml = join(kandownDir, 'kandown.html');
    const distHtml = join(PKG_ROOT, 'dist', 'index.html');

    if (!existsSync(distHtml)) return false;

    if (!existsSync(projectHtml)) {
      copyFileSync(distHtml, projectHtml);
      return true;
    }

    const currentContent = readFileSync(projectHtml, 'utf8');
    const newContent = readFileSync(distHtml, 'utf8');

    if (currentContent !== newContent) {
      atomicWriteFileSync(projectHtml, newContent);
      return true;
    }
  } catch { /* ignore refresh errors */ }
  return false;
}

/**
 * 📖 Legacy no-op kept for compatibility with older bundled imports.
 * Package managers own the global `kandown` executable; the daemon must never
 * rewrite user PATH symlinks because a wrong bundle-relative path can brick the
 * CLI after launch or update.
 */
export function syncGlobalSymlinks(): void {}

function readDaemonPort(kandownDir: string): number | null {
  try {
    const raw = JSON.parse(readFileSync(join(kandownDir, 'daemon.json'), 'utf8')) as { port?: unknown };
    return typeof raw.port === 'number' && Number.isInteger(raw.port) ? raw.port : null;
  } catch {
    return null;
  }
}

function restartDaemonAfterUpdateResponse(res: ServerResponse, kandownDir: string): void {
  const cliPath = process.argv[1];
  if (!cliPath) return;

  const args = ['--no-update-check', 'daemon', 'run', '--path', kandownDir];
  const port = readDaemonPort(kandownDir);
  if (port !== null) args.push('--port', String(port));

  // 📖 The web update route runs inside the daemon itself. After the package is
  // installed, this tiny detached launcher waits for the current process to
  // release its port, then starts the new CLI daemon on the same project. This
  // makes Web UI-triggered updates actually switch to the updated server code.
  const launcher = `
const { spawn } = require('node:child_process');
const [nodeBin, cliPath, ...cliArgs] = process.argv.slice(1);
setTimeout(() => {
  const child = spawn(nodeBin, [cliPath, ...cliArgs], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, KANDOWN_DAEMON: '1' },
  });
  child.unref();
}, 350);
`;

  res.on('finish', () => {
    const child = spawn(process.execPath, ['-e', launcher, process.execPath, cliPath, ...args], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, KANDOWN_DAEMON: '1' },
    });
    child.unref();
    setTimeout(() => process.exit(0), 50).unref();
  });
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL, kandownDir: string): Promise<void> {
  const path = url.pathname;
  const method = req.method || 'GET';

  // 📖 /api/daemon is the liveness check the TUI and the dashboard use to
  // confirm a daemon is ours before reading `daemon.json`. It must keep
  // answering without a token, otherwise the very request that proves the
  // daemon is up is the one the daemon refuses. Everything else from here on
  // requires the token. Both `fetch` and `EventSource` get the same treatment
  // because `extractToken` checks the header first and falls back to
  // `?token=` for the SSE route.
  if (path === '/api/daemon' && method === 'GET') {
    return writeJson(res, 200, {
      ok: true,
      pid: process.pid,
      kandownDir,
      version: getCurrentVersion(),
      startedAt: new Date().toISOString(),
      agentHook: process.env.KANDOWN_AGENT_HOOK_URL ? { enabled: true, label: process.env.KANDOWN_AGENT_HOOK_LABEL || 'Send to Agent' } : null,
    });
  }

  if (!authenticateHttp(req, url, res)) return;

  if (path === '/api/version' && method === 'GET') {
    return writeJson(res, 200, {
      version: getCurrentVersion(),
    });
  }

  if (path === '/api/update/check' && method === 'GET') {
    const current = getCurrentVersion();
    const latest = await new Promise<string | null>((resolve) => {
      const child = spawn('npm', ['view', 'kandown', 'version'], {
        timeout: 4000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        detached: false,
      });
      let stdout = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', () => {});
      child.on('error', () => resolve(null));
      child.on('close', (code) => {
        if (code !== 0) return resolve(null);
        resolve(stdout.trim().replace(/^"|"$/g, '') || null);
      });
    });

    // 📖 "Am I up to date?" is a question about the package **on disk**, not
    // about this process. The daemon is long-lived: once an update lands, the
    // files become 0.37.0 while this process keeps reporting the 0.36.0 it was
    // compiled as. Comparing the registry against the compiled constant is what
    // made the banner reappear forever after a successful update.
    const installed = getInstalledVersion() ?? current;
    const updateAvailable = latest ? semverGt(latest, installed) > 0 : false;
    // 📖 Installed ahead of running = updated underneath us; the fix is a daemon
    // restart, not another download. Surfaced separately so the UI can say so
    // instead of nagging the user to re-install what they already have.
    const restartRequired = semverGt(installed, current) > 0;
    return writeJson(res, 200, {
      current: installed,
      running: current,
      latest: latest || installed,
      updateAvailable,
      restartRequired,
    });
  }

  if (path === '/api/update/apply' && method === 'POST') {
    const current = getCurrentVersion();
    const latest = await new Promise<string | null>((resolve) => {
      const child = spawn('npm', ['view', 'kandown', 'version'], {
        timeout: 4000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        detached: false,
      });
      let stdout = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.on('error', () => resolve(null));
      child.on('close', (code) => resolve(code === 0 ? stdout.trim() : null));
    });

    const targetVersion = latest || current;
    const ok = await performGlobalPackageUpdate(`kandown@${targetVersion}`);
    syncProjectKandownHtml(kandownDir);

    if (ok) {
      restartDaemonAfterUpdateResponse(res, kandownDir);
      writeJson(res, 200, { ok: true, version: targetVersion, message: 'Update installed successfully; daemon is restarting' });
      broadcastSseEvent({ type: 'update', version: targetVersion });
    } else {
      writeJson(res, 500, { ok: false, message: 'Global package installation failed' });
    }
    return;
  }

  if (path === '/api/events' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...corsHeaders(localPort(res)),
    });
    res.write('retry: 2000\n\n');
    const id = nextClientId++;
    sseClients.push({ id, res });
    req.on('close', () => {
      sseClients = sseClients.filter(c => c.id !== id);
    });
    return;
  }

  if (path === '/api/board') {
    if (method === 'GET') {
      const tasksDir = getTasksDir(kandownDir);
      const boardPath = join(tasksDir, 'board.md');
      const text = existsSync(boardPath) ? readFileSync(boardPath, 'utf8') : '';
      return writeText(res, 200, text);
    }
    if (method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const tasksDir = getTasksDir(kandownDir);
        if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
        atomicWriteFileSync(join(tasksDir, 'board.md'), body);
        broadcastSseEvent({ type: 'board' });
        writeJson(res, 200, { ok: true });
      });
      return;
    }
  }

  if (path === '/api/config') {
    if (method === 'GET') {
      return writeJson(res, 200, loadConfig(kandownDir));
    }
    if (method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          saveConfig(kandownDir, parsed);
          if (extensionHostDir === kandownDir) {
            extensionHost = null;
            extensionHostDir = null;
          }
          broadcastSseEvent({ type: 'config' });
          writeJson(res, 200, { ok: true });
        } catch (error) {
          writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      });
      return;
    }
  }

  if (path === '/api/instructions') {
    const instructionsPath = join(kandownDir, 'kandown_work.md');
    if (method === 'GET') return writeText(res, 200, existsSync(instructionsPath) ? readFileSync(instructionsPath, 'utf8') : '');
    if (method === 'PUT') {
      try {
        atomicWriteFileSync(instructionsPath, await readRequestBody(req));
        broadcastSseEvent({ type: 'instructions' });
        return writeJson(res, 200, { ok: true });
      } catch (error) {
        return writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  // 📖 Skill catalog for the web UI. Chat metadata (`chat`) rides along from
  // the listing itself: present only when a valid manifest declares it, with
  // interactive/autoApply defaults already applied by the loader, so this route
  // needs no chat logic of its own.
  if (path === '/api/skills' && method === 'GET') {
    const config = loadConfig(kandownDir);
    const active = new Set(config.workflow.skills);
    const roles = new Set(Object.values(config.board.columnMeta).map(meta => meta.role));
    const skills = listWorkflowSkills(kandownDir).map(skill => {
      const missingRole = skill.requiredRoles?.find(role => !roles.has(role));
      const wrongWorkflow = skill.compatibleWorkflows?.length && !skill.compatibleWorkflows.includes(config.workflow.active);
      const reason = !skill.valid
        ? skill.errors.join('; ')
        : wrongWorkflow
          ? `Compatible with: ${skill.compatibleWorkflows?.join(', ')}`
          : missingRole
            ? `Requires column role: ${missingRole}`
            : undefined;
      return { ...skill, active: active.has(skill.id), compatible: !reason, ...(reason ? { compatibilityReason: reason } : {}) };
    });
    return writeJson(res, 200, { skills });
  }

  if (path === '/api/workflows' && method === 'GET') {
    try {
      const config = loadConfig(kandownDir);
      const selected = loadWorkflowById(kandownDir, config.workflow.active);
      const compiled = compileProjectKandownWork(kandownDir);
      return writeJson(res, 200, {
        workflows: listWorkflowPackages(kandownDir),
        selected,
        preview: compiled.markdown,
        stats: compiled.stats,
        diagnostics: compiled.diagnostics,
        boardPresetPreview: selected.boardPreset ? previewBoardPreset(kandownDir, selected.manifest.id) : null,
      });
    } catch (error) {
      return writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (path === '/api/workflows/registry' && method === 'GET') {
    return writeJson(res, 200, await fetchWorkflowRegistry());
  }

  if (path === '/api/workflows/install' && method === 'POST') {
    try {
      const body = JSON.parse(await readRequestBody(req)) as { entry?: WorkflowRegistryEntry };
      if (!body.entry) return writeJson(res, 400, { ok: false, error: 'Registry entry is required.' });
      const result = await installStoreWorkflow(kandownDir, body.entry);
      broadcastSseEvent({ type: 'workflows' });
      return writeJson(res, result.ok ? 200 : 400, result);
    } catch (error) { return writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }); }
  }

  if (path === '/api/workflows/update' && method === 'POST') {
    try {
      const body = JSON.parse(await readRequestBody(req)) as { entry?: WorkflowRegistryEntry; confirm?: boolean };
      if (!body.entry) return writeJson(res, 400, { ok: false, error: 'Registry entry is required.' });
      if (body.confirm !== true) return writeJson(res, 200, { ok: true, preview: await previewWorkflowUpdate(kandownDir, body.entry) });
      const result = await applyWorkflowUpdate(kandownDir, body.entry, true);
      broadcastSseEvent({ type: 'workflows' });
      return writeJson(res, result.ok ? 200 : 400, result);
    } catch (error) { return writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }); }
  }

  if (path.startsWith('/api/workflows/') && method === 'POST') {
    const action = path.slice('/api/workflows/'.length);
    let body: { id?: unknown; path?: unknown; content?: unknown; confirm?: unknown } = {};
    try { body = JSON.parse(await readRequestBody(req)) as typeof body; }
    catch (error) { return writeJson(res, 400, { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` }); }
    if (typeof body.id !== 'string') return writeJson(res, 400, { error: 'Workflow id is required.' });
    try {
      if (action === 'use') {
        const workflow = loadWorkflowById(kandownDir, body.id);
        const missing = missingWorkflowRoles(kandownDir, workflow);
        if (missing.length > 0) return writeJson(res, 409, { error: `Missing required column roles: ${missing.join(', ')}.`, missing, boardPresetPreview: workflow.boardPreset ? previewBoardPreset(kandownDir, body.id) : null });
        const config = loadConfig(kandownDir);
        config.workflow.active = workflow.manifest.id;
        saveConfig(kandownDir, config);
        broadcastSseEvent({ type: 'config' });
        return writeJson(res, 200, { ok: true });
      }
      if (action === 'fork') {
        const workflow = forkWorkflow(kandownDir, body.id);
        broadcastSseEvent({ type: 'workflows' });
        return writeJson(res, 200, { ok: true, workflow });
      }
      if (action === 'edit') {
        if (typeof body.path !== 'string' || typeof body.content !== 'string') return writeJson(res, 400, { error: 'path and content are required.' });
        const workflow = updateLocalWorkflowFile(kandownDir, body.id, body.path, body.content);
        broadcastSseEvent({ type: 'workflows' });
        return writeJson(res, 200, { ok: true, workflow });
      }
      if (action === 'apply-preset') {
        const preview = previewBoardPreset(kandownDir, body.id);
        if (body.confirm !== true) return writeJson(res, 409, { error: 'Explicit confirmation is required.', preview });
        const applied = applyBoardPreset(kandownDir, body.id);
        broadcastSseEvent({ type: 'config' });
        broadcastSseEvent({ type: 'board' });
        return writeJson(res, 200, { ok: true, preview: applied });
      }
      return writeJson(res, 404, { error: 'Unknown workflow action.' });
    } catch (error) {
      return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (path === '/api/tasks' && method === 'GET') {
    return writeJson(res, 200, listTaskIds(kandownDir));
  }

  // 📖 Detected agent catalog for the web UI. Detection (`which`) runs here in
  // the daemon (Node) — the browser can't see $PATH, so it asks the backend.
  if (path === '/api/agents' && method === 'GET') {
    return writeJson(res, 200, detectCatalogJSON(kandownDir));
  }

  // 📖 Agent harness API (t307, t308). The daemon owns the harness child
  // processes: detection answers what is installed, sessions spawn harnesses
  // with the compiled kandown-work document as initial prompt (and write the
  // thin per-project index entry the chat sidebar lists), events stream over a
  // per-session SSE channel, follow-ups go through /send, and stop is always
  // available. The index itself lives under ~/.kandown/sessions/<projectHash>/
  // (see src/cli/lib/agent/session-index.ts). Fan-out note: the Vite dev
  // plugin mirrors these routes and demoBackend answers 501.
  if (path === '/api/agent/harnesses' && method === 'GET') {
    return writeJson(res, 200, detectHarnessesJSON());
  }

  if (path === '/api/agent/sessions' && method === 'GET') {
    return writeJson(res, 200, { sessions: listAgentSessions() });
  }

  if (path === '/api/agent/sessions' && method === 'POST') {
    let body: {
      harnessId?: unknown;
      taskId?: unknown;
      message?: unknown;
      title?: unknown;
      permissionMode?: unknown;
      resumeSessionId?: unknown;
      skillId?: unknown;
    };
    try {
      body = JSON.parse(await readRequestBody(req)) as typeof body;
    } catch (error) {
      return writeJson(res, 400, { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
    }
    if (typeof body.harnessId !== 'string' || !body.harnessId.trim()) {
      return writeJson(res, 400, { error: 'harnessId is required' });
    }
    const taskId = typeof body.taskId === 'string' && body.taskId.trim() ? body.taskId.trim() : undefined;
    const skillId = typeof body.skillId === 'string' && body.skillId.trim() ? body.skillId.trim() : undefined;
    let compiled;
    try {
      compiled = compileProjectKandownWork(kandownDir, taskId);
    } catch {
      return writeJson(res, 404, { error: `Task not found: ${taskId}` });
    }
    const config = loadConfig(kandownDir);
    // 📖 Skill launch (t310): the client sends only a skill id; the prompt is
    // assembled server-side from the compiled doc plus the skill instructions
    // and a directive tuned to whether the skill is interactive. An unknown,
    // invalid, or unconfigured (non built-in) id is rejected before any
    // harness process is spawned.
    let prompt = compiled.markdown;
    let skillAutoApply = false;
    if (skillId) {
      const skill = findSessionSkill(kandownDir, skillId, config.workflow.skills);
      if (!skill) return writeJson(res, 400, { error: `Unknown or inactive skill: ${skillId}` });
      prompt = buildSkillSessionPrompt(prompt, skill);
      // 📖 t310: autoApply is decided here, from the resolved skill, never
      // from a client flag: routed permission requests are auto-allowed.
      skillAutoApply = skill.chat?.autoApply === true;
    }
    const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : undefined;
    // 📖 Chat affordances: chat sessions only, after the skill section so the
    // directive markup sits next to the user's first message.
    prompt = `${prompt}\n\n${CHAT_AFFORDANCES_PROMPT}`;
    if (message) prompt = `${prompt}\n\n---\n\n${message}`;
    const permissionMode: PermissionMode = body.permissionMode === 'accept-edits' || body.permissionMode === 'yolo'
      ? body.permissionMode
      : config.agent.permissionMode;
    const projectRoot = getProjectRoot(kandownDir);
    try {
      const session = createAgentSession({
        harnessId: body.harnessId.trim(),
        projectRoot,
        prompt,
        permissionMode,
        ...(skillAutoApply ? { skillAutoApply: true } : {}),
        ...(typeof body.resumeSessionId === 'string' && body.resumeSessionId ? { resumeSessionId: body.resumeSessionId } : {}),
      });
      // 📖 t308 bookkeeping: kandown never stores conversations, only this thin
      // index entry so the sidebar can list, title and resume the session.
      const titleOverride = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : undefined;
      const now = new Date().toISOString();
      const indexEntry: SessionIndexEntry = {
        id: session.id,
        harnessId: session.harnessId,
        title: titleOverride ?? indexEntryForPrompt(message ?? compiled.markdown),
        ...(taskId ? { taskId } : {}),
        createdAt: now,
        updatedAt: now,
      };
      upsertSessionIndexEntry(projectRoot, indexEntry);
      // 📖 t309 live editing: track which task files this session touches and
      // give it a decision hook for routed permission requests. The watcher
      // inside the runtime turns real disk writes into task_diff events while
      // a pair is active.
      const editRuntime = getAgentEditRuntime(kandownDir);
      editRuntime.tracker.attachSession(session.id, session.harnessId);
      setAgentPermissionHandler(session.id, (request) => {
        const stored = permissionQueue.push({
          sessionId: session.id,
          title: request.title,
          kind: request.kind,
          respond: (answer) => {
            // 📖 The reply is the adapter's own JSON-RPC line. A dead stdin
            // makes delivery a harmless false; the queue entry is already out.
            const line = buildPermissionResponse(
              { requestId: request.requestId, options: request.options },
              answer === 'allow',
            );
            deliverRawLine(session.id, line);
          },
        });
        broadcastSseEvent({
          type: 'agent_permission',
          sessionId: session.id,
          permissionId: stored.permissionId,
          title: stored.title,
          kind: stored.kind,
          at: new Date().toISOString(),
        });
      });
      // 📖 Internal watcher: the harness session id arrives with the
      // session_started event; the first stopped event closes the bookkeeping
      // (index, live-edit pairs, pending approvals) and unsubscribes so a
      // finished session costs nothing.
      let unsubscribeIndex: (() => void) | null = null;
      let sawStopped = false;
      unsubscribeIndex = subscribeAgentSession(session.id, (event: AgentEvent) => {
        if (event.type === 'session_started' && event.harnessSessionId) {
          patchSessionIndexEntry(projectRoot, session.id, { harnessSessionId: event.harnessSessionId });
        } else if (event.type === 'stopped' && !sawStopped) {
          sawStopped = true;
          patchSessionIndexEntry(projectRoot, session.id, { updatedAt: new Date().toISOString() });
          editRuntime.tracker.detachSession(session.id);
          permissionQueue.clearSession(session.id);
          setAgentPermissionHandler(session.id, null);
          unsubscribeIndex?.();
        }
      });
      const responseBody: AgentSessionCreatedResponse = { session };
      if (!(await isGitWorkTree(projectRoot))) responseBody.gitWarning = 'not-a-git-repo';
      return writeJson(res, 201, responseBody);
    } catch (error) {
      return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // 📖 Session index for THIS daemon's project only: the project root is
  // computed server-side from kandownDir, never accepted from the client.
  if (path === '/api/agent/sessions-index' && method === 'GET') {
    return writeJson(res, 200, { sessions: listSessionIndexEntries(getProjectRoot(kandownDir)) });
  }

  if (path.startsWith('/api/agent/sessions-index/') && method === 'DELETE') {
    let entryId: string;
    try {
      entryId = decodeURIComponent(path.slice('/api/agent/sessions-index/'.length).split('?')[0] ?? '');
    } catch {
      return writeJson(res, 400, { error: 'Invalid session id' });
    }
    const projectRoot = getProjectRoot(kandownDir);
    const known = listSessionIndexEntries(projectRoot).some(entry => entry.id === entryId);
    if (!known) return writeJson(res, 404, { error: 'Session not found' });
    // 📖 Index-only removal: a live runtime session is never stopped here.
    forgetSessionIndexEntry(projectRoot, entryId);
    return writeJson(res, 200, { ok: true });
  }

  // 📖 Autopilot orchestration API (t311). GET answers the frozen snapshot
  // shape the web UI codes against; start resolves the harness (body
  // override, else the catalog preferred agent, else the first installed)
  // and answers 400 when nothing is installed; stop stops every active
  // session and empties the queue. Snapshots broadcast as `agent_autopilot`
  // on the board SSE channel at every pivot. Fan-out note: the Vite dev
  // plugin mirrors these routes and must keep the same shapes (the demo
  // backend answers 501, as for the other agent routes).
  if (path === '/api/agent/autopilot' && method === 'GET') {
    return writeJson(res, 200, getAutopilotOrchestrator(kandownDir).snapshot());
  }

  if (path === '/api/agent/autopilot/start' && method === 'POST') {
    let body: { harnessId?: unknown } = {};
    try {
      body = JSON.parse(await readRequestBody(req)) as typeof body;
    } catch {
      // 📖 An empty or non-JSON body is allowed: start without an override
      // resolves the harness from the catalog and config.
    }
    const override = typeof body.harnessId === 'string' && body.harnessId.trim() ? body.harnessId.trim() : undefined;
    try {
      return writeJson(res, 200, getAutopilotOrchestrator(kandownDir).start(override));
    } catch (error) {
      return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (path === '/api/agent/autopilot/stop' && method === 'POST') {
    return writeJson(res, 200, getAutopilotOrchestrator(kandownDir).stop());
  }

  // 📖 Live-edit approvals (t309). The UI lists a session's pending permission
  // requests and resolves them; both routes answer 404 for an unknown session
  // so a stale sidebar cannot invent state. Resolve on an already answered or
  // unknown permission id is also a 404, never a second answer to the harness.
  const pendingMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)\/pending$/);
  if (pendingMatch && method === 'GET') {
    const sessionId = decodeURIComponent(pendingMatch[1]);
    if (!getAgentSession(sessionId)) return writeJson(res, 404, { error: 'Session not found' });
    return writeJson(res, 200, { permissions: permissionQueue.listPending(sessionId) });
  }

  const resolveMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)\/permissions\/([^/]+)\/resolve$/);
  if (resolveMatch && method === 'POST') {
    const sessionId = decodeURIComponent(resolveMatch[1]);
    const permissionId = decodeURIComponent(resolveMatch[2]);
    if (!getAgentSession(sessionId)) return writeJson(res, 404, { error: 'Session not found' });
    let body: { approve?: unknown } = {};
    try {
      body = JSON.parse(await readRequestBody(req)) as typeof body;
    } catch {
      // 📖 An unreadable body counts as "not approved"; the harness gets the
      // reject rather than hanging on a malformed request.
    }
    const resolved = permissionQueue.resolve(sessionId, permissionId, body.approve === true);
    return resolved
      ? writeJson(res, 200, { ok: true })
      : writeJson(res, 404, { error: 'Permission not found' });
  }

  const agentSessionMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)(\/events|\/stop|\/send)?$/);
  if (agentSessionMatch) {
    const sessionId = decodeURIComponent(agentSessionMatch[1]);
    const sub = agentSessionMatch[2];
    if (!sub && method === 'GET') {
      const session = listAgentSessions().find(entry => entry.id === sessionId);
      return session ? writeJson(res, 200, { session }) : writeJson(res, 404, { error: 'Session not found' });
    }
    if (sub === '/events' && method === 'GET') {
      // 📖 Per-session SSE. subscribeAgentSession replays the buffered history
      // first, so a subscriber joining mid-turn still renders the full turn.
      const unsubscribe = subscribeAgentSession(sessionId, (event: AgentEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      });
      if (!unsubscribe) return writeJson(res, 404, { error: 'Session not found' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders(localPort(res)),
      });
      res.write('retry: 2000\n\n');
      req.on('close', unsubscribe);
      return;
    }
    if (sub === '/stop' && method === 'POST') {
      const stopped = stopAgentSession(sessionId);
      // 📖 Keep the sidebar ordering honest: a stopped session just became the
      // least interesting thing in the list, and the timestamp says so.
      if (stopped) patchSessionIndexEntry(getProjectRoot(kandownDir), sessionId, { updatedAt: new Date().toISOString() });
      return stopped
        ? writeJson(res, 200, { ok: true })
        : writeJson(res, 404, { error: 'Session not found' });
    }
    if (sub === '/send' && method === 'POST') {
      // 📖 Follow-up chat message: the runtime steers the live turn or resumes
      // the finished one under the same kandown session id.
      let body: { message?: unknown };
      try {
        body = JSON.parse(await readRequestBody(req)) as typeof body;
      } catch (error) {
        return writeJson(res, 400, { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
      }
      if (typeof body.message !== 'string' || !body.message.trim()) {
        return writeJson(res, 400, { error: 'message is required' });
      }
      const result = sendToSession(sessionId, body.message);
      return result.ok
        ? writeJson(res, 200, { ok: true })
        : writeJson(res, 400, { ok: false, error: result.error ?? 'Send failed' });
    }
  }


  // 📖 Extension system API: list, enable/disable, static files (web bundles),
  // and extension field writes. Foundation for the web UI; the CLI uses the
  // host directly. See docs/EXTENSIONS.md.
  if (path === '/api/extensions' && method === 'GET') {
    const host = await getExtensionHost(kandownDir);
    const badges = await host.renderBadges();
    return writeJson(res, 200, { extensions: host.installedSummary(), badges });
  }
  // 📖 Hot reload channel for `kandown plugin dev`. The CLI owns the rebuild and
  // the validation; the daemon only has to forget its cached host and tell every
  // open board to drop its module cache and re-hydrate. Keeping the trigger
  // explicit (rather than watching the extensions directory from here) means a
  // reload never fires on a half-written bundle.
  if (path === '/api/extensions/reload' && method === 'POST') {
    extensionHost = null;
    extensionHostDir = null;
    await getExtensionHost(kandownDir);
    broadcastSseEvent({ type: 'extensions' });
    return writeJson(res, 200, { ok: true });
  }

  if (path.startsWith('/api/extensions/')) {
    const parts = path.slice('/api/extensions/'.length).split('/').filter(Boolean);
    let id: string;
    try {
      id = decodeURIComponent(parts[0] ?? '');
    } catch {
      return writeJson(res, 400, { error: 'Invalid extension id' });
    }
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) return writeJson(res, 400, { error: 'Invalid extension id' });
    const host = await getExtensionHost(kandownDir);
    if (parts.length === 2 && parts[1] === 'enable' && method === 'POST') {
      const ok = await host.enable(id);
      broadcastSseEvent({ type: 'extensions' });
      return writeJson(res, 200, { ok, summary: host.installedSummary() });
    }
    if (parts.length === 2 && parts[1] === 'disable' && method === 'POST') {
      const ok = host.disable(id);
      broadcastSseEvent({ type: 'extensions' });
      return writeJson(res, 200, { ok });
    }
    if (parts.length === 2 && parts[1] === 'health' && method === 'POST') {
      let body: { outcome?: unknown; message?: unknown };
      try {
        body = JSON.parse(await readRequestBody(req)) as { outcome?: unknown; message?: unknown };
      } catch (error) {
        return writeJson(res, 400, { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
      }
      if (body.outcome !== 'success' && body.outcome !== 'failure') {
        return writeJson(res, 400, { error: 'outcome must be success or failure' });
      }
      const ext = body.outcome === 'success'
        ? host.reportSuccess(id)
        : host.reportFailure(id, typeof body.message === 'string' ? body.message : 'web panel failed');
      if (!ext) return writeJson(res, 404, { error: 'Extension not found' });
      if (ext.health === 'quarantined') broadcastSseEvent({ type: 'extensions' });
      return writeJson(res, 200, {
        health: ext.health,
        failures: ext.failures,
        error: ext.error,
      });
    }
    if (parts.length >= 2 && parts[1] === 'files' && method === 'GET') {
      const ext = host.get(id);
      if (!ext) return writeText(res, 404, 'Extension not found');
      const rel = parts.slice(2).join('/');
      if (!/^[a-zA-Z0-9._\/-]+$/.test(rel) || rel.includes('..')) return writeText(res, 400, 'Bad path');
      const file = join(ext.dir, rel);
      if (!existsSync(file)) return writeText(res, 404, 'File not found');
      return writeText(res, 200, readFileSync(file, 'utf8'));
    }
  }

  // 📖 Community store: fetch the index, install one entry or by URL.
  if (path === '/api/extensions/registry' && method === 'GET') {
    const result = await fetchRegistry();
    return writeJson(res, 200, result);
  }

  if (path === '/api/extensions/install' && method === 'POST') {
    try {
      const body = JSON.parse(await readRequestBody(req)) as { entry?: RegistryEntry; url?: string };
      const projectDir = getProjectRoot(kandownDir);
      const result = await installExtension(projectDir, { entry: body.entry, url: body.url });
      // 📖 Reload the host so the new extension is discovered and the installed
      // list refreshes immediately (instead of waiting for the next /api/extensions).
      if (result.ok) await (await getExtensionHost(kandownDir)).loadAll();
      broadcastSseEvent({ type: 'extensions' });
      return writeJson(res, result.ok ? 200 : 400, result);
    } catch (e) {
      return writeJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 📖 Community theme store: list, registry, install, uninstall. Mirror of
  // the extension routes above but with no host (themes are static JSON, no
  // contributions). The reload happens client-side via `registerCustomThemes`
  // after each install/uninstall — the daemon only owns the disk side.
  if (path === '/api/themes' && method === 'GET') {
    const projectDir = getProjectRoot(kandownDir);
    const themes = listInstalledThemes(projectDir);
    return writeJson(res, 200, { themes });
  }
  if (path === '/api/themes/registry' && method === 'GET') {
    const result = await fetchThemeRegistry();
    return writeJson(res, 200, result);
  }
  if (path === '/api/themes/install' && method === 'POST') {
    try {
      const body = JSON.parse(await readRequestBody(req)) as { entry?: ThemeRegistryEntry; url?: string };
      const projectDir = getProjectRoot(kandownDir);
      const result = await installTheme(projectDir, { entry: body.entry, url: body.url });
      broadcastSseEvent({ type: 'themes' });
      return writeJson(res, result.ok ? 200 : 400, result);
    } catch (e) {
      return writeJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (path.startsWith('/api/themes/') && method === 'DELETE') {
    const rawId = decodeURIComponent(path.slice('/api/themes/'.length).split('?')[0] ?? '');
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(rawId)) return writeJson(res, 400, { error: 'Invalid theme id' });
    const { unlinkSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const file = join(getProjectRoot(kandownDir), '.kandown', 'themes', `${rawId}.json`);
    if (!existsSync(file)) return writeJson(res, 404, { error: 'Theme not installed' });
    try {
      unlinkSync(file);
      broadcastSseEvent({ type: 'themes' });
      return writeJson(res, 200, { ok: true, id: rawId });
    } catch (e) {
      return writeJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (path.startsWith('/api/tasks/') && path.endsWith('/field') && method === 'POST') {
    const parts = path.slice('/api/tasks/'.length).split('/').filter(Boolean);
    const taskId = decodeURIComponent(parts[0] ?? '');
    if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) return writeText(res, 400, 'Invalid task id');
    if (!findTaskPath(kandownDir, taskId)) return writeText(res, 404, 'Task not found');
    let body: { extId?: unknown; key?: unknown; value?: unknown };
    try {
      body = JSON.parse(await readRequestBody(req)) as { extId?: unknown; key?: unknown; value?: unknown };
    } catch (error) {
      return writeJson(res, 400, { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
    }
    if (typeof body.extId !== 'string' || typeof body.key !== 'string') {
      return writeJson(res, 400, { error: 'extId and key required' });
    }
    try {
      const host = await getExtensionHost(kandownDir);
      await host.setFieldValue(taskId, body.extId, body.key, body.value);
      const updated = readTask(kandownDir, taskId).frontmatter as Record<string, unknown>;
      broadcastSseEvent({ type: 'task', id: taskId });
      return writeJson(res, 200, {
        ok: true,
        plugins: updated.plugins && typeof updated.plugins === 'object' ? updated.plugins : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.startsWith('permission denied') ? 403
        : message.startsWith('extension is not enabled') ? 409
          : 400;
      return writeJson(res, status, { error: message });
    }
  }

  // 📖 POST /api/tasks/<id>/agent — forward the full task to the agent hook.
  // The web app and the TUI surface a "Send to Agent" action when
  // KANDOWN_AGENT_HOOK_URL is set on the daemon process; this endpoint is the
  // half of that feature that actually ships the task. Strictly opt-in (no
  // env var, no route — the UI hides the button when the daemon reports no
  // hook). The hook's JSON response is passed back to the caller so it can
  // surface the outcome (for example a thread id created by the hook).
  if (path.startsWith('/api/tasks/') && path.endsWith('/agent') && method === 'POST') {
    const taskId = decodeURIComponent(path.slice('/api/tasks/'.length, -'/agent'.length));
    if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) return writeText(res, 400, 'Invalid task id');
    const taskPath = findTaskPath(kandownDir, taskId);
    if (!taskPath) return writeText(res, 404, 'Task not found');
    const hookUrl = process.env.KANDOWN_AGENT_HOOK_URL?.trim();
    if (!hookUrl) {
      return writeJson(res, 400, { ok: false, error: 'No agent hook is configured on this daemon (KANDOWN_AGENT_HOOK_URL is not set).' });
    }
    const content = readFileSync(taskPath, 'utf8');
    const parsed = parseTaskFile(content);
    const fm = parsed.frontmatter as { title?: unknown; status?: unknown; priority?: unknown; assignee?: unknown };
    const payload = {
      id: taskId,
      title: typeof fm.title === 'string' ? fm.title : taskId,
      status: typeof fm.status === 'string' ? fm.status : null,
      priority: typeof fm.priority === 'string' ? fm.priority : null,
      assignee: typeof fm.assignee === 'string' ? fm.assignee : null,
      content,
      kandownDir,
    };
    try {
      const hookResponse = await fetch(hookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      const raw = await hookResponse.text();
      let forwarded: unknown = null;
      try { forwarded = raw === '' ? null : JSON.parse(raw); } catch { forwarded = raw; }
      if (!hookResponse.ok) {
        const message = forwarded !== null && typeof forwarded === 'object' && 'error' in forwarded
          ? String((forwarded as { error: unknown }).error)
          : raw.slice(0, 500);
        return writeJson(res, 502, { ok: false, error: message || `Agent hook responded ${hookResponse.status}` });
      }
      return writeJson(res, 200, typeof forwarded === 'object' && forwarded !== null
        ? { ok: true, ...(forwarded as Record<string, unknown>) }
        : { ok: true, forwarded: raw });
    } catch (error) {
      return writeJson(res, 502, { ok: false, error: `Agent hook unreachable: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  if (path.startsWith('/api/tasks/')) {
    const routeParts = path.slice('/api/tasks/'.length).split('/').filter(Boolean);
    let taskId: string;
    try {
      taskId = decodeURIComponent(routeParts[0] ?? '');
    } catch {
      return writeText(res, 400, 'Invalid task id');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) return writeText(res, 400, 'Invalid task id');

    const tasksDir = getTasksDir(kandownDir);
    const archiveDir = join(tasksDir, 'archive');
    // 📖 A task file may be named `t232.md` or `t232_remove_dead_code.md`, so the
    // route resolves the real filename in each directory instead of assuming it.
    // `null` means "no file here yet", which the create paths below handle.
    const resolveIn = (directory: string): string | null => {
      const match = resolveTaskFilename(taskId, listTaskFilenames(directory));
      return match ? join(directory, match.filename) : null;
    };
    const activePath = resolveIn(tasksDir);
    const archivedPath = resolveIn(archiveDir);
    const action = routeParts[1];

    if (method === 'POST' && action === 'move') {
      if (routeParts.length !== 2) return writeText(res, 400, 'Invalid task route');
      let input: { to?: unknown; toIndex?: unknown };
      try {
        input = JSON.parse(await readRequestBody(req)) as { to?: unknown; toIndex?: unknown };
      } catch (error) {
        return writeJson(res, 400, {
          ok: false,
          kind: 'invalid-target',
          reason: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        } satisfies MoveTaskResult);
      }
      if (typeof input.to !== 'string' || !input.to.trim()) {
        return writeJson(res, 400, {
          ok: false,
          kind: 'invalid-target',
          reason: 'Move target is required',
        } satisfies MoveTaskResult);
      }
      if (input.toIndex !== undefined && (typeof input.toIndex !== 'number' || !Number.isFinite(input.toIndex))) {
        return writeJson(res, 400, {
          ok: false,
          kind: 'invalid-target',
          reason: 'Move target index must be a finite number',
        } satisfies MoveTaskResult);
      }

      try {
        const host = await getExtensionHost(kandownDir);
        const result = await moveTaskWithGates(
          host,
          kandownDir,
          taskId,
          input.to.trim(),
          input.toIndex,
        );
        const status = result.ok
          ? 200
          : result.kind === 'not-found'
            ? 404
            : result.kind === 'invalid-target'
              ? 400
              : result.kind === 'write'
                ? 500
                : 409;
        if (result.ok) broadcastSseEvent({ type: 'task', id: taskId });
        return writeJson(res, status, result);
      } catch (error) {
        return writeJson(res, 500, {
          ok: false,
          kind: 'write',
          reason: `Move failed: ${error instanceof Error ? error.message : String(error)}`,
        } satisfies MoveTaskResult);
      }
    }

    // 📖 Archive and restore are explicit sub-resources. The client sends the
    // complete serialized task so metadata and body survive the directory move.
    if (method === 'POST' && (action === 'archive' || action === 'unarchive')) {
      if (routeParts.length !== 2) return writeText(res, 400, 'Invalid task route');
      const archiving = action === 'archive';
      const source = archiving ? activePath : archivedPath;
      const existingDestination = archiving ? archivedPath : activePath;
      if (!source && !existingDestination) {
        return writeText(res, 404, 'Task not found');
      }
      // 📖 The file keeps its name across the move: archiving `t232_remove_dead_code.md`
      // must not rebuild it as a bare `t232.md` in archive/.
      const destinationDir = archiving ? archiveDir : tasksDir;
      const destination = existingDestination
        ?? join(destinationDir, basename(source!));
      try {
        if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
        if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
        const body = await readRequestBody(req);
        atomicWriteFileSync(destination, body);
        if (source && source !== destination && existsSync(source)) unlinkSync(source);
        broadcastSseEvent({ type: 'task', id: taskId });
        return writeJson(res, 200, { ok: true });
      } catch (error) {
        return writeJson(res, 500, {
          error: `Failed to ${action} task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    if (routeParts.length !== 1) return writeText(res, 404, 'Route not found');

    if (method === 'GET') {
      const taskPath = findTaskPath(kandownDir, taskId);
      if (!taskPath) return writeText(res, 404, 'Task not found');
      return writeText(res, 200, readFileSync(taskPath, 'utf8'));
    }

    if (method === 'PUT') {
      try {
        if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
        const body = await readRequestBody(req);
        // 📖 One write path: writes in place, renames on bracket change (the
        // only auto-sync the user asked for). `useGit: false` because the web
        // app does not know whether the project is a git worktree, and a half-
        // renamed worktree is worse than a delete-plus-add commit.
        const { path: taskPath } = writeTaskContent(kandownDir, taskId, body, { useGit: false });
        broadcastSseEvent({ type: 'task', id: taskId });
        return writeJson(res, 200, { ok: true });
      } catch (error) {
        return writeJson(res, 500, {
          error: `Failed to write task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    if (method === 'DELETE') {
      try {
        // 📖 Remove both locations defensively if a previous interrupted move
        // left duplicate copies behind.
        if (activePath && existsSync(activePath)) unlinkSync(activePath);
        if (archivedPath && existsSync(archivedPath)) unlinkSync(archivedPath);
        broadcastSseEvent({ type: 'task_delete', id: taskId });
        return writeJson(res, 200, { ok: true });
      } catch (error) {
        return writeJson(res, 500, {
          error: `Failed to delete task: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }

  writeJson(res, 404, { error: 'Route not found' });
}

/**
 * 📖 The single-file Vite bundle can contain literal strings such as
 * `</head>` from HTML parser libraries. Use the last closing head tag so the
 * CLI does not inject server-mode globals into bundled JavaScript text.
 */
function injectServerRoot(html: string, kandownDir: string): string {
  const marker = '</head>';
  const markerIndex = html.toLowerCase().lastIndexOf(marker);
  const safeRoot = JSON.stringify(kandownDir).replace(/</g, '\\u003c');
  // 📖 Only inject the token literal when one is configured. Dev mode and the
  // Vite plugin both leave `activeToken` null, in which case the client reads
  // `undefined` and skips the header, mirroring the pre-M5 behaviour without
  // ever letting a real token leak through a development build.
  const tokenLiteral = activeToken === null ? 'null' : JSON.stringify(activeToken).replace(/</g, '\\u003c');
  const script = `<script>window.__KANDOWN_ROOT__ = ${safeRoot};\nwindow.__KANDOWN_TOKEN__ = ${tokenLiteral};</script>\n`;

  if (markerIndex === -1) return script + html;
  return html.slice(0, markerIndex) + script + html.slice(markerIndex);
}

function serveApp(res: ServerResponse, kandownDir: string): void {
  syncProjectKandownHtml(kandownDir);
  const htmlPath = join(kandownDir, 'kandown.html');
  if (existsSync(htmlPath)) {
    const html = readFileSync(htmlPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(injectServerRoot(html, kandownDir));
  } else {
    writeText(res, 404, 'kandown.html not found');
  }
}

export function createServeServer(kandownDir: string) {
  syncProjectKandownHtml(kandownDir);

  return createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (req.method === 'OPTIONS') return handleCors(res);
    if (url.pathname === '/' || url.pathname === '/kandown.html' || !url.pathname.startsWith('/api/')) {
      return serveApp(res, kandownDir);
    }
    if (url.pathname.startsWith('/api/')) {
      return handleApi(req, res, url, kandownDir);
    }
    writeText(res, 404, 'Not found');
  });
}

export function listen(server: any, port: number): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (e: any) => {
      server.off('listening', onListening);
      rejectListen(e);
    };
    const onListening = () => {
      server.off('error', onError);
      resolveListen();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

export async function listenOnAvailablePort(kandownDir: string, preferredPort?: number | null): Promise<{ server: any; port: number }> {
  const startPort = preferredPort ?? START_PORT_RANGE;
  for (let p = startPort; p <= END_PORT_RANGE; p++) {
    if (UNSAFE_PORTS.has(p)) continue;
    const server = createServeServer(kandownDir);
    try {
      await listen(server, p);
      return { server, port: p };
    } catch (e: any) {
      if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') throw e;
    }
  }
  throw new Error(`No free port in range ${START_PORT_RANGE}-${END_PORT_RANGE}`);
}
