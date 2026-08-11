// 📖 @file menu.rs: native menu bar, menu-action dispatch, and the shared menu-event handler.
// @description Owns every slice-4 menu concern: the menu tree (File / Edit /
// View / Help, plus macOS app submenu), the single dispatch mechanism every
// action uses (a Tauri event called `kandown://menu-action` carrying
// `{ action, payload? }`), and the menu-event closure that fires that event
// for web-UI actions and runs the Rust-side effect for window-level actions.
//
// 📖 Why one mechanism for all actions. The web UI has its own shortcuts
// (Cmd/Ctrl+K, N, /, R, Cmd+A, Cmd+1, Cmd+2). The menu mirrors those
// through `kandown://menu-action` so a power user can trigger the same
// thing from the menu bar without learning the shortcuts. The audit pass
// at the end of slice 4 records every web-UI shortcut and which menu item,
// if any, mirrors it; shortcuts the menu owns (Cmd+C/V/X/Z/A inside the
// rich editor, W to close the window, R to reload the webview) never
// reach the web UI.
//
// 📖 Edit-menu entries use OS-native `PredefinedMenuItem::cut` /
// `copy` / `paste` / `undo` / `redo` / `select_all`. On macOS the OS
// routes them directly to the focused webview; BlockNote gets Cmd+X/C/V/A
// for free. We do NOT synthesise a `KeyboardEvent` because that breaks
// IME, dead keys, and rich-text selections inside BlockNote's shadow DOM.
//
// 📖 Functions
//  → build_menu, construct the entire menu tree.
//  → install_menu, hand the menu to `app.set_menu` and register the
//     shared menu-event listener. Idempotent.
//  → MenuActionId, the typed enum the dispatch table matches on.
//  → handle_menu_event, the single dispatch site.
//
// 📖 Types
//  → MenuActionId, the wire-format identifier for every menu action
//  → MenuAction, the JSON payload the web UI receives
//  → MenuState, the shared handle to the most recently installed menu

use std::sync::Arc;

use parking_lot::Mutex;
use serde::Serialize;
use tauri::menu::{
    AboutMetadataBuilder, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tracing::{info, warn};

/// 📖 Identifier of every user-visible menu action. Wire format is the
/// variant name in lowercase; the web UI receives this exact value as
/// `payload.action`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuActionId {
    NewTask,
    OpenProject,
    OpenRecent,
    CloseWindow,
    Reload,
    ToggleFullscreen,
    ZoomIn,
    ZoomOut,
    ZoomReset,
    OpenDocs,
    OpenProjectFolder,
    RevealLog,
    ShowVersion,
}

impl MenuActionId {
    /// 📖 Stable wire string the web UI receives as `payload.action`.
    pub fn as_str(&self) -> &'static str {
        match self {
            MenuActionId::NewTask => "new-task",
            MenuActionId::OpenProject => "open-project",
            MenuActionId::OpenRecent => "open-recent",
            MenuActionId::CloseWindow => "close-window",
            MenuActionId::Reload => "reload",
            MenuActionId::ToggleFullscreen => "toggle-fullscreen",
            MenuActionId::ZoomIn => "zoom-in",
            MenuActionId::ZoomOut => "zoom-out",
            MenuActionId::ZoomReset => "zoom-reset",
            MenuActionId::OpenDocs => "open-docs",
            MenuActionId::OpenProjectFolder => "open-project-folder",
            MenuActionId::RevealLog => "reveal-log",
            MenuActionId::ShowVersion => "show-version",
        }
    }
}

/// 📖 Payload sent to the web UI on `kandown://menu-action`. `payload`
/// is opaque JSON, currently only used by `OpenRecent` to carry the
/// chosen path.
#[derive(Debug, Clone, Serialize)]
pub struct MenuAction {
    pub action: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
}

