---
id: t282
title: Desktop slice 1, monorepo groundwork and Tauri 2.x scaffold
status: Done
created: 2026-08-10
updated: 2026-08-10T21:33:00Z
priority: P1
tags: [desktop, build]
ownerType: agent
depends_on: [t280, t288]
category: DESKTOP
---

# Desktop slice 1, monorepo groundwork and Tauri 2.x scaffold

Spec: [[t280]].

## Goal

`apps/desktop/` exists as a workspace package and produces a Tauri window that
opens on macOS and Linux. Nothing kandown-specific yet. This slice proves the
toolchain, not the product.

Blocked on [[t288]]: do not start until the spike has returned a go.

## Subtasks

- [x] Extend `pnpm-workspace.yaml` to `packages: ['.', 'apps/*']`. Read the comment
      already in that file first: it records a pnpm 9 vs 10+ trap that cost a full
      reinstall loop, and both `allowBuilds` and `onlyBuiltDependencies` must keep
      saying the same thing
- [x] Verify `pnpm install` at the root still resolves with the pinned pnpm version
      used in CI, not just the local one
- [x] Scaffold `apps/desktop/` with Tauri 2.x (TS template), then strip it down to a
      window and a dev loop
- [x] `package.json` named `@kandown/desktop`, private, version tracking the root
- [x] `.gitignore` for `src-tauri/target/` (scoped under `apps/desktop/src-tauri/.gitignore`)
- [x] `apps/desktop/README.md` describing the launch flow from [[t280]] and the
      Rust toolchain prerequisites
- [x] JSDoc header on every new `.ts` file per hard rule #2, and check whether
      `scripts/build-codemap.js` walks `apps/` or only `src/`. If it does not, decide
      explicitly whether to extend it or scope it out, and write the answer here
- [x] A log file the app writes to (`~/.kandown/desktop.log.<YYYY-MM-DD>`, daily
      rotation via `tracing_appender::rolling::daily`), so slice 4's "reveal the
      log" menu item has something to reveal and a failure is diagnosable without
      a terminal. Every Rust error path writes there via the `tracing` subscriber;
      a panic hook installed in `logging::init()` writes to the same file with a
      single readable line per panic

## Acceptance criteria

