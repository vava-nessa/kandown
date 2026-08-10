// 📖 @file daemon.rs: spawn, validate, and stop the system `kandown` daemon.
// @description Owns the desktop app's only interface to the CLI: locating
// `kandown` on PATH, reading `kandown --version`, joining an existing per-
// project daemon (the **join-before-spawn** dance from [[t283]]), or
// spawning a fresh one. The webview then navigates to
// `http://127.0.0.1:<port>/`. Nothing in this module invents daemon logic:
// every verb (`init`, `daemon start`, `daemon stop`) is the exact CLI
// command, and the validation rules mirror `getDaemonStatus` and friends
// in `src/cli/lib/daemon.ts`.
//
// 📖 Ownership model. The CLI's daemon is per project: each `.kandown/`
// folder owns one metadata file (`daemon.json`) describing its PID, port,
// URL, project path, and (since M5) auth token. When the app opens a
// project that already has a live daemon (because the user typed
// `kandown` in a terminal and got it), we **join** that daemon and mark
// the handle as `owned = false`, so window close does not SIGTERM the
// process the terminal started. When we spawn the daemon ourselves, we
// own it: window close stops it.
//
// 📖 Decision 8: the daemon's own self-upgrade is disabled when we spawn
// it. The CLI restart dance (`src/cli/lib/daemon.ts > scheduleDaemonSelfUpgrade`)
// would fight the Tauri updater for ownership of the running binary. The
// environment variable `KANDOWN_DAEMON_UPGRADED_TO=off` carries the "I am
// already current" signal, so the inner upgrade timer treats the daemon
// as already-at-target and stays quiet. The Tauri updater owns the
// update surface.
//
// 📖 Functions
//  → locate_system_kandown — find `kandown` on PATH, read `--version`
//  → below_minimum — semver check for the version banner
//  → pick_project — open the native folder picker via tauri-plugin-dialog
//  → resolve_daemon — join-before-spawn; return a usable handle
//  → stop_daemon — owned daemons only; SIGTERM → SIGKILL with timeout
//  → ensure_kandown_installed — convenience wrapper for the command layer
//
// 📖 Types
//  → KandownPath, NotInstalled — locate_system_kandown's result
//  → DaemonHandle, DaemonError — the rest of the module's currency

use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// 📖 What we hand back when `kandown` is on PATH and answered `--version`.
#[derive(Debug, Clone)]
pub struct KandownPath {
    /// Absolute path to the `kandown` executable. Always set when this exists.
    pub path: PathBuf,
    /// Parsed version string, e.g. `0.49.0`. `None` if `--version` output was
    /// unparseable; the app keeps going but the version check is skipped.
    pub version: Option<String>,
}

/// 📖 Distinct error kind so the UI can map "no PATH binary" to the install
/// screen and "broken binary" to a different message, rather than treating
/// every failure as "kandown not installed".
#[derive(Debug, Clone)]
pub enum NotInstalled {
    /// `which kandown` returned `Err`. The user has no CLI at all.
    NotOnPath,
    /// `which` found something, but `--version` failed (broken wrapper,
    /// wrong architecture, permission denied on the binary itself).
    VersionCheckFailed(String),
    /// 📖 Kept for the version banner path; not constructed by the locate
    /// function in slice 2 (the banner is non-blocking and reports the
    /// installed version separately). Slice 3 may use it to refuse an
    /// auto-update against a too-old CLI.
    #[allow(dead_code)]
    VersionTooOld { installed: String, minimum: String },
}

impl std::fmt::Display for NotInstalled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NotInstalled::NotOnPath => f.write_str("kandown was not found on PATH"),
            NotInstalled::VersionCheckFailed(detail) => {
                write!(f, "kandown was found but `--version` failed: {detail}")
            }
            NotInstalled::VersionTooOld { installed, minimum } => write!(
                f,
                "kandown {installed} is below the minimum required version {minimum}"
            ),
        }
    }
}

impl std::error::Error for NotInstalled {}

