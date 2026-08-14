---
id: t280
title: [DESKTOP] Native desktop apps via Tauri 2.x (spec)
status: In Progress
created: 2026-08-10
updated: 2026-08-10T13:12:59Z
priority: P1
tags: [desktop, apps, architecture, epic, spec, decision]
ownerType: human
depends_on: [t281]
---

# Native desktop apps via Tauri 2.x (spec)

**This task is the feature specification. It ships no code.** The work is
delivered by the slices listed under "Slices" below, each a vertical cut through
the real system. Close this task only when every selected slice is accepted.

## Context

Kandown runs as a `kandown` CLI the user launches from a terminal. It spins up a
local daemon and opens the browser at `127.0.0.1:<port>`. That works, but there is
no dock icon, no menu bar, no tray, no auto-update, no code signature, and no
`.dmg` / `.deb` to hand someone.

**Who this is for: developers who already use kandown from the CLI.** Not
designers, not PMs. Kandown is a tool for people coding alongside AI CLIs, and
they all have the CLI installed. That single fact removes most of the complexity
an earlier draft of this task carried (see "Decisions").

What this buys them: an application that lives in the dock, remembers their
projects, opens several repos in parallel windows, and updates itself. Not a new
capability, a native shell around one they already have.

Electron is the obvious wrapper but idles at 150-300 MB RAM. Tauri 2.x uses the
system webview (WKWebView on macOS, WebKitGTK on Linux, WebView2 on Windows),
bundles small, and idles far lower.

The build pipeline already produces what a wrapper needs:

- `pnpm build` produces a self-contained `dist/index.html` (vite-plugin-singlefile)
- `pnpm build:cli` produces `bin/kandown.js`
- `src/cli/lib/server.ts` is the local daemon (REST + SSE on `127.0.0.1`)

No product code in `src/lib/` or `src/cli/` needs to change for the wrapper
itself. The one change this depends on is [[t281]], and that is a security fix
that stands on its own.

## Decisions

Settled with vava. These are not open questions. A reviewer may find bugs inside
this contract but must not reopen the contract.

### 1. The desktop app uses the **system** `kandown` CLI. Always.

It does not embed Node.js. It does not bundle `bin/kandown.js`. It does not bundle
`dist/index.html`. It shells out to whatever `kandown` is on `PATH`, and that CLI
serves its own bundled UI, exactly as it does today from a terminal.

If `kandown` is not on `PATH`, the app shows a native screen with the install
command to copy (`npm i -g kandown`) and a retry button. It does not try to
install anything itself.

**This replaces, and reverses, an earlier draft** which embedded a per-platform
Node binary via nexe, bundled a copy of the CLI and the HTML into `resources/`,
and preferred whichever of the system or bundled CLI was newer. That design was
dropped because:

- it contradicted itself (it promised a "known good pair" while also preferring a
  newer system CLI, which serves its own different UI)
- it broke `getPackageRoot()` (`src/cli/lib/updater.ts:29`), which resolves
  `PKG_ROOT` by looking for `/bin/` in its own file path. A CLI copied to
  `resources/kandown-cli.cjs` resolves the wrong root, `dist/index.html` is not
  found, and `serveApp` returns `404 kandown.html not found`
- it added ~110 MB of Node binary per platform to justify a public we are not
  targeting

### 2. Project selection follows the Obsidian model.

- On launch with no known project: a native folder picker.
- With known projects: a launcher window listing recents, plus "Open folder".
- One window = one project = one daemon.
- "Open another project" opens a **new window**, it does not replace the current one.
- The recents list lives in `~/.kandown/desktop.json`, outside any repo. It is
  machine state, not task truth, so hard rule #6 is not in play. See decision 6.
- `tauri-plugin-single-instance` **routes** a second launch into the running
  instance (open a window) instead of refusing it.

This matters even for a developer audience: an app launched from Finder or the dock
has `cwd = /`, so the CLI's upward search for `.kandown/` finds nothing. Without a
picker the app cannot open anything at all.

### 3. Tauri 2.x is the wrapper stack.

Chosen over Electron (RAM), Wails (ecosystem), native Swift (single platform), Pake
(too shallow for a subprocess daemon). Mature, multi-OS, official auto-updater
plugin, native macOS notarization support.

### 4. macOS and Linux ship first. Windows is planned, not blocked on.

Windows code signing needs Azure Trusted Signing, which requires a legal entity with
three years of verifiable history. That is paperwork, not engineering, and it is
deferred. The Rust and TypeScript stay portable and the CI matrix keeps a Windows
build job so the target does not rot, but no signed Windows artefact is promised in
v1.

### 5. The webview loads `http://127.0.0.1:<port>/`, not `file://`.

The daemon serves the HTML and, after [[t281]], injects the auth token into it. The
webview is just a browser pointed at localhost. Re-implementing the API over a
`file://` origin would be a much larger change for no gain.

