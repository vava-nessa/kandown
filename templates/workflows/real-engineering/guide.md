# Real Engineering

## When to use it

Choose Real Engineering for meaningful feature work that benefits from product alignment, vertical delivery, deliberate testing, and independent review. It is designed for teams that want engineering discipline without turning every feature into a large initiative.

The workflow has four defining properties:

1. Behavior is agreed in a specification before code.
2. Delivery proceeds through thin tracer-bullet slices across the real system.
3. Test-first work is selected at stable, valuable seams rather than applied mechanically everywhere.
4. Standards and Spec reviews are independent so one kind of success cannot hide failure on the other.

## Flow

### 1. Approve the feature specification

The specification states the problem, intended users, numbered acceptance criteria, settled decisions, testing decisions, risks, and non-goals. It ends with open questions. Resolve material questions before approval.

The specification is authoritative for product intent. Implementation discoveries may cause it to change, but that change must be recorded and reapproved rather than smuggled into code.

### 2. Design tracer-bullet slices

Start with the thinnest end-to-end path that proves the important integration seams. A good first slice may use a narrow happy path, but it must deliver observable behavior through the real boundaries. It should not be a stack of disconnected scaffolding.

Later slices expand behavior, edge cases, resilience, performance, or polish. Give every slice:

- acceptance criterion IDs;
- dependencies;
- owned files or seams when concurrency is planned;
- explicit automated and manual verification;
- a clean completion boundary.

Parallel work is permitted only for unblocked slices with disjoint write scope.

### 3. Select test-first seams

Use red and green cycles when a test can express a stable contract and fail for the intended missing behavior. High-value seams include domain rules, parsers, public APIs, regressions, and integration boundaries with deterministic harnesses.

Do not force test-first work around transient UI layout details or implementation internals when the test would be brittle and add little confidence. In those cases, define stronger runtime or manual evidence instead.

For a selected seam:

1. Add or isolate the focused test.
2. Run it and capture the expected failure.
3. Implement only enough behavior to pass.
4. Run it again and capture the pass.
5. Refactor only while the contract stays green.

### 4. Verify the slice

Run focused checks during implementation and required broader checks before review. Exercise the actual user path for integration work. Evidence must map back to acceptance criterion IDs.

A slice that compiles but cannot demonstrate its behavior is not ready for review.

### 5. Run independent reviews

The Standards reviewer checks repository rules, architecture fit, safety, maintainability, regression risk, test quality, error handling, and diff hygiene. It does not reinterpret the requested product behavior.

The Spec reviewer checks each acceptance criterion and non-goal against the delivered behavior and evidence. It does not fail compliant work merely because another architecture might be preferable.

Use separate tasks or fresh contexts. Record severity-ranked findings and a verdict for each axis. Blocking findings return the implementation slice to active work. Conflicts that require a product decision escalate to the user.

## Gates

| Gate | Exit condition |
|---|---|
| Specification approval | Intent, criteria, decisions, and non-goals are accepted |
| Slice readiness | Dependencies resolved, vertical outcome defined, verification specified |
| Implementation review | Required checks and runtime proof are attached |
| Standards acceptance | No unresolved blocking standards finding |
| Spec acceptance | Every in-scope criterion has accepted evidence |
| Feature closure | All selected slices and cross-cutting checks are accepted |

## Escalation

Pause when requirements change, a slice cannot remain independently valuable, testing requires an unjustified seam, file ownership overlaps with concurrent work, or reviewers identify a decision outside the approved contract.

## Evidence standard

Evidence should identify criterion IDs and preserve observed results:

- `AC-2`: focused test observed red before implementation and green after it
- `AC-3`: browser run completed the real user journey, screenshot linked
- Standards diff range and verdict
- Spec criterion matrix and verdict

Narrative confidence is not a substitute for executable proof.
