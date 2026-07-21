/**
 * @file Kandown Daemon HTTP Server & API Router
 * @description Provides the REST API, SSE live reload, auto-html bundling refresh,
 * and remote auto-updater routes (/api/update/check & /api/update/apply) for the
 * Web application.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, statSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { getProjectRoot, getTasksDir, readBoard, readTask, moveTaskToColumn, listTaskIds } from './board-reader';
import { loadConfig, saveConfig } from './config';
import { getCurrentVersion, semverGt, performGlobalPackageUpdate } from './updater';
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

/**
 * 📖 Ensures the project's kandown.html is synced with the installed CLI bundle.
 */
export function syncProjectKandownHtml(kandownDir: string): boolean {
  try {
    const projectHtml = join(kandownDir, 'kandown.html');
    const cliRoot = resolve(import.meta.url ? new URL('../..', import.meta.url).pathname : process.cwd());
    const distHtml = join(cliRoot, 'dist', 'index.html');

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
 * 📖 Overwrites all global binary symlinks on the user's system to point to the latest CLI.
 */
export function syncGlobalSymlinks(): void {
  try {
    const home = homedir();
    const candidatePaths = [
      join(home, '.local', 'bin', 'kandown'),
      join(home, 'Library', 'pnpm', 'bin', 'kandown'),
      join(home, '.nvm', 'versions', 'node', 'v25.2.1', 'bin', 'kandown'),
    ];

    const currentBin = resolve(import.meta.url ? new URL('../../bin/kandown.js', import.meta.url).pathname : process.cwd());
    for (const targetPath of candidatePaths) {
      if (existsSync(dirname(targetPath))) {
        try {
          if (existsSync(targetPath)) unlinkSync(targetPath);
          execSync(`ln -sf "${currentBin}" "${targetPath}" 2>/dev/null || true`);
        } catch { /* ignore individual link failures */ }
      }
    }
  } catch { /* ignore */ }
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
    syncGlobalSymlinks();
    syncProjectKandownHtml(kandownDir);

    if (ok) {
      writeJson(res, 200, { ok: true, version: targetVersion, message: 'Update installed successfully' });
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
    const taskId = decodeURIComponent(path.slice('/api/tasks/'.length));
    const tasksDir = getTasksDir(kandownDir);
    const taskPath = join(tasksDir, `${taskId}.md`);

    if (method === 'GET') {
      if (!existsSync(taskPath)) return writeText(res, 404, 'Task not found');
      return writeText(res, 200, readFileSync(taskPath, 'utf8'));
    }

    if (method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
        atomicWriteFileSync(taskPath, body);
        broadcastSseEvent({ type: 'task', id: taskId });
        writeJson(res, 200, { ok: true });
      });
      return;
    }

    if (method === 'DELETE') {
      if (existsSync(taskPath)) unlinkSync(taskPath);
      broadcastSseEvent({ type: 'task_delete', id: taskId });
      return writeJson(res, 200, { ok: true });
    }
  }

  writeJson(res, 404, { error: 'Route not found' });
}

function serveApp(res: ServerResponse, kandownDir: string): void {
  syncProjectKandownHtml(kandownDir);
  const htmlPath = join(kandownDir, 'kandown.html');
  if (existsSync(htmlPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(readFileSync(htmlPath, 'utf8'));
  } else {
    writeText(res, 404, 'kandown.html not found');
  }
}

export function createServeServer(kandownDir: string) {
  syncProjectKandownHtml(kandownDir);
  syncGlobalSymlinks();

  return createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (req.method === 'OPTIONS') return handleCors(res);
    if (url.pathname === '/' || url.pathname === '/kandown.html') {
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
