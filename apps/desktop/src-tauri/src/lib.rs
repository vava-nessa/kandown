// 📖 @file lib.rs: Tauri 2 entry function and the desktop app's orchestration.
// @description Slice 1 opened a blank window and installed logging.
// Slice 2 wired the launch flow end to end:
//
//   1. Locate the system `kandown` CLI on PATH ([[t280]] Decision 1).
//   2. Read `~/.kandown/desktop.json` for `lastProject` (Decision 6).
//   3. If the CLI is missing, the bundled picker HTML renders an install
//      screen. Retry re-runs the locate step.
//   4. If a `lastProject` is known and its daemon is still alive, join it
//      and navigate the webview straight to `http://127.0.0.1:<port>/`
//      ([[t280]] Decision 5).
//   5. If no `lastProject`, the bundled picker HTML renders a folder
//      picker. The pick hands a path back through `cmd_pick_project`
//      and then `cmd_resolve_daemon`; on success the window is
//      navigated to the daemon URL.
//
// Slice 3 turns the single window into a multi-window launcher:
//
//   6. A "launcher" window lists every project in the recents store
//      (`projects.rs`); picks and clicks open a per-project window.
//   7. Each project window owns its `DaemonHandle`; closing that window
//      stops only the owned daemons, never a joined one.
//   8. `tauri-plugin-single-instance` routes a second launch into the
//      running instance (open a window) instead of refusing it
//      ([[t280]] Decision 2).
//   9. On cold start, recents are walked and stale daemons (dead PID,
//      port closed, /api/daemon unresponsive) get a `kandown daemon
//      stop --path <path>` to release their port.
//   10. macOS: closing the last window keeps the app in the dock and a
//       `RunEvent::Reopen` re-shows the launcher.
//
// 📖 All the actual daemon logic (locate, join, spawn, stop) lives in
// `daemon.rs`; this file is the Tauri-side glue that exposes Rust to
// the bundled picker and drives the webview through the result.
//
// 📖 The recents store lives in `~/.kandown/desktop.json`, **not** the
// Tauri app config directory ([[t280]] Decision 6, [[t289]] "settings
// split"). The CLI will read the same file in slice 7; a Tauri config
// path would not be portable enough for that.
//
// 📖 Decision 8: when we spawn the daemon ourselves, we set
// `KANDOWN_DAEMON_UPGRADED_TO=off` on the child. The CLI's
// `scheduleDaemonSelfUpgrade` reads that var to skip the restart
// (see `src/cli/lib/daemon.ts`); the Tauri updater owns the update
// surface inside the app.
//
// 📖 Tauri commands exposed to the webview
//  → cmd_kandown_installed, return whether `kandown` is on PATH and its version
//  → cmd_min_version_check, surface a non-blocking banner if below minimum
//  → cmd_pick_project, open the native folder picker via tauri-plugin-dialog
//  → cmd_get_last_project, legacy slice 2 field; returns Option<String>
//  → cmd_list_recent_projects, snapshot of the recents list, used by the launcher
//  → cmd_remove_recent_project, drop one entry by path
//  → cmd_resolve_daemon, join-or-spawn the daemon for a chosen project
//  → cmd_open_project_window, open a per-project window and route the URL in
//  → cmd_navigate_to, navigate the calling window to a daemon URL
//  → cmd_stop_daemon_for_window, stop the daemon for the calling window
//
// 📖 Internal modules
//  → logging, log file + panic hook (see `src/logging.rs`)
//  → daemon, locate / spawn / join / stop (see `src/daemon.rs`)
//  → projects, recents store at ~/.kandown/desktop.json (see `src/projects.rs`)
//  → menu, native menu bar + `kandown://menu-action` dispatch (see `src/menu.rs`)
//  → dock_badge, per-daemon SSE listener that updates the macOS dock
//     badge (see `src/dock_badge.rs`)
//  → window_state, per-project window geometry persistence
//     (see `src/window_state.rs`)

