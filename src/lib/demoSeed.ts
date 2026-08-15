/**
 * @file Demo project seed data
 * @description The starting contents of the in-memory project served by
 * {@link ./demoBackend.ts} when the app runs in demo mode on the website.
 *
 * 📖 This module exists only in the demo build. `main.tsx` imports the demo
 * backend behind `if (__KANDOWN_DEMO_BUILD__)`, which Rollup evaluates to
 * `false` for the CLI build — so neither this file nor the backend reaches
 * the single-file bundle that `npx kandown` ships.
 *
 * 📖 Why the tasks read like a tutorial: the demo is the first thing most
 * visitors will touch, and an empty board teaches nothing. The dataset is a
 * plausible small project whose cards happen to explain what to try. Keep it
 * that way when editing — cards that are only instructions ("CLICK HERE") make
 * the product look like a toy, and cards that are only filler waste the one
 * screen a visitor gives us.
 *
 * 📖 Every task here is real Markdown in the real on-disk format: frontmatter,
 * `## Subtasks` checkboxes, `report:` blocks. What the demo renders is exactly
 * what `kandown init` would render from the same files.
 *
 * @exports DEMO_PROJECT_NAME, DEMO_ROOT, DEMO_CONFIG_JSON, DEMO_INSTRUCTIONS,
 *          DEMO_BOARD_MD, DEMO_TASKS, DEMO_ARCHIVED_TASKS
 * @see src/lib/demoBackend.ts
 */

/** 📖 Shown in the sidebar as the open project. */
export const DEMO_PROJECT_NAME = 'Kandown Guide';

/**
 * 📖 A fake absolute path assigned to `window.__KANDOWN_ROOT__` in the demo
 * build. Nothing ever resolves it — it exists so `isServerMode()` is true and
 * `getProjectNameFromServerRoot()` derives the label above, which lets the
 * entire store boot through its normal server-mode path with no demo branches.
 */
export const DEMO_ROOT = `/${DEMO_PROJECT_NAME}/.kandown`;

/**
 * 📖 Field toggles are deliberately all `true`: the demo should show priorities,
 * tags, assignees and owner types, because those are the parts a screenshot
 * cannot convey. A real project usually turns most of them off.
 */
export const DEMO_CONFIG_JSON = JSON.stringify(
  {
    ui: {
      language: 'en',
      theme: 'light',
      skin: 'shadcn',
      font: 'inter',
      background: 'solid',
    },
    agent: {
      suggestFollowUp: true,
      maxSuggestions: 2,
      workOutput: {
        detailMode: 'complete',
        boardDigest: {
          showColumnCounts: true,
          showTasks: true,
          showPriority: true,
          showAssignee: true,
          showBlockedBy: true,
          showNextActionable: true,
        },
      },
    },
    board: {
      columns: ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'],
      defaultPriority: 'P3',
      defaultOwnerType: 'human',
      columnColors: { 'in progress': 'lime', review: 'fuchsia', done: 'slate' },
      stackDefaultState: 'expanded',
    },
    fields: {
      priority: true,
      assignee: true,
      tags: true,
      dueDate: false,
      ownerType: true,
      tools: false,
    },
    notifications: {
      browser: false,
      sound: false,
      soundId: 'soft',
      statusChanges: true,
      taskEdits: true,
      subtaskCompletions: true,
      editDebounceMs: 2000,
    },
  },
  null,
  2,
);

/** 📖 `.kandown/kandown_work.md`: project prose compiled into `kandown work`. */
export const DEMO_INSTRUCTIONS = `# Project instructions

This sample board is a hands-on guide to Kandown. It runs entirely in your
browser: no server, no account, and nothing written to disk. Reload the page and
every experiment resets. Open a local project when you want changes to persist.

## Conventions

- Tasks are one Markdown file each, under \`tasks/\`.
- Tags group the guide into basics, Markdown, agents, workflows, and interfaces.
- Move a card and the file's \`status:\` changes. Nothing mysterious happens.
- An agent reads this file plus the board digest when you run \`kandown work\`.
`;

