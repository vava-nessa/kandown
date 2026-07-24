import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const CLOSING_HEAD_TAG = '</head>';
// 📖 Keep the local web UI dev server predictable so agents and humans can share the same URL.
const DEFAULT_DEV_SERVER_PORT = 5176;

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
  return {
    name: 'kandown-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (process.env.NODE_ENV === 'production') return next();
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

export default defineConfig({
  plugins: [kandownDevPlugin(), react(), viteSingleFile(), kandownSingleFileRepairPlugin()],
  server: {
    port: DEFAULT_DEV_SERVER_PORT,
  },
  build: {
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
});