mod daemon;
mod dock_badge;
mod logging;
mod menu;
mod projects;
mod window_state;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};
use tracing::{error, info, warn};

use daemon::DaemonHandle;

/// 📖 Window label used for the launcher. Project windows get per-project
/// labels (e.g. `main-<hash>`). The launcher is the only one of its kind;
/// it stays open across project window opens and closes, and is the one
/// `RunEvent::Reopen` re-shows.
pub const LAUNCHER_LABEL: &str = "launcher";

/// 📖 Per-window daemon state. Keyed by `WebviewWindow::label()` so the
/// close handler can find the right handle and the single-instance router
/// can look up an existing window by project key. A `Mutex<HashMap>` is
/// fine for the scale we expect (a handful of windows tops); if a future
/// slice wants concurrent access patterns a `RwLock` would slot in here
/// without changing the call sites.
#[derive(Default)]
struct ActiveDaemons(Mutex<HashMap<String, DaemonHandle>>);

/// 📖 Path that a freshly-opened project window should auto-resolve on
/// load. The launcher places the entry just before creating the window;
/// the window's `main.ts` calls `cmd_consume_pending_resolve` on load
/// to fetch and clear it. The key is the window label so two windows
/// opened in rapid succession do not stomp on each other's paths.
#[derive(Default)]
struct PendingResolves(Mutex<HashMap<String, PathBuf>>);

/// 📖 What we hand to the bundled picker. A wrapper around `projects::ProjectEntry`
/// that keeps field names in camelCase (the file uses snake_case). The
/// `missing` flag surfaces folders that `prune_missing` has flagged.
#[derive(Debug, Serialize)]
struct ProjectEntryInfo {
    path: String,
    display_name: String,
    last_opened_at: u64,
    missing: bool,
}

impl From<projects::ProjectEntry> for ProjectEntryInfo {
    fn from(e: projects::ProjectEntry) -> Self {
        Self {
            path: e.path.to_string_lossy().to_string(),
            display_name: e.display_name,
            last_opened_at: e.last_opened_at,
            missing: e.missing,
        }
    }
}

/// 📖 Stable label suffix for a project path. Uses a short hash so the
/// label is bounded in length and safe to embed in capability names
/// (which forbid certain characters). Collision risk for ≤ ~10 windows
/// is functionally zero; on a collision we append a counter.
fn window_label_for_path(path: &std::path::Path, existing: &[String]) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    path.hash(&mut h);
    let base = format!("main-{:016x}", h.finish());

    if !existing.iter().any(|l| l == &base) {
        return base;
    }
    for i in 1..1000 {
        let candidate = format!("{base}-{i}");
        if !existing.iter().any(|l| l == &candidate) {
            return candidate;
        }
    }
    // 📖 Pathologically unlikely; fall back to a millisecond-suffixed
    // label so the app still works while we log it.
    warn!("could not find free window label slot for {}", path.display());
    format!("main-{:016x}-{}", h.finish(), projects::now_secs())
}

/// 📖 Find the existing window label for a given project path. Used by
/// the single-instance router so a second launch with the same project
/// focuses the existing window instead of opening a second one.
fn window_label_for_existing_path(
    app: &AppHandle,
    path: &std::path::Path,
) -> Option<String> {
    let windows = app.webview_windows();
    for (label, _) in windows.iter() {
        if let Some(handle) = project_path_from_window_label(app, label) {
            if handle == path.to_path_buf() {
                return Some(label.clone());
            }
        }
    }
    None
}

/// 📖 Reverse mapping: window label → project path. We persist the path
/// as a window label suffix in the launcher itself (via `extra_title` /
/// data URL state isn't reliable across navigations, so we stash it in
/// the manifest). For now, the simplest reliable mechanism is to keep
/// the mapping in the same `ActiveDaemons` map: a window's handle
/// carries `project_root`. This helper looks the handle up; it returns
/// `None` for the launcher window (which has no entry).
fn project_path_from_window_label(app: &AppHandle, label: &str) -> Option<PathBuf> {
    let state = app.try_state::<ActiveDaemons>()?;
    let guard = state.0.lock().ok()?;
    guard.get(label).map(|h| h.project_root.clone())
}

