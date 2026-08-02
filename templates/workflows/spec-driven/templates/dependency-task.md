# Dependency task

## Goal

Deliver one independently verifiable outcome from the approved technical plan.

## Context

Link the specification, technical plan, dependencies, and relevant prior task reports.

## Constraints

- Owned files or system seam
- Principle or approved exception
- Behavior and scope that must remain unchanged

## Traceability

- Requirements: `REQ-...`, `NFR-...`
- Acceptance scenarios: `AC-...`
- Success criteria contribution: `SC-...`
- Dependencies: task IDs

## Planned outcome

Describe the implementation boundary and how it unlocks later tasks or delivers a user story.

## Acceptance criteria

- [ ] Referenced requirements are implemented within this task scope.
- [ ] Referenced scenarios have reproducible evidence.
- [ ] Principle and compatibility constraints remain satisfied.
- [ ] The outcome can be reviewed independently.

## Work checklist

- [ ] Load only the relevant specification and plan context.
- [ ] Confirm dependencies are complete and baseline is stable.
- [ ] Establish expected failing proof when tests are in scope.
- [ ] Implement the planned outcome.
- [ ] Run focused, broader, and runtime verification.
- [ ] Update traceability and inspect the final diff.

## Plan deviations

Record any requirement, architecture, dependency, or complexity change. Reapprove the affected upstream artifact before proceeding.

## Verification

Map exact commands and scenarios to each referenced ID.

## Evidence

- `REQ / AC ID`: command, observed result, artifact
- Principle check result
- Diff range and changed files

## Completion report

Summarize delivered IDs, implementation decisions, deviations, verification, and unlocked tasks.

## Follow-ups

List deferred IDs or improvements that are outside the approved task scope.
