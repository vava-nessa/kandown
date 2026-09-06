import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import type { ExtensionHost } from './src/lib/extensions/host';
import type { PermissionQueue } from './src/cli/lib/agent/permission-queue';
// 📖 Pure, dependency-free hash shared with the daemon's PUT /api/tasks route
// (round 4 optimistic concurrency). The same 16-char digest must be computed
// by both backends or the 409 guard would misfire, so both import it.
import { contentHash } from './src/lib/task-content-hash';

const CLOSING_HEAD_TAG = '</head>';
// 📖 Keep the local web UI dev server predictable so agents and humans can share the same URL.
const DEFAULT_DEV_SERVER_PORT = 5176;

/** 📖 Kandown agent charter (t312, round 5), appended to the compiled prompt
 * of chat sessions created through POST /api/agent/sessions in this dev
 * mirror. Role (manage tasks/*.md, not application code) plus the affordances
 * the chat sidebar renders: [[tXXX]] chips, [show: tXXX] auto-open,
 * @mention integral reads, ```options choice cards and PROPOSE: cards. MUST
 * stay byte-identical with CHAT_AFFORDANCES_PROMPT in src/cli/lib/server.ts
 * (the daemon and this plugin load in different runtimes, so the literal is
 * duplicated on purpose, like the mirrored route handlers). */
const CHAT_AFFORDANCES_PROMPT = [
  '## Kandown agent charter',
  '',
  'Your role here is managing this project\'s task board: reading, creating, editing and moving TASK MARKDOWN FILES (tasks/*.md) and writing clear task content. This is not a coding session: do not write or refactor application code unless the user explicitly asks.',
  'Your replies render as Markdown in the kandown chat sidebar: be structured and airy (short paragraphs, headings, lists, no walls of text).',
  '',
  'Affordances: reference a task inline as [[t123]] (a bare t123 works too) and it renders as a clickable chip. To point the user at a task, end your reply with the directive on its own line: [show: t123], optionally with a tight anchor: [show: t123]#description, #subtasks or #report (the app opens that task and scrolls to the section when your turn completes). When the user @mentions a task, read that task file integrally before answering.',
  '',
  'When you ask the user a question that has clear options, end your reply with an options block instead of a plain list, one choice per line; the chat renders it as clickable choice cards:',
  '```options',
  'First option',
  'Second option',
  'Third option',
  '```',
  '',
  'To propose a board action on your own initiative, write it on its own line as PROPOSE: move t271 to Done. The chat renders an Accept/Dismiss card; Accept sends "Approved: <your line>" as the user\'s reply.',
].join('\n');

// 📖 Maximum @task mentions inlined per message. Keep in sync with
// MAX_MENTIONED_TASKS in src/cli/lib/server.ts and the client cap in
// src/lib/chat-mentions.ts.
const MAX_MENTIONED_TASKS = 5;

/** 📖 Dev mirror of buildMentionSections in src/cli/lib/server.ts (round 3):
 * for every resolvable `mentionedTaskIds` entry, `## Task <id>: <title>`
 * followed by the WHOLE task file. The board-reader and parser functions are
 * injected because this plugin loads them through Vite's SSR loader while the
 * daemon imports them statically; the duplication of the section format is
 * on purpose, like every mirrored route handler in this file. Unknown or
 * unreadable ids are skipped silently, never an error; an empty result means
 * callers deliver the original message untouched. */