/// 📖 Documented minimum version the shell wrapper requires to be safe. A
/// version below this triggers a non-blocking banner, not a hard refusal,
/// because the slice 2 acceptance criteria say "warn, do not block". The
/// threshold lines up with the daemon's M5 auth token requirement: any
/// CLI that predates M5 does not mint a token, and the shell would have to
/// talk to it without one.
pub const MINIMUM_KANDOWN_VERSION: &str = "0.42.0";

/// 📖 Find `kandown` on PATH and read its version. This is the first thing
/// the app does; if it fails, the rest of the flow is the install screen.
///
/// Implementation note: `which::which` does not shell out, it walks `PATH`
/// itself (the way the Unix `which(1)` utility did historically, but
/// without spawning a child process). This matters: a future slice that
/// runs on Windows will rely on the same lookup, and shelling out to a
/// `which.exe` would mean bundling or assuming one.
pub fn locate_system_kandown() -> Result<KandownPath, NotInstalled> {
    let path = match which::which("kandown") {
        Ok(p) => p,
        Err(_) => return Err(NotInstalled::NotOnPath),
    };

    // 📖 `--version` writes a single line and exits; we don't need its stdout
    // for control flow, only for the version banner check.
    let output = match Command::new(&path).arg("--version").output() {
        Ok(o) => o,
        Err(e) => return Err(NotInstalled::VersionCheckFailed(e.to_string())),
    };

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let version = if !stdout.is_empty() { stdout } else { stderr };

    // 📖 Split on whitespace and take the first token: kandown prints `0.49.0`
    // and nothing else, but if the user aliased it to a wrapper that prints
    // `kandown 0.49.0 (built ...)` we still pick the version. We never refuse
    // to launch on a parse error here; we just return `version: None`.
    let parsed = version.split_whitespace().next().map(|s| s.to_string());

    Ok(KandownPath { path, version: parsed })
}

/// 📖 Compare two semver strings, returning `true` when `installed` is
/// strictly older than `minimum`. Both sides are tolerated to be unparseable:
/// `true` (warn, do not block) is returned because the user can still use
/// the app, we just will not assert compatibility.
pub fn below_minimum(installed: &str, minimum: &str) -> bool {
    let Ok(installed) = semver::Version::parse(installed.trim_start_matches('v')) else {
        return true;
    };
    let Ok(minimum) = semver::Version::parse(minimum.trim_start_matches('v')) else {
        return false;
    };
    installed < minimum
}

/// 📖 Open the native folder picker. Returns the chosen directory, or
/// `None` if the user cancelled. Default start directory is `~/`; the OS
/// file dialog remembers the user's last position on its own, we do not.
///
/// `tauri-plugin-dialog` runs the picker on the main thread of the OS
/// process; calling it from the setup hook synchronously would block boot
/// forever, so this is invoked from a Tauri command (`cmd_pick_project`)
/// in response to a user click on the bundled picker page.
pub async fn pick_project(app: tauri::AppHandle) -> Option<PathBuf> {
    use tauri_plugin_dialog::DialogExt;

    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"));

    let (tx, rx) = mpsc::channel();
    app.dialog()
        .file()
        .set_title("Open kandown project")
        .set_directory(home)
        .pick_folder(move |maybe_path| {
            let _ = tx.send(maybe_path);
        });

    // 📖 The dialog plugin invokes the callback on its own thread; we
    // unwrap the FilePath back into a PathBuf here. A `None` here covers
    // "user cancelled" and "no filesystem access".
    match rx.recv() {
        Ok(Some(file_path)) => file_path.into_path().ok(),
        _ => None,
    }
}

/// 📖 The handle we carry around after `resolve_daemon` returns. The
/// webview reads `port` and `token` to construct its first fetch; the
/// stop path reads `pid` and `owned`.
#[derive(Debug, Clone, Serialize)]
pub struct DaemonHandle {
    pub port: u16,
    pub token: Option<String>,
    pub pid: Option<u32>,
    pub owned: bool,
    pub project_root: PathBuf,
}

/// 📖 Marked `owned = true` when we spawned the daemon ourselves, false
/// when we joined an existing one. Drop this distinction and the next
/// terminal-started daemon gets SIGKILLed by a window close.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Owned {
    Owned,
    Joined,
}

