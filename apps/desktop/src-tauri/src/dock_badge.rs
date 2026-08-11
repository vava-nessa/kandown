// 📖 @file dock_badge.rs: macOS dock badge showing the In Progress task count.
// @description Owns the slice-4 dock-badge plumbing:
//
//   1. For each project window the app owns, subscribe to the daemon's
//      SSE stream at `<daemon>/api/events?token=<auth>`.
//   2. On every `task` / `task_delete` / `board` / `config` event,
//      refetch `/api/config` (to know the column name for the
//      "active" role) and `/api/tasks/<id>` (to read the task's status).
//   3. Keep a global `HashMap<task_id, status>` cache; recompute the In
//      Progress count by intersecting the configured "active" column
//      name with the cached statuses.
//   4. On macOS, write the count to `Window::set_badge_label` for
//      every owned window; on Linux/Windows the badge is a silent
//      no-op.
//
// Why per-daemon rather than per-app: each project has its own daemon
// and its own column configuration. We aggregate across every project
// the app is managing so a user with three projects sees the union on
// the dock.
//
// 📖 Why a daemon-side SSE subscription rather than a web-side one.
// The webview already listens to the SSE stream and the store could
// push the count up. But (a) the webview cannot set the macOS dock
// badge, and (b) we want the badge to update even when the project's
// window is closed but the daemon is still alive.
//
// 📖 Functions
//  → spawn, start the per-daemon SSE listener for a handle
//  → BadgeCounter, the shared state
//  → install_for_app, install the platform badge-setter

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use parking_lot::Mutex;
use serde::Deserialize;
use tauri::{AppHandle, Wry};
use tracing::{info, warn};

use crate::daemon::DaemonHandle;

/// 📖 The shared, app-wide counter. Owns the cached task statuses and
/// the running count; the badge-setter closure is what writes the
/// dock badge on macOS.
#[derive(Clone)]
pub struct BadgeCounter {
    inner: Arc<Mutex<BadgeInner>>,
}

/// 📖 Inner state.
struct BadgeInner {
    task_statuses: HashMap<String, String>,
    column_names: HashMap<String, ColumnNames>,
    set_badge: Arc<dyn Fn(Option<String>) + Send + Sync>,
}

#[derive(Default, Debug, Clone, Deserialize)]
struct ColumnNames {
    #[serde(default)]
    active: Option<String>,
}

impl BadgeCounter {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(BadgeInner {
                task_statuses: HashMap::new(),
                column_names: HashMap::new(),
                set_badge: Arc::new(|_| {}),
            })),
        }
    }

    /// 📖 Replace the badge-setter. Called once during app setup with
    /// the macOS-aware setter that talks to
    /// `WebviewWindow::set_badge_label`.
    pub fn install_setter(&self, setter: impl Fn(Option<String>) + Send + Sync + 'static) {
        let mut guard = self.inner.lock();
        guard.set_badge = Arc::new(setter);
    }

    /// 📖 Snapshot of the current count. Used by tests.
    pub fn count(&self) -> usize {
        let guard = self.inner.lock();
        guard
            .task_statuses
            .values()
            .filter(|s| s_is_in_progress(s, &guard.column_names))
            .count()
    }

    /// 📖 Update the cached status for one task. `None` removes the
    /// task from the cache (used on `task_delete`).
    fn update_status(&self, task_id: &str, status: Option<String>) {
        let mut guard = self.inner.lock();
        match status {
            Some(s) => {
                guard.task_statuses.insert(task_id.to_string(), s);
            }
            None => {
                guard.task_statuses.remove(task_id);
            }
        }
        Self::rebadge(&guard);
    }

    /// � Replace the cached column names for one project.
    fn update_columns(&self, project_key: &str, columns: ColumnNames) {
        let mut guard = self.inner.lock();
        guard.column_names.insert(project_key.to_string(), columns);
        Self::rebadge(&guard);
    }

    /// 📖 Drop every cached entry that belongs to `project_key`. Used
    /// when a daemon is stopped so the badge does not overcount.
    pub fn forget_project(&self, project_key: &str) {
        let mut guard = self.inner.lock();
        guard.column_names.remove(project_key);
        Self::rebadge(&guard);
    }

    fn rebadge(inner: &BadgeInner) {
        let count = inner
            .task_statuses
            .values()
            .filter(|s| s_is_in_progress(s, &inner.column_names))
            .count();
        let label = if count == 0 { None } else { Some(count.to_string()) };
        (inner.set_badge)(label);
    }
}

impl Default for BadgeCounter {
    fn default() -> Self {
        Self::new()
    }
}

/// 📖 Decide whether a cached status string counts as "In Progress".
/// We accept the configured "active" column name from any project;
/// the badge aggregates across every project the app is managing.
fn s_is_in_progress(status: &str, columns: &HashMap<String, ColumnNames>) -> bool {
    if columns.is_empty() {
        return status == "In Progress";
    }
    columns.values().any(|c| {
        c.active
            .as_deref()
            .map(|a| a == status)
            .unwrap_or(false)
    })
}

