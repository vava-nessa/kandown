---
name: kandown
description: Manage kandown boards and tasks from inside bb when the Kandown plugin is installed. Use when the user asks to see, create, move, or edit kanban tasks, or references the board/tasks/ folder of a project.
---

# Kandown (bb plugin)

The Kandown plugin runs kandown inside bb. Kandown is a file-based Kanban
engine: every task is a Markdown file with YAML frontmatter under the
project's `tasks/` folder, columns are configured in `.kandown/kandown.json`,
and the board is always in sync with what the kandown web app, TUI and CLI
would show.

The plugin shells out to the `kandown` CLI (install once with
`npm install -g kandown`). Prefer the `bb kandown` commands below over
reading or editing the task files directly: the CLI owns id allocation,
status resolution and filename rules.

## Commands

```text
bb kandown boards               list bb projects that are kandown boards
bb kandown list                 list tasks on the first board (--json for data)
bb kandown list --project <id>  list tasks on a specific project board
bb kandown show <task-id>       print a task's full Markdown file
bb kandown create "<title>"     create a task (flags: --to <column> -p P1-P3
                                -a <assignee> -t <tag>, repeat -t for more)
bb kandown move <id> <column>   move a task (or to "archived")
bb kandown assign <id> [name]   assign or unassign
bb kandown update <id> [--title "..."] [-p P1-P3] [-t <tag>] [--category <cat>] [--body "..."]
                                edit the fields the CLI has no dedicated command for
bb kandown launch <id>          start the task as a bb thread in the matching project (--provider <id>)
bb kandown daemon [status|start|stop]
                                manage the daemon that powers the embedded App view
bb kandown init --project <id>  initialize a board in a project checkout
```

Flag `--json` switches the data-oriented commands (list/show/create/move/
assign) to JSON output for scripting. `--project <id>` selects a board; every
project command needs a board behind it.

## Workflow guidance

- Task ids are stable prefixes of the filename (`t42` in `t42_UI_fix_login.md`).
  Renaming a file never changes the id — use the title/category fields instead.
- Moving a task between columns = changing its `status` frontmatter. Use
  `bb kandown move` (validates against the configured columns).
- Archive a finished task with `bb kandown move <id> archived`. There is no
  hard delete: archived is the terminal state, restorable from the board.
- A title that starts with a bracket category (`[UI] Fix login`) sets the
  `category` frontmatter and becomes part of the filename. `bb kandown create`
  applies the same rule.
- The board page inside bb (sidebar → Kandown) shows the same data; a task
  edited there lands in the same Markdown file you can edit here.
- Starting a task with `bb kandown launch` (or the board's play button, or the
  embedded app's "Send to Agent") creates a bb thread in the bb project that
  matches the kandown project. The agent works on the task file as source of
  truth and moves it through the columns when done.