/// 📖 Possible failure modes for the daemon-lifecycle path. Each variant
/// carries enough context for the UI to render a useful message: the
/// `InitFailed` variant keeps the CLI's stderr verbatim.
#[derive(Debug, Clone)]
pub enum DaemonError {
    /// The user picked a directory that has no `.kandown/` and `kandown init`
    /// failed. The wrapper must surface this rather than silently retry.
    InitFailed(String),
    /// Spawned the daemon, but `.kandown/daemon.json` never appeared with a
    /// live PID and a free port. Distinct from `SpawnFailed` so the UI can
    /// show the child's tail-end log.
    DaemonNeverReported,
    /// `kandown daemon start` failed to launch at all (ENOENT, EACCES, etc.).
    SpawnFailed(String),
    /// `.kandown/daemon.json` is present but corrupted.
    BadMetadata(String),
}

impl std::fmt::Display for DaemonError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DaemonError::InitFailed(s) => write!(f, "kandown init failed: {s}"),
            DaemonError::DaemonNeverReported => f.write_str("daemon started but never reported a port"),
            DaemonError::SpawnFailed(s) => write!(f, "kandown daemon start failed: {s}"),
            DaemonError::BadMetadata(s) => write!(f, "invalid .kandown/daemon.json: {s}"),
        }
    }
}

impl std::error::Error for DaemonError {}

/// 📖 Shape of `.kandown/daemon.json`. Mirrors `DaemonMetadata` in the CLI
/// (`src/cli/lib/daemon.ts`), field for field. New fields can be added on
/// the CLI side without breaking the app: serde ignores unknowns.
#[derive(Debug, Clone, Deserialize)]
struct DaemonMetadata {
    pid: u32,
    port: u16,
    #[serde(default)]
    #[allow(dead_code)]
    url: Option<String>,
    #[serde(default, rename = "kandownDir")]
    #[allow(dead_code)]
    kandown_dir: Option<String>,
    #[serde(default, rename = "startedAt")]
    #[allow(dead_code)]
    started_at: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    version: Option<String>,
    /// 📖 Pre-M5 daemons do not have a token at all. Optional on read.
    #[serde(default)]
    token: Option<String>,
}

/// 📖 Shape of the daemon's `/api/daemon` response. The CLI's `parseRemoteDaemonInfo`
/// only reads `ok`, `pid`, `kandownDir`, `version`; we read the same fields and
/// silently ignore everything else.
#[derive(Debug, Deserialize)]
struct RemoteDaemonInfo {
    ok: bool,
    pid: u32,
    #[serde(rename = "kandownDir")]
    kandown_dir: String,
    #[allow(dead_code)]
    #[serde(default)]
    version: Option<String>,
}

/// 📖 Read and validate `<project_root>/daemon.json`. We never execute
/// anything here; this is just the deserialisation + presence check.
///
/// 📖 The metadata file lives at the project root, NOT inside a
/// `.kandown/` subfolder. `kandown init <path>` writes `kandown.json`
/// (and `daemon.json` after `daemon start`) directly at `<path>`. The
/// spec for [[t283]] says `.kandown/` because it referred to the legacy
/// layout; the CLI was updated to put the config at the project root,
/// and we mirror that here.
fn read_daemon_metadata(project_root: &Path) -> Result<Option<DaemonMetadata>, DaemonError> {
    let path = project_root.join("daemon.json");
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| DaemonError::BadMetadata(e.to_string()))?;
    let parsed: DaemonMetadata = serde_json::from_str(&raw).map_err(|e| DaemonError::BadMetadata(e.to_string()))?;
    Ok(Some(parsed))
}

/// 📖 Probe whether the daemon process is alive. `kill(pid, 0)` on Unix
/// returns success if the process exists and we have permission to signal
/// it; `ESRCH` means gone, `EPERM` means alive but ours-to-kill is denied.
/// On Windows the analogue is `OpenProcess`; we do not implement it here
/// (slice 1's scope is macOS + Linux), but the function returns `false`
/// instead of panicking so a future Windows port degrades to "always
/// spawn" rather than crashing.
#[cfg(unix)]
fn is_pid_alive(pid: u32) -> bool {
    // 📖 We use the system `kill` binary rather than `libc::kill` to avoid
    // pulling in a `libc` or `nix` dependency for one line of behaviour.
    // `kill -0 <pid>` is POSIX; it does not actually send a signal, it
    // returns success iff the PID is signalable.
    let status = Command::new("kill")
        .args(["-0", &pid.to_string()])
        .output();
    matches!(status, Ok(out) if out.status.success())
}

