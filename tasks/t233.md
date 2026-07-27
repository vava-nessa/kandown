---
id: t233
title: Add targeted task mutation commands (set / check / report / done)
status: Backlog
priority: P2
tags: [cli, agents]
ownerType: agent
created: 2026-07-25
order: 5
updated: 2026-07-26T18:18:27Z
---

# Add targeted task mutation commands

## Context

The CLI covers `create / move / assign / list / show / commit`, but there is no way
to patch a *field* or *one subtask* without rewriting the whole file. So an agent
that wants to tick a checkbox or append a report reads the `.md`, edits it, and
writes it back — the single most common way frontmatter gets corrupted, and the
reason the old parser bug was so destructive.

Giving agents narrow, safe verbs removes the whole class of problem: the CLI owns
frontmatter validity, the dependency gate, and archive/folder consistency.

## Subtasks

- [ ] `kandown set <id> priority=P1 assignee=claude due=2026-07-30` — patch N
      frontmatter fields in one call, preserving everything else verbatim
- [ ] `kandown check <id> <n>` / `--uncheck` — toggle subtask *n*
      (`kandown show <id>` should number them so the index is discoverable)
- [ ] `kandown report <id> --file -` — append a `## Report` section from stdin
- [ ] `kandown done <id> --report "..."` — move to the terminal column + write the
      report in one call, respecting the `depends_on` gate
- [ ] Keep the existing output contract: data on stdout, decoration on stderr,
      typed exit codes (0 ok · 1 usage · 2 not found · 3 blocked · 4 conflict)
- [ ] Expose the same verbs through the MCP server (`src/cli/lib/mcp.ts`) so the
      shell and MCP surfaces cannot drift
- [ ] Document them in `templates/AGENT_KANDOWN.md` as the preferred path, with
      direct file editing kept as the documented fallback

## Notes

Source: `FABLE_CLI` Partie 3.3. The read-side proposals from the same section
(`kandown q`, `context`, `next`) are largely covered by `kandown work`, which
already prints the rules, the board digest and the computed next actionable task —
see [[t234]] before building anything new there.