/// 📖 Shared handle to the most recent menu. Held on the AppHandle so
/// the dispatch site can rebuild the menu after a recents change
/// without losing the listener.
#[derive(Default, Clone)]
pub struct MenuState(pub Arc<Mutex<Option<Menu<Wry>>>>);

/// 📖 Build every submenu and return the app-wide menu. `kandown_version`
/// and `recent_paths` are passed in so the menu reflects state the rest
/// of the app already knows.
pub fn build_menu(
    app: &AppHandle<Wry>,
    kandown_version: Option<&str>,
    recent_paths: &[std::path::PathBuf],
) -> tauri::Result<Menu<Wry>> {
    let manager = app;

    let new_task = MenuItemBuilder::with_id("new-task", "New Task")
        .accelerator("CmdOrCtrl+N")
        .build(manager)?;
    let open_project = MenuItemBuilder::with_id("open-project", "Open Project…")
        .accelerator("CmdOrCtrl+O")
        .build(manager)?;
    let open_recent = build_open_recent_submenu(manager, recent_paths)?;
    let close_window = PredefinedMenuItem::close_window(manager, None)?;

    let file = SubmenuBuilder::new(manager, "File")
        .item(&new_task)
        .item(&open_project)
        .item(&open_recent)
        .separator()
        .item(&close_window)
        .build()?;

    let cut = PredefinedMenuItem::cut(manager, None)?;
    let copy = PredefinedMenuItem::copy(manager, None)?;
    let paste = PredefinedMenuItem::paste(manager, None)?;
    let select_all = PredefinedMenuItem::select_all(manager, None)?;
    let undo = PredefinedMenuItem::undo(manager, None)?;
    let redo = PredefinedMenuItem::redo(manager, None)?;

    let edit = SubmenuBuilder::new(manager, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .item(&select_all)
        .build()?;

    let reload = MenuItemBuilder::with_id("reload", "Reload Board")
        .accelerator("CmdOrCtrl+R")
        .build(manager)?;
    let toggle_fullscreen = MenuItemBuilder::with_id("toggle-fullscreen", "Toggle Full Screen")
        .accelerator("Ctrl+Cmd+F")
        .build(manager)?;
    let zoom_in = MenuItemBuilder::with_id("zoom-in", "Zoom In")
        .accelerator("CmdOrCtrl+=")
        .build(manager)?;
    let zoom_out = MenuItemBuilder::with_id("zoom-out", "Zoom Out")
        .accelerator("CmdOrCtrl+-")
        .build(manager)?;
    let zoom_reset = MenuItemBuilder::with_id("zoom-reset", "Actual Size")
        .accelerator("CmdOrCtrl+0")
        .build(manager)?;

    let view = SubmenuBuilder::new(manager, "View")
        .item(&reload)
        .separator()
        .item(&toggle_fullscreen)
        .separator()
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&zoom_reset)
        .build()?;

    let open_docs = MenuItemBuilder::with_id("open-docs", "Open Documentation").build(manager)?;
    let open_project_folder =
        MenuItemBuilder::with_id("open-project-folder", "Open Project Folder").build(manager)?;
    let reveal_log = MenuItemBuilder::with_id("reveal-log", "Reveal Log File").build(manager)?;
    let version_label = match kandown_version {
        Some(v) => format!("About kandown ({v})"),
        None => "About kandown".to_string(),
    };
    let show_version = MenuItemBuilder::with_id("show-version", &version_label).build(manager)?;

    let help = SubmenuBuilder::new(manager, "Help")
        .item(&open_docs)
        .item(&open_project_folder)
        .item(&reveal_log)
        .separator()
        .item(&show_version)
        .build()?;

    #[cfg(target_os = "macos")]
    let app_submenu = {
        let about = PredefinedMenuItem::about(
            manager,
            Some("About kandown"),
            Some(
                AboutMetadataBuilder::new()
                    .name(Some("kandown"))
                    .version(Some(env!("CARGO_PKG_VERSION")))
                    .build(),
            ),
        )?;
        let separator = PredefinedMenuItem::separator(manager)?;
        let quit = PredefinedMenuItem::quit(manager, None)?;
        SubmenuBuilder::new(manager, "kandown")
            .item(&about)
            .item(&separator)
            .item(&quit)
            .build()?
    };

    let mut menu_builder = MenuBuilder::new(manager);
    #[cfg(target_os = "macos")]
    {
        menu_builder = menu_builder.item(&app_submenu);
    }
    let menu = menu_builder.items(&[&file, &edit, &view, &help]).build()?;

    Ok(menu)
}

