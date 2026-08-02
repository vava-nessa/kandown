# Long Run protocol

Keep multi-session work executable and resumable through one living plan, small milestones, durable evidence, explicit decisions, clean handoffs, and independent verification.

## Operating rules

1. Initialize the Living execution plan with the mission, constraints, baseline, milestone graph, success criteria, stop conditions, and recovery commands.
2. Keep the plan current. It is a living operational record, not a frozen proposal. Append discoveries and decisions with their consequences.
3. At the start of every session, read the plan and recent handoff, inspect the working state, and run the documented baseline check. Stabilization blocks new work when the baseline fails unexpectedly.
4. Move only one bounded, unblocked milestone from {{column:ready}} to {{column:active}} per worker context. Parallel milestones require disjoint write scope and explicit dependencies.
5. Follow {{trackingPolicy}}. Update progress while work happens, especially after verification, decisions, and scope changes.
6. End each milestone in a clean, recoverable state. Run its verification, record changed files and exact results, and write the next handoff before leaving the context.
7. Move the milestone to {{column:review}}. A fresh verifier checks the acceptance contract, evidence, test changes, and runtime behavior without relying on the worker's confidence.
8. Resolve findings in the same milestone or create an explicit blocker. Move to {{column:terminal}} only after independent acceptance.
9. Update the living plan after every accepted milestone. Close it only after final integration verification and a complete operational handoff.

## Escalate when

Stop on baseline failure, missing credentials, destructive or irreversible action, architectural divergence, repeated failed attempts, ambiguous success criteria, or context that cannot be compacted into a reliable handoff.
