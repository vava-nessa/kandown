# Real Engineering protocol

Deliver behavior through reviewed specifications and thin vertical slices. Test first where a stable seam can prove important behavior. Review conformance to repository standards separately from conformance to the specification.

## Operating rules

1. Create or load the Feature specification. Resolve open questions and obtain approval before implementation tasks enter {{column:ready}}.
2. Decompose the approved behavior into tracer-bullet slices that cross the real system end to end. Prefer one useful path over completing one technical layer.
3. Express ordering with dependencies. Only independent slices with disjoint write scope may proceed concurrently.
4. Move one ready slice to {{column:active}}. Follow {{trackingPolicy}} and preserve requirement IDs in its acceptance criteria.
5. Select test-first seams deliberately. Observe the focused test fail for the intended reason, implement the smallest behavior, then observe it pass. Do not force low-value tests around unstable implementation details.
6. Verify each slice with automated checks and direct runtime evidence when behavior is user-visible.
7. Send the completed diff to two independent reviews in {{column:review}}:
   - Standards review checks repository rules, safety, maintainability, and test quality.
   - Spec review checks only the approved behavior and acceptance traceability.
8. Resolve blocking findings in the implementation task and rerun affected evidence.
9. Move the slice to {{column:terminal}} only when both reviews pass. Close the feature specification only when every selected slice is accepted.

## Escalate when

Stop for human direction when the specification changes, a slice cannot remain vertical, a dependency or file-ownership conflict appears, or the two review verdicts expose a product decision rather than an implementation defect.
