/**
 * 📖 @file main.ts: desktop launcher webview bootstrap.
 * @description Drives both the launcher window and the per-project
 *   windows in this slice. The Tauri Rust side owns the daemon
 *   lifecycle; this script's job is to:
 *
 *   Launcher window (`label = "launcher"`):
 *   1. Ask Rust whether `kandown` is on PATH (`cmd_kandown_installed`).
 *      → not installed: render the install screen with a Retry button.
 *      → installed: render the launcher.
 *   2. On load, list every recents entry via `cmd_list_recent_projects`.
 *      Greyed rows for missing folders (pruned by `projects::prune_missing`).
 *   3. Each row click calls `cmd_open_project_window(path)`, which opens
 *      a per-project window (or focuses the existing one if already open).
 *   4. "Open folder" runs the native dialog then opens the project too.
 *
 *   Project window (`label = "main-<hash>"`):
 *   1. On load, ask Rust for the pending resolve path placed by the
 *      launcher when the window was opened
 *      (`cmd_consume_pending_resolve`).
 *   2. If a path comes back, auto-resolve it. If the daemon is already
 *      up (terminal-launched, or a prior app run left it alive), this
 *      is a join; if not, we fall through to "Pick a different folder".
 *   3. Successful resolve navigates the window to the daemon URL via
 *      `cmd_navigate_to`.
 *
 * 📖 We use the global `window.__TAURI__` API (enabled by
 * `app.withGlobalTauri` in `tauri.conf.json`) so the bundled HTML has no
 * external script imports. The `@tauri-apps/api` package is not in the
 * dependency tree, which keeps the bundle small and avoids a Vite
 * pipeline for what is essentially a handful of calls.
 * @exports (none)
 */

// 📖 Ambient type for `window.__TAURI__` so the TypeScript typecheck
// passes without dragging `@tauri-apps/api` in. The runtime side is the
// global Tauri 2 injects into the webview; declaring it here is enough.
declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
      event: {
        listen: <T>(
          event: string,
          handler: (event: { payload: T }) => void,
        ) => Promise<() => void>;
      };
    };
  }
}

// 📖 Type mirrors the matching Rust shapes (see `src-tauri/src/lib.rs`).
// Kept in sync by hand: small, no surprises, and a Rust rename would
// surface as a TS error on first launch.
interface DaemonInfo {
  port: number;
  token: string | null;
  pid: number | null;
  owned: boolean;
  project_root: string;
  url: string;
}

interface KandownInstallInfo {
  installed: boolean;
  version: string | null;
  path: string | null;
}

interface MinVersionInfo {
  installed: string;
  minimum: string;
  below: boolean;
}

interface ProjectEntryInfo {
  path: string;
  display_name: string;
  last_opened_at: number;
  missing: boolean;
}

// 📖 Thin wrappers so the rest of the file reads like a script, not a
// type guard drill.
function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!window.__TAURI__) {
    return Promise.reject(new Error("Tauri global is missing; are we running outside the shell?"));
  }
  return window.__TAURI__.core.invoke<T>(cmd, args);
}

function tauriListen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (!window.__TAURI__) {
    return Promise.resolve(() => undefined);
  }
  return window.__TAURI__.event.listen<T>(event, (e) => handler(e.payload));
}

const installScreen = document.getElementById("install-screen") as HTMLElement;
const launcherScreen = document.getElementById("launcher-screen") as HTMLElement;
const projectScreen = document.getElementById("project-screen") as HTMLElement;
const installRetry = document.getElementById("install-retry") as HTMLButtonElement;
const installDetail = document.getElementById("install-detail") as HTMLElement;
const openFolder = document.getElementById("open-folder") as HTMLButtonElement;
const launcherStatus = document.getElementById("launcher-status") as HTMLElement;
const projectsList = document.getElementById("projects-list") as HTMLElement;
const projectsEmpty = document.getElementById("projects-empty") as HTMLElement;
const banner = document.getElementById("banner") as HTMLElement;
const projectTitle = document.getElementById("project-title") as HTMLElement;
const projectPath = document.getElementById("project-path") as HTMLElement;
const projectRetry = document.getElementById("project-retry") as HTMLButtonElement;
const projectPick = document.getElementById("project-pick") as HTMLButtonElement;
const projectStatus = document.getElementById("project-status") as HTMLElement;

/** 📖 Hide every top-level section, then show the given one. */
function showSection(target: HTMLElement): void {
  for (const section of [installScreen, launcherScreen, projectScreen]) {
    section.classList.add("hidden");
  }
  target.classList.remove("hidden");
}

/** 📖 Render an error message in the given status line and colour it red. */
function showError(target: HTMLElement, message: string): void {
  target.textContent = message;
  target.classList.add("error");
}

/** 📖 Clear a status line (errors or hints). */
function clearStatus(target: HTMLElement): void {
  target.textContent = "";
  target.classList.remove("error");
}

