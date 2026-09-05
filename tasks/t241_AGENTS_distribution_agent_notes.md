---
id: t241
title: Agent distribution — Translation Notes in AGENT_KANDOWN.md + `kandown skill install`
status: Backlog
priority: P3
tags: [agents, docs, cli]
ownerType: agent
created: 2026-07-25
order: 13
updated: 2026-08-15T11:08:30Z
category: AGENTS
---

# Agent distribution — Translation Notes + skill install

## Context

Two related gaps in how kandown reaches agents that are not Claude Code.

**Translation Notes.** `templates/AGENT_KANDOWN.md` is written vendor-neutrally but
never states how its primitives map onto each host. A short table at the end —
Claude Code / Codex CLI / Cursor / Gemini CLI / Aider / OpenCode, and where each
one expects its rules file — makes the doc usable by all of them instead of
implicitly Claude-shaped.

**`kandown skill install`.** There is no command to (re)install the agent reference
into a project, or to pull one from a URL. `kandown init` writes it once; after
that a user who deleted or customised the file has no supported way back, and the
community has no way to distribute a variant.

## Subtasks

- [ ] Add a "Translation Notes" table to `templates/AGENT_KANDOWN.md`
- [ ] `kandown skill install [--out <path>] [--force] [--from <url>]`, defaulting to
- [ ] Refuse to overwrite a modified file without `--force`, and say what differs
- [ ] Document the command in the README and in `kandown help`

      (remember: edit the template, never the synced root copy — `pnpm sync:agent`)
      the bundled template

## Notes

Source: `ameliorations_ideas_audit` §27 and §40.
The `/orchestrate` and `/orchestrate-init` skill proposals (§25-26) from the same
report are **content, not kandown code** — they belong in a skills repo, not here.
Deliberately not ticketed as engineering work.
