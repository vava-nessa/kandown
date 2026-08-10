# @kandown/desktop

Tauri 2.x wrapper around the system `kandown` CLI. Slice 1 only proves the
toolchain: opens a blank window on macOS and Linux, configures the navigation
handler so slice 2 can point the webview at a `127.0.0.1` daemon URL, and
writes a daily-rotating log file under `~/.kandown/`.

See [[t280]] for the full feature spec, [[t282]] for this slice.

## Prerequisites

The package is a regular `pnpm` workspace member; everything below is what
**Rust** needs on top of the normal JS toolchain.

| Platform | What to install |
|---|---|
| All | Rust 1.77+ via [rustup](https://rustup.rs/). `cargo --version` must work in the shell that runs `pnpm`. |
| macOS | Xcode Command Line Tools (`xcode-select --install`). Apple Silicon and Intel are both supported. Notarisation needs a paid Apple Developer account; that is [[t287]]. |
| Linux | `webkit2gtk-4.1`, `libsoup-3.0`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`. On Ubuntu 24.04: `sudo apt install libwebkit2gtk-4.1-dev libsoup-3.0-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`. Other distributions: see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). |
| Windows | WebView2 (preinstalled on Windows 10/11) plus Visual Studio Build Tools. Not signed for v1; see [[t280]] Decisions 4. |

You also need a global `kandown` on `PATH` (`npm i -g kandown`) when slice 2
lands. Slice 1 does not shell out to anything.

## Commands

Run from the repo root (`/Users/vava/Documents/GitHub/kandown`):

```bash
pnpm install                   # once; installs the @tauri-apps/cli devDep
pnpm --filter @kandown/desktop dev      # opens a blank window, watch mode
pnpm --filter @kandown/desktop build    # produces a native bundle
```

`dev` opens a blank Tauri window pointed at `apps/desktop/src/index.html`. The
window will be empty white until slice 2 wires the daemon. `build` produces,
on macOS, `apps/desktop/src-tauri/target/release/bundle/macos/kandown.app`,
and on Linux, `apps/desktop/src-tauri/target/release/bundle/deb/*.deb` (and
an `.AppImage` best-effort).

## Layout

```
apps/desktop/
├── package.json              ← @kandown/desktop, version tracks root
├── tsconfig.json
├── README.md
├── src/                      ← placeholder webview (blank HTML + 3-line TS)
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json       ← window, bundle id, frontendDist
    ├── capabilities/
    │   └── default.json      ← Tauri 2 permissions; empty for the spike
    ├── icons/                ← Tauri default placeholder icons
    └── src/
        ├── main.rs           ← one-line entry
        ├── lib.rs            ← tauri::Builder + WebviewWindowBuilder::on_navigation(|_| true)
        └── logging.rs        ← tracing + daily-rolling file + panic hook
```

## Log file

Every Rust error path writes to a tracing subscriber that targets:

```
~/.kandown/desktop.log.<YYYY-MM-DD>     (local date)
```

Rotated daily at local midnight by `tracing_appender::rolling::daily`. The
panic hook installed at startup also appends to the same file, so a crash
during slice 1 leaves a readable `PANIC at <file>:<line>: <payload>` line that
slice 4's "reveal the log" menu item can find by listing `~/.kandown/desktop.log.*`
and picking the most recent mtime. Do not hardcode the date suffix; it
changes every midnight.

`RUST_LOG=debug` (or any other `tracing` filter expression) overrides the
default `info,kandown_desktop=info` level during dev.

## What slice 1 does *not* do yet

- No folder picker, no recents store, no daemon spawn (slice 2).
- No multi-window support, no clean shutdown per-project (slice 3).
- No native menu, no dock/tray (slice 4).
- No terminal hand-off (`kandown` -> app) (slice 5).
- No auto-updater (slice 6).
- No signed CI artefact (slice 7).