/** 📖 Format the `lastOpenedAt` timestamp as a relative time string
 *  ("just now", "5m ago", "3h ago", "yesterday", "Mar 4"). */
function relativeTime(seconds: number, now: number): string {
  const diff = Math.max(0, now - seconds);
  if (diff < 45) return "just now";
  if (diff < 90) return "1m ago";
  const minutes = Math.round(diff / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(diff / 3600);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(diff / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const date = new Date(seconds * 1000);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** 📖 Render the recents list. Most-recent-first ordering is the
 *  responsibility of the Rust side (`projects::save`). */
function renderProjects(entries: ProjectEntryInfo[]): void {
  projectsList.innerHTML = "";
  if (!entries.length) {
    projectsEmpty.classList.remove("hidden");
    return;
  }
  projectsEmpty.classList.add("hidden");
  const now = Math.floor(Date.now() / 1000);
  for (const entry of entries) {
    const li = document.createElement("li");
    if (entry.missing) li.classList.add("missing");

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = entry.display_name;
    li.appendChild(name);

    const path = document.createElement("span");
    path.className = "path";
    path.textContent = entry.path;
    li.appendChild(path);

    const meta = document.createElement("span");
    meta.className = "meta";
    if (entry.missing) {
      meta.textContent = "folder missing";
    } else {
      meta.textContent = relativeTime(entry.last_opened_at, now);
    }
    li.appendChild(meta);

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "×";
    remove.title = "Remove from recents";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      void removeProject(entry.path);
    });
    li.appendChild(remove);

    if (!entry.missing) {
      li.addEventListener("click", () => {
        void openProject(entry.path);
      });
    }

    projectsList.appendChild(li);
  }
}

/** 📖 Refetch the recents list. Called on launch and after any
 *  add/remove. */
async function refreshProjects(): Promise<void> {
  try {
    const entries = await tauriInvoke<ProjectEntryInfo[]>("cmd_list_recent_projects");
    renderProjects(entries ?? []);
  } catch (err) {
    projectsList.innerHTML = "";
    projectsEmpty.classList.remove("hidden");
    showError(launcherStatus, `could not list recents: ${err}`);
  }
}

/** 📖 Open the native folder picker, then open the chosen project in
 *  its own window. */
async function pickAndOpen(): Promise<void> {
  openFolder.disabled = true;
  clearStatus(launcherStatus);
  launcherStatus.textContent = "picking…";
  try {
    const projectPath = await tauriInvoke<string | null>("cmd_pick_project");
    if (!projectPath) {
      clearStatus(launcherStatus);
      openFolder.disabled = false;
      return;
    }
    launcherStatus.textContent = `opening ${projectPath}…`;
    await tauriInvoke("cmd_open_project_window", { projectPath });
    // 📖 `cmd_open_project_window` returns synchronously once the new
    // window is created (or focused). We re-enable the picker so the
    // user can open yet another project; the launcher stays put.
    clearStatus(launcherStatus);
    openFolder.disabled = false;
    await refreshProjects();
  } catch (err) {
    showError(launcherStatus, `error: ${err}`);
    openFolder.disabled = false;
  }
}

/** 📖 Open a recent project in its own window. Reuses an existing
 *  window when one is already open (focuses it). */
async function openProject(path: string): Promise<void> {
  clearStatus(launcherStatus);
  launcherStatus.textContent = `opening ${path}…`;
  try {
    await tauriInvoke("cmd_open_project_window", { projectPath: path });
    clearStatus(launcherStatus);
    await refreshProjects();
  } catch (err) {
    showError(launcherStatus, `error: ${err}`);
  }
}

/** 📖 Drop a project entry from the recents store and re-render. */
async function removeProject(path: string): Promise<void> {
  clearStatus(launcherStatus);
  try {
    await tauriInvoke("cmd_remove_recent_project", { path });
    await refreshProjects();
  } catch (err) {
    showError(launcherStatus, `could not remove: ${err}`);
  }
}

/** 📖 Yellow banner when the installed CLI is below the documented minimum. */
async function maybeShowVersionBanner(): Promise<void> {
  try {
    const info = await tauriInvoke<MinVersionInfo>("cmd_min_version_check");
    if (!info.below) {
      banner.classList.add("hidden");
      return;
    }
    banner.textContent = `kandown ${info.installed || "(unknown)"} is below the minimum recommended version ${info.minimum}. The board may not load correctly; please upgrade with \`npm i -g kandown\`.`;
    banner.classList.remove("hidden");
  } catch {
    // 📖 Non-blocking; if the check itself fails we just skip the banner.
  }
}

/** 📖 Drive the install screen and refetch `cmd_kandown_installed`. */
async function checkInstalled(): Promise<void> {
  try {
    const info = await tauriInvoke<KandownInstallInfo>("cmd_kandown_installed");
    if (!info.installed) {
      showSection(installScreen);
      return;
    }
  } catch (err) {
    installDetail.textContent = `error: ${err}`;
    installDetail.classList.remove("hidden");
    showSection(installScreen);
    return;
  }
  showSection(launcherScreen);
  await maybeShowVersionBanner();
  // 📖 Use a single fetch of the recents to drive both the UI render
  // and the auto-open decision: this avoids a duplicate IPC round-
  // trip and ensures the auto-open path is consistent with what we
  // paint on screen.
  let entries: ProjectEntryInfo[] = [];
  try {
    entries = (await tauriInvoke<ProjectEntryInfo[]>("cmd_list_recent_projects")) ?? [];
  } catch (err) {
    showError(launcherStatus, `could not list recents: ${err}`);
  }
  renderProjects(entries);
  if (entries.length === 0) {
    projectsEmpty.classList.remove("hidden");
  }
  // 📖 Obsidian model: when exactly one live project is known, skip
  // the launcher UI and auto-open that project in its own window.
  // Two or more: keep the recents list. Zero: keep the empty launcher.
  const live = entries.filter((e) => !e.missing);
  if (live.length === 1) {
    launcherStatus.textContent = `opening ${live[0].path}…`;
    try {
      await tauriInvoke("cmd_open_project_window", { projectPath: live[0].path });
      launcherStatus.textContent = "";
    } catch (err) {
      showError(launcherStatus, `could not auto-open: ${err}`);
    }
  }
}

/** 📖 Bootstrap the launcher window: the install screen first, then
 *  the recents list. The picker button starts a pick-and-open. */
async function bootLauncher(): Promise<void> {
  installRetry.addEventListener("click", () => {
    installDetail.classList.add("hidden");
    void checkInstalled();
  });
  openFolder.addEventListener("click", () => {
    void pickAndOpen();
  });
  await checkInstalled();
}

// 📖 Project window flow. The window was opened with a pending-resolve
// path; we pop it, run the same resolve dance the slice-2 picker did,
// and navigate to the daemon URL. On failure we surface a clear
// message and a "Pick a different folder" button.

let currentProjectPath: string | null = null;

/** 📖 Send the webview to the daemon URL. The Rust side holds the actual
 *  `WebviewWindow` reference; the JS side never has to. */
async function navigateToDaemon(info: DaemonInfo): Promise<void> {
  clearStatus(projectStatus);
  projectStatus.textContent = `connecting to ${info.url}`;
  try {
    await tauriInvoke("cmd_navigate_to", { url: info.url });
  } catch (err) {
    showError(projectStatus, `error navigating: ${err}`);
    projectRetry.classList.remove("hidden");
  }
}

/** 📖 Resolve the daemon for this window's project. */
async function resolveCurrent(): Promise<void> {
  if (!currentProjectPath) return;
  clearStatus(projectStatus);
  projectStatus.textContent = `starting daemon for ${currentProjectPath}…`;
  projectRetry.classList.add("hidden");
  try {
    await tauriInvoke<DaemonInfo>("cmd_resolve_daemon", { projectPath: currentProjectPath });
  } catch (err) {
    showError(projectStatus, `error: ${err}`);
    projectRetry.classList.remove("hidden");
  }
}

/** 📖 Bootstrap a project window. The window was opened via
 *  `open_or_focus_project_window` which placed a path in the
 *  `PendingResolves` queue; we pop it here on load. */
async function bootProject(): Promise<void> {
  let pending: string | null = null;
  try {
    pending = await tauriInvoke<string | null>("cmd_consume_pending_resolve");
  } catch {
    pending = null;
  }
  if (!pending) {
    // 📖 Defensive: this window was opened without a queued project
    // path (e.g. a CLI launch with no args). Fall back to the launcher
    // view; the user can pick a folder.
    await bootLauncher();
    return;
  }
  currentProjectPath = pending;
  projectPath.textContent = pending;
  const basename = pending.replace(/\/+$/, "").split("/").pop() ?? pending;
  projectTitle.textContent = `Opening ${basename}`;
  projectRetry.addEventListener("click", () => {
    void resolveCurrent();
  });
  projectPick.addEventListener("click", () => {
    void pickAndOpen();
  });
  showSection(projectScreen);
  await maybeShowVersionBanner();
  await resolveCurrent();
}

/** 📖 Listen for the Rust side to fire a daemon-ready event. Only the
 *  project window cares: navigating a launcher window to a daemon URL
 *  would be confusing. */
async function subscribeDaemonReady(): Promise<void> {
  await tauriListen<DaemonInfo>("kandown://daemon-ready", (info) => {
    if (currentProjectPath) {
      void navigateToDaemon(info);
    }
  });
}

void subscribeDaemonReady();

/** 📖 Pick the bootstrap path. Pending-resolve queue is the source of
 *  truth: launcher windows get `null` and render the recents UI;
 *  project windows get a path and auto-resolve. */
async function bootstrap(): Promise<void> {
  await bootProject();
}

void bootstrap();

export {};
