# Diagnosis and fix

## Goal

Prove the cause of a defect, apply the smallest causal fix, and prevent regression.

## Context

Describe the report, affected users or systems, impact, environment, frequency, and earliest known occurrence.

## Constraints

- Behavior that must not change
- Production, security, privacy, or data boundary
- Scope excluded from this fix

## Symptom

Record the exact error, incorrect output, slowdown, or instability with original evidence.

## Current behavior

Describe what happens now under specific conditions.

## Expected behavior

Describe the established contract or approved outcome.

## Unchanged behavior

List neighboring behavior the fix must preserve.

## Reproduction

- Environment and state:
- Inputs:
- Exact steps or command:
- Observed output:
- Frequency:

## Minimised case

Describe the smallest reliable case that preserves the same failure and how equivalence was confirmed.

## Hypotheses

### Hypothesis 1

- Supporting evidence:
- Distinguishing observation:
- Safe experiment or instrumentation:
- Result:
- Confidence update:

### Hypothesis 2

- Supporting evidence:
- Distinguishing observation:
- Safe experiment or instrumentation:
- Result:
- Confidence update:

## Root cause

Describe the proven causal chain, triggering conditions, and why the failure surfaces where it does.

## Regression test

- Stable seam:
- Expected red reason:
- Red command and observed result:
- Green command and observed result:
- If automation is impossible, reason and deterministic manual substitute:

## Fix scope

Describe the minimal change justified by root-cause evidence and any explicitly avoided refactor.

## Acceptance criteria

- [ ] The original defect is reliably reproduced or the reproduction limitation is explicit.
- [ ] Evidence distinguishes the root cause from competing hypotheses.
- [ ] A focused regression test is observed red before the production fix.
- [ ] The minimal fix makes the focused test green.
- [ ] Broader regression checks and the original real scenario pass.
- [ ] Temporary diagnostics are removed or justified as permanent observability.

## Work checklist

- [ ] Capture symptom, expected behavior, and defect boundary.
- [ ] Reproduce and minimise without changing the failure.
- [ ] Rank hypotheses and run distinguishing experiments.
- [ ] Establish the root cause with evidence.
- [ ] Add and observe focused red proof.
- [ ] Apply the minimal causal fix.
- [ ] Observe green proof and run broader checks.
- [ ] Repeat the original scenario and inspect the diff.

## Verification

List the focused test, neighboring and broad checks, original scenario, environment, and expected results.

## Evidence

- Original reproduction before and after
- Instrumentation or experiment result
- Red and green command output
- Broader check summary
- Manual, browser, API, trace, screenshot, or measurement artifact
- Diff range reviewed

## Completion report

Summarize the root cause, minimal fix, preserved behavior, verification, and files changed.

## Follow-ups

List non-blocking observability, cleanup, or resilience improvements with rationale.
