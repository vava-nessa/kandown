// 📖 @file lib.rs: Tauri 2 entry function and the desktop app's orchestration.
// @description Slice 1 only opened a blank window and installed logging.
// Slice 2 wires the launch flow end to end:
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
// All the actual daemon logic (locate, join, spawn, stop) lives in
// `daemon.rs`; this file is the Tauri-side glue that exposes Rust to
// the bundled picker and drives the webview through the result.
//
// 📖 The `lastProject` persistence is intentionally tiny: project path
// only, no token, no PID, no port. The daemon's own `.kandown/daemon.json`
// is the source of truth for those. We re-resolve them every launch,
// which is what makes the "I quit the app, restarted my terminal,
// opened the app again" path work without bookkeeping in two places.
//
// 📖 Decision 8: when we spawn the daemon ourselves, we set
// `KANDOWN_DAEMON_UPGRADED_TO=off` on the child. The CLI's
// `scheduleDaemonSelfUpgrade` reads that var to skip the restart
// (see `src/cli/lib/daemon.ts`); the Tauri updater owns the update
// surface inside the app.
//
// 📖 Functions (top-level Tauri commands)
//  → cmd_kandown_installed, return whether `kandown` is on PATH and its version
//  → cmd_min_version_check, surface a non-blocking banner if below minimum
//  → cmd_pick_project, open the native folder picker via tauri-plugin-dialog
//  → cmd_resolve_daemon, join-or-spawn the daemon for a chosen project
//  → cmd_open_window_with_url, navigate the existing webview to the daemon URL
//  → cmd_stop_daemon, stop a daemon we own on window close
//
// 📖 Internal modules
//  → logging, log file + panic hook (see `src/logging.rs`)
//  → daemon, locate / spawn / join / stop (see `src/daemon.rs`)

mod daemon;
mod logging;

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tracing::{error, info, warn};

/// 📖 The single piece of state the app keeps about the daemon it last
/// resolved. Window-close handler reads it to decide whether to call
/// `daemon::stop_daemon`; nothing else writes to it.
#[derive(Default)]
struct ActiveDaemon(Mutex<Option<daemon::DaemonHandle>>);

/// 📖 Shape of `~/.kandown/desktop.json`. Single field for slice 2; slice 4
/// adds recents and window geometry. **Never** persist the daemon token
/// here: the daemon's `.kandown/daemon.json` is the source of truth, and
/// re-resolving on launch is cheap ([[t280]] Decision 6).
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct DesktopConfig {
    #[serde(default, rename = "lastProject")]
    last_project: Option<PathBuf>,
}

/// 📖 Resolve `~/.kandown/desktop.json`. We never fail if it is absent;
/// absence is the "first launch" signal.
fn read_desktop_config() -> DesktopConfig {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return DesktopConfig::default();
    };
    let path = home.join(".kandown").join("desktop.json");
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return DesktopConfig::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

