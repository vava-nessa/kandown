# Agent workflow patterns for Kandown

Research date: 2026-08-01

## Executive recommendation

Kandown should ship exactly six built-in workflows:

1. **Quick Fix** for small, well-understood changes.
2. **Test-First Bugfix** for reproducible defects and regressions.
3. **Feature Slice** for one independently valuable user-facing increment.
4. **Brownfield Deep Dive** for unfamiliar code, external APIs, and risky refactors.
5. **Product Initiative** for multi-epic product or architecture work.
6. **Autonomous Cascade** for a dependency graph executed by one or more agents with an independent verifier.

These are different operating models, not six levels of ceremony. They differ in the uncertainty they resolve, the artifact graph they create, the unit of delivery, who approves each gate, and whether implementation is interactive or autonomous.

The design should preserve Kandown's core advantage: every workflow is still plain Markdown, every executable unit is still a task file, and workflow state is visible through ordinary board status, dependencies, checklists, reports, and evidence links.

## Method and source quality

This review compares ten workflow families. Product mechanics are taken from first-party repositories or official documentation. Practitioner workflows are taken from the authors' own writing. Matt Pocock is included through his first-party AI Hero material. Addy Osmani and Simon Willison are treated as practitioner sources, not as product specifications.

The comparison focuses on five things Kandown can encode directly:

- workflow stages and transitions;
- task or artifact sections;
- board and dependency semantics;
- review and verification gates;
- context, token, and cadence costs.

## Ten researched workflow families

### 1. GitHub Spec Kit: executable specification pipeline