#[cfg(not(unix))]
fn is_pid_alive(_pid: u32) -> bool {
    // 📖 Windows path is for a future slice; on the development hosts
    // (macOS, Linux) we never reach this. Returning `false` is the safe
    // side of the dial: the join-before-spawn will then fall through to
    // "spawn a new daemon" rather than reuse a stale PID.
    false
}

/// 📖 Cheap TCP probe: "is anything listening on `127.0.0.1:<port>`?". A
/// 200 ms timeout is tight enough to keep the poller's cadence but loose
/// enough to ride out a daemon's start-up jitter.
fn is_port_listening(port: u16) -> bool {
    let addr = ("127.0.0.1", port);
    let addrs = match addr.to_socket_addrs() {
        Ok(it) => it,
        Err(_) => return false,
    };
    for a in addrs {
        if TcpStream::connect_timeout(&a, Duration::from_millis(200)).is_ok() {
            return true;
        }
    }
    false
}

/// 📖 Minimal HTTP/1.1 GET against `http://127.0.0.1:<port>/api/daemon`,
/// returning the parsed JSON. The daemon serves chunked transfer
/// encoding, so a hand-rolled `TcpStream` request needs to decode
/// chunks; that is more code than the whole probe is worth. `ureq` is
/// a tiny sync client (~120 KB compiled) and handles every edge of
/// HTTP/1.1 we need; the `default-features = false` flag trims it to
/// just TLS-less HTTP, which is all we talk to (loopback only).
fn probe_daemon_api(port: u16) -> Option<RemoteDaemonInfo> {
    let url = format!("http://127.0.0.1:{port}/api/daemon");
    let response = ureq::get(&url)
        .timeout(std::time::Duration::from_millis(800))
        .call()
        .ok()?;
    serde_json::from_reader(response.into_reader()).ok()
}

/// 📖 Try to **join** an existing daemon. Returns `Some(handle)` if all
/// checks pass: PID alive, port listening, `/api/daemon` answering with
/// matching `pid` + `kandown_dir`. Returns `None` if anything is off;
/// callers fall through to spawning a fresh daemon.
fn try_join(project_root: &Path) -> Option<DaemonHandle> {
    let metadata = match read_daemon_metadata(project_root) {
        Ok(Some(m)) => m,
        _ => return None,
    };
    if !is_pid_alive(metadata.pid) {
        info!(
            "stale daemon.json: pid {} not alive; will spawn a fresh daemon",
            metadata.pid
        );
        return None;
    }
    if !is_port_listening(metadata.port) {
        info!(
            "daemon pid {} alive but port {} not listening; will spawn a fresh daemon",
            metadata.pid, metadata.port
        );
        return None;
    }
    let remote = match probe_daemon_api(metadata.port) {
        Some(r) => r,
        None => {
            warn!(
                "daemon pid {} listening but /api/daemon did not answer cleanly; will spawn a fresh daemon",
                metadata.pid
            );
            return None;
        }
    };
    if !remote.ok {
        return None;
    }
    if remote.pid != metadata.pid {
        warn!(
            "PID mismatch: daemon.json says {} but /api/daemon reports {}; will spawn a fresh daemon",
            metadata.pid, remote.pid
        );
        return None;
    }
    // 📖 The daemon's reported `kandownDir` is the directory containing
    // `kandown.json` — NOT a `.kandown/` subfolder. `kandown init <path>`
    // writes `kandown.json` directly under `<path>`; the daemon mirrors
    // that path into its `daemon.json`. Comparing the absolute paths is
    // what stops us from "joining" a daemon that belongs to a different
    // project just because it happens to be alive on a free port.
    let expected_kandown_dir = project_root.to_string_lossy().to_string();
    if remote.kandown_dir != expected_kandown_dir {
        warn!(
            "kandownDir mismatch: expected {} got {}; will spawn a fresh daemon",
            expected_kandown_dir, remote.kandown_dir
        );
        return None;
    }
    Some(DaemonHandle {
        port: metadata.port,
        token: metadata.token,
        pid: Some(metadata.pid),
        owned: false,
        project_root: project_root.to_path_buf(),
    })
}

