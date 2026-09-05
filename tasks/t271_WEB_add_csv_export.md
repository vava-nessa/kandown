---
id: t271
title: Add CSV export for the board
status: Todo
priority: P2
tags: [web, cli, export]
ownerType: human
created: 2026-07-27
order: 2
updated: 2026-09-05T10:28:22Z
category: WEB
---

# Add CSV export for the board

## Context

Users manage boards with spreadsheets on the side (import into Notion, Airtable, their own reporting). Right now there is no way to get task data out of kandown: the web UI only renders the board, and `kandown list` only prints a terminal table. A clean CSV export gives everyone a spreadsheet-ready snapshot of the board, and doubles as an audit trail ("what was in flight last sprint?").

Export must be deterministic: same board, same sort, same bytes. The web UI and the CLI should produce identical files so the output contract is testable end to end.

Démo live editing

## Subtasks

- [ ] Add a shared `tasksToCsv(tasks)` formatter in `src/lib/` that maps
- [ ] Quote and escape values per RFC 4180 (commas in titles, quotes, newlines in
- [ ] `kandown export <path>.csv` — writes the file, prints the path and row
- [ ] Web UI: an Export button in the board toolbar that downloads the same CSV,
- [ ] Add `src/lib/__tests__/tasks-to-csv.spec.ts` covering escaping, header,
- [ ] Update `README.md` and the TUI help text with the new command

```javascript
  frontmatter fields (id, title, status, priority, assignee, tags) plus the
  checklist state (done count / total) to CSV columns
  descriptions); the first row is the header
  count on stdout, whitespace on stderr, exit 0
  sorted by column then order
  empty board and the CLI/web parity case
```

## Notes

Deterministic order: column order from `kandown.json`, then `order` field, then `id`. Encoding is UTF-8 with a BOM so Excel shows accents correctly. `kandown export -` writes to stdout for piping.
