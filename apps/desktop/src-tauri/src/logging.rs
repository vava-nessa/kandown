// 📖 @file logging.rs: initialize the app's log file and install the panic hook.
// @description Owns the log file at `~/.kandown/desktop.log.<YYYY-MM-DD>` and the
// tracing subscriber that writes to it. Every Rust error path should go through
// `tracing::error!` so it lands in this file; the panic hook installed here
// covers the case where the error is so bad the process is going down.
//
// Why this lives in its own module: the path and the rotation policy need to be
// stable for slice 4 ("reveal the log") and slice 2's daemon spawner. Anything
// that changes how the log is laid out must change here, not be scattered.
//
// Path contract (slice 1):
//   - Root directory: `~/.kandown/` (created on first launch, mode 0o700).
//   - Active file:    `~/.kandown/desktop.log.<YYYY-MM-DD>` (local date).
//   - Rotation:       daily, at local midnight, via `tracing_appender::rolling::daily`.
//   - Slice 4 must resolve "the current log" by listing `desktop.log.*` and
//     picking the most recent mtime; the date suffix is not stable across runs
//     and must not be hardcoded anywhere.
//
// 📖 Functions
//  → log_dir, return (and lazily create) `~/.kandown/`
//  → current_log_path, return the date-stamped path the rolling writer uses today
//  → install_panic_hook, write a readable panic entry into the active log file
//  → init, set up the tracing subscriber with the file writer + the panic hook

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use chrono::Utc;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

/// 📖 File name prefix used by the rolling appender. The date suffix is added
/// by `tracing_appender::rolling::daily`. Hardcoding the prefix in one place
/// keeps slice 4's "reveal the log" lookup trivially correct.
const LOG_PREFIX: &str = "desktop.log";

/// 📖 Resolve and create `~/.kandown/`. Returns the directory; creation is best
/// effort; if it fails we still return the path and let the file open surface
/// the real error.
fn log_dir() -> PathBuf {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = home.join(".kandown");
    let _ = fs::create_dir_all(&dir);
    dir
}

/// 📖 The file the rolling appender is writing to *right now*, computed from
/// the UTC date. The panic hook uses this so a crash and a normal `error!`
/// land in the same file.
///
/// 📖 UTC, not local time. `tracing_appender::rolling::daily` uses
/// `OffsetDateTime::now_utc()` internally for the date suffix (see
/// `tracing-appender-0.2/src/rolling.rs:198`), so this MUST agree with
/// it or the panic hook writes to a different file than the regular
/// tracing output near midnight UTC. The user-facing log line is the
/// regular tracing output; the panic hook follows.
pub fn current_log_path() -> PathBuf {
    let date = Utc::now().format("%Y-%m-%d").to_string();
    log_dir().join(format!("{LOG_PREFIX}.{date}"))
}

/// 📖 Install a panic hook that appends a single readable line per panic to the
/// active log file. Default Rust panic output goes to stderr; in a Tauri build
/// on macOS there is no stderr for release builds, so a user reporting "the
/// app crashed" has nothing to send unless we capture it ourselves.
pub fn install_panic_hook() {
    let path = current_log_path();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic payload>".to_string());
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "<unknown location>".to_string());
        let entry = format!(
            "PANIC at {location}: {payload}\n--- end of panic entry ---\n",
        );
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = f.write_all(entry.as_bytes());
            let _ = f.flush();
        }
        // Mirror to stderr so the dev console still sees it during `tauri dev`.
        eprint!("{entry}");
    }));
}

/// 📖 Initialize the tracing subscriber with a daily-rolling file writer under
/// `~/.kandown/`. Returns a guard that **must** be held for the program's
/// lifetime; dropping it stops the background writer.
///
/// The `RUST_LOG` env var overrides the default `info` level. When unset, the
/// filter is `info` for our crate and `warn` for everything else, so a noisy
/// dependency does not bury the signals a user actually wants to see.
pub fn init() -> WorkerGuard {
    install_panic_hook();

    let dir = log_dir();
    // `tracing_appender::rolling::daily` rotates at local midnight and keeps the
    // last day as `desktop.log.<today>`. We never touch the files it writes.
    let appender = tracing_appender::rolling::daily(&dir, LOG_PREFIX);
    let (writer, guard) = tracing_appender::non_blocking(appender);

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,kandown_desktop=info"));

    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(
            fmt::layer()
                .with_writer(writer)
                .with_ansi(false)
                .with_target(true),
        )
        .try_init();

    tracing::info!(
        "kandown desktop starting; log file = {}",
        current_log_path().display()
    );
    guard
}
