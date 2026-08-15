---
id: t234
title: Decide whether the agent read commands (q / context / next) add anything over `kandown work`
status: Backlog
priority: P3
tags: [cli, agents, decision]
ownerType: human
created: 2026-07-25
order: 6
updated: 2026-07-27T00:33:35Z
category: CLI
---

# Decide the fate of the `q` / `context` / `next` proposals

## Context

`FABLE_CLI` Partie 3.2 proposed a rich agent read surface: `kandown q` with
`--fields` / `--format` / `--ready` / `--blocked`, plus `kandown context` (a token-
budgeted board digest) and `kandown next` (the task to pick up).

Since that report was written, **`kandown work` shipped and covers most of it**: it
prints the agent rules, optional project instructions, a live board digest with
per-column counts and blocked-by annotations, and a computed *next actionable task*
— and the Settings page has a configurator to trim each block and estimate the
token cost.

So this is a scoping decision, not an implementation task. Building `q` now would
add a second, overlapping read surface for the same audience.

## Subtasks

- [ ] Compare `kandown work` output against the `q` / `context` / `next` spec and
      list what is genuinely missing (likely candidates: `--ready` / `--blocked`
      filters, `--fields` selection, `--count`, composable `ids` output)
- [ ] Decide: extend `kandown list` with those filters, or introduce `q` as a
      separate command — not both
- [ ] Record the decision in `docs/ARCHITECTURE.md` so it is not re-litigated

## Notes

This is deliberately assigned to a human: it is a product-surface call, not a fix.
Related: [[t233]] covers the mutation half of the same report, which is *not*
covered by `kandown work` and should proceed regardless.
