---
id: t229
title: Configure ESLint + Prettier for React 19 / TypeScript strict
status: Backlog
priority: P2
tags: [quality, tooling]
ownerType: agent
created: 2026-07-25
order: 3
updated: 2026-09-05T09:16:18Z
category: QUALITY
---

# Configure ESLint + Prettier

## Context

There is no `eslint.config.js`, no `.eslintrc`, and no Prettier config in the repo — running `eslint` fails outright for lack of configuration. Flagged in `AUDIT.md` and `FABLE_CODEQUALITY`, both under tooling.

Style is currently consistent only because it has been written by hand. That does not survive multiple agents working in parallel on the same codebase, which is precisely kandown's own use case.

## Subtasks

- [ ] Add `eslint.config.js` (flat config) with `typescript-eslint`,
- [ ] Enable the rules that match the project's stated TypeScript policy:
- [ ] Add Prettier with the existing de-facto style (single quotes, no semicolon
- [ ] Add `pnpm lint` / `pnpm lint:fix` scripts and wire `lint` into the CI gate ([[t228]])
- [ ] Fix or explicitly disable existing violations in one dedicated commit,

```javascript
  `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
  no `any`, prefer `unknown` + type guards, no unused vars/imports
  changes that would churn the whole tree — verify with a dry run first)
  separate from the config commit, so the diff stays reviewable
```

## Notes

Run the first `--fix` pass on its own branch: the churn on 144 files must not be mixed with behavioural changes.