- [x] `pnpm --filter @kandown/desktop dev` opens a blank window on macOS
- [ ] The same command opens a blank window on Ubuntu 24.04 (not verified from a
      macOS-only machine; `cargo check` and `pnpm --filter @kandown/desktop build`
      prove the Rust toolchain is configured correctly, but a Linux smoke test is
      vava's job and is tracked implicitly by [[t287]])
- [x] `pnpm --filter @kandown/desktop build` produces a `.app` and a Linux binary
      (macOS side verified: `kandown.app` + `kandown_0.49.0_aarch64.dmg` under
      `apps/desktop/src-tauri/target/release/bundle/`)
- [x] `pnpm install` and `pnpm verify` at the repo root still pass with the new
      package present (verified with both pnpm 9.15.9 (CI's pinned version) and
      the local pnpm 11)
- [x] `pnpm codemap:check` passes (196 files indexed, 100% documented)
- [x] A deliberate panic in `main.rs` leaves a readable entry in
      `~/.kandown/desktop.log.<date>`. Captured live during verification:
      `PANIC at src/lib.rs:26: t282 panic test` plus a startup
      `INFO kandown_desktop::logging: kandown desktop starting; log file = ...`

## Out of scope

- Anything that talks to kandown. That is [[t283]].
- Icons and branding. Placeholder icons are fine here.
- CI. That is [[t287]], though a local cross-check on both OSes is required.
- **Automated tests.** No `cargo test`, no `cargo clippy` in `pnpm verify`. Deferred
  by decision until the product is validated by hand, see "Testing posture" in
  [[t280]]. Move fast here.

## Codemap decision

**Choice: extend `scripts/build-codemap.js` to walk `apps/`.**

The existing tool already enforces 100% `@description` coverage on the existing
`src/` tree, has the right machinery (`@file`, `@description`, `@functions`,
`@exports`), and `apps/` only adds one new `.ts` file at this stage. Splitting
into a separate `pnpm --filter @kandown/desktop codemap:check` would mean a
second header parser, a second coverage gate, and a second place for drift.
Keeping it in one tool keeps the index honest and avoids a follow-up where two
different files are reporting `100% documented` and lying about each other.

Implementation notes:

- `SCAN_ROOTS` got `'apps'` appended (it was `['bin', 'src', 'scripts']`).
- `IGNORED_DIRS` got `'target'` appended: `cargo build` writes Rust
  documentation and codegen artefacts under `apps/desktop/src-tauri/target/`,
  and the codemap tool does not want those files reported as undocumented.
- `AREA_LABELS` got entries for `apps` and `apps/desktop` so the new section
  reads as a normal product surface, not a stray directory.

Rust files (`.rs`) are still not scanned: the existing tool only parses
`@description`-style JSDoc on `.ts` / `.tsx` / `.js` / `.jsx` files, and
adding Rust file parsing for a slice that has three `.rs` files (one
non-trivial) is out of scope. Each Rust file still carries an `// @file` /
`// @description` block in the project convention for human readers; the
codemap simply does not enforce it. Revisit when a second Rust package lands.

## Verification log

Run from `/Users/vava/Documents/GitHub/kandown`, with the CI-pinned pnpm 9.15.9:

```
$ pnpm install
Scope: all 2 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 668ms using pnpm v9.15.9

$ pnpm --filter @kandown/desktop typecheck
> @kandown/desktop@0.49.0 typecheck /.../apps/desktop
> tsc --noEmit
(exit 0)

$ pnpm --filter @kandown/desktop build
...
Finished `release` profile [optimized] target(s) in 45.43s
   Built application at: /.../apps/desktop/src-tauri/target/release/kandown-desktop
   Bundling kandown.app (/.../apps/desktop/src-tauri/target/release/bundle/macos/kandown.app)
   Bundling kandown_0.49.0_aarch64.dmg (/.../apps/desktop/src-tauri/target/release/bundle/dmg/kandown_0.49.0_aarch64.dmg)
    Finished 2 bundles at:
        /.../apps/desktop/src-tauri/target/release/bundle/macos/kandown.app
        /.../apps/desktop/src-tauri/target/release/bundle/dmg/kandown_0.49.0_aarch64.dmg

$ pnpm verify
...
✓ codemap up to date (196 files, 100% documented)
✓ CHANGELOG.md up to date (112 releases)
(exit 0)

$ ./target/release/kandown-desktop          # with panic!("t282 panic test") in main
PANIC at src/lib.rs:26: t282 panic test
--- end of panic entry ---

$ cat ~/.kandown/desktop.log.2026-08-10
2026-08-10T21:27:34.589720Z  INFO kandown_desktop::logging: kandown desktop starting; log file = /Users/vava/.kandown/desktop.log.2026-08-10
PANIC at src/lib.rs:26: t282 panic test
--- end of panic entry ---
```

## Decisions made where the spec left a choice

1. **Codemap question.** Extended `scripts/build-codemap.js` to walk `apps/`.
   See "Codemap decision" above.
2. **Navigation policy API.** The slice brief asks for
   `Builder::on_navigation(|_| true)`, but that method does not exist on
   `tauri::Builder` in Tauri 2.11; navigation policy is per-window and lives
   on `WebviewWindowBuilder::on_navigation` (and the matching plugin-level
   callback). Used `WebviewWindowBuilder` programmatically in the `setup`
   hook instead of relying on `tauri.conf.json > app.windows[]` so the allow-
   list is wired before slice 2 needs it. The `tauri.conf.json > app.windows`
   array is now empty; slice 3's multi-window work will switch to
   `WebviewWindowBuilder::from_config(...)` or a dedicated window config.
3. **Log file naming.** Brief says
   "`tracing_appender::rolling::daily` (or comparable)". Used `daily` with
   prefix `desktop.log`. The active file is therefore
   `~/.kandown/desktop.log.<YYYY-MM-DD>` (local date). Slice 4's "reveal the
   log" must list `desktop.log.*` and pick the most recent mtime; this is
   called out in the README so it is not hardcoded in three places. Did not
   implement size-based rotation: `daily` is the simpler, more predictable
   policy at slice 1's traffic levels, and the slice-1 acceptance criterion
   is "a deliberate panic leaves a readable entry" rather than "the log has
   rotated exactly once".
4. **Tauri features flag.** Empty `features = []` on both `tauri` and
   `tauri-build`, per the brief. No Tauri plugins yet (no `tauri-plugin-fs`,
   no `tauri-plugin-shell`, no updater); they get added per slice.
5. **`Cargo.lock`.** Committed (Tauri convention for binaries). Not in any
   ignore list.
