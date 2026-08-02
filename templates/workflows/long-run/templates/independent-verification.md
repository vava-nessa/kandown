# Independent verification

## Goal

Verify a completed milestone from a fresh context against its acceptance contract and real evidence.

## Context

Link the living plan, milestone task, latest handoff, baseline, and diff range.

## Constraints

- Do not rely on the worker's conclusion as proof.
- Do not change implementation while verifying.
- Preserve authoritative plan decisions and accepted risks.

## Verification scope

- Milestone outcome:
- Acceptance criteria:
- Diff range:
- Baseline and runtime environment:

## Acceptance criteria

- [ ] The milestone outcome is independently observable.
- [ ] Baseline and relevant checks pass as reported.
- [ ] Test changes are valid and do not weaken requirements.
- [ ] Diff scope, recovery, and handoff are accurate.
- [ ] No blocking regression or integration risk remains.

## Work checklist

- [ ] Read the plan and milestone contract without relying on summary alone.
- [ ] Inspect the diff and affected callers.
- [ ] Rerun focused and broader checks.
- [ ] Exercise runtime behavior where practical.
- [ ] Review test changes and handoff accuracy.
- [ ] Rank findings and issue a verdict.

## Findings

List severity, location or criterion, observed evidence, impact, and required correction.

## Verification

Record independently executed commands, environment, and observed outcomes.

## Evidence

Attach command results, artifacts, inspected diff range, and acceptance mapping.

## Verdict

Pass, Changes required, or Blocked. Explain what this verdict unlocks or prevents.

## Completion report

Summarize accepted criteria, blocking findings, baseline result, and plan updates required.

## Follow-ups

List non-blocking risks or improvements that do not prevent milestone acceptance.