/// 📖 Build the "Open Recent" submenu. Each entry fires the
/// `kandown://menu-action` event with `action = "open-recent"` and the
/// path in `payload.path`. Up to 10 recents (per [[t285]]); older
/// entries are truncated.
fn build_open_recent_submenu<R: tauri::Runtime, M: Manager<R>>(
    manager: &M,
    recent_paths: &[std::path::PathBuf],
) -> tauri::Result<tauri::menu::Submenu<R>> {
    let submenu = SubmenuBuilder::new(manager, "Open Recent");
    let submenu = if recent_paths.is_empty() {
        let empty = MenuItemBuilder::with_id("open-recent-empty", "No Recent Projects")
            .enabled(false)
            .build(manager)?;
        submenu.item(&empty)
    } else {
        let truncated: Vec<&std::path::PathBuf> = recent_paths.iter().take(10).collect();
        let mut builder = submenu;
        for path in truncated {
            let id = recent_path_menu_id(path);
            let label = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string_lossy().to_string());
            let item = MenuItemBuilder::with_id(&id, &label).build(manager)?;
            builder = builder.item(&item);
        }
        builder
    };
    submenu.build()
}

/// 📖 Build a deterministic menu ID for an "Open Recent" entry. The ID
/// is the path hashed to a short hex string with a stable prefix so the
/// reverse lookup in `recent_path_from_menu_id` cannot collide with
/// non-recent IDs.
pub fn recent_path_menu_id(path: &std::path::Path) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    path.hash(&mut h);
    format!("recent-{:016x}", h.finish())
}

/// 📖 Reverse `recent_path_menu_id`. Returns `None` for non-recent IDs.
pub fn recent_path_from_menu_id(
    id: &str,
    recent_paths: &[std::path::PathBuf],
) -> Option<std::path::PathBuf> {
    if !id.starts_with("recent-") {
        return None;
    }
    let target_hash = &id["recent-".len()..];
    for path in recent_paths {
        let candidate = recent_path_menu_id(path);
        if candidate["recent-".len()..] == *target_hash {
            return Some(path.clone());
        }
    }
    None
}

/// 📖 Install the menu and the shared menu-event handler.
pub fn install_menu(app: &AppHandle<Wry>, menu: Menu<Wry>) -> tauri::Result<()> {
    info!("install_menu: setting app-wide menu");
    if let Err(e) = app.set_menu(menu.clone()) {
        warn!("could not set app-wide menu: {e}");
        return Err(e);
    }
    info!("install_menu: app-wide menu set");

    let recent_paths_for_handler = projects_recent_paths();
    let app_handle = app.clone();

    app.on_menu_event(move |_app, event| {
        let id_str = event.id().as_ref();
        handle_menu_event(&app_handle, id_str, &recent_paths_for_handler);
    });

    if let Some(state) = app.try_state::<MenuState>() {
        if let Some(mut guard) = state.0.try_lock() {
            *guard = Some(menu);
        }
    } else {
        warn!("MenuState not managed; menu rebuild will not be possible");
    }

    Ok(())
}

/// � Snapshot of the recents store, used by the menu handler to
/// resolve "Open Recent" IDs back to paths.
fn projects_recent_paths() -> Vec<std::path::PathBuf> {
    crate::projects::recent_paths()
}

