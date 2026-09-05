---
id: t289
title: Desktop slice 7, CLI entry point, open mode and deep links
status: Backlog
created: 2026-08-10
updated: 2026-09-05T09:16:18Z
priority: P1
tags: [desktop, cli, ux]
ownerType: agent
depends_on: [t284]
category: DESKTOP
order: 19
---

# Desktop slice 7, CLI entry point, open mode and deep links

Spec: [[t280]], decision 7.

## Why this matters more than it looks

The dock icon is the **secondary** entry point for this audience. The primary one
is typing `kandown` in a terminal, which today calls `openBrowser`
(`src/cli/cli.ts:179`). Until that command knows the app exists, the desktop app
is something the user has to remember to launch, and they will not.

This slice also gives the app the one thing a browser tab cannot do: a URL scheme
an AI CLI can call to bring a specific task to the front.

## The open mode

Three values, stored per machine:

- `app`: `kandown` opens the desktop app
- `browser`: current behaviour, unchanged
- `ask`: prompt in the terminal each time

Flow on the first `kandown` after the app is installed: the CLI detects the app,
prompts once (`[1] app, [2] browser, [3] ask every time`), writes the answer, and
never asks again unless the user changes it.

Escape hatches, always available regardless of the stored mode: `kandown --browser`
and `kandown --app`.

## The settings split (decision 7 in [[t280]])

Isolation is **by what the setting configures**, not by which interface displays it.

| Kind | Location | Written by | Examples |
|---|---|---|---|
| Machine | `~/.kandown/desktop.json` | CLI and app | open mode, recent projects, window geometry, updater opt-out |
| Project / board | `.kandown/kandown.json` | unchanged, shared | theme, columns, extensions |

Two rules that are not negotiable:

1. **The app never forks a board setting.** A board must look identical in the
   browser and in the app. Forking one would be a second source of truth, which is
   hard rule #6.
2. **Machine settings live in `~/.kandown/`, not in the Tauri config directory.**
   The CLI has to read the open mode and cannot portably locate a Tauri app config
   path. `~/.kandown/` already exists and already holds machine state
   (`project-state`, `.update-check.json`).

This supersedes [[t284]], which originally put the recents store in the Tauri app
config directory.

## Subtasks

- [ ] Define the `~/.kandown/desktop.json` schema and a shared reader/writer used by
      both the CLI and the app. One module, not two implementations
- [ ] Migrate the recents store from [[t284]] into it
- [ ] CLI: detect an installed desktop app per platform (macOS: the bundle id in
      `/Applications` and `~/Applications`; Linux: the `.desktop` entry)
- [ ] CLI: first-run prompt, then honour the stored mode
- [ ] CLI: `--app` and `--browser` flags, and a `kandown config open-mode <value>`
      command so it is changeable without the app
- [ ] Register the `kandown://` URL scheme via `tauri-plugin-deep-link`
- [ ] Handle `kandown://open?path=<project>` (open or focus that project's window)
      and `kandown://task/<id>?path=<project>` (focus the window and select the task)
- [ ] Deep links route through the single-instance handler from [[t284]] rather than
      starting a second process
- [ ] App settings panel exposing open mode, recents management and the updater
      opt-out. Visually part of the existing settings surface, but reading and
      writing the machine store, never `kandown.json`
- [ ] Document the URL scheme in the README so an agent can use it

## Acceptance criteria

- [ ] With the app installed and no stored preference, `kandown` prompts once
- [ ] Answering "app" makes every later `kandown` open the app, no prompt
- [ ] Answering "browser" leaves today's behaviour byte for byte identical
- [ ] `kandown --browser` opens the browser even when the mode is `app`, and the
      reverse
- [ ] With no app installed, the CLI never prompts and never mentions the app
- [ ] `open "kandown://task/t123?path=/some/project"` focuses that window with t123
      selected, and does not spawn a second app process
- [ ] Changing the open mode in the app changes what the CLI does on the next run,
      without restarting anything
- [ ] A board configured in the browser looks identical in the app, and the reverse.
      No board setting exists in two places

## Out of scope

- Deep links that mutate state (`kandown://move/...`). Read and focus only. Writing
  through a URL scheme is an authorisation question, and the answer is not yet
  written down.
- Windows registration of the URL scheme. Deferred with the rest of Windows.
- A protocol handler for the web UI.
