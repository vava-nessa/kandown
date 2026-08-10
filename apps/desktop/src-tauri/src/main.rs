// � @file main.rs: process entry point.
// @description Single-line wrapper that suppresses the extra console window on
// Windows release builds and delegates the rest to `kandown_desktop::run()`. All
// real work (logging, builder, navigation policy) lives in `lib.rs` so future
// slices can integration-test the same code path the binary uses.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kandown_desktop::run();
}
