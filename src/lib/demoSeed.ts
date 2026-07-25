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
export const DEMO_PROJECT_NAME = 'Kandown Demo';

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
      skin: 'kandown',
      font: 'inter',
      background: 'solid',
    },
    agent: {
      suggestFollowUp: true,
      maxSuggestions: 2,
      workOutput: {
        mode: 'blocks',
        includeBaseRules: true,
        baseRulesMode: 'full',
        includeProjectInstructions: true,
        includeBoardDigest: true,
        sectionOrder: ['baseRules', 'projectInstructions', 'boardDigest'],
        rawTemplate: '{{baseRules}}\n\n---\n\n{{projectInstructions}}\n\n---\n\n{{boardDigest}}',
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
      stackDefaultState: 'collapsed',
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

/** 📖 `.kandown/instructions.md` — the project-scoped prose `kandown work` prints to an agent. */
export const DEMO_INSTRUCTIONS = `# Project instructions

This is the demo board for Kandown. It runs entirely in your browser: there is
no server, no account, and nothing is written anywhere. Reload the page and it
comes back exactly as you found it.

## Conventions

- Tasks are one Markdown file each, under \`tasks/\`.
- Move a card and the file's \`status:\` changes. Nothing else does.
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
title: Move this card to Todo
status: Backlog
order: 0
priority: P2
tags: [start-here]
assignee: you
created: 2026-07-20
ownerType: human
---

# Move this card to Todo

## Context

Drag this card into the **Todo** column. On a real project that single gesture
rewrites one line in \`tasks/t1.md\`:

\`\`\`diff
- status: Backlog
+ status: Todo
\`\`\`

That is the whole storage layer. No database, no sync engine, no \`.lock\` file —
a folder of Markdown you can grep, diff, and commit alongside the code the tasks
describe.

## Subtasks

- [ ] Drag this card to Todo.
- [ ] Open it (click the card) and edit this text.
- [ ] Press \`?\` to see every keyboard shortcut.
`,

  t2: `---
id: t2
title: Write the onboarding email sequence
status: Backlog
order: 1
priority: P3
tags: [content, growth]
assignee: sam
created: 2026-07-21
ownerType: human
depends_on: [t5]
---

# Write the onboarding email sequence

## Context

This card carries \`depends_on: [t5]\`, so the board shows a **↪** chip on it and
refuses to let it reach the terminal column while t5 is unfinished. Other moves
stay free — the gate is only on the last hop, the way GitHub, Linear and Jira
treat blocking relations.

Try it: drag this card straight to **Done** and watch it bounce.

## Subtasks

- [ ] Draft the welcome mail.
- [ ] Draft the day-3 activation nudge.
- [ ] Decide whether day-7 is a mail or an in-app hint.
`,

  t3: `---
id: t3
title: Audit the empty states
status: Todo
order: 0
priority: P3
tags: [ui, polish]
assignee: you
created: 2026-07-21
ownerType: human
---

# Audit the empty states

## Context

Three screens still render a bare rectangle when there is nothing to show. Each
one is a moment where a new user decides whether the product is finished.

## Subtasks

- [x] List every empty state in the app.
  report: Found four, not three — the archive view has one too.
- [ ] Write copy for each.
- [ ] Decide if any of them deserves an illustration.
`,

  t4: `---
id: t4
title: Cache the parsed task index
status: In Progress
order: 0
priority: P1
tags: [performance, core]
assignee: claude
created: 2026-07-22
ownerType: ai
report: |
  ## Changes
  - Added an in-memory index keyed by file mtime so unchanged tasks skip the parser.
  - Invalidation hangs off the existing watcher event rather than a second stat loop.

  ## Validation
  - Cold board load on 400 tasks: 1.9s → 240ms.
  - No change on boards under ~30 tasks, as expected.
---

# Cache the parsed task index

## Context

Boards over a few hundred tasks re-parse every file on each reload. The parse
itself is cheap; doing it 400 times on every keystroke-triggered refresh is not.

This card is owned by an AI agent — note the \`ownerType: ai\` marker on it. The
\`report:\` block in the frontmatter is written by the agent as it works, and it
renders in the drawer when you open the card. That block is the contract: an
agent that moves a task to Done without one has not finished the task.

## Subtasks

- [x] Measure where the time actually goes.
  report: 78% in frontmatter parsing, 14% in the Markdown body pass, rest is I/O.
- [x] Key the cache on mtime rather than content hash.
  report: Hashing meant reading the file anyway, which defeated the point.
- [ ] Decide whether to persist the index between runs.
`,

  t5: `---
id: t5
title: Ship the pricing page
status: Review
order: 0
priority: P2
tags: [web]
assignee: sam
created: 2026-07-19
ownerType: human
---

# Ship the pricing page

## Context

Copy is signed off, layout is built, the annual toggle works. Blocking t2 until
this lands, because the onboarding sequence links to it.

Move this card to **Done** and t2 unblocks.

## Subtasks

- [x] Final copy pass.
- [x] Annual / monthly toggle.
- [ ] Proofread the FAQ.
`,

  t6: `---
id: t6
title: Replace the settings modal with a real page
status: Done
order: 0
priority: P3
tags: [ui]
assignee: you
created: 2026-07-15
ownerType: human
---

# Replace the settings modal with a real page

## Context

The modal could not be linked to, could not be deep-linked into a section, and
trapped focus badly on mobile. It is a page now.

## Subtasks

- [x] Move each section to its own route.
- [x] Keep the old modal URL redirecting.
`,

  t7: `---
id: t7
title: Use search to find this card
status: Backlog
order: 2
priority: P4
tags: [start-here]
assignee: you
created: 2026-07-20
ownerType: human
---

# Use search to find this card

## Context

Press \`/\` — or \`⌘K\` for the command palette — and type **marmalade**. Search
reads the body of every task, not just titles, so it finds this card by a word
that appears nowhere in its title.

marmalade

## Subtasks

- [ ] Find this card by searching for that word.
- [ ] Clear the search and watch the board come back.
`,

  t8: `---
id: t8
title: Decide on the mobile breakpoint
status: Todo
order: 1
priority: P4
tags: [ui, undecided]
assignee: unassigned
created: 2026-07-23
ownerType: human
---

# Decide on the mobile breakpoint

## Context

The board is unusable below roughly 700px, and we have never decided whether
that is worth fixing or whether the phone case is read-only by nature.

## Subtasks

- [ ] Look at what share of traffic is actually phone-sized.
- [ ] Prototype the read-only variant before committing to the full one.
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
title: Evaluate moving tasks into a SQLite file
status: Done
order: 0
priority: P3
tags: [architecture]
assignee: you
created: 2026-06-30
ownerType: human
archived: true
---

# Evaluate moving tasks into a SQLite file

## Context

Considered and rejected. A single binary file would have made querying trivial
and made every other property of the project worse: no \`git diff\` that a human
can read, no editing a task from a text editor, no grep, no merge resolution.

Archived rather than deleted, because this decision will be proposed again.

## Subtasks

- [x] Write down what SQLite would actually buy us.
- [x] Write down what it would cost.
`,
};
