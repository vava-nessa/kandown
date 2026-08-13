// 📖 @file projects.rs: recents store for the desktop launcher.
// @description Owns the slice 3 schema for `~/.kandown/desktop.json`. Slice 2
// only wrote `lastProject`; slice 3 introduces a parallel `projects` array
// holding every folder the user opened recently. Slice 7 ([[t289]]) will add
// `openMode` and other machine-level settings to the same file; the fields
// here are intentionally additive (`#[serde(default)]`) so older files load
// without rewriting.
//
// Why this lives in `~/.kandown/`, not in the Tauri app config directory
// ([[t280]] Decision 6 / [[t289]] "settings split"): the CLI has to be able
// to read the open mode later, and a Tauri config path is not portable. The
// store is also kept off `.kandown/kandown.json` (the project board file)
// because recents are machine state, not board state; writing them into
// per-project metadata would be hard rule #6 broken.
//
// 📖 Lifecycle
//  → load at startup, surface to the bundled picker as a JS-friendly list
//  → add_or_touch on every successful `cmd_resolve_daemon`
//  → remove when the user clicks the small × next to a missing entry
//  → save() is best-effort; failures log and never block the launch
//
// 📖 Functions
//  → load, read the JSON file, default to empty on absence or parse error
//  → save, write the JSON file, log and swallow any I/O error
//  → desktop_json_path, resolve `~/.kandown/desktop.json` lazily
//  → add_or_touch, upsert a project by path, bump last_opened_at, save
//  → remove, drop an entry by path, save
//  → recent_paths, snapshot of paths in most-recent-first order
//  → recent_entries, snapshot including display_name and timestamp
//  → prune_missing, mark entries whose folder is gone as missing in-place
//  → display_name_from_path, `<basename>` from an absolute path

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tracing::warn;

/// 📖 Shape of `~/.kandown/desktop.json` after slice 3 lands. Slice 2 only
/// wrote `lastProject`; the same file now also holds `projects`. Both fields
/// are defaulted so pre-slice-3 files load as `projects = []` and pre-slice-
/// 7 files (when slice 7 adds `openMode`) will load the same way.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct DesktopConfig {
    /// 📖 Slice 2 legacy field. Kept for backwards compat: a user upgrading
    /// from slice 2 to slice 3 keeps their "Reopen last" affordance even
    /// though `projects[0]` is now the canonical answer. Always equals
    /// `projects[0].path` after a slice 3 write.
    #[serde(default, rename = "lastProject")]
    pub last_project: Option<PathBuf>,
    /// 📖 The recents list. Always sorted most-recent-first on write.
    #[serde(default)]
    pub projects: Vec<ProjectEntry>,
}

/// 📖 One row in the recents list. The slice 7 schema also adds an
/// `openMode` field at the top level; ProjectEntry itself does not need
/// to change for that, which is why we keep it minimal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectEntry {
    #[serde(rename = "path")]
    pub path: PathBuf,
    /// 📖 camelCase to match the rest of `~/.kandown/desktop.json`. The
    /// top-level field is `lastProject`, the recents entry follows the
    /// same pattern (`lastOpenedAt`).
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "lastOpenedAt")]
    pub last_opened_at: u64,
    /// 📖 Set by `prune_missing` when the underlying folder no longer
    /// exists. We never auto-delete; the UI surfaces a remove button
    /// instead (slice 3 spec: "show them greyed with a remove button
    /// rather than auto-deleting").
    #[serde(default, skip_serializing_if = "is_false")]
    pub missing: bool,
}

fn is_false(b: &bool) -> bool {
    !*b
}

/// 📖 Path to the shared config file. Lazy: we resolve it under the home
/// directory; on Windows a future slice may use `LOCALAPPDATA` instead.
pub fn desktop_json_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    Some(home.join(".kandown").join("desktop.json"))
}

/// 📖 Read the config from disk. Absence is not an error (first launch);
/// a parse error logs a warning and returns the default so a corrupt file
/// does not block the app.
pub fn load() -> DesktopConfig {
    let Some(path) = desktop_json_path() else {
        return DesktopConfig::default();
    };
    let raw = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return DesktopConfig::default(),
    };
    match serde_json::from_str(&raw) {
        Ok(c) => c,
        Err(e) => {
            warn!("desktop.json parse failed: {e}; treating as empty");
            DesktopConfig::default()
        }
    }
}

