// 📖 @file window_state.rs: per-project window geometry persistence.
// @description Slice 4 closes the loop on "window comes back where you
// left it" by writing size, position, and display to `~/.kandown/
// desktop.json > windows` on every move/resize, then restoring them on
// the next launch.
//
// 📖 Why this lives in its own module: the persistence is debounced,
// lives in a `std::sync::mpsc::Receiver` loop, and has to interact
// with `tauri::WindowEvent::Resized` and `tauri::WindowEvent::Moved`.
// Putting it in `lib.rs` would have grown that file past the point
// where a reviewer can keep the whole flow in their head.
//
// 📖 Keying. The persistence key is the project path's canonicalised
// form (the same form `projects::add_or_touch` writes into the
// recents store), not the window label. Window labels are an
// internal Tauri detail that can change across launches; the path is
// stable. The launcher window has no project and is keyed under the
// literal string `LAUNCHER_LABEL`.
//
// 📖 Debouncing. `WindowEvent::Resized` and `WindowEvent::Moved` fire
// on every pixel of a drag. Writing the file on every event would
// burn CPU and disk for no benefit; a 250 ms debounce coalesces
// drag-end and resize-end writes into a single `desktop.json`
// rewrite.
//
// 📖 Bounds. The persisted size is clamped to `[800x600, 2400x1600]`
// before being applied on restore, so a tiny or huge monitor does not
// produce an unusable window on relaunch. Default size when no state
// exists is `1200x800`, the same value `lib.rs` uses for new project
// windows.
//
// 📖 Functions
//  → make_event_handler, returns a closure suitable for
//     `WebviewWindowBuilder::on_window_event`; saves geometry and
//     debounces the write.
//  → restore_window_state, applies persisted geometry to a window.
//  → persist_window_states, the immediate (non-debounced) write.
//
// 📖 Types
//  → WindowGeometry, the persisted shape (size, position, display)
//  → WindowEventSink, the shared debounce pump
//  → WindowStateMap, additive `desktop.json > windows` field

use std::collections::HashMap;
use std::path::Path;
use std::sync::mpsc::{self, Sender};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use tracing::{info, warn};

use crate::projects;

/// 📖 Persisted geometry for one window.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WindowGeometry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub maximised: bool,
}

fn is_false(b: &bool) -> bool {
    !*b
}

/// 📖 Bounds applied when restoring a window. `800x600` minimum, so
/// even on a tiny attached display the window stays draggable;
/// `2400x1600` maximum, so a 4K maximised window does not reopen at
/// unusable proportions on a 13" laptop. The numbers come from
/// [[t280]]'s "Bound the size" guidance.
pub const MIN_WIDTH: u32 = 800;
pub const MIN_HEIGHT: u32 = 600;
pub const MAX_WIDTH: u32 = 2400;
pub const MAX_HEIGHT: u32 = 1600;
pub const DEFAULT_WIDTH: u32 = 1200;
pub const DEFAULT_HEIGHT: u32 = 800;

/// 📖 Debounce delay for window-event persistence. 250 ms is the spec
/// value ([[t285]]): tight enough that the user perceives the
/// restored geometry as "remembered" after a quit-relaunch.
pub const DEBOUNCE_MS: u64 = 250;

/// 📖 Append-only patch of `projects::DesktopConfig`. We never replace
/// `projects::DesktopConfig` (slice 3 owns it); window state lives
/// under a separate, additive `windows` field so an old file loads
/// as "no remembered state" rather than refusing to launch.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WindowStateMap(pub HashMap<String, WindowGeometry>);

/// 📖 Read the persisted window map. Returns an empty map when no
/// state is on disk or the file is corrupt.
pub fn load_window_states() -> WindowStateMap {
    let raw = projects::load_raw_json();
    let Some(value) = raw else {
        return WindowStateMap::default();
    };
    match serde_json::from_value::<WindowStateMap>(
        value.get("windows").cloned().unwrap_or_default(),
    ) {
        Ok(map) => map,
        Err(e) => {
            warn!("windows field in desktop.json is invalid: {e}; ignoring");
            WindowStateMap::default()
        }
    }
}

