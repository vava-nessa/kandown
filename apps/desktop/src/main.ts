/**
 * 📖 @file main.ts: placeholder entry for the desktop launcher webview.
 * @description Slice 1 only opens a blank window. Slice 2 will read
 *   `<project>/.kandown/daemon.json`, point the webview at `http://127.0.0.1:<port>/`
 *   and render the real board. The navigation policy that lets that happen is
 *   configured on the Rust side via `WebviewWindowBuilder::on_navigation(|_| true)`;
 *   this file intentionally has nothing to do yet.
 * @exports (none)
 */

export {};