/// 📖 Install the badge-setter on the AppHandle. On macOS we talk to
/// `WebviewWindow::set_badge_label` for every owned window; on
/// Linux/Windows the setter is a no-op so the counter still tracks
/// correctly for any future slice that surfaces it differently.
pub fn install_for_app(app: &AppHandle<Wry>) -> BadgeCounter {
    let counter = BadgeCounter::new();
    let counter_for_setter = counter.clone();

    #[cfg(target_os = "macos")]
    {
        let app_for_setter = app.clone();
        counter.install_setter(move |label| {
            for (_label, window) in app_for_setter.webview_windows() {
                if let Err(e) = window.set_badge_label(label.clone()) {
                    tracing::debug!("set_badge_label failed for a window: {e}");
                }
            }
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        counter.install_setter(|_| {});
    }

    counter_for_setter
}

/// 📖 Spawn the per-daemon SSE listener. One listener per
/// `DaemonHandle`; the listener updates the shared `BadgeCounter` on
/// every relevant event and exits when the daemon becomes
/// unreachable. Recovers from transient errors by sleeping a short
/// backoff and retrying.
///
/// 📖 Authentication: the daemon requires a token on `/api/events`
/// since [[t281]]. We pick the token up from `DaemonHandle.token`
/// when present; absent tokens are tolerated.
pub fn spawn(app: AppHandle<Wry>, handle: DaemonHandle, counter: BadgeCounter) {
    let url = format!("http://127.0.0.1:{}/api/events", handle.port);
    let token = handle.token.clone();
    let project_key = project_key_from_path(&handle.project_root);
    let port = handle.port;

    thread::Builder::new()
        .name(format!("kandown-badge-{port}"))
        .spawn(move || {
            info!("dock-badge listener: starting for port {port} ({project_key})");
            initial_refresh(&url, token.as_deref(), &counter, &project_key);
            loop {
                match run_session(&url, token.as_deref(), &counter, &project_key) {
                    SessionExit::Clean => {
                        info!("dock-badge listener: clean exit for port {port}");
                        break;
                    }
                    SessionExit::Recoverable(e) => {
                        warn!(
                            "dock-badge listener: session for port {port} ended ({e}); reconnecting"
                        );
                        thread::sleep(Duration::from_secs(2));
                    }
                }
            }
            counter.forget_project(&project_key);
        })
        .expect("could not spawn dock-badge listener thread");
}

enum SessionExit {
    Clean,
    Recoverable(String),
}

/// 📖 Initial fetch of `/api/config` and the task list. Runs once
/// before the SSE subscription so the badge is correct on a freshly
/// launched app that joined an already-running daemon.
fn initial_refresh(
    base_url: &str,
    token: Option<&str>,
    counter: &BadgeCounter,
    project_key: &str,
) {
    if let Some(columns) = fetch_columns(base_url, token) {
        counter.update_columns(project_key, columns);
    }
    let url = format!("{base_url}/api/tasks");
    let Some(task_ids) = fetch_task_ids(&url, token) else {
        return;
    };
    for task_id in task_ids {
        let task_url = format!("{base_url}/api/tasks/{task_id}");
        if let Some(status) = fetch_task_status(&task_url, token) {
            counter.update_status(&task_id, Some(status));
        }
    }
}

/// 📖 Drive a single SSE session.
fn run_session(
    base_url: &str,
    token: Option<&str>,
    counter: &BadgeCounter,
    project_key: &str,
) -> SessionExit {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpStream;

    let url = format!("{base_url}/api/events");
    let parsed = match url::Url::parse(&url) {
        Ok(p) => p,
        Err(e) => return SessionExit::Recoverable(format!("invalid url: {e}")),
    };
    let host = parsed.host_str().unwrap_or("127.0.0.1");
    let port = parsed.port_or_known_default().unwrap_or(80);
    let path = if let Some(q) = parsed.query() {
        format!("/api/events?{q}")
    } else {
        "/api/events".to_string()
    };

    let mut stream = match TcpStream::connect((host, port)) {
        Ok(s) => s,
        Err(e) => return SessionExit::Recoverable(format!("connect: {e}")),
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(60)));

    let mut request = String::new();
    request.push_str(&format!("GET {path} HTTP/1.1\r\n"));
    request.push_str(&format!("Host: {host}:{port}\r\n"));
    request.push_str("Accept: text/event-stream\r\n");
    request.push_str("Connection: keep-alive\r\n");
    request.push_str("\r\n");
    if let Err(e) = stream.write_all(request.as_bytes()) {
        return SessionExit::Recoverable(format!("write: {e}"));
    }

    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    if let Err(e) = reader.read_line(&mut status_line) {
        return SessionExit::Recoverable(format!("read status: {e}"));
    }
    if !status_line.contains(" 200 ") {
        return SessionExit::Recoverable(format!("unexpected status: {status_line}"));
    }
    loop {
        let mut header = String::new();
        match reader.read_line(&mut header) {
            Ok(0) => return SessionExit::Recoverable("eof in headers".to_string()),
            Ok(_) => {
                let trimmed = header.trim();
                if trimmed.is_empty() {
                    break;
                }
            }
            Err(e) => return SessionExit::Recoverable(format!("read header: {e}")),
        }
    }

    let mut data_buffer = String::new();
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => return SessionExit::Recoverable("eof in stream".to_string()),
            Ok(_) => {}
            Err(e) => {
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut
                {
                    continue;
                }
                return SessionExit::Recoverable(format!("read line: {e}"));
            }
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            if !data_buffer.is_empty() {
                handle_event(base_url, token, counter, project_key, &data_buffer);
                data_buffer.clear();
            }
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("data:") {
            data_buffer.push_str(rest.trim_start());
        }
    }
}

