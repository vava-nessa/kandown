# Spec review

## Goal

Independently determine whether delivered behavior matches the approved specification.

## Context

Link the approved specification, implementation slice, diff range, and acceptance evidence.

## Constraints

- Review product intent and acceptance only, not preferred coding style.
- Do not invent new requirements.
- Treat accepted decisions, non-goals, and risks as authoritative.

## Traceability matrix

- `AC-1`: implementation location, test or runtime evidence, result
- `AC-2`: implementation location, test or runtime evidence, result

## Acceptance criteria

- [ ] Every in-scope criterion has direct evidence.
- [ ] User-visible behavior matches the approved scenarios.
- [ ] Non-goals and unchanged behavior remain outside the implementation.
- [ ] No material behavior was added without approval.

## Work checklist

- [ ] Read the specification without relying on the worker summary.
- [ ] Inspect behavior and evidence for every criterion.
- [ ] Exercise critical scenarios independently when practical.
- [ ] Record missing, incorrect, or extra behavior.
- [ ] Issue a Pass, Changes required, or Blocked verdict.

## Findings

List criterion ID, observed behavior, expected behavior, evidence, and severity.

## Verification

Record independent scenario execution and its observed result.

## Evidence

Attach the completed traceability matrix, commands, artifacts, and diff range.

## Completion report

State the verdict and which criteria are accepted or blocked.

## Follow-ups

List non-blocking product opportunities separately from required corrections.
