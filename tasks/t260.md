---
id: t260
title: Delete AGENT_KANDOWN.md — the CLI is the only source of agent instructions
status: In Progress
assignee: pi
priority: P1
tags: [architecture, cli, agents, breaking]
ownerType: human
created: 2026-07-26
order: 0
updated: 2026-08-04T23:16:41Z
---

# Delete AGENT_KANDOWN.md

## Context

Agent instructions must come from the CLI, at the moment they are asked for. Not
from a Markdown file sitting in the user's repository. The file is a copy, and a
copy of instructions is a copy that goes stale, gets hand-edited, gets committed
half-modified, and then quietly disagrees with the CLI that generated it.

Half of this migration already happened: `readAgentDoc()`
(`src/cli/lib/board-reader.ts`) deliberately reads the base rules **from the
installed package**, never from a project-local copy, with a comment saying exactly
why — a per-project copy goes stale the moment the package updates. The rendering
path is already right. What remains is the file that path stopped using.

Today the same content still exists in three places:

| Copy | Written by | Read by |
|---|---|---|
| `templates/AGENT_KANDOWN.md` (packaged) | authored by hand | `readAgentDoc()` — **the live path** |
| `.kandown/AGENT_KANDOWN.md` (user project) | `src/cli/lib/init.ts` on init | nothing — it is dead weight the user sees |
| `AGENT_KANDOWN.md` (this repo's root) | `scripts/sync-agent-kandown.js` on build | humans reading the repo |

This is a violation of the project's own rule — one source of truth — that survived
because each copy was added for a defensible reason at the time.

Prerequisite for [t259](t259.md): making the workflow selectable is far simpler with
one delivery path to parameterize instead of three copies to keep in sync.

## What "delete" means, precisely

- **Gone from the user's project.** `kandown init` stops writing
  `.kandown/AGENT_KANDOWN.md`, and existing ones are removed on migration. An agent
  that wants the rules runs `kandown work` (or whatever the explicit command becomes)
  and gets them on stdout, current with the installed version.
- **Gone from this repository's root.** The generated `AGENT_KANDOWN.md` and
  `scripts/sync-agent-kandown.js` go away with it, along with its line in the build
  pipeline and in the generated-files table.
- **`.kandown/instructions.md` stays.** It is *project-specific* content the user
  writes, not a copy of ours — that is the whole difference. Same for the global
  `~/.kandown/instructions.md` layer.

**One open decision:** does `templates/AGENT_KANDOWN.md` — the packaged authoring
source `readAgentDoc()` reads — survive as an internal file, or does the text move
into TypeScript?

*Recommendation: keep it packaged, and treat it as CLI data rather than a document.*
It lives inside `node_modules`, not in the user's repo; it is never copied, never
edited, and never out of date because it ships with the version being run. Prose is
authored far better in Markdown than in template literals, and the diffs stay
readable. The rule being enforced is "no instruction file in the user's project and
no second copy", and keeping the packaged source honours it. If the intent is
literally zero Markdown anywhere in the pipeline, say so and it becomes a string
module instead — that is a bigger, uglier change for no behavioural gain.

## Subtasks

- [x] Stop `kandown init` from copying generated agent documents.
  [REPORT] Init now installs only the managed `kandown work` bootstrap line and
- [x] Migrate existing projects without losing edited documents.
  [REPORT] Runtime migration removes hash-matched generated copies, backs up
- [x] Make the CLI and launcher consume one runtime instruction source.
  [REPORT] Both surfaces now call `compileProjectKandownWork`; `kandown work t260`
- [x] Delete generated sources and remove the build sync step.
  [REPORT] Deleted both templates, the root generated copy, and the sync script;
- [x] Update core repository documentation and filesystem adapters.
  [REPORT] Updated AGENTS, README, architecture, template README, browser file
- [x] Replace the legacy Settings preview with the exact shared compiler output.
  [REPORT] Replaced the legacy three-block/raw-template configurator with the
- [ ] Update website documentation and add the breaking-change release note.

    never copies `AGENT.md` or `AGENT_KANDOWN.md`.
    divergent files collision-safely, migrates both instruction scopes to
    `kandown_work.md`, and is covered by 11 tests.
    was exercised directly against this repository.
    `pnpm build` no longer regenerates them and passes successfully.
    helpers, and launcher documentation to the dynamic compiler contract.
    shared compiler preview and immutable core controls.

## Notes

This is a **breaking change for agent setups in the wild**: anything whose prompt
says "read `.kandown/AGENT_KANDOWN.md`" stops working and must run a command
instead. It needs a changelog entry that says so in those words, and the migration
should be loud enough that a user notices once and never again.

Worth stating plainly in the docs, because it is the actual argument: a file can be
edited, forked, and left behind by an update. A command cannot — it always answers
with the rules of the version that is installed.