fn handle_event(
    base_url: &str,
    token: Option<&str>,
    counter: &BadgeCounter,
    project_key: &str,
    data: &str,
) {
    let parsed: serde_json::Value = match serde_json::from_str(data) {
        Ok(v) => v,
        Err(e) => {
            warn!("badge SSE: malformed payload: {e} ({data})");
            return;
        }
    };
    let event_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match event_type {
        "task" => {
            let Some(task_id) = parsed.get("id").and_then(|v| v.as_str()) else {
                return;
            };
            let url = format!("{base_url}/api/tasks/{task_id}");
            let status = fetch_task_status(&url, token).or_else(|| {
                thread::sleep(Duration::from_millis(80));
                fetch_task_status(&url, token)
            });
            if let Some(status) = status {
                counter.update_status(task_id, Some(status));
            } else {
                counter.update_status(task_id, None);
            }
        }
        "task_delete" => {
            if let Some(task_id) = parsed.get("id").and_then(|v| v.as_str()) {
                counter.update_status(task_id, None);
            }
        }
        "config" => {
            if let Some(columns) = fetch_columns(base_url, token) {
                counter.update_columns(project_key, columns);
                let url = format!("{base_url}/api/tasks");
                if let Some(task_ids) = fetch_task_ids(&url, token) {
                    for task_id in task_ids {
                        let task_url = format!("{base_url}/api/tasks/{task_id}");
                        if let Some(status) = fetch_task_status(&task_url, token) {
                            counter.update_status(&task_id, Some(status));
                        }
                    }
                }
            }
        }
        "board" | "extensions" | "themes" | "workflows" | "instructions" | "update" => {
            // 📖 No badge impact.
        }
        _ => {
            // 📖 Forward-compat.
        }
    }
}

fn fetch_columns(base_url: &str, token: Option<&str>) -> Option<ColumnNames> {
    let url = format!("{base_url}/api/config");
    let mut req = ureq::get(&url).timeout(Duration::from_millis(800));
    if let Some(t) = token {
        req = req.query("token", t);
    }
    let raw = match req.call() {
        Ok(r) => r,
        Err(_) => return None,
    };
    let value: serde_json::Value = match serde_json::from_reader(raw.into_reader()) {
        Ok(v) => v,
        Err(_) => return None,
    };
    let board = value.get("board")?;
    let column_meta = board.get("columnMeta");
    let active = column_meta
        .and_then(|m| m.as_object())
        .and_then(|obj| {
            obj.iter().find_map(|(name, meta)| {
                let role = meta.get("role").and_then(|r| r.as_str());
                if role == Some("active") {
                    Some(name.clone())
                } else {
                    None
                }
            })
        });
    let active = active.or_else(|| Some("In Progress".to_string()));
    Some(ColumnNames { active })
}

fn fetch_task_ids(base_url: &str, token: Option<&str>) -> Option<Vec<String>> {
    let mut req = ureq::get(base_url).timeout(Duration::from_millis(800));
    if let Some(t) = token {
        req = req.query("token", t);
    }
    let raw = match req.call() {
        Ok(r) => r,
        Err(_) => return None,
    };
    serde_json::from_reader(raw.into_reader()).ok()
}

fn fetch_task_status(url: &str, token: Option<&str>) -> Option<String> {
    let mut req = ureq::get(url).timeout(Duration::from_millis(800));
    if let Some(t) = token {
        req = req.query("token", t);
    }
    let raw = match req.call() {
        Ok(r) => r,
        Err(_) => return None,
    };
    let mut body = raw.into_reader();
    let mut text = String::new();
    if let Err(e) = std::io::Read::read_to_string(&mut body, &mut text) {
        warn!("badge SSE: could not read task body: {e}");
        return None;
    }
    let mut in_frontmatter = false;
    for line in text.lines() {
        if line.trim_start().starts_with("---") {
            if in_frontmatter {
                break;
            }
            in_frontmatter = true;
            continue;
        }
        if in_frontmatter {
            let stripped = line.trim_start();
            if let Some(rest) = stripped.strip_prefix("status:") {
                return Some(rest.trim().trim_matches('"').trim_matches('\'').to_string());
            }
        }
    }
    None
}

fn project_key_from_path(path: &PathBuf) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.clone())
        .to_string_lossy()
        .to_string()
}
