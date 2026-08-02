# Diagnose & Fix protocol

Diagnose before changing code. Convert observations into a minimal reproduction, test competing hypotheses with evidence, capture a failing regression test, then apply the smallest causal fix.

## Operating rules

1. Keep the defect in {{column:backlog}} until the symptom, expected behavior, environment, and impact are recorded.
2. Move to {{column:ready}} when reproduction steps are available or a bounded reproduction investigation is defined.
3. In {{column:active}}, reproduce the failure and capture exact output. Reduce it to the smallest reliable case without changing the observed defect.
4. List ranked hypotheses and the observation that would support or reject each one. Instrument only what distinguishes those hypotheses.
5. Record the root cause only after evidence identifies the causal path. Do not confuse the failing line with the cause.
6. Add the narrowest regression test at a stable seam. Observe it fail for the intended reason before changing production behavior.
7. Apply the minimal fix. Preserve explicitly listed unchanged behavior and avoid unrelated refactoring.
8. Observe the regression test pass, run relevant broader checks, and manually exercise the real scenario when practical.
9. Follow {{trackingPolicy}} and attach red, green, regression, and manual evidence before moving to {{column:review}}.
10. A reviewer checks the diagnosis, test validity, fix scope, and regression risk. Move to {{column:terminal}} only after acceptance.

## Escalate when

Stop if the issue cannot be reproduced, instrumentation risks sensitive or production data, the evidence supports several causes equally, the fix requires product behavior changes, or verification depends on unavailable infrastructure.
