---
id: t284
title: Desktop slice 3, recents launcher, multi-window projects and lifecycle
status: Done
created: 2026-08-10
updated: 2026-08-21T08:44:31Z
priority: P1
tags: [desktop, ux]
ownerType: agent
depends_on: [t283]
category: DESKTOP
archived: true
---

# Desktop slice 3, recents launcher, multi-window projects and lifecycle

Spec: [[t280]], decision 2 (Obsidian model).

## Goal

Several kandown projects open side by side in their own windows, a launcher that
remembers them, and a shutdown that never leaves an orphaned daemon behind.

## Subtasks

- [ ] `src-tauri/src/projects.rs`: a recents store holding path, display name and
      last opened timestamp. It lives in `~/.kandown/desktop.json`, **not** in the
      Tauri app config directory, because the CLI has to read the same file (see
      decision 6 in [[t280]] and the schema in [[t289]]). Never inside a user repo
- [ ] Prune entries whose folder no longer exists, but show them greyed with a
      "remove" action rather than deleting silently
- [ ] Launcher window: recents list plus "Open folder". Shown when more than one
      project is known, skipped when exactly one is
- [ ] One window per project, each owning its own `DaemonHandle`
- [ ] `tauri-plugin-single-instance` configured to **route**: a second launch
      focuses or opens a window in the running instance rather than refusing to start
- [ ] Closing a window stops only that window's daemon and waits for the port
- [ ] Quitting the app stops every daemon it started, and only those. A daemon the
      app **joined** (started from a terminal, see [[t283]]) survives the quit
- [ ] macOS: closing the last window keeps the app in the dock, clicking the dock
      icon reopens the launcher
- [ ] Crash and force-quit path: on next launch, detect a stale `daemon.json` whose
      pid is dead and clean it up (`getDaemonStatus` in `src/cli/lib/daemon.ts`
      already validates pid liveness, reuse that logic rather than reinventing it)

## Acceptance criteria

- [ ] Two projects open at once, two windows, two distinct ports, both boards live
- [ ] Closing one window leaves the other working, and releases only its own port
- [ ] Quitting releases every port the app opened, verified with `lsof`
- [ ] Relaunching shows the recents list with both projects, most recent first
- [ ] Launching the app a second time from the dock or CLI does not start a second
      process, it opens a window in the first
- [ ] Force-quitting the app and relaunching does not leave an orphaned `node`
      process, and does not refuse to reopen the project
- [ ] Opening the same project in a second window is refused with a clear message,
      or focuses the existing window. Decide which and document it here

## Out of scope

- Watching for projects appearing on disk. The user adds them explicitly.
- Syncing recents across machines.