/// 📖 Persist the config. Best effort: any I/O failure is logged at warn
/// level and swallowed so a failing save never blocks the launch. The
/// next launch will simply fall back to the picker if needed.
pub fn save(config: &DesktopConfig) {
    let Some(path) = desktop_json_path() else {
        warn!("HOME not set; cannot save desktop.json");
        return;
    };
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            warn!("could not create {}: {e}", parent.display());
            return;
        }
    }
    let json = match serde_json::to_string_pretty(config) {
        Ok(s) => s,
        Err(e) => {
            warn!("could not serialise desktop.json: {e}");
            return;
        }
    };
    if let Err(e) = std::fs::write(&path, json) {
        warn!("could not write {}: {e}", path.display());
    }
}

/// 📖 Unix epoch in seconds for "now". Public so callers (the bundle's
/// JS side, future slices) can use the same clock as the Rust store.
pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 📖 Best-effort display name: the basename of the folder. Strips
/// trailing separators so `/Users/vava/code/foo/` reads as `foo`.
/// Fallback to the full path string when no basename exists (root).
pub fn display_name_from_path(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

/// 📖 Upsert a project entry by absolute path. Bumps `last_opened_at`
/// and re-sorts the list most-recent-first. Persists as a side effect.
///
/// 📖 The path is stored **as supplied**, without `canonicalize()`:
/// the CLI's `daemon.json` records the raw `--path` argument verbatim
/// (Node's `path.resolve` does not follow symlinks), so the recents
/// entry has to match. Earlier canonicalization here caused every
/// daemon on macOS to look stale on the next cold start, because
/// `/tmp/...` and `/private/tmp/...` resolved to different strings
/// inside the recents store and inside `daemon.json`.
///
/// 📖 A pre-existing entry under the canonical form is treated as the
/// same project: we replace its path with the new (supplied) form.
/// This avoids duplicates after a slice-2 → slice-3 upgrade, where
/// `lastProject` may already be canonical.
pub fn add_or_touch(path: &Path) {
    let mut config = load();
    let path_buf = path.to_path_buf();
    let now = now_secs();
    let display_name = display_name_from_path(&path_buf);

    // 📖 Look for an exact match first, then a canonical-form match
    // so the same project opened two different ways (e.g. symlink and
    // resolved) does not end up twice in the list.
    let mut found_idx: Option<usize> = None;
    for (idx, entry) in config.projects.iter().enumerate() {
        if entry.path == path_buf {
            found_idx = Some(idx);
            break;
        }
    }
    if found_idx.is_none() {
        let target_canon = path.canonicalize().unwrap_or_else(|_| path_buf.clone());
        for (idx, entry) in config.projects.iter().enumerate() {
            let entry_canon = entry
                .path
                .canonicalize()
                .unwrap_or_else(|_| entry.path.clone());
            if entry_canon == target_canon {
                found_idx = Some(idx);
                break;
            }
        }
    }
    if let Some(idx) = found_idx {
        let entry = &mut config.projects[idx];
        entry.path = path_buf.clone();
        entry.last_opened_at = now;
        entry.display_name = display_name.clone();
        entry.missing = false;
    } else {
        config.projects.push(ProjectEntry {
            path: path_buf.clone(),
            display_name,
            last_opened_at: now,
            missing: false,
        });
    }
    config.projects.sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));
    config.last_project = Some(path_buf);
    save(&config);
}

/// 📖 Remove a project entry by path. No-op if the path isn't in the
/// list. Persists as a side effect.
pub fn remove(path: &Path) {
    let mut config = load();
    let before = config.projects.len();
    config.projects.retain(|e| e.path != path);
    if config.projects.len() != before {
        save(&config);
    }
}

/// 📖 Snapshot of paths in most-recent-first order. Used by the cold-
/// start stale-daemon cleanup pass to walk every entry and validate.
pub fn recent_paths() -> Vec<PathBuf> {
    let config = load();
    config.projects.into_iter().map(|e| e.path).collect()
}

/// 📖 Snapshot of all recents including metadata, used to render the
/// launcher page. Each entry is JSON-friendly: paths serialised as
/// strings, timestamps as numbers.
pub fn recent_entries() -> Vec<ProjectEntry> {
    load().projects
}

/// 📖 Mark entries whose folder no longer exists as `missing: true`.
/// Returns the number of entries that were newly marked this call.
pub fn prune_missing(entries: &mut [ProjectEntry]) -> usize {
    let mut changed = 0;
    for entry in entries.iter_mut() {
        if !entry.path.is_dir() {
            if !entry.missing {
                entry.missing = true;
                changed += 1;
            }
        } else if entry.missing {
            entry.missing = false;
            changed += 1;
        }
    }
    changed
}