**Stages.** The core path is Constitution -> Specify -> Plan -> Tasks -> Implement. The current command set also exposes clarification, consistency analysis, checklists, and convergence around that path. Each phase produces Markdown that feeds the next phase. [GitHub Spec Kit README](https://github.com/github/spec-kit/blob/main/README.md) [Spec Kit documentation](https://github.github.com/spec-kit/index.html)

**Specification sections.** The official spec template requires prioritized, independently testable user stories, a reason for each priority, an independent test, Given/When/Then acceptance scenarios, edge cases, functional requirements, key entities, measurable success criteria, and assumptions. [Spec Kit specification template](https://github.com/github/spec-kit/blob/main/templates/spec-template.md)

**Planning sections.** The plan records a summary, technical context, language and dependencies, storage, testing, platform, performance goals, constraints, scale, a constitution check, concrete source layout, and explicit justification for accepted complexity. The constitution check is performed before research and repeated after design. [Spec Kit plan template](https://github.com/github/spec-kit/blob/main/templates/plan-template.md)

**Task and board semantics.** Tasks are grouped into setup, blocking foundations, independently deliverable user stories, and cross-cutting polish. IDs carry a parallel marker and a user-story label. Foundational work blocks all stories, while independent stories may run in parallel after the foundation checkpoint. [Spec Kit tasks template](https://github.com/github/spec-kit/blob/main/templates/tasks-template.md)

**Review checkpoints.** The templates require failing tests before implementation when tests are in scope, an independent verification checkpoint after each story, and an MVP stop point after the P1 story. [Spec Kit tasks template](https://github.com/github/spec-kit/blob/main/templates/tasks-template.md)

**Cadence and token tradeoff.** This is a high-artifact workflow. It spends context and human review before code in exchange for traceability and parallelizable, independently testable slices. Because each phase has its own Markdown input and output, Kandown can load only the current task plus linked artifacts rather than replaying the entire conversation. [Spec Kit documentation](https://github.github.com/spec-kit/index.html) [Spec Kit tasks template](https://github.com/github/spec-kit/blob/main/templates/tasks-template.md)

**Best Kandown lesson.** Preserve the separation between product intent, technical design, and executable tasks. Do not copy Spec Kit's entire directory structure into every card.

### 2. BMAD Method: scale-adaptive product-to-story lifecycle

**Stages.** BMAD progressively builds context across optional Analysis, Planning, Solutioning, and Implementation. The full path can include product brief or research, PRD and UX, architecture, epics and stories, an implementation-readiness gate, per-story build and code review, sprint status, course correction, and retrospective. [BMAD workflow map](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/workflow-map.md)

**Story sections.** BMAD's story template contains role/action/benefit, acceptance criteria, tasks and subtasks mapped to acceptance criteria, development notes, architecture and source-tree constraints, project-structure notes, source references, model used, debug-log references, completion notes, and a file list. [BMAD story template](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/v6-shims/bmad-create-story/template.md)

**Board semantics.** BMAD defines an epic flow of `backlog -> in-progress -> done` and a story flow of `backlog -> ready-for-dev -> in-progress -> review -> done`. Retrospectives move between `optional` and `done`; retro action items use `open -> in-progress -> done`. The guidance recommends creating the next story after the previous one is done so its learning can be incorporated, while still allowing multiple stories in progress when capacity permits. [BMAD sprint status template](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/ship/bmad-sprint-planning/sprint-status-template.yaml) [BMAD sprint planning workflow](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/ship/bmad-sprint-planning/SKILL.md)

**Review checkpoints.** The readiness workflow returns a PASS, CONCERNS, or FAIL decision before implementation. Stories pass through review before done, and BMAD recommends code review from a fresh context and ideally a different model. Epic retrospectives produce evidence-based findings and action items. [BMAD workflow map](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/workflow-map.md) [BMAD sprint status template](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/ship/bmad-sprint-planning/sprint-status-template.yaml)

**Cadence and token tradeoff.** BMAD deliberately varies planning depth with project complexity and offers both direct build and a larger artifact chain. Its README also suggests doing long-form planning in flat-rate web subscriptions before bringing artifacts into metered IDE implementation sessions. [BMAD README](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/README.md) [BMAD workflow map](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/workflow-map.md)

**Best Kandown lesson.** A full initiative needs parent-child work, readiness, per-story review, and retro. It should not be the default for a one-file fix.

### 3. HumanLayer and 12-factor agents: research, plan, implement with intentional compaction

**Stages.** HumanLayer describes a Research -> Plan -> Implement workflow. Research maps the codebase and information flow; planning specifies exact edits and verification for each phase; implementation follows the plan phase by phase and can compact verified status back into the plan. [Advanced Context Engineering for Coding Agents](https://www.humanlayer.dev/blog/advanced-context-engineering)

**Task sections.** A Kandown adaptation should capture research question, relevant files and data flow, findings with file references, proposed phases, exact edits, verification per phase, unresolved questions, implementation evidence, and next handoff. This shape follows HumanLayer's definitions of research and planning artifacts. [Advanced Context Engineering for Coding Agents](https://www.humanlayer.dev/blog/advanced-context-engineering)

**Board semantics.** Research and plan are explicit blocking tasks, not hidden agent activity. Implementation cannot become ready until the plan is reviewed. Each verified implementation phase updates the durable plan or completion report before a fresh context begins. This is a Kandown mapping of HumanLayer's artifact and handoff cadence. [Advanced Context Engineering for Coding Agents](https://www.humanlayer.dev/blog/advanced-context-engineering)

**Review checkpoints.** HumanLayer argues that reviewing research and plans has more leverage than waiting to review code. The workflow therefore places human approval after research and after planning, then uses verification within every implementation phase. [Advanced Context Engineering for Coding Agents](https://www.humanlayer.dev/blog/advanced-context-engineering)

**Cadence and token tradeoff.** HumanLayer calls this frequent intentional compaction and reports keeping context utilization around 40 to 60 percent for complex work. Its 12-factor guidance recommends small, focused agents, usually 3 to 10 steps and perhaps up to 20, because longer tasks grow context and increase loss of focus. [Advanced Context Engineering for Coding Agents](https://www.humanlayer.dev/blog/advanced-context-engineering) [12-factor agents, Factor 10](https://github.com/humanlayer/12-factor-agents/blob/main/content/factor-10-small-focused-agents.md)

**Best Kandown lesson.** Make research and planning visible, reviewable deliverables. A plan is also a compact handoff boundary, not only a pre-code checklist.

### 4. Anthropic: incremental long-running harness

**Stages.** Anthropic's long-running harness uses a specialized initializer session, then repeated coding sessions that make incremental progress and leave clear artifacts for the next session. The initializer creates environment setup, a progress file, and an initial commit; subsequent agents read progress and git history, run a basic end-to-end check, implement one increment, test, commit, and update progress. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

**Task sections.** The feature state records a feature description and a `passes` status. The durable handoff records what changed, tests run, current state, and what the next session should do. Anthropic reports using a structured feature list and strongly instructing coding agents to change only the pass status rather than rewriting tests or requirements. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

**Board semantics.** Initialization is a blocking task. Every later card should represent one mergeable increment and end in a clean state. Completion is based on verified behavior, not an agent's narrative claim. A failed baseline check reopens stabilization before new feature work. This directly maps Anthropic's clean-state and session-start guidance into Kandown. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

**Review checkpoints.** Anthropic observed agents marking work complete without end-to-end testing, so the harness explicitly starts with a basic end-to-end test and requires testing before the progress handoff. Git commits and progress notes create recovery points. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

**Cadence and token tradeoff.** Session boundaries add rereading and handoff overhead, but the initializer amortizes setup and test instructions across later sessions. Anthropic reports that a predefined testing procedure saves tokens because each agent does not need to rediscover how to verify the application. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

**Best Kandown lesson.** Long runs need a durable feature ledger, a clean handoff, and a baseline check at the start of every new session.

### 5. OpenAI Codex: context, implementation, validation, review

**Stages.** OpenAI's practical guidance is to provide the right task context, use durable repository guidance, plan when needed, implement, validate with tests and static checks, then review the result. Stable repeated workflows belong in skills or automation rather than being pasted into every prompt. [OpenAI Codex best practices](https://developers.openai.com/codex/learn/best-practices) [OpenAI Codex customization](https://developers.openai.com/codex/concepts/customization)

**Task sections.** OpenAI recommends four core prompt fields: Goal, Context, Constraints, and Done when. Repository guidance should identify layout, commands, conventions, constraints, PR expectations, and verification. [OpenAI Codex best practices](https://developers.openai.com/codex/learn/best-practices)

**Board semantics.** A small task can remain one card. `Done when` is the card's exit contract; tests, lint, type checks, behavior confirmation, and diff review provide evidence before Review or Done. Recurring feedback should update durable instructions rather than expanding the current card indefinitely. [OpenAI Codex best practices](https://developers.openai.com/codex/learn/best-practices) [OpenAI Codex customization](https://developers.openai.com/codex/concepts/customization)

**Review checkpoints.** Codex supports reviewing uncommitted changes, a commit, or a branch against a base. OpenAI recommends checking that behavior matches the request and reviewing the diff for bugs, regressions, and risky patterns. [OpenAI Codex best practices](https://developers.openai.com/codex/learn/best-practices)

**Cadence and token tradeoff.** OpenAI recommends a short, accurate `AGENTS.md`, task-specific Markdown for larger planning or review guidance, and focused skills for repeated workflows. Skills use progressive disclosure so full instructions load only when invoked. [OpenAI Codex best practices](https://developers.openai.com/codex/learn/best-practices) [OpenAI Codex skills](https://developers.openai.com/codex/skills)

**Best Kandown lesson.** The smallest useful workflow is a good default: four task fields, one implementation cycle, deterministic evidence, and one diff review.

### 6. Matt Pocock: seven-phase development and the plan loop

**Stages.** Pocock's seven phases are Idea, optional Research, optional Prototype, PRD, Kanban Board, Execution, and QA. QA can create new tickets and loop back through execution until the product is polished. [My 7 Phases of AI Development](https://www.aihero.dev/my-7-phases-of-ai-development)

**Planning cadence.** His smaller plan loop is Plan -> Execute -> Test -> Commit. Plans should be concise and end with unresolved questions. [My AGENTS.md file for building plans you actually read](https://www.aihero.dev/my-agents-md-file-for-building-plans-you-actually-read)

**Specification sections.** Pocock's `to-spec` flow includes problem statement, high-level solution, numbered independently checkable user stories, settled implementation decisions, testing decisions, out-of-scope items, and further notes. It follows alignment work and precedes ticket decomposition. [The to-spec skill](https://www.aihero.dev/skills-to-spec)

**Board semantics.** The Kanban plan is a set of tickets with blocking relationships. Non-blocked tickets may be dispatched in parallel, while every agent receives research assets, prototype code when relevant, the PRD, and tickets with acceptance criteria. [My 7 Phases of AI Development](https://www.aihero.dev/my-7-phases-of-ai-development)

**Review checkpoints.** QA begins with an agent-authored test plan, followed by human testing and code review. Findings become new tickets, then return to execution. Pocock's separate review workflow evaluates Standards and Spec as independent axes so one result cannot hide failure on the other. [My 7 Phases of AI Development](https://www.aihero.dev/my-7-phases-of-ai-development) [The code-review skill](https://www.aihero.dev/skills-code-review)

**Cadence and token tradeoff.** Optional research and prototype phases avoid paying for artifacts that a familiar change does not need. Research can be cached in `research.md` so fresh contexts do not repeat expensive exploration. Parallel tickets increase model usage but shorten elapsed delivery when their dependencies and acceptance criteria are clear. [My 7 Phases of AI Development](https://www.aihero.dev/my-7-phases-of-ai-development)

**Best Kandown lesson.** Let users select only the uncertainty-reducing phases they need, while retaining a consistent PRD -> dependency graph -> execution -> QA loop for larger work.

### 7. Addy Osmani: lifecycle skills with evidence exits

**Stages.** Osmani organizes agent skills into Define, Plan, Build, Verify, Review, and Ship, with simplification cutting across the lifecycle. Build proceeds in vertical slices rather than treating generation as one large step. [Agent Skills](https://addyosmani.com/blog/agent-skills/)

**Task sections.** A skill is described as a workflow with ordered steps, checkpoints that produce evidence, and a defined exit criterion, not as a general essay. For Kandown, this implies explicit Inputs, Steps, Evidence, Exit criteria, and Escalation sections in workflow cards. [Agent Skills](https://addyosmani.com/blog/agent-skills/)

**Board semantics.** A task cannot leave Review without concrete proof such as a green test run, clean build, runtime trace, screenshot, or reviewer approval. The exact evidence depends on the task, but `seems right` is not an exit state. [Agent Skills](https://addyosmani.com/blog/agent-skills/)

**Review checkpoints.** In Osmani's multi-agent orchestra, quality gates include plan approval for risky work, deterministic hooks at task completion, and verification by a reviewer. His operating cadence is Plan -> Spawn -> Monitor -> Verify -> Integrate -> Retro. [The Code Agent Orchestra](https://addyosmani.com/blog/code-agent-orchestra/)

**Cadence and token tradeoff.** Skills use progressive disclosure rather than loading a long process essay into every context. Multi-agent orchestration provides parallelism and focused contexts, but Osmani notes that subagents consume additional tokens and should be used where an independent opinion is worth the cost. [Agent Skills](https://addyosmani.com/blog/agent-skills/) [Loop Engineering](https://addyo.substack.com/p/loop-engineering)

**Best Kandown lesson.** A workflow template should tell the agent what to do and what proof closes the task. Reference material should remain linked and load on demand.

### 8. Simon Willison: red/green TDD plus agentic manual proof

**Stages.** Willison's recurring implementation pattern is to establish a test, watch it fail, implement the change, watch it pass, and then manually exercise the resulting behavior. His own project prompt example asks for red/green TDD in sensible commits, with passing tests, updated docs, and occasional manual tests. [Release: llm-coding-agent 0.1a0](https://simonwillison.net/2026/Jul/2/llm-coding-agent/) [Agentic manual testing](https://simonwillison.net/guides/agentic-engineering-patterns/agentic-manual-testing/)

**Task sections.** A Kandown bug card should record reproduction, current behavior, expected behavior, the failing regression test, the smallest implementation scope, automated verification, manual verification, and evidence artifacts. This is the direct Markdown encoding of Willison's red/green and manual-testing practice. [Agentic manual testing](https://simonwillison.net/guides/agentic-engineering-patterns/agentic-manual-testing/)

**Board semantics.** The defect stays In Progress while the regression test is red for the intended reason. It becomes Review only after the test is green and the changed behavior has been exercised. Manual-testing discoveries return to a new red test before another fix. [Agentic manual testing](https://simonwillison.net/guides/agentic-engineering-patterns/agentic-manual-testing/)

**Review checkpoints.** Willison recommends direct execution through small scripts or commands for libraries and APIs, browser automation and screenshots for web interfaces, and durable evidence documents that capture commands and real output rather than an agent's paraphrase. [Agentic manual testing](https://simonwillison.net/guides/agentic-engineering-patterns/agentic-manual-testing/)

**Cadence and token tradeoff.** Tight red/green cycles keep feedback local and reduce speculative implementation. Manual proof costs tool calls and runtime, but produces reviewable evidence and can reveal cases that should become permanent regression tests. [Agentic manual testing](https://simonwillison.net/guides/agentic-engineering-patterns/agentic-manual-testing/)

**Best Kandown lesson.** Bugs need a different template from features because proof begins with reproduction and an observed failing test.

### 9. Kiro Specs: requirements-first, design-first, and quick spec

**Stages.** Kiro's requirements-first workflow creates `requirements.md`, then `design.md`, then `tasks.md`, then executes tasks. Requirements include user stories, EARS-style behaviors, functional requirements, edge cases, and error handling; design includes architecture, interactions, data models, interfaces, technology choices, error handling, and test strategy. [Kiro requirements-first workflow](https://kiro.dev/docs/specs/feature-specs/requirements-first/)

**Alternative entry.** Kiro also supports design-first for work driven by architecture, non-functional constraints, or feasibility, and Quick Spec for well-understood work that can generate all artifacts after up-front clarification without phase approvals. [Kiro design-first workflow](https://kiro.dev/docs/specs/feature-specs/tech-design-first/) [Kiro Quick Spec](https://kiro.dev/docs/specs/quick-spec/)

**Task and board semantics.** `tasks.md` contains discrete outcomes, dependencies, and required versus optional work. Running all tasks uses dependency waves: ready tasks execute concurrently, then the next wave begins after dependencies are satisfied. Task status updates in real time. [Kiro Specs](https://kiro.dev/docs/specs/)

**Review checkpoints.** The standard workflow has explicit human review after requirements, design, and task generation. Kiro recommends validating completeness and testability before design, technical feasibility before tasks, and priorities and dependencies before implementation. [Kiro requirements-first workflow](https://kiro.dev/docs/specs/feature-specs/requirements-first/)

**Cadence and token tradeoff.** Quick Spec trades intermediate approval gates for speed on familiar features. Kiro recommends the gated workflow for unfamiliar, compliance-sensitive, or high-stakes work where requirement and design quality justify additional review. [Kiro Quick Spec](https://kiro.dev/docs/specs/quick-spec/)

**Best Kandown lesson.** Workflow choice should depend on where uncertainty lives: user behavior, technical feasibility, or neither.

### 10. OpenSpec: lightweight, fluid change proposals

**Stages.** OpenSpec's default path is Explore when needed -> Propose -> Apply -> Archive. A proposal creates `proposal.md`, requirements and scenarios, `design.md`, and `tasks.md`; apply checks off implementation tasks; archive preserves the completed change and updates the durable specs. [OpenSpec README](https://github.com/Fission-AI/OpenSpec/blob/main/README.md)

**Task sections.** The proposal captures why the change exists and what changes, specs capture SHALL requirements with WHEN/THEN scenarios, design captures the technical approach, and tasks provide an implementation checklist. [OpenSpec README](https://github.com/Fission-AI/OpenSpec/blob/main/README.md)

**Board semantics.** OpenSpec allows artifacts to be updated at any time rather than enforcing a rigid phase gate. The change itself moves from proposed work through applied tasks to an archived record, making it a useful model for a lightweight Kandown feature card with linked artifacts. [OpenSpec README](https://github.com/Fission-AI/OpenSpec/blob/main/README.md)

**Review checkpoints.** The human reviews the proposal before code. The expanded profile adds verification before archive, and the project requires AI-generated contributions to be tested and verified. [OpenSpec README](https://github.com/Fission-AI/OpenSpec/blob/main/README.md)

**Cadence and token tradeoff.** OpenSpec explicitly favors a lighter, iterative workflow over rigid gates and recommends clearing context before implementation. That lowers ceremony but relies more heavily on the user choosing when proposal and design review are sufficient. [OpenSpec README](https://github.com/Fission-AI/OpenSpec/blob/main/README.md)

**Best Kandown lesson.** A feature workflow can preserve intent and design without forcing a full product-planning lifecycle.

## Cross-source findings

### 1. The useful unit is a verifiable slice

Spec Kit requires independently testable user stories, Pocock decomposes a PRD into dependency-aware tickets, Anthropic advances one feature at a time, and Addy Osmani builds in vertical slices. A Kandown implementation card should therefore deliver one reviewable behavior, not merely one technical layer. [Spec Kit specification template](https://github.com/github/spec-kit/blob/main/templates/spec-template.md) [My 7 Phases of AI Development](https://www.aihero.dev/my-7-phases-of-ai-development) [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) [Agent Skills](https://addyosmani.com/blog/agent-skills/)

### 2. `Done` needs evidence, not agent confidence

Anthropic reports premature completion without end-to-end testing, Osmani makes evidence the exit criterion, OpenAI asks for explicit `Done when`, and Willison captures executable proof from commands and screenshots. Kandown should require an evidence block before moving an AI-owned task to Done. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) [Agent Skills](https://addyosmani.com/blog/agent-skills/) [OpenAI Codex best practices](https://developers.openai.com/codex/learn/best-practices) [Agentic manual testing](https://simonwillison.net/guides/agentic-engineering-patterns/agentic-manual-testing/)

### 3. Review the cheapest high-leverage artifact first

Spec Kit checks the constitution before research and after design, BMAD has an implementation-readiness gate, HumanLayer reviews research and plans, and Addy Osmani uses plan approval for risky work. Kandown should stop a flawed plan before it becomes an expensive diff. [Spec Kit plan template](https://github.com/github/spec-kit/blob/main/templates/plan-template.md) [BMAD workflow map](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/workflow-map.md) [Advanced Context Engineering for Coding Agents](https://www.humanlayer.dev/blog/advanced-context-engineering) [The Code Agent Orchestra](https://addyosmani.com/blog/code-agent-orchestra/)

### 4. Context management is workflow design

HumanLayer uses deliberate fresh-context boundaries and focused agents; Anthropic leaves progress artifacts between sessions; OpenAI uses concise durable guidance plus progressively disclosed skills; OpenSpec recommends a clean context before implementation. Kandown task files and completion reports can serve as the durable handoff instead of retaining a giant conversation. [Advanced Context Engineering for Coding Agents](https://www.humanlayer.dev/blog/advanced-context-engineering) [12-factor agents, Factor 10](https://github.com/humanlayer/12-factor-agents/blob/main/content/factor-10-small-focused-agents.md) [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) [OpenAI Codex skills](https://developers.openai.com/codex/skills) [OpenSpec README](https://github.com/Fission-AI/OpenSpec/blob/main/README.md)

### 5. Parallelism belongs in the dependency graph

Spec Kit marks tasks safe for parallel work only when files and dependencies permit it, Kiro executes dependency waves, Pocock dispatches non-blocked tickets, and OpenAI warns that parallel write-heavy agents create conflicts and coordination overhead. Kandown should derive concurrency from `depends_on` and explicit file ownership, never from a generic `parallel: true` switch alone. [Spec Kit tasks template](https://github.com/github/spec-kit/blob/main/templates/tasks-template.md) [Kiro Specs](https://kiro.dev/docs/specs/) [My 7 Phases of AI Development](https://www.aihero.dev/my-7-phases-of-ai-development) [OpenAI Codex subagents](https://developers.openai.com/codex/subagents)

### 6. One workflow cannot cover every uncertainty profile

Kiro separates requirements-first, design-first, and quick paths; BMAD scales from direct build to a full product lifecycle; Pocock makes research and prototype optional. Kandown should choose among distinct workflows based on task shape rather than adding ceremony to every card. [Kiro best practices](https://kiro.dev/docs/specs/best-practices/) [BMAD workflow map](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/workflow-map.md) [My 7 Phases of AI Development](https://www.aihero.dev/my-7-phases-of-ai-development)

## Exactly six built-in Kandown workflows

| Built-in | Use when | Primary deliverables | Required human gate | Execution style | Relative context cost |
|---|---|---|---|---|---|
| **Quick Fix** | scope and solution are already clear | one task, concise plan, evidence | final diff only | one agent, one short cycle | lowest |
| **Test-First Bugfix** | behavior is wrong and reproducible | reproduction, red test, fix, regression proof | verify reproduction or final behavior | tight red/green loop | low |
| **Feature Slice** | one user-visible increment needs product and technical alignment | mini-spec, plan, story tasks, demo evidence | approve spec and plan | one or several independent slices | medium |
| **Brownfield Deep Dive** | code or dependencies are unfamiliar, or a refactor is risky | research artifact, reviewed plan, phased implementation | after research and plan | fresh context per phase | medium to high |
| **Product Initiative** | work spans product discovery, architecture, epics, or teams | brief/PRD, architecture, readiness result, epic/story graph, retros | readiness and each story review | iterative story lifecycle | highest interactive ceremony |
| **Autonomous Cascade** | tasks are already well-specified and independently verifiable | initializer, dependency graph, per-task handoffs, verifier reports | approve graph and final integration | autonomous dependency waves | highest model spend, lowest operator cadence |

The relative cost labels are synthesis, not model-specific token estimates. They reflect the number of artifacts, fresh contexts, agents, and review loops in the source workflows. [Advanced Context Engineering for Coding Agents](https://www.humanlayer.dev/blog/advanced-context-engineering) [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) [The Code Agent Orchestra](https://addyosmani.com/blog/code-agent-orchestra/)

### Built-in 1: Quick Fix

**Purpose:** Complete a small, obvious change without manufacturing a PRD.

**Stages:** Clarify -> concise plan -> implement -> verify -> diff review -> done.

**Task template:**

```markdown
## Goal

## Context

## Constraints

## Plan
- [ ] Smallest concrete step

## Done when
- [ ] Observable outcome
- [ ] Relevant checks pass

## Evidence
- Commands and result
- Manual check, if any

## Review notes
```

**Board contract:** Backlog means not selected; Todo means Goal and Done when are clear; In Progress covers implementation and checks; Review requires evidence; Done requires accepted evidence. Do not create child cards unless the work stops being small.

**Checkpoint:** One final review against the task and diff. This adapts OpenAI's Goal/Context/Constraints/Done-when prompt and Pocock's concise Plan -> Execute -> Test -> Commit loop. [OpenAI Codex best practices](https://developers.openai.com/codex/learn/best-practices) [My AGENTS.md file for building plans you actually read](https://www.aihero.dev/my-agents-md-file-for-building-plans-you-actually-read)

**Token policy:** Keep all state in one card and one context when practical. If research or multiple dependent changes appear, convert to Brownfield Deep Dive or Feature Slice rather than bloating this workflow.

### Built-in 2: Test-First Bugfix

**Purpose:** Prove a defect, fix its cause, and lock the behavior against regression.

**Stages:** Diagnose -> reproduce -> red test -> minimal fix -> green test -> manual verification -> review -> done.

**Task template:**

```markdown
## Symptom

## Reproduction

## Current behavior

## Expected behavior

## Unchanged behavior

## Root cause

## Regression test
- [ ] Fails for the intended reason before the fix
- [ ] Passes after the fix

## Fix scope

## Verification
- Automated checks
- Manual scenario

## Evidence
```

**Board contract:** Todo requires a reproducible symptom or an explicit investigation step. In Progress starts with reproduction. Review requires the red/green result and manual behavior proof. Done requires the regression test to remain in the suite unless the task explains why automation is impossible.

**Checkpoint:** A reviewer inspects changed tests before accepting a green build. Willison's workflow emphasizes observed red/green behavior and manual execution, while Kiro's bugfix model distinguishes current, expected, and unchanged behavior to keep fixes surgical. [Agentic manual testing](https://simonwillison.net/guides/agentic-engineering-patterns/agentic-manual-testing/) [Kiro bugfix and design-first specs](https://kiro.dev/blog/specs-bugfix-and-design-first/)

**Token policy:** Run the narrow failing test during the loop and the broader suite once the narrow case is green. Store verbose logs as linked evidence and keep the task report concise.

### Built-in 3: Feature Slice

**Purpose:** Deliver one independently valuable user journey with enough intent and design to review before code.

**Stages:** Specify -> clarify -> plan -> split into story tasks -> implement by slice -> verify independently -> demo/review -> done.

**Parent template:**

```markdown
## Problem and value

## User story
As a ...
I want ...
So that ...

## Acceptance scenarios
1. Given ... When ... Then ...

## Edge cases

## Requirements

## Non-goals

## Technical plan

## Dependencies

## Child tasks

## Success evidence
```

**Child task template:** Goal, acceptance criteria IDs, exact files or seam, implementation checklist, tests, evidence, completion report.

**Board contract:** The parent stays In Progress while children execute. Foundation cards block all slice cards. After foundations, independent child stories may run in parallel through `depends_on`; each story enters Review independently. The parent reaches Done only when selected stories and cross-cutting checks are complete.

**Checkpoint:** Human approval after the mini-spec and technical plan, then an independent acceptance check for every slice. This combines Spec Kit's independently testable stories and dependency labels, Kiro's requirements/design/tasks flow, and OpenSpec's lightweight proposal artifacts. [Spec Kit specification template](https://github.com/github/spec-kit/blob/main/templates/spec-template.md) [Spec Kit tasks template](https://github.com/github/spec-kit/blob/main/templates/tasks-template.md) [Kiro requirements-first workflow](https://kiro.dev/docs/specs/feature-specs/requirements-first/) [OpenSpec README](https://github.com/Fission-AI/OpenSpec/blob/main/README.md)

**Token policy:** Load the parent spec and only the active child card. Keep detailed research out unless the work genuinely needs Brownfield Deep Dive.

### Built-in 4: Brownfield Deep Dive

**Purpose:** Resolve codebase or dependency uncertainty before editing a mature system.

**Stages:** Research -> research review -> implementation plan -> plan review -> phased implementation -> phase verification -> final review.

**Research task template:**

```markdown
## Question

## Scope

## Relevant files and symbols

## Current data/control flow

## Constraints and conventions

## Findings

## Options and tradeoffs

## Recommended seam

## Sources

## Unresolved questions
```

**Implementation task template:** Reviewed research link, chosen approach, exact phases and files, invariants, verification after every phase, rollback or recovery notes, evidence, next handoff.

**Board contract:** The research card blocks the plan; the plan blocks implementation. A rejected research or plan artifact moves back to In Progress without starting code. Implementation phase cards may run in fresh contexts but must update their reports before the next phase starts.

**Checkpoint:** Human review after research and planning, then deterministic verification per phase. HumanLayer reports that review at those earlier artifacts is higher leverage than code-only review. [Advanced Context Engineering for Coding Agents](https://www.humanlayer.dev/blog/advanced-context-engineering)

**Token policy:** Target focused contexts and compact verified state into Markdown between phases. Use subagents for read-heavy exploration whose final summary is smaller than its tool trace. HumanLayer recommends focused agents and deliberate compaction, while OpenAI recommends parallel agents first for read-heavy tasks rather than overlapping write-heavy work. [12-factor agents, Factor 10](https://github.com/humanlayer/12-factor-agents/blob/main/content/factor-10-small-focused-agents.md) [OpenAI Codex subagents](https://developers.openai.com/codex/subagents)

### Built-in 5: Product Initiative

**Purpose:** Carry a product or architecture initiative from intent through multiple reviewed stories and a retrospective.

**Stages:** Optional discovery/research -> product brief or PRD -> optional UX -> architecture -> epics and stories -> readiness gate -> story cycles -> integration -> retrospective.

**Initiative template:**

```markdown
## Vision and problem

## Users and outcomes

## Scope and non-goals

## Product requirements

## UX requirements

## Architecture decisions

## Risks and constraints

## Success metrics

## Epic graph

## Readiness decision

## Integration evidence

## Retrospective
```

**Story template:** Role/action/benefit, acceptance criteria, tasks and subtasks mapped to criteria, architecture constraints, relevant paths, tests, source references, debug/evidence links, completion notes, and changed files.

**Board contract:** Initiative -> epics -> stories form a dependency graph. Stories move Backlog -> Todo when context is ready -> In Progress -> Review -> Done. Readiness is a blocking review task. Create later stories close to execution so previous completion notes and review feedback can sharpen them.

**Checkpoint:** Readiness before implementation, code review before each story is Done, integration review before the initiative closes, and a retrospective that creates owned follow-up cards. This adapts BMAD's lifecycle, story status flow, and retro action items without importing a second sprint-status source of truth. [BMAD workflow map](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/workflow-map.md) [BMAD story template](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/v6-shims/bmad-create-story/template.md) [BMAD sprint status template](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/ship/bmad-sprint-planning/sprint-status-template.yaml)

**Token policy:** Use progressive disclosure. Initiative and architecture artifacts inform story creation, but an implementation agent receives the active story plus linked constraints, not every discovery transcript. Optional phases remain optional, matching BMAD and Pocock's scale-sensitive paths. [BMAD workflow map](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/workflow-map.md) [My 7 Phases of AI Development](https://www.aihero.dev/my-7-phases-of-ai-development)

### Built-in 6: Autonomous Cascade

**Purpose:** Execute an already-approved dependency graph with limited operator attention and strong maker-checker separation.

**Stages:** Initialize environment -> approve graph and stop conditions -> select ready task -> implement one mergeable increment -> verify -> commit/handoff -> independent review -> unlock dependents -> integrate -> retro.

**Initializer template:**

```markdown
## Mission

## Approved specification

## Environment setup

## Baseline verification

## Task graph

## Allowed files and tools

## Stop conditions

## Escalation conditions

## Verifier contract
```

**Worker task template:** Goal, dependencies, allowed scope, acceptance criteria, exact verification, evidence, changed files, handoff, and `passes` result.

**Verifier task template:** Spec criteria, diff range, baseline and new checks, test-change review, severity-ranked findings, verdict, and follow-up dependencies.

**Board contract:** Only cards whose `depends_on` tasks are Done can dispatch. Ready cards with disjoint file ownership may run concurrently. Worker completion moves a card to Review, never directly to Done. An independent verifier either marks Done or reopens the same card with findings. Failed baseline verification creates or reopens a stabilization blocker before further dispatch.

**Checkpoint:** Human approval of the graph and stop conditions, independent verification for each increment, and human integration review at the end. Anthropic's harness uses initialization, incremental clean-state sessions, progress handoffs, and end-to-end checks; Osmani separates maker and verifier and requires plan approval for risky work; Pocock's Kanban model dispatches non-blocked tickets. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) [The Code Agent Orchestra](https://addyosmani.com/blog/code-agent-orchestra/) [My 7 Phases of AI Development](https://www.aihero.dev/my-7-phases-of-ai-development)

**Token policy:** Spend high-reasoning context on orchestration, ambiguous planning, and final integration. Use smaller focused contexts for bounded workers and read-heavy verification where suitable. Parallelism increases total model consumption and coordination risk, so concurrency should be capped by dependency and file ownership rather than maximized. [OpenAI Codex subagents](https://developers.openai.com/codex/subagents) [12-factor agents, Factor 10](https://github.com/humanlayer/12-factor-agents/blob/main/content/factor-10-small-focused-agents.md) [Loop Engineering](https://addyo.substack.com/p/loop-engineering)

## Shared Kandown semantics

### Common frontmatter

The six templates should share only fields needed for routing and execution:

```yaml
workflow: quick-fix | test-first-bugfix | feature-slice | brownfield-deep-dive | product-initiative | autonomous-cascade
phase: clarify | research | specify | plan | implement | verify | review | integrate | retro
risk: low | medium | high
approval: not-required | pending | approved | changes-requested
depends_on: []
assignee: ""
ownerType: human | ai
```

`status` remains the board's only lifecycle source of truth. Workflow-specific state belongs in the task body or the minimal fields above, not in a second manifest.

### Universal task body contract

Every executable card should contain:

```markdown
## Goal

## Context

## Constraints

## Acceptance criteria

## Work
- [ ] Step
  report: Result after completion.

## Verification

## Evidence

## Completion report

## Follow-ups
```

Specialized workflows add sections, but they should not rename these common concepts. This gives agents a stable reading order and lets Kandown render workflow-neutral progress.

### Board transition rules

1. **Backlog -> Todo:** intent and acceptance criteria are clear enough to schedule.
2. **Todo -> In Progress:** dependencies are Done and the assignee has loaded required context.
3. **In Progress -> Review:** implementation is complete, verification ran, and evidence is attached.
4. **Review -> Done:** the required human or independent verifier accepts the result.
5. **Review -> In Progress:** findings are written into the same card or linked follow-up blockers.
6. **Any active state -> Blocked behavior:** represent blockers through unresolved `depends_on` tasks and reports rather than an invisible agent pause.

This normalizes BMAD's explicit review-before-done flow, Spec Kit and Kiro dependency execution, and Osmani's evidence exit criterion. [BMAD sprint status template](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/ship/bmad-sprint-planning/sprint-status-template.yaml) [Spec Kit tasks template](https://github.com/github/spec-kit/blob/main/templates/tasks-template.md) [Kiro Specs](https://kiro.dev/docs/specs/) [Agent Skills](https://addyosmani.com/blog/agent-skills/)

### Evidence contract

Evidence should be compact and reproducible:

```markdown
## Evidence

- `pnpm test --filter parser`: pass, 18 tests
- `pnpm typecheck`: pass
- Manual: opened `/settings`, changed locale, reloaded, selection persisted
- Artifact: `artifacts/settings-locale.png`
- Diff reviewed against: `abc123..def456`
```

Store success as a short summary and link larger logs or screenshots. HumanLayer recommends compact success output and detailed failure output to protect context, while Willison recommends captured command output and screenshots for manual proof. [Context-Efficient Backpressure for Coding Agents](https://www.humanlayer.dev/blog/context-efficient-backpressure) [Agentic manual testing](https://simonwillison.net/guides/agentic-engineering-patterns/agentic-manual-testing/)

### Review policy by risk

| Risk | Required gate |
|---|---|
| Low | deterministic checks plus final diff review |
| Medium | plan or spec approval plus final review |
| High | research/spec approval, plan/readiness approval, independent implementation review, integration review |
| Autonomous | approved stop conditions, independent verifier per increment, final human integration review |

The principle is to place human judgment where it changes direction cheaply and use deterministic tools for mechanical enforcement. HumanLayer emphasizes early research and plan review, Anthropic requires ground truth from execution, and OpenAI recommends leaving lint and other mechanical checks to CI rather than review prose. [Advanced Context Engineering for Coding Agents](https://www.humanlayer.dev/blog/advanced-context-engineering) [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents) [OpenAI Codex code review](https://developers.openai.com/codex/integrations/github)

## Token and cadence policy

1. **Start with the smallest matching workflow.** Anthropic recommends simple prompts and adding multi-step systems only when simpler approaches fall short. [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents)
2. **Load current work, not the whole initiative.** Use links and progressive disclosure for architecture, testing, or domain guidance. [OpenAI Codex skills](https://developers.openai.com/codex/skills) [A complete guide to AGENTS.md](https://www.aihero.dev/a-complete-guide-to-agents-md)
3. **Create a fresh context at reviewed artifact boundaries.** Research, plan, implementation phases, and autonomous worker tasks are natural handoff points. [Advanced Context Engineering for Coding Agents](https://www.humanlayer.dev/blog/advanced-context-engineering) [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
4. **Keep agents focused.** Prefer a bounded 3 to 10 step worker over a monolithic run when the task can be decomposed safely. [12-factor agents, Factor 10](https://github.com/humanlayer/12-factor-agents/blob/main/content/factor-10-small-focused-agents.md)
5. **Compress successful feedback, preserve actionable failures.** A passing suite needs a short result; a failure needs enough output to diagnose. [Context-Efficient Backpressure for Coding Agents](https://www.humanlayer.dev/blog/context-efficient-backpressure)
6. **Parallelize discovery before writes.** Read-heavy exploration is safer to parallelize; overlapping code edits add conflict and coordination cost. [OpenAI Codex subagents](https://developers.openai.com/codex/subagents)
7. **Use human cadence based on workflow.** Quick Fix needs one final check; Feature Slice needs spec/plan and acceptance checks; Brownfield Deep Dive needs research/plan gates; Product Initiative needs readiness, story reviews, and retro; Autonomous Cascade needs graph approval, exception handling, and integration review. These gates synthesize the source workflows above.

## What not to ship

- Do not ship one generic `Plan -> Code -> Review` template under six names.
- Do not make a PRD mandatory for bugs or small fixes.
- Do not let a worker mark its own autonomous task Done.
- Do not duplicate status in a workflow manifest when task frontmatter already owns it.
- Do not treat a green command exit as sufficient for user-visible behavior when browser, API, or end-to-end proof is practical.
- Do not load every workflow reference into every agent session.

## Final product direction

The six built-ins should be installed as Markdown template graphs, not as hard-coded agent personalities. Kandown should instantiate parent and child task files, wire `depends_on`, prefill the relevant body sections, and enforce only universal transition rules: dependencies before execution, evidence before Review, and required approval before Done.

That makes the workflow portable across Claude Code, Codex, Pi, Gemini, Cursor, and future agents. More importantly, it keeps Kandown differentiated: the board is not merely displaying an external methodology. The Markdown task graph itself is the executable, inspectable, resumable workflow.