/// 📖 Open a window for the given project. If a window for the same path
/// already exists, focuses it instead. Returns the label.
fn open_or_focus_project_window(
    app: &AppHandle,
    project_path: &std::path::Path,
) -> Result<String, String> {
    // 📖 Already-open path: focus instead of duplicate. The window label
    // is the cache key; with slice 3's small scale (≤ ~5 windows) a
    // linear scan over the `ActiveDaemons` map is fast and simple.
    if let Some(existing) = window_label_for_existing_path(app, project_path) {
        if let Some(win) = app.get_webview_window(&existing) {
            let _ = win.unminimize();
            let _ = win.set_focus();
            info!("focusing existing window {existing} for {}", project_path.display());
            return Ok(existing);
        }
    }

    let existing_labels: Vec<String> = app
        .webview_windows()
        .keys()
        .cloned()
        .collect();
    let label = window_label_for_path(project_path, &existing_labels);

    info!("opening window {label} for {}", project_path.display());

    // 📖 Place the project path in `PendingResolves` so the new window's
    // `index.html` / `main.ts` picks it up on load and auto-resolves
    // the daemon. We do not pass the path through a URL query string
    // because the WebviewWindowBuilder API does not let us; this short-
    // lived map keeps the intent obvious and is wiped on consume.
    if let Some(pending) = app.try_state::<PendingResolves>() {
        if let Ok(mut guard) = pending.0.lock() {
            guard.insert(label.clone(), project_path.to_path_buf());
        }
    }

    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title(format!("kandown — {}", project_path.file_name().and_then(|s| s.to_str()).unwrap_or("project")))
        .inner_size(1200.0, 800.0)
        .resizable(true)
        .on_navigation(|_url| true)
        .build()
        .map_err(|e| format!("could not create window: {e}"))?;

    let _ = window;
    Ok(label)
}

/// 📖 Cold-start cleanup pass. Walk the recents list and for each entry
/// validate the per-project daemon with the same checks `getDaemonStatus`
/// uses: PID alive, port listening, /api/daemon answers with matching
/// project root. A stale daemon gets `kandown daemon stop --path <path>`
/// to release the port. We deliberately do NOT delete `daemon.json`
/// here: the CLI cleans up its own metadata on its next read.
fn cold_start_cleanup() {
    let candidates = projects::recent_paths();
    if candidates.is_empty() {
        return;
    }
    let kandown = match daemon::locate_system_kandown() {
        Ok(k) => k,
        Err(e) => {
            warn!("cold_start_cleanup: kandown not on PATH ({e}); skipping stale cleanup");
            return;
        }
    };

    for path in candidates {
        if !path.is_dir() {
            // 📖 Folder moved/deleted. The recents store's `missing`
            // flag is set by the launcher UI on read; we leave it for
            // the user to either re-create the path or remove the row.
            continue;
        }
        match daemon::validate_daemon_for_path(&path) {
            Ok(daemon::DaemonHealth::Live { port, pid }) => {
                info!(
                    "cold_start_cleanup: {} daemon is live on port {port} (pid {pid})",
                    path.display()
                );
            }
            Ok(daemon::DaemonHealth::NotRunning) => {
                info!(
                    "cold_start_cleanup: {} has no live daemon; nothing to do",
                    path.display()
                );
            }
            Ok(daemon::DaemonHealth::Stale { reason }) => {
                warn!(
                    "cold_start_cleanup: stale daemon for {} ({reason}); stopping",
                    path.display()
                );
                if let Err(e) = daemon::stop_daemon_for_path(&kandown.path, &path) {
                    warn!("could not stop stale daemon for {}: {e}", path.display());
                }
            }
            Err(e) => {
                warn!(
                    "cold_start_cleanup: validate error for {}: {e}",
                    path.display()
                );
            }
        }
    }

    // 📖 Touch the log so the user can confirm the cleanup ran in the
    // daily log file (see `logging.rs > current_log_path`).
    info!("cold_start_cleanup complete");
}

