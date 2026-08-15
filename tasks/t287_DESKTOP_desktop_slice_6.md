---
id: t287
title: Desktop slice 6, CI, macOS notarization and Linux packaging
status: Backlog
created: 2026-08-10
updated: 2026-08-10T12:42:23Z
priority: P1
tags: [desktop, ci, release]
ownerType: agent
depends_on: [t285, t289]
category: DESKTOP
---

# Desktop slice 6, CI, macOS notarization and Linux packaging

Spec: [[t280]], decision 4. **macOS and Linux only. Windows is planned, deferred.**

## Blocking prerequisite

A paid Apple Developer account (99 USD/year) with a Developer ID Application
certificate. Without it there is no signed or notarizable macOS artefact, only
local unsigned dev builds. **Confirm access before starting this slice**, not
halfway through it.

Windows signing needs Azure Trusted Signing, which requires a legal entity with
three years of verifiable history. Deferred by decision. The CI matrix keeps an
unsigned Windows build job so the target does not silently rot, and that job is
allowed to fail without blocking a release.

## Subtasks

- [ ] `.github/workflows/desktop-build.yml`, runs on pull requests touching
      `apps/desktop/`:
      - [ ] macOS arm64 and x64, Ubuntu 24.04, Windows x64 (unsigned, non-blocking)
      - [ ] Rust toolchain and Cargo cache so a PR does not take fifteen minutes
      - [ ] Smoke test: launch the app headless against a fixture project and assert
            the daemon comes up and the board endpoint answers
- [ ] `.github/workflows/desktop-release.yml`, runs on a `v*` tag:
      - [ ] macOS: sign with Developer ID, notarize with `notarytool`, staple,
            produce a universal or per-arch `.dmg`. `notarytool wait` with a 30
            minute timeout, because a first submission can take 5-15 minutes
      - [ ] Linux: `.deb` as the primary artefact, `.AppImage` as a best effort with
            no cross-distro promise (WebKitGTK 4.1 linkage is not portable)
      - [ ] Generate and upload `desktop-updater.json` next to the artefacts
      - [ ] Attach everything to the same GitHub Release as the npm package
- [ ] Document the whole runbook in `docs/RELEASE.md`, next to the existing npm one,
      including what to do when notarization is rejected
- [ ] Changelog entry under `changelogs/`, per hard rule #5. Never touch
      `CHANGELOG.md` directly

## Acceptance criteria

- [ ] A pull request touching `apps/desktop/` compiles on macOS and Linux, and the
      smoke test passes on both
- [ ] Tagging produces a notarized `.dmg` that a clean macOS 13+ machine opens with
      no Gatekeeper warning
- [ ] `spctl -a -vvv` on the installed `.app` reports it as accepted and notarized
- [ ] The `.deb` installs on a clean Ubuntu 24.04 and the app launches from the
      applications menu
- [ ] `.dmg` ≤ 20 MB and `.deb` ≤ 20 MB
- [ ] `desktop-updater.json` is present, ready for [[t286]] to consume in v1.1
- [ ] `docs/RELEASE.md` is accurate enough for someone else to cut the release

## Out of scope

- Signed Windows distribution. Deferred, decision 4.
- Flatpak, Snap, Homebrew cask, AUR. Later, once there is demand.
- Mac App Store submission.
