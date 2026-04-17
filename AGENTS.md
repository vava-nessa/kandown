# Agent Instructions — Kandown

<!-- kandown:agent-ref -->
## Kandown Task System

**IMPORTANT:** Before touching any task files, you MUST read `AGENT_KANDOWN.md` (at project root).

Quick summary:
- **Start with `.kanban/board.md`** — task index, always lean
- **Only open `.kanban/tasks/t-xxx.md`** when you need full details on a specific task
- **Completion workflow:** Update task in `board.md` + write `## What was done` in the task file
- **Mutation rules:** See `AGENT_KANDOWN.md` — some changes need both files updated

---

## Project Architecture

**Kandown** — A file-based Kanban engine backed by plain markdown.

```
kandown/
├── bin/kandown.js          # CLI (npx kandown init/update)
├── dist/index.html         # Pre-built single-file app (no deps)
├── src/
│   ├── components/         # React 19 components (Board, Card, Drawer, CommandPalette...)
│   ├── lib/
│   │   ├── parser.ts       # Parses board.md and task files
│   │   ├── serializer.ts   # Writes board.md and task files
│   │   ├── filesystem.ts   # File System Access API wrapper
│   │   ├── store.ts        # Zustand state store
│   │   └── types.ts        # TypeScript types
│   ├── hooks/              # Custom React hooks
│   ├── styles/globals.css  # Tailwind 3 + custom styles
│   ├── App.tsx             # Main app component
│   └── main.tsx            # Entry point
├── templates/              # .kanban/ starter templates
│   ├── board.md
│   ├── AGENT.md
│   ├── README.md
│   └── tasks/
├── package.json
└── AGENT_KANDOWN.md        # Full task system documentation
```

### Key Tech Stack

| Layer | Technology |
|-------|------------|
| UI | React 19, Motion 12, Tailwind 3 |
| Build | Vite 6 |
| State | Zustand 5 |
| Types | TypeScript (strict) |
| CLI | Node.js ESM |

### CLI Commands

```bash
pnpm dev     # Start dev server with hot reload
pnpm build   # Build dist/index.html (run before publishing)
pnpm lint    # ESLint check
```

### How the App Works

1. User opens `kanban.html` in Chrome/Edge/Brave
2. App uses **File System Access API** to read/write `.kanban/` files
3. `board.md` is the lightweight index — always <1k tokens
4. Task details live in `tasks/t-xxx.md` — only loaded on demand
5. All state is derived from markdown files — no backend, no database

### Development Notes

- The app is a **single HTML file** in `dist/` — this is what gets served
- `src/` is the React source that gets built into `dist/index.html`
- Templates in `templates/` are copied by the CLI during `kandown init`
- The CLI (`bin/kandown.js`) is published to npm as a standalone bin

### For AI Agents

When picking up tasks from `.kanban/board.md`:
1. Read `board.md` first for the index
2. Find relevant task lines
3. Only open `tasks/t-xxx.md` when you need the full context
4. After completing: move task to Done in `board.md` + write summary in task file
5. If you notice something unrelated needs fixing: **create a new task**, don't fix inline

---

## Owner Type System

Tasks can be marked as:
- `` `human` `` — meant for a human
- `` `ai` `` — meant for an AI agent

The UI has a filter to show only human or AI tasks. Use this to coordinate who does what.