/// 📖 Tauri command: is `kandown` on PATH, and what version does it
/// report? The bundled picker calls this on load so it can route between
/// the install screen and the actual folder picker.
#[tauri::command]
fn cmd_kandown_installed() -> Result<KandownInstallInfo, String> {
    match daemon::locate_system_kandown() {
        Ok(found) => Ok(KandownInstallInfo {
            installed: true,
            version: found.version,
            path: Some(found.path.to_string_lossy().to_string()),
        }),
        Err(daemon::NotInstalled::NotOnPath) => Ok(KandownInstallInfo {
            installed: false,
            version: None,
            path: None,
        }),
        Err(e) => Err(e.to_string()),
    }
}

/// 📖 Shape returned to the JS picker. `installed: false` triggers the
/// install screen; `installed: true` triggers the picker / auto-resolve.
#[derive(Debug, Serialize)]
struct KandownInstallInfo {
    installed: bool,
    version: Option<String>,
    path: Option<String>,
}

/// 📖 Tauri command: open the native folder picker. The picker page
/// triggers this from a button click.
#[tauri::command]
async fn cmd_pick_project(app: AppHandle) -> Result<Option<String>, String> {
    match daemon::pick_project(app).await {
        Some(p) => Ok(Some(p.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

/// 📖 Tauri command: legacy slice 2 field. Returns the single most
/// recent project, mirroring slice 2 behaviour. Slice 3 also exposes
/// the full list via `cmd_list_recent_projects`.
#[tauri::command]
fn cmd_get_last_project() -> Result<Option<String>, String> {
    let config = projects::load();
    Ok(config.last_project.map(|p| p.to_string_lossy().to_string()))
}

/// 📖 Tauri command: pop the auto-resolve path placed by the launcher
/// when this window was opened. The window's `main.ts` calls this on
/// load; if a path comes back, the window is a project window and
/// auto-resolves. The launcher window sees `None` and switches to its
/// recents UI. Idempotent: a second call returns `None`.
#[tauri::command]
fn cmd_consume_pending_resolve(
    window: tauri::WebviewWindow,
    state: State<'_, PendingResolves>,
) -> Result<Option<String>, String> {
    let label = window.label().to_string();
    let mut guard = state.0.lock().map_err(|_| "pending resolves mutex poisoned")?;
    Ok(guard
        .remove(&label)
        .map(|p| p.to_string_lossy().to_string()))
}

/// 📖 Tauri command: list every known recents entry, greyed ones first
/// (so the UI can render them separately). Each entry is a JSON-friendly
/// `ProjectEntryInfo`. We re-read the file on every call so the JS side
/// always sees the current state.
#[tauri::command]
fn cmd_list_recent_projects() -> Result<Vec<ProjectEntryInfo>, String> {
    let mut entries = projects::recent_entries();
    // 📖 Surface missing folders without ever auto-deleting them. The
    // user clicks × to remove; the launcher just renders them greyed.
    let _changed = projects::prune_missing(&mut entries);
    // 📖 Don't persist `missing` here; the UI's remove button is the
    // only path that mutates the store on disk.
    Ok(entries.into_iter().map(ProjectEntryInfo::from).collect())
}

/// 📖 Tauri command: remove a recents entry by path. Best effort; a
/// non-existent path is treated as success (idempotent). Persistence
/// is best effort inside `projects::remove`.
#[tauri::command]
fn cmd_remove_recent_project(path: String) -> Result<(), String> {
    projects::remove(&PathBuf::from(path));
    Ok(())
}

/// 📖 Tauri command: resolve the daemon for the chosen project. Joins an
/// existing one if alive, otherwise runs `kandown init` (when the folder
/// is bare) and spawns `kandown daemon start`. Stores the resulting
/// handle in `ActiveDaemons` keyed by the calling window's label so
/// the window's `CloseRequested` handler can find it.
#[tauri::command]
fn cmd_resolve_daemon(
    app: AppHandle,
    window: tauri::WebviewWindow,
    project_path: String,
    state: State<'_, ActiveDaemons>,
) -> Result<DaemonInfo, String> {
    let project_root = PathBuf::from(&project_path);
    if !project_root.is_dir() {
        let msg = format!("not a directory: {project_path}");
        error!("{msg}");
        return Err(msg);
    }

    let kandown = daemon::locate_system_kandown().map_err(|e| {
        let msg = format!("kandown lookup failed: {e}");
        error!("{msg}");
        msg
    })?;
    let log_path = logging::current_log_path();

    let (handle, _owned) = daemon::resolve_daemon(&kandown.path, &project_root, &log_path)
        .map_err(|e| {
            let msg = format!("resolve_daemon failed: {e}");
            error!("{msg}");
            msg
        })?;

    // 📖 Update the recents store. `add_or_touch` is idempotent: an
    // existing entry gets its timestamp bumped and `missing` cleared.
    projects::add_or_touch(&project_root);

    // 📖 Track the handle under the calling window's label so close
    // handling knows whose daemon to stop.
    let label = window.label().to_string();
    if let Ok(mut guard) = state.0.lock() {
        // 📖 Drop any older handle that may have lived under this label,
        // so a stale owned daemon does not survive a re-resolve.
        if let Some(old) = guard.insert(label.clone(), handle.clone()) {
            if old.owned && old.port != handle.port {
                warn!(
                    "label {label} had an older handle on port {}; new handle is on port {}",
                    old.port, handle.port
                );
                let _ = daemon::stop_daemon_for_path(&kandown.path, &old.project_root);
            }
        }
    } else {
        warn!("active daemons mutex poisoned during resolve_daemon");
    }

    // 📖 Send the URL to the frontend so it can navigate. We use an event
    // because the window may already have rendered the picker HTML by
    // the time `resolve` returns; the JS event listener flips the page.
    let info = DaemonInfo::from(&handle);
    let _ = app.emit("kandown://daemon-ready", &info);

    Ok(info)
}

/// 📖 Tauri command: open a per-project window. Resolves the daemon
/// and navigates the new window to the daemon URL. Refuses to open a
/// second window for a project that already has one (focuses the
/// existing window instead — see `open_or_focus_project_window`).
#[tauri::command]
async fn cmd_open_project_window(
    app: AppHandle,
    project_path: String,
) -> Result<OpenProjectResult, String> {
    let project_root = PathBuf::from(&project_path);
    if !project_root.is_dir() {
        return Err(format!("not a directory: {project_path}"));
    }
    let label = open_or_focus_project_window(&app, &project_root)?;
    Ok(OpenProjectResult { label, focused: true })
}

/// 📖 Returned to the bundled picker so it knows which window it asked
/// us to open.
#[derive(Debug, Serialize)]
struct OpenProjectResult {
    label: String,
    focused: bool,
}

/// 📖 Tauri command: navigate the calling window to a URL. Used by the
/// JS picker once `cmd_resolve_daemon` (or the cold-start auto-resolve)
/// has produced a daemon handle.
#[tauri::command]
fn cmd_navigate_to(window: tauri::WebviewWindow, url: String) -> Result<(), String> {
    info!("navigating window {} to {url}", window.label());
    let parsed = url::Url::parse(&url).map_err(|e| format!("invalid url {url}: {e}"))?;
    window.navigate(parsed).map_err(|e| e.to_string())
}

/// 📖 Tauri command: minimum-version banner. Returns `true` when the
/// installed CLI is below `MINIMUM_KANDOWN_VERSION`.
#[tauri::command]
fn cmd_min_version_check() -> Result<MinVersionInfo, String> {
    let installed = daemon::locate_system_kandown()
        .ok()
        .and_then(|k| k.version)
        .unwrap_or_default();
    let below = daemon::below_minimum(&installed, daemon::MINIMUM_KANDOWN_VERSION);
    Ok(MinVersionInfo {
        installed,
        minimum: daemon::MINIMUM_KANDOWN_VERSION.to_string(),
        below,
    })
}

#[derive(Debug, Serialize)]
struct MinVersionInfo {
    installed: String,
    minimum: String,
    below: bool,
}

/// 📖 Payload for the JS side once the daemon is ready. Mirrors
/// `DaemonHandle` field for field, but with `String`s all the way down
/// so it round-trips through `serde_json` without surprises.
#[derive(Debug, Serialize, Clone)]
struct DaemonInfo {
    port: u16,
    token: Option<String>,
    pid: Option<u32>,
    owned: bool,
    project_root: String,
    url: String,
}

impl From<&daemon::DaemonHandle> for DaemonInfo {
    fn from(h: &daemon::DaemonHandle) -> Self {
        Self {
            port: h.port,
            token: h.token.clone(),
            pid: h.pid,
            owned: h.owned,
            project_root: h.project_root.to_string_lossy().to_string(),
            url: format!("http://127.0.0.1:{}/", h.port),
        }
    }
}

/// 📖 Tauri command: stop the daemon for the calling window. Looks up
/// the handle by window label; no-op if no handle is found. Triggers
/// `daemon::stop_daemon` only when the daemon is owned (never for a
/// joined one — the terminal-launched daemon must survive the close).
#[tauri::command]
fn cmd_stop_daemon_for_window(
    window: tauri::WebviewWindow,
    state: State<'_, ActiveDaemons>,
) -> Result<(), String> {
    let label = window.label().to_string();
    let handle = {
        let mut guard = state.0.lock().map_err(|_| "active daemons mutex poisoned")?;
        guard.remove(&label)
    };
    let Some(handle) = handle else {
        return Ok(());
    };
    if !handle.owned {
        info!(
            "window {label} closing; leaving joined daemon on port {} alone",
            handle.port
        );
        return Ok(());
    }
    let kandown = daemon::locate_system_kandown().map_err(|e| e.to_string())?;
    let _ = daemon::stop_daemon_for_path(&kandown.path, &handle.project_root);
    Ok(())
}

/// 📖 Build the Tauri app, install logging, register the dialog and
/// single-instance plugins, wire the navigation handler, hand control
/// to the OS event loop. Returns only on fatal error.
pub fn run() {
    let _log_guard = logging::init();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // 📖 Single instance: a second launch (CLI `kandown-desktop &` or
        // a dock click) routes into the running instance instead of
        // starting a second process. The closure below receives the new
        // instance's argv and cwd; we ignore cwd (it is `cwd = /` from
        // Finder) and look at argv[1..] for a project path. If argv
        // contains a directory that exists, open a window for it; if
        // argv is empty, just re-show the launcher (focus existing one
        // or create if first launch).
        .plugin(tauri_plugin_single_instance::init(|app, argv: Vec<String>, _cwd: String| {
            info!("second launch routed; argv = {:?}", argv);
            route_second_launch(app, &argv);
        }))
        .manage(ActiveDaemons::default())
        .manage(PendingResolves::default())
        .setup(|app| {
            // 📖 Cold-start cleanup: walk the recents list, stop stale
            // daemons so they do not pin a port we wanted to reuse. Best
            // effort; errors are logged and swallowed.
            cold_start_cleanup();

            // 📖 Always create the launcher window first. Recents are
            // shown there, never in a project window; the project
            // window is dedicated to the board.
            tauri::WebviewWindowBuilder::new(
                app,
                LAUNCHER_LABEL,
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("kandown")
            .inner_size(900.0, 640.0)
            .resizable(true)
            .on_navigation(|_url| true)
            .build()?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // 📖 Per-window daemon cleanup. The launcher window has
                // no handle in the map and stops cleanly; project
                // windows stop only their OWNED daemon.
                let label = window.label().to_string();
                if label == LAUNCHER_LABEL {
                    info!("launcher window closing");
                    return;
                }
                let app = window.app_handle();
                let Some(state) = app.try_state::<ActiveDaemons>() else {
                    return;
                };
                let Ok(mut guard) = state.0.lock() else {
                    error!("active daemons mutex poisoned during window close");
                    return;
                };
                let Some(handle) = guard.remove(&label) else {
                    return;
                };
                if !handle.owned {
                    info!(
                        "window {label} closing; leaving joined daemon on port {} alone",
                        handle.port
                    );
                    return;
                }
                drop(guard); // 📖 Drop the lock before the CLI spawn, which may block.
                match daemon::locate_system_kandown() {
                    Ok(kandown) => {
                        let _ = daemon::stop_daemon_for_path(&kandown.path, &handle.project_root);
                    }
                    Err(e) => {
                        warn!(
                            "owned daemon for {label} (port {}) but kandown CLI missing ({e}); cannot stop",
                            handle.port
                        );
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            cmd_kandown_installed,
            cmd_min_version_check,
            cmd_pick_project,
            cmd_get_last_project,
            cmd_consume_pending_resolve,
            cmd_list_recent_projects,
            cmd_remove_recent_project,
            cmd_resolve_daemon,
            cmd_open_project_window,
            cmd_navigate_to,
            cmd_stop_daemon_for_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // 📖 macOS dock-icon re-show: when the user clicks the dock icon
    // after closing all windows, `RunEvent::Reopen` fires. We bring the
    // launcher back; on Linux/Windows the launcher already lives in the
    // taskbar so this branch is silently ignored.
    app.run(|app_handle, event| {
        if let RunEvent::Reopen { .. } = event {
            if let Some(launcher) = app_handle.get_webview_window(LAUNCHER_LABEL) {
                let _ = launcher.show();
                let _ = launcher.unminimize();
                let _ = launcher.set_focus();
            } else {
                // 📖 No launcher (impossible until slice 4 adds the tray
                // close behaviour, but handle gracefully): rebuild it.
                if let Err(e) = tauri::WebviewWindowBuilder::new(
                    app_handle,
                    LAUNCHER_LABEL,
                    tauri::WebviewUrl::App("index.html".into()),
                )
                .title("kandown")
                .inner_size(900.0, 640.0)
                .resizable(true)
                .on_navigation(|_url| true)
                .build()
                {
                    warn!("could not rebuild launcher on Reopen: {e}");
                }
            }
        }
        // 📖 We do NOT intercept ExitRequested; closing the last window
        // on Linux/Windows quits the app, and on macOS the default is
        // to keep the process alive (signalled here by the absence of a
        // listener that sets `api.prevent_exit()`).
    });
}

/// 📖 Handle a second launch from the single-instance plugin. If the
/// argv carries a path we recognise, focus (or open) that project's
/// window. If argv is empty, focus the launcher.
fn route_second_launch(app: &AppHandle, argv: &[String]) {
    // 📖 Find a directory in argv; tolerates flags. We only treat
    // the path as a project if it exists as a directory right now;
    // passing a non-existent path is silently ignored so a CLI typo
    // does not crash the running instance.
    let candidate = argv
        .iter()
        .skip(1)
        .find(|arg| !arg.starts_with('-'))
        .map(PathBuf::from);
    if let Some(path) = candidate {
        if path.is_dir() {
            let _ = open_or_focus_project_window(app, &path);
            return;
        }
    }

    if let Some(launcher) = app.get_webview_window(LAUNCHER_LABEL) {
        let _ = launcher.show();
        let _ = launcher.unminimize();
        let _ = launcher.set_focus();
    } else {
        let _ = tauri::WebviewWindowBuilder::new(
            app,
            LAUNCHER_LABEL,
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("kandown")
        .inner_size(900.0, 640.0)
        .resizable(true)
        .on_navigation(|_url| true)
        .build();
    }
}

// 📖 Suppress the unused-import warning for DialogExt: bringing the
// trait into scope makes future slices that call `app.dialog()` from
// this file (rather than from `daemon.rs`) typecheck cleanly.