function buildMentionSections(
  findTaskPath: (kandownDir: string, taskId: string) => string | null,
  parseTaskFile: (content: string) => { frontmatter: { title?: string } },
  kandownDir: string,
  mentionedTaskIds: unknown,
): string {
  if (!Array.isArray(mentionedTaskIds)) return '';
  const ids: string[] = [];
  for (const value of mentionedTaskIds) {
    if (typeof value !== 'string') continue;
    const id = value.trim();
    if (!id || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= MAX_MENTIONED_TASKS) break;
  }
  let sections = '';
  for (const id of ids) {
    const taskPath = findTaskPath(kandownDir, id);
    if (!taskPath) continue;
    try {
      const content = readFileSync(taskPath, 'utf8');
      const title = parseTaskFile(content).frontmatter.title || `Task ${id}`;
      sections += `## Task ${id}: ${title}\n\n${content}\n\n`;
    } catch {
      // 📖 Unreadable file: skip this mention, keep the rest of the message.
    }
  }
  return sections;
}

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
  // 📖 t309 approvals: the dev mirror keeps its own tiny queue so the two
  // permission routes share state. Live task_diff streaming still needs the
  // real daemon (it owns the file watcher and the tracker).
  let permissionQueue: PermissionQueue | null = null;

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
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Kandown-Token, X-Kandown-Base-Hash');

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

        // 📖 Agent harness API (t307, t308) in DEV mode. The Vite dev server is
        // Node, so it can spawn harness processes exactly like the daemon does;
        // the routes mirror src/cli/lib/server.ts and demoBackend.ts answers 501
        // so the three adapters stay one protocol.
        if (resource === 'agent') {
          try {
            if (parts[1] === 'harnesses' && req.method === 'GET') {
              const detectModule = await server.ssrLoadModule('/src/cli/lib/agent/detect.ts') as typeof import('./src/cli/lib/agent/detect');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(detectModule.detectHarnessesJSON()));
              return;
            }

            // 📖 Dev mirror of GET /api/agent/runners (t261). Same registry
            // the daemon uses, so Herdr detection behaves identically in
            // `pnpm dev` and in the shipped binary.
            if (parts[1] === 'runners' && req.method === 'GET') {
              const runnerModule = await server.ssrLoadModule('/src/cli/lib/runner/index.ts') as typeof import('./src/cli/lib/runner/index');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ runners: runnerModule.getRunnerRegistry(kandownPath).describe() }));
              return;
            }

            // 📖 Dev mirror of GET /api/agent/models (t324). Discovery spawns
            // the harness binary and is cached inside the module, so the dev
            // server pays the handshake once, exactly like the daemon. The
            // query string is split off first: parts[1] still carries it.
            if ((parts[1] ?? '').split('?')[0] === 'models' && req.method === 'GET') {
              const modelModule = await server.ssrLoadModule('/src/cli/lib/agent/model-catalog.ts') as typeof import('./src/cli/lib/agent/model-catalog');
              const harnessId = new URL(req.url ?? '', 'http://localhost').searchParams.get('harness') ?? '';
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(await modelModule.listHarnessModels(harnessId)));
              return;
            }

            // 📖 t308 session index (DEV mirror). The project root is computed
            // from the dev tree, never accepted from the client.
            if (parts[1] === 'sessions-index') {
              const indexModule = await server.ssrLoadModule('/src/cli/lib/agent/session-index.ts') as typeof import('./src/cli/lib/agent/session-index');
              const boardModule = await server.ssrLoadModule('/src/cli/lib/board-reader.ts') as typeof import('./src/cli/lib/board-reader');
              const projectRoot = boardModule.getProjectRoot(kandownPath);

              if (!parts[2] && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ sessions: indexModule.listSessionIndexEntries(projectRoot) }));
                return;
              }

              if (parts[2] && req.method === 'DELETE') {
                const entryId = decodeURIComponent(parts[2]);
                const known = indexModule.listSessionIndexEntries(projectRoot).some(entry => entry.id === entryId);
                if (!known) {
                  res.writeHead(404, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Session not found' }));
                  return;
                }
                // 📖 Index-only removal: a live runtime session keeps running.
                indexModule.forgetSessionIndexEntry(projectRoot, entryId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
              }
            }

            // 📖 Dev mirror of GET /api/agent/active-edits (t322). Always an
            // empty list: the tracker only exists where the daemon wires
            // harness sessions to the file watcher (getAgentEditRuntime in
            // server.ts). This plugin spawns harnesses but never builds that
            // runtime, so dev has no live-edit presence to restore and the
            // client seed stays a no-op.
            if (parts[1] === 'active-edits' && req.method === 'GET') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ edits: [] }));
              return;
            }

            if (parts[1] === 'autopilot') {
              // 📖 Dev mirror of the autopilot endpoints. The orchestrator
              // lives in the SSR module scope: one instance per dev server,
              // same lifecycle rules as the daemon.
              const orchestratorModule = await server.ssrLoadModule('/src/cli/lib/agent/orchestrator.ts') as typeof import('./src/cli/lib/agent/orchestrator');
              const boardModule = await server.ssrLoadModule('/src/cli/lib/board-reader.ts') as typeof import('./src/cli/lib/board-reader');
              const orchestrator = orchestratorModule.createOrchestrator(boardModule.getProjectRoot(kandownPath), kandownPath);
              if (req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(orchestrator.snapshot()));
                return;
              }
              if (req.method === 'POST' && parts[2] === 'start') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(orchestrator.start()));
                return;
              }
              if (req.method === 'POST' && parts[2] === 'stop') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(orchestrator.stop()));
                return;
              }
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
                  harnessId?: unknown; taskId?: unknown; message?: unknown; title?: unknown; permissionMode?: unknown; skillId?: unknown; mentionedTaskIds?: unknown; model?: unknown;
                };
                if (typeof body.harnessId !== 'string' || !body.harnessId.trim()) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'harnessId is required' }));
                  return;
                }
                // 📖 Optional model override (round 4), same validation and
                // character class as the daemon: letters, digits, dot,
                // underscore, colon, slash, dash; 80 chars max.
                let model: string | undefined;
                if (typeof body.model === 'string' && body.model.trim()) {
                  model = body.model.trim();
                  if (model.length > 80 || !/^[A-Za-z0-9._:\/-]+$/.test(model)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid model: use at most 80 characters of letters, digits, dot, underscore, colon, slash or dash' }));
                    return;
                  }
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
                const config = configModule.loadConfig(kandownPath);
                // 📖 Skill launch (t310), same contract as the daemon: resolve
                // the id server-side against built-ins plus configured skills,
                // then append the skill section and its directive to the prompt.
                const skillId = typeof body.skillId === 'string' && body.skillId.trim() ? body.skillId.trim() : undefined;
                let prompt = compiled.markdown;
                if (skillId) {
                  const skillsModule = await server.ssrLoadModule('/src/cli/lib/skills.ts') as typeof import('./src/cli/lib/skills');
                  const skill = skillsModule.findSessionSkill(kandownPath, skillId, config.workflow.skills);
                  if (!skill) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Unknown or inactive skill: ${skillId}` }));
                    return;
                  }
                  prompt = skillsModule.buildSkillSessionPrompt(prompt, skill);
                }
                const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : undefined;
                // 📖 Kandown agent charter, same contract as the daemon: chat
                // sessions only, after the skill section, before the message.
                prompt = `${prompt}\n\n${CHAT_AFFORDANCES_PROMPT}`;
                // 📖 Round 3 @task mentions, same contract as the daemon: the
                // integral task files land after the compiled context, the
                // skill section and the charter, before the user message.
                const parserModule = await server.ssrLoadModule('/src/lib/parser.ts') as typeof import('./src/lib/parser');
                const mentionSections = buildMentionSections(boardModule.findTaskPath, parserModule.parseTaskFile, kandownPath, body.mentionedTaskIds);
                if (mentionSections) prompt = `${prompt}\n\n${mentionSections.trimEnd()}`;
                if (message) prompt = `${prompt}\n\n---\n\n${message}`;
                const permissionMode = body.permissionMode === 'accept-edits' || body.permissionMode === 'yolo'
                  ? body.permissionMode
                  : config.agent.permissionMode;
                try {
                  const session = runtimeModule.createAgentSession({
                    harnessId: body.harnessId.trim(),
                    projectRoot: boardModule.getProjectRoot(kandownPath),
                    prompt,
                    permissionMode,
                    ...(model ? { model } : {}),
                  });
                  // 📖 t308 index bookkeeping, same contract as the daemon:
                  // thin entry now, harnessSessionId on session_started,
                  // updatedAt on the first stopped event, then unsubscribe.
                  const indexModule = await server.ssrLoadModule('/src/cli/lib/agent/session-index.ts') as typeof import('./src/cli/lib/agent/session-index');
                  const projectRoot = boardModule.getProjectRoot(kandownPath);
                  const titleOverride = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : undefined;
                  const now = new Date().toISOString();
                  indexModule.upsertSessionIndexEntry(projectRoot, {
                    id: session.id,
                    harnessId: session.harnessId,
                    title: titleOverride ?? indexModule.indexEntryForPrompt(message ?? compiled.markdown),
                    ...(taskId ? { taskId } : {}),
                    createdAt: now,
                    updatedAt: now,
                  });
                  let unsubscribeIndex: (() => void) | null = null;
                  let sawStopped = false;
                  unsubscribeIndex = runtimeModule.subscribeAgentSession(session.id, event => {
                    if (event.type === 'session_started' && event.harnessSessionId) {
                      indexModule.patchSessionIndexEntry(projectRoot, session.id, { harnessSessionId: event.harnessSessionId });
                    } else if (event.type === 'stopped' && !sawStopped) {
                      sawStopped = true;
                      indexModule.patchSessionIndexEntry(projectRoot, session.id, { updatedAt: new Date().toISOString() });
                      unsubscribeIndex?.();
                    }
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

              if (id && parts[2] === 'send' && req.method === 'POST') {
                // 📖 t308 follow-up chat message (DEV mirror of the daemon route).
                const chunks: Buffer[] = [];
                await new Promise<void>((resolveBody, rejectBody) => {
                  req.on('data', chunk => chunks.push(chunk));
                  req.on('end', resolveBody);
                  req.on('error', rejectBody);
                });
                let body: { message?: unknown; mentionedTaskIds?: unknown; deliveryMode?: unknown };
                try {
                  body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as typeof body;
                } catch (error) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` }));
                  return;
                }
                if (typeof body.message !== 'string' || !body.message.trim()) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'message is required' }));
                  return;
                }
                // 📖 Round 4 delivery mode, same contract as the daemon:
                // 'steer' or 'queue', anything else keeps the runtime default.
                const deliveryMode = body.deliveryMode === 'steer' || body.deliveryMode === 'queue'
                  ? body.deliveryMode
                  : undefined;
                // 📖 Round 3 @task mentions, same contract as the daemon: the
                // integral task sections precede the user's line; with no
                // mentions (or none resolvable) the original text is delivered
                // untouched.
                const boardModule = await server.ssrLoadModule('/src/cli/lib/board-reader.ts') as typeof import('./src/cli/lib/board-reader');
                const parserModule = await server.ssrLoadModule('/src/lib/parser.ts') as typeof import('./src/lib/parser');
                const mentionSections = buildMentionSections(boardModule.findTaskPath, parserModule.parseTaskFile, kandownPath, body.mentionedTaskIds);
                const delivered = mentionSections
                  ? `${mentionSections}## User message\n\n${body.message}`
                  : body.message;
                const result = runtimeModule.sendToSession(decodeURIComponent(id), delivered, deliveryMode);
                res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Send failed' }));
                return;
              }

              if (id && parts[2] === 'stop' && req.method === 'POST') {
                const ok = runtimeModule.stopAgentSession(decodeURIComponent(id));
                if (ok) {
                  // 📖 Same sidebar reordering as the daemon: stop touches updatedAt.
                  const indexModule = await server.ssrLoadModule('/src/cli/lib/agent/session-index.ts') as typeof import('./src/cli/lib/agent/session-index');
                  const boardModule = await server.ssrLoadModule('/src/cli/lib/board-reader.ts') as typeof import('./src/cli/lib/board-reader');
                  indexModule.patchSessionIndexEntry(boardModule.getProjectRoot(kandownPath), decodeURIComponent(id), { updatedAt: new Date().toISOString() });
                }
                res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(ok ? { ok: true } : { error: 'Session not found' }));
                return;
              }

              // 📖 t309 permission approvals (DEV mirror). Same contract as the
              // daemon: 404 for an unknown session or permission id, 200 with
              // the pending list otherwise. In dev nothing pushes into this
              // queue (that needs the daemon's tracker wiring), so pending is
              // empty and resolve answers 404; the routes exist so the UI code
              // path is exercised end to end against real modules.
              if (parts[2] && parts[3] === 'pending' && req.method === 'GET') {
                const sessionId = decodeURIComponent(parts[2]);
                if (!runtimeModule.getAgentSession(sessionId)) {
                  res.writeHead(404, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Session not found' }));
                  return;
                }
                if (!permissionQueue) {
                  const queueModule = await server.ssrLoadModule('/src/cli/lib/agent/permission-queue.ts') as typeof import('./src/cli/lib/agent/permission-queue');
                  permissionQueue = queueModule.createPermissionQueue();
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ permissions: permissionQueue.listPending(sessionId) }));
                return;
              }

              if (parts[2] && parts[3] === 'permissions' && parts[5] === 'resolve' && req.method === 'POST') {
                const sessionId = decodeURIComponent(parts[2]);
                const permissionId = decodeURIComponent(parts[4] ?? '');
                if (!runtimeModule.getAgentSession(sessionId)) {
                  res.writeHead(404, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Session not found' }));
                  return;
                }
                const chunks: Buffer[] = [];
                await new Promise<void>((resolveBody, rejectBody) => {
                  req.on('data', chunk => chunks.push(chunk));
                  req.on('end', resolveBody);
                  req.on('error', rejectBody);
                });
                let body: { approve?: unknown } = {};
                try {
                  body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as typeof body;
                } catch {
                  // 📖 Same rule as the daemon: unreadable body means reject.
                }
                if (!permissionQueue) {
                  const queueModule = await server.ssrLoadModule('/src/cli/lib/agent/permission-queue.ts') as typeof import('./src/cli/lib/agent/permission-queue');
                  permissionQueue = queueModule.createPermissionQueue();
                }
                const resolved = permissionQueue.resolve(sessionId, permissionId, body.approve === true);
                res.writeHead(resolved ? 200 : 404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(resolved ? { ok: true } : { error: 'Permission not found' }));
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
              // 📖 Optimistic concurrency (round 4), same contract as the
              // daemon: a base hash header that no longer matches the file on
              // disk answers 409 with the current text and writes nothing.
              const rawBaseHash = req.headers['x-kandown-base-hash'];
              const baseHash = Array.isArray(rawBaseHash) ? rawBaseHash[0] : rawBaseHash;
              if (typeof baseHash === 'string' && baseHash.trim()) {
                const inTasksNow = join(tasksDir, `${id}.md`);
                const inArchiveNow = join(archiveDir, `${id}.md`);
                const currentPath = existsSync(inTasksNow) ? inTasksNow : existsSync(inArchiveNow) ? inArchiveNow : null;
                if (currentPath) {
                  const currentContent = readFileSync(currentPath, 'utf8');
                  if (contentHash(currentContent) !== baseHash.trim()) {
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'conflict', currentContent }));
                    return;
                  }
                }
              }
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
