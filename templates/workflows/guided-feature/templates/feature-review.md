# Feature review

## Goal

Confirm the delivered feature matches clarified intent and the approved architecture without unacceptable regressions.

## Context

Link discovery, architecture approval, implementation slices, evidence, and diff range.

## Constraints

- Respect approved decisions and explicit non-goals.
- Separate blocking defects from optional follow-up work.
- Do not expand scope without user approval.

## Acceptance matrix

- Criterion, implementation location, evidence, reviewer result

## Architecture conformance

Record whether components, interfaces, data flow, error handling, and migration match the approved proposal.

## Acceptance criteria

- [ ] Every feature criterion has accepted evidence.
- [ ] Runtime behavior was independently exercised where practical.
- [ ] The implementation conforms to the approved design.
- [ ] Compatibility, error handling, tests, and diff hygiene are acceptable.

## Work checklist

- [ ] Read authoritative discovery and architecture decisions.
- [ ] Inspect the complete diff and test changes.
- [ ] Rerun critical checks.
- [ ] Exercise the primary and failure user paths.
- [ ] Rank findings and issue a verdict.

## Findings

List severity, criterion or design decision, location, impact, and correction.

## Verification

Record independently rerun commands and observed runtime scenarios.

## Evidence

Attach the matrix, command results, artifacts, and reviewed diff range.

## Completion report

State Pass, Changes required, or Blocked and summarize accepted behavior and blockers.

## Follow-ups

List non-blocking product or engineering work with clear rationale.
