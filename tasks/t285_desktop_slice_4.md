---
id: t285
title: Desktop slice 4, native menu, dock and tray
status: In Progress
created: 2026-08-10
updated: 2026-08-11T10:17:01Z
priority: P1
tags: [desktop, ux]
ownerType: agent
depends_on: [t284]
---

# Desktop slice 4, native menu, dock and tray

Spec: [[t280]].

## Goal

The app behaves like a native application rather than a browser in a costume. This
is the slice that actually justifies the wrapper for a developer who already has a
terminal open, which is why it is P1 and on the v1 ship line, not a nicety.

The menu is also the **discovery surface**: it is where everything the app can do
becomes visible without reading a README. If a capability is not in the menu, for
most users it does not exist.

## Subtasks

- [ ] Native menu bar wired to the shortcuts the web UI already implements. Read
      them from the source rather than from this list, then record the real mapping
      here:
      - [ ] File: New task, Open project, Open recent, Close window
      - [ ] Edit: standard system items (undo, cut, copy, paste, select all), which
            a webview does **not** get for free on macOS and must be declared
      - [ ] View: reload, toggle full screen, zoom
      - [ ] Help: open the docs at kandown.dev, open the project folder in Finder or
            the file manager, reveal `~/.kandown/desktop.log`, show the CLI version
            the app is talking to
- [ ] Audit pass at the end: every capability the app has must be reachable from the
      menu. Anything only reachable by shortcut or by luck is a bug in this slice
- [ ] Menu actions reach the web UI. Decide the mechanism once (a Tauri event the
      app listens for, or a synthetic key event) and use it everywhere
- [ ] macOS dock badge showing the count of tasks in progress, read from the daemon
      and refreshed on the SSE stream
- [ ] Tray icon on Linux with open recents and quit. Optional, drop it if it fights
      the desktop environment
- [ ] Window state (size, position) persisted per project
- [ ] `Cmd+Q` and the window close button follow the lifecycle rules from [[t284]]

## Acceptance criteria

- [ ] Cut, copy, paste and select all work inside the task editor on macOS
- [ ] Every menu item either performs its action or is disabled, none are dead
- [ ] The dock badge matches the In Progress column count and updates when a task
      moves, without reopening the window
- [ ] Window size and position survive a quit and relaunch, per project
- [ ] The menu does not duplicate a shortcut the web UI already binds to something
      else

## Out of scope

- Global system-wide hotkeys.
- Quick-add from the tray without opening a window. Nice, but it needs a second UI
  surface and a second write path.
- Drag and drop of a folder onto the dock icon.