### 6. Settings are split by what they configure, not by which interface shows them.

| Kind | Location | Written by | Examples |
|---|---|---|---|
| Machine | `~/.kandown/desktop.json` | CLI and app | open mode, recents, window geometry, updater opt-out |
| Project / board | `.kandown/kandown.json` | unchanged, shared | theme, columns, extensions |

**The app never forks a board setting.** A board looks identical in the browser and
in the app, or hard rule #6 has been broken. And the machine store lives in
`~/.kandown/` (which already holds `project-state` and `.update-check.json`), not
in the Tauri config directory, because the CLI has to read the open mode and cannot
portably find a Tauri path. Details in [[t289]].

### 7. The terminal stays the primary entry point.

`kandown` in a terminal is how this audience opens a board (`src/cli/cli.ts:179`
calls `openBrowser` today). Once the app is installed, the CLI asks once whether to
open the app or the browser, remembers the answer, and honours `--app` / `--browser`
overrides. The dock icon is the secondary path, not the only one. [[t289]].

### 8. The daemon's own update machinery is disabled inside the app.

The CLI can update itself: `POST /api/update/apply` (`server.ts:239`) runs
`npm view` then a global install and restarts the daemon via `process.argv[1]`, and
`scheduleDaemonSelfUpgrade` watches the package on disk and restarts when it falls
behind. Inside a Tauri app both fight the Tauri updater and can restart a child
process out from under the window. The wrapper passes an environment variable that
turns both off; the update surface in the app is Tauri's.

## Architecture

```
kandown/
├── apps/
│   └── desktop/                          ← NEW. Tauri 2.x wrapper.
│       ├── src-tauri/
│       │   ├── Cargo.toml
│       │   ├── tauri.conf.json           ← window, bundle id, updater endpoint
│       │   ├── build.rs
│       │   ├── icons/
│       │   └── src/
│       │       ├── main.rs               ← entry, lifecycle, single-instance router
│       │       ├── projects.rs           ← recents store, folder picker, launcher
│       │       ├── daemon.rs             ← spawn system kandown, poll daemon.json
│       │       ├── menu.rs               ← native menu
│       │       └── updater.rs            ← Tauri updater wiring
│       ├── src/                          ← launcher webview (recents UI)
│       ├── package.json                  ← @kandown/desktop
│       └── README.md
├── .github/workflows/
│   ├── desktop-build.yml                 ← PR: compile macOS + Linux (+ Windows, unsigned)
│   └── desktop-release.yml               ← tag: notarize macOS, package Linux
└── pnpm-workspace.yaml                   ← packages: ['.', 'apps/*']
```

Note there is no `resources/` beyond icons, and no `node-runtime/`.

### Launch flow

1. `main.rs` starts, acquires the single-instance lock (routing mode).
2. `which kandown`. Not found: show the install screen and stop here.
3. Read the recents store from `~/.kandown/desktop.json`.
   - empty: native folder picker
   - one entry: open it directly
   - several: launcher window
4. For the chosen project, `daemon.rs` checks `.kandown/daemon.json` first. A live
   daemon (valid pid, answering `/api/daemon`) is **joined**, not replaced. Only if
   there is none does it spawn `kandown daemon start` with the project as cwd and
   the self-upgrade env var set to off.
5. Poll `<project>/.kandown/daemon.json` with a short backoff until `port` appears.
   Time out with a native error dialog that shows the daemon's stderr.
6. Create a window on `http://127.0.0.1:<port>/`.
7. On window close: `daemon.rs` stops that window's daemon and waits for the port
   to be released. Last window closed quits the app (macOS: stays in the dock).

## Slices

Ordered. Each is a separate task, each crosses the system end to end.

| Slice | Task | What it proves |
|---|---|---|
| 0 | [[t281]] | The daemon rejects unauthenticated calls (prerequisite, not desktop work) |
| Spike | [[t288]] | That any of this is worth building. Throwaway, go/no-go, blocks slice 1 |
| 1 | [[t282]] | The monorepo builds a Tauri app that opens a window on macOS and Linux |
| 2 | [[t283]] | Pick a folder, the daemon starts or is joined, the real board renders and writes to `tasks/*.md` |
| 3 | [[t284]] | Several projects open in parallel windows, clean shutdown, recents persist |
| 4 | [[t285]] | Native menu, dock and tray behave like a real app |
| 5 | [[t289]] | `kandown` in a terminal opens the app, and `kandown://` focuses a task |
| 6 | [[t286]] | The app updates itself from a GitHub release |
| 7 | [[t287]] | CI produces a notarized `.dmg` and a Linux `.deb` from a tag |

### Ship line

**v1 = t281, t288, t282, t283, t284, t285, t289, t287.** The app is not shippable
without a native menu (slice 4) or without the terminal entry point (slice 5): one
of them is what makes it an application rather than a bookmark, the other is how
anyone will actually open it.

