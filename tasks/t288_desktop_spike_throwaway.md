---
id: t288
title: Desktop spike, throwaway Tauri window on a running daemon (go/no-go)
status: Done
created: 2026-08-10
updated: 2026-08-10T21:16:27Z
priority: P1
tags: [desktop, spike]
ownerType: agent
---

# Desktop spike, throwaway Tauri window on a running daemon (go/no-go)

Spec: [[t280]]. **This is an experiment, not a step.** The code is thrown away
afterwards. It is not merged, not reviewed, not documented.

## Why

Six slices of desktop work rest on one unproven assumption: that a dock icon and a
native window are meaningfully better than a pinned browser tab, for a developer
who already lives in a terminal. Nothing else in the plan tests that assumption
before slice 6.

This spike answers it in an afternoon.

## What to build

The smallest thing that can be lived with:

- A Tauri 2.x window pointed at `http://127.0.0.1:<port>/`
- The port hardcoded, read by hand from `.kandown/daemon.json` of a project whose
  daemon is already running from a terminal
- No picker, no daemon spawning, no menu, no updater, no packaging, no error
  handling

Build it in a scratch directory outside the repo, or on a branch that is never
merged. Do not create `apps/desktop/` yet, that is [[t282]].

## How to evaluate

vava starts a kandown daemon as usual, launches the spike window, and uses it as
her real board for **two working days**. Then answers:

- Did I reach for the window, or did I keep going back to the browser tab?
- Does the board feel the same, or does something break in WKWebView that works in
  Chrome? Specifically: the BlockNote editor (Shadow DOM), the three.js background,
  drag and drop, keyboard shortcuts
- Is the window noticeably slower to open or to render?
- Does anything about it feel worth three weeks?

## Exit

- [ ] **Go**: [[t282]] is unblocked, and anything surprising found here is written
      into the relevant slice as a subtask or a risk
- [ ] **No go**: [[t280]] and slices t282 to t289 are closed as won't do, with the
      reason recorded. [[t281]] stays open regardless, it is a security fix that
      stands on its own
- [ ] **Go with changes**: record which decisions in [[t280]] the spike invalidated

## Acceptance criteria

- [~] Spike cancelled by user. Task closed without a verdict on the
      underlying product question. Code deleted. See "Cancellation".

## Cancellation

Cancelled at user request on 2026-08-10. The user wants to build the
desktop apps, not spend cycles validating the assumption that a Tauri
window is better than a pinned browser tab. The architectural question
the spike was meant to answer is **deferred indefinitely**; the value of
a desktop shell is presumed, to be revisited only if/when real adoption
falters after shipping.

Spike artefacts deleted: `/tmp/kandown-spike/` removed, running spike
processes killed, `sub-spike-t288` and the follow-up `sub-fix-spike-nav`
sub-agents cancelled.

## Carry-over into t282

The spike did surface two findings worth keeping, even with no live-use
verdict:

1. **Tauri 2.x blocks navigation to non-bundled URLs by default.** The
   `WebviewWindow::navigate()` call inside `setup()` is silently rejected
   without an explicit `.on_navigation(|_| true)` handler (or equivalent
   config in `tauri.conf.json`). The spike window stayed on its
   `frontendDist` placeholder HTML. t282 should configure the navigation
   handler up front so the empty-window rabbit hole does not reappear in
   slice 2.
2. **Reading `daemon.json` for port and token at app start is fine.** The
   spike's `main.rs` pattern (`fs::read_to_string` -> `serde_json` ->
   `tauri::Url::parse`) is the shape t283 should grow into; keep it small
   and typed, do not pass the URL as a string.

No file in `/Users/vava/Documents/GitHub/kandown/` was modified by the
spike work.
