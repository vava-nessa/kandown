---
id: t257
title: Community plugin system and store (Obsidian-style)
status: Backlog
priority: P3
tags: [architecture, plugins, store, epic, decision]
ownerType: human
created: 2026-07-26
order: 15
updated: 2026-09-05T09:16:18Z
category: ARCHITECTURE
---

# Community plugin system and store

## Context

Kandown has no extension point. Everything a user might want to add — a custom
view, a widget in the drawer, a rendering of a task field, an automation on move —
requires a PR against this repository. Obsidian's answer is a plugin API plus a
community store, and it is the model asked for here: a user opens the board,
browses a store, clicks install, and the board gains a capability.

This is a **spec-first** task. Nothing gets built until the design below is settled,
because the hard parts are architectural, not implementational: the web UI ships as
a single inlined HTML file, three interfaces read the same directory, and one of
the project's invariants forbids the network entirely in the CLI and daemon.

Paired with [t258](t258.md) — the workflow/skill catalog. They share **one**
registry, one manifest format and one install UI (decided below), so neither should
be designed without the other.

## Decisions already taken

Settled with the user before writing this task. These are not open questions.

- **The network invariant holds.** Invariant #5 (`docs/ARCHITECTURE.md`) — task
  commands and the daemon never touch the network — stays intact. Only commands a
  human explicitly invokes (`kandown plugin search|install|update`) and the store
  screen in the web UI, opened by a click, are allowed to make registry calls.
  Nothing ever fetches on its own: no background refresh, no update check on start.
  CI and agents keep a fully offline kandown.
- **Web UI first.** v1 plugins extend the **web board only**, loaded at runtime from
  `.kandown/plugins/`. TUI and CLI extension points are explicitly out of scope for
  v1 — not rejected, just not now.
- **Obsidian trust model, assumed.** No sandbox. Plugins run with the same reach as
  the board itself, including the daemon API token. The mitigations are social and
  explicit rather than technical: manual install, a consent screen that states what
  the plugin can reach, a community list reviewed by PR, and a one-click disable.
  A capability sandbox stays possible later; it is not a v1 blocker.
- **Registry = a GitHub repo with a JSON index.** A `kandown-community` repository
  holding `index.json`, entries submitted by pull request, assets served from GitHub
  releases. Zero infrastructure, zero cost, moderation through code review.
- **One unified store**, not two. A single registry and a single manifest with a
  `type` field (`plugin` | `skill` | `template` | `theme`), so the store UI, the
  install path and the update path exist once. This was the user's call over a
  recommendation to ship the content store first on its own rails.

## Subtasks

- [ ] **Write the design doc before any code** — `docs/PLUGINS.md`: manifest schema,
      lifecycle, API surface, versioning and compatibility policy, security posture.
      Everything below depends on it and it is the actual deliverable of this task.
- [ ] **Solve runtime loading against a single-file web UI** — `.kandown/kandown.html`
      is one self-contained inlined file produced by Vite, with no bundler and no
      module resolution at runtime. A plugin is JS on disk that must reach it. Decide
      between ESM `import()` of a blob/URL served by the daemon, a `<script type=module>`
      injection, or an import-map. **Server mode and standalone mode must both work**,
      or standalone must degrade explicitly rather than silently.
- [ ] **Define the plugin API object** — the `kandown` handle a plugin receives.
      Minimum viable surface: read/subscribe to the board, mutate tasks through the
      existing core (never by writing files directly — invariant #2), register a panel
      or a view, register a command in the palette, persist plugin settings, and
      contribute i18n strings. Small and stable beats large and regretted.
- [ ] **Decide where plugin state lives** — invariant: task state lives in `tasks/*.md`
      and nowhere else. Plugin *settings* can live in `.kandown/plugins/<id>/config.json`,
      but a plugin that wants to attach *data to a task* must write frontmatter through
      the parser, which is exactly what the round-trip invariant protects. Say so in
      the doc and make the API enforce it.
- [ ] **Specify the manifest** — id, name, version, author, description, `type`,
      minimum kandown version, entry point, requested reach, repository, licence.
      Shared with [t258](t258.md); design it once, for all four entry types.
- [ ] **Build the store screen** — browse, search, filter by type, read the
      description, install, enable/disable, update, uninstall. It is the surface the
      whole idea is judged on.
- [ ] **Build `kandown plugin` CLI commands** — `search`, `install`, `list`,
      `enable`, `disable`, `remove`, `update`. Explicitly invoked, therefore allowed
      to touch the network. Everything the store screen does must be doable headless.
- [ ] **Write the consent and disable path** — what a user is told before an install,
      and how they kill a misbehaving plugin without editing JSON by hand. Given the
      unsandboxed model, this is a feature, not paperwork.

## Notes

**The single-file web UI is the real risk here**, more than security or moderation.
The board is built by `vite build` with everything inlined precisely so that
`.kandown/kandown.html` is portable and self-contained; runtime-loaded third-party
code cuts against that design on purpose. If no loading strategy preserves both
server and standalone mode, that is a finding worth having early — and it may push
v1 towards core/daemon-side plugins instead, which was the runner-up option.

Assigned to a human: this is product direction plus an architecture commitment that
is very expensive to walk back once third parties depend on it.
