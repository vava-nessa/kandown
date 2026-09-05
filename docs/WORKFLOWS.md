# Kandown Workflows

Kandown compiles one runtime instruction document for agents. The CLI, agent
launcher, daemon preview, and standalone Settings preview use the same pure
compiler.

## Compiler order

The order is fixed:

1. Immutable Kandown core
2. Real project columns, semantic roles, guidance, and available commands
3. Enabled extension summaries
4. Active workflow protocol
5. Task tracking cadence
6. Active additive skills
7. Global instructions from `~/.kandown/kandown_work.md`
8. Project instructions from `.kandown/kandown_work.md`
9. Target task context or a compact board digest

`caveman`, `standard`, and `complete` control detail without removing safety
invariants. `live`, `balanced`, and `economy` independently control task update
frequency.

Every compiled result includes characters, words, and a model-neutral token
estimate. Settings keeps the overall budget visible on every tab, shows estimates
for workflows, guides, templates, skills, and project instructions, and provides
a full-screen rendered Markdown reader for the complete document. The Workflow
editor presents protocols, guides, and templates as framed Markdown sections.
Local forks pair the source editor with a live rendered preview. The CLI prints
the estimate to stderr while Markdown remains the only stdout content.

## Source package

```text
my-workflow/
  manifest.json
  protocol.md
  guide.md
  board.json
  templates/
    feature.md
```

Packages are data-only. Paths are portable and relative. Runtime files, scripts,
unknown files, path traversal, duplicate ids, and multiple default task templates
are rejected with structured validation errors.

`board.json` has an extensible object root:

```json
{
  "columns": [
    { "name": "Building", "role": "active", "instructions": "Keep evidence current." }
  ],
  "priorities": ["P1", "P2", "P3"]
}
```

Column labels remain free. Workflow placeholders reference semantic roles such as
`{{column:active}}`, never hardcoded English labels.

## Commands

```bash
kandown workflow list
kandown workflow show kandown-standard
kandown workflow template kandown-standard
kandown workflow template kandown-standard standard-task
kandown workflow use diagnose-and-fix
kandown workflow validate ./my-workflow
kandown workflow pack ./my-workflow --output my-workflow.kandown-workflow.md
kandown workflow import ./my-workflow.kandown-workflow.md
kandown workflow store
kandown workflow install <id>
kandown workflow update <id>
kandown workflow update <id> --confirm
```

The portable `*.kandown-workflow.md` capsule is size-limited, length-delimited,
versioned, and validated before persistence.

## Presets and local forks

Board presets are never applied when a workflow is selected. Settings previews
every status migration, preserves unmatched occupied columns, and requires human
confirmation.

Built-in and store workflows are immutable. Editing creates a local fork with the
source id, version, repository, ref, and fork timestamp retained as provenance.

## Skill packages

Kandown ships Code Review, Grill me, Refine, Test Driven, and Release Readiness. A
project can also install data-only skill packages in `.kandown/skills/<id>/` or
global packages in `~/.kandown/skills/<id>/`:

```text
code-review/
  manifest.json
  instructions.md
```

The manifest declares id, name, version, description, and the Markdown instruction
file. Optional `compatibleWorkflows` and `requiredRoles` constraints are checked
before guidance reaches the compiler. Project packages override global packages,
which override immutable built-ins. Legacy flat `<id>.md` skills remain readable.

### Chat buttons

A valid skill manifest may declare one optional top-level `chat` object. When it
does, the web chat renders a button for the skill (GET /api/skills carries the
resolved metadata) and launching it posts `skillId` to POST /api/agent/sessions,
where the daemon assembles the prompt server-side:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `chat.button.label` | string, 1 to 40 chars | yes | Text shown on the chat button |
| `chat.button.icon` | string | no | Icon hint; unknown icons fall back to the default |
| `chat.scope` | `"task"` or `"board"` | yes | Whether the button applies to one task or the board |
| `chat.interactive` | boolean | no | True means the skill asks questions first and waits for answers (default false) |
| `chat.autoApply` | boolean | no | True means the UI may apply the result without extra confirmation (default false) |

Example, the shipped Grill me skill:

```json
{
  "formatVersion": 1,
  "id": "grill-me",
  "name": "Grill me",
  "version": "1.0.0",
  "description": "Ask pointed questions about a task's blind spots before any work starts.",
  "instructions": "instructions.md",
  "chat": {
    "button": { "label": "Grill me" },
    "scope": "task",
    "interactive": true
  }
}
```

Interactive skills (like Grill me) produce only their first step, the numbered
questions, then stop; the session prompt tells the agent to wait for answers.
Non-interactive skills (like Refine) are applied to the task context in one turn.

## Community store

Authors host capsules in their own GitHub repositories. The approved index stores
a pinned release or commit, capsule path, version, and SHA-256 checksum. Kandown
fetches the store only after an explicit user action. Installation validates the
checksum and package. Updates display a diff and require confirmation.
