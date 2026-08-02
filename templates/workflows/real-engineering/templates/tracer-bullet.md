# Tracer-bullet slice

## Goal

Deliver one thin, observable path through the real system.

## Context

Link the approved specification, relevant architecture, and prior slice evidence.

## Constraints

- Owned files or seams
- Behavior that must remain unchanged
- Accepted shortcuts for this slice, if any

## Specification traceability

- Acceptance criteria: `AC-...`
- Dependencies: task IDs
- User path proved by this slice

## Vertical path

Describe the input, boundaries crossed, persistence or side effects, and observable output.

## Test-first seams

- [ ] Contract selected for a red and green cycle
- [ ] Expected red reason recorded before implementation
- [ ] Green result recorded after implementation

Explain why each selected seam is stable and valuable. State why any important behavior uses another form of proof.

## Acceptance criteria

- [ ] Referenced specification criteria are satisfied for this slice.
- [ ] The real end-to-end path is exercised.
- [ ] Slice-specific compatibility and error behavior are preserved.

## Work checklist

- [ ] Load the specification and relevant code.
- [ ] Establish selected red proof.
- [ ] Implement the smallest vertical behavior.
- [ ] Establish green proof and refactor safely.
- [ ] Run broader and runtime verification.
- [ ] Prepare Standards and Spec reviews.

## Verification

List focused tests, broader checks, and the direct user or system scenario.

## Evidence

Map commands, output, artifacts, and diff range to acceptance criterion IDs.

## Completion report

Summarize behavior delivered, tradeoffs, changed files, and review readiness.

## Follow-ups

Record later slices, accepted limitations, and newly discovered dependencies.
