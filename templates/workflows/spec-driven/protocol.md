# Spec Driven protocol

Turn product intent into independently testable requirements, an approved technical plan, and a dependency-aware implementation graph. Preserve requirement and acceptance IDs from specification through evidence.

## Operating rules

1. Record applicable project principles and non-negotiable constraints before specifying behavior.
2. Create a Specification with prioritized user stories, requirement IDs, acceptance scenario IDs, edge cases, assumptions, non-goals, and measurable success criteria.
3. Clarify every material ambiguity. Keep unresolved specifications in {{column:backlog}}.
4. Review and approve the specification before creating the Technical plan.
5. In the plan, document technical context, architecture, data and interface changes, error handling, test strategy, source layout, and any justified complexity. Recheck project principles after design.
6. Decompose the plan into dependency tasks. Each task must reference the requirement and scenario IDs it satisfies and define independent verification.
7. Move only unblocked tasks to {{column:ready}}. Use dependencies, not prose, to represent execution order.
8. Execute a ready task in {{column:active}} while following {{trackingPolicy}}. Keep scope aligned to its referenced requirements.
9. Move to {{column:review}} only with traceable evidence. Review both implementation quality and requirement coverage.
10. Move to {{column:terminal}} after acceptance. The parent specification closes only when every in-scope requirement has accepted evidence.

## Escalate when

Stop when a requirement is untestable, the plan violates a project principle, implementation reveals a specification gap, or a task cannot be verified independently. Update and reapprove the cheapest upstream artifact before continuing.
