import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import type { ExtensionHost } from './src/lib/extensions/host';

const CLOSING_HEAD_TAG = '</head>';
// 📖 Keep the local web UI dev server predictable so agents and humans can share the same URL.
const DEFAULT_DEV_SERVER_PORT = 5176;

/**
 * 📖 Demo build (`vite build --mode demo`, i.e. `pnpm build:demo`).
 *
 * Produces the bundle the website embeds at `/demo`: the real app, backed by an
 * in-memory implementation of the Kandown REST API instead of a disk. Three
 * things differ from the normal build.
 *
 * 1. `__KANDOWN_DEMO_BUILD__` is `true`, which is the only reason
 *    `src/lib/demoBackend.ts` and its seed dataset enter the module graph. In
 *    the CLI build the constant is the literal `false`, so Rollup drops the
 *    branch in `main.tsx` and neither module is bundled — `npx kandown` users
 *    never download the demo.
 * 2. `viteSingleFile` is off. Inlining everything into one HTML file exists so
 *    the CLI can serve a single asset off disk; on the website we control
 *    hosting, and a normal chunked, hash-named build loads far faster than a
 *    6 MB inline document.
 * 3. Output goes to `dist-demo/` under the `/demo/app/` base path, which is
 *    where the website copies it from.
 */
const DEMO_BASE = '/demo/app/';
const DEMO_PROJECT_ROOT = '/Kandown Demo/.kandown';

/**
 * 📖 Sets the two globals the app reads at startup. `__KANDOWN_DEMO__` switches
 * on the memory backend; `__KANDOWN_ROOT__` is a path that resolves to nothing
 * but makes `isServerMode()` true, so the store boots through its existing
 * server-mode path rather than through a third set of demo-only branches.
 * @see src/lib/demoBackend.ts
 */
function kandownDemoFlagPlugin() {
  return {
    name: 'kandown-demo-flag',
    transformIndexHtml(html: string) {
      return injectBeforeClosingHead(
        html,
        `<script>window.__KANDOWN_DEMO__ = true; window.__KANDOWN_ROOT__ = ${JSON.stringify(DEMO_PROJECT_ROOT)};</script>\n`,
      );
    },
  };
}

function injectBeforeClosingHead(html: string, content: string): string {
  const markerIndex = html.toLowerCase().lastIndexOf(CLOSING_HEAD_TAG);
  if (markerIndex === -1) return content + html;

  return html.slice(0, markerIndex) + content + html.slice(markerIndex);
}

function repairSingleFileHtml(html: string): string {
  // 📖 esbuild can HTML-escape `<` inside regex literals embedded by Shiki
  // grammars. In a lookbehind opener, `(?\x3C` is invalid JavaScript while
  // `(?<` is the intended syntax. Repair after vite-plugin-singlefile inlines
  // the generated bundle into HTML.
  return html.replace(/\(\?\\x3C/g, '(?<');
}

function kandownSingleFileRepairPlugin() {
  return {
    name: 'kandown-single-file-repair',
    enforce: 'post' as const,
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'asset' || !output.fileName.endsWith('.html')) continue;
        if (typeof output.source !== 'string') continue;
        output.source = repairSingleFileHtml(output.source);
      }
    },
  };
}

