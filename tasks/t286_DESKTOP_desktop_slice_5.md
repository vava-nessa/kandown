---
id: t286
title: Desktop slice 5, Tauri auto-updater
status: Backlog
created: 2026-08-10
updated: 2026-08-10T12:42:23Z
priority: P2
tags: [desktop, release]
ownerType: agent
depends_on: [t284]
category: DESKTOP
---

# Desktop slice 5, Tauri auto-updater

Spec: [[t280]], decision 8. **v1.1, not on the v1 ship line.**

## Goal

The app updates itself from a GitHub release, and it is the **only** update
mechanism running inside the app.

## Subtasks

- [ ] Add `tauri-plugin-updater`, wire it in `lib.rs`
- [ ] Generate the signing key pair. Public key committed, private key and its
      password stored as GitHub Actions secrets. Document the rotation procedure in
      `apps/desktop/README.md`, because losing the private key strands every
      installed copy
- [ ] `tauri.conf.json` declares the updater endpoint pointing at the
      `desktop-updater.json` manifest attached to the latest GitHub release
- [ ] Check on launch, prompt the user, download in the background, install on quit
- [ ] Disable the updater in dev builds (`#[cfg(not(debug_assertions))]`) and behind
      an opt-out setting
- [ ] **Turn the CLI's own update machinery off inside the app.** Pass the
      environment variable that disables `scheduleDaemonSelfUpgrade`, and confirm the
      in-app update surface does not reach `POST /api/update/apply`
      (`src/cli/lib/server.ts:239`), which runs a global npm install and restarts
      the daemon from `process.argv[1]`
- [ ] If that environment variable does not exist yet in the CLI, add it there and
      note the change in this task. It is a small, additive CLI change

## Acceptance criteria

- [ ] Install vN, publish vN+1 with a signed manifest, launch: the app prompts,
      downloads, and is running vN+1 after a restart
- [ ] A tampered artefact is rejected by signature verification
- [ ] With the endpoint unreachable, the app launches normally and logs the failure
      instead of blocking on it
- [ ] Dev builds never contact the updater
- [ ] Inside the app, the daemon does not restart itself when the global `kandown`
      npm package is upgraded underneath it
- [ ] The in-app update flow never triggers `npm install -g`

## Out of scope

- Delta updates. Full artefacts are small enough without an embedded runtime.
- Update channels (beta, nightly). One channel for v1.
- Updating the user's `kandown` CLI. That belongs to npm.
