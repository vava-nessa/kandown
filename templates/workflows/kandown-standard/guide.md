# Kandown Standard

## When to use it

Choose Kandown Standard for a small or medium change when the desired outcome is understood, the likely code area is known, and one focused task can carry the work. It is intentionally safer than an unstructured quick fix: acceptance criteria and evidence remain mandatory, but the workflow does not manufacture separate specification or architecture artifacts.

Do not use it when product behavior needs discovery, the design crosses important architectural seams, execution spans several sessions, or the problem is a defect with an unknown cause.

## Flow

### 1. Make the task ready

A task is ready when its Goal describes one observable outcome, Context points to the relevant request or code, Constraints protect important boundaries, and Acceptance criteria can be checked. Record dependencies explicitly.

If the agent cannot state what success looks like, the task belongs in Backlog. Ask for the missing decision rather than guessing.

### 2. Plan briefly

Read repository instructions and the affected code before writing the Work checklist. Keep the checklist concrete and short. Each item should move the task toward its acceptance criteria. Avoid research plans that merely say to inspect files without explaining what decision that inspection supports.

If planning reveals several independent outcomes, split them into dependency-aware tasks or switch workflows.

### 3. Implement narrowly

Change the smallest coherent surface that delivers the goal. Follow existing conventions. Avoid opportunistic cleanup, speculative extensibility, and unrelated dependency changes. Record any necessary deviation from scope before taking it.

Update checklist reports according to the configured tracking policy. The task file must remain sufficient for another agent or human to understand the current state.

### 4. Verify with evidence

Use the cheapest reliable feedback first:

1. Run focused tests for the changed behavior.
2. Run relevant type, lint, build, or broader test checks required by the repository.
3. Exercise the actual endpoint, page, command, or integration when static checks cannot prove runtime behavior.
4. Inspect the final diff for accidental files, debug output, secrets, generated-file edits, and scope creep.

Evidence should contain commands and results, not only conclusions. Summarize successful output and retain enough failure output to explain any remaining issue.

### 5. Review and close

Review asks two questions: did the change meet the task, and did it introduce an avoidable defect or regression? Findings return the same task to active work unless they are explicitly accepted follow-ups.

Done requires accepted criteria, reproducible evidence, a clear completion report, and no hidden blocking work.

## Gates

| Transition | Required proof |
|---|---|
| Backlog to Ready | Clear goal, constraints, acceptance criteria, and dependencies |
| Ready to In Progress | Relevant guidance and code loaded, short checklist written |
| In Progress to Review | Implementation complete, checks run, runtime proof added when relevant, diff inspected |
| Review to Done | Evidence accepted and blocking findings resolved |

## Escalation

Ask for direction when scope is ambiguous, a destructive action is required, the repository state conflicts with the task, required verification is unavailable, or a design decision would create a new public contract. Recommend a more structured workflow when the task outgrows one focused cycle.

## Evidence standard

Prefer entries such as:

- `pnpm test parser`: pass, 18 tests
- `pnpm typecheck`: pass
- Manual: created a task, reloaded the board, and confirmed its status persisted
- Diff: reviewed `abc123..def456`, no unrelated files

Do not treat "looks correct" or "should pass" as evidence.