/// 📖 Run `kandown init` in the chosen directory. The CLI verb exists and
/// is the single source of truth for "create `.kandown/`"; we never write
/// the directory ourselves. The exit code determines success; stderr is
/// surfaced verbatim so a user can act on it.
fn run_kandown_init(kandown_bin: &Path, project_root: &Path) -> Result<(), DaemonError> {
    let output = Command::new(kandown_bin)
        .arg("init")
        .current_dir(project_root)
        .output()
        .map_err(|e| DaemonError::InitFailed(format!("could not launch `kandown init`: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        return Err(DaemonError::InitFailed(if detail.is_empty() {
            format!("exit status {:?}", output.status.code())
        } else {
            detail
        }));
    }
    Ok(())
}

/// 📖 Spawn `kandown daemon start` for the chosen project. The CLI
/// handles its own detachment (`spawn(..., { detached: true })` in
/// `startProjectDaemon`), so this call returns as soon as the daemon is
/// detached; the polling loop in `resolve_daemon` confirms the port
/// appears. `KANDOWN_DAEMON_UPGRADED_TO=off` disables the CLI's
/// self-upgrade timer per [[t280]] Decision 8: the value `off` is a
/// non-version string the timer ignores.
fn spawn_daemon(kandown_bin: &Path, project_root: &Path, log_path: &Path) -> Result<u32, DaemonError> {
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| DaemonError::SpawnFailed(format!("could not open log file: {e}")))?;
    let log_file_err = log_file.try_clone().map_err(|e| DaemonError::SpawnFailed(format!("clone log file: {e}")))?;

    let mut child = Command::new(kandown_bin)
        .args(["daemon", "start", "--path"])
        .arg(project_root)
        .current_dir(project_root)
        .env("KANDOWN_DAEMON_UPGRADED_TO", "off")
        .env("KANDOWN_DAEMON", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_file_err))
        .spawn()
        .map_err(|e| DaemonError::SpawnFailed(e.to_string()))?;
    let pid = child.id();

    // 📖 `daemon start` is supposed to detach and exit. If it exits non-zero
    // within the first 200 ms we surface that as a typed error instead of
    // letting the poller spin until the timeout.
    let poll_deadline = Instant::now() + Duration::from_millis(200);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return Err(DaemonError::SpawnFailed(format!(
                        "kandown daemon start exited with {:?} before detaching",
                        status.code()
                    )));
                }
                break;
            }
            Ok(None) => {
                if Instant::now() >= poll_deadline { break; }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(e) => return Err(DaemonError::SpawnFailed(format!("try_wait failed: {e}"))),
        }
    }

    Ok(pid)
}