function kandownDevPlugin() {
  let extensionHost: ExtensionHost | null = null;

  return {
    name: 'kandown-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (process.env.NODE_ENV === 'production') return next();
        // 📖 Dev mode is intentionally exempt from the per-daemon auth token
        // enforced by `src/cli/lib/server.ts` in CLI builds. Keeping dev
        // frictionless saves a token round-trip on every edit, and the vite
        // dev server only ever runs on `localhost` against the developer's own
        // tree. Production behaviour is what ships; the served HTML still
        // exposes `window.__KANDOWN_TOKEN__` (as `null` here) so the client
        // takes the same code path.
        const kandownPath = resolve(process.cwd(), '.kandown');
        const tasksRoot = resolve(process.cwd(), 'tasks');
        if (!existsSync(kandownPath)) return next();

        if (!req.url?.startsWith('/api/')) return next();

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const pathname = req.url.replace('/api/', '');
        const parts = pathname.split('/');
        const resource = parts[0];
        const id = parts[1];

        // 📖 Detected agent catalog for the web UI in DEV mode. The Vite dev
        // server is Node, so it can run `which` — detection is impossible in a
        // pure browser, but here we ARE the backend. Loaded through Vite's
        // SSR module loader so the shared CLI detection logic (and the project
        // .kandown/agents.json overrides) is reused without duplication.
        if (resource === 'agents' && req.method === 'GET') {
          try {
            const mod = await server.ssrLoadModule('/src/cli/lib/agents.ts');
            const payload = mod.detectCatalogJSON(kandownPath);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(payload));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Failed to detect agents: ${e.message}` }));
          }
          return;
        }

        // 📖 Agent harness API (t307) in DEV mode. The Vite dev server is Node,
        // so it can spawn harness processes exactly like the daemon does; the
        // routes mirror src/cli/lib/server.ts and demoBackend.ts answers 501
        // so the three adapters stay one protocol.
        if (resource === 'agent') {
          try {
            if (parts[1] === 'harnesses' && req.method === 'GET') {
              const detectModule = await server.ssrLoadModule('/src/cli/lib/agent/detect.ts') as typeof import('./src/cli/lib/agent/detect');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(detectModule.detectHarnessesJSON()));
              return;
            }

            if (parts[1] === 'sessions') {
              const runtimeModule = await server.ssrLoadModule('/src/cli/lib/agent/agent-runtime.ts') as typeof import('./src/cli/lib/agent/agent-runtime');

              if (!id && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ sessions: runtimeModule.listAgentSessions() }));
                return;
              }

              if (!id && req.method === 'POST') {
                const chunks: Buffer[] = [];
                await new Promise<void>((resolveBody, rejectBody) => {
                  req.on('data', chunk => chunks.push(chunk));
                  req.on('end', resolveBody);
                  req.on('error', rejectBody);
                });
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
                  harnessId?: unknown; taskId?: unknown; message?: unknown; permissionMode?: unknown;
                };
                if (typeof body.harnessId !== 'string' || !body.harnessId.trim()) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'harnessId is required' }));
                  return;
                }
                const workModule = await server.ssrLoadModule('/src/cli/lib/kandown-work.ts') as typeof import('./src/cli/lib/kandown-work');
                const configModule = await server.ssrLoadModule('/src/cli/lib/config.ts') as typeof import('./src/cli/lib/config');
                const boardModule = await server.ssrLoadModule('/src/cli/lib/board-reader.ts') as typeof import('./src/cli/lib/board-reader');
                const taskId = typeof body.taskId === 'string' && body.taskId.trim() ? body.taskId.trim() : undefined;
                let compiled;
                try {
                  compiled = workModule.compileProjectKandownWork(kandownPath, taskId);
                } catch {
                  res.writeHead(404, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: `Task not found: ${taskId}` }));
                  return;
                }
                const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : undefined;
                const prompt = message ? `${compiled.markdown}\n\n---\n\n${message}` : compiled.markdown;
                const config = configModule.loadConfig(kandownPath);
                const permissionMode = body.permissionMode === 'accept-edits' || body.permissionMode === 'yolo'
                  ? body.permissionMode
                  : config.agent.permissionMode;
                try {
                  const session = runtimeModule.createAgentSession({
                    harnessId: body.harnessId.trim(),
                    projectRoot: boardModule.getProjectRoot(kandownPath),
                    prompt,
                    permissionMode,
                  });
                  res.writeHead(201, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ session }));
                } catch (error) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
                }
                return;
              }

              if (id && parts[2] === 'events' && req.method === 'GET') {
                const sessionId = decodeURIComponent(id);
                const unsubscribe = runtimeModule.subscribeAgentSession(sessionId, event => {
                  res.write(`data: ${JSON.stringify(event)}\n\n`);
                });
                if (!unsubscribe) {
                  res.writeHead(404, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Session not found' }));
                  return;
                }
                res.writeHead(200, {
                  'Content-Type': 'text/event-stream',
                  'Cache-Control': 'no-cache',
                  'Connection': 'keep-alive',
                });
                res.write('retry: 2000\n\n');
                req.on('close', unsubscribe);
                return;
              }

              if (id && parts[2] === 'stop' && req.method === 'POST') {
                const ok = runtimeModule.stopAgentSession(decodeURIComponent(id));
                res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(ok ? { ok: true } : { error: 'Session not found' }));
                return;
              }

              if (id && !parts[2] && req.method === 'GET') {
                const session = runtimeModule.listAgentSessions().find(entry => entry.id === decodeURIComponent(id));
                res.writeHead(session ? 200 : 404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(session ? { session } : { error: 'Session not found' }));
                return;
              }
            }
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            return;
          }
        }

        if (resource === 'extensions') {
          try {
            const extensionModule = await server.ssrLoadModule('/src/cli/lib/extensions-cli.ts') as typeof import('./src/cli/lib/extensions-cli');
            if (!extensionHost) extensionHost = await extensionModule.loadExtensionHost(kandownPath);

            if (req.method === 'GET' && !id) {
              const badges = await extensionHost.renderBadges();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ extensions: extensionHost.installedSummary(), badges }));
              return;
            }

            const action = parts[2];
            if (req.method === 'POST' && id && (action === 'enable' || action === 'disable')) {
              const ok = action === 'enable'
                ? await extensionHost.enable(decodeURIComponent(id))
                : extensionHost.disable(decodeURIComponent(id));
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok, summary: extensionHost.installedSummary() }));
              return;
            }

            if (req.method === 'POST' && id && action === 'health') {
              const chunks: Buffer[] = [];
              await new Promise<void>((resolveBody, rejectBody) => {
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', resolveBody);
                req.on('error', rejectBody);
              });
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { outcome?: unknown; message?: unknown };
              if (body.outcome !== 'success' && body.outcome !== 'failure') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'outcome must be success or failure' }));
                return;
              }
              const extension = body.outcome === 'success'
                ? extensionHost.reportSuccess(decodeURIComponent(id))
                : extensionHost.reportFailure(decodeURIComponent(id), typeof body.message === 'string' ? body.message : 'web panel failed');
              if (!extension) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Extension not found' }));
                return;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ health: extension.health, failures: extension.failures, error: extension.error }));
              return;
            }

            if (req.method === 'GET' && id && action === 'files') {
              const extension = extensionHost.get(decodeURIComponent(id));
              const relativePath = parts.slice(3).map(decodeURIComponent).join('/');
              if (!extension || !relativePath || relativePath.includes('..') || !/^[a-zA-Z0-9._\/-]+$/.test(relativePath)) {
                res.writeHead(extension ? 400 : 404, { 'Content-Type': 'text/plain' });
                res.end(extension ? 'Bad path' : 'Extension not found');
                return;
              }
              const file = join(extension.dir, relativePath);
              if (!existsSync(file)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File not found');
                return;
              }
              res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end(readFileSync(file, 'utf8'));
              return;
            }
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            return;
          }
        }

        if (resource === 'config') {
          if (req.method === 'GET') {
            const configPath = join(kandownPath, 'kandown.json');
            if (!existsSync(configPath)) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'kandown.json not found' }));
              return;
            }
            try {
              const content = readFileSync(configPath, 'utf8');
              JSON.parse(content);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(content);
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Failed to read config: ${e.message}` }));
            }
            return;
          }
          if (req.method === 'PUT') {
            const configPath = join(kandownPath, 'kandown.json');
            try {
              const chunks: Buffer[] = [];
              await new Promise<void>((resolve, reject) => {
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', resolve);
                req.on('error', reject);
              });
              const body = Buffer.concat(chunks).toString('utf8');
              JSON.parse(body);
              const { writeFileSync } = await import('node:fs');
              writeFileSync(configPath, body, 'utf8');
              extensionHost = null;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Invalid JSON: ${e.message}` }));
            }
            return;
          }
        }

        if (resource === 'tasks') {
          if (req.method === 'GET' && !id) {
            const tasksDir = resolve(process.cwd(), 'tasks');
            const archiveDir = join(tasksDir, 'archive');
            try {
              const { readdirSync } = await import('node:fs');
              const ids = new Set<string>();
              if (existsSync(tasksDir)) {
                for (const f of readdirSync(tasksDir).filter(f => f.endsWith('.md'))) {
                  ids.add(f.replace(/\.md$/, ''));
                }
              }
              // 📖 Also surface archived tasks (tasks/archive/*.md).
              if (existsSync(archiveDir)) {
                for (const f of readdirSync(archiveDir).filter(f => f.endsWith('.md'))) {
                  ids.add(f.replace(/\.md$/, ''));
                }
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify([...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))));
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Failed to list tasks: ${e.message}` }));
            }
            return;
          }
          if (req.method === 'POST' && id && parts[2] === 'field') {
            try {
              const chunks: Buffer[] = [];
              await new Promise<void>((resolveBody, rejectBody) => {
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', resolveBody);
                req.on('error', rejectBody);
              });
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { extId?: unknown; key?: unknown; value?: unknown };
              if (typeof body.extId !== 'string' || typeof body.key !== 'string') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'extId and key required' }));
                return;
              }
              const extensionModule = await server.ssrLoadModule('/src/cli/lib/extensions-cli.ts') as typeof import('./src/cli/lib/extensions-cli');
              const boardModule = await server.ssrLoadModule('/src/cli/lib/board-reader.ts') as typeof import('./src/cli/lib/board-reader');
              if (!extensionHost) extensionHost = await extensionModule.loadExtensionHost(kandownPath);
              await extensionHost.setFieldValue(decodeURIComponent(id), body.extId, body.key, body.value);
              const updated = boardModule.readTask(kandownPath, decodeURIComponent(id)).frontmatter as Record<string, unknown>;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, plugins: updated.plugins }));
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              const status = message.includes('not found') ? 404 : message.startsWith('permission denied') ? 403 : 400;
              res.writeHead(status, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: message }));
            }
            return;
          }

          if (req.method === 'POST' && id && parts[2] === 'move') {
            try {
              const chunks: Buffer[] = [];
              await new Promise<void>((resolveBody, rejectBody) => {
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', resolveBody);
                req.on('error', rejectBody);
              });
              const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { to?: unknown; toIndex?: unknown };
              if (typeof input.to !== 'string' || !input.to.trim()) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, kind: 'invalid-target', reason: 'Move target is required' }));
                return;
              }
              if (input.toIndex !== undefined && (typeof input.toIndex !== 'number' || !Number.isFinite(input.toIndex))) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, kind: 'invalid-target', reason: 'Move target index must be a finite number' }));
                return;
              }

              const extensionModule = await server.ssrLoadModule('/src/cli/lib/extensions-cli.ts') as typeof import('./src/cli/lib/extensions-cli');
              const moveModule = await server.ssrLoadModule('/src/cli/lib/task-move.ts') as typeof import('./src/cli/lib/task-move');
              if (!extensionHost) extensionHost = await extensionModule.loadExtensionHost(kandownPath);
              const result = await moveModule.moveTaskWithGates(
                extensionHost,
                kandownPath,
                decodeURIComponent(id),
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
              res.writeHead(status, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (error) {
              const badRequest = error instanceof SyntaxError || error instanceof URIError;
              res.writeHead(badRequest ? 400 : 500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: false,
                kind: badRequest ? 'invalid-target' : 'write',
                reason: error instanceof Error ? error.message : String(error),
              }));
            }
            return;
          }
          if (req.method === 'GET' && id) {
            // 📖 Search active dir then archive/ so archived tasks stay readable.
            const inTasks = join(tasksRoot, `${id}.md`);
            const inArchive = join(tasksRoot, 'archive', `${id}.md`);
            const taskPath = existsSync(inTasks) ? inTasks : existsSync(inArchive) ? inArchive : null;
            if (!taskPath) {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end('Task not found');
              return;
            }
            try {
              const content = readFileSync(taskPath, 'utf8');
              res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end(content);
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end(`Failed to read task: ${e.message}`);
            }
            return;
          }
          if (req.method === 'PUT' && id) {
            const tasksDir = tasksRoot;
            const archiveDir = join(tasksDir, 'archive');
            if (!existsSync(tasksDir)) {
              try {
                const { mkdirSync } = await import('node:fs');
                mkdirSync(tasksDir, { recursive: true });
              } catch { /* ignore */ }
            }
            try {
              const { writeFileSync } = await import('node:fs');
              const chunks: Buffer[] = [];
              await new Promise<void>((resolve, reject) => {
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', resolve);
                req.on('error', reject);
              });
              const body = Buffer.concat(chunks).toString('utf8');
              // 📖 Write in place: an archived task stays inside archive/.
              const inArchive = existsSync(join(archiveDir, `${id}.md`));
              const targetDir = inArchive ? archiveDir : tasksDir;
              writeFileSync(join(targetDir, `${id}.md`), body, 'utf8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Failed to write task: ${e.message}` }));
            }
            return;
          }
          if (req.method === 'DELETE' && id) {
            const inTasks = join(tasksRoot, `${id}.md`);
            const inArchive = join(tasksRoot, 'archive', `${id}.md`);
            try {
              const { unlinkSync } = await import('node:fs');
              if (existsSync(inTasks)) unlinkSync(inTasks);
              if (existsSync(inArchive)) unlinkSync(inArchive);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Failed to delete task: ${e.message}` }));
            }
            return;
          }
          // 📖 Archive/unarchive: the body already carries the toggled frontmatter.
          // parts[2] is the sub-resource ('archive' or 'unarchive'). Write the file
          // to the destination dir then unlink the source so the move is atomic.
          if (req.method === 'POST' && id && (parts[2] === 'archive' || parts[2] === 'unarchive')) {
            const archiving = parts[2] === 'archive';
            const tasksDir = tasksRoot;
            const archiveDir = join(tasksDir, 'archive');
            const src = join(archiving ? tasksDir : archiveDir, `${id}.md`);
            const dst = join(archiving ? archiveDir : tasksDir, `${id}.md`);
            try {
              const { writeFileSync, mkdirSync, unlinkSync } = await import('node:fs');
              if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
              if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
              const chunks: Buffer[] = [];
              await new Promise<void>((resolve, reject) => {
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', resolve);
                req.on('error', reject);
              });
              const body = Buffer.concat(chunks).toString('utf8');
              writeFileSync(dst, body, 'utf8');
              if (existsSync(src)) unlinkSync(src);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Failed to ${parts[2]} task: ${e.message}` }));
            }
            return;
          }
        }

        if (resource === 'board') {
          if (req.method === 'GET') {
            const boardPath = join(kandownPath, 'board.md');
            if (!existsSync(boardPath)) {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end('board.md not found');
              return;
            }
            try {
              const content = readFileSync(boardPath, 'utf8');
              res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end(content);
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end(`Failed to read board: ${e.message}`);
            }
            return;
          }
          if (req.method === 'PUT') {
            const boardPath = join(kandownPath, 'board.md');
            try {
              const { writeFileSync } = await import('node:fs');
              const chunks: Buffer[] = [];
              await new Promise<void>((resolve, reject) => {
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', resolve);
                req.on('error', reject);
              });
              const body = Buffer.concat(chunks).toString('utf8');
              writeFileSync(boardPath, body, 'utf8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Failed to write board: ${e.message}` }));
            }
            return;
          }
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });
    },
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === 'production') return html;
      const kandownPath = resolve(process.cwd(), '.kandown');
      if (!existsSync(kandownPath)) return html;
      return {
        html: injectBeforeClosingHead(
          html,
          `<script>window.__KANDOWN_ROOT__ = ${JSON.stringify(kandownPath)};</script>\n`,
        ),
        tags: [],
      };
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDemo = mode === 'demo';

  return {
    base: isDemo ? DEMO_BASE : '/',
    // 📖 The demo replaces the single-file pipeline with the flag injector; the
    // repair plugin only exists to fix HTML-escaped regex literals produced by
    // inlining, so it goes away with it.
    plugins: isDemo
      ? [react(), kandownDemoFlagPlugin()]
      : [kandownDevPlugin(), react(), viteSingleFile(), kandownSingleFileRepairPlugin()],
    // 📖 Compile-time switch, not a runtime check: Rollup folds the `false`
    // literal and eliminates the demo backend from the CLI bundle entirely.
    define: {
      __KANDOWN_DEMO_BUILD__: JSON.stringify(isDemo),
    },
    server: {
      port: DEFAULT_DEV_SERVER_PORT,
    },
    build: isDemo
      ? {
          target: 'esnext',
          outDir: 'dist-demo',
          emptyOutDir: true,
          // 📖 Real code splitting here, unlike the CLI build: the demo is
          // served over HTTP by a CDN that can stream chunks in parallel.
          chunkSizeWarningLimit: 2_000,
        }
      : {
          target: 'esnext',
          assetsInlineLimit: 100_000_000,
          chunkSizeWarningLimit: 100_000_000,
          cssCodeSplit: false,
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
              manualChunks: undefined,
            },
          },
          outDir: 'dist',
          emptyOutDir: true,
        },
  };
});