/// 📖 Persist `~/.kandown/desktop.json`. Best effort: a failure here is
/// logged but never blocks the launch (the next launch will just fall
/// back to the picker).
fn write_desktop_config(config: &DesktopConfig) {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return;
    };
    let dir = home.join(".kandown");
    if let Err(e) = std::fs::create_dir_all(&dir) {
        warn!("could not create {}: {e}", dir.display());
        return;
    }
    let path = dir.join("desktop.json");
    let Ok(json) = serde_json::to_string_pretty(config) else {
        warn!("could not serialise desktop.json");
        return;
    };
    if let Err(e) = std::fs::write(&path, json) {
        warn!("could not write {}: {e}", path.display());
    }
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
/// triggers this from a button click; blocking the JS round-trip while
/// the dialog is open is fine because the dialog is modal on every
/// supported platform.
#[tauri::command]
async fn cmd_pick_project(app: AppHandle) -> Result<Option<String>, String> {
    match daemon::pick_project(app).await {
        Some(p) => Ok(Some(p.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

/// 📖 Tauri command: return the remembered project path, or `None` if
/// there is no remembered project. The bundled picker calls this on
/// load; if it gets a path back, it offers a "Reopen <path>" button that
/// runs the same resolve dance as a fresh pick, so a user who already
/// has a daemon running from a terminal can join it with one click
/// instead of navigating the picker to the same folder.
#[tauri::command]
fn cmd_get_last_project() -> Result<Option<String>, String> {
    let config = read_desktop_config();
    Ok(config.last_project.map(|p| p.to_string_lossy().to_string()))
}

/// 📖 Tauri command: resolve the daemon for the chosen project. Joins an
/// existing one if alive, otherwise runs `kandown init` (when the folder
/// is bare) and spawns `kandown daemon start`. Stores the resulting
/// handle in app state so `cmd_stop_daemon` can reach it on shutdown.
#[tauri::command]
fn cmd_resolve_daemon(
    app: AppHandle,
    project_path: String,
    state: State<'_, ActiveDaemon>,
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

    // 📖 Remember the project path on successful resolve. The next launch
    // will try to join the daemon for this path before falling back to
    // the picker.
    let config = DesktopConfig {
        last_project: Some(project_root.clone()),
    };
    write_desktop_config(&config);

    // 📖 Track the handle in app state. Window-close handler reads it.
    if let Ok(mut guard) = state.0.lock() {
        *guard = Some(handle.clone());
    } else {
        warn!("active daemon mutex was poisoned; replacing with fresh handle");
    }

    // 📖 Send the URL to the frontend so it can navigate. We use an event
    // because the window may already have rendered the picker HTML by
    // the time `resolve` returns; the JS event listener flips the page
    // and calls `cmd_open_window_with_url` to actually move the webview.
    let _ = app.emit("kandown://daemon-ready", &DaemonInfo::from(&handle));

    Ok(DaemonInfo::from(&handle))
}

/// 📖 Tauri command: navigate the existing webview to the daemon URL.
/// Used by the JS picker once the daemon handle arrives; we keep the
/// actual navigation on the Rust side so the JS side never has to hold
/// a webview reference.
#[tauri::command]
fn cmd_open_window_with_url(window: WebviewWindow, url: String) -> Result<(), String> {
    info!("navigating webview to {url}");
    let parsed = url::Url::parse(&url).map_err(|e| format!("invalid url {url}: {e}"))?;
    window.navigate(parsed).map_err(|e| e.to_string())
}

/// 📖 Tauri command: minimum-version banner. Returns `true` when the
/// installed CLI is below `MINIMUM_KANDOWN_VERSION`. The picker reads
/// this and shows a yellow banner.
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
#[derive(Debug, Serialize)]
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

/// 📖 Tauri command: stop the owned daemon. Window-close handler calls
/// this; we deliberately do nothing for joined daemons.
#[tauri::command]
fn cmd_stop_daemon(state: State<'_, ActiveDaemon>) -> Result<(), String> {
    let handle = match state.0.lock() {
        Ok(g) => g.clone(),
        Err(_) => return Err("active daemon mutex was poisoned".into()),
    };
    let Some(handle) = handle else {
        return Ok(());
    };
    let kandown = daemon::locate_system_kandown().map_err(|e| e.to_string())?;
    daemon::stop_daemon(&kandown.path, &handle);
    Ok(())
}

/// 📖 Build the Tauri app, install logging, register the dialog plugin,
/// wire the navigation handler, hand control to the OS event loop.
/// Returns only on fatal error.
pub fn run() {
    let _log_guard = logging::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ActiveDaemon::default())
        .setup(|app| {
            // 📖 The webview URL is decided at runtime: the bundled picker
            // for first launch / install screen, the daemon URL once a
            // project is resolved. We always build it with
            // `WebviewUrl::App("index.html")` here and let the JS side
            // call `cmd_open_window_with_url` to navigate.
            //
            // `on_navigation(|_| true)` keeps the per-window allow-list
            // permissive so the navigate to `http://127.0.0.1:<port>/`
            // is not blocked. See `t288.md > Carry-over > finding 1`.
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("kandown")
            .inner_size(1200.0, 800.0)
            .resizable(true)
            .on_navigation(|_url| true)
            .build()?;

            // 📖 Resolve the remembered project (if any) up front. We
            // log only; the JS picker decides whether to use it. The
            // actual `resolve_daemon` call happens once the user
            // confirms, because auto-launching the daemon on every
            // cold start would be a surprise when the user actually
            // wants to pick a different project.
            let config = read_desktop_config();
            if let Some(last) = &config.last_project {
                info!("remembered lastProject = {}", last.display());
            } else {
                info!("no remembered lastProject; picker will open");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // 📖 On window close, stop any daemon we own. Joined
                // daemons (started by the terminal) are left alone.
                let app = window.app_handle();
                if let Some(state) = app.try_state::<ActiveDaemon>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(handle) = guard.take() {
                            if handle.owned {
                                if let Ok(kandown) = daemon::locate_system_kandown() {
                                    daemon::stop_daemon(&kandown.path, &handle);
                                } else {
                                    warn!(
                                        "owned daemon on port {} but kandown CLI is gone; cannot stop",
                                        handle.port
                                    );
                                }
                            } else {
                                info!(
                                    "window closing; leaving joined daemon on port {} alone",
                                    handle.port
                                );
                            }
                        }
                    } else {
                        error!("active daemon mutex was poisoned during window close");
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            cmd_kandown_installed,
            cmd_min_version_check,
            cmd_pick_project,
            cmd_get_last_project,
            cmd_resolve_daemon,
            cmd_open_window_with_url,
            cmd_stop_daemon,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}