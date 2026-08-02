# Spec Driven

## When to use it

Choose Spec Driven when requirements need durable traceability, several user stories share foundations, or implementation must be planned before dependency-aware execution. It is useful for unfamiliar, high-stakes, or cross-team changes where ambiguity is more expensive than additional artifacts.

The workflow separates what users need, how the system will satisfy it, and which tasks can execute. This separation prevents technical choices from silently becoming requirements.

## Flow

### 1. Establish principles

List project principles and non-negotiable constraints that apply to the change. Examples include local-first data ownership, backward compatibility, accessibility, security boundaries, latency goals, or limits on dependencies.

These principles are a gate. The plan must either comply or explain and obtain approval for an exception.

### 2. Write the specification

Create prioritized, independently testable user stories. Give every functional requirement an ID such as `REQ-001` and every acceptance scenario an ID such as `AC-001`.

A complete specification contains:

- problem and intended outcomes;
- users and prioritized stories;
- Given, When, Then scenarios;
- functional and non-functional requirements;
- edge cases and error behavior;
- key entities or domain terms;
- assumptions and non-goals;
- measurable success criteria;
- unresolved questions.

Avoid implementation details unless they are genuine constraints. Review the specification for completeness, consistency, and testability before approval.

### 3. Create the technical plan

Translate the approved specification into architecture. Record technical context, system boundaries, source layout, data and interface changes, error handling, migration, observability, performance, security, and test strategy.

Run a principle check before research or design commitments and repeat it after the design is complete. Justify unavoidable complexity explicitly. Reject complexity that does not satisfy a requirement or constraint.

### 4. Build the dependency graph

Create tasks for setup, blocking foundations, independently deliverable stories, and necessary cross-cutting work. Each task references the requirement and scenario IDs it satisfies.

Use `depends_on` for actual execution order. Foundational tasks block stories that need them. Independent stories may proceed concurrently only when file ownership and integration boundaries are safe. Define an MVP checkpoint when a priority story can be evaluated before the full scope is complete.

### 5. Implement and verify

An implementation task receives the approved plan and only the relevant requirement context. Keep its scope independently verifiable. Where tests are in scope, establish the expected failing test before implementation.

Evidence maps observed results back to IDs. A requirement is not covered because code exists; it is covered when its scenario or measurable outcome has accepted proof.

### 6. Review traceability

Before closure, inspect the traceability matrix:

- every in-scope requirement maps to one or more tasks;
- every acceptance scenario maps to evidence;
- every task maps back to approved intent;
- no implementation behavior silently expands scope;
- all principle exceptions are approved.

## Gates

| Gate | Exit condition |
|---|---|
| Principle check | Applicable constraints identified |
| Specification approval | Requirements are complete, consistent, testable, and accepted |
| Plan approval | Design is feasible, principle-compliant, and verifiable |
| Task readiness | Dependencies, IDs, scope, and proof are explicit |
| Story review | Referenced scenarios pass independently |
| Final closure | Traceability is complete and success criteria are accepted |

## Escalation

Stop when requirements conflict, a scenario cannot be tested, the design violates a principle, complexity lacks justification, dependency tasks overlap unsafely, or implementation reveals missing product intent. Revise and reapprove the earliest affected artifact.

## Evidence standard

Use compact traceable entries such as:

- `REQ-003 / AC-007`: `pnpm test auth-timeout`, pass, 4 cases
- `REQ-005`: manual offline run, persisted data reopened successfully
- Principle check: no new network access in task commands
- Traceability matrix: 12 of 12 in-scope scenarios accepted