**v1.1 = t286.** The auto-updater can follow. Until it ships, updates go through a
new download, which is acceptable for a pre-1.0 tool.

### Testing posture

Automated tests for the desktop shell are **deliberately deferred** until the
product is validated by hand. Slices carry manual acceptance criteria, not test
suites. `pnpm verify` keeps guarding the existing TypeScript surface; no Rust test
suite, no `cargo test` in the gate, until vava says the product is right. Revisit
before [[t287]] ships signed artefacts.

## Acceptance criteria (feature level)

- [ ] On a clean macOS 13+ machine **with kandown already installed globally**:
      open the `.dmg`, drag to Applications, launch, pick a folder, the board
      appears, drag and drop writes to `tasks/*.md`
- [ ] Same on Ubuntu 24.04 from the `.deb`
- [ ] With no `kandown` on `PATH`: a native screen with the install command, no
      crash, no blank window
- [ ] Two projects open in two windows at once, each on its own daemon and port
- [ ] A project whose daemon is already running from a terminal opens in the app
      without starting a second daemon
- [ ] `kandown` typed in a terminal opens the app once the mode is set to `app`
- [ ] `kandown://task/<id>?path=<project>` focuses the right window and task
- [ ] A board configured in the browser looks identical in the app, and the reverse
- [ ] Idle RSS ≤ 80 MB **counting the webview process and the Node daemon
      together**, on a board with 100 tasks
- [ ] `.dmg` ≤ 20 MB, `.deb` ≤ 20 MB (no embedded runtime, so this is the app plus
      icons)
- [ ] The app quits in under 500 ms after the last window closes, all daemon ports
      released
- [ ] Auto-updater round trip: install vN, publish vN+1 with a manifest, the app
      prompts and installs
- [ ] `pnpm verify` passes at the repo root with `apps/desktop/` present

## Out of scope

- **Bundling Node.js or the kandown CLI.** Decision 1.
- **Windows signed distribution.** Decision 4. Planned, deferred.
- **Auto-updating the user's `kandown` CLI.** That is npm's job, and decision 6
  turns the daemon's own updater off inside the app.
- **Mobile (iOS, Android).** Desktop-class UX on a phone is a separate product
  question.
- **Mac App Store.** Notarized `.dmg` is enough for v1.
- **Flatpak / Snap.** `.deb` first, `.AppImage` as a best effort.
- **Sandboxing and AppArmor profiles.** Tauri defaults, tuned later if needed.
- **Automated tests for the shell.** Deferred by decision, see "Testing posture".
- **A download page on kandown.dev and README distribution copy.** vava owns that,
  it is not part of building the app.
- **Deep links that mutate state.** `kandown://` reads and focuses only, see
  [[t289]].
- **Versioning the desktop app independently of kandown.** v1 shares the version
  number. Split later if the cadences diverge.

## Risks

- **WebKitGTK portability.** An `.AppImage` linked against `webkit2gtk-4.1` is
  notoriously not portable across distributions. `.deb` is the primary Linux
  artefact; the `.AppImage` ships as a best effort with no compatibility promise.
  Smoke test on Ubuntu 24.04 in CI.
- **Apple Developer account required.** Notarization needs a paid account
  (99 USD/year). Without it there is no shippable macOS artefact, only local dev
  builds. Confirm access before slice 6 starts.
- **Notarization latency.** First submission can take 5-15 minutes. Use
  `notarytool wait` with a 30 minute timeout in CI.
- **Version skew.** The app is a thin shell around whatever CLI the user has. A
  very old global kandown will serve a very old UI inside a new shell. Mitigation:
  the app reads `kandown --version` at launch and warns below a documented minimum.
- **Window and daemon lifecycle races.** Closing a window before the daemon reports
  its port must not orphan a process. Covered by slice 3.
- **BlockNote uses Shadow DOM.** Supported by WebKitGTK 4.1, but verify in the
  slice 2 smoke test rather than assuming.
- **three.js WebGL background** runs on the system GPU through the webview. No
  special configuration expected, but confirm it does not pin a core on Linux.

## Notes

- `kandown daemon start|stop|status` (`src/cli/commands/daemon.ts`) is the protocol
  the spawner talks to. No changes needed there.
- `src/cli/lib/server.ts` already binds to `127.0.0.1` (line 806) and picks a free
  port via `listenOnAvailablePort`. No changes needed beyond [[t281]].
- The `website/` folder is a self-contained sub-project with its own
  `pnpm-lock.yaml`. Folding it into the workspace is tracked elsewhere and is not a
  blocker here.
- **Reviewers**: standards review checks the Tauri config, the Rust, and the
  artefacts. Spec review checks the launch flow and the acceptance criteria above.
  Both block the final slice.