/// 📖 Save a single window's geometry.
pub fn save_window_state(key: &str, geom: WindowGeometry) {
    let mut map = load_window_states();
    map.0.insert(key.to_string(), geom);
    persist_window_states(&map);
}

/// 📖 Save the entire window-state map.
pub fn persist_window_states(map: &WindowStateMap) {
    let config = projects::load();
    let mut raw_value = projects::load_raw_json().unwrap_or_else(|| {
        serde_json::json!({
            "lastProject": config.last_project.as_ref().map(|p| p.to_string_lossy().to_string()),
            "projects": config.projects,
        })
    });
    raw_value.as_object_mut().map(|obj| {
        obj.insert(
            "windows".to_string(),
            serde_json::to_value(map).unwrap_or(serde_json::json!({})),
        );
    });
    let Some(path) = projects::desktop_json_path() else {
        warn!("HOME not set; cannot persist window state");
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = match serde_json::to_string_pretty(&raw_value) {
        Ok(s) => s,
        Err(e) => {
            warn!("could not serialise desktop.json with window state: {e}");
            return;
        }
    };
    if let Err(e) = std::fs::write(&path, json) {
        warn!("could not write {}: {e}", path.display());
    }
}

/// 📖 Compute the persistence key for a window. The launcher window
/// uses `LAUNCHER_LABEL`; project windows use the canonicalised
/// project path so a renamed repo directory still resolves to the
/// same state.
pub fn key_for_window(window: &WebviewWindow) -> String {
    if window.label() == crate::LAUNCHER_LABEL {
        return crate::LAUNCHER_LABEL.to_string();
    }
    if let Some(state) = window.app_handle().try_state::<crate::ActiveDaemons>() {
        let guard = state.0.lock();
        if let Some(handle) = guard.get(window.label()) {
            return canonicalise_key(&handle.project_root);
        }
    }
    window.label().to_string()
}

/// 📖 Canonicalise the path for use as a persistence key.
pub fn canonicalise_key(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string()
}

/// � Compute the persistence key from a project path directly.
pub fn project_key(path: &Path) -> String {
    canonicalise_key(path)
}

/// 📖 Read the current geometry from a `WebviewWindow`.
pub fn current_geometry(window: &WebviewWindow) -> WindowGeometry {
    let size = window.inner_size().ok();
    let position = window.outer_position().ok();
    let maximised = window.is_maximized().unwrap_or(false);
    WindowGeometry {
        width: size.map(|s| s.width),
        height: size.map(|s| s.height),
        x: position.as_ref().map(|p| p.x),
        y: position.as_ref().map(|p| p.y),
        display: window
            .current_monitor()
            .ok()
            .flatten()
            .and_then(|m| m.name().cloned()),
        maximised,
    }
}

/// 📖 Apply persisted geometry to a window. Clamps the persisted
/// size to `MIN_WIDTH..MAX_WIDTH` and `MIN_HEIGHT..MAX_HEIGHT` so a
/// tiny or huge monitor does not produce an unusable window on
/// relaunch.
pub fn restore_window_state(window: &WebviewWindow) -> Option<WindowGeometry> {
    let key = key_for_window(window);
    let map = load_window_states();
    let geom = map.0.get(&key).cloned()?;
    if geom.maximised && geom.width.is_none() && geom.height.is_none() {
        if let Err(e) = window.maximize() {
            warn!("could not maximise {}: {e}", window.label());
        }
        return Some(WindowGeometry { maximised: true, ..WindowGeometry::default() });
    }
    if let (Some(w), Some(h)) = (geom.width, geom.height) {
        let w = w.clamp(MIN_WIDTH, MAX_WIDTH);
        let h = h.clamp(MIN_HEIGHT, MAX_HEIGHT);
        if let Err(e) = window.set_size(PhysicalSize::new(w, h)) {
            warn!("could not resize {} to {w}x{h}: {e}", window.label());
        }
    }
    if let (Some(x), Some(y)) = (geom.x, geom.y) {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let mon_pos = monitor.position();
            let mon_size = monitor.size();
            let max_x = mon_pos.x + mon_size.width as i32 - (MIN_WIDTH as i32) / 2;
            let max_y = mon_pos.y + mon_size.height as i32 - (MIN_HEIGHT as i32) / 2;
            let clamped_x = x.clamp(mon_pos.x - (MIN_WIDTH as i32) / 2, max_x);
            let clamped_y = y.clamp(mon_pos.y - (MIN_HEIGHT as i32) / 2, max_y);
            if let Err(e) = window.set_position(PhysicalPosition::new(clamped_x, clamped_y)) {
                warn!("could not reposition {}: {e}", window.label());
            }
        } else if let Err(e) = window.set_position(PhysicalPosition::new(x, y)) {
            warn!("could not reposition {}: {e}", window.label());
        }
    }
    info!(
        "restored window {} (key {key}): {geom:?}",
        window.label()
    );
    Some(geom)
}

