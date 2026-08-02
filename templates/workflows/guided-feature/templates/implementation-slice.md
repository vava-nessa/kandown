# Implementation slice

## Goal

Deliver one independently verifiable part of the approved feature design.

## Context

Link discovery, approved architecture, dependencies, and prior slice results.

## Constraints

- Approved files, modules, or interfaces
- Behavior that must remain unchanged
- Scope specifically deferred to another slice

## Architecture traceability

Describe which approved seams and decisions this slice implements.

## Acceptance criteria

- [ ] Slice behavior is observable and matches the approved design.
- [ ] Relevant error, compatibility, and migration behavior is covered.
- [ ] Required automated checks pass.
- [ ] Actual runtime behavior is exercised when relevant.

## Work checklist

- [ ] Load the approved design and affected code.
- [ ] Confirm dependencies and current baseline.
- [ ] Implement only this slice.
- [ ] Add or update appropriate tests.
- [ ] Run focused and broader checks.
- [ ] Exercise the real feature path and inspect the diff.

## Design deviations

Record any discovered mismatch. Stop for reapproval before implementing a material deviation.

## Verification

List exact commands, scenarios, environments, and expected outcomes.

## Evidence

Attach concise command results, runtime artifacts, changed files, and diff range.

## Completion report

Summarize delivered behavior, architecture conformance, decisions, and review readiness.

## Follow-ups

List later slices, accepted limitations, and any proposal updates needed.
