---
id: t237
title: [CLI] TUI — render markdown properly in the task detail (wrap, headings, lists)
status: Backlog
priority: P3
tags: [cli, tui, ux]
ownerType: agent
created: 2026-07-25
order: 9
updated: 2026-07-26T18:18:27Z
---

# TUI — render markdown properly in the task detail

## Context

The TUI detail view dumps raw markdown line by line with no wrapping, so a long
paragraph is simply truncated at the terminal edge and `**bold**`, list markers and
code fences show as literal syntax. `FABLE_CLI` §2.1 called this the number one
reason the TUI reads as "an unreadable wall of text" — and it is the one thing that
makes the TUI unusable for actually *reading* a task rather than navigating to it.

Column scrolling, bounded detail scroll, `showStatus`, resize handling and mouse
hit-testing have all since been fixed; this is the remaining piece of that report.

## Subtasks

- [ ] Write a small markdown → Ink renderer (~150 lines, no new dependency):
      hard wrap at panel width, `##` headings bold + accent, `- ` lists with `•`,
      `- [ ]` / `- [x]` as `○` / `✓`, inline bold/italic/code, fenced blocks as an
      indented dark block, OSC 8 links (the pattern already exists in the header)
- [ ] Structure the task header: id + wrapped title, a meta chip line, and a
      `⛔ Blocked by: t201 (In Progress)` block showing *resolved* dependency status
      rather than raw ids
- [ ] Render subtasks as their own section with a progress bar, above the body
- [ ] Add `d`/`u` half-page and `g`/`G` jump to the existing bounded `j`/`k` scroll,
      with a percentage indicator

## Notes

Source: `FABLE_CLI` §2.4. The wider "focus + preview two-pane layout" from §2.2 of
the same report is a bigger, separate call — build the renderer first, since it is
needed by both the current full-screen detail and any future preview pane, then
decide on the layout with something concrete to look at.
