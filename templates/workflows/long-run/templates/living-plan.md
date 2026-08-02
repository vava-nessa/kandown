# Living execution plan

This document must remain self-contained and current. Preserve history through ordered progress, discovery, and decision entries rather than rewriting it to match later knowledge.

## Goal

State the mission and the observable end state in terms a new contributor can verify.

## Context

Explain repository orientation, environment, relevant architecture, prior work, and why the run requires several sessions.

## Constraints

- Invariant, public contract, or protected behavior
- Allowed and prohibited tools or actions
- Resource, dependency, security, privacy, or compatibility boundary

## Success criteria

- [ ] Integrated behavior or outcome
- [ ] Operational, migration, performance, or quality outcome
- [ ] Final independent verification outcome

## Baseline and setup

List exact commands to establish the environment, inspect state, and verify the starting baseline. Record known existing failures separately.

## Milestone graph

### Milestone 1: [Name]

- Outcome:
- Dependencies:
- Acceptance criteria:
- Verification:
- Recovery point:

### Milestone 2: [Name]

- Outcome:
- Dependencies:
- Acceptance criteria:
- Verification:
- Recovery point:

## Stop conditions

- Destructive or irreversible action
- Missing credentials or unavailable infrastructure
- Baseline regression
- Architecture or scope change requiring approval
- Repeated failed attempt without new evidence

## Escalation path

State who decides each stop condition and what evidence to provide.

## Progress

- [ ] Milestone or setup step
  report: Add the observed result immediately after completion.

## Discoveries

- Sequence or date: observed fact, evidence, and consequence for the plan

## Decisions

- Sequence or date: decision, alternatives, rationale, and consequences

## Current handoff

- Current repository and process state:
- Last accepted milestone:
- Checks most recently run:
- Unresolved risks or blockers:
- Exact next safe action:
- Commands the next session must rerun:

## Acceptance criteria

- [ ] The plan is sufficient for a fresh context to resume safely.
- [ ] Milestones are bounded, dependency-aware, and independently verifiable.
- [ ] Baseline, stop conditions, recovery, and verifier contract are explicit.
- [ ] Progress, discoveries, decisions, and handoff are current.

## Work checklist

- [ ] Observe and record the baseline.
- [ ] Approve mission, graph, stop conditions, and verifier contract.
- [ ] Dispatch one unblocked milestone at a time.
- [ ] Update the plan after every handoff and accepted milestone.
- [ ] Run final integration verification.
- [ ] Write the final operational handoff.

## Verification

Define baseline, per-milestone, cross-milestone, and final integration checks.

## Evidence

Link concise command results, artifacts, diff ranges, milestone verdicts, and recovery points.

## Completion report

Summarize the mission outcome, accepted milestones, major decisions, final verification, and operational state.

## Follow-ups

List intentionally deferred work with owner, rationale, and dependency context.
