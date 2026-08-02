# Diagnose & Fix

## When to use it

Choose Diagnose & Fix for wrong, failing, unstable, or unexpectedly slow behavior when the cause is not yet proven. The workflow protects against the common failure mode of changing plausible code before understanding the defect.

The core sequence is reproduce, minimise, hypothesise, instrument, establish a red test, apply the minimal fix, then prove regression and real behavior.

## Flow

### 1. Define the defect boundary

Record the symptom, current behavior, expected behavior, unchanged behavior, environment, frequency, impact, and earliest known occurrence. Attach exact errors, traces, inputs, or screenshots when available.

Unchanged behavior matters because it defines what the fix must preserve. If expected behavior is a product decision rather than an established contract, resolve that decision before diagnosis.

### 2. Reproduce reliably

Follow the real user or system path first. Capture commands, inputs, environment, and output. A reliable reproduction should fail consistently enough to compare experiments.

If the issue is intermittent, identify controllable factors such as timing, seed, load, cache state, network condition, or data shape. Do not claim reproduction from a similar but causally different symptom.

### 3. Minimise the case

Remove unrelated inputs, components, and steps while preserving the same failure. Minimise to the narrowest layer that still demonstrates the defect, but retain an end-to-end reproduction for final proof.

A smaller case improves iteration speed and helps reveal which boundary owns the behavior.

### 4. Form and test hypotheses

List a small ranked set of hypotheses. For each one, state:

- why existing evidence supports it;
- what observation would distinguish it;
- the cheapest safe experiment;
- the result and updated confidence.

Instrument only what separates hypotheses. Prefer temporary logs, focused assertions, traces, or controlled inputs over broad debug noise. Remove temporary instrumentation before closure unless it is useful permanent observability.

Root cause describes the causal chain and why the observed conditions trigger it. The location where an exception surfaces may not be the root cause.

### 5. Establish red proof

Add a regression test at the narrowest stable seam that captures expected behavior. Run it before the production fix and record that it fails for the intended reason.

If automation is impossible, explain why and define a deterministic manual red scenario. Lack of a test is an exception that requires stronger evidence, not permission to skip proof.

### 6. Apply the minimal causal fix

Change only what the root-cause evidence justifies. Preserve unchanged behavior and avoid unrelated refactors. If the fix requires architecture or product changes, stop and obtain approval.

Run the focused test until green. Then run relevant neighboring and broader checks to catch regressions.

### 7. Prove the real behavior

Repeat the original end-to-end reproduction, not only the minimised test. Use direct API calls, scripts, browser automation, screenshots, traces, or performance measurements as appropriate.

Compare before and after evidence. For performance defects, use repeatable samples and report the measurement method, not a single anecdotal run.

### 8. Review and close

The reviewer checks whether the root cause is proven, the regression test would fail without the fix, the patch is minimal, unchanged behavior is protected, temporary diagnostics are removed, and the original scenario now passes.

## Gates

| Gate | Exit condition |
|---|---|
| Ready for diagnosis | Symptom and expected behavior recorded, reproduction attempt bounded |
| Root cause established | Evidence distinguishes the causal hypothesis |
| Fix permitted | Red proof observed for the intended reason |
| Review | Focused and broader checks green, original scenario passes |
| Done | Diagnosis, fix scope, regression proof, and manual evidence accepted |

## Escalation

Stop when reproduction needs production-only access, instrumentation may expose sensitive data, destructive experiments are proposed, expected behavior is disputed, multiple hypotheses remain equally plausible, or the minimal fix changes a public contract.

## Evidence standard

Capture the exact red and green commands and outcomes, the original reproduction before and after, relevant logs or artifacts, and the final diff range. "Unable to reproduce after the fix" is weaker than a controlled scenario that now demonstrates the expected result.