/// 📖 Resolve a menu item ID to a typed `MenuActionId`. Returns `None`
/// for items the dispatch table does not handle (the predefined edit-
/// menu items are routed by the OS).
fn parse_action(id: &str) -> Option<MenuActionId> {
    Some(match id {
        "new-task" => MenuActionId::NewTask,
        "open-project" => MenuActionId::OpenProject,
        "open-recent" => MenuActionId::OpenRecent,
        "close-window" => MenuActionId::CloseWindow,
        "reload" => MenuActionId::Reload,
        "toggle-fullscreen" => MenuActionId::ToggleFullscreen,
        "zoom-in" => MenuActionId::ZoomIn,
        "zoom-out" => MenuActionId::ZoomOut,
        "zoom-reset" => MenuActionId::ZoomReset,
        "open-docs" => MenuActionId::OpenDocs,
        "open-project-folder" => MenuActionId::OpenProjectFolder,
        "reveal-log" => MenuActionId::RevealLog,
        "show-version" => MenuActionId::ShowVersion,
        _ => return None,
    })
}

/// 📖 The single dispatch site for every menu item. Web-UI actions emit
/// `kandown://menu-action` and let the JS side handle them; window-level
/// actions run their Rust effect directly.
pub fn handle_menu_event(
    app: &AppHandle<Wry>,
    id: &str,
    recent_paths: &[std::path::PathBuf],
) {
    if let Some(path) = recent_path_from_menu_id(id, recent_paths) {
        let payload = serde_json::json!({ "path": path.to_string_lossy() });
        emit_menu_action(app, MenuActionId::OpenRecent, Some(payload));
        return;
    }
    let Some(action) = parse_action(id) else {
        warn!("menu event with unknown id: {id}");
        return;
    };
    match action {
        MenuActionId::NewTask
        | MenuActionId::Reload
        | MenuActionId::OpenProject
        | MenuActionId::ToggleFullscreen
        | MenuActionId::ZoomIn
        | MenuActionId::ZoomOut
        | MenuActionId::ZoomReset => {
            emit_menu_action(app, action, None);
        }
        MenuActionId::CloseWindow => {
            run_close_window(app);
        }
        MenuActionId::OpenRecent => {
            if let Some(path) = recent_paths.first() {
                let payload = serde_json::json!({ "path": path.to_string_lossy() });
                emit_menu_action(app, MenuActionId::OpenRecent, Some(payload));
            }
        }
        MenuActionId::OpenDocs => {
            run_open_docs();
        }
        MenuActionId::OpenProjectFolder => {
            run_open_project_folder(app);
        }
        MenuActionId::RevealLog => {
            run_reveal_log();
        }
        MenuActionId::ShowVersion => {
            run_show_version(app);
        }
    }
}

/// 📖 Fire the `kandown://menu-action` event for the web UI to handle.
fn emit_menu_action(
    app: &AppHandle<Wry>,
    action: MenuActionId,
    payload: Option<serde_json::Value>,
) {
    let body = MenuAction { action: action.as_str(), payload };
    if let Err(e) = app.emit("kandown://menu-action", &body) {
        warn!("could not emit menu action {action:?}: {e}");
    } else {
        info!("menu action emitted: {action:?}");
    }
}

/// 📖 Close the focused window. The per-window `CloseRequested` handler
/// in `lib.rs` is responsible for daemon lifecycle.
fn run_close_window(app: &AppHandle<Wry>) {
    if let Some(window) = app.get_focused_window() {
        if let Err(e) = window.close() {
            warn!("could not close focused window: {e}");
        }
    } else if let Some(launcher) = app.get_webview_window(crate::LAUNCHER_LABEL) {
        if let Err(e) = launcher.close() {
            warn!("could not close launcher: {e}");
        }
    } else {
        warn!("close-window invoked but no window is focused and no launcher exists");
    }
}

