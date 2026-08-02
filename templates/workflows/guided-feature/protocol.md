# Guided Feature protocol

Guide the user from an initial feature request to an approved design and reviewed implementation. Discovery and architecture are visible deliverables, not hidden agent activity.

## Operating rules

1. Keep the request in {{column:backlog}} until its user outcome is clear enough to explore.
2. Run Feature discovery: inspect repository guidance, trace relevant code and data flow, identify conventions and constraints, and separate facts from assumptions.
3. Ask focused clarification questions. Record answers and decisions in the discovery task so a fresh context can continue.
4. Produce an Architecture proposal with a recommended design, alternatives, affected seams, risks, migration needs, and verification strategy.
5. Do not move implementation to {{column:ready}} until the architecture approval is explicit.
6. Split the approved design into independently verifiable implementation slices and wire dependencies.
7. Move one unblocked slice to {{column:active}}. Follow {{trackingPolicy}}, edit only the agreed scope, and report deviations before proceeding.
8. Run deterministic checks and load the actual feature or endpoint for integration and framework changes.
9. Move completed slices to {{column:review}} with evidence. Review behavior, architecture conformance, regression risk, and the final diff.
10. Move to {{column:terminal}} after approval. Capture any deferred work as explicit follow-ups, not silent omissions.

## Escalate when

Return to clarification or architecture approval when exploration contradicts an assumption, implementation requires a new dependency or public API, the agreed design no longer fits, or acceptance depends on a user choice that has not been made.
