# Technical plan

## Goal

Translate an approved specification into a feasible, principle-compliant design and dependency graph.

## Context

Link the approved specification, repository architecture, research, and existing system boundaries.

## Constraints

- Project principle or invariant
- Platform, dependency, compatibility, security, or performance limit
- Required migration or rollout condition

## Specification scope

List the `REQ`, `NFR`, `AC`, and `SC` IDs covered by this plan.

## Technical context

- Language and framework:
- Runtime and platform:
- Storage and data model:
- Existing interfaces:
- Testing and deployment:
- Performance and scale:

## Principle check before design

For each principle, record Pass, Exception requested, or Not applicable with rationale.

## Proposed architecture

Describe components, interfaces, data and control flow, persistence, error handling, observability, and security boundaries.

## Source layout and affected seams

- Existing or new path and responsibility

## Data, API, and migration changes

Document schemas, compatibility, rollout order, rollback, and recovery.

## Test and evidence strategy

Map requirement and scenario IDs to unit, integration, end-to-end, manual, performance, or migration proof.

## Complexity ledger

List each new abstraction, dependency, or special case and the requirement that justifies it.

## Principle check after design

Repeat the check and resolve every requested exception before approval.

## Dependency task graph

- Foundation task, IDs covered, dependencies
- User story task, IDs covered, dependencies
- Cross-cutting task, IDs covered, dependencies
- MVP checkpoint

## Acceptance criteria

- [ ] Every in-scope requirement has an implementation and verification path.
- [ ] Architecture respects principles or has approved exceptions.
- [ ] Dependencies and safe parallel work are explicit.
- [ ] Migration, error handling, and recovery are credible.
- [ ] Complexity is justified and the plan is approved.

## Work checklist

- [ ] Load the approved specification and repository architecture.
- [ ] Complete the initial principle check.
- [ ] Design the technical approach and verification strategy.
- [ ] Evaluate complexity, migration, and risks.
- [ ] Repeat the principle check.
- [ ] Build dependency tasks and obtain approval.

## Verification

Record prototypes, dependency checks, architecture reviews, or commands used to validate feasibility.

## Evidence

Link specification IDs, diagrams, experiments, checks, exceptions, and approval.

## Completion report

Summarize the approved design, task graph, complexity decisions, and MVP checkpoint.

## Follow-ups

List optional design improvements or later requirements outside this plan.
