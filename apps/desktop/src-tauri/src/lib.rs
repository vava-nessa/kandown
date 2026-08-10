// 📖 @file lib.rs: Tauri 2 entry function.
// @description Holds `run()` so the binary (`main.rs`) stays a one-liner. This
// mirrors the `tauri create` template and keeps the desktop window startup in
// a single place future slices will grow into (daemon spawn, recents store,
// updater wiring, native menu).
//
// Slice 1 is intentionally minimal: install the log file, open the blank
// window, and configure the navigation handler so slice 2 can navigate the
// webview to a `http://127.0.0.1:<port>/` daemon URL without surprise. Carry
// over from `t288.md > Carry-over > finding 1`.
//
// 📖 Functions
//  → run, build the Tauri app and run it; never returns under normal use
//
// 📖 Internal modules
//  → logging, log file + panic hook (see `src/logging.rs`)

mod logging;

/// 📖 Build the Tauri app, install logging, wire the navigation handler, and
/// hand control to the OS event loop. Returns only on fatal error.
pub fn run() {
    let _log_guard = logging::init();

    tauri::Builder::default()
        .setup(|app| {
            // 📖 Without this handler, Tauri 2 silently rejects any navigation that
            // is not part of the bundled `frontendDist`. Slice 2 points the webview
            // at a `http://127.0.0.1:<port>/` URL the daemon serves; without this
            // allow-list the window would stay on the blank HTML and the blank-
            // window rabbit hole would reappear. See `t288.md > Carry-over > finding 1`.
            //
            // The navigation policy is per-window in Tauri 2 (no top-level
            // `Builder::on_navigation`), so the window is built programmatically
            // here rather than via the `tauri.conf.json > app.windows` array.
            // Slice 1 still reads the bundled `frontendDist` for `index.html`; the
            // allow-list is what makes slice 2's `WebviewWindow::navigate(...)`
            // to a daemon URL work without surprise.
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
