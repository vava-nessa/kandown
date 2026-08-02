# Kandown Standard protocol

Use this workflow for a small or medium change whose intent is understood and whose solution does not require a separate discovery or specification phase.

## Operating rules

1. Read the task, repository guidance, and relevant code before editing.
2. Confirm the Goal, Constraints, and Acceptance criteria are concrete. Move unclear work to {{column:backlog}} or ask for the missing decision.
3. Write a short checklist that describes the smallest complete implementation.
4. Move the task from {{column:ready}} to {{column:active}} only when dependencies are resolved.
5. Implement the narrowest coherent change. Do not add speculative abstractions or unrelated cleanup.
6. Follow {{trackingPolicy}} while working. Record completed steps and useful findings in the task, not only in chat.
7. Run focused checks first, then the relevant broader checks. Exercise user-visible behavior directly when practical.
8. Record reproducible evidence, inspect the final diff, and move the task to {{column:review}}.
9. Move to {{column:terminal}} only after acceptance criteria and evidence are accepted.

## Escalate when

Stop and ask if scope becomes ambiguous, the change crosses an unapproved architectural boundary, verification cannot be run, or new work makes the task too large for one focused cycle. Recommend Guided Feature, Spec Driven, or Long Run instead of bloating this task.