/** 📖 `.kandown/board.md` — legacy single-file board. Kept so the read path has a target. */
export const DEMO_BOARD_MD = `# Project Kanban\n`;

/**
 * 📖 Active tasks, keyed by id. The value is the verbatim file content, exactly
 * as it would sit in \`tasks/<id>.md\`.
 */
export const DEMO_TASKS: Readonly<Record<string, string>> = {
  t1: `---
id: t1
title: "Start here: Kandown in 60 seconds 👋"
category: Basics
status: Backlog
order: 0
priority: P1
tags: [start-here, basics]
assignee: you
created: 2026-07-20
ownerType: human
---

# Start here: Kandown in 60 seconds 👋

## Context

Kandown turns a folder of Markdown tasks into a Kanban board for humans and AI
agents. No account, no database, no mysterious cloud workspace.

Drag this card into **Todo**. In a real project, that gesture only changes one
line in \`tasks/t1.md\`:

\`\`\`diff
- status: Backlog
+ status: Todo
\`\`\`

That is the storage layer. Very boring. Extremely useful. ✨

## Subtasks

- [ ] Drag this card to Todo.
- [ ] Open it and edit this text.
- [ ] Press \`?\` to see every keyboard shortcut.
`,

  t2: `---
id: t2
title: "Markdown is the database 📁"
category: Basics
status: Backlog
order: 1
priority: P2
tags: [basics, markdown, local-first]
assignee: you
created: 2026-07-21
ownerType: human
---

# Markdown is the database 📁

## Context

Every card is one readable file under \`tasks/\`. Open it in VS Code, change it
with a shell script, let an agent update it, or commit it with Git. Kandown shows
the same file instead of importing it into a private format.

\`\`\`text
tasks/
├── t1.md
├── t2.md
└── archive/
\`\`\`

Your project remains useful even if Kandown is closed. Revolutionary concept:
your files still belong to you. 😌

## Subtasks

- [ ] Open this task and inspect its frontmatter.
- [ ] Change its priority or tags.
- [ ] Imagine trying to review a binary database in a pull request. Done laughing?
`,

  t3: `---
id: t3
title: "Format a task like a tiny project brief"
category: Markdown
status: Todo
order: 0
priority: P2
tags: [markdown, formatting]
assignee: you
created: 2026-07-21
ownerType: human
---

# Format a task like a tiny project brief

## Context

Task bodies support normal Markdown. Use them for enough context to resume work
tomorrow, next month, or after another agent takes over.

### Useful ingredients

- **Bold** for decisions
- \`inline code\` for symbols and commands
- [Links](https://kandown.dev/docs/guides/tasks) for source material
- Fenced code blocks for examples
- Checklists for work that can actually finish

> A task should explain why the work matters, not only what button to press.

\`\`\`bash
kandown show t3
kandown move t3 "In Progress"
\`\`\`

## Subtasks

- [x] Add enough context to restart without archaeology.
  report: Included formatting examples and the reason behind them.
- [ ] Add one link to the relevant design or issue.
- [ ] Write the next concrete action.
`,

  t4: `---
id: t4
title: "Keep long-running agent work alive 🤖"
category: Agents
status: In Progress
order: 0
priority: P1
tags: [agents, long-runs, reports]
assignee: claude
created: 2026-07-22
ownerType: ai
report: |
  ## Changes
  - Investigated the failing build and recorded the actual cause.
  - Completed the parser fix without changing unrelated files.

  ## Next
  - Run the full build and attach the result before moving to Review.
---

# Keep long-running agent work alive 🤖

## Context

Long-running work survives chat windows because the plan, checked subtasks, and
reports live in the task file. An agent can stop. Another one can continue. No
one needs to reconstruct the plot from 84 messages and a hopeful guess.

Run \`kandown work\` and the agent receives project instructions, the live board,
blockers, priorities, and the next actionable task in one response.

## Subtasks

- [x] Record the investigation result.
  report: The task now contains enough context for a different agent to resume.
- [x] Implement the focused change.
  report: Kept the diff inside the parser module.
- [ ] Validate the build and write the final completion report.
`,

  t5: `---
id: t5
title: "Hand work from one agent to another"
category: Agents
status: Review
order: 0
priority: P2
tags: [agents, handoff, context]
assignee: codex
created: 2026-07-19
ownerType: ai
---

# Hand work from one agent to another

## Context

Codex can start a task, Claude can continue it, and a human can review the same
Markdown file. Kandown does not care which agent you use. Good tools should not
be jealous. 🙂

The useful handoff is simple:

1. Check completed subtasks.
2. Add a short \`report:\` under each result.
3. Leave the task in the honest column.
4. Let the next worker read before touching anything.

## Subtasks

- [x] Save the completed decisions.
- [x] Explain what remains.
- [ ] Review the final diff and move this task to Done.
`,

  t6: `---
id: t6
title: "Use Kanban, TUI, and CLI together"
category: Interfaces
status: Done
order: 0
priority: P3
tags: [interfaces, tui, cli]
assignee: you
created: 2026-07-15
ownerType: human
---

# Use Kanban, TUI, and CLI together

## Context

The board is one view, not the source of truth. Use the web app for planning,
the full TUI when you live in a terminal, and the CLI for scripts and agents.

\`\`\`bash
kandown work
kandown next
kandown show t6
\`\`\`

The website app is intentionally the lightweight option. It cannot launch your
terminal agents or replace the TUI, but it is excellent for checking a board,
editing tasks, and getting unstuck from another machine.

## Subtasks

- [x] Plan visually in the web app.
- [x] Work quickly from the TUI.
- [x] Give agents structured context through the CLI.
`,

  t7: `---
id: t7
title: "Let dependencies stop fake progress"
category: Workflow
status: Todo
order: 1
priority: P2
tags: [workflow, dependencies]
assignee: agent
created: 2026-07-20
ownerType: ai
depends_on: [t4]
---

# Let dependencies stop fake progress

## Context

This task carries \`depends_on: [t4]\`. Try moving it directly to **Done** while
t4 is unfinished. Kandown refuses the final move but still allows honest
progress through the other columns.

It is a tiny guardrail against the ancient project-management technique known
as "move everything to Done and hope nobody asks questions". 🪄

## Subtasks

- [ ] Try the blocked move.
- [ ] Finish t4.
- [ ] Move this task to Done once the dependency is real.
`,

  t8: `---
id: t8
title: "Search bodies, tags, and metadata"
category: Basics
status: Backlog
order: 2
priority: P4
tags: [search, shortcuts, basics]
assignee: you
created: 2026-07-23
ownerType: human
---

# Search bodies, tags, and metadata

## Context

Press \`/\` or open the command palette with \`⌘K\`, then search for
**marmalade**. Kandown searches task bodies too, so this card appears even
though that very serious engineering term is absent from its title.

marmalade 🍊

## Subtasks

- [ ] Find this card using its secret word.
- [ ] Search for the \`agents\` category.
- [ ] Clear the search and bring the whole guide back.
`,
};

/**
 * 📖 Archived tasks live under `tasks/archive/` on disk. They are hidden from
 * the board but reachable through the archive view — included here so that
 * surface is not empty in the demo.
 */
export const DEMO_ARCHIVED_TASKS: Readonly<Record<string, string>> = {
  t9: `---
id: t9
title: Put every task in one clever database
status: Done
order: 0
priority: P3
tags: [architecture]
assignee: you
created: 2026-06-30
ownerType: human
archived: true
---

# Put every task in one clever database

## Context

Considered and rejected. A single binary file would make querying easy and make
everything else worse: no readable \`git diff\`, no editing from a text editor,
no grep, and unpleasant merge conflicts.

Archived rather than deleted because this brilliant idea will return wearing a
different hat in six months. 🥸

## Subtasks

- [x] Write down what SQLite would actually buy us.
- [x] Write down what it would cost.
`,
};
