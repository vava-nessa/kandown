# 0002 - Extensions system

kandown gains an extension system. Extensions are modules that contribute custom
task fields, web panels, CLI commands, transition gates and sync integrations,
without ever becoming a second source of truth. They persist their own data under
a reserved `plugins.<id>.*` frontmatter namespace that the parser and serializer
round-trip as opaque bytes, they declare the surfaces they touch, and they run
under an isolation model where a broken or malicious extension cannot break the
core board.

The full specification, contribution-point reference and authoring guide live in
[`EXTENSIONS.md`](../EXTENSIONS.md). This ADR records the decisions that shaped
it and the alternatives that were rejected.

## Status

Accepted - 2026-07-27.

## Context

The project owner wants kandown to be customizable per user and per project, the
way pi lets every user write extensions, and wants coding agents to be able to
build kandown extensions easily. The reference mental models are pi (TypeScript
via jiti, global plus project install, lifecycle hooks) and Obsidian (community
registry, one-click and paste-URL install, restricted mode, fault isolation).

kandown is not pi, and the difference constrains the design. pi is single-surface
(one terminal UI) with volatile session data. kandown is multi-surface (web, CLI,
TUI) and its data is plain Markdown files governed by hard invariants: a task is
a file, the parser and serializer must round-trip, there is no second source of
truth, and any interface may mutate a file at any time. An extension system that
ignored those invariants would reintroduce exactly the bug class
[`ARCHITECTURE.md`](../ARCHITECTURE.md) warns about, where a third party writes
frontmatter the core later silently destroys.

A concrete finding during design confirmed the risk is real: as of this writing,
`serializeTaskFile` (`src/lib/serializer.ts`) iterates every frontmatter key but
only round-trips scalars, arrays and multi-line strings. It drops nested objects
silently because there is no branch for `typeof v === "object"`. A naive
`plugins: { burndown: { points: 5 } }` would be erased on the next save. The
system has to account for that, either by hardening the serializer or by
constraining the value format.

## Considered options

### Data model

- **Second file per task (e.g. `tasks/t1.plugins.json`).** Rejected. It creates a
  second source of truth that must be kept in lockstep with the task file,
  violates invariant #6, breaks the "one file, one task" grepability, and adds a
  merge surface. The architecture document exists precisely to forbid this.
- **Side database / index of extension data.** Rejected for the same reason:
  a cache that has to be invalidated is the thing the whole project avoids.
- **Reserved opaque `plugins.<id>.*` namespace inside the task file (chosen).**
  Extension data lives next to core frontmatter, in a namespace the core never
  interprets. Forward-compatible by construction, diffable, and covered by the
  existing round-trip guarantee once the serializer is hardened for nested
  objects.

### Extension style

- **pi-style pure lifecycle hooks.** Rejected as the sole model. kandown is
  multi-surface; a hook-only API cannot describe which surface a contribution
  targets, so the UI and the store gallery cannot describe an extension without
  executing its code.
- **VS Code-style declarative contribution points plus activation (chosen).**
  A manifest declares what is contributed (for display and for the store); the
  code registers contributions through the API at runtime. Borrows jiti and the
  global/project split from pi, and the contribution-point shape from VS Code.

### Runtime placement

- **Daemon-only.** Rejected. It breaks standalone mode (File System Access API):
  no daemon, no extensions, and web panels would vanish.
- **Browser-only.** Rejected. The CLI and TUI could not reuse gates or commands,
  reintroducing the "one rule, three implementations" drift the dependency-gate
  ADR (0001) was written to end.
- **Hybrid by declared surface (chosen).** Authoritative logic (gates, field
  validation, sync) runs once in Node; rendering (panels, badges) runs in the
  browser. In server mode the daemon is the single mutation authority and the web
  UI emits intents the core applies. Standalone keeps rendering and degrades
  authoritative features gracefully.

### Web sandbox

- **iframe sandbox with postMessage bridge.** Considered. Maximum isolation, but
  heavier to build and to document, and it complicates React-component loading.
- **Same JS realm with a per-panel ErrorBoundary (chosen, for now).** Matches the
  Obsidian model and reuses the existing `ErrorBoundary.tsx`. The token-theft
  risk this would normally open is closed by giving extensions a scoped API
  instead of the raw daemon token or the React store; the core proxies every
  permitted call. A future hardening ADR may move untrusted panels into an
  iframe. This is a deliberate, documented trade, not an oversight.

### Distribution

- **Proprietary store backend on kandown.dev.** Rejected for now. Infrastructure
  to maintain for zero authors at launch.
- **npm prefix convention only.** Insufficient. No gallery, no curation, no
  one-click install, which is an explicit product requirement.
- **Community-curated GitHub index plus web submission form (chosen).**
  `kandown/community-extensions` holds a PR-curated `extensions.json`, the
  Obsidian model. kandown.dev hosts a submission form that opens PRs against it.
  One-click and paste-URL install fetch release assets. npm remains a secondary
  channel for power users and CI.

## Consequences

- **The serializer must round-trip nested objects under `plugins.*`.** This is a
  P0 dependency, with round-trip tests. It also hardens the core against a latent
  bug for any future nested frontmatter, so it is not throwaway work.
- **A new reserved key (`plugins`) enters the task format.** It is opaque to the
  core; the parser and serializer treat it as pass-through. The "single source of
  truth" invariant is preserved because task state still lives only in core
  fields.
- **The dependency gate becomes one instance of a general "gate" contribution
  point.** `dependencies.ts` keeps its single implementation (ADR 0001 holds);
  extension gates compose with it from a shared call site, never by copying the
  rule into a new surface.
- **The web UI gains a Drawer surface for extension panels and a per-panel
  ErrorBoundary.** The core board stays untouched; extensions add around it, not
  inside it, to keep the focused, fast board intact.
- **A new CLI surface appears (`kandown extension create / dev / install /
  purge`).** The core CLI commands stay frozen; extension commands are strictly
  additive.
- **Shipping is phased.** P0 delivers the types, manifest, scaffold, opaque
  namespace and isolation primitives plus one canonical example. Contribution
  points and the store follow in later releases. See the roadmap in
  [`EXTENSIONS.md`](../EXTENSIONS.md).
