---
id: t243
title: [ARCHITECTURE] Long-term architecture — pluggable backend, pure core, archived as a status, Backlog.md compat
status: Backlog
priority: P4
tags: [architecture, epic, decision]
ownerType: human
created: 2026-07-25
order: 15
updated: 2026-07-26T18:18:27Z
---

# Long-term architecture decisions

## Context

Four structural proposals from `ameliorations_ideas_audit` that are each a week or
more of work and change the shape of the project rather than fixing anything
broken. Kept together because they are one decision, not four: they all hinge on
whether kandown wants to become an embeddable library with a public data layer, or
stay a self-contained app with a CLI.

Nothing here is urgent. This task exists so the ideas are not lost when the report
they came from is deleted.

## Subtasks

- [ ] **Pure core / data layer** (§36) — extract the filesystem-free task logic into
- [ ] **Pluggable `Backend` interface** (§6, §37) — `list/get/create/update/delete/watch`
- [ ] **`archived` as a first-class status** (§2) — today archiving *moves the file*
- [ ] **Backlog.md compatibility** (§4) — a frontmatter alias layer so kandown can

      an importable module with no React and no I/O framework, so it can be unit
      tested without a UI and reused by a future VS Code extension or SDK.
      *Partly true already*: `src/lib/parser.ts`, `serializer.ts`, `dependencies.ts`
      are pure; the coupling that remains is in `store.ts` and the CLI helpers.
      behind an interface, with `file` as the only implementation today. Opens the
      door to SQLite or a remote sync later, and to an in-memory mock for tests.
      into `tasks/archive/`. A reserved virtual status would unify search and the
      API. Counter-argument worth weighing: the folder is visible, obvious in git,
      and matches the file-over-app promise. May well be right to keep as is.
      read and write repos in the Backlog.md schema. Purely an acquisition play;
      only worth it if that migration path is actually wanted.

## Notes

Explicitly **rejected** by the same report and not to be revisited: the three
storage modes with git-ref backends (§5, too niche for the complexity), and the
`renamed`-event auto-renumber (a post-merge script solves it).

Assigned to a human: these are product-direction calls, not implementation work.