/// 📖 Poll `.kandown/daemon.json` until it shows up with a live PID on a
/// listening port. 200 ms backoff, ~10 s budget, same order of magnitude
/// as the CLI's `waitForDaemon` (8 s, 120 ms backoff). We bias slightly
/// longer because `daemon start` may take a moment to fork the real
/// daemon and write its own metadata file.
fn poll_for_metadata(project_root: &Path, budget: Duration) -> Option<DaemonHandle> {
    let deadline = Instant::now() + budget;
    loop {
        if let Ok(Some(m)) = read_daemon_metadata(project_root) {
            if is_pid_alive(m.pid) && is_port_listening(m.port) {
                return Some(DaemonHandle {
                    port: m.port,
                    token: m.token,
                    pid: Some(m.pid),
                    owned: true,
                    project_root: project_root.to_path_buf(),
                });
            }
        }
        if Instant::now() >= deadline {
            return None;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// 📖 Top-level: locate the daemon for `project_root`. Tries `try_join`
/// first (the user's terminal might already be running it), then runs
/// `kandown init` if the directory is bare, then spawns and polls.
///
/// `kandown_bin` is passed in rather than re-located, because the caller
/// (the Tauri command) has already done `locate_system_kandown` and owns
/// the `KandownPath`. The locate error is mapped to a `NotInstalled`
/// value upstream; this function never returns it.
pub fn resolve_daemon(
    kandown_bin: &Path,
    project_root: &Path,
    log_path: &Path,
) -> Result<(DaemonHandle, Owned), DaemonError> {
    // 📖 Step 1: join-before-spawn. A terminal-launched daemon wins.
    if let Some(handle) = try_join(project_root) {
        info!(
            "joined existing daemon on port {} (pid {:?})",
            handle.port, handle.pid
        );
        return Ok((handle, Owned::Joined));
    }
    // 📖 Step 2: `kandown.json` missing? The chosen folder is not yet a
    // project, so run `kandown init` to materialise one. The marker is
    // `kandown.json` at the project root, NOT a `.kandown/` subfolder
    // (the CLI writes both `kandown.json` and `daemon.json` directly at
    // the root; see `src/cli/lib/init.ts > doInit`).
    if !project_root.join("kandown.json").exists() {
        run_kandown_init(kandown_bin, project_root)?;
        info!("ran `kandown init` in {}", project_root.display());
    }
    // 📖 Step 3: spawn. We own this one.
    let child_pid = spawn_daemon(kandown_bin, project_root, log_path)?;
    info!(
        "spawned kandown daemon (parent pid {}); polling for metadata",
        child_pid
    );

    // 📖 Step 4: poll until the daemon reports its port, or we run out of
    // patience. 10 s is generous; on a fast laptop the daemon is up in
    // well under a second.
    let budget = Duration::from_secs(10);
    let handle = poll_for_metadata(project_root, budget)
        .ok_or(DaemonError::DaemonNeverReported)?;
    Ok((handle, Owned::Owned))
}

/// 📖 Stop a daemon we own. No-op when `owned = false` (we joined it,
/// the user still wants it). For owned daemons, use the CLI's
/// `kandown daemon stop` for the polite path; fall back to a SIGTERM,
/// then SIGKILL, against the recorded PID if the CLI is slow or
/// uncooperative. 2.5 s budget matches the CLI's own stop path.
pub fn stop_daemon(kandown_bin: &Path, handle: &DaemonHandle) {
    if !handle.owned {
        info!(
            "not stopping daemon on port {}: owned by another process",
            handle.port
        );
        return;
    }
    let pid = match handle.pid {
        Some(p) => p,
        None => {
            warn!("owned daemon has no recorded PID; cannot stop");
            return;
        }
    };
    let project_root = &handle.project_root;

    info!("stopping daemon pid {pid} via `kandown daemon stop`");
    let cli_stop = Command::new(kandown_bin)
        .args(["daemon", "stop", "--path"])
        .arg(project_root)
        .output();
    match cli_stop {
        Ok(out) if out.status.success() => {
            // 📖 The CLI wrote nothing useful here on success; trust it
            // and poll the port to confirm release.
        }
        Ok(out) => {
            warn!(
                "kandown daemon stop returned non-zero (exit {:?}); falling back to signals",
                out.status.code()
            );
            signal_fallback(pid);
        }
        Err(e) => {
            warn!("kandown daemon stop failed to launch ({e}); falling back to signals");
            signal_fallback(pid);
        }
    }

    // 📖 Confirm the port actually released. If something is still
    // listening after 2.5 s, the fallback SIGKILL already fired;
    // nothing more to do here.
    let deadline = Instant::now() + Duration::from_millis(2500);
    while Instant::now() < deadline {
        if !is_port_listening(handle.port) {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    warn!(
        "daemon pid {pid} still appears to be listening on port {} after stop",
        handle.port
    );
}

/// 📖 SIGTERM, wait, SIGKILL. Same shape as `stopProjectDaemon` in
/// `src/cli/lib/daemon.ts`, with the same 2.5 s budget.
fn signal_fallback(pid: u32) {
    #[cfg(unix)]
    {
        let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).output();
        let deadline = Instant::now() + Duration::from_millis(2500);
        while Instant::now() < deadline {
            if !is_pid_alive(pid) { return; }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = Command::new("kill").args(["-KILL", &pid.to_string()]).output();
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
    }
}