/// 📖 The debounced event sink.
#[derive(Clone)]
pub struct WindowEventSink {
    sender: Sender<(String, WindowGeometry)>,
}

impl WindowEventSink {
    /// 📖 Spin up the background thread.
    pub fn spawn() -> Self {
        let (tx, rx) = mpsc::channel::<(String, WindowGeometry)>();
        thread::Builder::new()
            .name("kandown-window-state".to_string())
            .spawn(move || {
                let mut pending: HashMap<String, WindowGeometry> = HashMap::new();
                loop {
                    match rx.recv_timeout(Duration::from_millis(DEBOUNCE_MS)) {
                        Ok((key, geom)) => {
                            pending.insert(key, geom);
                            while let Ok((k, g)) = rx.try_recv() {
                                pending.insert(k, g);
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            if !pending.is_empty() {
                                persist_window_states(&WindowStateMap(std::mem::take(&mut pending)));
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Disconnected) => {
                            if !pending.is_empty() {
                                persist_window_states(&WindowStateMap(pending));
                            }
                            break;
                        }
                    }
                }
            })
            .expect("could not spawn window-state thread");
        Self { sender: tx }
    }

    /// 📖 Send a geometry update.
    pub fn send(&self, key: String, geom: WindowGeometry) {
        let _ = self.sender.send((key, geom));
    }
}

/// 📖 Build a closure suitable for `WebviewWindowBuilder::on_window_event`
/// that forwards `Resized` and `Moved` events into the sink.
pub fn make_event_handler(
    sink: WindowEventSink,
) -> Arc<dyn Fn(&tauri::Window, &tauri::WindowEvent) + Send + Sync> {
    let sink = Arc::new(sink);
    Arc::new(move |window, event| {
        if let tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) = event {
            if let Some(geom) = current_geometry_for(window) {
                let key = key_for_window_label(window.label());
                sink.send(key, geom);
            }
        }
    })
}

/// 📖 Same as `current_geometry` but takes a `tauri::Window`.
fn current_geometry_for(window: &tauri::Window) -> Option<WindowGeometry> {
    let size = window.inner_size().ok()?;
    let position = window.outer_position().ok()?;
    let maximised = window.is_maximized().unwrap_or(false);
    Some(WindowGeometry {
        width: Some(size.width),
        height: Some(size.height),
        x: Some(position.x),
        y: Some(position.y),
        display: window
            .current_monitor()
            .ok()
            .flatten()
            .and_then(|m| m.name().cloned()),
        maximised,
    })
}

/// 📖 Look up the persistence key from a window label.
fn key_for_window_label(label: &str) -> String {
    if label == crate::LAUNCHER_LABEL {
        return crate::LAUNCHER_LABEL.to_string();
    }
    label.to_string()
}

/// 📖 Convenience: drop the window state for one key.
pub fn forget_window_state(key: &str) {
    let mut map = load_window_states();
    if map.0.remove(key).is_some() {
        persist_window_states(&map);
    }
}

/// 📖 Public alias used by `lib.rs` when it constructs the sink.
pub fn new_sink() -> WindowEventSink {
    WindowEventSink::spawn()
}
