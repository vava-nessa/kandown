# Long Run

## When to use it

Choose Long Run for work that spans multiple sessions, contains several milestones, or must remain recoverable when agents or humans change. Its primary artifact is a living execution plan that records not only intended work but also progress, discoveries, decisions, verification, and the next safe action.

Do not use it merely because a task feels difficult. Prefer a smaller workflow when one focused context can complete and verify the change.

## Flow

### 1. Initialize the run

Create the Living execution plan before implementation. It must be self-contained enough for a new contributor to resume work. Record:

- mission and observable success;
- repository and environment context;
- constraints and non-goals;
- baseline setup and verification commands;
- milestones with dependencies and acceptance criteria;
- risky or irreversible actions;
- stop and escalation conditions;
- recovery and rollback guidance;
- independent verifier contract.

Run the baseline and record its actual state. Existing failures must be distinguished from failures introduced by the run.

### 2. Maintain the living plan

The plan changes as reality changes. Update it after meaningful progress, discoveries, decisions, and accepted milestones. Keep four records distinct:

- Progress says what is complete and what is next.
- Discoveries record facts learned from execution.
- Decisions record choices, rationale, and consequences.
- Handoffs state the exact current condition and next safe action.

Do not rewrite history to make the plan look prescient. Append dated or clearly ordered entries so later sessions can understand why direction changed.

### 3. Execute one milestone per context

At session start:

1. Read the plan and latest handoff.
2. Inspect git and process state.
3. Run the documented baseline check.
4. Confirm the selected milestone is unblocked.
5. Restate its scope and stop conditions.

Implement one bounded, mergeable increment. Prefer a complete vertical result over broad partial progress. Keep the repository runnable and avoid leaving hidden process or environment state.

Parallel work is allowed only when dependencies and file ownership are explicit and disjoint. Total model activity is not a goal; safe progress is.

### 4. End in a clean handoff

Before ending a worker context:

- run milestone verification;
- inspect the diff;
- record changed files and exact command results;
- update progress, discoveries, and decisions;
- state unresolved risks;
- write setup and the next safe action;
- leave the working state clean or describe precisely why it is not.

A handoff that says "continue implementation" is insufficient.

### 5. Verify independently

A fresh verifier checks the milestone without inheriting the worker's assumptions. The verifier reads the acceptance contract, inspects the diff and test changes, reruns relevant checks, and exercises real behavior where practical.

The verdict is Pass, Changes required, or Blocked. Changes required returns the milestone to active work with severity-ranked findings. Blocked identifies the missing input or infrastructure and prevents dependent dispatch.

### 6. Integrate and close

After each accepted milestone, update the living plan and unlock dependencies. Final closure requires integrated verification across milestone boundaries, confirmation of success criteria, cleanup of temporary instrumentation, and a complete operational handoff.

## Gates

| Gate | Exit condition |
|---|---|
| Initialization | Baseline observed, plan and stop conditions approved |
| Session start | State inspected, baseline stable, milestone unblocked |
| Milestone handoff | Clean state, evidence, decisions, risks, and next action recorded |
| Independent verification | Fresh-context verdict passes |
| Final integration | Cross-milestone behavior and mission criteria accepted |

## Escalation

Stop for baseline regression, inaccessible credentials, destructive action, architecture changes outside the plan, repeated failure without new evidence, resource limits, security concerns, or ambiguity that prevents independent verification.

## Evidence standard

Preserve commands, concise results, artifacts, diff ranges, and runtime observations. Link large logs. Every handoff must distinguish proven facts from assumptions and identify which checks the next session should rerun.