/// 📖 Reveal `~/.kandown/desktop.log.<YYYY-MM-DD>` in the OS file
/// manager.
fn run_reveal_log() {
    let path = crate::logging::current_log_path();
    reveal_in_file_manager(&path);
}

/// 📖 Reveal the focused project window's folder. Falls back to the
/// first recents entry when invoked from the launcher.
fn run_open_project_folder(app: &AppHandle<Wry>) {
    let path = focused_project_path(app).unwrap_or_else(|| {
        crate::projects::recent_paths().into_iter().next().unwrap_or_default()
    });
    if path.as_os_str().is_empty() {
        warn!("open-project-folder invoked but no project is focused");
        return;
    }
    reveal_in_file_manager(&path);
}

/// 📖 Open https://kandown.dev/docs in the user's default browser.
fn run_open_docs() {
    if let Err(e) = open::that_detached("https://kandown.dev/docs") {
        warn!("could not open documentation URL: {e}");
    }
}

/// 📖 Show the wrapper + CLI version in a native dialog.
fn run_show_version(app: &AppHandle<Wry>) {
    use tauri_plugin_dialog::DialogExt;
    let cli = crate::daemon::locate_system_kandown()
        .ok()
        .and_then(|k| k.version)
        .unwrap_or_else(|| "unknown".to_string());
    let wrapper = env!("CARGO_PKG_VERSION").to_string();
    let body = format!(
        "kandown desktop wrapper: {wrapper}\nkandown CLI on PATH: {cli}\n\nThe desktop app is a thin shell around the CLI; the version that matters is the CLI. Use `npm i -g kandown` to upgrade."
    );
    let title = "About kandown";
    let _ = app
        .dialog()
        .message(body)
        .title(title)
        .show(|_| {});
}

/// 📖 Look up the project path for the focused window. Returns `None`
/// for the launcher (which has no project handle).
fn focused_project_path(app: &AppHandle<Wry>) -> Option<std::path::PathBuf> {
    let focused = app.get_focused_window()?;
    let label = focused.label();
    let state = app.try_state::<crate::ActiveDaemons>().ok()?;
    let guard = state.0.lock();
    guard.get(&label).map(|h| h.project_root.clone())
}

/// 📖 Open `path` in the OS file manager. Best effort: on failure we
/// log and return.
fn reveal_in_file_manager(path: &std::path::Path) {
    let result = platform_reveal(path);
    if let Err(e) = result {
        warn!("could not reveal {}: {e}", path.display());
    }
}

/// 📖 Platform-specific reveal. macOS uses `open -R` to highlight the
/// file in Finder; Windows uses `explorer.exe /select,`; Linux has no
/// portable "reveal" so we open the parent directory with `xdg-open`.
fn platform_reveal(path: &std::path::Path) -> Result<(), String> {
    use std::process::Command;
    if !path.exists() {
        return Err(format!("path no longer exists: {}", path.display()));
    }
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("open")
            .arg("-R")
            .arg(path)
            .output()
            .map_err(|e| format!("could not launch `open -R`: {e}"))?;
        if output.status.success() {
            return Ok(());
        }
        return Err(format!("`open -R` exited {:?}", output.status.code()));
    }
    #[cfg(target_os = "windows")]
    {
        let path_str = path.to_string_lossy().to_string();
        let output = Command::new("explorer.exe")
            .arg(format!("/select,{}", path_str))
            .output()
            .map_err(|e| format!("could not launch explorer.exe: {e}"))?;
        if output.status.success() {
            return Ok(());
        }
        return Err(format!("explorer.exe exited {:?}", output.status.code()));
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = path.parent().unwrap_or(std::path::Path::new("/"));
        let output = Command::new("xdg-open")
            .arg(parent)
            .output()
            .map_err(|e| format!("could not launch xdg-open: {e}"))?;
        if output.status.success() {
            return Ok(());
        }
        return Err(format!("xdg-open exited {:?}", output.status.code()));
    }
}
