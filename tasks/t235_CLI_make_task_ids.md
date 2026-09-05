---
id: t235
title: Make task IDs configurable (idPrefix + zero padding)
status: Backlog
priority: P2
tags: [cli, config, ux]
ownerType: agent
created: 2026-07-25
order: 6
updated: 2026-09-04T14:49:58Z
category: CLI
---

# Make task IDs configurable

## Context

Task ids are hardcoded as `t1`, `t2`, `t42`. Letting a project choose its own
prefix and padding — `BUG-001`, `EPIC-014`, `FEAT-1042` — is a small change with a
disproportionate perceived upgrade, and it costs nothing at the data layer since
ids are already opaque strings in the frontmatter.

```jsonc
// .kandown/kandown.json
"board": {
  "idPrefix": "T",        // default "t"
  "zeroPaddedIds": 3      // default 0 (no padding)
}
```

## Subtasks

- [ ] Add `idPrefix` / `zeroPaddedIds` to the config schema with safe defaults
- [ ] Use them in the id allocator (`nextTaskId` in `src/lib/store/helpers.ts`
- [ ] Keep reading existing ids unchanged: never renumber, never break `depends_on`
- [ ] Verify the id regex guard in `findTaskPath` (`^[a-zA-Z0-9_-]+$`) still admits
- [ ] Expose the two fields in the Settings page and the TUI settings screen

      and the CLI equivalent) — both must agree, or web and CLI will diverge
      references to already-created tasks
      every generated form — it does for `BUG-001`, confirm for anything else

## Notes

Source: `ameliorations_ideas_audit` §3. Verified not implemented on 2026-07-25.
