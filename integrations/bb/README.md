# bb-plugin-kandown — kandown inside bb

A [bb](https://getbb.app) plugin that turns bb into a kanban board. It
uses **kandown** ([kandown.dev](https://kandown.dev), this repository) as the
engine: the board is the plain Markdown task files in a project's `tasks/`
folder, and every operation shells out to the `kandown` CLI, so bb, the
kandown web app, the TUI and the terminal stay byte-identical on the same
data.

## The switch

- **Kandown button** — the *Kandown* row in bb's sidebar (routed at
  `/plugins/kandown/board`). Clicking it switches bb's main area to the
  kanban board with all the options: columns, cards, drag & drop, add, edit,
  archive, restore, priorities, tags, assignees, categories, archived view.
- **Back to bb** — the back arrow (ChevronLeft) in the board's toolbar
  returns you to bb's normal view. You can also just click any other sidebar
  row. bb itself is never replaced; the plugin lives inside it.

## Setup

```sh
npm install -g kandown        # the engine this plugin shells out to
bb plugin install ./integrations/bb   # or wherever you cloned this plugin
```

The plugin then lists every bb project whose checkout is a kandown project
(has `.kandown/kandown.json` + `tasks/`). Projects that are not kandown yet
can be initialized from the board with one click (runs `kandown init`).

## What the board can do

- Column buckets from `.kandown/kandown.json` (including the per-column
  colors), with an "Other" column for any unconfigured statuses that exist.
- Native drag & drop between columns (`kandown move`).
- Create tasks (`kandown create`) with column, priority P0-P3, assignee,
  tags and category.
- Edit title, column, priority, assignee, tags, category and the Markdown
  body. Title/category changes reslug the task file (`kandown reslug`), the
  same rule kandown's own drawer applies.
- Archive / restore (`kandown move <id> archived`).
- Live sync: refreshes on the server's realtime signal (every write from this
  board, `bb kandown`, or anywhere else), on reconnect, and when the tab
  becomes visible again, so edits made by kandown itself or by agents show up
  without a manual refresh.

## Agent surface

Agents get a `bb kandown` command (auto-discovered via the plugin-commands
skill) and a `kandown` skill:

```text
bb kandown boards
bb kandown list [--project <id>] [--json]
bb kandown show <task-id> [--project <id>]
bb kandown create "<title>" [--to <column>] [-p P1] [-a name] [-t tag] [--project <id>]
bb kandown move <task-id> <column|archived> [--project <id>]
bb kandown assign <task-id> [name] [--project <id>]
bb kandown update <task-id> [--title "..."] [-p P1] [-t tag] [--category X] [--body "..."] [--project <id>]
bb kandown init [--project <id>]
```

## Notes & limits

- The CLI runs on the bb server host. Projects whose checkout lives on an
  enrolled remote host are detected and listed, but the board itself can only
  be opened from a machine where the project directory is local to the bb
  server.
- The plugin is a standalone npm package on purpose: it is not part of the
  kandown pnpm workspace, so it cannot break kandown's own build or verify.
- Configuration (custom `binary` path) lives in bb's plugin settings
  (`bb plugin config kandown set binary /path/to/kandown`), editable in
  Settings → Extensions → Kandown.