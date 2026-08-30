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

Two views, switched by the segmented control in the toolbar:

- **App** (default) — your full kandown web application, embedded. The plugin
  ensures the project's kandown daemon runs with the bb agent hook
  (`KANDOWN_AGENT_HOOK_URL` pointing at the plugin, label `bb`), so every task
  drawer gains **Send to Agent · bb**. Clicking it forwards the task to bb,
  spawns a thread in the matching bb project and opens that thread.
- **Board** — a compact native board with the same data, plus drag & drop and
  one-click actions.

Board capabilities:

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

## Starting a task in bb

Every task can become a bb thread:

- **From the Board view**: hover a card, hit the play button, pick the harness
  (provider/model in bb, remembered per project) and start. A thread spawns in
  the bb project that matches this kandown project, seeded with the full task
  file as its prompt, then bb opens it.
- **From the embedded App**: open a task, click **Send to Agent · bb** (available
  because the plugin starts the daemon with `KANDOWN_AGENT_HOOK_URL`). The task
  is forwarded through the daemon to the plugin, which spawns the thread and bb
  navigates to it. This endpoint (`POST /api/tasks/<id>/agent`) was missing in
  kandown and is now implemented in `src/cli/lib/server.ts`.
- **From the CLI**: `bb kandown launch <task-id> [--project <id>] [--provider <id>]`.

The thread prompt tells the agent the task file under `tasks/` is the single
source of truth: keep it updated while working, move the task through the
columns with `bb kandown move`, and finish by moving it to the Done column.

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
bb kandown launch <task-id> [--provider <id>] [--project <id>]
bb kandown daemon [status|start|stop] [--project <id>]
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