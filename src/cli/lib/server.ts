/**
 * @file Kandown Daemon HTTP Server & API Router
 * @description Provides the REST API, SSE live reload, auto-html bundling refresh,
 * and remote auto-updater routes (/api/update/check & /api/update/apply) for the
 * Web application.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readFileSync, copyFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { getTasksDir, findTaskPath, readBoard, readTask, moveTaskToColumn, listTaskIds } from './board-reader';
import { loadConfig, saveConfig } from './config';
import { getCurrentVersion, semverGt, performGlobalPackageUpdate, PKG_ROOT } from './updater';
import { atomicWriteFileSync } from './atomic-write';

const START_PORT_RANGE = 2050;
const END_PORT_RANGE = 2099;
const UNSAFE_PORTS = new Set([2049, 4045, 6000, 6665, 6666, 6667, 6668, 6669, 6697]);

interface SseClient {
  id: number;
  res: ServerResponse;
}
let sseClients: SseClient[] = [];
let nextClientId = 1;

export function broadcastSseEvent(data: Record<string, unknown>): void {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(c => c.res.write(payload));
}

function handleCors(res: ServerResponse): void {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Kandown-Token',
  });
  res.end();
}

function writeJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function writeText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
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

    const updateAvailable = latest ? semverGt(latest, current) > 0 : false;
    return writeJson(res, 200, {
      current,
      latest: latest || current,
      updateAvailable,
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
      'Access-Control-Allow-Origin': '*',
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
          broadcastSseEvent({ type: 'config' });
          writeJson(res, 200, { ok: true });
        } catch (e: any) {
          writeJson(res, 400, { error: e.message });
        }
      });
      return;
    }
  }

  if (path === '/api/tasks' && method === 'GET') {
    return writeJson(res, 200, listTaskIds(kandownDir));
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
    const activePath = join(tasksDir, `${taskId}.md`);
    const archivedPath = join(archiveDir, `${taskId}.md`);
    const action = routeParts[1];

    // 📖 Archive and restore are explicit sub-resources. The client sends the
    // complete serialized task so metadata and body survive the directory move.
    if (method === 'POST' && (action === 'archive' || action === 'unarchive')) {
      if (routeParts.length !== 2) return writeText(res, 400, 'Invalid task route');
      const archiving = action === 'archive';
      const source = archiving ? activePath : archivedPath;
      const destination = archiving ? archivedPath : activePath;
      if (!existsSync(source) && !existsSync(destination)) {
        return writeText(res, 404, 'Task not found');
      }
      try {
        if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
        if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
        const body = await readRequestBody(req);
        atomicWriteFileSync(destination, body);
        if (source !== destination && existsSync(source)) unlinkSync(source);
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
        // 📖 Preserve an archived task's location when autosave writes it.
        const taskPath = findTaskPath(kandownDir, taskId) ?? activePath;
        const body = await readRequestBody(req);
        atomicWriteFileSync(taskPath, body);
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
        if (existsSync(activePath)) unlinkSync(activePath);
        if (existsSync(archivedPath)) unlinkSync(archivedPath);
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
  const script = `<script>window.__KANDOWN_ROOT__ = ${safeRoot};</script>\n`;

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
