# Standards review

## Goal

Independently determine whether the implementation meets repository and engineering standards.

## Context

Link the implementation task, diff range, repository guidance, and verification evidence.

## Constraints

- Review standards only, not whether the product specification was the best choice.
- Respect authoritative decisions and documented accepted risks.
- Do not modify the implementation while reviewing.

## Review scope

- Diff range:
- Files:
- Repository rules:

## Acceptance criteria

- [ ] Repository instructions and architecture invariants are respected.
- [ ] Error handling, safety, compatibility, and maintainability are adequate.
- [ ] Tests are meaningful and do not weaken existing coverage.
- [ ] The diff contains no unrelated or accidental changes.

## Work checklist

- [ ] Read repository guidance and authoritative decisions.
- [ ] Inspect the full diff and affected callers.
- [ ] Evaluate tests and verification evidence.
- [ ] Rank findings by severity with precise locations.
- [ ] Issue a Pass, Changes required, or Blocked verdict.

## Findings

List only actionable findings with severity, location, impact, and required correction.

## Verification

Record any checks rerun or additional evidence inspected.

## Evidence

Cite files, lines, commands, and diff range supporting the verdict.

## Completion report

State the verdict and summarize blocking findings. Keep non-blocking follow-ups separate.

## Follow-ups

List optional standards improvements that are outside the approved scope.
