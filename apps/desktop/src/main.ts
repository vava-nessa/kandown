/**
 * 📖 @file main.ts: desktop launcher webview bootstrap.
 * @description Drives the bundled picker page. The Tauri Rust side owns the
 *   daemon lifecycle; this script's job is to:
 *
 *   1. Ask Rust whether `kandown` is on PATH (`cmd_kandown_installed`).
 *      → not installed: render the install screen with a Retry button.
 *      → installed: render the picker.
 *   2. On a folder pick, ask Rust to resolve the daemon
 *      (`cmd_resolve_daemon`). Rust returns the `DaemonInfo` (port, token,
 *      owned flag, project path) and the `kandown://daemon-ready` event
 *      we listen for. The Rust side then navigates the webview to
 *      `http://127.0.0.1:<port>/` via `cmd_open_window_with_url`.
 *   3. Show a non-blocking version banner if the CLI is below the minimum.
 *
 *   The webview is just a browser pointed at localhost; once Rust
 *   navigates to the daemon URL, this script is unloaded and the daemon's
 *   app takes over the page.
 *
 * 📖 We use the global `window.__TAURI__` API (enabled by
 * `app.withGlobalTauri` in `tauri.conf.json`) so the bundled HTML has no
 * external script imports. The `@tauri-apps/api` package is not in the
 * dependency tree, which keeps the bundle small and avoids a Vite pipeline
 * for what is essentially three calls.
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

// 📖 Type mirrors `DaemonInfo` in `src-tauri/src/lib.rs`. Kept in sync by
// hand: small, no surprises, and a Rust rename would surface as a TS error
// on first launch.
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
const pickerScreen = document.getElementById("picker-screen") as HTMLElement;
const installRetry = document.getElementById("install-retry") as HTMLButtonElement;
const installDetail = document.getElementById("install-detail") as HTMLElement;
const pickerButton = document.getElementById("picker-button") as HTMLButtonElement;
const pickerReopen = document.getElementById("picker-reopen") as HTMLButtonElement;
const pickerStatus = document.getElementById("picker-status") as HTMLElement;
const banner = document.getElementById("banner") as HTMLElement;

/** 📖 Swap visibility on the two top-level sections. */
function showInstall(): void {
  installScreen.classList.remove("hidden");
  pickerScreen.classList.add("hidden");
}

function showPicker(): void {
  installScreen.classList.add("hidden");
  pickerScreen.classList.remove("hidden");
}

/** 📖 Drive the install screen and refetch `cmd_kandown_installed`. */
async function checkInstalled(): Promise<void> {
  try {
    const info = await tauriInvoke<KandownInstallInfo>("cmd_kandown_installed");
    if (!info.installed) {
      showInstall();
      return;
    }
    showPicker();
    await maybeShowVersionBanner();
    await maybeShowReopenButton();
  } catch (err) {
    installDetail.textContent = `error: ${err}`;
    installDetail.classList.remove("hidden");
    showInstall();
  }
}

/** 📖 If a `lastProject` exists, surface a "Reopen last" button next to
 *  the picker. The button runs the same resolve path as a fresh pick,
 *  which makes joining a terminal-launched daemon a one-click action
 *  (the picker would otherwise require navigating to the same folder).
 *  Also kicks off an auto-resolve so the picker is a brief loading
 *  screen on subsequent launches, not a manual gate. */
async function maybeShowReopenButton(): Promise<void> {
  try {
    const last = await tauriInvoke<string | null>("cmd_get_last_project");
    if (!last) {
      pickerReopen.classList.add("hidden");
      return;
    }
    pickerReopen.textContent = `Reopen ${last}`;
    pickerReopen.dataset.projectPath = last;
    pickerReopen.classList.remove("hidden");
    // 📖 Auto-resolve on launch. If the daemon is already up (terminal
    // launched it, or a previous app run left it alive), this is a no-
    // cost join; if not, we fall through to the picker below. The
    // navigation happens via the `kandown://daemon-ready` event, which
    // fires whether the daemon was joined or spawned.
    void resolvePathAuto(last);
  } catch {
    pickerReopen.classList.add("hidden");
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

/** 📖 Open the native folder picker, then resolve the daemon for it. */
async function pickAndResolve(): Promise<void> {
  pickerButton.disabled = true;
  pickerStatus.textContent = "picking…";
  try {
    const projectPath = await tauriInvoke<string | null>("cmd_pick_project");
    if (!projectPath) {
      pickerStatus.textContent = "";
      pickerButton.disabled = false;
      return;
    }
    pickerStatus.textContent = `starting daemon for ${projectPath}…`;
    await tauriInvoke<DaemonInfo>("cmd_resolve_daemon", { projectPath });
    // 📖 Rust also fires the `kandown://daemon-ready` event; we listen
    // for it and navigate the webview there. Either path reaches the
    // same code, but going through the event keeps the JS side purely
    // reactive.
  } catch (err) {
    pickerStatus.textContent = `error: ${err}`;
    pickerButton.disabled = false;
  }
}

/** 📖 Send the webview to the daemon URL. The Rust side holds the actual
 *  `WebviewWindow` reference; the JS side never has to. */
async function navigateToDaemon(info: DaemonInfo): Promise<void> {
  pickerStatus.textContent = `connecting to ${info.url}`;
  try {
    await tauriInvoke<void>("cmd_open_window_with_url", { url: info.url });
  } catch (err) {
    pickerStatus.textContent = `error navigating: ${err}`;
    pickerButton.disabled = false;
  }
}

/** 📖 Resolve the daemon for a specific path (used by both "Pick
 *  folder" and "Reopen last"). */
async function resolvePath(projectPath: string): Promise<void> {
  pickerButton.disabled = true;
  pickerReopen.disabled = true;
  pickerStatus.textContent = `starting daemon for ${projectPath}…`;
  try {
    await tauriInvoke<DaemonInfo>("cmd_resolve_daemon", { projectPath });
  } catch (err) {
    pickerStatus.textContent = `error: ${err}`;
    pickerButton.disabled = false;
    pickerReopen.disabled = false;
  }
}

/** 📖 Resolve the daemon for a specific path without disabling the
 *  buttons (used on initial auto-resolve when the picker is briefly
 *  visible). */
async function resolvePathAuto(projectPath: string): Promise<void> {
  pickerStatus.textContent = `connecting to daemon for ${projectPath}…`;
  try {
    await tauriInvoke<DaemonInfo>("cmd_resolve_daemon", { projectPath });
  } catch (err) {
    // 📖 Auto-resolve failed (daemon died, project moved, etc). Fall
    // back to the picker so the user can pick something else.
    pickerStatus.textContent = `could not auto-resolve: ${err}. Pick a folder.`;
  }
}

/** 📖 Wire the bundled page to the Tauri commands. */
function wire(): void {
  installRetry.addEventListener("click", () => {
    installDetail.classList.add("hidden");
    void checkInstalled();
  });
  pickerButton.addEventListener("click", () => {
    void pickAndResolve();
  });
  pickerReopen.addEventListener("click", () => {
    const path = pickerReopen.dataset.projectPath;
    if (path) void resolvePath(path);
  });
}

/** 📖 Listen for the Rust side to fire a daemon-ready event. This is the
 *  hot path when the user has already picked and we just want to flip the
 *  page without an extra round-trip. */
async function subscribeDaemonReady(): Promise<void> {
  await tauriListen<DaemonInfo>("kandown://daemon-ready", (info) => {
    void navigateToDaemon(info);
  });
}

void subscribeDaemonReady();
wire();
void checkInstalled();

export {};