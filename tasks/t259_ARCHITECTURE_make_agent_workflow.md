---
id: t259
title: Make the agent workflow chosen, not imposed
status: Review
assignee: codex
priority: P1
tags: [architecture, agents, workflow, breaking, pre-v1]
ownerType: human
created: 2026-07-26
order: 1
depends_on: [t260]
updated: 2026-09-05T09:36:00Z
category: ARCHITECTURE
---

# Make the agent workflow chosen, not imposed

## Context

Kandown ships one opinion about how an agent should work — plan, take one task,
check off subtasks, write a report, move the column — and every project that
installs it gets that opinion whether it suits the work or not. The opinion is a
good one. It should still be **a choice**, not a law: some teams want a PRD-first
flow, some want strict TDD, some want research loops, some want almost no ceremony.

This is a pre-V1 refactor and the user considers it essential: the protocol must
become a slot, with today's rules as the default entry rather than the only one.

It is also the piece without which [t258](t258.md) has nothing to plug into. A store
of installable workflows is meaningless while the workflow is hardcoded — this task
turns the protocol into something a store entry can *be*.

## What has to change

The instruction pipeline is currently: packaged base rules → global
`instructions.md` → project `instructions.md` → board digest, assembled by
`readAgentDoc()` (`src/cli/lib/board-reader.ts`) and printed by `kandown work`.

**The form of that output is already configurable, the content is not.**
`WorkOutputConfig` (`src/lib/types.ts`) already exposes `baseRulesMode`
(`verbose` | `optimized` | `caveman` | `full` | `concise`), `sectionOrder`,
`includeBaseRules` and a `rawTemplate`, with a settings UI in
`WorkOutputConfigurator.tsx`. So a project can already choose *how much* of the
protocol it gets, and in what order — it just cannot choose *which* protocol. That
existing machinery is the natural place to hang this: add the workflow selection to
the config that already governs the output, rather than inventing a parallel one.

## Design decisions to settle

- **Exclusive, not composed.** One active workflow at a time, like a theme.
  Recommended, and consistent with the store's promise — "choose *a* workflow",
  singular. Two workflows will contradict each other on when to stop and how to
  plan, and merging contradictions produces an agent that follows neither. If
  composition is ever wanted, it needs explicit precedence rules, and that is a
  much larger design.
- **What is a workflow made of.** At minimum: the protocol prose, the column
  semantics it assumes, and the task-file conventions it expects (subtasks,
  `report:`, statuses). A workflow that assumes columns the board does not have must
  fail loudly at selection time, not silently at agent time.
- **What stays non-negotiable.** Some rules are kandown's data model, not workflow
  opinion: the frontmatter round-trip, `depends_on` gating, archive folder/flag
  agreement, stdout-is-data. These belong in a **core** section every workflow
  inherits and none can override. Separating "kandown facts" from "workflow
  opinions" inside today's `AGENT_KANDOWN.md` text is the real work of this task.
- **Where the selection lives.** `.kandown/kandown.json`, next to the other project
  choices, so all three interfaces read it from the existing config path.

## Subtasks

- [x] Split core facts from replaceable workflow opinion.
  report: The compiler always emits immutable safety invariants first and loads
    the selected workflow protocol as a later independent layer.
- [x] Add exclusive workflow selection to the shared config.
  report: `workflow.active` defaults to `kandown-standard`; skills and tracking
    cadence remain independent additive settings.
- [x] Make every agent surface use one compiler.
  report: CLI, launcher, daemon preview, and standalone Settings preview call
    `compileKandownWork` instead of reconstructing instructions.
- [x] Define and validate one data-only on-disk workflow format.
  report: Folder packages and portable capsules share version 1 validation,
    path safety, task templates, board presets, attribution, and provenance.
- [x] Validate workflow requirements against semantic board roles.
  report: Missing roles produce structured diagnostics; presets are optional,
    previewed, confirmed, and preserve occupied unmatched columns.
- [x] Add web and CLI selection surfaces.
  report: Settings now has Workflow, Skills, and Kandown Work tabs. CLI supports
    list, show, use, validate, pack, import, store, install, and update preview.
- [x] Ship multiple workflows beyond the default.
  report: Six built-ins cover balanced work, engineering slices, guided features,
    specs, long-running work, and diagnosis.

## Notes

Sequencing: [t260](t260.md) first. Making the protocol selectable while the same text
also exists as a Markdown copy in every user project means shipping a feature whose
output half the agents in the wild will not see, because they are still reading a
file that no longer reflects the choice.

The migration risk worth naming: users who hand-edited their instructions to fake a
custom workflow. Once workflows are real, those edits should be either preserved as
project instructions or converted into a local workflow — not silently overwritten.

## Completion report

The protocol is now a slot. `compileKandownWork` emits a fixed order that no
workflow can reorder: immutable Kandown core first, then the real columns with
their semantic roles and available commands, then extensions, then the selected
workflow protocol, then tracking cadence, additive skills, global and project
instructions, and finally the task context or board digest. Selection lives in
`.kandown/kandown.json` under `workflow.active`, exclusive by construction, with
`skills` and `trackingCadence` as independent additive settings. Six built-ins
ship: Kandown Standard, Real Engineering, Guided Feature, Spec Driven, Long Run,
Diagnose & Fix. Workflow packages are data only, validated at version 1, and
travel either as a folder or as a single portable capsule.

Verification, this session, on the current tree:

- `pnpm vitest run`: 44 files, 506 tests, all passing.
- `pnpm build`: clean (vite + tsup, no type errors).
- Fresh `kandown init` in a scratch project defaults to `kandown-standard`.
- `kandown workflow use spec-driven` swaps only the protocol layer: diffing the
  compiled `kandown work` output before and after shows the Kandown Core block
  byte-identical and the `## Workflow:` section replaced.
- Selection fails loudly, not silently: on a board with the Review column
  removed, `kandown workflow use real-engineering` prints `Workflow requires
  missing column roles: review.`, exits 1, and leaves `workflow.active`
  unchanged.
- Capsule round trip: `workflow pack templates/workflows/spec-driven --output
  sd.kandown-workflow.md` then `workflow import` writes
  `.kandown/workflows/spec-driven`, and `workflow list` then shows it as
  `[local]` shadowing the built-in. Exit codes are correct on the failure path
  (`workflow validate <missing dir>` exits 1).
- Web surface exercised live at `http://localhost:2051`: Settings, Agent
  instructions, tab **Workflow** lists the six built-ins, shows the active one
  (Real Engineering) with its required roles, protocol/guide/template counts,
  token budget, attribution, Fork to edit, and a Community library entry. The
  Skills and Kandown Work tabs are present alongside it.

Shipped to users in v0.47.0 "Kandown Workflows"; `docs/WORKFLOWS.md` and the
README section are current. This session added one line to the AGENTS.md read
order so `docs/WORKFLOWS.md` is discoverable from the entry point.

**Proposed move: Review, then Done, for human confirmation.** Note the gate:
[t260](t260.md) is still In Progress (6/7 subtasks), and t259 declares
`depends_on: [t260]`, so the terminal move is legitimately blocked until t260
lands. Nothing here should bypass it.

Non-blocking follow-ups found while verifying, both outside this task's scope:

- Deep-link routing creates task files. Opening `http://localhost:2051/settings`
  created `tasks/settings.md` on disk from an unknown path segment. An unknown
  deep link should resolve to nothing, not write a task. (The stray file was
  deleted.)
- The Settings navigation does not list a Themes page even though `ThemesPanel`
  is wired in `SettingsPage.tsx`.
