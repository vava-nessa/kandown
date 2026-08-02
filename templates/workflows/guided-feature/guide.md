# Guided Feature

## When to use it

Choose Guided Feature when a feature request is real but the codebase path, user details, or design needs collaborative exploration. It gives the user high-leverage checkpoints before expensive implementation while keeping the final work split into focused slices.

This workflow is interactive by design. It is not appropriate when the agent has already received an approved specification and plan, or when work must continue for many sessions with little user cadence.

## Flow

### 1. Discover the codebase and request

Discovery begins with repository instructions and a targeted map of the existing system. Trace the user action, state, data flow, interfaces, persistence, and tests that matter to the requested behavior. Identify existing patterns that can be reused.

Separate findings into:

- observed facts with file or command references;
- assumptions that still need confirmation;
- constraints imposed by the repository or platform;
- product questions only the user can decide;
- technical risks that need design treatment.

Discovery is complete when another engineer can understand the current path without repeating the exploration.

### 2. Clarify intent

Ask focused questions in small groups. Explain the consequence of each decision and recommend a default where evidence supports one. Resolve scope, user experience, compatibility, failure behavior, migration expectations, and success criteria.

Record answers in the discovery task. Do not rely on conversation history as the only source of truth.

### 3. Propose and approve architecture

The Architecture proposal explains the recommended design at the level needed to review before code. Include affected components, data and control flow, interfaces, persistence, error handling, rollout or migration, tests, and alternatives considered.

The approval gate is explicit. "No objection yet" is not approval. If the user requests changes, revise the proposal and preserve the decision record.

### 4. Implement approved slices

Split the design into independently verifiable slices. The first slice should prove the highest-risk seam or deliver the smallest useful path. Later slices add completeness and polish.

Each implementation task references the approved proposal, owns a bounded scope, and defines checks before work starts. If coding exposes a design mismatch, stop and return to the proposal instead of improvising a new architecture.

For integration or framework changes, run the application and load the actual page, command, or endpoint. Type checks alone cannot prove initialization order, serialization, binding, or runtime behavior.

### 5. Review behavior and design

Review checks:

- each acceptance criterion against evidence;
- conformance to the approved architecture;
- compatibility and regression risks;
- tests and error handling;
- user-visible behavior in the running system;
- the final diff for unrelated changes.

Findings return to the relevant implementation slice. Accepted deferrals become named follow-up tasks with owners or rationale.

## Gates

| Gate | Required result |
|---|---|
| Discovery review | Relevant flow, constraints, unknowns, and questions are documented |
| Clarification complete | Product decisions and acceptance criteria are explicit |
| Architecture approval | Recommended design and verification strategy are accepted |
| Slice readiness | Approved scope, dependencies, and proof are defined |
| Feature review | Runtime behavior, criteria, architecture, and diff are accepted |

## Escalation

Ask the user when there are competing product outcomes, irreversible migrations, new external dependencies, security or privacy implications, public API changes, or a conflict between repository architecture and requested behavior.

Return to architecture approval whenever implementation would cross the accepted design boundary.

## Evidence standard

Discovery evidence cites files, symbols, and commands. Implementation evidence cites tests, builds, runtime checks, screenshots, traces, or API output. Review evidence maps each criterion to an observed result and records the exact diff range.
