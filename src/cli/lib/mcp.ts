/**
 * @file Stdio MCP server for Kandown
 * @description Exposes Kandown task operations to MCP hosts (Claude Desktop, VSCode, etc.)
 * via JSON-RPC 2.0 over stdin/stdout.
 *
 * @functions
 *  → startMcpServer — starts stdio JSON-RPC loop
 *
 * @exports startMcpServer
 */

import { readBoard, readTask, moveTaskToColumn, createTaskInBoard, getTasksDir } from './board-reader.js';
import { loadConfig } from './config.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from './atomic-write.js';
import { serializeTaskFile } from '../../lib/serializer.js';
import { stampUpdated } from '../../lib/task-meta.js';

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number;
  method: string;
  params?: any;
}

export function startMcpServer(kandownDir: string): void {
  // Ensure stdout is used only for JSON-RPC messages
  process.stdin.setEncoding('utf8');

  let buffer = '';

  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const req: JsonRpcRequest = JSON.parse(trimmed);
        handleJsonRpc(kandownDir, req);
      } catch (e) {
        sendResponse(null, { error: { code: -32700, message: 'Parse error' } });
      }
    }
  });
}

function sendResponse(id: string | number | null | undefined, resultOrError: any): void {
  if (id === undefined) return; // Notification
  const resp = {
    jsonrpc: '2.0',
    id,
    ...resultOrError,
  };
  process.stdout.write(JSON.stringify(resp) + '\n');
}

function handleJsonRpc(kandownDir: string, req: JsonRpcRequest): void {
  const { id, method, params } = req;

  if (method === 'initialize') {
    sendResponse(id, {
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'kandown', version: '0.20.0' },
      },
    });
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'tools/list') {
    sendResponse(id, {
      result: {
        tools: [
          {
            name: 'list_tasks',
            description: 'List all tasks on the Kandown board with optional filtering',
            inputSchema: {
              type: 'object',
              properties: {
                status: { type: 'string', description: 'Filter by column/status name' },
                assignee: { type: 'string', description: 'Filter by assignee' },
                tag: { type: 'string', description: 'Filter by tag' },
                priority: { type: 'string', description: 'Filter by priority (P1, P2, P3, P4)' },
              },
            },
          },
          {
            name: 'get_task',
            description: 'Get details and full content of a specific task by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Task ID (e.g. t1, t42)' },
              },
              required: ['id'],
            },
          },
          {
            name: 'create_task',
            description: 'Create a new task on the Kandown board',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Task title (supports inline syntax #tag @user p1 due:date)' },
                status: { type: 'string', description: 'Target column name (default: Backlog)' },
                priority: { type: 'string', description: 'Priority level (P1, P2, P3, P4)' },
                assignee: { type: 'string', description: 'Assignee username' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
                body: { type: 'string', description: 'Markdown body content' },
              },
              required: ['title'],
            },
          },
          {
            name: 'move_task',
            description: 'Move a task to a different column or to archived',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Task ID' },
                status: { type: 'string', description: 'Target column name or "archived"' },
              },
              required: ['id', 'status'],
            },
          },
          {
            name: 'add_report',
            description: 'Append an agent execution report to a task body',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Task ID' },
                report: { type: 'string', description: 'Markdown report content to append under ## Report' },
              },
              required: ['id', 'report'],
            },
          },
          {
            name: 'list_columns',
            description: 'List configured board columns and task counts',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      },
    });
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {};

    if (name === 'list_tasks') {
      const board = readBoard(kandownDir);
      let tasks: any[] = [];
      for (const col of board.columns) {
        if (args.status && col.name.toLowerCase() !== String(args.status).toLowerCase()) continue;
        for (const t of col.tasks) {
          if (args.assignee && t.assignee !== args.assignee) continue;
          if (args.priority && t.priority !== args.priority) continue;
          if (args.tag && !t.tags.includes(args.tag)) continue;
          tasks.push({ ...t, status: col.name });
        }
      }
      sendResponse(id, { result: { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] } });
      return;
    }

    if (name === 'get_task') {
      const task = readTask(kandownDir, args.id);
      sendResponse(id, { result: { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] } });
      return;
    }

    if (name === 'create_task') {
      const newId = createTaskInBoard(kandownDir, args.title, args.status);
      if (args.body || args.priority || args.assignee || args.tags) {
        const task = readTask(kandownDir, newId);
        const fm = {
          ...task.frontmatter,
          ...(args.priority ? { priority: args.priority } : {}),
          ...(args.assignee ? { assignee: args.assignee } : {}),
          ...(args.tags ? { tags: args.tags } : {}),
        };
        const body = args.body ? (task.body + '\n\n' + args.body).trim() : task.body;
        const taskPath = join(getTasksDir(kandownDir), `${newId}.md`);
        atomicWriteFileSync(taskPath, serializeTaskFile(stampUpdated(fm), body));
      }
      sendResponse(id, { result: { content: [{ type: 'text', text: `Created task ${newId}` }] } });
      return;
    }

    if (name === 'move_task') {
      const ok = moveTaskToColumn(kandownDir, args.id, args.status);
      sendResponse(id, ok
        ? { result: { content: [{ type: 'text', text: `Moved ${args.id} to ${args.status}` }] } }
        : { error: { code: -32602, message: `Cannot move ${args.id} to ${args.status} (gate refused or file missing)` } },
      );
      return;
    }

    if (name === 'add_report') {
      const taskPath = join(getTasksDir(kandownDir), `${args.id}.md`);
      if (!existsSync(taskPath)) {
        sendResponse(id, { error: { code: -32602, message: `Task ${args.id} not found` } });
        return;
      }
      const task = readTask(kandownDir, args.id);
      const reportSection = `\n\n## Report\n\n${args.report.trim()}`;
      const newBody = task.body.includes('## Report')
        ? task.body.replace(/## Report[\s\S]*/, `## Report\n\n${args.report.trim()}`)
        : task.body.trim() + reportSection;
      atomicWriteFileSync(taskPath, serializeTaskFile(stampUpdated(task.frontmatter), newBody));
      sendResponse(id, { result: { content: [{ type: 'text', text: `Appended report to ${args.id}` }] } });
      return;
    }

    if (name === 'list_columns') {
      const config = loadConfig(kandownDir);
      const board = readBoard(kandownDir);
      const cols = board.columns.map(c => ({ name: c.name, count: c.tasks.length }));
      sendResponse(id, { result: { content: [{ type: 'text', text: JSON.stringify(cols, null, 2) }] } });
      return;
    }

    sendResponse(id, { error: { code: -32601, message: `Unknown tool: ${name}` } });
    return;
  }

  sendResponse(id, { error: { code: -32601, message: `Method not found: ${method}` } });
}
